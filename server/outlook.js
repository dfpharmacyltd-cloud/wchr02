// Microsoft Outlook via Microsoft Graph (delegated OAuth 2.0, per user).
// Scopes: offline_access User.Read Mail.ReadWrite Mail.Send. Tokens stored encrypted (AES-256-GCM).
import { encrypt, decrypt } from './security.js';
const LOGIN = () => (process.env.MS_LOGIN_BASE_URL || 'https://login.microsoftonline.com').replace(/\/$/, '');
const GRAPH = () => (process.env.GRAPH_BASE_URL || 'https://graph.microsoft.com').replace(/\/$/, '') + '/v1.0';
const TENANT = () => process.env.MS_TENANT_ID || 'common';
const SCOPES = 'offline_access User.Read Mail.ReadWrite Mail.Send';
export const configured = () => !!(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET && process.env.APP_URL);
export const redirectUri = () => String(process.env.APP_URL || '').replace(/\/$/, '') + '/api/outlook/callback';
class OErr extends Error { constructor(m, s = 400) { super(m); this.status = s; } }

export function authorizeUrl(state) {
  const q = new URLSearchParams({ client_id: process.env.MS_CLIENT_ID, response_type: 'code', redirect_uri: redirectUri(), response_mode: 'query', scope: SCOPES, state, prompt: 'select_account' });
  return `${LOGIN()}/${TENANT()}/oauth2/v2.0/authorize?${q}`;
}
async function token(params) {
  const res = await fetch(`${LOGIN()}/${TENANT()}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID, client_secret: process.env.MS_CLIENT_SECRET, scope: SCOPES, ...params }) });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new OErr('Microsoft sign-in failed: ' + (d.error_description || d.error || res.status).toString().split('\r\n')[0], 400);
  return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
}
export const exchange = code => token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });

// store helpers: secrets collection, one doc per app user
const sid = uid => 'outlook_' + uid;
export async function saveTokens(store, uid, t, account) { await store.put('secrets', sid(uid), { enc: encrypt({ ...t, account }), at: new Date().toISOString() }); }
export async function loadTokens(store, uid) { const d = await store.get('secrets', sid(uid)); if (!d) return null; try { return decrypt(d.enc); } catch { return null; } }
export async function disconnect(store, uid) { await store.del('secrets', sid(uid)); }

async function graph(store, uid, method, path, body) {
  let t = await loadTokens(store, uid);
  if (!t) throw new OErr('Outlook is not connected for your account. Open Integrations → Connect Outlook.', 400);
  if (Date.now() > t.expires_at - 120000) {
    const n = await token({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
    t = { ...t, ...n, refresh_token: n.refresh_token || t.refresh_token }; await saveTokens(store, uid, t, t.account);
  }
  const res = await fetch(GRAPH() + path, { method, headers: { Authorization: 'Bearer ' + t.access_token, 'Content-Type': 'application/json', Prefer: 'outlook.body-content-type="text"' }, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 202 || res.status === 204) return { status: res.status };
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new OErr('Outlook: ' + ((d.error && d.error.message) || 'HTTP ' + res.status), res.status === 401 ? 400 : res.status === 429 ? 429 : 502);
  return { status: res.status, data: d };
}
export async function me(store, uid) { const r = await graph(store, uid, 'GET', '/me?$select=displayName,mail,userPrincipalName'); return { name: r.data.displayName, email: r.data.mail || r.data.userPrincipalName }; }
const rcpt = list => String(list || '').split(/[;,\s]+/).filter(Boolean).map(a => ({ emailAddress: { address: a } }));
export async function createDraft(store, uid, { to, cc, bcc, replyTo, subject, body, html, attachments = [] }) {
  if (!to) throw new OErr('Recipient email missing');
  const msg = { subject: String(subject || ''), body: { contentType: html ? 'HTML' : 'Text', content: String(html || body || '') }, toRecipients: rcpt(to), ccRecipients: rcpt(cc), bccRecipients: rcpt(bcc) };
  if (replyTo) { const t = await loadTokens(store, uid); const own = t && t.account && t.account.email; const list = [...new Set([own, ...String(replyTo).split(/[;,\s]+/)].filter(Boolean).map(x => x.toLowerCase()))]; msg.replyTo = rcpt(list.join(',')); }
  // small files go inside the message, big ones (> 3 MB) through an Outlook upload session
  const small = [], big = []; let smallTotal = 0;
  for (const a of attachments) { if (a.bytes.length <= 3 * 1048576 && smallTotal + a.bytes.length <= 3 * 1048576) { small.push(a); smallTotal += a.bytes.length; } else big.push(a); }
  if (small.length) msg.attachments = small.map(a => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.name, contentType: a.contentType || 'application/octet-stream', contentBytes: a.bytes.toString('base64') }));
  const r = await graph(store, uid, 'POST', '/me/messages', msg);
  for (const a of big) {
    const s = await graph(store, uid, 'POST', `/me/messages/${encodeURIComponent(r.data.id)}/attachments/createUploadSession`, { AttachmentItem: { attachmentType: 'file', name: a.name, size: a.bytes.length, contentType: a.contentType || 'application/octet-stream' } });
    const url = s.data.uploadUrl; const CH = 4 * 327680;
    for (let start = 0; start < a.bytes.length; start += CH) {
      const part = a.bytes.subarray(start, Math.min(a.bytes.length, start + CH));
      const pr = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'Content-Range': `bytes ${start}-${start + part.length - 1}/${a.bytes.length}` }, body: part });
      if (!pr.ok) { const d = await pr.json().catch(() => ({})); throw new OErr('Outlook attachment upload failed: ' + ((d.error && d.error.message) || 'HTTP ' + pr.status), 502); }
    }
  }
  return { id: r.data.id, webLink: r.data.webLink, conversationId: r.data.conversationId, status: r.status, at: new Date().toISOString() };
}
export async function sendMail(store, uid, m) { const d = await createDraft(store, uid, m); await sendDraft(store, uid, d.id); return d; }
export async function sendDraft(store, uid, id) { if (!id) throw new OErr('Draft id missing'); const r = await graph(store, uid, 'POST', `/me/messages/${encodeURIComponent(id)}/send`); return { status: r.status, at: new Date().toISOString() }; }
export async function inbox(store, uid, since) {
  const s = since ? new Date(since).toISOString() : new Date(Date.now() - 30 * 864e5).toISOString();
  const r = await graph(store, uid, 'GET', `/me/mailFolders/inbox/messages?$filter=receivedDateTime ge ${s}&$orderby=receivedDateTime desc&$top=50&$select=id,subject,from,receivedDateTime,body,conversationId,hasAttachments`);
  return (r.data.value || []).map(m => ({ graphId: m.id, conversationId: m.conversationId, subject: m.subject || '', from: ((m.from && m.from.emailAddress && m.from.emailAddress.address) || '').toLowerCase(), receivedAt: m.receivedDateTime, body: String((m.body && m.body.content) || '').slice(0, 100000), hasAttachments: !!m.hasAttachments }));
}
