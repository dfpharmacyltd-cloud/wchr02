// JSON-file store (local PC / VPS). One file per collection, atomic writes.
// On Vercel set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY and store-supabase.js is used instead.
import fs from 'fs/promises';
import path from 'path';

export const PUBLIC = ['prs', 'suppliers', 'claims', 'contacts', 'sources', 'rfqs', 'replies', 'templates', 'audit', 'dupes', 'campaigns', 'items', 'inquiries', 'quotes'];
export const PRIVATE = ['users', 'secrets', 'settings', 'snapshots', 'snapdata', 'links'];   // never sent by /api/data
export const COLLECTIONS = [...PUBLIC, ...PRIVATE];
export const ID_RE = /^[A-Za-z0-9_|.@-]{1,200}$/;

export class Store {
  constructor(dir) { this.dir = dir; this.cache = {}; this.queues = {}; this.kind = 'file'; }
  async init() {
    await fs.mkdir(this.dir, { recursive: true });
    for (const c of COLLECTIONS) {
      try { this.cache[c] = JSON.parse(await fs.readFile(this.file(c), 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw new Error(`Corrupt data file ${c}.json — restore it from backup. (${e.message})`); this.cache[c] = {}; }
    }
  }
  file(c) { return path.join(this.dir, c + '.json'); }
  valid(c, id) { return COLLECTIONS.includes(c) && (id === undefined || ID_RE.test(id)); }
  async all(colls = PUBLIC) { return Object.fromEntries(colls.map(c => [c, Object.values(this.cache[c])])); }
  async list(c) { return Object.values(this.cache[c]); }
  async get(c, id) { return this.cache[c][id] || null; }
  async has(c, id) { return !!this.cache[c][id]; }
  flush(c) {
    const q = (this.queues[c] || Promise.resolve()).then(async () => {
      const tmp = this.file(c) + '.' + process.pid + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(this.cache[c]));
      await fs.rename(tmp, this.file(c));
    });
    this.queues[c] = q.catch(() => {});
    return q;
  }
  async put(c, id, doc) {
    if (c === 'audit' && this.cache.audit[id]) throw Object.assign(new Error('Audit entries are append-only'), { status: 409 });
    this.cache[c][id] = { ...doc, id }; await this.flush(c); return this.cache[c][id];
  }
  async del(c, id) { delete this.cache[c][id]; await this.flush(c); }
}
