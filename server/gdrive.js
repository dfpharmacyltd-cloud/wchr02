// Google Drive (one company Drive connected by the admin). Scope drive.file = the app only
// sees files and folders it created itself. Used for inquiry attachments (artwork PDFs) and backups.
import { encrypt, decrypt } from './security.js';
const AUTH = () => process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const API = () => (process.env.GDRIVE_BASE_URL || 'https://www.googleapis.com').replace(/\/$/, '');
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const configured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_URL);
export const redirectUri = () => String(process.env.APP_URL || '').replace(/\/$/, '') + '/api/gdrive/callback';
class GErr extends Error { constructor(m, s = 400) { super(m); this.status = s; } }

export function authorizeUrl(state) {
  const q = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code', scope: SCOPE, access_type: 'offline', prompt: 'consent', state });
  return `${AUTH()}?${q}`;
}
async function token(params) {
  const r = await fetch(TOKEN(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, ...params }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new GErr('Google sign-in failed: ' + (d.error_description || d.error || r.status));
  return { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
}
export const exchange = code => token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri() });

export async function load(store) { const d = await store.get('secrets', 'gdrive'); if (!d) return null; try { return { ...decrypt(d.enc), meta: d.meta || {} }; } catch { return null; } }
export async function save(store, t, meta) { await store.put('secrets', 'gdrive', { enc: encrypt({ access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at }), meta: meta || {}, at: new Date().toISOString() }); }
export async function disconnect(store) { await store.del('secrets', 'gdrive'); }

export async function accessToken(store) {
  let t = await load(store); if (!t) throw new GErr('Google Drive is not connected. Admin: Integrations → Connect Google Drive.');
  if (Date.now() > t.expires_at - 120000) {
    const n = await token({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
    t = { ...t, ...n, refresh_token: n.refresh_token || t.refresh_token }; await save(store, t, t.meta);
  }
  return t;
}
async function g(store, method, path, body, headers = {}) {
  const t = await accessToken(store);
  const r = await fetch(API() + path, { method, headers: { Authorization: 'Bearer ' + t.access_token, ...(body && !headers['Content-Type'] ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body && typeof body !== 'string' && !(body instanceof Buffer) ? JSON.stringify(body) : body });
  if (r.status === 204) return {};
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new GErr('Google Drive: ' + ((d.error && d.error.message) || 'HTTP ' + r.status), r.status === 401 ? 400 : 502);
  return d;
}
async function folder(store, name, parent) {
  const d = await g(store, 'POST', '/drive/v3/files?fields=id,webViewLink', { name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) });
  return d.id;
}
// Creates "WESTCOAST Procurement/{Backups, Inquiry files}" once and remembers the ids.
export async function folders(store) {
  const t = await accessToken(store); const m = t.meta || {};
  if (m.root && m.backups && m.files) return m;
  m.root = m.root || await folder(store, 'WESTCOAST Procurement');
  m.backups = m.backups || await folder(store, 'Backups', m.root);
  m.files = m.files || await folder(store, 'Inquiry files', m.root);
  const fresh = await load(store); await save(store, fresh, m); return m;
}
export async function account(store) { const d = await g(store, 'GET', '/drive/v3/about?fields=user(emailAddress,displayName),storageQuota'); return { email: d.user && d.user.emailAddress, name: d.user && d.user.displayName, quota: d.storageQuota }; }
export async function uploadBuffer(store, { name, mimeType, data, parent }) {
  const b = 'wcpa' + Date.now().toString(36);
  const meta = JSON.stringify({ name, parents: parent ? [parent] : undefined });
  const body = Buffer.concat([Buffer.from(`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${b}\r\nContent-Type: ${mimeType}\r\n\r\n`), Buffer.isBuffer(data) ? data : Buffer.from(data), Buffer.from(`\r\n--${b}--`)]);
  return g(store, 'POST', '/upload/drive/v3/files?uploadType=multipart&fields=id,name,size,webViewLink', body, { 'Content-Type': `multipart/related; boundary=${b}` });
}
export async function share(store, fileId) {
  if (!/^[\w-]{10,200}$/.test(fileId)) throw new GErr('Bad file id');
  await g(store, 'POST', `/drive/v3/files/${fileId}/permissions`, { role: 'reader', type: 'anyone' });
  return g(store, 'GET', `/drive/v3/files/${fileId}?fields=id,name,size,mimeType,webViewLink`);
}
// Chunked upload through our own server (no browser → Google call; each chunk < Vercel's 4.5 MB limit).
export async function startUpload(store, { name, mimeType, size, folder = 'files' }) {
  const t = await accessToken(store); const m = await folders(store);
  const r = await fetch(API() + '/upload/drive/v3/files?uploadType=resumable&fields=id,name,size,webViewLink', { method: 'POST', headers: { Authorization: 'Bearer ' + t.access_token, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mimeType || 'application/octet-stream', 'X-Upload-Content-Length': String(size) }, body: JSON.stringify({ name: String(name).slice(0, 200), parents: [m[folder] || m.files] }) });
  if (!r.ok) { const d = await r.json().catch(() => ({})); throw new GErr('Google Drive: ' + ((d.error && d.error.message) || 'HTTP ' + r.status), 502); }
  const loc = r.headers.get('location'); if (!loc || !loc.startsWith(API())) throw new GErr('Google Drive did not return an upload address', 502);
  return loc;
}
export async function putChunk(sessionUrl, buf, start, total) {
  if (!String(sessionUrl).startsWith(API())) throw new GErr('Bad upload session');
  const end = start + buf.length - 1;
  const r = await fetch(sessionUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${start}-${end}/${total}` }, body: buf });
  if (r.status === 308) { const range = r.headers.get('range'); return { done: false, next: range ? +range.split('-')[1] + 1 : end + 1 }; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new GErr('Google Drive upload failed: ' + ((d.error && d.error.message) || 'HTTP ' + r.status), 502);
  return { done: true, file: d };
}
const dlCache = new Map();
export async function download(store, fileId) {
  if (!/^[\w-]{10,200}$/.test(fileId)) throw new GErr('Bad file id');
  const c = dlCache.get(fileId); if (c && c.exp > Date.now()) return c.buf;
  const t = await accessToken(store);
  const r = await fetch(`${API()}/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: 'Bearer ' + t.access_token } });
  if (!r.ok) throw new GErr('Could not read the attachment from Google Drive (HTTP ' + r.status + ')', 502);
  const buf = Buffer.from(await r.arrayBuffer());
  dlCache.set(fileId, { buf, exp: Date.now() + 15 * 60000 }); if (dlCache.size > 30) dlCache.delete(dlCache.keys().next().value);
  return buf;
}
export async function list(store, parent, n = 20) {
  const q = encodeURIComponent(`'${parent}' in parents and trashed=false`);
  const d = await g(store, 'GET', `/drive/v3/files?q=${q}&orderBy=createdTime desc&pageSize=${n}&fields=files(id,name,size,createdTime,webViewLink)`);
  return d.files || [];
}
