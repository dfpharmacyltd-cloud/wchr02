// Serper.dev — Google Search results API (2,500 free queries on signup). Used as a search fallback.
const BASE = () => (process.env.SERPER_BASE_URL || 'https://google.serper.dev').replace(/\/$/, '');
const KEY = () => process.env.SERPER_API_KEY || '';
export const configured = () => !!KEY();
export async function search(q, { gl, num = 10, page = 1 } = {}) {
  if (!configured()) throw Object.assign(new Error('SERPER_API_KEY is not set'), { status: 400 });
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  let res;
  try { res = await fetch(BASE() + '/search', { method: 'POST', signal: ctl.signal, headers: { 'X-API-KEY': KEY(), 'Content-Type': 'application/json' }, body: JSON.stringify({ q, ...(gl ? { gl } : {}), num, ...(page > 1 ? { page } : {}) }) }); }
  catch (e) { throw Object.assign(new Error('Could not reach Serper: ' + e.message), { status: 502 }); }
  finally { clearTimeout(t); }
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error('Serper: ' + (d.message || 'HTTP ' + res.status)), { status: res.status === 401 || res.status === 403 ? 400 : 502 });
  return (d.organic || []).map(o => ({ url: o.link, title: o.title || '', snippet: o.snippet || '' }));
}
