// npm test — runs the server against MOCK providers (test/mock-providers.js). Not proof of live integrations.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { start } from './mock-providers.js';
import { htmlToText } from '../server/fetchPage.js';
import { parseJSON } from '../server/claude.js';
import { extractContacts, countryCheck } from '../server/finder.js';

const PORT = 3996, MOCK = 4014, BASE = `http://127.0.0.1:${PORT}`, M = `http://127.0.0.1:${MOCK}`;
let mock, srv, dir, cookie = '', viewerCookie = '';
const BRIDGE = process.env.TEST_BRIDGE_URL ? { PHP_BRIDGE_URL: process.env.TEST_BRIDGE_URL, PHP_BRIDGE_KEY: process.env.TEST_BRIDGE_KEY, ALLOW_HTTP_BRIDGE: '1' } : {};
async function readColl(c) {
  if (!BRIDGE.PHP_BRIDGE_URL) return Object.values(JSON.parse(await fs.readFile(path.join(dir, c + '.json'), 'utf8')));
  const r = await fetch(BRIDGE.PHP_BRIDGE_URL, { method: 'POST', headers: { 'X-Bridge-Key': BRIDGE.PHP_BRIDGE_KEY }, body: JSON.stringify({ action: 'all', colls: [c] }) });
  return (await r.json())[c];
}
async function j(method, url, body, opts = {}) {
  const r = await fetch(BASE + url, { method, redirect: 'manual', headers: { 'content-type': 'application/json', 'x-wcpa': opts.noHeader ? '' : '1', cookie: opts.cookie ?? cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc && opts.keep !== false && !opts.cookie) cookie = sc.split(';')[0];
  return { status: r.status, body: await r.json().catch(() => null), headers: r.headers };
}

before(async () => {
  mock = await start(MOCK);
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wcpa2-'));
  srv = spawn(process.execPath, ['server/index.js'], { stdio: 'pipe', env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, SESSION_SECRET: 'test-secret-0123456789abcdef', ADMIN_SETUP_KEY: 'setup123', APP_URL: BASE,
    APOLLO_API_KEY: 'test-apollo', APOLLO_BASE_URL: M, ANTHROPIC_API_KEY: 'test-claude', ANTHROPIC_BASE_URL: M, GEMINI_API_KEY: 'test-gemini', GEMINI_BASE_URL: M, SERPER_API_KEY: 'test-serper', SERPER_BASE_URL: M,
    MS_CLIENT_ID: 'cid', MS_CLIENT_SECRET: 'ms-secret', MS_LOGIN_BASE_URL: M, GRAPH_BASE_URL: M, WATI_API_ENDPOINT: M + '/wati', WATI_ACCESS_TOKEN: 'wati-token', GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'g-secret', GOOGLE_AUTH_URL: M + '/o/oauth2/v2/auth', GOOGLE_TOKEN_URL: M + '/token', GDRIVE_BASE_URL: M + '/gd', GMAIL_BASE_URL: M + '/gm', GOOGLE_USERINFO_URL: M + '/gm-userinfo', CRON_SECRET: 'cron1', ALLOW_PRIVATE_FETCH: '1', ...BRIDGE } });
  srv.stderr.on('data', d => process.stderr.write(d));
  for (let i = 0; i < 60; i++) { try { await fetch(BASE + '/healthz'); return; } catch { await new Promise(r => setTimeout(r, 100)); } }
  throw new Error('server did not start');
});
after(async () => { srv.kill(); mock.close(); await fs.rm(dir, { recursive: true, force: true }); });

test('first-run setup needs the setup key, then login works', async () => {
  assert.equal((await j('GET', '/api/auth/state')).body.needsSetup, true);
  assert.equal((await j('GET', '/api/data')).status, 401);
  assert.equal((await j('POST', '/api/auth/setup', { name: 'Admin', email: 'admin@wc.example', password: 'password1', setupKey: 'nope' })).status, 403);
  assert.equal((await j('POST', '/api/auth/setup', { name: 'Admin', email: 'admin@wc.example', password: 'password1', setupKey: 'setup123' })).status, 200);
  assert.equal((await j('GET', '/api/auth/me')).body.user.role, 'admin');
  assert.equal((await j('POST', '/api/auth/setup', { name: 'X', email: 'x@x.example', password: 'password1', setupKey: 'setup123' })).status, 409);
  cookie = ''; assert.equal((await j('POST', '/api/auth/login', { email: 'admin@wc.example', password: 'wrong' })).status, 401);
  assert.equal((await j('POST', '/api/auth/login', { email: 'ADMIN@wc.example', password: 'password1' })).status, 200);
});
test('CSRF header required for writes', async () => {
  assert.equal((await j('PUT', '/api/data/prs/pr_1', { api: 'x' }, { noHeader: true })).status, 403);
});
test('admin adds a viewer; viewer cannot write; private collections hidden', async () => {
  const u = await j('POST', '/api/users', { name: 'Auditor', email: 'aud@wc.example', role: 'viewer', password: 'temp12345' }); assert.equal(u.status, 200); assert.equal(u.body.passHash, undefined);
  const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-wcpa': '1' }, body: JSON.stringify({ email: 'aud@wc.example', password: 'temp12345' }) });
  viewerCookie = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await j('PUT', '/api/data/prs/pr_v', { api: 'x' }, { cookie: viewerCookie })).status, 403);
  assert.equal((await j('GET', '/api/users', null, { cookie: viewerCookie })).status, 403);
  assert.equal((await j('PUT', '/api/data/users/u_x', { role: 'admin' })).status, 400);
  const d = await j('GET', '/api/data'); assert.equal(d.body.users, undefined); assert.equal(d.body.secrets, undefined);
});
test('PM / RM departments: data separated on read and write', async () => {
  const mk = async (email, dept) => { await j('POST', '/api/users', { name: dept + ' user', email, role: 'procurement', dept, password: 'temp12345' });
    const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-wcpa': '1' }, body: JSON.stringify({ email, password: 'temp12345' }) }); return r.headers.get('set-cookie').split(';')[0]; };
  const pm = await mk('pm@wc.example', 'PM'), rm = await mk('rm@wc.example', 'RM');
  assert.equal((await j('GET', '/api/auth/me', null, { cookie: pm })).body.user.dept, 'PM');
  assert.equal((await j('PUT', '/api/data/suppliers/sup_pm1', { name: 'Foil Co', dept: 'RM' }, { cookie: pm })).status, 200);
  const pmData = await j('GET', '/api/data', null, { cookie: pm }); assert.equal(pmData.body.suppliers.find(x => x.id === 'sup_pm1').dept, 'PM', 'stamped with the user department, not the body');
  assert.ok(!(await j('GET', '/api/data', null, { cookie: rm })).body.suppliers.some(x => x.id === 'sup_pm1'), 'RM cannot see PM data');
  assert.equal((await j('PUT', '/api/data/suppliers/sup_pm1', { name: 'hijack' }, { cookie: rm })).status, 403, 'RM cannot overwrite PM data');
  assert.equal((await j('DELETE', '/api/data/suppliers/sup_pm1', null, { cookie: rm })).status, 403);
  assert.ok((await j('GET', '/api/data?dept=PM')).body.suppliers.some(x => x.id === 'sup_pm1'), 'admin (both) sees PM view');
  assert.ok(!(await j('GET', '/api/data?dept=RM')).body.suppliers.some(x => x.id === 'sup_pm1'));
  assert.equal((await j('PUT', '/api/data/templates/tpl_x', { name: 'shared' })).status, 200);
  assert.equal((await j('PUT', '/api/data/templates/tpl_x', { name: 'edit' }, { cookie: pm })).status, 403, 'dept users cannot edit shared templates');
  const r = await j('POST', '/api/search/companies', { api: 'Aluminium foil', country: 'India', provider: 'serper', kind: 'PM' }); assert.equal(r.status, 200);
});
test('audit is append-only and stamped with the signed-in user', async () => {
  assert.equal((await j('PUT', '/api/data/audit/au_1', { action: 'x', by: 'Somebody else' })).status, 200);
  assert.equal((await j('PUT', '/api/data/audit/au_1', { action: 'tampered' })).status, 409);
  assert.equal((await j('GET', '/api/data')).body.audit[0].by, 'Admin');
  const users = await readColl('users'); assert.ok(users.length >= 2 && users.every(u => u.passHash && !u.password));
});
test('company search falls back from Claude to Google Gemini and drops invented sites', async () => {
  const r = await j('POST', '/api/search/companies', { api: 'Paracetamol', country: 'India', n: 10 });
  assert.equal(r.status, 200);
  assert.equal(r.body.tried[0].provider, 'claude'); assert.ok(r.body.tried[0].error);
  assert.ok(r.body.tried.some(t => t.provider === 'gemini' && t.ok));
  const doms = r.body.candidates.map(c => c.domain);
  assert.ok(doms.includes('127.0.0.1')); assert.ok(!doms.includes('ghost.example'));
});
test('settings default CC list', async () => {
  const st = await j('GET', '/api/settings'); assert.equal(st.body.ccEmails, 'kcp@westcoastin.com, parth@westcoastin.com'); assert.equal(st.body.replyToCc, true);
  assert.equal((await j('PUT', '/api/settings', { ccEmails: 'not-an-email' })).status, 400);
});
test('next search round excludes already-found websites', async () => {
  const r = await j('POST', '/api/search/companies', { api: 'Paracetamol', country: 'India', provider: 'serper', exclude: ['127.0.0.1'], round: 1 });
  assert.equal(r.status, 200); assert.equal(r.body.candidates.length, 0);
});
test('Serper-only search filters marketplaces', async () => {
  const r = await j('POST', '/api/search/companies', { api: 'Paracetamol', country: 'India', provider: 'serper' });
  assert.deepEqual(r.body.candidates.map(c => c.domain), ['127.0.0.1']);
});
test('website finder reads home + contact page: emails, phones, WhatsApp, India check', async () => {
  const r = await j('POST', '/api/finder/crawl', { url: `${M}/products`, country: 'India' });
  assert.equal(r.status, 200);
  const emails = r.body.emails.map(e => e.value);
  assert.ok(emails.includes('sales@acmepharma.example')); assert.ok(emails.includes('exports@acmepharma.example'), 'Cloudflare-protected email decoded');
  const phones = r.body.phones.map(p => p.normalized);
  assert.ok(phones.includes('+919825012345')); assert.ok(!phones.some(p => p.endsWith('2400101')), 'fax skipped'); assert.ok(!phones.some(p => p.includes('103902')), 'CAS number not a phone');
  assert.ok(r.body.phones.find(p => p.normalized === '+919825012345').whatsappMentioned);
  assert.ok(r.body.whatsapp.some(w => w.value === '+919825012345'));
  assert.equal(r.body.country.match, true);
  assert.equal(r.body.country.state, 'Gujarat'); assert.equal(r.body.country.city, 'Vapi');
  const beta = await j('POST', '/api/finder/crawl', { url: `http://localhost:${MOCK}/`, country: 'India' });
  assert.equal(beta.body.country.match, false);
});
test('AI JSON uses Claude when it works', async () => {
  const r = await j('POST', '/api/ai/json', { prompt: 'commercial terms test' }); assert.equal(r.body.provider, 'claude');
});
test('Outlook OAuth connect → draft → send → inbox', async () => {
  let r = await fetch(BASE + '/api/outlook/connect', { redirect: 'manual', headers: { cookie } }); assert.equal(r.status, 302);
  r = await fetch(r.headers.get('location'), { redirect: 'manual' }); assert.equal(r.status, 302);
  r = await fetch(r.headers.get('location'), { redirect: 'manual', headers: { cookie } }); assert.equal(r.headers.get('location'), '/#outlook=connected');
  const st = await j('GET', '/api/outlook/status'); assert.equal(st.body.connected, true); assert.equal(st.body.account.email, 'purchase@westcoastin.example');
  const d = await j('POST', '/api/outlook/draft', { to: 'sales@acmepharma.example', subject: 'RFQ', body: 'Hello' }); assert.equal(d.status, 200); assert.ok(d.body.id);
  assert.equal((await j('POST', '/api/outlook/send', { id: d.body.id })).body.status, 202);
  const d2 = await j('POST', '/api/outlook/draft', { to: 'x@acmepharma.example', cc: 'kcp@westcoastin.com, parth@westcoastin.com', replyTo: 'kcp@westcoastin.com, parth@westcoastin.com', subject: 'RFQ', body: 'Hi' });
  const rec = mock.calls.drafts.find(x => x.id === d2.body.id);
  assert.deepEqual(rec.cc, ['kcp@westcoastin.com', 'parth@westcoastin.com']);
  assert.deepEqual(rec.replyTo, ['purchase@westcoastin.example', 'kcp@westcoastin.com', 'parth@westcoastin.com'], 'reply goes to sender + both colleagues');
  assert.equal(mock.calls.graphSend, 1);
  const inbox = await j('GET', '/api/outlook/inbox'); assert.equal(inbox.body.length, 2);
  const secrets = await readColl('secrets'); assert.equal(secrets.length, 1); assert.ok(!JSON.stringify(secrets).includes('at_'), 'tokens stored encrypted');
});
test('WATI templates and send', async () => {
  const t = await j('GET', '/api/wati/templates'); assert.equal(t.body[0].name, 'rfq_inquiry'); assert.deepEqual(t.body[0].params, ['name', 'api', 'qty']);
  const s = await j('POST', '/api/wati/send', { number: '+91 98250 12345', template: 'rfq_inquiry', params: [{ name: 'name', value: 'Acme' }] });
  assert.equal(s.status, 200); assert.equal(mock.calls.wati[0].number, '919825012345');
  assert.equal((await j('POST', '/api/wati/send', { number: '123', template: 'rfq_inquiry' })).status, 400);
});
test('Apollo flow still works', async () => {
  const c = await j('POST', '/api/apollo/companies', { keywords: 'paracetamol', locations: 'India' }); assert.equal(c.body.items.length, 2);
  const e = await j('POST', '/api/apollo/enrich', { ids: ['p1'] }); assert.equal(e.body.items[0].email, 'ravi.patel@gammalife.example');
});
test('snapshots: manual, cron with secret only, download', async () => {
  const s = await j('POST', '/api/admin/snapshot'); assert.equal(s.status, 200);
  assert.equal((await j('GET', '/api/cron/snapshot', null, { cookie: '' })).status, 401);
  const c = await fetch(BASE + '/api/cron/snapshot', { headers: { authorization: 'Bearer cron1' } }); assert.equal(c.status, 200);
  const list = await j('GET', '/api/admin/snapshots'); assert.equal(list.body.length, 2);
  const one = await j('GET', '/api/admin/snapshots/' + list.body[0].id); assert.ok(one.body.data.audit);
});
test('Google Drive: connect, folders, upload token, share, backup', async () => {
  let r = await fetch(BASE + '/api/gdrive/connect', { redirect: 'manual', headers: { cookie } }); assert.equal(r.status, 302);
  r = await fetch(r.headers.get('location'), { redirect: 'manual' });
  r = await fetch(r.headers.get('location'), { redirect: 'manual', headers: { cookie } }); assert.equal(r.headers.get('location'), '/#gdrive=connected');
  const st = await j('GET', '/api/gdrive/status'); assert.equal(st.body.connected, true); assert.equal(st.body.account, 'purchase@westcoastin.example');
  const t = await j('POST', '/api/gdrive/token'); assert.ok(t.body.accessToken.startsWith('gat_')); assert.ok(t.body.folders.files && t.body.folders.backups);
  const b = await j('POST', '/api/gdrive/backup'); assert.equal(b.status, 200); assert.match(b.body.name, /backup_.*\.json$/);
  const sh = await j('POST', '/api/gdrive/share', { fileId: b.body.id }); assert.equal(sh.status, 200); assert.ok(mock.calls.drive.perms.includes(b.body.id));
  const secrets = await readColl('secrets'); assert.ok(!JSON.stringify(secrets).includes('gat_'), 'Drive tokens encrypted');
  const c = await fetch(BASE + '/api/cron/snapshot', { headers: { authorization: 'Bearer cron1' } }); assert.ok((await c.json()).drive, 'nightly backup also goes to Drive');
  // 9 MB artwork through our server in chunks (Vercel limit is 4.5 MB per request)
  const size = 9 * 1048576; const st0 = await j('POST', '/api/gdrive/upload/start', { name: 'artwork.pdf', mimeType: 'application/pdf', size });
  let start = 0, last;
  while (start < size) { const len = Math.min(15 * 256 * 1024, size - start);
    const r2 = await fetch(`${BASE}/api/gdrive/upload/chunk?t=${encodeURIComponent(st0.body.token)}&start=${start}&total=${size}`, { method: 'PUT', headers: { cookie, 'x-wcpa': '1', 'content-type': 'application/octet-stream' }, body: Buffer.alloc(len, 1) });
    last = await r2.json(); assert.equal(r2.status, 200, JSON.stringify(last)); if (last.done) break; start = last.next; }
  assert.equal(last.done, true); assert.equal(last.file.name, 'artwork.pdf'); assert.match(last.file.link, /drive\.example/);
  // send that 9 MB PDF + a small one as real Outlook attachments
  const small = Buffer.from('%PDF-1.4 small').toString('base64');
  const dd = await j('POST', '/api/outlook/draft', { to: 'v@x.example', subject: 'RFQ with files', body: 'see attached', attachments: [{ name: 'spec.pdf', contentType: 'application/pdf', b64: small }], driveFiles: [{ id: last.file.id, name: 'artwork.pdf', mimeType: 'application/pdf' }] });
  assert.equal(dd.status, 200, JSON.stringify(dd.body));
  const rec = mock.calls.drafts.find(x => x.id === dd.body.id); assert.deepEqual(rec.attachments, ['spec.pdf:14']);
  assert.equal(mock.calls.bigAtt[dd.body.id].name, 'artwork.pdf'); assert.equal(mock.calls.bigAtt[dd.body.id].got, size, 'big file uploaded fully in chunks');
  const bad = await fetch(`${BASE}/api/gdrive/upload/chunk?t=garbage&start=0&total=${size}`, { method: 'PUT', headers: { cookie, 'x-wcpa': '1', 'content-type': 'application/octet-stream' }, body: Buffer.alloc(10) }); assert.equal(bad.status, 400);
});
test('Inquiry → vendor portal → submit once → confirmation email', async () => {
  const me = (await j('GET', '/api/auth/me')).body.user;
  await j('PUT', '/api/data/suppliers/sup_v1?dept=PM', { name: 'Label House', dept: 'PM' });
  await j('PUT', '/api/data/suppliers/sup_v2?dept=PM', { name: 'Carton Co', dept: 'PM' });
  const code = (await j('POST', '/api/inquiries/code')).body.code; assert.match(code, /^INQ-\d{4}-\d{2}-\d+$/);
  await j('PUT', '/api/data/inquiries/inq_1?dept=PM', { code, dept: 'PM', status: 'sent', createdBy: me.id, items: [{ id: 'li1', name: 'VERASOFT LOTION label', qty: '3100', uom: 'NOS', files: [{ name: '4B.pdf', link: 'https://drive.example/x' }] }], vendors: ['sup_v1', 'sup_v2'], sent: { sup_v1: { ok: true, to: 'sales@labelhouse.example' } } });
  const L = (await j('POST', '/api/inquiries/inq_1/links', {})).body.links; assert.ok(L.sup_v1 && L.sup_v2);
  assert.match(L.sup_v1, /\/q\/[A-Za-z0-9]{10}$/, 'short link'); const tok = L.sup_v1.split('/q/')[1];
  const page = await fetch(L.sup_v1); assert.equal(page.status, 200); assert.match(await page.text(), /quote\.js/);
  const g = await j('GET', '/api/portal/' + encodeURIComponent(tok), null, { cookie: '' }); assert.equal(g.status, 200); assert.equal(g.body.inquiry.items[0].name, 'VERASOFT LOTION label'); assert.equal(g.body.vendor.name, 'Label House'); assert.equal(g.body.quote, null);
  assert.equal((await j('GET', '/api/portal/ABCDEFGHJK', null, { cookie: '' })).status, 403);
  assert.equal((await j('POST', '/api/portal/' + encodeURIComponent(tok), { items: { li1: { rate: 'abc' } } }, { cookie: '' })).status, 400);
  const before = mock.calls.drafts.length;
  const p = await j('POST', '/api/portal/' + encodeURIComponent(tok), { items: { li1: { rate: '90', mrp: '100', discount: '10', tax: '5', packing: 'BOX', delivery: '5 DAYS', payment: '30 DAYS', validity: '5 DAYS' } } }, { cookie: '' });
  assert.equal(p.status, 200);
  assert.equal((await j('POST', '/api/portal/' + encodeURIComponent(tok), { items: { li1: { rate: '80' } } }, { cookie: '' })).status, 409, 'cannot submit twice');
  const conf = mock.calls.drafts.slice(before).find(d => d.subject === `Quotation Received — ${code}`); assert.ok(conf, 'confirmation email sent'); assert.deepEqual(conf.to, ['sales@labelhouse.example']); assert.ok(conf.cc.includes('kcp@westcoastin.com')); assert.match(conf.html, /BOX/);
  const q = (await j('GET', '/api/data?dept=PM')).body.quotes.find(x => x.id === 'q_inq_1_sup_v1'); assert.equal(q.items.li1.rate, '90'); assert.equal(q.dept, 'PM');
  assert.ok(!(await j('GET', '/api/data?dept=RM')).body.quotes.some(x => x.id === 'q_inq_1_sup_v1'));
  await j('POST', '/api/inquiries/inq_1/links', { supplierIds: ['sup_v1'], renew: true });
  assert.equal((await j('GET', '/api/portal/' + encodeURIComponent(tok), null, { cookie: '' })).status, 403, 'renewed link revokes the old one');
});
test('Gmail: connect, send with BCC + attachment; Outlook one-call send with BCC', async () => {
  let r = await fetch(BASE + '/api/gmail/connect', { redirect: 'manual', headers: { cookie } }); assert.equal(r.status, 302); assert.match(r.headers.get('location'), /gmail\.send/);
  r = await fetch(r.headers.get('location'), { redirect: 'manual' });
  r = await fetch(r.headers.get('location'), { redirect: 'manual', headers: { cookie } }); assert.equal(r.headers.get('location'), '/#gmail=connected');
  assert.equal((await j('GET', '/api/gmail/status')).body.account.email, 'purchase.westcoast03@gmail.example');
  const g = await j('POST', '/api/mail/send', { provider: 'gmail', to: 'purchase.westcoast03@gmail.example', bcc: 'a@v.example, b@v.example', cc: 'kcp@westcoastin.com', subject: 'Box - Require Rate ✓', html: '<table><tr><td>MONET F</td></tr></table>', body: 'MONET F', attachments: [{ name: 'spec.pdf', contentType: 'application/pdf', b64: Buffer.from('%PDF-1.4 x').toString('base64') }] });
  assert.equal(g.status, 200, JSON.stringify(g.body)); assert.equal(g.body.provider, 'gmail');
  const raw = mock.calls.gmail.at(-1).raw;
  assert.match(raw, /^From: purchase\.westcoast03@gmail\.example/m); assert.match(raw, /^Bcc: a@v\.example, b@v\.example/m); assert.match(raw, /^Cc: kcp@westcoastin\.com/m);
  assert.match(raw, /filename="spec\.pdf"/); assert.match(raw, /=\?UTF-8\?B\?/, 'non-ASCII subject encoded');
  const o = await j('POST', '/api/mail/send', { provider: 'outlook', to: 'me@westcoastin.example', bcc: 'x@v.example;y@v.example', subject: 'BCC test', body: 'hi' });
  assert.equal(o.status, 200); const rec = mock.calls.drafts.find(d => d.id === o.body.id); assert.deepEqual(rec.bcc, ['x@v.example', 'y@v.example']);
});
test('big page texts are left out of /api/data and kept on save', async () => {
  const big = 'x'.repeat(5000);
  await j('PUT', '/api/data/sources/src_big?dept=RM', { title: 'page', text: big, dept: 'RM' });
  const d = await j('GET', '/api/data?dept=RM'); const s0 = d.body.sources.find(x => x.id === 'src_big'); assert.equal(s0.text, undefined); assert.equal(s0.textLen, 5000);
  await j('PUT', '/api/data/sources/src_big?dept=RM', { ...s0, extractedAt: 'now' });
  const one = await j('GET', '/api/data/sources/src_big'); assert.equal(one.body.text.length, 5000, 'text not lost'); assert.equal(one.body.extractedAt, 'now');
  assert.equal((await j('GET', '/api/data?full=1&dept=RM')).body.sources.find(x => x.id === 'src_big').text.length, 5000);
});
test('preview short link: opens read-only, cannot submit', async () => {
  const r = await j('POST', '/api/preview', { data: { code: 'INQ-PREVIEW', dept: 'PM', items: [{ id: 'p0', name: 'Box', qty: '10', uom: 'NOS' }] } });
  assert.match(r.body.link, /\/q\/[A-Za-z0-9]{10}$/); const code = r.body.link.split('/q/')[1];
  const g = await j('GET', '/api/portal/' + code, null, { cookie: '' }); assert.equal(g.body.preview, true); assert.equal(g.body.inquiry.items[0].name, 'Box');
  assert.equal((await j('POST', '/api/portal/' + code, { items: { p0: { rate: '1' } } }, { cookie: '' })).status, 403);
});
test('Logistics air-freight inquiry: portal validates and computes the total', async () => {
  await j('PUT', '/api/data/suppliers/sup_fw1?dept=LOG', { name: 'Fast Forwarders', dept: 'LOG' });
  await j('PUT', '/api/data/inquiries/inq_air?dept=LOG', { code: 'INQ-AIR-1', dept: 'LOG', kind: 'AIR', currency: 'INR', status: 'sent', shipment: { destination: 'Europe', portDischarge: 'FRA', grossWeight: '120', volumeWeight: '150' }, items: [{ id: 'ship', name: 'Air freight — Europe', qty: '150', uom: 'kg chargeable' }], vendors: ['sup_fw1'] });
  const L = (await j('POST', '/api/inquiries/inq_air/links', {})).body.links; const code = L.sup_fw1.split('/q/')[1];
  const g = await j('GET', '/api/portal/' + code, null, { cookie: '' }); assert.equal(g.body.inquiry.kind, 'AIR'); assert.equal(g.body.inquiry.shipment.destination, 'Europe'); assert.equal(g.body.inquiry.currency, 'INR');
  assert.equal((await j('POST', '/api/portal/' + code, { items: { ship: { forwarder: 'X' } } }, { cookie: '' })).status, 400, 'rate per kg required');
  assert.equal((await j('POST', '/api/portal/' + code, { items: { ship: { ratePerKg: 'abc' } } }, { cookie: '' })).status, 400);
  const p = await j('POST', '/api/portal/' + code, { items: { ship: { forwarder: 'Fast', ratePerKg: '2.5', awb: '10', ams: '5', airline: 'Emirates', transit: '3 days' } } }, { cookie: '' }); assert.equal(p.status, 200);
  const q = (await j('GET', '/api/data?dept=LOG')).body.quotes.find(x => x.id === 'q_inq_air_sup_fw1'); assert.equal(q.items.ship.total, '390', '2.5 × 150 kg + 15'); assert.equal(q.dept, 'LOG');
  assert.ok(!(await j('GET', '/api/data?dept=PM')).body.quotes.some(x => x.id === 'q_inq_air_sup_fw1'), 'LOG data separate');
});
test('helpers', () => {
  assert.equal(htmlToText('<p>A &amp; B</p><script>x</script>').text, 'A & B');
  assert.deepEqual(parseJSON('```json\n{"a":1}\n```'), { a: 1 });
  const x = extractContacts('<p>Call us: 079-2654 1234</p><p>Year 2019-2020</p><p>sales@x.example logo@2x.png</p>', 'https://x.example/');
  assert.deepEqual(x.emails.map(e => e.value), ['sales@x.example']); assert.equal(x.phones.length, 1);
  assert.equal(countryCheck('India', { domain: 'abc.in', text: '', phones: [] }).match, true);
  assert.equal(countryCheck('India', { domain: 'abc.com', text: 'we export to India', phones: [] }).match, false);
});
