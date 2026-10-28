// MySQL store through the PHP bridge (php-bridge/wc-bridge.php on your own PHP hosting).
// Data lands in MySQL and is visible in phpMyAdmin (table wc_records + v_* views).
import { PUBLIC, COLLECTIONS, ID_RE } from './store.js';

export class PhpStore {
  constructor() {
    this.url = String(process.env.PHP_BRIDGE_URL || '');
    this.key = process.env.PHP_BRIDGE_KEY || '';
    this.kind = 'mysql (phpMyAdmin)';
  }
  async init() {
    if (!/^https:\/\//.test(this.url) && !process.env.ALLOW_HTTP_BRIDGE) throw new Error('PHP_BRIDGE_URL must start with https://');
    if (this.key.length < 32) throw new Error('PHP_BRIDGE_KEY must be at least 32 characters (same as $BRIDGE_KEY in wc-bridge.php)');
    await this.req({ action: 'init' });
  }
  valid(c, id) { return COLLECTIONS.includes(c) && (id === undefined || ID_RE.test(id)); }
  async req(body, tries = 2) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
    let r;
    try { r = await fetch(this.url, { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'X-Bridge-Key': this.key, 'User-Agent': 'WestcoastProcurement/2' }, body: JSON.stringify(body) }); }
    catch (e) { throw Object.assign(new Error('MySQL bridge not reachable: ' + (e.name === 'AbortError' ? 'timed out' : e.message)), { status: 502 }); }
    finally { clearTimeout(t); }
    const text = await r.text(); let d;
    try { d = JSON.parse(text); } catch { throw Object.assign(new Error('MySQL bridge returned a non-JSON page (HTTP ' + r.status + '). Your hosting may block API calls — see README.'), { status: 502 }); }
    if (r.status === 503 && tries > 1) return this.req(body, tries - 1);
    if (!r.ok) throw Object.assign(new Error(d.error || 'Bridge HTTP ' + r.status), { status: r.status === 409 ? 409 : 502 });
    return d;
  }
  async all(colls = PUBLIC) { return this.req({ action: 'all', colls }); }
  async list(c) { return (await this.all([c]))[c] || []; }
  async get(c, id) { return (await this.req({ action: 'get', coll: c, id })).doc; }
  async has(c, id) { return !!(await this.get(c, id)); }
  async put(c, id, doc) { const d = { ...doc, id }; await this.req({ action: 'put', coll: c, id, doc: d, insertOnly: c === 'audit' }); return d; }
  async del(c, id) { await this.req({ action: 'del', coll: c, id }); }
}
