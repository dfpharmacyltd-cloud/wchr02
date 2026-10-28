// WhatsApp via WATI (official WhatsApp Business API provider).
// Business-initiated messages MUST use a WhatsApp-approved template. A 200 means "accepted by WATI", not delivered.
const BASE = () => String(process.env.WATI_API_ENDPOINT || '').replace(/\/$/, '');
const TOKEN = () => String(process.env.WATI_ACCESS_TOKEN || '').replace(/^Bearer\s+/i, '');
export const configured = () => !!(BASE() && TOKEN());
class WErr extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
async function call(method, path, body) {
  if (!configured()) throw new WErr('WATI is not configured (WATI_API_ENDPOINT and WATI_ACCESS_TOKEN)');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 20000);
  let res;
  try { res = await fetch(BASE() + path, { method, signal: ctl.signal, headers: { Authorization: 'Bearer ' + TOKEN(), 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { throw new WErr('Could not reach WATI: ' + (e.name === 'AbortError' ? 'timed out' : e.message), 502); }
  finally { clearTimeout(t); }
  const text = await res.text(); let d = {}; try { d = JSON.parse(text); } catch { d = { raw: text.slice(0, 200) }; }
  if (!res.ok) throw new WErr('WATI: ' + (d.message || d.info || d.error || 'HTTP ' + res.status), res.status === 401 ? 400 : 502);
  return d;
}
export async function templates() {
  const d = await call('GET', '/api/v1/getMessageTemplates?pageSize=200&pageNumber=1');
  const list = d.messageTemplates || d.result || d.data || [];
  return list.map(t => {
    const body = t.bodyOriginal || t.body || '';
    const params = (t.customParams && t.customParams.length ? t.customParams.map(p => p.paramName) : [...String(body).matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(m => m[1]));
    return { name: t.elementName || t.name, status: String(t.status || '').toUpperCase(), category: t.category || '', language: (t.language && (t.language.value || t.language.key)) || t.language || '', body, params: [...new Set(params)] };
  }).filter(t => t.name);
}
export const normNumber = n => String(n || '').replace(/\D/g, '').replace(/^00/, '');
export async function sendTemplate({ number, template, params = [], broadcast = 'WESTCOAST RFQ' }) {
  const num = normNumber(number);
  if (num.length < 10 || num.length > 15) throw new WErr('Invalid WhatsApp number (include country code, e.g. 91XXXXXXXXXX)');
  if (!template) throw new WErr('Choose an approved WhatsApp template');
  const d = await call('POST', `/api/v2/sendTemplateMessage?whatsappNumber=${num}`, { template_name: template, broadcast_name: broadcast, parameters: params.map(p => ({ name: String(p.name), value: String(p.value ?? '') })) });
  if (d.result === false) throw new WErr('WATI refused the message: ' + (d.info || d.message || 'unknown reason'));
  return { accepted: true, number: num, localMessageId: d.localMessageId || (d.message && d.message.localMessageId) || '', at: new Date().toISOString(), response: { result: d.result ?? true, info: d.info || '' } };
}
