// Session signing, token encryption and password hashing (Node crypto only).
import crypto from 'crypto';

const secret = () => process.env.SESSION_SECRET || '';
export const hasSecret = () => secret().length >= 16;
const key = purpose => crypto.createHash('sha256').update(purpose + ':' + secret()).digest();

export function sign(obj) {
  const p = Buffer.from(JSON.stringify(obj)).toString('base64url');
  return p + '.' + crypto.createHmac('sha256', key('session')).update(p).digest('base64url');
}
export function verify(tok) {
  if (!tok || !hasSecret()) return null;
  const [p, s] = String(tok).split('.');
  if (!p || !s) return null;
  const e = crypto.createHmac('sha256', key('session')).update(p).digest('base64url');
  if (e.length !== s.length || !crypto.timingSafeEqual(Buffer.from(e), Buffer.from(s))) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.exp && o.exp > Date.now() ? o : null; } catch { return null; }
}
export function encrypt(obj) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key('encrypt'), iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}
export function decrypt(str) {
  const [iv, tag, data] = String(str).split('.').map(s => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', key('encrypt'), iv); d.setAuthTag(tag);
  return JSON.parse(Buffer.concat([d.update(data), d.final()]).toString('utf8'));
}
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: crypto.scryptSync(String(pw), salt, 64).toString('hex') };
}
export function checkPassword(pw, salt, hash) {
  if (!salt || !hash) return false;
  const a = crypto.scryptSync(String(pw), salt, 64); const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export const randomId = (p = '') => p + crypto.randomBytes(9).toString('base64url');
export function parseCookies(h) { const o = {}; String(h || '').split(';').forEach(kv => { const i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim()); }); return o; }
