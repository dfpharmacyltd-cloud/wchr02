import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { Store, PUBLIC, PRIVATE } from './store.js';
import { SupabaseStore } from './store-supabase.js';
import { PhpStore } from './store-php.js';
import * as apollo from './apollo.js';
import * as claude from './claude.js';
import * as gemini from './gemini.js';
import * as serper from './serper.js';
import * as outlook from './outlook.js';
import * as wati from './wati.js';
import * as gdrive from './gdrive.js';
import * as gmail from './gmail.js';
import { LOGI } from './logistics.js';
import { fetchPage } from './fetchPage.js';
import { aiJSON, aiConfigured, findCompanies, crawlCompany, providerStatus } from './finder.js';
import { sign, verify, hashPassword, checkPassword, hasSecret, randomId, parseCookies, encrypt, decrypt } from './security.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 3000;
const ON_VERCEL = !!process.env.VERCEL;
const DATA_DIR = path.resolve(ROOT, process.env.DATA_DIR || 'data');

// Local installs: create a persistent session secret automatically. On Vercel it must be set.
if (!process.env.SESSION_SECRET && !ON_VERCEL) {
  const f = path.join(DATA_DIR, '.session_secret');
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); process.env.SESSION_SECRET = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : (() => { const s = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(f, s, { mode: 0o600 }); return s; })(); } catch {}
}

let store = process.env.PHP_BRIDGE_URL ? new PhpStore() : process.env.SUPABASE_URL ? new SupabaseStore() : new Store(ON_VERCEL ? '/tmp/wcpa-data' : DATA_DIR);
let STARTUP_ERROR = (ON_VERCEL && !process.env.SUPABASE_URL && !process.env.PHP_BRIDGE_URL) ? 'Database not connected: add PHP_BRIDGE_URL + PHP_BRIDGE_KEY (MySQL) or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in Vercel and redeploy. Data saved now is temporary.' : '';
try { await store.init(); } catch (e) { STARTUP_ERROR = 'Database error: ' + e.message; console.error('[startup]', e.message); store = new Store('/tmp/wcpa-data'); await store.init(); }

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://www.googleapis.com${process.env.GDRIVE_BASE_URL ? ' ' + new URL(process.env.GDRIVE_BASE_URL).origin : ''}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(express.json({ limit: '8mb' }));

const E = (msg, status = 400) => Object.assign(new Error(msg), { status });
const wrap = fn => async (req, res) => {
  try { const out = await fn(req, res); if (!res.headersSent) res.json(out); }
  catch (e) { const s = e.status >= 400 && e.status < 600 ? e.status : 500; if (s >= 500) console.error('[error]', req.method, req.path, e.message); if (!res.headersSent) res.status(s).json({ error: e.message || 'Server error', tried: e.tried }); }
};
const buckets = new Map();
const limit = (name, perMin) => (req, res, next) => {
  const k = name + ':' + (req.user ? req.user.id : req.ip); const now = Date.now(); const b = buckets.get(k) || { n: 0, t: now };
  if (now - b.t > 60000) { b.n = 0; b.t = now; } b.n++; buckets.set(k, b);
  if (b.n > perMin) return res.status(429).json({ error: `Too many ${name} requests — wait a minute.` });
  next();
};

/* ================= Auth ================= */
const COOKIE = 'wcpa_s';
const WORK_DEPTS = ['RM', 'PM', 'MISC', 'LOG'];
const DEPTS = [...WORK_DEPTS, 'ALL'];
const deptOf = u => (u && DEPTS.includes(u.dept)) ? u.dept : 'ALL';
const publicUser = u => u && ({ id: u.id, name: u.name, email: u.email, role: u.role, dept: deptOf(u), active: u.active !== false, mustChange: !!u.mustChange, createdAt: u.createdAt, lastLogin: u.lastLogin || null });
function setSession(req, res, uid) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(sign({ uid, exp: Date.now() + 7 * 864e5 }))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}${secure ? '; Secure' : ''}`);
}
app.use(async (req, res, next) => {
  const s = verify(parseCookies(req.headers.cookie)[COOKIE]);
  if (s) { try { const u = await store.get('users', s.uid); if (u && u.active !== false) req.user = u; } catch (e) { return res.status(502).json({ error: 'Database unavailable: ' + e.message }); } }
  next();
});
// CSRF guard: state-changing API calls must carry our custom header (cross-site forms cannot set it).
app.use('/api', (req, res, next) => { if (req.method !== 'GET' && req.headers['x-wcpa'] !== '1') return res.status(403).json({ error: 'Missing request header' }); next(); });
const OPEN = new Set(['/api/portal', '/api/gdrive/callback', '/api/gmail/callback', '/api/auth/me', '/api/auth/state', '/api/auth/login', '/api/auth/setup', '/api/auth/logout', '/api/outlook/callback', '/api/cron/snapshot']);
app.use('/api', (req, res, next) => { if (OPEN.has(req.baseUrl + req.path) || (req.baseUrl + req.path).startsWith('/api/portal/') || req.user) return next(); res.status(401).json({ error: 'Please sign in' }); });
const writer = (req, res, next) => (req.user && ['admin', 'procurement'].includes(req.user.role)) ? next() : res.status(403).json({ error: 'Your role is read-only' });
const admin = (req, res, next) => (req.user && req.user.role === 'admin') ? next() : res.status(403).json({ error: 'Administrator only' });

app.get('/api/auth/me', wrap(async req => {
  if (!hasSecret()) throw E('SESSION_SECRET is not set on the server (min 16 characters). Add it in your hosting environment variables and redeploy.', 500);
  return { user: req.user ? publicUser(req.user) : null };
}));
app.get('/api/auth/state', wrap(async () => ({ error: STARTUP_ERROR || undefined, needsSetup: (await store.list('users')).length === 0, setupKeyRequired: !!process.env.ADMIN_SETUP_KEY || ON_VERCEL, secretOk: hasSecret() })));
app.post('/api/auth/setup', limit('login', 10), wrap(async (req, res) => {
  if ((await store.list('users')).length) throw E('Setup is already done. Sign in instead.', 409);
  if (ON_VERCEL && !process.env.ADMIN_SETUP_KEY) throw E('Set ADMIN_SETUP_KEY in Vercel environment variables, redeploy, then create the admin.', 400);
  if (process.env.ADMIN_SETUP_KEY && (req.body || {}).setupKey !== process.env.ADMIN_SETUP_KEY) throw E('Setup key is wrong', 403);
  const { name, email, password } = req.body || {};
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '') || String(password || '').length < 8) throw E('Enter name, a valid email and a password of at least 8 characters');
  const id = randomId('u_'); const h = hashPassword(password);
  await store.put('users', id, { name: String(name).trim(), email: String(email).toLowerCase().trim(), role: 'admin', passSalt: h.salt, passHash: h.hash, active: true, createdAt: new Date().toISOString() });
  setSession(req, res, id); return { ok: true };
}));
app.post('/api/auth/login', limit('login', 10), wrap(async (req, res) => {
  const email = String((req.body || {}).email || '').toLowerCase().trim();
  const u = (await store.list('users')).find(x => x.email === email);
  if (!u || u.active === false || !checkPassword((req.body || {}).password, u.passSalt, u.passHash)) throw E('Wrong email or password', 401);
  await store.put('users', u.id, { ...u, lastLogin: new Date().toISOString() });
  setSession(req, res, u.id); return { user: publicUser(u) };
}));
app.post('/api/auth/logout', (req, res) => { res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`); res.json({ ok: true }); });
app.post('/api/auth/password', wrap(async req => {
  const u = req.user; const { current, next } = req.body || {};
  if (!checkPassword(current, u.passSalt, u.passHash)) throw E('Current password is wrong', 403);
  if (String(next || '').length < 8) throw E('New password must be at least 8 characters');
  const h = hashPassword(next); await store.put('users', u.id, { ...u, passSalt: h.salt, passHash: h.hash, mustChange: false }); return { ok: true };
}));

/* ================= Users (admin) ================= */
app.get('/api/users', admin, wrap(async () => (await store.list('users')).map(publicUser)));
app.post('/api/users', admin, wrap(async req => {
  const { name, email, role, password } = req.body || {}; const dept = (req.body || {}).dept || 'ALL';
  if (!DEPTS.includes(dept)) throw E('Department must be RM, PM, MISC, LOG or ALL');
  if (!name || !/^\S+@\S+\.\S+$/.test(email || '')) throw E('Name and a valid email are required');
  if (!['admin', 'procurement', 'viewer'].includes(role)) throw E('Role must be admin, procurement or viewer');
  if (String(password || '').length < 8) throw E('Temporary password must be at least 8 characters');
  const all = await store.list('users'); if (all.some(u => u.email === email.toLowerCase().trim())) throw E('A user with this email already exists', 409);
  const id = randomId('u_'); const h = hashPassword(password);
  await store.put('users', id, { name: name.trim(), email: email.toLowerCase().trim(), role, dept, passSalt: h.salt, passHash: h.hash, active: true, mustChange: true, createdAt: new Date().toISOString(), createdBy: req.user.id });
  return publicUser(await store.get('users', id));
}));
app.patch('/api/users/:id', admin, wrap(async req => {
  const u = await store.get('users', req.params.id); if (!u) throw E('User not found', 404);
  const b = req.body || {}; const next = { ...u };
  if (b.role) { if (!['admin', 'procurement', 'viewer'].includes(b.role)) throw E('Bad role'); next.role = b.role; }
  if (typeof b.active === 'boolean') next.active = b.active;
  if (b.dept) { if (!DEPTS.includes(b.dept)) throw E('Bad department'); next.dept = b.dept; }
  if (b.password) { if (String(b.password).length < 8) throw E('Password must be at least 8 characters'); const h = hashPassword(b.password); next.passSalt = h.salt; next.passHash = h.hash; next.mustChange = true; }
  const admins = (await store.list('users')).filter(x => x.role === 'admin' && x.active !== false && x.id !== u.id);
  if (!admins.length && (next.role !== 'admin' || next.active === false)) throw E('Keep at least one active administrator');
  await store.put('users', u.id, next); return publicUser(next);
}));

/* ================= Settings & health ================= */
const getSettings = async () => ({ aiProvider: 'auto', searchProvider: 'auto', defaultCountry: 'India', ccEmails: process.env.DEFAULT_CC || 'kcp@westcoastin.com, parth@westcoastin.com', replyToCc: true, ...((await store.get('settings', 'app')) || {}) });
app.get('/api/settings', wrap(getSettings));
app.put('/api/settings', admin, wrap(async req => { const b = req.body || {}; const s = { ...(await getSettings()) }; ['aiProvider', 'searchProvider', 'defaultCountry'].forEach(k => { if (typeof b[k] === 'string') s[k] = b[k].slice(0, 40); }); if (typeof b.ccEmails === 'string') { const l = b.ccEmails.split(/[;,\s]+/).filter(Boolean); if (l.some(x => !/^\S+@\S+\.\S+$/.test(x))) throw E('CC list has an invalid email'); s.ccEmails = l.join(', ').slice(0, 500); } if (typeof b.replyToCc === 'boolean') s.replyToCc = b.replyToCc; await store.put('settings', 'app', s); return s; }));
app.get('/api/health', wrap(async req => ({
  storage: store.kind, vercel: ON_VERCEL, user: publicUser(req.user), settings: await getSettings(),
  claude: claude.configured(), model: claude.MODEL(), gemini: gemini.configured(), geminiModel: gemini.MODEL(), serper: serper.configured(),
  search: providerStatus(), webSearch: Object.values(providerStatus()).some(Boolean), ai: aiConfigured(),
  gdrive: gdrive.configured(), gdriveConnected: !!(await gdrive.load(store)), gmail: gmail.configured(), gmailConnected: !!(await gmail.load(store, req.user.id)),
  apollo: apollo.configured(), outlook: outlook.configured(), outlookConnected: !!(await outlook.loadTokens(store, req.user.id)), wati: wati.configured(),
  cron: !!process.env.CRON_SECRET, version: '2.0.0', serverTime: new Date().toISOString()
})));
app.get('/healthz', (req, res) => res.send('ok'));
app.post('/api/test/:what', limit('test', 12), wrap(async req => {
  const w = req.params.what;
  if (w === 'claude') return claude.ping();
  if (w === 'gemini') return gemini.ping();
  if (w === 'serper') { const r = await serper.search('paracetamol API manufacturer', { gl: 'in', num: 3 }); return { results: r.length, first: r[0] && r[0].url }; }
  if (w === 'apollo') { const r = await apollo.health(); return { status: r.status, data: r.data }; }
  if (w === 'wati') { const t = await wati.templates(); return { templates: t.length, approved: t.filter(x => x.status === 'APPROVED').length }; }
  if (w === 'outlook') return outlook.me(store, req.user.id);
  if (w === 'gdrive') return gdrive.account(store);
  if (w === 'gmail') return gmail.me(store, req.user.id);
  throw E('Unknown test');
}));

/* ================= Data ================= */
/* ---- Department partition (PM = packing material, RM = raw material). Old records without dept = RM. ---- */
const PARTITIONED = ['prs', 'suppliers', 'claims', 'contacts', 'sources', 'rfqs', 'replies', 'campaigns', 'dupes', 'audit', 'items', 'inquiries', 'quotes'];
const recDept = d => (d && WORK_DEPTS.includes(d.dept)) ? d.dept : 'RM';
function viewDept(req) { const u = deptOf(req.user); if (u !== 'ALL') return u; const q = String(req.query.dept || ''); return WORK_DEPTS.includes(q) ? q : null; }
app.get('/api/data/:coll/:id', wrap(async req => {
  const { coll, id } = req.params; if (!store.valid(coll, id) || PRIVATE.includes(coll)) throw E('Not allowed');
  const doc = await store.get(coll, id); if (!doc) throw E('Not found', 404);
  const u = deptOf(req.user); if (u !== 'ALL' && PARTITIONED.includes(coll) && recDept(doc) !== u) throw E('Not your department', 403);
  return doc;
}));
app.get('/api/data', wrap(async req => {
  const all = await store.all(PUBLIC);
  if (!req.query.full) all.sources = all.sources.map(x => { if (!x.text || x.text.length < 2000) return x; const { text, ...rest } = x; return { ...rest, textLen: text.length, textLazy: true }; });
  const d = viewDept(req); if (!d) return all;
  for (const c of PUBLIC) { if (PARTITIONED.includes(c)) all[c] = all[c].filter(x => recDept(x) === d); else if (c === 'templates') all[c] = all[c].filter(x => !x.dept || x.dept === d); }
  return all;
}));
async function checkDept(req, coll, id, doc) {
  if (!PARTITIONED.includes(coll) && coll !== 'templates') return;
  const u = deptOf(req.user); const existing = await store.get(coll, id);
  if (u === 'ALL') { if (doc && PARTITIONED.includes(coll) && !WORK_DEPTS.includes(doc.dept)) doc.dept = (existing && existing.dept) || viewDept(req) || 'RM'; return; }
  if (existing && (coll === 'templates' ? (existing.dept && existing.dept !== u) || (!existing.dept && doc) : recDept(existing) !== u)) throw E(`This record belongs to ${existing.dept || 'the shared'} department`, 403);
  if (doc && (PARTITIONED.includes(coll) || coll === 'templates')) doc.dept = u;
}
app.put('/api/data/:coll/:id', writer, wrap(async req => {
  const { coll, id } = req.params;
  if (!store.valid(coll, id) || PRIVATE.includes(coll)) throw E('Invalid collection or id');
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw E('Body must be an object');
  const doc = { ...req.body };
  if (coll === 'sources' && doc.textLazy && doc.text === undefined) { const ex = await store.get('sources', id); if (ex && ex.text) doc.text = ex.text; delete doc.textLazy; delete doc.textLen; }
  await checkDept(req, coll, id, doc);
  if (coll === 'audit') { doc.by = req.user.name; doc.userId = req.user.id; doc.at = doc.at || new Date().toISOString(); }
  return store.put(coll, id, doc);
}));
app.delete('/api/data/:coll/:id', writer, wrap(async req => {
  const { coll, id } = req.params;
  if (!store.valid(coll, id) || coll === 'audit' || PRIVATE.includes(coll)) throw E('Not allowed');
  await checkDept(req, coll, id, null);
  await store.del(coll, id); return { ok: true };
}));

/* ================= AI, search, website finder ================= */
app.post('/api/ai/json', writer, limit('AI', 60), wrap(async req => aiJSON(String(req.body.prompt || ''), (await getSettings()).aiProvider)));
app.post('/api/research', writer, limit('research', 8), wrap(async req => {
  const b = req.body || {};
  const r = await findCompanies({ api: String(b.api || '').slice(0, 200), synonyms: b.synonyms, country: b.country, strict: b.strict !== false, n: 20, provider: b.provider || (await getSettings()).searchProvider });
  return { candidates: r.candidates.map(c => ({ ...c, why: c.snippet || ('Found by ' + c.provider) })), tried: r.tried, searches: r.tried.filter(t => t.ok).length, resultsSeen: r.candidates.length, dropped: [] };
}));
app.post('/api/search/companies', writer, limit('research', 10), wrap(async req => {
  const b = req.body || {};
  return findCompanies({ api: String(b.api || '').slice(0, 120), synonyms: String(b.synonyms || '').slice(0, 200), country: String(b.country || ''), strict: b.strict !== false, n: Math.min(200, Math.max(1, +b.n || 25)), provider: b.provider || (await getSettings()).searchProvider, docs: String(b.docs || '').slice(0, 200), exclude: Array.isArray(b.exclude) ? b.exclude.slice(0, 400) : [], round: Math.min(10, Math.max(0, +b.round || 0)), state: String(b.state || '').slice(0, 60), city: String(b.city || '').slice(0, 60), kind: WORK_DEPTS.includes(b.kind) ? b.kind : 'RM' });
}));
app.post('/api/finder/crawl', writer, limit('crawl', 240), wrap(req => crawlCompany(String(req.body.url || ''), { country: String(req.body.country || '') })));
app.post('/api/fetch', writer, limit('fetch', 60), wrap(req => fetchPage(String(req.body.url || ''))));

/* ================= Apollo ================= */
app.post('/api/apollo/companies', writer, limit('Apollo', 30), wrap(req => apollo.companies(req.body || {})));
app.post('/api/apollo/people', writer, limit('Apollo', 30), wrap(req => apollo.people(req.body || {})));
app.post('/api/apollo/enrich', writer, limit('Apollo', 15), wrap(req => apollo.enrich(req.body || {})));

/* ================= Outlook (Microsoft Graph) ================= */
app.get('/api/outlook/connect', (req, res) => {
  if (!req.user) return res.redirect('/');
  if (!outlook.configured()) return res.status(400).send('Outlook is not configured on the server (MS_CLIENT_ID, MS_CLIENT_SECRET, APP_URL).');
  res.redirect(outlook.authorizeUrl(sign({ uid: req.user.id, n: randomId(), exp: Date.now() + 600000 })));
});
app.get('/api/outlook/callback', async (req, res) => {
  try {
    if (req.query.error) throw E(String(req.query.error_description || req.query.error));
    const st = verify(String(req.query.state || ''));
    if (!st || !req.user || st.uid !== req.user.id) throw E('Sign-in session expired — open Integrations and connect again.');
    const t = await outlook.exchange(String(req.query.code || ''));
    await outlook.saveTokens(store, req.user.id, t, null);
    const acc = await outlook.me(store, req.user.id);
    await outlook.saveTokens(store, req.user.id, await outlook.loadTokens(store, req.user.id), acc);
    res.redirect('/#outlook=connected');
  } catch (e) { res.redirect('/#outlook=error&msg=' + encodeURIComponent(String(e.message).slice(0, 200))); }
});
app.get('/api/outlook/status', wrap(async req => { const t = await outlook.loadTokens(store, req.user.id); return { configured: outlook.configured(), connected: !!t, account: t && t.account, redirectUri: outlook.redirectUri() }; }));
app.post('/api/outlook/disconnect', wrap(async req => { await outlook.disconnect(store, req.user.id); return { ok: true }; }));
async function buildAttachments(b, max) {
  const att = [];
  for (const a of Array.isArray(b.attachments) ? b.attachments.slice(0, 15) : []) if (a && a.name && a.b64) att.push({ name: String(a.name).slice(0, 200), contentType: String(a.contentType || ''), bytes: Buffer.from(String(a.b64), 'base64') });
  for (const f of Array.isArray(b.driveFiles) ? b.driveFiles.slice(0, 15) : []) if (f && f.id) att.push({ name: String(f.name || 'attachment').slice(0, 200), contentType: String(f.mimeType || ''), bytes: await gdrive.download(store, String(f.id)) });
  const total = att.reduce((n, a) => n + a.bytes.length, 0); if (total > max * 1048576) throw E(`Attachments are bigger than ${max} MB in total — the email would be rejected. Large files are sent as Drive links instead.`);
  return att;
}
const clean = b => { const x = { ...(b || {}) }; delete x.attachments; delete x.driveFiles; delete x.provider; return x; };
app.post('/api/outlook/draft', writer, limit('mail', 200), wrap(async req => outlook.createDraft(store, req.user.id, { ...clean(req.body), attachments: await buildAttachments(req.body || {}, 20) })));
// One call = build attachments + create + send (Outlook) or send (Gmail).
app.post('/api/mail/send', writer, limit('mail', 200), wrap(async req => {
  const b = req.body || {}; const provider = b.provider === 'gmail' ? 'gmail' : 'outlook';
  const att = await buildAttachments(b, provider === 'gmail' ? 24 : 20);
  if (provider === 'gmail') { const r = await gmail.send(store, req.user.id, { ...clean(b), text: b.body, attachments: att }); return { provider, id: r.id, threadId: r.threadId, from: r.from, at: r.at }; }
  const d = await outlook.createDraft(store, req.user.id, { ...clean(b), attachments: att }); await outlook.sendDraft(store, req.user.id, d.id);
  return { provider, id: d.id, conversationId: d.conversationId, webLink: d.webLink, at: new Date().toISOString() };
}));
/* ================= Gmail (send only) ================= */
app.get('/api/gmail/connect', (req, res) => {
  if (!req.user) return res.redirect('/');
  if (!gmail.configured()) return res.status(400).send('Gmail needs GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_URL.');
  res.redirect(gmail.authorizeUrl(sign({ uid: req.user.id, k: 'gm', exp: Date.now() + 600000 })));
});
app.get('/api/gmail/callback', async (req, res) => {
  try {
    if (req.query.error) throw E(String(req.query.error));
    const st = verify(String(req.query.state || '')); if (!st || st.k !== 'gm' || !req.user || st.uid !== req.user.id) throw E('Sign-in expired — try again.');
    const t = await gmail.exchange(String(req.query.code || '')); if (!t.refresh_token) throw E('Google did not return offline access. Remove the app at myaccount.google.com/permissions and connect again.');
    const acc = await gmail.me(store, req.user.id, t); await gmail.save(store, req.user.id, t, acc);
    res.redirect('/#gmail=connected');
  } catch (e) { res.redirect('/#gmail=error&msg=' + encodeURIComponent(String(e.message).slice(0, 200))); }
});
app.get('/api/gmail/status', wrap(async req => { const t = await gmail.load(store, req.user.id); return { configured: gmail.configured(), connected: !!t, account: t && t.account, redirectUri: gmail.redirectUri() }; }));
app.post('/api/gmail/disconnect', wrap(async req => { await gmail.disconnect(store, req.user.id); return { ok: true }; }));
app.post('/api/outlook/send', writer, limit('mail', 120), wrap(req => outlook.sendDraft(store, req.user.id, String((req.body || {}).id || ''))));
app.get('/api/outlook/inbox', writer, limit('mail', 30), wrap(req => outlook.inbox(store, req.user.id, req.query.since)));

/* ================= WhatsApp (WATI) ================= */
app.get('/api/wati/templates', writer, limit('wa', 30), wrap(() => wati.templates()));
app.post('/api/wati/send', writer, limit('wa', 120), wrap(req => wati.sendTemplate(req.body || {})));


/* ================= Google Drive ================= */
app.get('/api/gdrive/connect', (req, res) => {
  if (!req.user || req.user.role !== 'admin') return res.status(403).send('Administrator only');
  if (!gdrive.configured()) return res.status(400).send('Google Drive is not configured (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL).');
  res.redirect(gdrive.authorizeUrl(sign({ uid: req.user.id, k: 'gd', exp: Date.now() + 600000 })));
});
app.get('/api/gdrive/callback', async (req, res) => {
  try {
    if (req.query.error) throw E(String(req.query.error));
    const st = verify(String(req.query.state || '')); if (!st || st.k !== 'gd' || !req.user || st.uid !== req.user.id) throw E('Sign-in expired — try again.');
    const t = await gdrive.exchange(String(req.query.code || ''));
    if (!t.refresh_token) throw E('Google did not return offline access. Remove the app at myaccount.google.com/permissions and connect again.');
    await gdrive.save(store, t, { by: req.user.name, at: new Date().toISOString() });
    const acc = await gdrive.account(store); const m = await gdrive.folders(store);
    const cur = await gdrive.load(store); await gdrive.save(store, cur, { ...m, account: acc.email });
    res.redirect('/#gdrive=connected');
  } catch (e) { res.redirect('/#gdrive=error&msg=' + encodeURIComponent(String(e.message).slice(0, 200))); }
});
app.get('/api/gdrive/status', wrap(async () => { const t = await gdrive.load(store); return { configured: gdrive.configured(), connected: !!t, account: t && t.meta && t.meta.account, lastBackup: t && t.meta && t.meta.lastBackup, redirectUri: gdrive.redirectUri() }; }));
app.post('/api/gdrive/disconnect', admin, wrap(async () => { await gdrive.disconnect(store); return { ok: true }; }));
// Short-lived upload token for the browser (drive.file scope only) so large artwork PDFs go straight to Google.
app.post('/api/gdrive/token', writer, limit('drive', 60), wrap(async () => { const t = await gdrive.accessToken(store); const m = await gdrive.folders(store); return { accessToken: t.access_token, expiresAt: t.expires_at, folders: { files: m.files, backups: m.backups }, api: (process.env.GDRIVE_BASE_URL || 'https://www.googleapis.com').replace(/\/$/, '') }; }));
app.post('/api/gdrive/upload/start', writer, limit('drive', 120), wrap(async req => {
  const b = req.body || {}; const size = +b.size;
  if (!b.name || !(size > 0) || size > 200 * 1048576) throw E('File must be between 1 byte and 200 MB');
  const url = await gdrive.startUpload(store, { name: b.name, mimeType: String(b.mimeType || ''), size, folder: b.folder === 'backups' ? 'backups' : 'files' });
  return { token: encrypt({ url, size, share: b.share !== false, uid: req.user.id, exp: Date.now() + 6 * 3600e3 }) };
}));
app.put('/api/gdrive/upload/chunk', writer, express.raw({ type: '*/*', limit: '5mb' }), wrap(async req => {
  let s; try { s = decrypt(String(req.query.t || '')); } catch { throw E('Upload session expired — try again'); }
  if (!s || s.uid !== req.user.id || s.exp < Date.now()) throw E('Upload session expired — try again');
  const start = +req.query.start, total = +req.query.total; if (!Buffer.isBuffer(req.body) || !req.body.length || total !== s.size || !(start >= 0)) throw E('Bad chunk');
  const r = await gdrive.putChunk(s.url, req.body, start, total);
  if (!r.done) return r;
  const f = s.share ? await gdrive.share(store, r.file.id) : r.file;
  return { done: true, file: { id: r.file.id, name: f.name || r.file.name, size: total, link: f.webViewLink || r.file.webViewLink || '' } };
}));
app.post('/api/gdrive/share', writer, limit('drive', 120), wrap(req => gdrive.share(store, String((req.body || {}).fileId || ''))));
async function driveBackup(by) {
  const m = await gdrive.folders(store); const data = await store.all(PUBLIC);
  const name = `westcoast_procurement_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const f = await gdrive.uploadBuffer(store, { name, mimeType: 'application/json', data: JSON.stringify({ app: 'WESTCOAST AI Procurement Agent', by, at: new Date().toISOString(), data }), parent: m.backups });
  const cur = await gdrive.load(store); await gdrive.save(store, cur, { ...cur.meta, lastBackup: { at: new Date().toISOString(), name, id: f.id, by } });
  return { id: f.id, name, link: f.webViewLink };
}
app.post('/api/gdrive/backup', writer, limit('drive', 10), wrap(req => driveBackup(req.user.name)));
app.get('/api/gdrive/backups', writer, wrap(async () => { const m = await gdrive.folders(store); return gdrive.list(store, m.backups, 20); }));

/* ================= Inquiries + vendor quotation portal ================= */
app.post('/api/inquiries/code', writer, wrap(async () => {
  const d = new Date(); const pre = `INQ-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-`;
  const n = (await store.list('inquiries')).map(x => String(x.code || '')).filter(c => c.startsWith(pre)).map(c => +c.slice(pre.length) || 0).reduce((a, b) => Math.max(a, b), 0);
  return { code: pre + (n + 1) };
}));
const appUrl = req => String(process.env.APP_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
app.post('/api/inquiries/:id/links', writer, wrap(async req => {
  const inq = await store.get('inquiries', req.params.id); if (!inq) throw E('Inquiry not found', 404);
  const ud = deptOf(req.user); if (ud !== 'ALL' && recDept(inq) !== ud) throw E('Not your department', 403);
  inq.links = inq.links || {}; inq.short = inq.short || {}; let changed = false;
  const want = ((req.body && req.body.supplierIds) || inq.vendors || []).filter(s => (inq.vendors || []).includes(s));
  for (const s of want) {
    const renew = req.body && req.body.renew;
    if (!inq.links[s] || renew) { inq.links[s] = randomId(); changed = true; }
    if (!inq.short[s] || renew) { if (inq.short[s]) await store.del('links', inq.short[s]).catch(() => {}); const code = shortCode(); await store.put('links', code, { i: inq.id, s, at: new Date().toISOString() }); inq.short[s] = code; changed = true; }
  }
  if (changed) await store.put('inquiries', inq.id, inq);
  const out = {}; for (const s of Object.keys(inq.links)) out[s] = inq.short[s] ? `${appUrl(req)}/q/${inq.short[s]}` : `${appUrl(req)}/quote.html?t=${encodeURIComponent(sign({ k: 'q', i: inq.id, s, n: inq.links[s], exp: Date.now() + 120 * 864e5 }))}`;
  return { links: out };
}));
const B62 = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const shortCode = () => Array.from(crypto.randomBytes(10), b => B62[b % B62.length]).join('');
const QF = ['rate', 'mrp', 'discount', 'tax', 'packing', 'freight', 'insurance', 'delivery', 'payment', 'validity', 'finalRate', 'remarks'];
app.post('/api/preview', writer, limit('preview', 60), wrap(async req => {
  const data = (req.body || {}).data; if (!data || typeof data !== 'object' || JSON.stringify(data).length > 60000) throw E('Bad preview');
  const code = shortCode(); await store.put('links', code, { preview: data, at: new Date().toISOString(), exp: Date.now() + 30 * 864e5 });
  return { link: `${appUrl(req)}/q/${code}` };
}));
async function portalCtx(tok) {
  let t;
  if (/^[A-Za-z0-9]{10}$/.test(tok)) {   // short link /q/CODE
    const l = await store.get('links', tok); if (!l) throw E('This link is invalid or has been replaced. Ask West-Coast Pharmaceutical Works for a new one.', 403);
    if (l.preview) { if (l.exp < Date.now()) throw E('This preview link has expired.', 403); return { preview: l.preview }; }
    t = { i: l.i, s: l.s, short: tok };
  } else { t = verify(tok); if (!t || t.k !== 'q') throw E('This link is invalid or has expired. Ask West-Coast Pharmaceutical Works for a new one.', 403); }
  const [inq, sup, quote] = await Promise.all([store.get('inquiries', t.i), store.get('suppliers', t.s), store.get('quotes', `q_${t.i}_${t.s}`)]);
  if (!inq || !(inq.vendors || []).includes(t.s)) throw E('This link is no longer valid.', 403);
  if (t.short ? (inq.short || {})[t.s] !== t.short : (!inq.links || inq.links[t.s] !== t.n)) throw E('This link is no longer valid.', 403);
  return { t, inq, sup, quote };
}
app.get('/api/portal/:tok', limit('portal', 60), wrap(async req => {
  const ctx = await portalCtx(req.params.tok); if (ctx.preview) return { inquiry: ctx.preview, vendor: { name: 'Vendor' }, quote: null, preview: true };
  const { inq, sup, quote } = ctx;
  return { inquiry: { code: inq.code, dept: inq.dept || 'RM', kind: inq.kind || '', shipment: inq.shipment || null, currency: inq.currency || 'INR', status: inq.status, deliveryTime: inq.deliveryTime || '', deliveryLocation: inq.deliveryLocation || '', notes: inq.notes || '', files: inq.files || [],
    items: (inq.items || []).map(i => ({ id: i.id, name: i.name, code: i.code, qty: i.qty, uom: i.uom, make: i.make, spec: i.spec, packing: i.packing, files: i.files || [] })) },
    vendor: { name: sup ? sup.name : 'Vendor' }, quote: quote ? { submittedAt: quote.submittedAt, items: quote.items } : null };
}));
app.post('/api/portal/:tok', limit('portal', 20), wrap(async req => {
  const ctx = await portalCtx(req.params.tok); if (ctx.preview) throw E('This is a preview — submitting is disabled here.', 403);
  const { t, inq, sup, quote } = ctx;
  if (inq.status === 'cancelled' || inq.status === 'closed') throw E('This inquiry is closed.', 409);
  if (quote && quote.submittedAt) throw E('You have already submitted your quotation for this inquiry.', 409);
  const body = (req.body && req.body.items) || {}; const items = {};
  const L = LOGI[inq.kind];
  if (L) {
    const it = (inq.items || [])[0]; const v = it && body[it.id];
    if (!v || typeof v !== 'object') throw E('Fill in your freight quotation.');
    const row = {}; for (const [k, label, type, , req0] of L.fields) { row[k] = String(v[k] ?? '').trim().slice(0, k === 'remarks' ? 1000 : 120); if (type === 'num' && row[k] && !/^\d+(\.\d+)?$/.test(row[k].replace(/,/g, ''))) throw E(`"${label.replace(' *', '')}" must be a number`); if (req0 && !row[k]) throw E(`"${label.replace(' *', '')}" is required`); }
    row.total = String(LOGI.total(inq.kind, row, inq.shipment)); row.currency = inq.currency || 'INR'; items[it.id] = row;
  }
  for (const it of L ? [] : inq.items || []) {
    const v = body[it.id]; if (!v || typeof v !== 'object') continue;
    const row = {}; for (const k of QF) row[k] = String(v[k] ?? '').trim().slice(0, k === 'remarks' ? 1000 : 120);
    if (!row.rate && !row.finalRate) continue;
    for (const k of ['rate', 'mrp', 'discount', 'tax', 'finalRate']) if (row[k] && !/^\d+(\.\d+)?$/.test(row[k].replace(/,/g, ''))) throw E(`${it.name}: "${k}" must be a number`);
    items[it.id] = row;
  }
  if (!Object.keys(items).length) throw E('Enter a rate for at least one item.');
  const doc = { inquiryId: inq.id, supplierId: t.s, supplierName: sup ? sup.name : '', dept: inq.dept || 'RM', items, submittedAt: new Date().toISOString(), ip: req.ip };
  await store.put('quotes', `q_${inq.id}_${t.s}`, doc);
  await store.put('audit', 'au_' + randomId(), { at: doc.submittedAt, by: 'Vendor portal', action: 'Quotation submitted', entity: 'inquiry', entityId: inq.id, detail: `${inq.code} — ${doc.supplierName}: ${Object.keys(items).length} item(s)`, dept: doc.dept });
  // confirmation email from the inquiry owner's Outlook (if connected)
  try {
    const sent = (inq.sent || {})[t.s];
    if (sent && sent.to && inq.createdBy) {
      const st = await getSettings(); const esc = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const L2 = LOGI[inq.kind]; const head = L2 ? [...L2.fields.map(f => f[1].replace(' *', '') + (f[2] === 'num' ? ` (${inq.currency || 'INR'})` : '')), `Total (${inq.currency || 'INR'})`] : ['Product', 'Qty', 'Rate', 'MRP', 'Discount', 'Tax', 'Available Packing', 'Freight', 'Insurance', 'Delivery Time', 'Payment Terms', 'Validity', 'Remarks'];
      const rows = L2 ? (inq.items || []).filter(i => items[i.id]).map(i => { const q = items[i.id]; return [...L2.fields.map(f => q[f[0]]), q.total]; }) : (inq.items || []).filter(i => items[i.id]).map(i => { const q = items[i.id]; return [i.name, `${i.qty} ${i.uom}`, q.rate, q.mrp, q.discount ? q.discount + '%' : '', q.tax ? q.tax + '%' : '', q.packing, q.freight, q.insurance, q.delivery, q.payment, q.validity, q.remarks]; });
      const tbl = `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><tr>${head.map(h => `<th style="border:1px solid #ddd;padding:6px;background:#f3f4f6;text-align:left">${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td style="border:1px solid #ddd;padding:6px">${esc(c) || '-'}</td>`).join('')}</tr>`).join('')}</table>`;
      await outlook.sendMail(store, inq.createdBy, { to: sent.to, cc: inq.cc !== undefined ? inq.cc : st.ccEmails, subject: `Quotation Received — ${inq.code}`, html: `<p>Thank you for submitting your quotation for inquiry <b>${esc(inq.code)}</b>. We will review it and get back to you.</p>${tbl}<p>Regards,<br>West-Coast Pharmaceutical Works</p>` });
    }
  } catch (e) { console.error('[portal mail]', e.message); }
  return { ok: true, submittedAt: doc.submittedAt };
}));

/* ================= Backups ================= */
async function snapshot(by) {
  const data = await store.all(PUBLIC); const id = 'snap_' + new Date().toISOString().replace(/[:.]/g, '-');
  const counts = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length]));
  await store.put('snapdata', id, { data }); await store.put('snapshots', id, { at: new Date().toISOString(), by, counts });
  const list = (await store.list('snapshots')).sort((a, b) => b.at.localeCompare(a.at));
  for (const old of list.slice(14)) { await store.del('snapshots', old.id); await store.del('snapdata', old.id); }
  return { id, counts };
}
app.post('/api/admin/snapshot', admin, wrap(req => snapshot(req.user.name)));
app.get('/api/admin/snapshots', admin, wrap(async () => (await store.list('snapshots')).sort((a, b) => b.at.localeCompare(a.at))));
app.get('/api/admin/snapshots/:id', admin, wrap(async req => { const d = await store.get('snapdata', req.params.id); if (!d) throw E('Snapshot not found', 404); return { app: 'WESTCOAST AI Procurement Agent', snapshot: req.params.id, data: d.data }; }));
app.get('/api/cron/snapshot', wrap(async req => {
  if (!process.env.CRON_SECRET || req.headers.authorization !== 'Bearer ' + process.env.CRON_SECRET) throw E('Unauthorized', 401);
  const r = await snapshot('Daily automatic backup');
  if (await gdrive.load(store)) { try { r.drive = await driveBackup('Daily automatic backup'); } catch (e) { r.driveError = e.message; } }
  return r;
}));

/* ================= Static ================= */
app.get('/q/:code', (req, res) => { if (!/^[A-Za-z0-9]{10}$/.test(req.params.code)) return res.status(404).send('Not found'); res.setHeader('Cache-Control', 'public, max-age=3600'); res.sendFile(path.join(ROOT, 'public', 'quote.html')); });
app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: '1h' }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route' }));

export default app;
if (!ON_VERCEL) app.listen(PORT, () => {
  console.log(`\n  WESTCOAST AI Procurement Agent v2 → http://localhost:${PORT}`);
  console.log(`  Storage: ${store.kind} | Claude: ${claude.configured() ? 'yes' : 'no'} | Gemini: ${gemini.configured() ? 'yes' : 'no'} | Serper: ${serper.configured() ? 'yes' : 'no'} | Apollo: ${apollo.configured() ? 'yes' : 'no'} | Outlook: ${outlook.configured() ? 'yes' : 'no'} | WATI: ${wati.configured() ? 'yes' : 'no'}\n`);
});
