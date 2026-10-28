// Gmail sending (per user). Scope gmail.send only — the app can send mail but cannot read the mailbox.
import crypto from 'crypto';
import { encrypt, decrypt } from './security.js';
const AUTH = () => process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const GMAIL = () => (process.env.GMAIL_BASE_URL || 'https://gmail.googleapis.com').replace(/\/$/, '');
const USERINFO = () => process.env.GOOGLE_USERINFO_URL || 'https://www.googleapis.com/oauth2/v2/userinfo';
const SCOPE = 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/gmail.send';
export const configured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_URL);
export const redirectUri = () => String(process.env.APP_URL || '').replace(/\/$/, '') + '/api/gmail/callback';
class MErr extends Error { constructor(m, s = 400) { super(m); this.status = s; } }

export function authorizeUrl(state) {
  return `${AUTH()}?${new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state })}`;
}
async function token(params) {
  const r = await fetch(TOKEN(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new MErr('Google sign-in failed: ' + (d.error_description || d.error || r.status));
  return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
}
export const exchange = code => token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });
const sid = uid => 'gmail_' + uid;
export async function save(store, uid, t, account) { await store.put('secrets', sid(uid), { enc: encrypt({ ...t, account }), at: new Date().toISOString() }); }
export async function load(store, uid) { const d = await store.get('secrets', sid(uid)); if (!d) return null; try { return decrypt(d.enc); } catch { return null; } }
export async function disconnect(store, uid) { await store.del('secrets', sid(uid)); }
async function access(store, uid) {
  let t = await load(store, uid); if (!t) throw new MErr('Gmail is not connected for your account. Open Integrations → Connect Gmail.');
  if (Date.now() > t.expires_at - 120000) { const n = await token({ grant_type: 'refresh_token', refresh_token: t.refresh_token }); t = { ...t, ...n, refresh_token: n.refresh_token || t.refresh_token }; await save(store, uid, t, t.account); }
  return t;
}
export async function me(store, uid, tok) {
  const t = tok || await access(store, uid);
  const r = await fetch(USERINFO(), { headers: { Authorization: 'Bearer ' + t.access_token } }); const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new MErr('Could not read the Google account', 502);
  return { email: d.email, name: d.name || d.email };
}

const enc = s => /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(String(s)).toString('base64') + '?=';
const b64 = buf => Buffer.from(buf).toString('base64').replace(/.{76}/g, '$&\r\n');
const addr = list => String(list || '').split(/[;,\s]+/).filter(Boolean).join(', ');
export function buildMime({ from, to, cc, bcc, replyTo, subject, html, text, attachments = [] }) {
  const B = 'mix_' + crypto.randomBytes(8).toString('hex'), A = 'alt_' + crypto.randomBytes(8).toString('hex');
  const head = [from && `From: ${from}`, `To: ${addr(to)}`, cc && `Cc: ${addr(cc)}`, bcc && `Bcc: ${addr(bcc)}`, replyTo && `Reply-To: ${addr(replyTo)}`, `Subject: ${enc(subject || '')}`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${B}"`].filter(Boolean).join('\r\n');
  const parts = [`--${B}\r\nContent-Type: multipart/alternative; boundary="${A}"\r\n\r\n--${A}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(text || '')}\r\n--${A}\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(html || String(text || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\n/g, '<br>'))}\r\n--${A}--`];
  for (const a of attachments) { const n = enc(a.name); parts.push(`--${B}\r\nContent-Type: ${a.contentType || 'application/octet-stream'}; name="${n}"\r\nContent-Disposition: attachment; filename="${n}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(a.bytes)}`); }
  return Buffer.from(`${head}\r\n\r\n${parts.join('\r\n')}\r\n--${B}--\r\n`);
}
export async function send(store, uid, m) {
  if (!m.to) throw new MErr('Recipient email missing');
  const t = await access(store, uid);
  const raw = buildMime({ ...m, from: t.account && t.account.email });
  if (raw.length > 35 * 1048576) throw new MErr('Email is bigger than Gmail allows (25 MB). Send large files as links.');
  const r = await fetch(`${GMAIL()}/upload/gmail/v1/users/me/messages/send?uploadType=media`, { method: 'POST', headers: { Authorization: 'Bearer ' + t.access_token, 'Content-Type': 'message/rfc822' }, body: raw });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new MErr('Gmail: ' + ((d.error && d.error.message) || 'HTTP ' + r.status), r.status === 401 || r.status === 403 ? 400 : 502);
  return { id: d.id, threadId: d.threadId, at: new Date().toISOString(), from: t.account && t.account.email };
}
