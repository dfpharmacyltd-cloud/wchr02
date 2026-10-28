// Company discovery (multi-provider with automatic fallback), AI provider fallback,
// and the free website contact finder (emails / phones / WhatsApp quoted from the company's own pages).
import * as claude from './claude.js';
import * as gemini from './gemini.js';
import * as serper from './serper.js';
import { fetchRaw, htmlToText } from './fetchPage.js';

/* ---------- AI with fallback ---------- */
export const aiConfigured = () => claude.configured() || gemini.configured();
export async function aiJSON(prompt, pref = 'auto') {
  const order = pref === 'gemini' ? ['gemini', 'claude'] : ['claude', 'gemini'];
  const errors = [];
  for (const p of order) {
    const mod = p === 'claude' ? claude : gemini;
    if (!mod.configured()) continue;
    try { const r = await mod.json(prompt); return { ...r, provider: p, fallbackFrom: errors.length ? errors : undefined }; }
    catch (e) { errors.push(`${p}: ${e.message}`); }
  }
  throw Object.assign(new Error(errors.length ? 'All AI providers failed — ' + errors.join(' | ') : 'No AI provider configured (set ANTHROPIC_API_KEY or GEMINI_API_KEY)'), { status: errors.length ? 502 : 400 });
}

/* ---------- Company discovery ---------- */
const BLOCK = /(^|\.)(indiamart|tradeindia|exportersindia|alibaba|aliexpress|made-in-china|globalsources|linkedin|facebook|instagram|youtube|twitter|x|wikipedia|justdial|sulekha|pharmacompass|chemicalbook|echemi|guidechem|lookchem|molbase|fda|edqm|cdsco|who|ema\.europa|drugs|1mg|pharmeasy|netmeds|zaubacorp|tofler|dnb|glassdoor|naukri|indeed|ambitionbox|google|amazon|flipkart|medindia|pubchem\.ncbi|ncbi\.nlm|sciencedirect|researchgate|scribd|slideshare|pinterest|reddit|quora|medium|blogspot|wordpress|tradekey|ec21|ecplaza|pharmaoffer|pipelinepharma|volza|seair|exim|zauba|connect2india|infodriveindia|eximpedia|marketresearch|grandviewresearch|imarcgroup|mordorintelligence)\./i;
const dom = u => { try { return new URL(/^https?:/i.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };
export const isCompanyDomain = d => !!d && !BLOCK.test(d + '.') && !/\.(gov|gov\.in|nic\.in|edu|ac\.in|int)$/.test(d);
const GL = { india: 'in', china: 'cn', italy: 'it', spain: 'es', germany: 'de', france: 'fr', switzerland: 'ch', 'united states': 'us', usa: 'us', 'united kingdom': 'uk', japan: 'jp', 'south korea': 'kr', israel: 'il', bangladesh: 'bd', vietnam: 'vn', brazil: 'br', mexico: 'mx', turkey: 'tr' };
const cleanName = t => String(t || '').split(/\s[|\-–—:]\s|\s\|\s/)[0].replace(/\b(home|welcome to|official website)\b/gi, '').trim().slice(0, 90);

export function providerStatus() {
  return { claude: claude.searchConfigured(), gemini: gemini.configured(), serper: serper.configured() };
}
export async function findCompanies({ api, synonyms = '', country = '', strict = true, n = 25, provider = 'auto', docs = '', exclude = [], round = 0, state = '', city = '', kind = 'RM' }) {
  const PM = kind === 'PM' || kind === 'MISC'; const LOGK = kind === 'LOG';
  if (!api) throw Object.assign(new Error('API name is required'), { status: 400 });
  const where0 = country && country !== 'Any' ? country : '';
  const where = [city, state, where0].filter(Boolean).join(', ');
  const skip = new Set((exclude || []).map(d => String(d).toLowerCase()).slice(0, 400));
  const ANGLES = PM ? ['manufacturers', 'pharmaceutical packaging converters and printers', 'suppliers to pharma companies with GMP / ISO 15378 certification', 'manufacturers located in industrial estates (GIDC, MIDC etc.)', 'smaller and mid-size manufacturers'] : ['manufacturers', 'bulk drug / API producers with GMP or WHO-GMP certification', 'API exporters and DMF / CEP holders', 'API makers located in pharma industrial estates (GIDC, MIDC, APIIC, SIDCUL etc.)', 'smaller and mid-size API manufacturing companies'];
  const angle = ANGLES[round % ANGLES.length];
  const context = (LOGK ? `Freight forwarding / logistics companies (air and sea export) for WESTCOAST PHARMACEUTICAL WORKS LTD., Ahmedabad, India. Service needed: "${api}". Look for freight forwarders, customs brokers (CHA) and logistics companies that handle pharmaceutical exports.${where ? ' Based in ' + where + '.' : ''}` : (kind === 'MISC' ? `General supplies sourcing for WESTCOAST PHARMACEUTICAL WORKS LTD., Ahmedabad, India. Item: "${api}". Look for manufacturers or suppliers of this item.` : PM ? `Pharmaceutical PACKING MATERIAL sourcing for WESTCOAST PHARMACEUTICAL WORKS LTD., Ahmedabad, India (a tablet/capsule/liquid manufacturer). Material: "${api}"${synonyms ? ' (also called ' + synonyms + ')' : ''}. Look for companies that manufacture or convert this packaging material for pharma use.` : `Pharmaceutical API (active pharmaceutical ingredient) sourcing for WESTCOAST PHARMACEUTICAL WORKS LTD., Ahmedabad, India. API: "${api}"${synonyms ? ' (also called ' + synonyms + ')' : ''}. Required documents: ${docs || 'GMP, COA, DMF/CEP'}.`)) + `${where ? ` ${strict ? 'ONLY' : 'Prefer'} manufacturers located in ${where}${strict ? '; exclude companies outside ' + where : ''}.` : ''} Focus this search on: ${angle}.${skip.size ? ' Do NOT return these already-known websites: ' + [...skip].slice(0, 80).join(', ') + '.' : ''}`;
  const order = provider === 'auto' ? ['claude', 'gemini', 'serper'] : [provider];
  const map = new Map(), tried = [];
  const add = (list, p) => list.forEach(c => { const d = dom(c.url); if (!isCompanyDomain(d) || map.has(d) || skip.has(d)) return; map.set(d, { url: c.url, domain: d, company: c.company || cleanName(c.title) || d, title: c.title || '', snippet: c.snippet || c.why || '', provider: p, sourceType: c.sourceType || 'Manufacturer website' }); });
  for (const p of order) {
    const ok = p === 'claude' ? claude.searchConfigured() : p === 'gemini' ? gemini.configured() : serper.configured();
    if (!ok) { tried.push({ provider: p, skipped: 'not configured' }); continue; }
    try {
      const before = map.size;
      if (p === 'claude') add((await claude.research({ context, maxSearches: 8, subject: PM ? 'PM' : 'API' })).candidates, 'Claude web search');
      if (p === 'gemini') add((await gemini.research({ context, subject: PM ? 'PM' : 'API' })).candidates, 'Google (Gemini)');
      if (p === 'serper') {
        const syn = synonyms ? synonyms.split(',')[0].trim() : '';
        const sets = LOGK ? [[`freight forwarder ${api} ${where}`, `air freight forwarder pharma export ${where}`, `sea freight forwarder ${where} contact`], [`custom house agent CHA ${where}`, `logistics company export ${where} email`, `international freight forwarder ${where}`], [`${api} logistics ${where} "contact us"`, `freight forwarding company ${where}`, `cargo agent ${where}`]] : PM ? [[`"${api}" manufacturer ${where}`, `"${api}" pharma packaging supplier ${where}`, `"${api}" for pharmaceutical packaging ${where} contact`], [`"${api}" supplier ${where}`, `"${api}" manufacturers list ${where}`, `pharmaceutical packaging "${api}" ${where}`], [`"${api}" ${where} "contact us"`, `"${api}" printing converter ${where}`, `"${api}" exporter ${where}`]] : [[`"${api}" API manufacturer ${where}`, `"${api}" active pharmaceutical ingredient manufacturer ${where} contact`, `"${api}" bulk drug manufacturer ${where} GMP`, ...(syn ? [`"${syn}" API manufacturer ${where}`] : [])],
          [`"${api}" API exporter ${where}`, `"${api}" API supplier ${where} DMF`, `"${api}" manufacturers list ${where}`], [`"${api}" API ${where} "contact us"`, `"${api}" IP BP USP manufacturer ${where}`, `"${api}" pharma chemicals manufacturer ${where}`]];
        const qs = sets[round % sets.length]; const page = Math.floor(round / sets.length) + 1;
        for (const q of qs) add(await serper.search(q.replace(/\s+/g, ' ').trim(), { gl: GL[String(where0).toLowerCase()], num: 10, page }), 'Google (Serper)');
      }
      tried.push({ provider: p, ok: true, added: map.size - before });
      if (map.size >= n) break;
    } catch (e) { tried.push({ provider: p, error: e.message }); }
  }
  if (!map.size && tried.every(t => t.skipped || t.error)) {
    const msg = tried.map(t => `${t.provider}: ${t.skipped || t.error}`).join(' | ');
    throw Object.assign(new Error('No search provider worked — ' + msg), { status: 502, tried });
  }
  return { candidates: [...map.values()].slice(0, Math.max(n, 10) * 2), tried };
}

/* ---------- Website contact finder ---------- */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,24}/gi;
const BAD_EMAIL = /\.(png|jpe?g|gif|svg|webp|css|js|ico)$|example\.|sentry|wixpress|domain\.com|yourdomain|youremail|email\.com|@2x|placeholder|godaddy|@sentry|noreply|no-reply|test@|user@|name@/i;
const CONTACT_LINK = /contact|about|reach|enquir|inquir|get-in-touch|connect|support|office|location|sales/i;
const PHONE_CTX = /(tel|phone|ph\.?|mob|mobile|cell|call|contact|whats\s*app|t\s*:|m\s*:|helpline|landline|☎|📞)/i;
const STATES = /\b(gujarat|maharashtra|telangana|andhra pradesh|karnataka|tamil nadu|himachal pradesh|punjab|haryana|uttarakhand|uttar pradesh|madhya pradesh|west bengal|goa|kerala|rajasthan|odisha|sikkim|jammu|delhi|hyderabad|ahmedabad|vadodara|ankleshwar|vapi|bharuch|mumbai|pune|tarapur|baddi|visakhapatnam|bengaluru|bangalore|chennai|aurangabad|nashik|thane|surat|indore|dahej|sanand|gandhinagar)\b/i;
const TLD = { india: /\.in$/, china: /\.cn$/, italy: /\.it$/, spain: /\.es$/, germany: /\.de$/, france: /\.fr$/, switzerland: /\.ch$/, japan: /\.jp$/, 'south korea': /\.kr$/, israel: /\.il$/, 'united kingdom': /\.uk$/ };
const CODE = { india: '91', china: '86', italy: '39', spain: '34', germany: '49', france: '33', switzerland: '41', japan: '81', 'south korea': '82', israel: '972', 'united kingdom': '44', 'united states': '1', bangladesh: '880' };

function cfDecode(hex) { try { const k = parseInt(hex.slice(0, 2), 16); let s = ''; for (let i = 2; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ k); return s; } catch { return ''; } }
const around = (text, i, len) => text.slice(Math.max(0, i - 70), Math.min(text.length, i + len + 70)).replace(/\s+/g, ' ').trim();

export function extractContacts(html, baseUrl) {
  const extra = [];
  [...html.matchAll(/data-cfemail="([0-9a-fA-F]+)"/g), ...html.matchAll(/email-protection#([0-9a-fA-F]+)/g)].forEach(m => { const e = cfDecode(m[1]); if (e.includes('@')) extra.push('[Protected email] ' + e); });
  [...html.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=|whatsapp\.com\/send\?phone=)(\+?\d{8,15})/gi)].forEach(m => extra.push('[WhatsApp link] wa.me/' + m[1].replace('+', '')));
  const site = (html.match(/property=["']og:site_name["'][^>]*content=["']([^"']+)/i) || html.match(/content=["']([^"']+)["'][^>]*property=["']og:site_name/i) || [])[1] || '';
  const { title, text: t0 } = htmlToText(html);
  const text = t0 + (extra.length ? '\n' + [...new Set(extra)].join('\n') : '');
  const emails = new Map(), phones = new Map(), whatsapp = new Map();
  for (const m of text.matchAll(EMAIL)) { const v = m[0].replace(/^mailto:/i, '').toLowerCase(); if (BAD_EMAIL.test(v) || emails.has(v)) continue; emails.set(v, { value: v, excerpt: around(text, m.index, m[0].length) }); }
  for (const m of text.matchAll(/(?:wa\.me\/)(\d{8,15})/g)) { const v = '+' + m[1]; whatsapp.set(v, { value: v, excerpt: around(text, m.index, m[0].length) }); }
  for (const m of text.matchAll(/(?:tel:)?(\+|00)?\(?\d[\d\s().\-\/]{7,22}\d/g)) {
    const raw = m[0]; const digits = raw.replace(/\D/g, ''); const before = text.slice(Math.max(0, m.index - 40), m.index);
    if (/[\/=\w]$/.test(text.slice(Math.max(0, m.index - 1), m.index))) continue;   // part of a URL / word (e.g. wa.me/91…)
    if (digits.length < 10 || digits.length > 14) continue;
    if (/^(19|20)\d{2}/.test(digits) && digits.length <= 12 && !raw.trim().startsWith('+')) continue;   // years / dates
    if (!(raw.startsWith('tel:') || raw.trim().startsWith('+') || raw.trim().startsWith('00') || PHONE_CTX.test(before))) continue;
    if (/fax/i.test(before.slice(-14))) continue;
    const norm = (raw.trim().startsWith('+') || raw.trim().startsWith('00')) ? '+' + digits.replace(/^00/, '') : digits;
    if (phones.has(norm)) continue;
    const ls = text.lastIndexOf('\n', m.index) + 1, le = text.indexOf('\n', m.index + raw.length); const line = text.slice(ls, le < 0 ? text.length : le);
    const wa = /whats\s*app/i.test(line) && !/^\s*\[WhatsApp link\]/.test(line);
    phones.set(norm, { value: raw.replace(/^tel:/, '').trim(), normalized: norm, whatsappMentioned: wa, excerpt: around(text, m.index, raw.length) });
  }
  const links = [...html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m => { try { return { url: new URL(m[1], baseUrl).toString(), label: m[2].replace(/<[^>]+>/g, ' ').trim() }; } catch { return null; } }).filter(Boolean);
  return { title, siteName: site, text, emails: [...emails.values()], phones: [...phones.values()], whatsapp: [...whatsapp.values()], links };
}

const IN_STATES = ['Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh','Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram','Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Tripura','Uttar Pradesh','Uttarakhand','West Bengal','Delhi','Jammu and Kashmir','Puducherry','Chandigarh','Dadra and Nagar Haveli and Daman and Diu'];
const IN_CITIES = { Ahmedabad: 'Gujarat', Gandhinagar: 'Gujarat', Vadodara: 'Gujarat', Baroda: 'Gujarat', Ankleshwar: 'Gujarat', Bharuch: 'Gujarat', Vapi: 'Gujarat', Surat: 'Gujarat', Dahej: 'Gujarat', Sanand: 'Gujarat', Changodar: 'Gujarat', Kadi: 'Gujarat', Mehsana: 'Gujarat', Rajkot: 'Gujarat', Jhagadia: 'Gujarat', Panoli: 'Gujarat', Sarigam: 'Gujarat', Valsad: 'Gujarat', Kalol: 'Gujarat', Anand: 'Gujarat', Nadiad: 'Gujarat', Halol: 'Gujarat', Bavla: 'Gujarat', Moraiya: 'Gujarat', Naroda: 'Gujarat', Vatva: 'Gujarat', Odhav: 'Gujarat',
  Mumbai: 'Maharashtra', Thane: 'Maharashtra', 'Navi Mumbai': 'Maharashtra', Pune: 'Maharashtra', Tarapur: 'Maharashtra', Boisar: 'Maharashtra', Aurangabad: 'Maharashtra', Nashik: 'Maharashtra', Nagpur: 'Maharashtra', Mahad: 'Maharashtra', Roha: 'Maharashtra', Taloja: 'Maharashtra', Ambernath: 'Maharashtra', Dombivli: 'Maharashtra', Palghar: 'Maharashtra', Kurkumbh: 'Maharashtra', Lote: 'Maharashtra',
  Hyderabad: 'Telangana', Secunderabad: 'Telangana', Medak: 'Telangana', Sangareddy: 'Telangana', Patancheru: 'Telangana', Jeedimetla: 'Telangana', Bollaram: 'Telangana', Pashamylaram: 'Telangana',
  Visakhapatnam: 'Andhra Pradesh', Vizag: 'Andhra Pradesh', Vijayawada: 'Andhra Pradesh', Srikakulam: 'Andhra Pradesh', Nellore: 'Andhra Pradesh', Anakapalli: 'Andhra Pradesh', Guntur: 'Andhra Pradesh',
  Bengaluru: 'Karnataka', Bangalore: 'Karnataka', Mysuru: 'Karnataka', Mysore: 'Karnataka', Mangaluru: 'Karnataka', Mangalore: 'Karnataka',
  Chennai: 'Tamil Nadu', Coimbatore: 'Tamil Nadu', Cuddalore: 'Tamil Nadu', Hosur: 'Tamil Nadu', Madurai: 'Tamil Nadu',
  Baddi: 'Himachal Pradesh', Nalagarh: 'Himachal Pradesh', Solan: 'Himachal Pradesh', Paonta: 'Himachal Pradesh', Kala: 'Himachal Pradesh',
  Mohali: 'Punjab', Ludhiana: 'Punjab', Derabassi: 'Punjab', 'Dera Bassi': 'Punjab', Amritsar: 'Punjab',
  Gurugram: 'Haryana', Gurgaon: 'Haryana', Panchkula: 'Haryana', Faridabad: 'Haryana', Sonipat: 'Haryana', Bahadurgarh: 'Haryana',
  'New Delhi': 'Delhi', Delhi: 'Delhi', Noida: 'Uttar Pradesh', Ghaziabad: 'Uttar Pradesh', Lucknow: 'Uttar Pradesh', Kanpur: 'Uttar Pradesh',
  Haridwar: 'Uttarakhand', Dehradun: 'Uttarakhand', Roorkee: 'Uttarakhand', Rudrapur: 'Uttarakhand', Kashipur: 'Uttarakhand',
  Indore: 'Madhya Pradesh', Pithampur: 'Madhya Pradesh', Dewas: 'Madhya Pradesh', Bhopal: 'Madhya Pradesh', Ratlam: 'Madhya Pradesh',
  Jaipur: 'Rajasthan', Bhiwadi: 'Rajasthan', Udaipur: 'Rajasthan', Kolkata: 'West Bengal', Howrah: 'West Bengal', Goa: 'Goa', Verna: 'Goa', Ponda: 'Goa', Kochi: 'Kerala', Cochin: 'Kerala', Bhubaneswar: 'Odisha', Raipur: 'Chhattisgarh', Guwahati: 'Assam', Daman: 'Dadra and Nagar Haveli and Daman and Diu', Silvassa: 'Dadra and Nagar Haveli and Daman and Diu', Jammu: 'Jammu and Kashmir', Sikkim: 'Sikkim', Puducherry: 'Puducherry', Chandigarh: 'Chandigarh' };
const PIN_STATE = [[/^3[6-9]/, 'Gujarat'], [/^403/, 'Goa'], [/^4[0-4]/, 'Maharashtra'], [/^50/, 'Telangana'], [/^5[1-3]/, 'Andhra Pradesh'], [/^5[6-9]/, 'Karnataka'], [/^6[0-4]/, 'Tamil Nadu'], [/^6[7-9]/, 'Kerala'], [/^17/, 'Himachal Pradesh'], [/^1[4-6]/, 'Punjab'], [/^1[23]/, 'Haryana'], [/^11/, 'Delhi'], [/^3[0-4]/, 'Rajasthan'], [/^4[5-8]/, 'Madhya Pradesh'], [/^49/, 'Chhattisgarh'], [/^7[0-4]/, 'West Bengal'], [/^7[5-7]/, 'Odisha'], [/^2[0-3]|^2[78]/, 'Uttar Pradesh'], [/^396[12]/, 'Dadra and Nagar Haveli and Daman and Diu']];
const ADDR = /(plot|gidc|midc|apiic|sipcot|kiadb|road|rd\.|dist|district|taluka|tal\.|village|estate|industrial|address|office|works|factory|plant|unit|phase|sector|pin|india)/i;
const reEsc = x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CITY_RE = new RegExp('\\b(' + Object.keys(IN_CITIES).sort((a, b) => b.length - a.length).map(reEsc).join('|') + ')\\b', 'gi');
const STATE_RE = new RegExp('\\b(' + IN_STATES.sort((a, b) => b.length - a.length).map(reEsc).join('|') + ')\\b', 'gi');
const titleCase = x => Object.keys(IN_CITIES).find(k => k.toLowerCase() === x.toLowerCase()) || x;
export function indiaPlace(text) {
  const lines = String(text || '').split('\n');
  const score = l => (ADDR.test(l) ? 2 : 0) + (/\b[1-8]\d{2}\s?\d{3}\b/.test(l) ? 2 : 0);
  let best = null;
  for (const l of lines) {
    const sc = score(l); if (!sc) continue;
    const cm = [...l.matchAll(CITY_RE)][0], sm = [...l.matchAll(STATE_RE)][0];
    let state = sm ? IN_STATES.find(s => s.toLowerCase() === sm[1].toLowerCase()) : '';
    const city = cm ? titleCase(cm[1]) : '';
    if (!state && city) state = IN_CITIES[city] || '';
    if (!state) { const pin = (l.match(/\b([1-8]\d{2})\s?(\d{3})\b/) || []); if (pin[0] && /india|pin/i.test(l)) { const p = pin[1] + pin[2]; const hit = PIN_STATE.find(([re]) => re.test(p)); if (hit) state = hit[1]; } }
    if (state || city) { const cand = { state, city, sc: sc + (state ? 1 : 0) + (city ? 1 : 0) }; if (!best || cand.sc > best.sc) best = cand; }
  }
  if (!best) { const cm = [...String(text).matchAll(CITY_RE)][0]; if (cm) { const city = titleCase(cm[1]); best = { city, state: IN_CITIES[city] || '' }; } }
  return best ? { state: best.state || '', city: best.city || '' } : { state: '', city: '' };
}
export const INDIA_STATES = IN_STATES;

export function countryCheck(country, { domain, text, phones }) {
  const c = String(country || '').toLowerCase(); if (!c || c === 'any') return { match: null, reasons: [] };
  const reasons = [];
  if (TLD[c] && TLD[c].test(domain)) reasons.push(`.${domain.split('.').pop()} domain`);
  const code = CODE[c]; if (code && phones.some(p => String(p.normalized || '').replace('+', '').startsWith(code) && String(p.normalized).startsWith('+'))) reasons.push(`+${code} phone`);
  let place = { state: '', city: '' };
  if (c === 'india') { place = indiaPlace(text); const s = (text.match(STATES) || [])[0]; if (place.state || place.city) reasons.push('Indian address (' + [place.city, place.state].filter(Boolean).join(', ') + ')'); else if (s) reasons.push('Indian address (' + s + ')'); }
  else if (new RegExp('\\b' + c + '\\b', 'i').test(text)) reasons.push('mentions ' + country);
  return { match: reasons.length > 0, reasons, state: place.state, city: place.city };
}

export async function crawlCompany(url, { country = '', maxPages = 5, budgetMs = 25000 } = {}) {
  const t0 = Date.now(); const start = new URL(/^https?:/i.test(url) ? url : 'https://' + url);
  const home = start.origin + '/'; const host = start.hostname.replace(/^www\./, '');
  const queue = [...new Set([start.toString(), home])], done = new Set(), pages = [], errors = [];
  const emails = new Map(), phones = new Map(), whatsapp = new Map(); let siteName = '', homeTitle = '';
  while (queue.length && pages.length < maxPages && Date.now() - t0 < budgetMs) {
    const u = queue.shift(); if (done.has(u)) continue; done.add(u);
    try {
      const r = await fetchRaw(u, { timeout: 10000, maxBytes: 2e6 });
      if (!/html|text/.test(r.contentType) && !/<html/i.test(r.html.slice(0, 500))) continue;
      const x = extractContacts(r.html, r.finalUrl);
      if (!siteName && x.siteName) siteName = x.siteName; if (u === home) homeTitle = x.title;
      pages.push({ url: r.finalUrl, title: x.title, text: x.text.slice(0, 40000) });
      x.emails.forEach(e => !emails.has(e.value) && emails.set(e.value, { ...e, url: r.finalUrl }));
      x.phones.forEach(p => { const k = p.normalized; const prev = phones.get(k); if (!prev) phones.set(k, { ...p, url: r.finalUrl }); else if (p.whatsappMentioned) prev.whatsappMentioned = true; });
      x.whatsapp.forEach(w => !whatsapp.has(w.value) && whatsapp.set(w.value, { ...w, url: r.finalUrl }));
      if (pages.length <= 2) x.links.filter(l => { try { return new URL(l.url).hostname.replace(/^www\./, '') === host && (CONTACT_LINK.test(l.url) || CONTACT_LINK.test(l.label)); } catch { return false; } })
        .map(l => l.url.split('#')[0]).filter(l => !done.has(l)).slice(0, 4).forEach(l => queue.push(l));
    } catch (e) { errors.push({ url: u, error: e.message }); }
  }
  const all = pages.map(p => p.text).join('\n');
  const ph = [...phones.values()];
  const emailList = [...emails.values()].sort((a, b) => (b.value.endsWith('@' + host) ? 1 : 0) - (a.value.endsWith('@' + host) ? 1 : 0));
  return { domain: host, siteName: (siteName || cleanName(homeTitle)).slice(0, 90), pages, emails: emailList, phones: ph, whatsapp: [...whatsapp.values()], country: countryCheck(country, { domain: host, text: all, phones: ph }), errors, ms: Date.now() - t0 };
}
