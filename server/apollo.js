// Apollo.io provider adapter (official REST API, x-api-key header).
// Docs: https://docs.apollo.io  — endpoints used:
//   POST /api/v1/mixed_companies/search     organization search (leads)
//   POST /api/v1/mixed_people/api_search    people search (no credits, no emails)
//   POST /api/v1/people/bulk_match          enrichment, up to 10 per call (consumes credits, returns work email)
//   GET  /api/v1/auth/health                key check
const BASE = () => (process.env.APOLLO_BASE_URL || 'https://api.apollo.io').replace(/\/$/, '') + '/api/v1';
const KEY = () => process.env.APOLLO_API_KEY || '';
export const configured = () => !!KEY();

class ApolloError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

async function call(method, pathname, body, query) {
  if (!configured()) throw new ApolloError('APOLLO_API_KEY is not set in .env', 400);
  const url = new URL(BASE() + pathname);
  Object.entries(query || {}).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
  let res;
  try {
    res = await fetch(url, { method, signal: ctl.signal, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-api-key': KEY() }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { throw new ApolloError('Could not reach Apollo: ' + (e.name === 'AbortError' ? 'timed out' : e.message), 502); }
  finally { clearTimeout(t); }
  const text = await res.text(); let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = data.error || data.message || data.error_message || (res.status === 401 ? 'Apollo rejected the API key' : res.status === 403 ? 'This Apollo key/plan has no access to ' + pathname : res.status === 429 ? 'Apollo rate limit reached — wait and retry' : 'Apollo HTTP ' + res.status);
    throw new ApolloError(String(msg), res.status);
  }
  const usage = {};
  ['x-minute-usage', 'x-minute-requests-left', 'x-hourly-requests-left', 'x-24-hour-requests-left', 'x-rate-limit-minute', 'x-rate-limit-hourly'].forEach(h => { const v = res.headers.get(h); if (v) usage[h] = v; });
  return { data, status: res.status, usage, at: new Date().toISOString() };
}
const arr = v => (Array.isArray(v) ? v : String(v || '').split(/[\n,;]+/)).map(s => String(s).trim()).filter(Boolean);
const dom = u => { try { return new URL(/^https?:/.test(u) ? u : 'https://' + u).hostname.replace(/^www\./, ''); } catch { return ''; } };

export async function health() { return call('GET', '/auth/health'); }

export async function companies({ keywords, locations, page = 1, perPage = 25 }) {
  const body = { page: Math.max(1, +page || 1), per_page: Math.min(100, Math.max(1, +perPage || 25)) };
  if (arr(keywords).length) body.q_organization_keyword_tags = arr(keywords);
  if (arr(locations).length) body.organization_locations = arr(locations);
  const r = await call('POST', '/mixed_companies/search', body);
  const list = [...(r.data.organizations || []), ...(r.data.accounts || [])];
  const seen = new Set();
  const items = list.map(o => ({
    apolloId: o.id || o.organization_id || '', name: o.name || '', website: o.website_url || '', domain: o.primary_domain || dom(o.website_url || ''),
    country: o.country || '', city: o.city || '', state: o.state || '', industry: o.industry || '', employees: o.estimated_num_employees || '',
    linkedin: o.linkedin_url || '', phone: (o.primary_phone && (o.primary_phone.sanitized_number || o.primary_phone.number)) || o.phone || '', founded: o.founded_year || ''
  })).filter(o => o.name && !seen.has(o.apolloId || o.name) && seen.add(o.apolloId || o.name));
  return { items, total: (r.data.pagination && r.data.pagination.total_entries) || items.length, request: body, status: r.status, usage: r.usage, at: r.at };
}

export async function people({ domains, organizationIds, titles, seniorities, locations, page = 1, perPage = 25 }) {
  const body = { page: Math.max(1, +page || 1), per_page: Math.min(100, Math.max(1, +perPage || 25)), include_similar_titles: true };
  if (arr(domains).length) body.q_organization_domains_list = arr(domains).map(dom).filter(Boolean);
  if (arr(organizationIds).length) body.organization_ids = arr(organizationIds);
  if (arr(titles).length) body.person_titles = arr(titles);
  if (arr(seniorities).length) body.person_seniorities = arr(seniorities);
  if (arr(locations).length) body.person_locations = arr(locations);
  if (!body.q_organization_domains_list && !body.organization_ids) throw new ApolloError('Pick at least one company domain to search people in.', 400);
  const r = await call('POST', '/mixed_people/api_search', body);
  const items = (r.data.people || []).map(p => ({
    apolloId: p.id, firstName: p.first_name || '', lastName: p.last_name || p.last_name_obfuscated || '', title: p.title || '', hasEmail: p.has_email === true || p.has_email === 'true',
    city: p.city || '', country: p.country || '', orgName: (p.organization && p.organization.name) || '', orgDomain: (p.organization && (p.organization.primary_domain || dom(p.organization.website_url || ''))) || ''
  })).filter(p => p.apolloId);
  return { items, total: (r.data.pagination && r.data.pagination.total_entries) || r.data.total_entries || items.length, request: body, status: r.status, usage: r.usage, at: r.at };
}

export async function enrich({ ids }) {
  const list = arr(ids).slice(0, 100);
  if (!list.length) throw new ApolloError('No people selected', 400);
  const out = [], calls = [];
  for (let i = 0; i < list.length; i += 10) {
    const chunk = list.slice(i, i + 10);
    const r = await call('POST', '/people/bulk_match', { details: chunk.map(id => ({ id })) }, { reveal_personal_emails: 'false', reveal_phone_number: 'false' });
    calls.push({ status: r.status, at: r.at, requested: chunk.length, matched: (r.data.matches || []).filter(Boolean).length, creditsConsumed: r.data.credits_consumed ?? null, uniqueEnriched: r.data.unique_enriched_records ?? null, usage: r.usage });
    (r.data.matches || []).forEach(m => { if (!m) return; const o = m.organization || {};
      out.push({ apolloId: m.id, name: m.name || [m.first_name, m.last_name].filter(Boolean).join(' '), title: m.title || '', email: m.email || '', emailStatus: m.email_status || '', linkedin: m.linkedin_url || '',
        city: m.city || '', country: m.country || '', orgName: o.name || m.organization_name || '', orgDomain: o.primary_domain || dom(o.website_url || ''), orgWebsite: o.website_url || '', orgCountry: o.country || '',
        orgPhone: (o.primary_phone && (o.primary_phone.sanitized_number || o.primary_phone.number)) || o.phone || '' }); });
  }
  return { items: out, calls };
}
