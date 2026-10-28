// Fetches a public web page and returns readable text for evidence extraction.
// Guards: http(s) only, blocks private/loopback/link-local addresses (SSRF), re-checks every redirect,
// 15 s timeout, 3 MB cap. mailto:/tel: links are kept in the text so contacts can be quoted.
import dns from 'dns/promises';
import net from 'net';

class FetchError extends Error { constructor(m, s = 400) { super(m); this.status = s; } }

function isPrivate(ip) {
  if (net.isIPv6(ip)) { const l = ip.toLowerCase(); if (l.startsWith('::ffff:')) return isPrivate(l.slice(7)); return l === '::1' || l === '::' || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('fe80'); }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
async function assertPublic(u) {
  let url; try { url = new URL(u); } catch { throw new FetchError('Not a valid URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new FetchError('Only http(s) URLs can be fetched');
  if (process.env.ALLOW_PRIVATE_FETCH === '1') return url;
  const addrs = await dns.lookup(url.hostname, { all: true }).catch(() => { throw new FetchError('Could not resolve ' + url.hostname, 502); });
  if (addrs.some(a => isPrivate(a.address))) throw new FetchError('Refusing to fetch a private or internal address');
  return url;
}
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', reg: '®', copy: '©', deg: '°' };
export function htmlToText(html) {
  let h = String(html);
  const title = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const links = [...h.matchAll(/href\s*=\s*["']\s*(mailto:|tel:|https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/)([^"']+)["']/gi)].map(m => (m[1] + m[2]).replace(/\?.*$/, ''));
  h = h.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/td|\/th)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m));
  const text = h.split('\n').map(l => l.replace(/[ \t\r\f\v]+/g, ' ').trim()).filter(Boolean).join('\n');
  const uniq = [...new Set(links)];
  return { title: decode(title).trim(), text: text + (uniq.length ? '\n\n[Links on page]\n' + uniq.join('\n') : '') };
}
const decode = s => s.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export async function fetchRaw(u, { timeout = 15000, maxBytes = 3e6 } = {}) {
  let url = await assertPublic(u);
  for (let hop = 0; hop < 5; hop++) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
    let res;
    try { res = await fetch(url, { redirect: 'manual', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WestcoastProcurementResearch/2.0)', Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5', 'Accept-Language': 'en' } }); }
    catch (e) { clearTimeout(t); throw new FetchError('Could not load page: ' + (e.name === 'AbortError' ? 'timed out' : e.message), 502); }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { clearTimeout(t); url = await assertPublic(new URL(res.headers.get('location'), url).toString()); continue; }
    if (!res.ok) { clearTimeout(t); throw new FetchError('The site answered HTTP ' + res.status + (res.status === 403 ? ' (it blocks automated access — open it in your browser and paste the text instead)' : ''), 502); }
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (type.includes('pdf')) { clearTimeout(t); throw new FetchError('This is a PDF. Open it, copy the text and paste it as a source.', 415); }
    const reader = res.body.getReader(); const chunks = []; let size = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) { ctl.abort(); break; } chunks.push(value); } } catch {}
    clearTimeout(t);
    return { finalUrl: url.toString(), html: Buffer.concat(chunks).toString('utf8'), contentType: type, bytes: size };
  }
  throw new FetchError('Too many redirects', 502);
}

export async function fetchPage(u) {
  const r = await fetchRaw(u);
  const out = r.contentType.includes('html') || /<html|<body/i.test(r.html.slice(0, 2000)) ? htmlToText(r.html) : { title: '', text: r.html };
  if (out.text.length < 80) throw new FetchError('The page returned almost no text (it may need JavaScript). Open it and paste the text instead.', 422);
  return { finalUrl: r.finalUrl, title: out.title, text: out.text.slice(0, 100000), contentType: r.contentType, bytes: r.bytes, retrievedAt: new Date().toISOString() };
}
export { FetchError, assertPublic };
