// Supabase / Postgres store — use on Vercel. Needs table public.wc_records (see README).
import { PUBLIC, COLLECTIONS, ID_RE } from './store.js';

export class SupabaseStore {
  constructor() {
    this.url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '') + '/rest/v1/wc_records';
    this.key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    this.kind = 'supabase';
  }
  async init() { if (!this.key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing'); }
  valid(c, id) { return COLLECTIONS.includes(c) && (id === undefined || ID_RE.test(id)); }
  async req(qs, opt = {}) {
    const r = await fetch(this.url + qs, { ...opt, headers: { apikey: this.key, Authorization: 'Bearer ' + this.key, 'Content-Type': 'application/json', ...(opt.headers || {}) } });
    if (!r.ok) { const t = await r.text(); throw Object.assign(new Error(r.status === 409 ? 'Audit entries are append-only' : 'Database error: ' + t.slice(0, 200)), { status: r.status === 409 ? 409 : 502 }); }
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  async all(colls = PUBLIC) {
    const out = Object.fromEntries(colls.map(c => [c, []]));
    for (let off = 0; ; off += 1000) {
      const rows = await this.req(`?select=coll,doc&coll=in.(${colls.join(',')})&order=coll,id&limit=1000&offset=${off}`);
      rows.forEach(r => out[r.coll] && out[r.coll].push(r.doc));
      if (rows.length < 1000) break;
    }
    return out;
  }
  async list(c) { return (await this.all([c]))[c]; }
  async get(c, id) { const rows = await this.req(`?select=doc&coll=eq.${c}&id=eq.${encodeURIComponent(id)}`); return rows[0] ? rows[0].doc : null; }
  async has(c, id) { return !!(await this.get(c, id)); }
  async put(c, id, doc) {
    const row = { coll: c, id, doc: { ...doc, id }, updated_at: new Date().toISOString() };
    await this.req('', { method: 'POST', headers: { Prefer: c === 'audit' ? 'return=minimal' : 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row) });
    return row.doc;
  }
  async del(c, id) { await this.req(`?coll=eq.${c}&id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }); }
}
