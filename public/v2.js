"use strict";
/* WESTCOAST AI Procurement Agent — v2 module
   Login & users · one-click "Find suppliers" · website email/phone finder · Google fallback
   · Outlook (Graph) drafts & send · WhatsApp via WATI · backups · light UI */
(function () {
  let ME = null, AUTH = null;
  const COUNTRIES = ['India', 'China', 'Italy', 'Spain', 'Germany', 'France', 'Switzerland', 'United States', 'United Kingdom', 'Japan', 'South Korea', 'Israel', 'Bangladesh', 'Any'];
  const SENDER = 'WESTCOAST PHARMACEUTICAL WORKS LTD.';
  const IN_STATES = ['Andhra Pradesh','Assam','Bihar','Chandigarh','Chhattisgarh','Dadra and Nagar Haveli and Daman and Diu','Delhi','Goa','Gujarat','Haryana','Himachal Pradesh','Jammu and Kashmir','Jharkhand','Karnataka','Kerala','Madhya Pradesh','Maharashtra','Odisha','Puducherry','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana','Uttar Pradesh','Uttarakhand','West Bengal'];
  const isAdmin = () => ME && ME.role === 'admin';
  const canWrite = () => ME && ME.role !== 'viewer';

  /* ---------- API with session + CSRF header ---------- */
  api = async function (method, url, body) {
    const r = await fetch(url, { method, credentials: 'same-origin', headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), 'X-WCPA': '1' }, body: body ? JSON.stringify(body) : undefined });
    let d = null; try { d = await r.json(); } catch {}
    if (r.status === 401 && !url.startsWith('/api/auth')) { showAuth(); }
    if (!r.ok) { const e = new Error((d && d.error) || ('Server answered HTTP ' + r.status)); e.status = r.status; e.tried = d && d.tried; throw e; }
    return d;
  };
  reviewer = () => (ME && ME.name) || 'User';
  RFQ_STATUS.drafted = ['Draft created in Outlook', 'ind'];
  RFQ_STATUS.wa_sent = ['WhatsApp accepted by WATI', 'ok'];
  if (!SOURCE_TYPES.includes('Company website (finder)')) SOURCE_TYPES.push('Company website (finder)');
  RELIABILITY['Company website (finder)'] = 'Supplier claim';

  /* ---------- Navigation ---------- */
  const IC = {
    find: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3M8 11h6M11 8v6', send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z', users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', backups: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5M12 7v5l3 2'
  };
  NAV.length = 0;
  NAV.push(
    ['Find & verify', [['find', 'Find suppliers', IC.find], ['dashboard', 'Dashboard', 'M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z'], ['prs', 'Purchase requests', 'M9 2h6l1 3h4v17H4V5h4zM8 11h8M8 15h6'], ['suppliers', 'Verification centre', 'M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5zM9 12l2 2 4-4'], ['shortlist', 'Shortlists', 'M4 6h16M4 12h10M4 18h7']]],
    ['Outreach', [['send', 'Send inquiry', IC.send], ['rfq', 'RFQ drafts', 'M3 5h18v14H3zM3 6l9 7 9-7'], ['replies', 'Supplier replies', 'M10 9V5l-7 7 7 7v-4c5 0 8 1.5 11 5-1-6-4-11-11-11']]],
    ['Advanced', [['discovery', 'Evidence research', 'M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3'], ['apollo', 'Apollo lead finder', 'M4 20 12 4l8 16M7.5 13h9'], ['reports', 'Reports & exports', 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h6'], ['audit', 'Audit log', 'M12 8v4l3 2M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5']]],
    ['Admin', [['users', 'Users', IC.users], ['backups', 'Backups', IC.backups], ['integrations', 'Integrations', 'M8 3v6M16 3v6M5 9h14v3a7 7 0 0 1-14 0zM12 19v3'], ['settings', 'Settings', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z']]]
  );
  renderNav = function () {
    const c = counts();
    const hide = new Set(isAdmin() ? [] : ['users', 'backups']);
    $('#nav').innerHTML = NAV.map(([g, items]) => { const its = items.filter(i => !hide.has(i[0])); return its.length ? `<div class="navgrp">${g}</div>` + its.map(([k, l, d]) => `<button data-go="${k}" ${UI.view === k || (UI.view === 'supplier' && k === 'suppliers') || (UI.view === 'pr' && k === 'prs') ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>${l}${k === 'suppliers' && c.suppliers ? `<span class="cnt">${c.suppliers}</span>` : ''}${k === 'replies' && c.replies ? `<span class="cnt" title="Unmatched">${c.replies}</span>` : ''}</button>`).join('') : ''; }).join('');
    const h = [['Claude', HEALTH.claude], ['Google', HEALTH.gemini || HEALTH.serper], ['Apollo', HEALTH.apollo], ['Outlook', HEALTH.outlookConnected], ['WhatsApp', HEALTH.wati]];
    $('#health').innerHTML = h.map(([n, ok]) => `<span title="${n}: ${ok ? 'connected' : 'not connected'}" style="display:inline-flex;align-items:center;gap:5px;margin-right:8px"><i class="dot ${ok ? 'ok' : 'off'}"></i>${n}</span>`).join('');
  };

  /* ---------- Auth screens ---------- */
  async function showAuth(st) {
    document.body.classList.add('auth-mode');
    try { AUTH = st || await api('GET', '/api/auth/state'); } catch (e) { AUTH = { needsSetup: false, error: e.message }; }
    const setup = AUTH.needsSetup;
    $('#main').innerHTML = `<div class="auth-wrap"><div class="auth-card pop">
      <img src="/logo.png" alt="West-Coast Pharmaceutical Works Ltd." class="auth-logo">
      <h1>${setup ? 'Create the administrator' : 'Sign in'}</h1>
      <p class="muted">${setup ? 'First time on this server. The administrator can add the rest of the team later.' : 'WESTCOAST AI Procurement Agent'}</p>
      ${AUTH.secretOk === false ? '<div class="note bad">SESSION_SECRET is missing on the server. Add it (32+ random characters) to the environment variables and redeploy.</div>' : ''}
      ${AUTH.error ? `<div class="note bad">${esc(AUTH.error)}</div>` : ''}
      <form data-submit="${setup ? 'authSetup' : 'authLogin'}" class="auth-form">
        ${setup ? '<label class="f">Your name<input name="name" required autocomplete="name"></label>' : ''}
        <label class="f">Email<input name="email" type="email" required autocomplete="email"></label>
        <label class="f">Password<input name="password" type="password" required minlength="${setup ? 8 : 1}" autocomplete="${setup ? 'new-password' : 'current-password'}"></label>
        ${setup && AUTH.setupKeyRequired ? '<label class="f">Setup key <span class="hint">the ADMIN_SETUP_KEY value from your server settings</span><input name="setupKey" required></label>' : ''}
        <button class="btn primary big">${setup ? 'Create administrator' : 'Sign in'}</button>
      </form></div></div>`;
    const f = $('.auth-form input'); f && f.focus();
  }
  Object.assign(SUBMIT, {
    authLogin: async (f, fd) => { try { await api('POST', '/api/auth/login', { email: fd.get('email'), password: fd.get('password') }); location.hash = ''; boot(); } catch (e) { toast(e.message, 'err'); } },
    authSetup: async (f, fd) => { try { await api('POST', '/api/auth/setup', { name: fd.get('name'), email: fd.get('email'), password: fd.get('password'), setupKey: fd.get('setupKey') || '' }); boot(); } catch (e) { toast(e.message, 'err'); } },
    changePass: async (f, fd) => { try { await api('POST', '/api/auth/password', { current: fd.get('current'), next: fd.get('next') }); ME.mustChange = false; closeModal(); toast('Password changed'); } catch (e) { toast(e.message, 'err'); } }
  });
  A.userMenu = () => modal(`<h2>${esc(ME.name)}</h2><p class="muted">${esc(ME.email)} · ${esc(ME.role)}</p>
    <form data-submit="changePass"><h3>Change password</h3><div class="form" style="grid-template-columns:1fr 1fr"><label class="f">Current password<input name="current" type="password" required autocomplete="current-password"></label><label class="f">New password (8+)<input name="next" type="password" required minlength="8" autocomplete="new-password"></label></div>
    <div class="row" style="margin-top:14px"><button class="btn primary">Change password</button><span class="spacer"></span><button class="btn danger" type="button" data-act="logout">Sign out</button></div></form>`);
  A.logout = async () => { try { await api('POST', '/api/auth/logout'); } catch {} closeModal(); ME = null; showAuth(); };

  /* ---------- Boot ---------- */
  boot = async function () {
    let st = null;
    try { st = await api('GET', '/api/auth/state'); } catch (e) { $('#main').innerHTML = `<div class="panel" style="margin:40px auto;max-width:640px">${emptyBox('Cannot reach the procurement server', esc(e.message))}</div>`; return; }
    try { ME = (await api('GET', '/api/auth/me')).user; if (!ME) return showAuth(st); } catch (e) { if (e.status === 401) return showAuth(st); $('#main').innerHTML = `<div class="panel" style="margin:40px auto;max-width:640px">${emptyBox('Server setup needed', esc(e.message))}</div>`; return; }
    document.body.classList.remove('auth-mode');
    try {
      HEALTH = await api('GET', '/api/health');
      const data = await api('GET', '/api/data'); COLLS.forEach(c => S[c] = data[c] || []); if (!S.campaigns) S.campaigns = data.campaigns || [];
    } catch (e) { toast(e.message, 'err'); return; }
    MODE = 'db'; SAMPLE = !!HEALTH.ai;
    $('#whoName').textContent = ME.name; $('#avatar').textContent = (ME.name[0] || '·').toUpperCase();
    $('#avatar').setAttribute('data-act', 'userMenu'); $('#avatar').style.cursor = 'pointer'; $('#whoName').setAttribute('data-act', 'userMenu'); $('#whoName').style.cursor = 'pointer';
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('outlook') === 'connected') { toast('Outlook connected'); UI.view = 'integrations'; history.replaceState(null, '', '/'); }
    else if (h.get('outlook') === 'error') { toast('Outlook: ' + (h.get('msg') || 'connection failed'), 'err'); UI.view = 'integrations'; history.replaceState(null, '', '/'); }
    else UI.view = UI.view && UI.view !== 'dashboard' ? UI.view : 'find';
    UI.justNav = true; render();
    if (ME.mustChange) setTimeout(() => { A.userMenu(); toast('Please set your own password.'); }, 400);
  };
  if (!COLLS.includes('campaigns')) { COLLS.push('campaigns'); S.campaigns = []; }

  /* ================= FIND SUPPLIERS (one click) ================= */
  const F = { running: false, steps: [], prId: null, log: [], quiet: false };
  const _toast = toast; toast = (m, k) => { if (F.quiet && k !== 'err') return; _toast(m, k); };
  const STEP_DEF = [['apollo', 'Apollo company search'], ['web', 'Web search'], ['sites', 'Read company websites for email & phone'], ['verify', 'Check the API on each website (AI)'], ['emails', 'Find missing emails (Apollo)'], ['done', 'Final list']];
  function stepHTML() {
    if (!F.steps.length) return '';
    return `<ol class="runsteps">${F.steps.map(s => `<li class="rs ${s.status}"><span class="rs-dot">${s.status === 'done' ? '✓' : s.status === 'error' ? '!' : s.status === 'skip' ? '–' : ''}</span><div><strong>${esc(s.label)}</strong><div class="rs-d">${esc(s.detail || (s.status === 'run' ? 'Working…' : s.status === 'wait' ? 'Waiting' : ''))}</div></div></li>`).join('')}</ol>`;
  }
  function setStep(key, status, detail) { const s = F.steps.find(x => x.key === key); if (s) { s.status = status; if (detail !== undefined) s.detail = detail; } const el = $('#runsteps'); if (el) el.innerHTML = stepHTML(); }
  function waNumberOf(s) {
    const cs = contactsOf(s.id).filter(c => c.kind !== 'email' && !['rejected', 'conflict'].includes(c.decision));
    const ok = n => { const d = String(n || '').replace(/\D/g, ''); if (!String(n).startsWith('+')) return false; if (d.startsWith('91')) return /^91[6-9]\d{9}$/.test(d); return d.length >= 10 && d.length <= 15; };
    const pref = cs.find(c => ['official', 'manual'].includes(c.wa) && ok(c.normalized)) || cs.find(c => c.kind === 'whatsapp' && ok(c.normalized)) || cs.find(c => ok(c.normalized));
    return pref ? pref.normalized : '';
  }
  const phoneOf = s => { const c = contactsOf(s.id).find(c => c.kind !== 'email' && c.decision !== 'rejected'); return c ? (c.normalized || c.value) : ''; };
  function upsertCompany({ name, domain, website, country, origin, pr, apolloId }) {
    let s = apSupplierFor(domain, name);
    if (!s) { s = { id: uid('sup'), name: name || domain, normName: normName(name || domain), website: website || (domain ? 'https://' + domain : ''), domain: (domain || '').toLowerCase(), country: country || '', address: '', type: 'Unknown', origin, apolloId: apolloId || '', prIds: [], qa: { status: 'pending' }, createdAt: nowISO(), notes: '' }; }
    else { if (!s.website && website) s.website = website; if (!s.country && country) s.country = country; if (!s.domain && domain) s.domain = domain.toLowerCase(); if ((!s.name || s.name === s.domain) && name) { s.name = name; s.normName = normName(name); } }
    if (pr && !s.prIds.includes(pr.id)) s.prIds.push(pr.id);
    persist('suppliers', s); return s;
  }
  function saveCrawl(s, pr, cr) {
    const used = new Set([...(cr.emails || []), ...(cr.phones || []), ...(cr.whatsapp || [])].map(x => x.url));
    const srcByUrl = {};
    cr.pages.forEach((p, i) => {
      if (i > 0 && !used.has(p.url)) return;
      const ex = S.sources.find(x => x.url === p.url && x.supplierId === s.id); if (ex) { srcByUrl[p.url] = ex; return; }
      const src = { id: uid('src'), prId: pr.id, supplierId: s.id, url: p.url, type: 'Company website (finder)', title: p.title || s.name, text: p.text.slice(0, 25000), retrievedAt: nowISO(), addedBy: reviewer() + ' (website finder)', createdAt: nowISO(), extractedAt: nowISO() };
      persist('sources', src); srcByUrl[p.url] = src;
    });
    let ne = 0, np = 0;
    const has = v => contactsOf(s.id).some(c => c.normalized === v);
    (cr.emails || []).forEach(e => { const src = srcByUrl[e.url]; if (!src || has(e.value)) return; persist('contacts', { id: uid('ct'), supplierId: s.id, sourceId: src.id, kind: 'email', value: e.value, normalized: e.value, person: '', designation: '', excerpt: e.excerpt, found: excerptFound(e.excerpt, src.text) && normText(src.text).includes(e.value.slice(0, 6)), decision: 'pending', provider: 'Company website', retrievedAt: nowISO(), createdAt: nowISO() }); ne++; });
    [...(cr.whatsapp || []).map(w => ({ ...w, normalized: w.value, wa: true })), ...(cr.phones || [])].forEach(p => {
      const src = srcByUrl[p.url]; if (!src) return;
      const n = String(p.normalized || '').startsWith('+') ? p.normalized : normPhone(p.value, s.country).normalized; if (!n || has(n)) return;
      const isWa = p.wa || p.whatsappMentioned;
      persist('contacts', { id: uid('ct'), supplierId: s.id, sourceId: src.id, kind: isWa ? 'whatsapp' : 'phone', value: p.value, normalized: n, code: '', person: '', designation: '', excerpt: p.excerpt, found: excerptFound(p.excerpt, src.text), decision: 'pending', wa: isWa && /whats\s*app/i.test(p.excerpt) ? 'official' : 'found', provider: 'Company website', retrievedAt: nowISO(), createdAt: nowISO() }); np++;
    });
    return { ne, np, firstSrc: srcByUrl[cr.pages[0] && cr.pages[0].url] };
  }
  async function pool(items, n, fn) { let i = 0; const run = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }; await Promise.all(Array.from({ length: Math.min(n, items.length) }, run)); }

  function placeOf(s) { return { state: s.state || '', city: s.city || '' }; }
  async function runFind(o) {
    if (F.running) return;
    F.running = true; F.steps = STEP_DEF.map(([key, label]) => ({ key, label, status: 'wait', detail: '' })); F.log = [];
    startJob('Finding suppliers');
    const country = o.country, strict = o.strict && country !== 'Any', N = o.n;
    const pr = { id: uid('pr'), code: nextPRCode(), api: o.api, synonyms: o.synonyms, qty: o.qty, unit: o.unit, pharmacopoeia: o.pharmacopoeia, countries: country === 'Any' ? '' : country, state: o.state || '', city: o.city || '', preference: 'Actual manufacturer first', docsRequired: 'GMP certificate, COA, DMF / CEP', destination: 'Ahmedabad, Gujarat, India', owner: reviewer(), status: 'active', shortlist: [], createdAt: nowISO(), quick: true };
    persist('prs', pr); audit('Created purchase request (Find suppliers)', 'pr', pr.id, `${pr.code} ${pr.api} ${pr.qty} ${pr.unit} — ${[o.city, o.state, country].filter(Boolean).join(', ')} — ${N} wanted`);
    F.prId = UI.prId = pr.id; render();
    const FIRST = new Map(), seen = new Set(), kept = [], excluded = [];
    let apolloPage = 1, apolloMore = !!(o.useApollo && HEALTH.apollo), webMore = !!(o.useWeb && HEALTH.webSearch), round = 0, nApollo = 0, nWeb = 0, crawled = 0;
    const want = () => N - kept.length;
    try {
      while (want() > 0 && (apolloMore || webMore) && round < 6) {
        const batch = new Map();
        const add = (d, v) => { d = String(d || '').toLowerCase(); if (!d || seen.has(d)) return; const cur = batch.get(d) || { domain: d, origins: [] }; batch.set(d, { ...cur, ...Object.fromEntries(Object.entries(v).filter(([, x]) => x)), origins: [...new Set([...cur.origins, ...(v.origins || [])])] }); };
        // Apollo
        if (apolloMore) {
          setStep('apollo', 'run', `page ${apolloPage}…`);
          try { const per = Math.min(100, Math.max(25, want() * 2)); const r = await api('POST', '/api/apollo/companies', { keywords: [o.api, ...(o.synonyms ? o.synonyms.split(',') : []), 'active pharmaceutical ingredient', 'api manufacturer'].join(','), locations: country === 'Any' ? '' : [o.city, o.state, country].filter(Boolean).join(', '), perPage: per, page: apolloPage });
            AP.cAt = nowISO(); AP.cReq = r.request; r.items.forEach(c => add(c.domain, { name: c.name, website: c.website, country: c.country, state: c.state, city: c.city, phone: c.phone, apolloId: c.apolloId, origins: ['Apollo'], apollo: c }));
            nApollo += r.items.length; apolloMore = r.items.length >= per && apolloPage < 5; apolloPage++;
            setStep('apollo', apolloMore ? 'run' : 'done', `${nApollo} companies from Apollo`); }
          catch (e) { apolloMore = false; setStep('apollo', 'error', e.message); }
        } else if (round === 0) setStep('apollo', 'skip', HEALTH.apollo ? 'Turned off' : 'Apollo key not configured');
        // Web
        if (webMore) {
          setStep('web', 'run', `search round ${round + 1}…`);
          try { const r = await api('POST', '/api/search/companies', { api: o.api, synonyms: o.synonyms, country, state: o.state, city: o.city, strict, n: Math.max(10, want() * 2), provider: o.provider, exclude: [...seen, ...batch.keys()], round });
            const before = batch.size; r.candidates.forEach(c => add(c.domain, { name: c.company, website: c.url, pageUrl: c.url, origins: [c.provider] }));
            nWeb += batch.size - before; if (batch.size - before === 0) webMore = false;
            setStep('web', webMore ? 'run' : 'done', `${nWeb} company websites in ${round + 1} round(s) · ` + (r.tried || []).map(x => `${x.provider}: ${x.ok ? '+' + x.added : x.skipped || 'failed'}`).join(' · ')); }
          catch (e) { if (round === 0) setStep('web', 'error', e.message); else setStep('web', 'done', `${nWeb} company websites`); webMore = false; }
        } else if (round === 0) setStep('web', 'skip', HEALTH.webSearch ? 'Turned off' : 'No search provider configured (Claude, Gemini or Serper)');
        round++;
        const list = [...batch.values()].filter(c => c.domain || c.website);
        list.forEach(c => seen.add(c.domain));
        if (!list.length) continue;
        // Read websites
        setStep('sites', 'run', `${crawled} read · ${kept.length}/${N} kept`);
        await pool(list, 3, async c => {
          if (want() <= 0) return;
          const s = upsertCompany({ name: c.name, domain: c.domain, website: c.website, country: c.country, origin: c.origins.includes('Apollo') ? 'apollo' : 'evidence', pr, apolloId: c.apolloId });
          if (c.state && !s.state) s.state = c.state; if (c.city && !s.city) s.city = c.city;
          if (c.apollo && !contactsOf(s.id).length) apImportCompanies([c.apollo], pr);
          let cr = null;
          try { cr = await api('POST', '/api/finder/crawl', { url: c.pageUrl || c.website || ('https://' + c.domain), country: country === 'Any' ? '' : country }); }
          catch (e) { F.log.push(`${c.domain}: ${e.message}`); }
          let inCountry = null, reasons = [];
          if (cr) {
            const r = saveCrawl(s, pr, cr); if (r.firstSrc) FIRST.set(s.id, r.firstSrc);
            if (cr.siteName && (!s.name || s.name === s.domain || s.name.length < 3)) { s.name = cr.siteName; s.normName = normName(s.name); }
            inCountry = cr.country.match; reasons = cr.country.reasons;
            if (cr.country.state && !s.state) s.state = cr.country.state; if (cr.country.city && !s.city) s.city = cr.country.city;
            if (!s.country && inCountry && country !== 'Any') s.country = country;
            if (!cr.pages.length) F.log.push(`${c.domain}: ${(cr.errors[0] || {}).error || 'no readable pages'}`);
          }
          if (c.country && country !== 'Any' && normText(c.country) === normText(country)) { inCountry = true; reasons.push('Apollo: ' + [c.city, c.state, c.country].filter(Boolean).join(', ')); }
          s.finder = { at: nowISO(), pages: cr ? cr.pages.length : 0, reasons, error: cr && cr.pages.length ? '' : 'Website could not be read' };
          let why = '';
          if (strict && inCountry !== true) why = reasons.length ? reasons.join(', ') : `No ${country} signal found (domain, phone or address)`;
          else if (o.state && normText(s.state) !== normText(o.state)) why = s.state ? `In ${s.state}, not ${o.state}` : `State not found on website (wanted ${o.state})`;
          if (why) { excluded.push({ id: s.id, reason: why }); s.prIds = s.prIds.filter(x => x !== pr.id); }
          else if (want() > 0) kept.push(s.id);
          else { excluded.push({ id: s.id, reason: 'Extra — requested number already reached', extra: true }); s.prIds = s.prIds.filter(x => x !== pr.id); }
          persist('suppliers', s);
          crawled++; setStep('sites', 'run', `${crawled} read · ${kept.length}/${N} kept${excluded.filter(x => !x.extra).length ? ` · ${excluded.filter(x => !x.extra).length} filtered out` : ''}`);
        });
      }
      if (!crawled && !kept.length) throw new Error('No companies found. Try a synonym, another state/city, or add a Gemini/Serper key in Integrations.');
      setStep('apollo', F.steps[0].status === 'run' ? 'done' : F.steps[0].status);
      setStep('web', F.steps[1].status === 'run' ? 'done' : F.steps[1].status);
      setStep('sites', 'done', `${kept.length} of ${N} requested · ${crawled} websites read · ${excluded.filter(x => !x.extra).length} filtered out`);
      // AI check
      if (o.verify && SAMPLE) {
        setStep('verify', 'run', `0 / ${kept.length}`); let v = 0; F.quiet = true;
        await pool(kept.map(id => byId('suppliers', id)).filter(s => s && FIRST.has(s.id)), 2, async s => { try { await extractFromSource(pr, FIRST.get(s.id), true); } catch {} v++; setStep('verify', 'run', `${v} / ${kept.length}`); });
        F.quiet = false; setStep('verify', 'done', `${v} websites checked — claims wait for your review`);
      } else setStep('verify', 'skip', SAMPLE ? 'Turned off' : 'No AI key configured');
      // Missing emails via Apollo
      const missing = kept.map(id => byId('suppliers', id)).filter(s => s && !bestEmail(s) && s.domain);
      if (o.apolloEmails && HEALTH.apollo && missing.length) {
        setStep('emails', 'run', `${missing.length} companies without email`); let got = 0;
        for (let i = 0; i < missing.length; i += 10) {
          const chunk = missing.slice(i, i + 10);
          try {
            const p = await api('POST', '/api/apollo/people', { domains: chunk.map(s => s.domain).join('\n'), titles: AP_TITLES.join('\n'), seniorities: ['owner', 'founder', 'c_suite', 'partner', 'vp', 'head', 'director', 'manager'], perPage: 50 });
            const pick = []; chunk.forEach(s => p.items.filter(x => x.hasEmail && x.orgDomain === s.domain).slice(0, 2).forEach(x => pick.push(x)));
            if (!pick.length) continue;
            const r = await api('POST', '/api/apollo/enrich', { ids: pick.map(x => x.apolloId) });
            const src = { id: uid('src'), prId: pr.id, url: '', type: 'Apollo API', title: 'Apollo people enrichment · ' + fmtDate(nowISO()), text: '', retrievedAt: nowISO(), addedBy: reviewer(), createdAt: nowISO(), extractedAt: nowISO(), provider: { name: 'Apollo.io', endpoint: 'POST /api/v1/people/bulk_match', calls: r.calls } };
            const lines = [];
            r.items.forEach(m => { const line = apLine({ apollo_person_id: m.apolloId, name: m.name, title: m.title, email: m.email, email_status: m.emailStatus, organization: m.orgName, domain: m.orgDomain }); lines.push(line); if (!m.email) return;
              const s = chunk.find(x => x.domain === (m.orgDomain || '').toLowerCase()); if (!s || contactsOf(s.id).some(k => k.normalized === m.email.toLowerCase())) return;
              persist('contacts', { id: uid('ct'), supplierId: s.id, sourceId: src.id, kind: 'email', value: m.email, normalized: m.email.toLowerCase(), person: m.name, designation: m.title, excerpt: line, found: true, decision: 'pending', provider: 'Apollo', emailStatus: m.emailStatus, linkedin: m.linkedin, retrievedAt: nowISO(), createdAt: nowISO() }); got++; });
            src.text = lines.join('\n'); persist('sources', src);
            audit('Apollo enrichment (Find suppliers)', 'source', src.id, `${pick.length} requested; credits: ${r.calls.map(c => c.creditsConsumed ?? '?').join('+')}`);
          } catch (e) { F.log.push('Apollo emails: ' + e.message); }
          setStep('emails', 'run', `${got} emails found so far`);
        }
        setStep('emails', 'done', `${got} emails added from Apollo`);
      } else setStep('emails', 'skip', !missing.length ? 'Every company already has an email' : !o.apolloEmails ? 'Turned off (uses Apollo credits)' : 'Apollo key not configured');
      pr.quickRun = { at: nowISO(), by: reviewer(), country, state: o.state || '', city: o.city || '', strict, requested: N, kept, excluded, options: o, log: F.log.slice(0, 80) };
      persist('prs', pr);
      const withEmail = kept.filter(id => { const s = byId('suppliers', id); return s && bestEmail(s); }).length;
      const short = kept.length < N ? ` — only ${kept.length} of ${N} found: the sources had no more matching suppliers` : '';
      setStep('done', 'done', `${kept.length} suppliers · ${withEmail} with email · ${kept.filter(id => waNumberOf(byId('suppliers', id) || { id: '' })).length} with WhatsApp-capable mobile${short}`);
      audit('Find suppliers finished', 'pr', pr.id, `${kept.length}/${N} kept, ${excluded.length} excluded, ${withEmail} with email`);
      UI.findSel = new Set(kept); UI.filters.rState = ''; UI.filters.rCity = '';
      toast(kept.length < N ? `${kept.length} of ${N} suppliers found — no more matched your filters.` : `${kept.length} suppliers found for ${pr.api}.`, kept.length < N ? 'err' : '');
    } catch (e) { toast(e.message, 'err'); F.steps.filter(s => s.status === 'wait' || s.status === 'run').forEach(s => { s.status = 'skip'; }); }
    F.running = false; F.quiet = false; endJob();
  }

  function vFind() {
    const st = HEALTH.settings || {};
    const prs = S.prs.filter(p => p.quickRun).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const pr = byId('prs', UI.prId) && byId('prs', UI.prId).quickRun ? byId('prs', UI.prId) : (F.running ? byId('prs', F.prId) : prs[0]);
    const searchNames = [HEALTH.search && HEALTH.search.claude && 'Claude', HEALTH.search && HEALTH.search.gemini && 'Google Gemini', HEALTH.search && HEALTH.search.serper && 'Google (Serper)'].filter(Boolean);
    const form = `<form class="finder pop" data-submit="runFind">
      <div class="finder-head"><div><div class="eyebrow-k">One-click supplier search</div><h1>Which API do you need?</h1><p>Type it once. The tool searches ${HEALTH.apollo ? 'Apollo and ' : ''}the web, reads each company's own website for email and phone, and gives you one clean list.</p></div></div>
      <div class="finder-main"><input name="api" required placeholder="e.g. Paracetamol" class="finder-input" value="${esc(UI.fApi || '')}" aria-label="API name"><button class="btn primary big" ${F.running || !canWrite() ? 'disabled' : ''}>${F.running ? '<span class="spin"></span>&nbsp;Searching…' : 'Find suppliers'}</button></div>
      <div class="finder-grid">
        <label class="f">Synonyms<input name="synonyms" placeholder="e.g. Acetaminophen" value="${esc(UI.fSyn || '')}"></label>
        <label class="f">Quantity<div class="row" style="gap:6px;flex-wrap:nowrap"><input name="qty" inputmode="decimal" value="${esc(UI.fQty || '500')}" style="min-width:0"><select name="unit" style="width:84px">${['kg', 'g', 'MT'].map(u => `<option>${u}</option>`).join('')}</select></div></label>
        <label class="f">Pharmacopoeia<select name="pharmacopoeia">${['IP', 'BP', 'USP', 'Ph. Eur.', 'JP', 'Any'].map(p => `<option>${p}</option>`).join('')}</select></label>
        <label class="f">Country<select name="country" data-change="fCountry">${COUNTRIES.map(c => `<option ${c === (UI.fCountry || st.defaultCountry || 'India') ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        ${(UI.fCountry || st.defaultCountry || 'India') === 'India' ? `<label class="f">State (optional)<select name="state"><option value="">All India</option>${IN_STATES.map(x => `<option ${x === UI.fState ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label class="f">City (optional)<input name="city" placeholder="e.g. Ahmedabad" value="${esc(UI.fCity || '')}"></label>` : ''}
        <label class="f">How many suppliers<input name="n" type="number" min="1" max="200" value="${esc(UI.fN || 25)}" required></label>
        <label class="f">Search with<select name="provider"><option value="auto">Auto (best available, falls back)</option>${HEALTH.search && HEALTH.search.claude ? '<option value="claude">Claude web search</option>' : ''}${HEALTH.search && HEALTH.search.gemini ? '<option value="gemini">Google Gemini (free tier)</option>' : ''}${HEALTH.search && HEALTH.search.serper ? '<option value="serper">Google results (Serper)</option>' : ''}</select></label>
      </div>
      <div class="finder-opts">
        <label class="chip"><input type="checkbox" name="strict" checked><span>Only companies in the chosen country</span></label>
        <label class="chip"><input type="checkbox" name="useWeb" ${HEALTH.webSearch ? 'checked' : 'disabled'}><span>Web search${searchNames.length ? ' (' + searchNames.join(' → ') + ')' : ' — not configured'}</span></label>
        <label class="chip"><input type="checkbox" name="useApollo" ${HEALTH.apollo ? 'checked' : 'disabled'}><span>Apollo companies${HEALTH.apollo ? '' : ' — not configured'}</span></label>
        <label class="chip"><input type="checkbox" name="verify" ${SAMPLE ? 'checked' : 'disabled'}><span>Check API on websites with AI</span></label>
        <label class="chip"><input type="checkbox" name="apolloEmails" ${HEALTH.apollo ? '' : 'disabled'}><span>Missing emails from Apollo (uses credits)</span></label>
      </div>
      ${!HEALTH.webSearch && !HEALTH.apollo ? '<div class="note warn" style="margin-top:12px">No search source is connected yet. Add a free Google Gemini key (or Serper / Claude / Apollo) in Integrations.</div>' : ''}
    </form>`;
    const progress = F.steps.length && (F.running || (pr && pr.id === F.prId)) ? `<div class="panel"><div class="row"><h2 style="margin:0">Progress</h2>${F.running ? '<span class="b info plain"><span class="spin"></span>&nbsp;Running</span>' : ''}</div><div id="runsteps">${stepHTML()}</div></div>` : '';
    return form + progress + (pr ? resultsHTML(pr, prs) : `<div class="panel">${emptyBox('No searches yet', 'Type an API name above and press Find suppliers.')}</div>`);
  }
  function resultsHTML(pr, prs) {
    const q = pr.quickRun || { kept: [], excluded: [] };
    const sel = UI.findSel || (UI.findSel = new Set());
    const f = UI.filters; const fq = normText(f.rq || '');
    let rows = (q.kept || []).map(id => byId('suppliers', id)).filter(s => s && !s.mergedInto);
    rows = rows.map(s => byId('suppliers', s.mergedInto) || s);
    if (fq) rows = rows.filter(s => normText(s.name + ' ' + s.domain + ' ' + contactsOf(s.id).map(c => c.value).join(' ')).includes(fq));
    if (f.rEmail) rows = rows.filter(s => bestEmail(s));
    if (f.rNoEmail) rows = rows.filter(s => !bestEmail(s));
    if (f.rWa) rows = rows.filter(s => waNumberOf(s));
    const allRows = (q.kept || []).map(id => byId('suppliers', id)).filter(Boolean);
    const stateOpts = [...new Set(allRows.map(s => s.state).filter(Boolean))].sort();
    const cityOpts = [...new Set(allRows.filter(s => !f.rState || s.state === f.rState).map(s => s.city).filter(Boolean))].sort();
    if (f.rState) rows = rows.filter(s => s.state === f.rState);
    if (f.rCity) rows = rows.filter(s => s.city === f.rCity);
    rows.sort((a, b) => (bestEmail(b) ? 1 : 0) - (bestEmail(a) ? 1 : 0) || priority(b) - priority(a));
    const emails = s => contactsOf(s.id).filter(c => c.kind === 'email' && c.decision !== 'rejected');
    const tot = (q.kept || []).length, we = (q.kept || []).filter(id => byId('suppliers', id) && bestEmail(byId('suppliers', id))).length, ww = (q.kept || []).filter(id => byId('suppliers', id) && waNumberOf(byId('suppliers', id))).length;
    return `<div class="panel results">
      <div class="row" style="margin-bottom:6px"><h2 style="margin:0">${esc(pr.api)} suppliers</h2><span class="tag mono">${esc(pr.code)}</span><span class="faint" style="font-size:13px">${esc([q.city, q.state, q.country].filter(Boolean).join(', ') || 'Any country')} · ${fmtDate(q.at)}</span><span class="spacer"></span>
        ${prs.length > 1 ? `<select class="inp" style="width:auto" data-change="findPick">${prs.map(p => `<option value="${p.id}" ${p.id === pr.id ? 'selected' : ''}>${esc(p.code)} — ${esc(p.api)}</option>`).join('')}</select>` : ''}</div>
      <div class="stat-row"><div><b>${tot}${q.requested ? `<small class="faint" style="font-size:14px"> / ${q.requested}</small>` : ''}</b><span>suppliers${q.requested && tot < q.requested ? ' (no more matched)' : ''}</span></div><div><b>${we}</b><span>with email</span></div><div><b>${ww}</b><span>with WhatsApp mobile</span></div><div><b>${(q.excluded || []).filter(x => !x.extra).length}</b><span>filtered out</span></div></div>
      <div class="row" style="margin:14px 0 10px"><input class="inp" style="max-width:220px" placeholder="Filter list" value="${esc(f.rq || '')}" data-input="rq">
        <select class="inp" style="width:auto" data-change="rState" aria-label="State"><option value="">All states</option>${stateOpts.map(x => `<option ${x === f.rState ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <select class="inp" style="width:auto" data-change="rCity" aria-label="City"><option value="">All cities</option>${cityOpts.map(x => `<option ${x === f.rCity ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <label class="chip"><input type="checkbox" data-change="rf" data-k="rEmail" ${f.rEmail ? 'checked' : ''}><span>Has email</span></label><label class="chip"><input type="checkbox" data-change="rf" data-k="rNoEmail" ${f.rNoEmail ? 'checked' : ''}><span>No email</span></label><label class="chip"><input type="checkbox" data-change="rf" data-k="rWa" ${f.rWa ? 'checked' : ''}><span>Has WhatsApp mobile</span></label>
        <span class="spacer"></span><button class="btn sm" data-act="fSelAll">Select all</button><button class="btn sm" data-act="fSelNone">Clear</button>
        <button class="btn sm" data-act="fFindEmails" ${!canWrite() || F.running ? 'disabled' : ''} title="Read websites again / ask Apollo for the selected companies without email">Find missing emails</button>
        <button class="btn sm" data-act="fVerifyAll" ${sel.size && canWrite() ? '' : 'disabled'} title="Mark the selected suppliers as verified and add them to Vendor master">✓ Verify &amp; add ${sel.size || ''} to Vendor master</button>
        <button class="btn sm" data-act="fShort" ${sel.size && canWrite() ? '' : 'disabled'}>Shortlist ${sel.size || ''}</button><button class="btn sm" data-act="fExport">Excel</button>
        <button class="btn sm primary" data-act="fSend" ${sel.size && canWrite() ? '' : 'disabled'}>Send inquiry to ${sel.size || ''}</button></div>
      ${rows.length ? `<div class="tbl-wrap"><table class="list"><thead><tr><th></th><th>#</th><th>Company</th><th>City</th><th>State</th><th>Email</th><th>Phone</th><th>WhatsApp</th><th>Country check</th><th>API</th><th>Found by</th><th>Vendor master</th></tr></thead><tbody>
      ${rows.map((s, i) => { const em = emails(s); const wa = waNumberOf(s); const ph = phoneOf(s); const src = [...new Set([s.origin === 'apollo' ? 'Apollo' : '', ...contactsOf(s.id).map(c => c.provider)].filter(Boolean))];
        return `<tr class="${sel.has(s.id) ? 'sel' : ''}"><td><input type="checkbox" class="chk" data-change="fSel" data-id="${s.id}" ${sel.has(s.id) ? 'checked' : ''} aria-label="Select ${esc(s.name)}"></td><td class="mono faint">${i + 1}</td>
        <td><a href="#" data-act="openSup" data-id="${s.id}"><strong>${esc(s.name)}</strong></a><div class="faint" style="font-size:12.5px">${s.website ? `<a href="${esc(/^https?:/.test(s.website) ? s.website : 'https://' + s.website)}" target="_blank" rel="noopener noreferrer">${esc(s.domain)}</a>` : esc(s.domain)}</div></td>
        <td>${esc(s.city || '—')}</td><td>${esc(s.state || '—')}</td>
        <td>${em.length ? `<span class="mono">${esc(em[0].value)}</span>${em.length > 1 ? ` <span class="tag" title="${esc(em.slice(1).map(x => x.value).join(', '))}">+${em.length - 1}</span>` : ''}${em[0].emailStatus ? `<div>${badge(em[0].emailStatus === 'verified' ? ['Apollo verified', 'ok'] : [em[0].emailStatus, 'warn'])}</div>` : ''}` : '<span class="b bad plain">Not found</span>'}</td>
        <td class="mono">${esc(ph) || '—'}</td><td class="mono">${wa ? esc(wa) : '<span class="faint">—</span>'}</td>
        <td>${s.finder && s.finder.reasons && s.finder.reasons.length ? `<span class="b ok" title="${esc(s.finder.reasons.join(', '))}">${esc(q.country || 'OK')}</span>` : q.strict ? '<span class="b">—</span>' : '<span class="faint">not checked</span>'}${s.finder && s.finder.error ? '<div class="faint" style="font-size:11.5px">site unreadable</div>' : ''}</td>
        <td>${badge(apiStatus(s))}</td><td>${src.map(x => `<span class="tag">${esc(x)}</span>`).join(' ')}</td>
        <td>${s.onList ? `<span class="b ok" title="${esc(s.verifiedBy ? 'Verified by ' + s.verifiedBy + ' · ' + fmtDate(s.verifiedAt) : 'In Vendor master')}">✓ ${s.verifiedAt ? 'Verified' : 'In master'}</span>` : `<button class="btn sm" data-act="fVerify" data-id="${s.id}" ${canWrite() ? '' : 'disabled'}>Verify &amp; add</button>`}</td></tr>`; }).join('')}</tbody></table></div>` : emptyBox(F.running ? 'Working…' : 'No suppliers in this list', F.running ? 'Results appear as soon as the websites are read.' : 'Try another country, a synonym, or turn off “Only companies in the chosen country”.')}
      ${(q.excluded || []).length ? `<details class="excl"><summary>${q.excluded.filter(x => !x.extra).length} filtered out (outside ${esc([q.city, q.state, q.country].filter(Boolean).join(', '))})${q.excluded.some(x => x.extra) ? ` · ${q.excluded.filter(x => x.extra).length} extra beyond ${q.requested}` : ''}</summary>${q.excluded.map(x => { const s = byId('suppliers', x.id); return s ? `<div class="act"><span>${esc(s.name)} <span class="faint">${esc(s.domain)}</span></span><span class="faint" style="font-size:12.5px">${esc(x.reason)}</span><span class="spacer"></span><button class="btn sm" data-act="fInclude" data-id="${s.id}">Include anyway</button></div>` : ''; }).join('')}</details>` : ''}
      ${q.log && q.log.length ? `<details class="excl"><summary>${q.log.length} websites could not be read</summary><div class="faint" style="font-size:12.5px;white-space:pre-wrap">${esc(q.log.join('\n'))}</div></details>` : ''}
      <p class="hint" style="margin-top:12px">Every email and phone comes from a quoted page or an Apollo record and stays “Awaiting review” in the Verification centre until your team accepts it. A mobile number is shown under WhatsApp only as a candidate — it is not proof the number uses WhatsApp.</p>
    </div>`;
  }
  Object.assign(SUBMIT, {
    runFind: (f, fd) => {
      const o = { api: fd.get('api').trim(), synonyms: fd.get('synonyms').trim(), qty: fd.get('qty').trim() || '—', unit: fd.get('unit'), pharmacopoeia: fd.get('pharmacopoeia'), country: fd.get('country'), state: fd.get('country') === 'India' ? (fd.get('state') || '') : '', city: fd.get('country') === 'India' ? String(fd.get('city') || '').trim() : '', n: Math.min(200, Math.max(1, +fd.get('n') || 25)), provider: fd.get('provider'), strict: !!fd.get('strict'), useWeb: !!fd.get('useWeb'), useApollo: !!fd.get('useApollo'), verify: !!fd.get('verify'), apolloEmails: !!fd.get('apolloEmails') };
      UI.fApi = o.api; UI.fSyn = o.synonyms; UI.fQty = o.qty; UI.fCountry = o.country; UI.fState = o.state; UI.fCity = o.city; UI.fN = o.n;
      if (o.apolloEmails && !confirm(`“Missing emails from Apollo” uses Apollo enrichment credits — up to 2 per company without an email (max about ${o.n * 2}). Continue?`)) return;
      runFind(o);
    }
  });
  Object.assign(CHANGE, {
    findPick: el => { UI.prId = el.value; UI.findSel = new Set(); UI.filters.rState = ''; UI.filters.rCity = ''; render(); },
    fCountry: el => { UI.fCountry = el.value; render(); },
    rState: el => { UI.filters.rState = el.value; UI.filters.rCity = ''; render(); },
    rCity: el => { UI.filters.rCity = el.value; render(); },
    fSel: el => { el.checked ? UI.findSel.add(el.dataset.id) : UI.findSel.delete(el.dataset.id); render(); },
    rf: el => { UI.filters[el.dataset.k] = el.checked; render(); }
  });
  INPUT.rq = v => UI.filters.rq = v;
  const curFindPR = () => byId('prs', UI.prId) && byId('prs', UI.prId).quickRun ? byId('prs', UI.prId) : S.prs.filter(p => p.quickRun).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  Object.assign(A, {
    fSelAll: () => { const pr = curFindPR(); (pr.quickRun.kept || []).forEach(id => UI.findSel.add(id)); render(); },
    fSelNone: () => { UI.findSel.clear(); render(); },
    fShort: () => { const pr = curFindPR(); pr.shortlist = [...new Set([...(pr.shortlist || []), ...UI.findSel])]; persist('prs', pr); audit('Shortlisted from Find suppliers', 'pr', pr.id, UI.findSel.size + ' suppliers'); toast(UI.findSel.size + ' added to the shortlist'); render(); },
    fSend: () => { const pr = curFindPR(); UI.sendSel = new Set(UI.findSel); go('send', { prId: pr.id }); },
    fInclude: el => { const pr = curFindPR(); const s = byId('suppliers', el.dataset.id); pr.quickRun.excluded = pr.quickRun.excluded.filter(x => x.id !== s.id); pr.quickRun.kept.push(s.id); if (!s.prIds.includes(pr.id)) s.prIds.push(pr.id); persist('suppliers', s); persist('prs', pr); audit('Included despite country check', 'supplier', s.id, s.name); render(); },
    fExport: () => { const pr = curFindPR(); const rows = (pr.quickRun.kept || []).map(id => byId('suppliers', id)).filter(Boolean).map((s, i) => ({ '#': i + 1, Company: s.name, Website: s.website, Domain: s.domain, Country: s.country, Emails: contactsOf(s.id).filter(c => c.kind === 'email').map(c => c.value).join(', '), 'Email source': contactsOf(s.id).filter(c => c.kind === 'email').map(c => c.provider).join(', '), Phones: contactsOf(s.id).filter(c => c.kind !== 'email').map(c => c.normalized || c.value).join(', '), 'WhatsApp candidate': waNumberOf(s), City: s.city || '', State: s.state || '', 'Country check': (s.finder && s.finder.reasons || []).join(', '), 'API evidence': apiStatus(s)[0], 'Contact evidence': contactStatus(s)[0], 'Source pages': [...new Set(contactsOf(s.id).map(c => (byId('sources', c.sourceId) || {}).url).filter(Boolean))].join(' | ') }));
      const f = xlsxFile([['Suppliers', rows], ['About', [{ 'Purchase request': pr.code, API: pr.api, Country: pr.quickRun.country, Generated: new Date().toLocaleString('en-IN'), By: reviewer(), Note: 'Contacts are as published on company websites or returned by Apollo. Review before relying on them.' }]]]); f && saveFile(`${pr.code}_${pr.api.replace(/\W+/g, '_')}_suppliers.xlsx`, f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); },
    fFindEmails: async () => {
      const pr = curFindPR(); const ids = (UI.findSel.size ? [...UI.findSel] : pr.quickRun.kept); const list = ids.map(id => byId('suppliers', id)).filter(s => s && !bestEmail(s) && (s.website || s.domain));
      if (!list.length) return toast('All selected companies already have an email.');
      F.running = true; startJob('Finding missing emails'); let n = 0, got = 0;
      await pool(list, 3, async s => { try { const cr = await api('POST', '/api/finder/crawl', { url: s.website || 'https://' + s.domain, country: '' }); const r = saveCrawl(s, pr, cr); got += r.ne; } catch {} n++; setProgress(`${n}/${list.length}`); });
      F.running = false; endJob(); toast(`${got} new email(s) found on websites.${HEALTH.apollo ? ' For the rest, use “Missing emails from Apollo” or the Apollo lead finder.' : ''}`);
    }
  });

  /* ================= SEND INQUIRY (Outlook + WhatsApp) ================= */
  const W = { templates: null, loading: false, err: '' };
  const FIELDS = [['company', 'Company name'], ['contact', 'Contact person'], ['api', 'API name'], ['qty', 'Quantity + unit'], ['pharma', 'Pharmacopoeia'], ['pr', 'Purchase request ID'], ['country', 'Supplier country'], ['sender', 'Our company name'], ['custom', 'Fixed text…']];
  function fieldVal(k, pr, s, custom) { const c = bestEmail(s); return { company: s.name, contact: (c && c.person) || 'Sir/Madam', api: pr.api, qty: `${pr.qty} ${pr.unit}`, pharma: pr.pharmacopoeia || '', pr: pr.code, country: s.country || '', sender: SENDER, custom: custom || '' }[k] ?? ''; }
  async function loadWaTemplates() { if (!HEALTH.wati || W.loading) return; W.loading = true; try { W.templates = await api('GET', '/api/wati/templates'); W.err = ''; } catch (e) { W.err = e.message; W.templates = []; } W.loading = false; render(); }
  function guessField(p) { const n = String(p).toLowerCase(); return /api|product|drug/.test(n) ? 'api' : /qty|quant/.test(n) ? 'qty' : /pharma|grade/.test(n) ? 'pharma' : /contact|person/.test(n) ? 'contact' : /ref|pr_?id|request/.test(n) ? 'pr' : /sender|our|from/.test(n) ? 'sender' : /country/.test(n) ? 'country' : 'company'; }
  function waParams(pr, s) { const t = (W.templates || []).find(x => x.name === UI.waTpl); if (!t) return []; return t.params.map(p => { const m = (UI.waMap || {})[p] || guessField(p); return { name: p, value: m.startsWith('custom:') ? m.slice(7) : fieldVal(m, pr, s) }; }); }
  function waPreview(pr, s) { const t = (W.templates || []).find(x => x.name === UI.waTpl); if (!t) return ''; const vals = Object.fromEntries(waParams(pr, s).map(p => [p.name, p.value])); return t.body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => vals[k] ?? m); }
  function attachPayload() {
    const fs = UI.sendFiles || []; if (!fs.length) return {};
    return { driveFiles: fs.filter(f => f.id).map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })), attachments: fs.filter(f => f.b64).map(f => ({ name: f.name, contentType: f.mimeType, b64: f.b64 })) };
  }
  async function addSendFiles(el) {
    const files = [...el.files]; el.value = ''; if (!files.length) return;
    UI.sendFiles = UI.sendFiles || [];
    const total = () => UI.sendFiles.reduce((n, f) => n + f.size, 0);
    if (total() + files.reduce((n, f) => n + f.size, 0) > 20 * 1048576) return toast('Attachments would exceed 20 MB in total — Outlook rejects bigger emails.', 'err');
    startJob('Adding attachments');
    for (const f of files) {
      try {
        if (HEALTH.gdriveConnected) { const d = await driveUpload(f, 'files', false); UI.sendFiles.push({ id: d.id, name: f.name, size: f.size, mimeType: f.type || 'application/octet-stream' }); }
        else { if (total() + f.size > 2.5 * 1048576) { toast(f.name + ': without Google Drive the attachments can be at most 2.5 MB in total.', 'err'); continue; }
          const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
          UI.sendFiles.push({ name: f.name, size: f.size, mimeType: f.type || 'application/octet-stream', b64 }); }
      } catch (e) { toast(f.name + ': ' + e.message, 'err'); }
    }
    UI.testMailOk = false; UI.sendOk = false; endJob();
  }
  A.sRmFile = el => { UI.sendFiles.splice(+el.dataset.i, 1); UI.testMailOk = false; UI.sendOk = false; render(); };
  function vSend() {
    const prs = S.prs.filter(p => p.status !== 'closed');
    if (!prs.length) return `<div class="page-head"><div><h1>Send inquiry</h1></div></div><div class="panel">${emptyBox('No purchase request yet', 'Use Find suppliers first.', '<button class="btn primary" data-go="find">Find suppliers</button>')}</div>`;
    const pr = byId('prs', UI.prId) || prs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]; UI.prId = pr.id;
    const reqIds = new Set([...((pr.quickRun && pr.quickRun.kept) || []), ...(pr.shortlist || [])]);
    const isListed = s => s.onList || s.origin === 'company' || (s.materials && s.materials.length) || (S.items || []).some(i => (i.vendors || []).includes(s.id));
    const fullPool = live().filter(s => reqIds.has(s.id) || isListed(s));
    const sel = UI.sendSel || (UI.sendSel = new Set([...reqIds].filter(id => byId('suppliers', id))));
    const src = UI.sendSrc || (reqIds.size ? 'all' : 'list'); const sq = normText(UI.sendQ || ''); const mats = [...new Set(fullPool.flatMap(s => s.materials || []))].sort();
    const pool0 = fullPool.filter(s => (src === 'all' || (src === 'req' ? reqIds.has(s.id) : isListed(s))) && (!UI.sendMat || (s.materials || []).some(m => normText(m) === normText(UI.sendMat))) && (!sq || normText([s.name, s.city, s.state, (s.materials || []).join(' '), contactsOf(s.id).map(c => c.value).join(' ')].join(' ')).includes(sq))).sort((a, b) => (reqIds.has(b.id) - reqIds.has(a.id)) || a.name.localeCompare(b.name));
    UI._sendShown = pool0.map(s => s.id);
    const chosen = fullPool.filter(s => sel.has(s.id));
    const em = UI.chEmail !== false, wa = !!UI.chWa;
    const sentBefore = (s, ch) => S.rfqs.some(r => r.prId === pr.id && r.supplierId === s.id && (r.channel || 'email') === ch && ['sent', 'wa_sent', 'replied', 'drafted'].includes(r.status));
    const mailTo = chosen.filter(s => bestEmail(s)), waTo = chosen.filter(s => waNumberOf(s));
    const tpl = byId('templates', UI.mailTpl) || S.templates.find(t => !t.archived); if (tpl) UI.mailTpl = tpl.id;
    const first = chosen[0];
    const [subj] = tpl && first ? fillTpl(tpl.subject, pr, first, bestEmail(first)) : [''];
    const [body] = tpl && first ? fillTpl(tpl.body, pr, first, bestEmail(first)) : [''];
    if (wa && HEALTH.wati && W.templates === null && !W.loading) setTimeout(loadWaTemplates, 0);
    const approved = (W.templates || []).filter(t => t.status === 'APPROVED');
    const t = (W.templates || []).find(x => x.name === UI.waTpl);
    const testsOk = (!em || UI.testMailOk) && (!wa || UI.testWaOk);
    if (UI.cc === undefined) UI.cc = (HEALTH.settings && HEALTH.settings.ccEmails) || '';
    return `<div class="page-head"><div><h1>Send inquiry</h1><p>Pick suppliers, test the message on yourself, then send to everyone in one click.</p></div><div class="row">${prSelect('sendPick')}</div></div>
    <div class="send-grid">
      <div class="panel"><div class="row"><h2 style="margin:0">1. Suppliers (${chosen.length} selected)</h2><span class="spacer"></span><button class="btn sm" data-act="sAll">Select shown</button><button class="btn sm" data-act="sNone">None</button></div>
        <div class="row" style="gap:6px;margin-top:10px"><select class="inp" style="width:auto" data-change="sendSrc"><option value="all" ${src === 'all' ? 'selected' : ''}>All (${fullPool.length})</option><option value="req" ${src === 'req' ? 'selected' : ''}>This request (${reqIds.size})</option><option value="list" ${src === 'list' ? 'selected' : ''}>Vendor master (${fullPool.filter(isListed).length})</option></select>${mats.length ? `<select class="inp" style="width:auto;max-width:150px" data-change="sendMat"><option value="">All materials</option>${mats.map(m => `<option ${m === UI.sendMat ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>` : ''}</div>
        <input class="inp" style="margin-top:6px" placeholder="Search vendor, city, email" value="${esc(UI.sendQ || '')}" data-input="sendQ">
        <div class="faint" style="font-size:12.5px;margin:6px 0 10px">${mailTo.length} with email · ${waTo.length} with WhatsApp-capable mobile</div>
        <div class="slist">${pool0.length ? pool0.map(s => `<label class="srow ${sel.has(s.id) ? 'on' : ''}"><input type="checkbox" class="chk" data-change="sSel" data-id="${s.id}" ${sel.has(s.id) ? 'checked' : ''}><span class="sname"><strong>${esc(s.name)}</strong><small>${bestEmail(s) ? esc(bestEmail(s).value) : '<i>no email</i>'} · ${waNumberOf(s) ? esc(waNumberOf(s)) : '<i>no mobile</i>'}</small></span>${sentBefore(s, 'email') || sentBefore(s, 'whatsapp') ? '<span class="tag">contacted</span>' : ''}</label>`).join('') : emptyBox('No suppliers for this request', 'Run Find suppliers or shortlist some.')}</div></div>
      <div>
        <div class="panel"><h2>2. Channels & message</h2>
          <div class="chan ${em ? 'on' : ''}"><label class="row" style="gap:10px"><input type="checkbox" class="chk" data-change="chEmail" ${em ? 'checked' : ''}><strong>Email</strong></label>
            ${em ? `<div class="prov">${[['outlook', 'Outlook', HEALTH.outlookConnected, HEALTH.outlook, 'olConnect'], ['gmail', 'Gmail', HEALTH.gmailConnected, HEALTH.gmail, 'gmConnect']].map(([k, l, ok, conf, act]) => `<label class="provopt ${via() === k ? 'on' : ''}"><input type="radio" name="via" data-change="mailVia" value="${k}" ${via() === k ? 'checked' : ''} ${ok ? '' : 'disabled'}><span><strong>${l}</strong>${ok ? `<small class="okc">Connected${k === 'gmail' && UI.gmAcc ? ' · ' + esc(UI.gmAcc) : ''}</small>` : conf ? `<button type="button" class="btn sm blue" data-act="${act}">Connect ${l}</button>` : '<small>Not configured</small>'}</span></label>`).join('')}</div>
            <div class="prov" style="margin-top:8px">${[['each', 'Separate email to each vendor', 'personalised name / company'], ['bcc', 'One email, all vendors in BCC', 'like your Gmail “Require Rate” mail']].map(([k, l, d]) => `<label class="provopt ${(UI.mailMode || 'each') === k ? 'on' : ''}"><input type="radio" name="mm" data-change="mailMode" value="${k}" ${(UI.mailMode || 'each') === k ? 'checked' : ''}><span><strong>${l}</strong><small>${d}</small></span></label>`).join('')}</div>` : ''}
            ${em ? `<div class="form" style="grid-template-columns:1fr;margin-top:10px"><label class="f">Email template<select data-change="mailTpl">${S.templates.filter(x => !x.archived).map(x => `<option value="${x.id}" ${x.id === UI.mailTpl ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label></div>
            <div style="margin-top:12px"><div class="row" style="gap:8px"><strong style="font-size:14px">Attachments</strong><span class="hint">PDF, drawings, artwork — up to 100 MB per file; anything above ~20 MB in total goes as a Google Drive download link</span></div>
              <div class="files">${((byId('templates', UI.mailTpl) || {}).files || []).map(f => `<span class="fchip" title="From the template">📎 ${esc(f.name)} <small>template</small></span>`).join('')}${(UI.sendFiles || []).map((f, i) => `<span class="fchip">📎 ${esc(f.name)} <small>${(f.size / 1048576).toFixed(1)} MB</small> <button type="button" class="x" data-act="sRmFile" data-i="${i}" aria-label="Remove">×</button></span>`).join('')}</div>
              <label class="btn sm" style="cursor:pointer">Add files<input type="file" multiple hidden data-change="sendFiles"></label> ${!HEALTH.gdriveConnected ? '<span class="hint">Without Google Drive: up to 2.5 MB in total.</span>' : ''}</div>
            ${ccEditor('sBcc', UI.bcc, 'BCC', 'hidden copy, e.g. your own Gmail')}
            ${ccEditor('sCc', UI.cc, 'CC', HEALTH.settings && HEALTH.settings.replyToCc !== false ? 'they also receive the supplier’s reply (Reply-To)' : 'copy of every email')}
            ${first ? (() => { const m = mailFor(pr, first); return m.html ? `<div class="preview html"><div class="pv-h">Preview for ${esc(first.name)}${UI.cc ? ' · CC: ' + esc(UI.cc) : ''}</div><div class="pv-h">Subject: <b>${esc(m.subject)}</b></div>${m.html}</div>` : `<div class="preview"><div class="pv-h">Preview for ${esc(first.name)}${UI.cc ? ' · CC: ' + esc(UI.cc) : ''}</div><strong>${esc(m.subject)}</strong>\n\n${esc(m.body)}</div>`; })() : ''}${!HEALTH.outlook ? '<p class="hint">Without Outlook connected you can still use RFQ drafts → Open in Outlook (manual send).</p>' : ''}` : ''}</div>
          <div class="chan ${wa ? 'on' : ''}"><label class="row" style="gap:10px"><input type="checkbox" class="chk" data-change="chWa" ${wa ? 'checked' : ''}><strong>WhatsApp via WATI</strong>${HEALTH.wati ? '<span class="b ok">Configured</span>' : '<span class="b">Not configured</span>'}</label>
            ${wa ? (HEALTH.wati ? `${W.loading ? '<p class="muted"><span class="spin"></span> Loading templates…</p>' : W.err ? `<div class="note bad">${esc(W.err)}</div>` : ''}
              <div class="form" style="grid-template-columns:1fr;margin-top:10px"><label class="f">Approved WhatsApp template<select data-change="waTpl"><option value="">Choose…</option>${(W.templates || []).map(x => `<option value="${esc(x.name)}" ${x.name === UI.waTpl ? 'selected' : ''} ${x.status !== 'APPROVED' ? 'disabled' : ''}>${esc(x.name)}${x.status !== 'APPROVED' ? ' (' + esc(x.status.toLowerCase()) + ')' : ''}</option>`).join('')}</select></label></div>
              ${!approved.length && W.templates ? '<p class="hint">No approved templates yet. Create one in WATI → Templates (category Utility or Marketing) and wait for WhatsApp approval.</p>' : ''}
              ${t ? `${t.params.map(p => { const m = (UI.waMap || {})[p] || guessField(p); return `<label class="f" style="margin-top:8px">{{${esc(p)}}} →<div class="row" style="gap:6px;flex-wrap:nowrap"><select data-change="waMap" data-p="${esc(p)}" style="min-width:0">${FIELDS.map(([k, l]) => `<option value="${k === 'custom' ? 'custom:' : k}" ${(k === 'custom' ? m.startsWith('custom:') : m === k) ? 'selected' : ''}>${l}</option>`).join('')}</select>${m.startsWith('custom:') ? `<input class="inp" data-input="waCustom" data-p="${esc(p)}" value="${esc(m.slice(7))}" placeholder="Text">` : ''}</div></label>`; }).join('')}
              ${first ? `<div class="preview"><div class="pv-h">Preview for ${esc(first.name)}</div>${esc(waPreview(pr, first))}</div>` : ''}` : ''}
              <p class="hint">WhatsApp only allows business-started messages with an approved template, and recipients should have agreed to be contacted. Messaging many people who did not opt in can get your number restricted.</p>` : '<p class="hint">Add WATI_API_ENDPOINT and WATI_ACCESS_TOKEN on the server (see Integrations).</p>') : ''}</div>
        </div>
        <div class="panel"><h2>3. Test on yourself first</h2>
          <div class="form" style="grid-template-columns:1fr 1fr">
            ${em ? `<div><label class="f">Test email address<input class="inp" data-input="testMail" value="${esc(UI.testMail ?? ME.email)}"></label><button class="btn sm" style="margin-top:8px" data-act="testMail" ${!viaOk() || !first || BUSY ? 'disabled' : ''}>Send test email</button> ${UI.testMailOk ? '<span class="b ok">Sent ✓</span>' : ''}</div>` : ''}
            ${wa ? `<div><label class="f">Test WhatsApp number<input class="inp" data-input="testWa" value="${esc(UI.testWa || '')}" placeholder="91XXXXXXXXXX"></label><button class="btn sm" style="margin-top:8px" data-act="testWa" ${!HEALTH.wati || !t || !first || BUSY ? 'disabled' : ''}>Send test WhatsApp</button> ${UI.testWaOk ? '<span class="b ok">Accepted ✓</span>' : ''}</div>` : ''}
          </div></div>
        <div class="panel sendbox"><h2>4. Send to all</h2>
          <div class="sum"><div><b>${em ? mailTo.filter(s => !sentBefore(s, 'email')).length : 0}</b><span>${(UI.mailMode || 'each') === 'bcc' ? 'vendors in BCC' : 'emails'} via ${via() === 'gmail' ? 'Gmail' : 'Outlook'}</span></div><div><b>${wa ? waTo.filter(s => !sentBefore(s, 'whatsapp')).length : 0}</b><span>WhatsApp</span></div><div><b>${chosen.length - new Set([...(em ? mailTo : []), ...(wa ? waTo : [])].map(s => s.id)).size}</b><span>skipped (no contact)</span></div></div>
          <label class="row" style="gap:8px;margin:12px 0;font-size:14px"><input type="checkbox" class="chk" data-change="sOk" ${UI.sendOk ? 'checked' : ''} ${testsOk ? '' : 'disabled'}> I received the test message(s) and the text is correct.</label>
          ${!testsOk ? '<p class="hint">Send the test message(s) above first.</p>' : ''}
          <div class="row">${em ? `<button class="btn" data-act="sDrafts" ${!UI.sendOk || !HEALTH.outlookConnected || via() !== 'outlook' || BUSY ? 'disabled' : ''} title="Outlook only">Only create Outlook drafts</button>` : ''}<button class="btn primary big" data-act="sGo" ${!UI.sendOk || BUSY || (!em && !wa) || (wa && !t) || (em && !viaOk()) ? 'disabled' : ''}>Send all now</button></div>
          ${UI.sendLog ? `<div class="sendlog">${UI.sendLog.map(l => `<div class="${l.ok ? '' : 'bad'}">${l.ok ? '✓' : '✗'} ${esc(l.t)}</div>`).join('')}</div>` : ''}
        </div>
      </div></div>`;
  }
  Object.assign(CHANGE, {
    sendPick: el => { UI.prId = el.value; UI.sendSel = null; UI.sendSrc = null; render(); },
    sendSrc: el => { UI.sendSrc = el.value; render(); }, mailVia: el => { UI.mailVia = el.value; UI.testMailOk = false; UI.sendOk = false; render(); }, mailMode: el => { UI.mailMode = el.value; UI.testMailOk = false; UI.sendOk = false; render(); }, sendMat: el => { UI.sendMat = el.value; render(); },
    sendFiles: el => addSendFiles(el),
    sSel: el => { el.checked ? UI.sendSel.add(el.dataset.id) : UI.sendSel.delete(el.dataset.id); render(); },
    chEmail: el => { UI.chEmail = el.checked; UI.sendOk = false; render(); },
    chWa: el => { UI.chWa = el.checked; UI.sendOk = false; render(); },
    mailTpl: el => { UI.mailTpl = el.value; UI.testMailOk = false; UI.sendOk = false; render(); },
    waTpl: el => { UI.waTpl = el.value; UI.testWaOk = false; UI.sendOk = false; render(); },
    waMap: el => { UI.waMap = { ...(UI.waMap || {}), [el.dataset.p]: el.value }; UI.testWaOk = false; UI.sendOk = false; render(); },
    sOk: el => { UI.sendOk = el.checked; render(); }
  });
  Object.assign(INPUT, { bccList: v => UI.bcc = v, sendQ: v => UI.sendQ = v, testMail: v => UI.testMail = v, testWa: v => UI.testWa = v, waCustom: v => {}, ccList: v => UI.cc = v });
  document.addEventListener('input', e => { const c = e.target.closest('[data-input="waCustom"]'); if (c) { UI.waMap = { ...(UI.waMap || {}), [c.dataset.p]: 'custom:' + c.value }; UI.testWaOk = false; } }, true);
  const sendPR = () => byId('prs', UI.prId);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function mailFor(pr, s) { const tpl = byId('templates', UI.mailTpl); const c = bestEmail(s); const [subject, m1] = fillTpl(tpl.subject, pr, s, c); const [body, m2] = fillTpl(tpl.body, pr, s, c); return { to: c ? c.value : '', subject, body, missing: [...new Set([...m1, ...m2])], contactName: (c && c.person) || '' }; }
  Object.assign(A, {
    sAll: () => { (UI._sendShown || []).forEach(id => UI.sendSel.add(id)); render(); },
    sNone: () => { UI.sendSel.clear(); render(); },
    olConnect: () => { location.href = '/api/outlook/connect'; },
    testMail: async () => {
      const pr = sendPR(); const s0 = S.suppliers.find(x => UI.sendSel.has(x.id)); const m = (UI.mailMode || 'each') === 'bcc' ? genericMail(pr) : mailFor(pr, s0); const to = (UI.testMail ?? ME.email).trim();
      startJob('Sending test email');
      try { const p = await mailPayload(m); await api('POST', '/api/mail/send', { provider: via(), to, subject: '[TEST] ' + m.subject, body: p.body, html: p.html, ...p.att }); UI.testMailOk = true; audit('Test email sent', 'campaign', pr.id, to + ' via ' + via()); toast('Test email sent to ' + to + ' via ' + (via() === 'gmail' ? 'Gmail' : 'Outlook') + '. Check your inbox.'); }
      catch (e) { toast('Test email failed: ' + e.message, 'err'); }
      endJob();
    },
    testWa: async () => {
      const pr = sendPR(); const s = S.suppliers.find(x => UI.sendSel.has(x.id)); const num = (UI.testWa || '').trim();
      startJob('Sending test WhatsApp');
      try { await api('POST', '/api/wati/send', { number: num, template: UI.waTpl, params: waParams(pr, s), broadcast: 'TEST ' + pr.code }); UI.testWaOk = true; audit('Test WhatsApp accepted by WATI', 'campaign', pr.id, num); toast('Test WhatsApp accepted by WATI. Check your phone.'); }
      catch (e) { toast('Test WhatsApp failed: ' + e.message, 'err'); }
      endJob();
    },
    sDrafts: () => sendAll(true),
    sGo: () => sendAll(false)
  });
  const via = () => { const v = UI.mailVia || (HEALTH.outlookConnected ? 'outlook' : HEALTH.gmailConnected ? 'gmail' : 'outlook'); return v === 'gmail' && !HEALTH.gmailConnected && HEALTH.outlookConnected ? 'outlook' : v === 'outlook' && !HEALTH.outlookConnected && HEALTH.gmailConnected ? 'gmail' : v; };
  const viaOk = () => via() === 'gmail' ? !!HEALTH.gmailConnected : !!HEALTH.outlookConnected;
  const replyList = () => { const st = HEALTH.settings || {}; if (st.replyToCc === false || !UI.cc) return ''; return via() === 'gmail' ? [UI.gmAcc, UI.cc].filter(Boolean).join(', ') : UI.cc; };
  function genericMail(pr) {
    const stub = { id: '', name: '', country: '' }; const tpl = byId('templates', UI.mailTpl);
    const strip = x => String(x || '').replace(/\{\{\s*(COMPANY_NAME|COUNTRY)\s*\}\}/g, '');
    const [subject] = fillTpl(strip(tpl.subject), pr, stub, null); const [body] = fillTpl(strip(tpl.body), pr, stub, null);
    const m = { to: '', subject, body, missing: [], contactName: '' };
    if (tpl.html) { const [h] = fillHtml(sanitizeHtml(strip(tpl.html)), pr, stub, null); m.html = mailWrap(h); }
    return m;
  }
  // attach small files, send big ones (or anything over the provider limit) as Google Drive links
  const LINKS = {};
  async function mailPayload(m) {
    const tpl = byId('templates', UI.mailTpl); const all = [...(UI.sendFiles || []), ...((tpl && tpl.files) || []).filter(x => !(UI.sendFiles || []).some(y => y.id && y.id === x.id))];
    const max = (via() === 'gmail' ? 24 : 19) * 1048576; let used = 0; const attach = [], link = [];
    all.slice().sort((a, b) => a.size - b.size).forEach(f => { if (f.b64 || (used + f.size <= max && f.size <= max)) { attach.push(f); used += f.size; } else link.push(f); });
    for (const f of link) { if (!LINKS[f.id]) { const r = await api('POST', '/api/gdrive/share', { fileId: f.id }); LINKS[f.id] = r.webViewLink; } }
    let html = m.html, body = m.body;
    if (link.length) { html = (html || mailWrap(esc(body).replace(/\n/g, '<br>'))) + `<p style="font-family:Arial,sans-serif;font-size:13px">Large files (download from Google Drive):<br>${link.map(f => `📎 <a href="${esc(LINKS[f.id])}">${esc(f.name)}</a> (${(f.size / 1048576).toFixed(1)} MB)`).join('<br>')}</p>`; body = body + '\n\nLarge files (download):\n' + link.map(f => `${f.name}: ${LINKS[f.id]}`).join('\n'); }
    return { html, body, att: { driveFiles: attach.filter(f => f.id).map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })), attachments: attach.filter(f => f.b64).map(f => ({ name: f.name, contentType: f.mimeType, b64: f.b64 })) }, names: all.map(f => f.name), linked: link.map(f => f.name) };
  }
  function sendAll(draftOnly) {
    const pr = sendPR(); const em = UI.chEmail !== false, wa = !!UI.chWa; const mode = draftOnly ? 'each' : (UI.mailMode || 'each');
    const chosen = S.suppliers.filter(s => UI.sendSel.has(s.id) && !s.mergedInto);
    const bad = [UI.cc, UI.bcc].join(',').split(/[;,\s]+/).filter(Boolean).find(x => !/^\S+@\S+\.\S+$/.test(x)); if (bad) return toast('CC/BCC has an invalid email: ' + bad, 'err');
    const done = (s, ch) => S.rfqs.some(r => r.prId === pr.id && r.supplierId === s.id && (r.channel || 'email') === ch && ['sent', 'wa_sent', 'replied', 'drafted'].includes(r.status));
    const mailList = em ? chosen.filter(s => bestEmail(s) && !done(s, 'email')) : [];
    const waList = wa && !draftOnly ? chosen.filter(s => waNumberOf(s) && !done(s, 'whatsapp')) : [];
    if (!mailList.length && !waList.length) return toast('Nothing to send — everyone selected was already contacted or has no contact.', 'err');
    const tpl = byId('templates', UI.mailTpl); const files = [...(UI.sendFiles || []), ...((tpl && tpl.files) || [])];
    const viaName = via() === 'gmail' ? 'Gmail' : 'Outlook'; const groups = mode === 'bcc' ? Math.ceil(mailList.length / 50) : mailList.length;
    modal(`<h2>${draftOnly ? 'Create Outlook drafts' : 'Send inquiry now'}</h2>
      <p>${mailList.length ? (mode === 'bcc' ? `<strong>${mailList.length}</strong> vendors in BCC — <strong>${groups}</strong> email${groups > 1 ? 's' : ''} (max 50 per email) from your ${viaName}` : `<strong>${mailList.length}</strong> separate email${mailList.length > 1 ? 's' : ''} ${draftOnly ? 'saved as Outlook drafts' : 'from your ' + viaName}`) : ''}${mailList.length && waList.length ? ' and ' : ''}${waList.length ? `<strong>${waList.length}</strong> WhatsApp message(s) through WATI` : ''}.</p>
      ${files.length ? `<p>Attachments: <b>${esc(files.map(f => f.name).join(', '))}</b> <span class="hint">(very large files go as Google Drive download links)</span></p>` : ''}${UI.cc ? `<p>CC: <b>${esc(UI.cc)}</b></p>` : ''}${UI.bcc ? `<p>BCC: <b>${esc(UI.bcc)}</b></p>` : ''}
      <p class="muted">Vendors already contacted for ${esc(pr.code)} are skipped. This cannot be undone.</p><div class="row"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="sConfirm">${draftOnly ? 'Create drafts' : 'Send now'}</button></div>`);
    A.sConfirm = async () => {
      closeModal(); UI.sendLog = []; startJob(draftOnly ? 'Creating drafts' : 'Sending'); let i = 0;
      const camp = { id: uid('cmp'), prId: pr.id, by: reviewer(), at: nowISO(), draftOnly, provider: via(), mode, email: mailList.length, whatsapp: waList.length, templateId: UI.mailTpl, templateName: tpl ? tpl.name : '', waTemplate: UI.waTpl || '', results: [] };
      const mkR = (s, extra) => ({ id: uid('rfq'), prId: pr.id, supplierId: s.id, channel: 'email', provider: via(), mode, campaignId: camp.id, templateId: UI.mailTpl, cc: UI.cc, bcc: UI.bcc, status: 'draft', history: [{ status: 'draft', at: nowISO(), by: reviewer(), note: 'Send inquiry' }], createdAt: nowISO(), approvedBy: reviewer(), approvedAt: nowISO(), ...extra });
      const ok = (r, s, note, d) => { r.status = 'sent'; r.sentAt = nowISO(); r.followUpAt = new Date(Date.now() + 5 * 864e5).toISOString(); Object.assign(r, d); r.history.push({ status: 'sent', at: nowISO(), by: reviewer(), note }); camp.results.push({ supplierId: s.id, channel: 'email', ok: true }); };
      const fail = (r, s, e) => { r.status = 'failed'; r.history.push({ status: 'failed', at: nowISO(), by: reviewer(), note: e.message }); camp.results.push({ supplierId: s.id, channel: 'email', ok: false, error: e.message }); };
      try {
        if (mode === 'bcc' && mailList.length) {
          const m = genericMail(pr); const p = await mailPayload(m); const self = via() === 'gmail' ? (UI.gmAcc || ME.email) : ME.email;
          for (let g = 0; g < mailList.length; g += 50) {
            const part = mailList.slice(g, g + 50); i += part.length; setProgress(`${Math.min(i, mailList.length)}/${mailList.length}`);
            const emails = part.map(s => bestEmail(s).value); const rs = part.map(s => mkR(s, { to: bestEmail(s).value, subject: m.subject, body: p.body, files: p.names, linked: p.linked }));
            try { const d = await api('POST', '/api/mail/send', { provider: via(), to: self, cc: UI.cc, bcc: [...emails, ...String(UI.bcc || '').split(/[;,\s]+/).filter(Boolean)].join(', '), replyTo: replyList(), subject: m.subject, body: p.body, html: p.html, ...p.att });
              rs.forEach((r, k) => ok(r, part[k], `Sent in one ${via()} email (BCC, ${part.length} vendors)`, { msgId: d.id, threadId: d.threadId, conversationId: d.conversationId })); UI.sendLog.push({ ok: true, t: `${part.length} vendors in BCC — ${emails.slice(0, 3).join(', ')}${emails.length > 3 ? '…' : ''}` }); }
            catch (e) { rs.forEach((r, k) => fail(r, part[k], e)); UI.sendLog.push({ ok: false, t: `BCC group of ${part.length} — ${e.message}` }); }
            rs.forEach(r => persist('rfqs', r)); render(); await sleep(800);
          }
        } else {
          await pool(mailList, draftOnly ? 1 : 2, async s => {
            i++; setProgress(`${i}/${mailList.length + waList.length}`); const m = mailFor(pr, s); const r = mkR(s, { to: m.to, contactName: m.contactName, subject: m.subject, body: m.body, missing: m.missing });
            try {
              const p = await mailPayload(m); r.files = p.names; r.linked = p.linked;
              const payload = { to: m.to, cc: UI.cc, bcc: UI.bcc, replyTo: replyList(), subject: m.subject, body: p.body, html: p.html, ...p.att };
              if (draftOnly) { const d = await api('POST', '/api/outlook/draft', payload); Object.assign(r, { graphId: d.id, webLink: d.webLink, conversationId: d.conversationId, status: 'drafted' }); r.history.push({ status: 'drafted', at: nowISO(), by: reviewer(), note: 'Draft created in Outlook' }); camp.results.push({ supplierId: s.id, channel: 'email', ok: true }); }
              else { const d = await api('POST', '/api/mail/send', { provider: via(), ...payload }); ok(r, s, `Accepted by ${via() === 'gmail' ? 'Gmail' : 'Microsoft Graph'}. Delivery not confirmed.`, { graphId: d.provider === 'outlook' ? d.id : undefined, gmailId: d.provider === 'gmail' ? d.id : undefined, threadId: d.threadId, conversationId: d.conversationId }); }
              UI.sendLog.push({ ok: true, t: `${s.name} — ${m.to}` });
            } catch (e) { fail(r, s, e); UI.sendLog.push({ ok: false, t: `${s.name} — ${e.message}` }); }
            persist('rfqs', r); render(); await sleep(300);
          });
        }
        for (const s of waList) {
          i++; setProgress(`${i}/${mailList.length + waList.length}`); const num = waNumberOf(s);
          const r = { id: uid('rfq'), prId: pr.id, supplierId: s.id, channel: 'whatsapp', campaignId: camp.id, to: num, subject: 'WhatsApp: ' + UI.waTpl, body: waPreview(pr, s), status: 'draft', history: [], createdAt: nowISO(), approvedBy: reviewer(), approvedAt: nowISO() };
          try { const d = await api('POST', '/api/wati/send', { number: num, template: UI.waTpl, params: waParams(pr, s), broadcast: pr.code + ' ' + pr.api }); r.status = 'wa_sent'; r.sentAt = nowISO(); r.waResponse = d; r.history.push({ status: 'wa_sent', at: nowISO(), by: reviewer(), note: 'Accepted by WATI. Delivery not confirmed.' }); UI.sendLog.push({ ok: true, t: `${s.name} — WhatsApp ${num}` }); camp.results.push({ supplierId: s.id, channel: 'whatsapp', ok: true }); }
          catch (e) { r.status = 'failed'; r.history.push({ status: 'failed', at: nowISO(), by: reviewer(), note: e.message }); UI.sendLog.push({ ok: false, t: `${s.name} — ${e.message}` }); camp.results.push({ supplierId: s.id, channel: 'whatsapp', ok: false, error: e.message }); }
          persist('rfqs', r); render(); await sleep(1200);
        }
      } finally {
        persist('campaigns', camp); audit(draftOnly ? 'Outlook drafts created' : 'Inquiry sent', 'campaign', camp.id, `${pr.code}: ${camp.results.filter(x => x.ok).length}/${camp.results.length} ok via ${via()} (${mode})`);
        UI.sendOk = false; endJob(); toast(`${camp.results.filter(x => x.ok).length} of ${camp.results.length} done.`);
      }
    };
  }

  /* ---------- Replies: Outlook inbox sync ---------- */
  const _vReplies = vReplies;
  vReplies = function () {
    const bar = HEALTH.outlookConnected ? `<div class="note" style="margin-bottom:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span>Outlook connected — bring supplier replies in automatically. Only emails from known supplier contacts or mentioning a PR number are imported.</span><span class="spacer"></span><button class="btn sm primary" data-act="syncInbox" ${BUSY ? 'disabled' : ''}>Sync Outlook replies</button></div>` : '';
    return bar + _vReplies();
  };
  A.syncInbox = async () => {
    startJob('Reading Outlook inbox');
    try {
      const last = S.replies.filter(r => r.graphId).map(r => r.receivedAt).sort().pop();
      const list = await api('GET', '/api/outlook/inbox' + (last ? '?since=' + encodeURIComponent(last) : ''));
      let n = 0, skipped = 0;
      list.forEach(m => {
        if (S.replies.some(r => r.graphId === m.graphId)) return;
        const internal = String((HEALTH.settings && HEALTH.settings.ccEmails) || '').toLowerCase().split(/[;,\s]+/).filter(Boolean);
        if (internal.includes(m.from) || (ME && m.from === String(ME.email).toLowerCase())) { skipped++; return; }
        const r = { id: uid('rep'), graphId: m.graphId, conversationId: m.conversationId, from: m.from, subject: m.subject, body: m.body, receivedAt: m.receivedAt, reviewStatus: 'new', createdAt: nowISO(), loggedBy: 'Outlook sync' };
        const conv = S.rfqs.find(x => x.conversationId && x.conversationId === m.conversationId && (x.mode !== 'bcc' || String(x.to || '').toLowerCase() === m.from));
        if (conv) { r.supplierId = conv.supplierId; r.rfqId = conv.id; r.prId = conv.prId; r.matchReason = 'same Outlook conversation'; if (['sent', 'drafted', 'followup'].includes(conv.status)) setRfqStatus(conv, 'replied', 'Reply synced from Outlook'); }
        else matchReply(r);
        if (!r.supplierId && !r.prId) { skipped++; return; }
        persist('replies', r); n++;
      });
      audit('Outlook inbox synced', 'reply', '', `${n} imported, ${skipped} unrelated skipped`); toast(`${n} supplier repl${n === 1 ? 'y' : 'ies'} imported.`);
    } catch (e) { toast('Inbox sync failed: ' + e.message, 'err'); }
    endJob();
  };

  /* ---------- Evidence research uses the new multi-provider search ---------- */
  runResearch = async function (pr) {
    startJob('Searching the web');
    try {
      const r = await api('POST', '/api/research', { api: pr.api, synonyms: pr.synonyms, country: (pr.countries || '').split(',')[0].trim(), strict: !!pr.countries });
      pr.research = { at: nowISO(), candidates: r.candidates, searches: r.searches, resultsSeen: r.resultsSeen, dropped: 0, tried: r.tried };
      persist('prs', pr); audit('Web research run', 'pr', pr.id, `${r.candidates.length} pages · ` + (r.tried || []).map(t => t.provider + ':' + (t.ok ? 'ok' : t.skipped || 'fail')).join(' '));
      UI.rsel = new Set(); toast(`${r.candidates.length} page(s) found.`);
    } catch (e) { toast('Web research failed: ' + e.message, 'err'); }
    endJob();
  };

  /* ================= USERS (admin) ================= */
  let USERS = null;
  function vUsers() {
    if (!isAdmin()) return emptyBox('Administrator only', '');
    if (USERS === null) { api('GET', '/api/users').then(u => { USERS = u; render(); }).catch(e => { USERS = []; toast(e.message, 'err'); }); return `<div class="loading"><span class="spin"></span></div>`; }
    return `<div class="page-head"><div><h1>Users</h1><p>Everyone signs in with their own email. All users see the same shared data; actions are logged with their name.</p></div><button class="btn primary" data-act="addUser">Add user</button></div>
    <div class="panel"><div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>${USERS.map(u => `<tr><td><strong>${esc(u.name)}</strong>${u.id === ME.id ? ' <span class="tag">you</span>' : ''}</td><td class="mono">${esc(u.email)}</td><td><select class="inp" style="width:auto" data-change="uRole" data-id="${u.id}">${['admin', 'procurement', 'viewer'].map(r => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td><td>${u.active ? '<span class="b ok">Active</span>' : '<span class="b">Disabled</span>'}${u.mustChange ? ' <span class="tag">temp password</span>' : ''}</td><td>${u.lastLogin ? fmtDate(u.lastLogin) : '—'}</td><td><div class="row" style="gap:6px"><button class="btn sm" data-act="uReset" data-id="${u.id}">Reset password</button><button class="btn sm ${u.active ? 'danger' : ''}" data-act="uToggle" data-id="${u.id}">${u.active ? 'Disable' : 'Enable'}</button></div></td></tr>`).join('')}</tbody></table></div>
    <p class="hint" style="margin-top:10px"><b>admin</b>: everything incl. users and backups · <b>procurement</b>: find, verify, send · <b>viewer</b>: read-only (e.g. management, auditors)</p></div>`;
  }
  const tempPass = () => Array.from(crypto.getRandomValues(new Uint8Array(9))).map(b => 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
  Object.assign(A, {
    addUser: () => modal(`<h2>Add user</h2><form data-submit="addUser"><div class="form" style="grid-template-columns:1fr 1fr"><label class="f">Name<input name="name" required></label><label class="f">Email<input name="email" type="email" required></label><label class="f">Role<select name="role"><option>procurement</option><option>viewer</option><option>admin</option></select></label><label class="f">Temporary password<input name="password" value="${tempPass()}" required minlength="8"></label></div><p class="hint">Share the temporary password privately. The user is asked to change it at first sign-in.</p><div class="row" style="margin-top:12px"><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary">Add user</button></div></form>`),
    uReset: el => { const p = tempPass(); if (!confirm('Set a new temporary password for this user?')) return; api('PATCH', '/api/users/' + el.dataset.id, { password: p }).then(() => { USERS = null; modal(`<h2>New temporary password</h2><p class="mono" style="font-size:18px">${esc(p)}</p><p class="muted">Share it privately. The user must change it after signing in.</p><button class="btn primary" data-act="closeModal">Done</button>`); render(); }).catch(e => toast(e.message, 'err')); },
    uToggle: el => { const u = USERS.find(x => x.id === el.dataset.id); api('PATCH', '/api/users/' + u.id, { active: !u.active }).then(() => { USERS = null; audit((u.active ? 'Disabled' : 'Enabled') + ' user', 'user', u.id, u.email); render(); }).catch(e => toast(e.message, 'err')); }
  });
  SUBMIT.addUser = async (f, fd) => { try { const u = await api('POST', '/api/users', { name: fd.get('name'), email: fd.get('email'), role: fd.get('role'), password: fd.get('password') }); audit('Added user', 'user', u.id, `${u.email} (${u.role})`); USERS = null; closeModal(); toast('User added. Share the temporary password privately.'); render(); } catch (e) { toast(e.message, 'err'); } };
  CHANGE.uRole = el => api('PATCH', '/api/users/' + el.dataset.id, { role: el.value }).then(() => { USERS = null; audit('Changed user role', 'user', el.dataset.id, el.value); render(); }).catch(e => { toast(e.message, 'err'); USERS = null; render(); });

  /* ================= BACKUPS (admin) ================= */
  let SNAPS = null;
  function vBackups() {
    if (!isAdmin()) return emptyBox('Administrator only', '');
    if (SNAPS === null) { api('GET', '/api/admin/snapshots').then(s => { SNAPS = s; render(); }).catch(e => { SNAPS = []; toast(e.message, 'err'); }); }
    const counts0 = COLLS.map(c => [c, (S[c] || []).length]);
    return `<div class="page-head"><div><h1>Backups</h1><p>Everything the tool finds is saved on the server the moment it is found. Snapshots and downloads give you extra copies.</p></div></div>
    <div class="grid g3"><div class="panel"><h2>Download everything</h2><p class="muted">All suppliers, contacts, evidence, requests, emails and replies.</p><div class="row"><button class="btn primary" data-act="allExcel">Excel (all data)</button><button class="btn" data-act="backup">JSON backup</button></div></div>
    <div class="panel"><h2>Server snapshot</h2><p class="muted">Saves a full copy inside the database. The last 14 are kept.${HEALTH.cron ? ' A daily automatic snapshot is on.' : ' Set CRON_SECRET to enable the daily automatic snapshot.'}</p><button class="btn" data-act="snapNow" ${BUSY ? 'disabled' : ''}>Create snapshot now</button></div>
    <div class="panel"><h2>Restore</h2><p class="muted">Adds or overwrites records from a JSON backup. Never deletes anything.</p><label class="btn" style="cursor:pointer">Restore from file…<input type="file" accept=".json" hidden data-change="restore"></label></div></div>
    <div class="panel"><h2>Snapshots</h2>${SNAPS === null ? '<span class="spin"></span>' : SNAPS.length ? `<div class="tbl-wrap"><table><thead><tr><th>When</th><th>By</th><th>Records</th><th></th></tr></thead><tbody>${SNAPS.map(s => `<tr><td>${fmtDate(s.at)}</td><td>${esc(s.by)}</td><td class="faint" style="font-size:12.5px">${Object.entries(s.counts || {}).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(' · ')}</td><td><button class="btn sm" data-act="snapDl" data-id="${esc(s.id)}">Download</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No snapshots yet.</p>'}</div>
    <div class="panel"><h2>Stored now</h2><div class="stat-row">${counts0.filter(([c]) => ['suppliers', 'contacts', 'sources', 'claims', 'prs', 'rfqs', 'replies', 'audit'].includes(c)).map(([c, n]) => `<div><b>${n}</b><span>${c}</span></div>`).join('')}</div><p class="hint">Storage: ${esc(HEALTH.storage)}${HEALTH.vercel && HEALTH.storage === 'file' ? ' — <b style="color:var(--red)">on Vercel this is temporary. Connect Supabase (README) or data will be lost.</b>' : ''}</p></div>`;
  }
  Object.assign(A, {
    snapNow: async () => { startJob('Creating snapshot'); try { const r = await api('POST', '/api/admin/snapshot'); SNAPS = null; toast('Snapshot saved'); audit('Snapshot created', 'backup', r.id, ''); } catch (e) { toast(e.message, 'err'); } endJob(); },
    snapDl: async el => { try { const d = await api('GET', '/api/admin/snapshots/' + encodeURIComponent(el.dataset.id)); saveFile(el.dataset.id + '.json', JSON.stringify(d), 'application/json'); } catch (e) { toast(e.message, 'err'); } },
    allExcel: () => {
      const sup = live().map(s => ({ Company: s.name, Type: s.type, Country: s.country, Website: s.website, Emails: contactsOf(s.id).filter(c => c.kind === 'email').map(c => c.value).join(', '), Phones: contactsOf(s.id).filter(c => c.kind !== 'email').map(c => c.normalized || c.value).join(', '), Identity: identityStatus(s)[0], 'API evidence': apiStatus(s)[0], QA: qaStatus(s)[0], Origin: s.origin, 'Purchase requests': (s.prIds || []).map(id => (byId('prs', id) || {}).code).join(', '), Added: fmtDate(s.createdAt) }));
      const ct = S.contacts.map(c => ({ Company: (byId('suppliers', c.supplierId) || {}).name, Type: c.kind, Value: c.value, Normalised: c.normalized, Person: c.person, Designation: c.designation, Source: c.provider || (byId('sources', c.sourceId) || {}).type, 'Source URL': (byId('sources', c.sourceId) || {}).url || '', Quote: c.excerpt, Decision: c.decision, WhatsApp: c.kind === 'email' ? '' : (WA[c.wa] || WA.found)[0] }));
      const prs = S.prs.map(p => ({ ID: p.code, API: p.api, Qty: p.qty + ' ' + p.unit, Pharmacopoeia: p.pharmacopoeia, Countries: p.countries, Owner: p.owner, Status: p.status, Created: fmtDate(p.createdAt) }));
      const rf = S.rfqs.map(r => ({ Request: (byId('prs', r.prId) || {}).code, Supplier: (byId('suppliers', r.supplierId) || {}).name, Channel: r.channel || 'email', To: r.to, Subject: r.subject, Status: (RFQ_STATUS[r.status] || [r.status])[0], Sent: fmtDate(r.sentAt) }));
      const rp = S.replies.map(r => ({ Received: fmtDate(r.receivedAt), From: r.from, Supplier: (byId('suppliers', r.supplierId) || {}).name || 'Unmatched', Subject: r.subject, Price: r.extracted && r.extracted.price ? r.extracted.price.value : '' }));
      const au = S.audit.slice().sort((a, b) => a.at.localeCompare(b.at)).map(a => ({ When: fmtDate(a.at), Who: a.by, Action: a.action, Detail: a.detail }));
      const f = xlsxFile([['Suppliers', sup], ['Contacts', ct], ['Purchase requests', prs], ['Emails & WhatsApp', rf], ['Replies', rp], ['Audit', au]]); f && saveFile(`westcoast_procurement_all_data_${new Date().toISOString().slice(0, 10)}.xlsx`, f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
  });

  /* ================= INTEGRATIONS & SETTINGS ================= */
  vIntegrations = function () {
    const out = k => UI.tests && UI.tests[k] ? `<div class="note ${UI.tests[k].ok ? '' : 'bad'}" style="margin-top:10px;font-size:13px">${esc(UI.tests[k].msg)}</div>` : '';
    const card = (name, ok, body, actions = '', k = '') => `<div class="panel icard"><div class="row"><h2 style="margin:0">${name}</h2><span class="spacer"></span>${ok ? '<span class="b ok">Connected</span>' : '<span class="b">Not connected</span>'}</div><p class="muted">${body}</p><div class="row">${actions}${ok && k ? `<button class="btn sm" data-act="itest" data-k="${k}" ${BUSY ? 'disabled' : ''}>Run test</button>` : ''}</div>${out(k)}</div>`;
    return `<div class="page-head"><div><h1>Integrations</h1><p>Keys live in the server environment variables (Vercel → Settings → Environment Variables, or the .env file). Tests make a real call.</p></div></div>
    <div class="grid g2">
    ${card('Claude API', HEALTH.claude, `AI extraction and web search. Model ${esc(HEALTH.model || '')}. Env: ANTHROPIC_API_KEY (+ ANTHROPIC_WORKSPACE_ID if your key is not scoped to a workspace).`, '', 'claude')}
    ${card('Google Gemini (free tier)', HEALTH.gemini, `Free alternative for AI extraction and Google-Search-grounded research — used automatically when Claude is missing or fails. Get a key at aistudio.google.com. Env: GEMINI_API_KEY.`, '', 'gemini')}
    ${card('Google results (Serper)', HEALTH.serper, 'Plain Google search results; last fallback when no AI search works. 2,500 free searches on signup at serper.dev. Env: SERPER_API_KEY.', '', 'serper')}
    ${card('Apollo.io', HEALTH.apollo, 'Company search, people search and business emails (enrichment uses credits). Env: APOLLO_API_KEY.', HEALTH.apollo ? '<button class="btn sm" data-go="apollo">Lead finder</button>' : '', 'apollo')}
    ${card('Microsoft Outlook', HEALTH.outlookConnected, HEALTH.outlook ? (HEALTH.outlookConnected ? 'Your mailbox is connected: drafts, sending and reply sync use it. Each user connects their own Outlook.' : 'Connect your own Outlook mailbox to create drafts and send from it.') : 'Needs a Microsoft Entra app registration. Env: MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID, APP_URL (see README).', HEALTH.outlook ? (HEALTH.outlookConnected ? '<button class="btn sm danger" data-act="olDisconnect">Disconnect</button>' : '<button class="btn sm blue" data-act="olConnect">Connect Outlook</button>') : '', HEALTH.outlookConnected ? 'outlook' : '')}
    ${card('WhatsApp (WATI)', HEALTH.wati, 'Template messages to suppliers through WATI. Env: WATI_API_ENDPOINT (from WATI → API Docs, includes your tenant ID) and WATI_ACCESS_TOKEN.', '', 'wati')}
    ${card('Database', HEALTH.storage !== 'file' || !HEALTH.vercel, HEALTH.storage.startsWith('mysql') ? 'MySQL through your PHP hosting — open phpMyAdmin to see table wc_records and the v_suppliers, v_contacts, v_purchase_requests, v_messages, v_replies, v_audit views.' : HEALTH.storage === 'supabase' ? 'Supabase — data is permanent and shared.' : HEALTH.vercel ? 'Files on Vercel are temporary. Connect Supabase (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).' : 'Local files in the data folder.')}
    ${card('Daily backup', HEALTH.cron, 'Vercel Cron calls /api/cron/snapshot every night. Env: CRON_SECRET.', isAdmin() ? '<button class="btn sm" data-go="backups">Backups</button>' : '')}
    </div>`;
  };
  Object.assign(A, {
    itest: async el => { const k = el.dataset.k; startJob('Testing ' + k); try { const r = await api('POST', '/api/test/' + k); UI.tests = { ...(UI.tests || {}), [k]: { ok: true, msg: 'OK — ' + JSON.stringify(r).slice(0, 220) } }; audit('Integration test OK: ' + k, 'integration', '', ''); } catch (e) { UI.tests = { ...(UI.tests || {}), [k]: { ok: false, msg: 'Failed: ' + e.message } }; } endJob(); },
    olDisconnect: async () => { if (!confirm('Disconnect your Outlook from this tool?')) return; await api('POST', '/api/outlook/disconnect'); HEALTH.outlookConnected = false; toast('Outlook disconnected'); render(); }
  });
  const _vSettings = vSettings;
  vSettings = function () {
    const st = HEALTH.settings || {};
    return _vSettings() + (isAdmin() ? `<form class="panel" data-submit="saveAppSettings"><h2>Search & AI (all users)</h2><div class="form"><label class="f">AI provider<select name="aiProvider">${[['auto', 'Auto: Claude, then Gemini'], ['gemini', 'Gemini first (free tier)']].map(([v, l]) => `<option value="${v}" ${st.aiProvider === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="f">Search provider<select name="searchProvider">${[['auto', 'Auto: Claude → Gemini → Serper'], ['gemini', 'Google Gemini'], ['serper', 'Google results (Serper)'], ['claude', 'Claude web search']].map(([v, l]) => `<option value="${v}" ${st.searchProvider === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="f span3">Always CC on supplier inquiry emails<input name="ccEmails" value="${esc(st.ccEmails || '')}" placeholder="kcp@westcoastin.com, parth@westcoastin.com"></label><label class="row span3" style="gap:8px;font-size:14px"><input type="checkbox" class="chk" name="replyToCc" ${st.replyToCc !== false ? 'checked' : ''}> Supplier replies also go to these addresses (Reply-To)</label><label class="f">Default country<select name="defaultCountry">${COUNTRIES.map(c => `<option ${st.defaultCountry === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div><button class="btn primary" style="margin-top:12px">Save</button></form>` : '');
  };
  SUBMIT.saveAppSettings = async (f, fd) => { try { HEALTH.settings = await api('PUT', '/api/settings', { aiProvider: fd.get('aiProvider'), searchProvider: fd.get('searchProvider'), defaultCountry: fd.get('defaultCountry'), ccEmails: fd.get('ccEmails') || '', replyToCc: !!fd.get('replyToCc') }); UI.cc = undefined; audit('Settings changed', 'settings', '', JSON.stringify(HEALTH.settings)); toast('Saved'); render(); } catch (e) { toast(e.message, 'err'); } };
  // Settings page: hide the old local "your name" field (names now come from the login)
  const _saveSettings = SUBMIT.saveSettings;
  SUBMIT.saveSettings = (f, fd) => { localStorage.setItem('wcpa-theme', fd.get('theme')); applyTheme(); toast('Saved'); render(); };


  /* ================= v2.2 — PM / RM departments ================= */
  const DEPT_NAME = { PM: 'Packing Material', RM: 'Raw Material', MISC: 'Miscellaneous', LOG: 'Logistics' };
  const WDEPTS = ['RM', 'PM', 'MISC', 'LOG'];
  const myDept = () => (ME && WDEPTS.includes(ME.dept)) ? ME.dept : null;   // null = ALL (can switch)
  const activeDept = () => myDept() || (WDEPTS.includes(localStorage.getItem('wcpa-dept')) ? localStorage.getItem('wcpa-dept') : 'RM');
  const isPM = () => activeDept() === 'PM';
  const PARTS = ['prs', 'suppliers', 'claims', 'contacts', 'sources', 'rfqs', 'replies', 'campaigns', 'dupes', 'audit'];

  // persist: stamp department + limit parallel saves (big imports)
  let PENDING = 0; const waiters = []; const queue = []; let active = 0;
  const pump = () => { while (active < 6 && queue.length) { const job = queue.shift(); active++; job().finally(() => { active--; PENDING--; if (!PENDING) waiters.splice(0).forEach(f => f()); pump(); }); } };
  const drain = () => PENDING ? new Promise(r => waiters.push(r)) : Promise.resolve();
  const saveChains = {};
  persist = function (coll, obj) {
    obj.updatedAt = nowISO();
    if (PARTS.includes(coll) && !WDEPTS.includes(obj.dept)) obj.dept = activeDept();
    const arr = S[coll] || (S[coll] = []); const i = arr.findIndex(x => x.id === obj.id); if (i >= 0) arr[i] = obj; else arr.push(obj);
    const key = coll + '/' + obj.id; const clean = JSON.parse(JSON.stringify(obj));
    PENDING++;
    const prev = saveChains[key] || Promise.resolve();
    const p = new Promise(res => queue.push(() => prev.then(() => api('PUT', `/api/data/${coll}/${encodeURIComponent(obj.id)}?dept=${activeDept()}`, clean)).catch(e => toast('Could not save: ' + e.message, 'err')).finally(res)));
    saveChains[key] = p; pump();
  };
  nextPRCode = function () {
    const pre = activeDept(), y = new Date().getFullYear();
    const n = S.prs.map(p => String(p.code || '')).filter(c => c.startsWith(pre + '-' + y) || c.startsWith('PR-' + y)).map(c => +(c.split('-')[2] || 0)).reduce((a, b) => Math.max(a, b), 0);
    return `${pre}-${y}-${String(n + 1).padStart(4, '0')}`;
  };
  async function loadData() {
    const data = await api('GET', '/api/data?dept=' + activeDept());
    COLLS.forEach(c => S[c] = data[c] || []);
    seedDeptTemplates();
  }
  function seedDeptTemplates() {
    if (!canWrite()) return;
    const D0 = activeDept();
    if (D0 === 'RM' && !S.templates.some(t => !t.archived)) seedTemplate();
    if ((D0 === 'MISC' || D0 === 'LOG') && !S.templates.some(t => t.dept === D0 || t.id === 'tpl_' + D0.toLowerCase())) persist('templates', { id: 'tpl_' + D0.toLowerCase(), dept: D0, name: D0 === 'LOG' ? 'Freight quotation request' : 'Standard RFQ', archived: false, createdAt: nowISO(),
      subject: D0 === 'LOG' ? 'Freight Quotation Request — {{MATERIAL}} — {{PURCHASE_REQUEST_ID}}' : 'Request for Quotation — {{MATERIAL}} — {{QUANTITY}} {{UNIT}}',
      body: `Dear {{CONTACT_NAME}},\n\nGreetings from WESTCOAST PHARMACEUTICAL WORKS LTD., Ahmedabad, India.\n\nWe have a requirement for: {{MATERIAL}}\nQuantity: {{QUANTITY}} {{UNIT}}\nDetails: {{SPECIFICATION}}\n\nPlease share your best quotation with all charges, delivery / transit time, payment terms and validity.\n\nReference: {{PURCHASE_REQUEST_ID}}\n\nBest regards,\n\n${D0 === 'LOG' ? 'Logistics' : 'Purchase'} Department\nWESTCOAST PHARMACEUTICAL WORKS LTD.\nAhmedabad, Gujarat, India` });
    if (isPM() && !S.templates.some(t => t.id === 'tpl_pm' || t.dept === 'PM')) persist('templates', { id: 'tpl_pm', dept: 'PM', name: 'Standard PM RFQ', archived: false, createdAt: nowISO(),
      subject: 'Request for Quotation — {{MATERIAL}} — {{QUANTITY}} {{UNIT}} — {{PURCHASE_REQUEST_ID}}',
      body: `Dear {{CONTACT_NAME}},

Greetings from WESTCOAST PHARMACEUTICAL WORKS LTD., Ahmedabad, India.

We have a requirement for the following packing material:

Item: {{MATERIAL}}
Quantity: {{QUANTITY}} {{UNIT}}
Specification: {{SPECIFICATION}}

Please share:
1. Rate per unit (with taxes and freight terms)
2. Minimum order quantity
3. Lead time / delivery schedule
4. Technical specification (size, GSM / thickness, material grade, printing)
5. Sample availability
6. Payment terms and quotation validity
7. COA and pharma / food-grade compliance documents

Reference: {{PURCHASE_REQUEST_ID}}

Best regards,

Purchase Department (Packing Material)
WESTCOAST PHARMACEUTICAL WORKS LTD.
Ahmedabad, Gujarat, India` });
  }
  // boot: load data for the active department
  const _boot = boot;
  boot = async function () {
    await _boot();
    if (!ME) return;
    try { await loadData(); } catch (e) { toast(e.message, 'err'); }
    paintDept(); render();
  };
  function paintDept() {
    let el = $('#deptSwitch');
    if (!el) { el = document.createElement('div'); el.id = 'deptSwitch'; el.className = 'dept-switch'; $('.who').prepend(el); }
    el.innerHTML = myDept() ? `<span class="dept-pill on">${myDept()} · ${DEPT_NAME[myDept()]}</span>` : WDEPTS.map(d => `<button class="dept-pill ${activeDept() === d ? 'on' : ''}" data-act="setDept" data-d="${d}" title="${DEPT_NAME[d]}">${d}</button>`).join('');
    document.body.dataset.dept = activeDept();
  }
  A.setDept = async el => {
    if (myDept() || el.dataset.d === activeDept()) return;
    await drain(); localStorage.setItem('wcpa-dept', el.dataset.d);
    Object.assign(UI, { prId: null, sendSel: null, findSel: new Set(), mailTpl: null, cc: undefined }); F.steps = [];
    startJob('Loading ' + DEPT_NAME[el.dataset.d]); try { await loadData(); } catch (e) { toast(e.message, 'err'); } endJob(); paintDept();
    toast('Now working in ' + el.dataset.d + ' — ' + DEPT_NAME[el.dataset.d]);
  };

  // Navigation: add "My suppliers"
  NAV[0][1].splice(1, 0, ['mylist', 'My suppliers (upload)', 'M4 4h16v4H4zM4 10h16v10H4zM9 14h6']);

  // Finder wording for PM
  const _vFind = vFind;
  vFind = function () {
    let h = _vFind();
    if (isPM()) h = h.replace('Which API do you need?', 'Which packing material do you need?').replace('placeholder="e.g. Paracetamol"', 'placeholder="e.g. Aluminium foil, PVC film, Printed carton"').replace(/<label class="f">Pharmacopoeia<select name="pharmacopoeia">[\s\S]*?<\/select><\/label>/, '<input type="hidden" name="pharmacopoeia" value="">')
      .replace(/<select name="unit" style="width:84px">[\s\S]*?<\/select>/, '<select name="unit" style="width:84px">' + ['Nos', 'kg', 'Rolls', 'Pcs', 'Sets', 'MT'].map(u => `<option>${u}</option>`).join('') + '</select>')
      .replace('<input type="checkbox" name="verify" checked>', '<input type="checkbox" name="verify" disabled>').replace('Check API on websites with AI', 'AI API check (RM only)');
    return h;
  };
  const _vFindD = vFind;
  vFind = function () { let h = _vFindD(); const D = activeDept();
    if (D === 'LOG') h = h.replace(/Which (API|packing material) do you need\?/, 'Which freight service do you need?').replace(/placeholder="e\.g\. [^"]*" class="finder-input"/, 'placeholder="e.g. Air freight forwarder, Sea freight to Africa" class="finder-input"');
    if (D === 'MISC') h = h.replace(/Which (API|packing material) do you need\?/, 'Which item do you need?').replace(/placeholder="e\.g\. [^"]*" class="finder-input"/, 'placeholder="e.g. Stainless steel tank, lab glassware" class="finder-input"');
    return h; };
  window.EXTRA_VIEWS_FIND = vFind;
  // search kind
  const _api = api;
  api = function (method, url, body) { if (url === '/api/search/companies' && body) body = { ...body, kind: activeDept() }; if (url.startsWith('/api/apollo/companies') && body && isPM()) body = { ...body, keywords: String(body.keywords || '').replace('active pharmaceutical ingredient,api manufacturer', 'pharmaceutical packaging,packaging materials') }; return _api(method, url, body); };

  /* ---------- My suppliers: upload company list ---------- */
  const MAP_FIELDS = [['name', 'Company / supplier name *', /(supplier|vendor|company|party|firm|organi[sz]ation)(\s*name)?$|^name of (the )?(supplier|vendor|party|company)|^(supplier|vendor|party|company)/i],
    ['email', 'Email(s)', /e-?mail|mail\s*id/i], ['phone', 'Phone / mobile', /phone|mobile|mob\.?|contact\s*(no|number)|tel|cell/i], ['whatsapp', 'WhatsApp number', /whats\s*app/i],
    ['person', 'Contact person', /contact\s*person|person|concern|^name$|attention|kind attn/i], ['designation', 'Designation', /designation|title|post|role/i],
    ['material', 'Material / items supplied', /material|item|product|category|commodity|supplies|description|grade/i], ['city', 'City', /city|town|place|location/i], ['state', 'State', /state/i],
    ['country', 'Country', /country/i], ['website', 'Website', /website|web|url|site/i], ['address', 'Address', /address/i], ['notes', 'Notes / GST / other', /gst|remark|note|comment/i]];
  const IMP = { file: '', sheets: [], sheet: 0, rows: [], head: 0, map: {}, done: null };
  const validEmail = e => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e);
  const splitList = v => String(v || '').split(/[;,\/\n]+|\s{2,}/).map(x => x.trim()).filter(Boolean);
  const cell = (r, k) => IMP.map[k] === undefined || IMP.map[k] === '' ? '' : String(r[IMP.map[k]] ?? '').trim();
  function autoMap() {
    const h = (IMP.rows[IMP.head] || []).map(x => String(x || '').trim()); const used = new Set(); IMP.map = {};
    MAP_FIELDS.forEach(([k, , re]) => { const i = h.findIndex((x, j) => !used.has(j) && x && re.test(x)); if (i >= 0) { IMP.map[k] = i; used.add(i); } });
  }
  function readSheet() {
    const ws = IMP.wb.Sheets[IMP.sheets[IMP.sheet]];
    IMP.rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false }).filter(r => r.some(c => String(c).trim()));
    const kw = /supplier|vendor|company|party|email|mail|mobile|phone|contact|city|state|material/i;
    IMP.head = Math.max(0, IMP.rows.slice(0, 15).findIndex(r => r.filter(c => kw.test(String(c))).length >= 2));
    autoMap();
  }
  const dataRows = () => IMP.rows.slice(IMP.head + 1).filter(r => cell(r, 'name'));
  function importStats() {
    const rows = dataRows(); let withEmail = 0, bad = 0, dup = 0;
    rows.forEach(r => { const em = splitList(cell(r, 'email')); if (em.some(validEmail)) withEmail++; if (em.some(e => !validEmail(e))) bad++; if (findExisting(r)) dup++; });
    return { rows: rows.length, withEmail, bad, dup };
  }
  function findExisting(r) {
    const ems = splitList(cell(r, 'email')).filter(validEmail).map(e => e.toLowerCase());
    for (const e of ems) { const c = S.contacts.find(c => c.kind === 'email' && c.normalized === e); if (c) { const s = byId('suppliers', c.supplierId); if (s && !s.mergedInto) return s; } }
    const d = domainOf(cell(r, 'website')) || (ems[0] && !FREE_MAIL.includes(emailDomain(ems[0])) ? emailDomain(ems[0]) : '');
    if (d) { const s = live().find(x => x.domain === d); if (s) return s; }
    const nn = normName(cell(r, 'name')); return live().find(x => x.normName === nn) || null;
  }
  async function doImport() {
    const rows = dataRows(); if (!rows.length) return toast('No rows with a company name. Check the column mapping.', 'err');
    startJob('Importing suppliers'); let nNew = 0, nUpd = 0, nC = 0, i = 0;
    const src = { id: uid('src'), prId: '', url: '', type: 'Company supplier list', title: 'Company list: ' + IMP.file + (IMP.sheets.length > 1 ? ' / ' + IMP.sheets[IMP.sheet] : ''), text: '', retrievedAt: nowISO(), addedBy: reviewer(), createdAt: nowISO(), extractedAt: nowISO() };
    const lines = [];
    for (const r of rows) {
      i++; if (i % 25 === 0) { setProgress(`${i}/${rows.length}`); await new Promise(res => setTimeout(res, 0)); }
      const line = MAP_FIELDS.map(([k, l]) => cell(r, k) ? `${l.replace(' *', '')}: ${cell(r, k)}` : '').filter(Boolean).join(' | '); lines.push(line);
      const name = cell(r, 'name'); const ems = splitList(cell(r, 'email')).filter(validEmail).map(e => e.toLowerCase());
      const country = cell(r, 'country') || 'India';
      let s = findExisting(r);
      if (!s) { const web = cell(r, 'website'); const dom = domainOf(web) || (ems[0] && !FREE_MAIL.includes(emailDomain(ems[0])) ? emailDomain(ems[0]) : '');
        s = { id: uid('sup'), name, normName: normName(name), website: web, domain: dom, country, state: cell(r, 'state'), city: cell(r, 'city'), address: cell(r, 'address'), type: 'Unknown', origin: 'company', materials: [], prIds: [], qa: { status: 'pending' }, createdAt: nowISO(), notes: cell(r, 'notes') }; nNew++; }
      else { ['state', 'city', 'address'].forEach(f => { if (!s[f] && cell(r, f)) s[f] = cell(r, f); }); if (!s.country) s.country = country; nUpd++; }
      s.materials = [...new Set([...(s.materials || []), ...splitList(cell(r, 'material'))])].slice(0, 40);
      s.onList = true; persist('suppliers', s);
      const person = cell(r, 'person'), desig = cell(r, 'designation');
      const has = v => S.contacts.some(c => c.supplierId === s.id && c.normalized === v);
      ems.forEach(e => { if (has(e)) return; persist('contacts', { id: uid('ct'), supplierId: s.id, sourceId: src.id, kind: 'email', value: e, normalized: e, person, designation: desig, excerpt: line, found: true, decision: 'accepted', reviewer: reviewer(), reviewedAt: nowISO(), provider: 'Company list', retrievedAt: nowISO(), createdAt: nowISO() }); nC++; });
      const addPhone = (v, wa) => { const np = normPhone(v, country); if (!np.normalized || np.normalized.replace(/\D/g, '').length < 10 || has(np.normalized)) return; persist('contacts', { id: uid('ct'), supplierId: s.id, sourceId: src.id, kind: wa ? 'whatsapp' : 'phone', value: v, normalized: np.normalized, code: np.code, person, designation: desig, excerpt: line, found: true, decision: 'accepted', reviewer: reviewer(), reviewedAt: nowISO(), wa: wa ? 'manual' : 'found', waNote: wa ? 'WhatsApp number from company supplier list' : '', provider: 'Company list', retrievedAt: nowISO(), createdAt: nowISO() }); nC++; };
      splitList(cell(r, 'whatsapp')).forEach(v => addPhone(v, true)); splitList(cell(r, 'phone')).forEach(v => addPhone(v, false));
    }
    src.text = lines.join('\n').slice(0, 200000); persist('sources', src);
    setProgress('saving'); await drain();
    audit('Company supplier list imported', 'source', src.id, `${IMP.file}: ${rows.length} rows → ${nNew} new, ${nUpd} updated, ${nC} contacts (${activeDept()})`);
    IMP.done = { nNew, nUpd, nC, rows: rows.length }; IMP.rows = []; endJob(); toast(`${nNew} new and ${nUpd} existing suppliers, ${nC} contacts saved in ${activeDept()}.`);
  }
  const vmKind = s => s.verifiedAt ? 'verified' : (s.origin === 'company' || s.imported) ? 'excel' : 'manual';
  const vmStatus = s => { const k = vmKind(s); return k === 'verified' ? `<span class="b ok" title="${esc('Verified by ' + (s.verifiedBy || '') + ' · ' + fmtDate(s.verifiedAt))}">✓ Verified</span><div class="faint" style="font-size:11px">from Find</div>` : k === 'excel' ? '<span class="b ind">Excel</span>' : '<span class="b">Manual</span>'; };
  function verifyToMaster(ids) {
    const pr0 = byId('prs', UI.prId) || byId('prs', F.prId) || {}; const mat = String(pr0.api || '').trim(); let n = 0;
    ids.forEach(id => { const s = byId('suppliers', id); if (!s || s.onList) return;
      s.onList = true; s.verifiedAt = nowISO(); s.verifiedBy = reviewer();
      if (mat) { s.materials = s.materials || []; if (!s.materials.some(m => normText(m) === normText(mat))) s.materials.push(mat); }
      contactsOf(s.id).filter(c => c.decision === 'pending' && (c.kind === 'email' || c.kind === 'phone' || c.kind === 'whatsapp')).forEach(c => { c.decision = 'accepted'; c.decidedBy = reviewer(); c.decidedAt = nowISO(); persist('contacts', c); });
      persist('suppliers', s); n++; });
    if (n) audit('Verified and added to Vendor master', 'supplier', ids.join(','), `${n} supplier(s) from Find${mat ? ' — ' + mat : ''} (${activeDept()})`);
    return n;
  }
  A.fVerify = el => { const s = byId('suppliers', el.dataset.id); if (!s) return; const em = contactsOf(s.id).filter(c => c.kind === 'email');
    modal(`<h2>Verify ${esc(s.name)}</h2><p>Add this supplier to <b>Vendor master (${activeDept()})</b> as verified${(byId('prs', UI.prId) || {}).api ? ` for <b>${esc(byId('prs', UI.prId).api)}</b>` : ''}?</p>
      <div class="files">${[s.city, s.state].filter(Boolean).map(x => `<span class="tag">${esc(x)}</span>`).join(' ')} ${em.map(c => `<span class="tag mono">${esc(c.value)}</span>`).join(' ') || '<span class="b bad plain">no email</span>'} ${s.website ? `<a href="${esc(/^https?:/.test(s.website) ? s.website : 'https://' + s.website)}" target="_blank" rel="noopener noreferrer">${esc(s.domain || s.website)}</a>` : ''}</div>
      <p class="muted" style="font-size:13px">Check the website, email and location look right. Its emails and phone numbers are accepted at the same time.</p>
      <div class="row"><button class="btn" data-act="closeModal">Cancel</button><button class="btn primary" data-act="fVerifyGo" data-id="${s.id}">✓ Verify &amp; add</button></div>`); };
  A.fVerifyGo = el => { const n = verifyToMaster([el.dataset.id]); closeModal(); toast(n ? 'Added to Vendor master as verified.' : 'Already in Vendor master.'); render(); };
  A.fVerifyAll = () => { const ids = [...(UI.findSel || [])]; const n = verifyToMaster(ids); toast(n ? `${n} supplier(s) verified and added to Vendor master (${activeDept()}).` : 'They are already in Vendor master.'); render(); };
  CHANGE.mStatus = el => { UI.filters.mStatus = el.value; render(); };
  function vMyList() {
    const D = activeDept(); const f = UI.filters;
    const list = live().filter(s => s.onList || s.origin === 'company' || (s.materials && s.materials.length));
    const mats = [...new Set(list.flatMap(s => s.materials || []))].sort((a, b) => a.localeCompare(b));
    const states = [...new Set(list.map(s => s.state).filter(Boolean))].sort();
    const cities = [...new Set(list.filter(s => !f.mState || s.state === f.mState).map(s => s.city).filter(Boolean))].sort();
    let rows = f.mStatus ? list.filter(s => vmKind(s) === f.mStatus) : list;
    if (f.mMat) rows = rows.filter(s => (s.materials || []).some(m => normText(m) === normText(f.mMat)));
    if (f.mState) rows = rows.filter(s => s.state === f.mState);
    if (f.mCity) rows = rows.filter(s => s.city === f.mCity);
    if (f.mq) { const q = normText(f.mq); rows = rows.filter(s => normText([s.name, s.city, s.state, (s.materials || []).join(' '), contactsOf(s.id).map(c => c.value).join(' ')].join(' ')).includes(q)); }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const sel = UI.mSel || (UI.mSel = new Set());
    const st = IMP.rows.length ? importStats() : null;
    const head = IMP.rows[IMP.head] || [];
    return `<div class="page-head"><div><h1>My suppliers <span class="tag">${D} · ${DEPT_NAME[D]}</span></h1><p>Upload your company's supplier list (Excel or CSV) once, then send one inquiry to all of them — or only to those who supply a particular material.</p></div><div class="row"><label class="btn primary" style="cursor:pointer">Upload Excel / CSV<input type="file" accept=".xlsx,.xls,.csv" hidden data-change="impFile" ${canWrite() ? '' : 'disabled'}></label><button class="btn" data-act="impTemplate">Download sample format</button></div></div>
    ${IMP.rows.length ? `<div class="panel"><div class="row"><h2 style="margin:0">Check columns — ${esc(IMP.file)}</h2>${IMP.sheets.length > 1 ? `<select class="inp" style="width:auto" data-change="impSheet">${IMP.sheets.map((n, i) => `<option value="${i}" ${i === IMP.sheet ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}<span class="spacer"></span><label class="f" style="flex-direction:row;align-items:center;gap:6px">Header row<input class="inp" type="number" min="1" style="width:70px" value="${IMP.head + 1}" data-change="impHead"></label></div>
      <div class="map-grid">${MAP_FIELDS.map(([k, l]) => `<label class="f">${l}<select data-change="impMap" data-k="${k}"><option value="">— not in file —</option>${head.map((h, i) => `<option value="${i}" ${IMP.map[k] === i ? 'selected' : ''}>${esc(String(h || 'Column ' + (i + 1)))}</option>`).join('')}</select></label>`).join('')}</div>
      <div class="stat-row"><div><b>${st.rows}</b><span>suppliers in file</span></div><div><b>${st.withEmail}</b><span>with valid email</span></div><div><b>${st.bad}</b><span>with an invalid email (skipped)</span></div><div><b>${st.dup}</b><span>already in ${D} (will be updated)</span></div></div>
      <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr>${['name', 'email', 'phone', 'material', 'city', 'state'].map(k => `<th>${MAP_FIELDS.find(x => x[0] === k)[1].replace(' *', '')}</th>`).join('')}</tr></thead><tbody>${dataRows().slice(0, 8).map(r => `<tr>${['name', 'email', 'phone', 'material', 'city', 'state'].map(k => `<td>${esc(cell(r, k))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="row" style="margin-top:14px"><button class="btn" data-act="impCancel">Cancel</button><button class="btn primary" data-act="impGo" ${IMP.map.name === undefined || BUSY ? 'disabled' : ''}>Import ${st.rows} suppliers into ${D}</button></div></div>` : ''}
    ${IMP.done ? `<div class="note" style="margin-bottom:16px">Imported ${IMP.done.rows} rows: <b>${IMP.done.nNew}</b> new suppliers, <b>${IMP.done.nUpd}</b> updated, <b>${IMP.done.nC}</b> emails / numbers saved.</div>` : ''}
    <div class="panel"><div class="row" style="margin-bottom:12px"><h2 style="margin:0">${list.length} suppliers on your ${D} list</h2><span class="spacer"></span>
      <input class="inp" style="max-width:200px" placeholder="Search" value="${esc(f.mq || '')}" data-input="mq">
      <select class="inp" style="width:auto" data-change="mMat"><option value="">All materials</option>${mats.map(m => `<option ${m === f.mMat ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      <select class="inp" style="width:auto" data-change="mState"><option value="">All states</option>${states.map(m => `<option ${m === f.mState ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      <select class="inp" style="width:auto" data-change="mCity"><option value="">All cities</option>${cities.map(m => `<option ${m === f.mCity ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
      <select class="inp" style="width:auto" data-change="mStatus"><option value="">All statuses</option>${[['excel', 'Excel upload'], ['verified', 'Verified from Find'], ['manual', 'Added manually']].map(([k, l]) => `<option value="${k}" ${f.mStatus === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn sm" data-act="mAll">Select ${rows.length}</button><button class="btn sm" data-act="mNone">Clear</button><button class="btn sm" data-act="addSupplier">Add one manually</button></div>
      ${rows.length ? `<div class="tbl-wrap"><table class="list"><thead><tr><th></th><th>#</th><th>Supplier</th><th>Status</th><th>Materials</th><th>City</th><th>State</th><th>Email</th><th>Phone / WhatsApp</th><th>Last inquiry</th></tr></thead><tbody>${rows.slice(0, 1000).map((s, i) => { const em = contactsOf(s.id).filter(c => c.kind === 'email' && c.decision !== 'rejected'); const last = S.rfqs.filter(r => r.supplierId === s.id && r.sentAt).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0]; const rep = S.replies.some(r => r.supplierId === s.id);
        return `<tr class="${sel.has(s.id) ? 'sel' : ''}"><td><input type="checkbox" class="chk" data-change="mSel" data-id="${s.id}" ${sel.has(s.id) ? 'checked' : ''}></td><td class="mono faint">${i + 1}</td><td><a href="#" data-act="openSup" data-id="${s.id}"><strong>${esc(s.name)}</strong></a></td><td>${vmStatus(s)}</td><td>${(s.materials || []).slice(0, 4).map(m => `<span class="tag">${esc(m)}</span>`).join(' ')}${(s.materials || []).length > 4 ? ` <span class="faint">+${s.materials.length - 4}</span>` : ''}</td><td>${esc(s.city || '—')}</td><td>${esc(s.state || '—')}</td><td class="mono">${em.length ? esc(em[0].value) + (em.length > 1 ? ` <span class="tag">+${em.length - 1}</span>` : '') : '<span class="b bad plain">No email</span>'}</td><td class="mono">${esc(waNumberOf(s) || phoneOf(s) || '—')}</td><td>${last ? fmtDay(last.sentAt) + (rep ? ' <span class="b ok">replied</span>' : '') : '<span class="faint">—</span>'}</td></tr>`; }).join('')}</tbody></table></div>` : emptyBox(list.length ? 'No supplier matches these filters' : 'Your list is empty', list.length ? '' : 'Upload your company supplier Excel above, or add suppliers one by one.')}
    </div>
    <form class="panel sendbox" data-submit="bulkInquiry"><h2>Send one inquiry to the selected ${sel.size} supplier${sel.size === 1 ? '' : 's'}</h2>
      <div class="form"><label class="f span2">${D === 'PM' ? 'Packing material' : 'Raw material'} *<input name="material" required value="${esc(UI.bMat || f.mMat || '')}" placeholder="${D === 'PM' ? 'e.g. Aluminium foil 0.025 mm' : 'e.g. Microcrystalline Cellulose'}"></label>
      <label class="f">Quantity<div class="row" style="gap:6px;flex-wrap:nowrap"><input name="qty" value="${esc(UI.bQty || '')}" placeholder="e.g. 500" style="min-width:0"><select name="unit" style="width:90px">${(D === 'PM' ? ['Nos', 'kg', 'Rolls', 'Pcs', 'Sets', 'MT'] : ['kg', 'g', 'MT', 'L']).map(u => `<option>${u}</option>`).join('')}</select></div></label>
      ${D === 'RM' ? `<label class="f">Grade / pharmacopoeia<select name="pharmacopoeia">${['IP', 'BP', 'USP', 'Ph. Eur.', 'IP/BP/USP as applicable'].map(p => `<option>${p}</option>`).join('')}</select></label>` : ''}
      <label class="f span3">Specification / notes (goes into the email)<textarea name="spec" rows="2" placeholder="e.g. 0.025 mm, printed, 1 colour, 260 mm width">${esc(UI.bSpec || '')}</textarea></label></div>
      <div class="row" style="margin-top:12px"><button class="btn primary big" ${sel.size && canWrite() ? '' : 'disabled'}>Next: review & send →</button><span class="faint" style="font-size:13px">You will test the email on yourself first, then send to all in one click. CC and reply copies go to the addresses in Settings.</span></div></form>`;
  }
  Object.assign(CHANGE, {
    impFile: async el => {
      const file = el.files[0]; if (!file) return; if (file.size > 15e6) return toast('File is bigger than 15 MB.', 'err');
      try { const buf = await file.arrayBuffer(); IMP.wb = XLSX.read(buf, { type: 'array' }); IMP.sheets = IMP.wb.SheetNames; IMP.sheet = 0; IMP.file = file.name; IMP.done = null; readSheet(); if (IMP.map.name === undefined) toast('Could not find the company-name column — pick it in the list below.', 'err'); render(); }
      catch (e) { toast('Could not read this file: ' + e.message, 'err'); } el.value = '';
    },
    impSheet: el => { IMP.sheet = +el.value; readSheet(); render(); },
    impHead: el => { IMP.head = Math.max(0, (+el.value || 1) - 1); autoMap(); render(); },
    impMap: el => { if (el.value === '') delete IMP.map[el.dataset.k]; else IMP.map[el.dataset.k] = +el.value; render(); },
    mMat: el => { UI.filters.mMat = el.value; render(); }, mState: el => { UI.filters.mState = el.value; UI.filters.mCity = ''; render(); }, mCity: el => { UI.filters.mCity = el.value; render(); },
    mSel: el => { el.checked ? UI.mSel.add(el.dataset.id) : UI.mSel.delete(el.dataset.id); render(); }
  });
  INPUT.mq = v => UI.filters.mq = v;
  Object.assign(A, {
    impGo: () => doImport(), impCancel: () => { IMP.rows = []; render(); },
    impTemplate: () => { const f = xlsxFile([['Suppliers', [{ 'Supplier name': 'ABC Packaging Pvt Ltd', 'Email': 'sales@abcpack.example; purchase@abcpack.example', 'Mobile': '+91 98250 00000', 'WhatsApp': '+91 98250 00000', 'Contact person': 'Mr. Shah', 'Designation': 'Sales Manager', 'Material': 'Aluminium foil, PVC film', 'City': 'Ahmedabad', 'State': 'Gujarat', 'Country': 'India', 'Website': 'abcpack.example', 'Address': 'Plot 1, GIDC Vatva', 'Notes': 'GST 24XXXXX' }]]]); f && saveFile('supplier_list_format.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); },
    mAll: () => { const f = UI.filters; live().filter(s => (s.onList || s.origin === 'company' || (s.materials && s.materials.length)) && (!f.mMat || (s.materials || []).some(m => normText(m) === normText(f.mMat))) && (!f.mState || s.state === f.mState) && (!f.mCity || s.city === f.mCity) && (!f.mq || normText([s.name, s.city, s.state, (s.materials || []).join(' '), contactsOf(s.id).map(c => c.value).join(' ')].join(' ')).includes(normText(f.mq)))).forEach(s => UI.mSel.add(s.id)); render(); },
    mNone: () => { UI.mSel.clear(); render(); }
  });
  SUBMIT.bulkInquiry = (f, fd) => {
    const D = activeDept(); UI.bMat = fd.get('material'); UI.bQty = fd.get('qty'); UI.bSpec = fd.get('spec');
    const pr = { id: uid('pr'), code: nextPRCode(), api: fd.get('material').trim(), qty: fd.get('qty').trim() || 'As required', unit: fd.get('unit'), pharmacopoeia: fd.get('pharmacopoeia') || (D === 'PM' ? '—' : 'IP/BP/USP as applicable'), specText: fd.get('spec').trim(), countries: 'India', preference: 'Company supplier list', owner: reviewer(), status: 'active', shortlist: [...UI.mSel], createdAt: nowISO(), bulk: true, dept: D };
    persist('prs', pr); audit('Bulk inquiry created', 'pr', pr.id, `${pr.code} ${pr.api} → ${pr.shortlist.length} suppliers`);
    const t = S.templates.find(t => !t.archived && t.dept === D) || S.templates.find(t => !t.archived);
    Object.assign(UI, { sendSel: new Set(pr.shortlist), mailTpl: t && t.id, chEmail: true, testMailOk: false, testWaOk: false, sendOk: false, sendLog: null });
    go('send', { prId: pr.id });
  };

  /* ---------- Send page: pick the department's template + show replies for this inquiry ---------- */
  const _vSend = vSend;
  vSend = function () {
    if (!UI.mailTpl) { const t = S.templates.find(t => !t.archived && t.dept === activeDept()); if (t) UI.mailTpl = t.id; }
    let h = _vSend();
    const pr = byId('prs', UI.prId); if (!pr) return h;
    const reps = S.replies.filter(r => r.prId === pr.id).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
    const sent = S.rfqs.filter(r => r.prId === pr.id && ['sent', 'wa_sent', 'replied'].includes(r.status)).length;
    h += `<div class="panel"><div class="row"><h2 style="margin:0">Replies for ${esc(pr.code)} — ${reps.length} of ${sent} sent</h2><span class="spacer"></span>${HEALTH.outlookConnected ? `<button class="btn sm primary" data-act="syncInbox" ${BUSY ? 'disabled' : ''}>Check Outlook for replies</button>` : ''}<button class="btn sm" data-go="replies">All replies</button></div>
      ${reps.length ? `<div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>Received</th><th>Supplier</th><th>From</th><th>Subject</th><th>Price</th><th></th></tr></thead><tbody>${reps.map(r => `<tr><td>${fmtDate(r.receivedAt)}</td><td>${esc((byId('suppliers', r.supplierId) || {}).name || '—')}</td><td class="mono">${esc(r.from)}</td><td>${esc(r.subject)}</td><td>${r.extracted && r.extracted.price ? esc(r.extracted.price.value) : '—'}</td><td><button class="btn sm" data-act="openReplyNav" data-id="${r.id}">Open</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="muted" style="margin-top:10px">No replies yet.${HEALTH.outlookConnected ? ' Press “Check Outlook for replies”.' : ''} Replies also reach the CC addresses directly in their own mailboxes.</p>`}</div>`;
    return h;
  };

  /* ---------- Users: department column ---------- */
  const _vUsers = vUsers;
  vUsers = function () {
    let h = _vUsers();
    if (!USERS) return h;
    h = h.replace('<th>Role</th>', '<th>Role</th><th>Department</th>');
    USERS.forEach(u => { h = h.replace(new RegExp(`(<select class="inp" style="width:auto" data-change="uRole" data-id="${u.id}">[\\s\\S]*?</select></td>)`), `$1<td><select class="inp" style="width:auto" data-change="uDept" data-id="${u.id}">${[['ALL', 'All departments'], ['RM', 'RM — Raw Material'], ['PM', 'PM — Packing Material'], ['MISC', 'MISC — Miscellaneous'], ['LOG', 'LOG — Logistics (sea / air)']].map(([v, l]) => `<option value="${v}" ${(u.dept || 'ALL') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>`); });
    return h.replace('<b>viewer</b>: read-only (e.g. management, auditors)', '<b>viewer</b>: read-only (e.g. management, auditors).<br><b>Department</b>: PM users see only Packing Material data, RM users only Raw Material data; “both” can switch between PM and RM at the top.');
  };
  CHANGE.uDept = el => api('PATCH', '/api/users/' + el.dataset.id, { dept: el.value }).then(() => { USERS = null; audit('Changed user department', 'user', el.dataset.id, el.value); toast('Department saved — takes effect at the user’s next page load.'); render(); }).catch(e => { toast(e.message, 'err'); USERS = null; render(); });
  const _addUser = A.addUser;
  A.addUser = () => { _addUser(); const role = $('.modal select[name=role]'); if (role) role.closest('label').insertAdjacentHTML('afterend', `<label class="f">Department<select name="dept"><option value="PM">PM — Packing Material</option><option value="RM">RM — Raw Material</option><option value="MISC">MISC — Miscellaneous</option><option value="LOG">LOG — Logistics (sea / air)</option><option value="ALL">All departments</option></select></label>`); };
  SUBMIT.addUser = async (f, fd) => { try { const u = await api('POST', '/api/users', { name: fd.get('name'), email: fd.get('email'), role: fd.get('role'), dept: fd.get('dept') || 'ALL', password: fd.get('password') }); audit('Added user', 'user', u.id, `${u.email} (${u.role}, ${u.dept})`); USERS = null; closeModal(); toast('User added. Share the temporary password privately.'); render(); } catch (e) { toast(e.message, 'err'); } };


  /* ================= v2.3 — Purchase inquiries (PM / RM), vendor portal, rate comparison, Drive & local backup ================= */
  ['items', 'inquiries', 'quotes'].forEach(c => { if (!COLLS.includes(c)) COLLS.push(c); if (!S[c]) S[c] = []; if (!PARTS.includes(c)) PARTS.push(c); });
  NAV.unshift(['Purchase', [['inquiries', 'Inquiry management', 'M3 4h18v4H3zM5 8v12h14V8M9 12h6'], ['newinq', 'New inquiry', 'M12 5v14M5 12h14'], ['itemsm', 'Item master', 'M21 8 12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8'], ['mylist', 'Vendor master', 'M4 4h16v4H4zM4 10h16v10H4zM9 14h6']]]);
  NAV.forEach(g => { const i = g[1].findIndex(x => x[0] === 'mylist'); if (i >= 0 && g[0] !== 'Purchase') g[1].splice(i, 1); });
  const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : null; };
  const money = n => n == null ? '—' : (Math.round(n * 100) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const netRate = q => { if (q && q.total !== undefined && q.rate === undefined) return num(q.total); const f = num(q.finalRate); if (f != null) return f; const r = num(q.rate); if (r == null) return null; return r * (1 - (num(q.discount) || 0) / 100); };
  const landed = q => { const n = netRate(q); return n == null ? null : n * (1 + (num(q.tax) || 0) / 100); };
  const listSup = () => live().filter(s => s.onList || s.origin === 'company' || (s.materials && s.materials.length) || S.items.some(i => (i.vendors || []).includes(s.id)));
  const pmSleep = ms => new Promise(r => setTimeout(r, ms));
  const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------- Google Drive upload from the browser (artwork / spec PDFs go straight to Drive) ---------- */
  async function driveUpload(file, folder = 'files', share = true) {
    if (!file.size) throw new Error('The file is empty');
    const { token } = await api('POST', '/api/gdrive/upload/start', { name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, folder, share });
    const CH = 15 * 256 * 1024; let start = 0;
    while (start < file.size) {
      const r = await fetch(`/api/gdrive/upload/chunk?t=${encodeURIComponent(token)}&start=${start}&total=${file.size}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', 'X-WCPA': '1' }, body: file.slice(start, Math.min(file.size, start + CH)) });
      const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Upload failed (HTTP ' + r.status + ')');
      if (d.done) return d.file;
      start = d.next; setProgress(`${file.name} ${Math.round(start / file.size * 100)}%`);
    }
    throw new Error('Upload did not finish');
  }
  async function uploadFiles(input, target) {
    const files = [...input.files]; input.value = ''; if (!files.length) return;
    if (!HEALTH.gdriveConnected) return toast('Attachments are stored in Google Drive. Ask the admin to connect Google Drive in Integrations.', 'err');
    startJob('Uploading to Google Drive'); let i = 0;
    for (const f of files) { i++; setProgress(`${i}/${files.length} ${f.name}`); try { target.push(await driveUpload(f)); } catch (e) { toast(f.name + ': ' + e.message, 'err'); } }
    endJob();
  }
  const fileChips = (fs, rmAct) => (fs || []).map((f, i) => `<span class="fchip"><a href="${escH(f.link)}" target="_blank" rel="noopener noreferrer">📄 ${escH(f.name)}</a>${f.size ? ` <small>${(f.size / 1048576).toFixed(1)} MB</small>` : ''}${rmAct ? ` <button type="button" class="x" data-act="${rmAct}" data-i="${i}" aria-label="Remove">×</button>` : ''}</span>`).join('');

  /* ---------- Item master ---------- */
  function vItems() {
    const q = normText(UI.filters.iq || ''); const rows = S.items.filter(i => !i.deleted && (!q || normText(i.name + ' ' + (i.code || '') + ' ' + (i.make || '')).includes(q))).sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="page-head"><div><h1>Item master <span class="tag">${activeDept()}</span></h1><p>Products / materials you buy, with their specification, artwork files and approved vendors. Inquiries pick items from here.</p></div><button class="btn primary" data-act="itemNew" ${canWrite() ? '' : 'disabled'}>New item</button></div>
    <div class="panel"><input class="inp" style="max-width:280px;margin-bottom:12px" placeholder="Search item, code, make" value="${escH(UI.filters.iq || '')}" data-input="iq">
    ${rows.length ? `<div class="tbl-wrap"><table class="list"><thead><tr><th>Item</th><th>Code</th><th>Make</th><th>Usual qty</th><th>Specification</th><th>Packing</th><th>Files</th><th>Vendors</th><th></th></tr></thead><tbody>${rows.map(i => `<tr><td><strong>${escH(i.name)}</strong></td><td class="mono">${escH(i.code || '—')}</td><td>${escH(i.make || '—')}</td><td>${escH([i.qty, i.uom].filter(Boolean).join(' ') || '—')}</td><td>${escH(i.spec || '—')}</td><td>${escH(i.packing || '—')}</td><td>${(i.files || []).length}</td><td>${(i.vendors || []).length}</td><td><button class="btn sm" data-act="itemEdit" data-id="${i.id}">Edit</button></td></tr>`).join('')}</tbody></table></div>` : emptyBox('No items yet', 'Add the materials you buy — once — and reuse them in every inquiry.')}</div>`;
  }
  INPUT.iq = v => UI.filters.iq = v;
  let EDIT_ITEM = null;
  function itemModal() {
    const i = EDIT_ITEM; const vq = normText(UI.ivq || ''); const sups = listSup().filter(s => !vq || normText(s.name + ' ' + (s.materials || []).join(' ')).includes(vq)).slice(0, 300);
    modal(`<h2>${i.id ? 'Edit item' : 'New item'}</h2><form data-submit="itemSave"><div class="form" style="grid-template-columns:1fr 1fr">
      <label class="f span3">Product / material name *<input name="name" required value="${escH(i.name)}" placeholder="${isPM() ? 'e.g. VERASOFT LOTION — label' : 'e.g. Paracetamol IP'}"></label>
      <label class="f">Code<input name="code" value="${escH(i.code)}" placeholder="e.g. 25361017"></label><label class="f">Make<input name="make" value="${escH(i.make)}" placeholder="${isPM() ? 'e.g. LABEL, BOX' : 'e.g. Cipla'}"></label>
      <label class="f">Usual quantity<input name="qty" value="${escH(i.qty)}"></label><label class="f">Unit (UOM)<input name="uom" value="${escH(i.uom || (isPM() ? 'NOS' : 'KG'))}"></label>
      <label class="f span3">Specification<input name="spec" value="${escH(i.spec)}" placeholder="${isPM() ? 'e.g. 350 GSM FBB, UV varnish, embossed' : 'e.g. IP grade'}"></label>
      <label class="f span3">Packing specification<input name="packing" value="${escH(i.packing)}" placeholder="e.g. Chromo label, 10x10 blister"></label></div>
      <h3 style="margin-top:14px">Attachments (artwork / drawing)</h3><div class="files">${fileChips(i.files, 'itemRmFile')}</div>
      <label class="btn sm" style="cursor:pointer">Add files<input type="file" multiple hidden data-change="itemFiles"></label> <span class="hint">${HEALTH.gdriveConnected ? 'Saved in Google Drive; vendors get a view link.' : 'Connect Google Drive (Integrations) to attach files.'}</span>
      <h3 style="margin-top:14px">Approved vendors (${(i.vendors || []).length})</h3><input class="inp" placeholder="Search vendors" value="${escH(UI.ivq || '')}" data-input="ivq" style="max-width:260px;margin-bottom:8px">
      <div class="vpick">${sups.map(s => `<label class="srow ${(i.vendors || []).includes(s.id) ? 'on' : ''}"><input type="checkbox" class="chk" data-change="itemVend" data-id="${s.id}" ${(i.vendors || []).includes(s.id) ? 'checked' : ''}><span class="sname"><strong>${escH(s.name)}</strong><small>${escH([s.city, s.state].filter(Boolean).join(', '))} · ${bestEmail(s) ? escH(bestEmail(s).value) : 'no email'}</small></span></label>`).join('') || '<p class="muted">No vendors yet — add them in Vendor master.</p>'}</div>
      <div class="row" style="margin-top:14px">${i.id ? '<button class="btn danger" type="button" data-act="itemDel">Delete</button>' : ''}<span class="spacer"></span><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary">Save item</button></div></form>`, true);
  }
  const keepItemForm = () => { const f = $('.modal form[data-submit=itemSave]'); if (f) new FormData(f).forEach((v, k) => EDIT_ITEM[k] = v); };
  Object.assign(A, {
    itemNew: () => { EDIT_ITEM = { name: '', files: [], vendors: [] }; UI.ivq = ''; itemModal(); },
    itemEdit: el => { EDIT_ITEM = JSON.parse(JSON.stringify(byId('items', el.dataset.id))); UI.ivq = ''; itemModal(); },
    itemRmFile: el => { keepItemForm(); EDIT_ITEM.files.splice(+el.dataset.i, 1); itemModal(); },
    itemDel: () => { if (!confirm('Delete this item? Past inquiries keep their copy.')) return; const it = byId('items', EDIT_ITEM.id); it.deleted = true; persist('items', it); audit('Item deleted', 'item', it.id, it.name); closeModal(); render(); }
  });
  Object.assign(CHANGE, {
    itemFiles: async el => { keepItemForm(); await uploadFiles(el, EDIT_ITEM.files); itemModal(); },
    itemVend: el => { keepItemForm(); const v = EDIT_ITEM.vendors || (EDIT_ITEM.vendors = []); el.checked ? v.push(el.dataset.id) : v.splice(v.indexOf(el.dataset.id), 1); itemModal(); }
  });
  INPUT.ivq = v => { UI.ivq = v; };
  document.addEventListener('input', e => { if (e.target.matches('[data-input="ivq"]') && EDIT_ITEM) { clearTimeout(window.__ivq); window.__ivq = setTimeout(() => { keepItemForm(); itemModal(); const n = $('[data-input="ivq"]'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); } }, true);
  SUBMIT.itemSave = (f, fd) => {
    const it = { ...EDIT_ITEM }; ['name', 'code', 'make', 'qty', 'uom', 'spec', 'packing'].forEach(k => it[k] = String(fd.get(k) || '').trim());
    if (!it.id) { it.id = uid('itm'); it.createdAt = nowISO(); }
    persist('items', it); audit(EDIT_ITEM.id ? 'Item updated' : 'Item created', 'item', it.id, it.name); closeModal(); render();
  };

  /* ---------- New inquiry: 3 steps ---------- */
  const blankLine = () => ({ id: uid('li'), itemId: '', name: '', code: '', qty: '', uom: isPM() ? 'NOS' : 'KG', make: '', spec: '', packing: '', files: [] });
  function NI() { if (!UI.ni || UI.ni.dept !== activeDept()) UI.ni = { dept: activeDept(), step: 1, lines: [blankLine()], deliveryTime: '', deliveryLocation: 'Ahmedabad plant', vendors: [], files: [], notes: '', vq: '', testOk: false, cc: (HEALTH.settings && HEALTH.settings.ccEmails) || '', bcc: '' }; return UI.ni; }
  function syncNI() { const n = UI.ni; const f = $('#niForm'); if (!f || !n) return; new FormData(f).forEach((v, k) => { const [a, i, key] = k.split('|'); if (a === 's') { (n.ship = n.ship || {})[i] = String(v); return; } if (a === 'l') { const L = n.lines.find(x => x.id === i); if (L) L[key] = String(v); } else if (a === 'g') n[i] = String(v); }); }
  function logiStep2(n, sups, sugg) {
    const sh = n.ship || {}; const L = LOGI[n.kind];
    const fields = LOGI.SHIP.filter(([k]) => n.kind === 'SEA' ? true : k !== 'cbm');
    return `<form id="niForm" data-submit="niNext2" class="panel"><h2>${escH(L.label)} — shipment details</h2>
      <div class="form">${fields.map(([k, l]) => `<label class="f">${escH(l)}${['destination', 'portDischarge'].includes(k) || (n.kind === 'AIR' && k === 'grossWeight') ? ' *' : ''}<input name="s|${k}" value="${escH(sh[k] || '')}" ${['cartons', 'grossWeight', 'volumeWeight', 'cbm'].includes(k) ? 'inputmode="decimal"' : ''}></label>`).join('')}
        <label class="f">Currency for quotes<select data-change="niCur"><option ${n.currency !== 'USD' ? 'selected' : ''}>INR</option><option ${n.currency === 'USD' ? 'selected' : ''}>USD</option></select></label>
        <label class="f">Quotes needed by<input name="g|deliveryTime" value="${escH(n.deliveryTime)}" placeholder="e.g. within 2 days"></label>
        <label class="f span3">Note to forwarders (optional)<input name="g|notes" value="${escH(n.notes)}" placeholder="e.g. DG / temperature control not required"></label></div>
      ${n.kind === 'AIR' && LOGI.chargeable(sh) ? `<p class="hint">Chargeable weight: <b>${LOGI.chargeable(sh)} kg</b> (higher of gross and volume weight).</p>` : ''}
      <h3 style="margin-top:16px">Attachments (packing list, invoice…)</h3><div class="files">${fileChips(n.files, 'niRmGFile')}</div><label class="btn sm" style="cursor:pointer">Add files<input type="file" multiple hidden data-change="niFiles"></label>
      <h3 style="margin-top:18px">Forwarders (${n.vendors.length} selected)</h3>
      <div class="row" style="margin-bottom:8px"><input class="inp" style="max-width:260px" placeholder="Search forwarder, city" value="${escH(n.vq)}" data-input="niVq"><button type="button" class="btn sm" data-act="niVAll">Select shown</button><button type="button" class="btn sm" data-act="niVNone">Clear</button>${sugg.size ? `<button type="button" class="btn sm" data-act="niVSuggL">Select ${n.kind === 'AIR' ? 'air' : 'sea'} forwarders (${sugg.size})</button>` : ''}</div>
      <div class="vpick">${sups.map(s => `<label class="srow ${n.vendors.includes(s.id) ? 'on' : ''}"><input type="checkbox" class="chk" data-change="niV" data-id="${s.id}" ${n.vendors.includes(s.id) ? 'checked' : ''}><span class="sname"><strong>${escH(s.name)}${sugg.has(s.id) ? ` <span class="tag">${n.kind === 'AIR' ? 'air' : 'sea'}</span>` : ''}</strong><small>${escH([s.city, s.state].filter(Boolean).join(', '))} · ${bestEmail(s) ? escH(bestEmail(s).value) : '<i>no email</i>'}</small></span></label>`).join('') || emptyBox('No forwarders yet', 'Switch to LOG and upload your forwarders in Vendor master (tag them “Air freight” / “Sea freight” in the Material column).')}</div>
      <div class="row" style="margin-top:18px"><button type="button" class="btn" data-act="niBack">← Back</button><span class="spacer"></span><button class="btn primary big">Next →</button></div></form>`;
  }
  CHANGE.niCur = el => { syncNI(); UI.ni.currency = el.value; };
  A.niVSuggL = () => { syncNI(); const n = UI.ni; const re = n.kind === 'AIR' ? /air/i : /sea|ocean/i; listSup().filter(s => (s.materials || []).some(m => re.test(m))).forEach(s => { if (!n.vendors.includes(s.id)) n.vendors.push(s.id); }); render(); };
  function stepper(s) { return `<div class="wiz">${[['1', 'Select type'], ['2', 'Details'], ['3', 'Review & send']].map(([n, l], i) => `<div class="wz ${s > i + 1 ? 'done' : s === i + 1 ? 'on' : ''}"><span>${s > i + 1 ? '✓' : n}</span>${l}</div>`).join('<i></i>')}</div>`; }
  function vNewInq() {
    const n = NI();
    const head = `<div class="page-head"><div><h1>New inquiry</h1><p>Send a purchase inquiry to vendors in three steps. Each vendor gets a private link to fill in their rates.</p></div></div>${stepper(n.step)}`;
    if (n.step === 1) return head + `<div class="typegrid">${[['RM', '', 'RM', 'Raw materials', 'APIs, excipients, solvents'], ['PM', '', 'PM', 'Packing materials', 'Labels, cartons, foil, bottles, caps'], ['MISC', '', '◇', 'Miscellaneous', 'Engineering, lab, office and other items'], ['LOG', 'SEA', '⛴', 'Logistics – Sea Freight', 'Ocean freight quotations from forwarders'], ['LOG', 'AIR', '✈', 'Logistics – Air Freight', 'Air freight quotations from forwarders']].map(([d, k, ic, t, sub]) => `<button class="typecard ${activeDept() === d && (n.kind || '') === k ? 'on' : ''}" data-act="niType" data-d="${d}" data-k="${k}" ${myDept() && myDept() !== d ? 'disabled title="Your user is limited to ' + myDept() + '"' : ''}><span class="tico">${ic}</span><span><strong>${t}</strong><small>${sub}</small></span></button>`).join('')}</div>
      <div class="row" style="margin-top:18px"><span class="spacer"></span><button class="btn primary big" data-act="niNext">Next →</button></div>`;
    const itemOpts = S.items.filter(i => !i.deleted).map(i => `<option value="${escH(i.name)}${i.code ? ' — ' + escH(i.code) : ''}"></option>`).join('');
    const prev = S.inquiries.slice().sort((a, b) => String(b.createdAt).localeCompare(a.createdAt)).slice(0, 30);
    const vq = normText(n.vq || '');
    const sugg = new Set(LOGI[n.kind] ? listSup().filter(s => (s.materials || []).some(m => (n.kind === 'AIR' ? /air/i : /sea|ocean/i).test(m))).map(s => s.id) : n.lines.flatMap(L => (byId('items', L.itemId) || {}).vendors || []));
    const sups = listSup().filter(s => !vq || normText([s.name, s.city, s.state, (s.materials || []).join(' ')].join(' ')).includes(vq)).sort((a, b) => (sugg.has(b.id) - sugg.has(a.id)) || a.name.localeCompare(b.name)).slice(0, 400);
    if (n.step === 2 && LOGI[n.kind]) return head + logiStep2(n, sups, sugg);
    if (n.step === 2) return head + `<form id="niForm" data-submit="niNext2" class="panel">
      <div class="row" style="margin-bottom:12px"><select class="inp" style="width:auto" data-change="niCopy"><option value="">Copy items from a previous inquiry…</option>${prev.map(p => `<option value="${p.id}">${escH(p.code)} — ${escH((p.items || []).map(i => i.name).join(', ').slice(0, 60))}</option>`).join('')}</select><span class="faint" style="font-size:13px">or type item names (picked from Item master)</span></div>
      <datalist id="itemlist">${itemOpts}</datalist>
      ${n.lines.map((L, k) => `<div class="lineitem"><div class="row"><strong>Item ${k + 1}</strong><span class="spacer"></span>${n.lines.length > 1 ? `<button type="button" class="btn sm ghost" data-act="niRm" data-id="${L.id}">Remove</button>` : ''}</div>
        <div class="form" style="grid-template-columns:2fr 1fr 1fr 1fr;margin-top:8px"><label class="f">Product *<input name="l|${L.id}|name" list="itemlist" value="${escH(L.name)}" required data-change="niPick" data-id="${L.id}" placeholder="Search & select a product…"></label><label class="f">Code<input name="l|${L.id}|code" value="${escH(L.code)}"></label><label class="f">Quantity *<input name="l|${L.id}|qty" value="${escH(L.qty)}" required inputmode="decimal"></label><label class="f">UOM<input name="l|${L.id}|uom" value="${escH(L.uom)}"></label>
        <label class="f">Make<input name="l|${L.id}|make" value="${escH(L.make)}"></label><label class="f">Specification<input name="l|${L.id}|spec" value="${escH(L.spec)}"></label><label class="f span2">Packing<input name="l|${L.id}|packing" value="${escH(L.packing)}"></label></div>
        <div class="files" style="margin-top:8px">${fileChips(L.files, 'niRmFile" data-l="' + L.id)}</div><label class="btn sm" style="cursor:pointer">Attach files<input type="file" multiple hidden data-change="niLineFiles" data-id="${L.id}"></label></div>`).join('')}
      <button type="button" class="btn" style="width:100%;margin:6px 0 16px" data-act="niAdd">+ Add another item</button>
      <div class="form"><label class="f">Delivery time<input name="g|deliveryTime" value="${escH(n.deliveryTime)}" placeholder="e.g. 2 weeks"></label><label class="f span2">Delivery location<input name="g|deliveryLocation" value="${escH(n.deliveryLocation)}"></label>
      <label class="f span3">Note to vendors (optional)<input name="g|notes" value="${escH(n.notes)}"></label></div>
      <h3 style="margin-top:16px">Attachments for the whole inquiry</h3><div class="files">${fileChips(n.files, 'niRmGFile')}</div><label class="btn sm" style="cursor:pointer">Add files<input type="file" multiple hidden data-change="niFiles"></label>
      <h3 style="margin-top:18px">Vendors (${n.vendors.length} selected)</h3>
      <div class="row" style="margin-bottom:8px"><input class="inp" style="max-width:260px" placeholder="Search vendor, material, city" value="${escH(n.vq)}" data-input="niVq"><button type="button" class="btn sm" data-act="niVAll">Select shown</button><button type="button" class="btn sm" data-act="niVNone">Clear</button>${sugg.size ? `<button type="button" class="btn sm" data-act="niVSugg">Select item vendors (${sugg.size})</button>` : ''}</div>
      <div class="vpick">${sups.map(s => `<label class="srow ${n.vendors.includes(s.id) ? 'on' : ''}"><input type="checkbox" class="chk" data-change="niV" data-id="${s.id}" ${n.vendors.includes(s.id) ? 'checked' : ''}><span class="sname"><strong>${escH(s.name)}${sugg.has(s.id) ? ' <span class="tag">item vendor</span>' : ''}</strong><small>${escH([s.city, s.state].filter(Boolean).join(', '))} · ${bestEmail(s) ? escH(bestEmail(s).value) : '<i>no email</i>'}</small></span></label>`).join('') || emptyBox('No vendors yet', 'Add them in Vendor master (upload your Excel).')}</div>
      <div class="row" style="margin-top:18px"><button type="button" class="btn" data-act="niBack">← Back</button><span class="spacer"></span><button class="btn primary big">Next →</button></div></form>`;
    // step 3
    const vend = n.vendors.map(id => byId('suppliers', id)).filter(Boolean); const noMail = vend.filter(s => !bestEmail(s));
    return head + `<div class="panel"><h2>Review</h2><div class="review"><div><b>${activeDept() === 'PM' ? 'Packing materials' : 'Raw materials'}</b></div><ul>${n.lines.map(L => `<li><b>${escH(L.name)}</b> — ${escH(L.qty)} ${escH(L.uom)}${L.make ? ' · Make: ' + escH(L.make) : ''}${L.spec ? ' · Spec: ' + escH(L.spec) : ''}${L.packing ? ' · Packing: ' + escH(L.packing) : ''}${L.files.length ? ` · ${L.files.length} attachment(s)` : ''}</li>`).join('')}</ul>
      <div class="faint">Delivery: ${escH(n.deliveryTime || '—')} to ${escH(n.deliveryLocation || '—')}${n.files.length ? ` · ${n.files.length} common attachment(s)` : ''}</div>
      <div style="margin-top:8px"><b>${vend.length}</b> vendors · <b>${vend.length - noMail.length}</b> will get the email${noMail.length ? ` · <span class="b warn plain">${noMail.length} without email — share their link from Inquiry management</span>` : ''}</div>
      ${ccEditor('niCc', n.cc, 'CC', 'Gets a copy and the vendor’s reply')}${ccEditor('niBcc', n.bcc, 'BCC', 'Hidden copy')}</div>
      <div class="preview" style="margin-top:12px">${inqEmailHTML({ code: 'INQ-…', items: n.lines, deliveryTime: n.deliveryTime, deliveryLocation: n.deliveryLocation, notes: n.notes, files: n.files }, vend[0], '#')}</div>
      ${niWaBox(n, vend)}
      ${!HEALTH.outlookConnected ? `<div class="note warn" style="margin-top:12px">Connect your Outlook first (Integrations → Connect Outlook) so the emails go from your mailbox.</div>` : `<div class="row" style="margin-top:14px"><input class="inp" style="max-width:280px" data-input="niTestTo" value="${escH(UI.niTestTo ?? ME.email)}"><button class="btn" data-act="niTest" ${BUSY ? 'disabled' : ''}>Send test email to me</button>${n.testOk ? '<span class="b ok">Test sent ✓</span>' : ''}</div>
      <label class="row" style="gap:8px;margin:12px 0;font-size:14px"><input type="checkbox" class="chk" id="niOk" ${n.testOk ? '' : 'disabled'}> I received the test email and it is correct.</label>`}
      <div class="row" style="margin-top:14px"><button class="btn" data-act="niBack">← Back</button><span class="spacer"></span><button class="btn primary big" data-act="niCreate" ${!HEALTH.outlookConnected || !n.testOk || BUSY ? 'disabled' : ''}>Create inquiry & send to ${vend.length - noMail.length} vendors</button></div></div>`;
  }
  const ccList = v => String(v || '').split(/[;,\s]+/).map(x => x.trim()).filter(Boolean);
  function ccEditor(key, value, label, hint) {
    const list = ccList(value);
    return `<div class="ccbox"><div class="row" style="gap:8px"><strong style="font-size:13.5px">${label}</strong><span class="hint">${hint}</span><span class="spacer"></span>${list.length ? `<button type="button" class="btn sm ghost" data-act="ccClear" data-k="${key}">Remove all ${label}</button>` : ''}</div>
      <div class="chips">${list.map((e, i) => `<span class="fchip ${/^\S+@\S+\.\S+$/.test(e) ? '' : 'badmail'}">${escH(e)} <button type="button" class="x" data-act="ccRm" data-k="${key}" data-i="${i}" aria-label="Remove ${escH(e)}">×</button></span>`).join('') || `<span class="faint" style="font-size:13px">No ${label}</span>`}
      <input class="inp ccadd" data-ccadd="${key}" placeholder="add email + Enter" aria-label="Add ${label} email"></div></div>`;
  }
  const ccGet = k => k === 'niCc' ? UI.ni.cc : k === 'niBcc' ? UI.ni.bcc : k === 'sCc' ? UI.cc : UI.bcc;
  const ccSet = (k, v) => { if (k === 'niCc') UI.ni.cc = v; else if (k === 'niBcc') UI.ni.bcc = v; else if (k === 'sCc') UI.cc = v; else UI.bcc = v; if (UI.ni && k.startsWith('ni')) UI.ni.testOk = false; else { UI.testMailOk = false; UI.sendOk = false; } };
  A.ccRm = el => { const l = ccList(ccGet(el.dataset.k)); l.splice(+el.dataset.i, 1); ccSet(el.dataset.k, l.join(', ')); render(); };
  A.ccClear = el => { ccSet(el.dataset.k, ''); render(); };
  document.addEventListener('keydown', e => { const t = e.target.closest && e.target.closest('[data-ccadd]'); if (!t || (e.key !== 'Enter' && e.key !== ',')) return; e.preventDefault(); const v = t.value.trim().replace(/,$/, ''); if (!v) return; if (!/^\S+@\S+\.\S+$/.test(v)) { toast('That is not a valid email.', 'err'); return; } const k = t.dataset.ccadd; const l = ccList(ccGet(k)); if (!l.map(x => x.toLowerCase()).includes(v.toLowerCase())) l.push(v); ccSet(k, l.join(', ')); render(); setTimeout(() => { const n = document.querySelector(`[data-ccadd="${k}"]`); n && n.focus(); }, 0); });
  document.addEventListener('focusout', e => { const t = e.target.closest && e.target.closest('[data-ccadd]'); if (!t || !t.value.trim()) return; const v = t.value.trim(); if (!/^\S+@\S+\.\S+$/.test(v)) return; const k = t.dataset.ccadd; const l = ccList(ccGet(k)); if (!l.includes(v)) l.push(v); ccSet(k, l.join(', ')); setTimeout(render, 0); });
  /* ---------- WhatsApp in New inquiry ---------- */
  const NI_FIELDS = [['company', 'Vendor name'], ['contact', 'Contact person'], ['items', 'Item name(s)'], ['qty', 'Quantity + unit'], ['code', 'Inquiry number'], ['link', 'Vendor’s quotation link'], ['delivery', 'Delivery time'], ['sender', 'Our company name'], ['custom', 'Fixed text…']];
  const niGuess = p => { const k = String(p).toLowerCase(); return /link|url/.test(k) ? 'link' : /inq|code|ref|number/.test(k) ? 'code' : /qty|quant/.test(k) ? 'qty' : /item|product|material|api/.test(k) ? 'items' : /deliver|time/.test(k) ? 'delivery' : /contact|person/.test(k) ? 'contact' : /sender|our|from/.test(k) ? 'sender' : 'company'; };
  function niWaVal(k, n, inq, s, link) {
    const lines = (inq ? inq.items : n.lines) || []; const c = s && bestEmail(s);
    if (k.startsWith('custom:')) return k.slice(7);
    return { company: (s && s.name) || 'Vendor', contact: (c && c.person) || 'Sir/Madam', items: lines.map(L => L.name).join(', ').slice(0, 300), qty: lines.length === 1 ? `${lines[0].qty} ${lines[0].uom}` : `${lines.length} items`, code: (inq && inq.code) || 'INQ-TEST', link: link || location.origin + '/quote.html', delivery: (inq || n).deliveryTime || 'as early as possible', sender: SENDER }[k] ?? '';
  }
  function niWaParams(n, inq, s, link) { const t = (W.templates || []).find(x => x.name === (n.waTpl || (inq && inq.waTpl))); if (!t) return []; const map = { ...niGuessAll(t), ...((inq && inq.waMap) || n.waMap || {}) }; return t.params.map(p => ({ name: p, value: niWaVal(map[p], n, inq, s, link) })); }
  function niWaBox(n, vend) {
    if (!HEALTH.wati) return `<div class="ccbox"><div class="row"><strong style="font-size:13.5px">WhatsApp</strong><span class="b">Not configured</span><span class="hint">Add WATI in Integrations to send WhatsApp together with the email.</span></div></div>`;
    if (n.wa && W.templates === null && !W.loading) setTimeout(loadWaTemplates, 0);
    const withWa = vend.filter(s => waNumberOf(s)); const t = (W.templates || []).find(x => x.name === n.waTpl); const s0 = vend[0];
    return `<div class="ccbox"><label class="row" style="gap:10px"><input type="checkbox" class="chk" data-change="niWa" ${n.wa ? 'checked' : ''}><strong style="font-size:14px">Also send on WhatsApp (same time)</strong><span class="hint">${withWa.length} of ${vend.length} vendors have a WhatsApp-capable mobile</span></label>
      ${n.wa ? `${W.loading ? '<p class="muted"><span class="spin"></span> Loading templates…</p>' : W.err ? `<div class="note bad">${escH(W.err)}</div>` : ''}
        <div class="form" style="grid-template-columns:1fr;margin-top:8px"><label class="f">Approved WhatsApp template<select data-change="niWaTpl"><option value="">Choose…</option>${(W.templates || []).map(x => `<option value="${escH(x.name)}" ${x.name === n.waTpl ? 'selected' : ''} ${x.status !== 'APPROVED' ? 'disabled' : ''}>${escH(x.name)}${x.status !== 'APPROVED' ? ' (' + escH(x.status.toLowerCase()) + ')' : ''}</option>`).join('')}</select></label></div>
        ${t ? `<div class="map-grid">${t.params.map(p => { const m = (n.waMap || {})[p] || niGuessAll(t)[p]; return `<label class="f">{{${escH(p)}}} →<select data-change="niWaMap" data-p="${escH(p)}">${NI_FIELDS.map(([k, l]) => `<option value="${k === 'custom' ? 'custom:' : k}" ${(k === 'custom' ? m.startsWith('custom:') : m === k) ? 'selected' : ''}>${l}</option>`).join('')}</select>${m.startsWith('custom:') ? `<input class="inp" data-input="niWaCustom" data-p="${escH(p)}" value="${escH(m.slice(7))}" placeholder="Text">` : ''}</label>`; }).join('')}</div>
          ${t.params.some(p => ((n.waMap || {})[p] || niGuessAll(t)[p]) === 'link') ? '<p class="hint">The vendor’s personal quotation link (the same short link as in the email) goes into the placeholder mapped to “Vendor’s quotation link”.</p>' : ''}
          ${s0 ? `<div class="preview"><div class="pv-h">WhatsApp preview for ${escH(s0.name)}</div>${escH(t.body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (mm, k) => niWaVal((n.waMap || {})[k] || niGuessAll(t)[k], n, null, s0, location.origin + '/q/XXXXXXXXXX')))}</div>` : ''}
          <div class="row" style="margin-top:10px"><input class="inp" style="max-width:220px" placeholder="91XXXXXXXXXX" value="${escH(n.waTestTo || '')}" data-input="niWaTest"><button type="button" class="btn sm" data-act="niWaTestSend" ${BUSY ? 'disabled' : ''}>Send test WhatsApp</button>${n.waTestOk ? '<span class="b ok">Accepted ✓</span>' : ''}</div>` : ''}
        <p class="hint">WhatsApp only allows approved templates for the first message, and contacts should have agreed to hear from you.</p>` : ''}</div>`;
  }
  Object.assign(CHANGE, {
    niWa: el => { syncNI(); UI.ni.wa = el.checked; UI.ni.waTestOk = false; if (el.checked && HEALTH.wati && W.templates === null) loadWaTemplates(); render(); },
    niWaTpl: el => { UI.ni.waTpl = el.value; UI.ni.waTestOk = false; render(); },
    niWaMap: el => { UI.ni.waMap = { ...(UI.ni.waMap || {}), [el.dataset.p]: el.value }; UI.ni.waTestOk = false; render(); }
  });
  INPUT.niWaTest = v => { UI.ni.waTestTo = v; };
  document.addEventListener('input', e => { const c = e.target.closest('[data-input="niWaCustom"]'); if (c && UI.ni) { UI.ni.waMap = { ...(UI.ni.waMap || {}), [c.dataset.p]: 'custom:' + c.value }; UI.ni.waTestOk = false; } }, true);
  A.niWaTestSend = async () => {
    const n = UI.ni; const num = String(n.waTestTo || '').replace(/\D/g, ''); if (num.length < 10) return toast('Enter your WhatsApp number with country code, e.g. 919825012345', 'err');
    const s0 = byId('suppliers', n.vendors[0]); startJob('Sending test WhatsApp');
    try { await api('POST', '/api/wati/send', { number: num, template: n.waTpl, params: niWaParams(n, null, s0, await previewLink(n)), broadcast: 'TEST inquiry' }); n.waTestOk = true; toast('Test WhatsApp accepted by WATI — check your phone.'); }
    catch (e) { toast('Test WhatsApp failed: ' + e.message, 'err'); }
    endJob();
  };
  A.inqWaResend = async el => {
    const inq = byId('inquiries', UI.inqId); const s = byId('suppliers', el.dataset.s); const num = waNumberOf(s); if (!num) return;
    if (W.templates === null) await loadWaTemplates();
    startJob('Sending WhatsApp');
    try { const { links } = await api('POST', `/api/inquiries/${inq.id}/links`, { supplierIds: [s.id] }); const d = await api('POST', '/api/wati/send', { number: num, template: inq.waTpl, params: niWaParams({}, inq, s, links[s.id]), broadcast: inq.code }); inq.wa = inq.wa || {}; inq.wa[s.id] = { ok: true, number: num, at: nowISO(), id: d.localMessageId || '' }; persist('inquiries', inq); audit('Inquiry WhatsApp sent', 'inquiry', inq.id, `${s.name} ${num}`); toast('WhatsApp sent to ' + s.name); }
    catch (e) { toast('WhatsApp failed: ' + e.message, 'err'); }
    endJob();
  };
  async function previewLink(n) {
    const data = { code: 'INQ-PREVIEW', dept: activeDept(), kind: n.kind || '', shipment: n.ship || null, currency: n.currency || 'INR', deliveryTime: n.deliveryTime, deliveryLocation: n.deliveryLocation, notes: n.notes, files: (n.files || []).map(f => ({ name: f.name, link: f.link, size: f.size })),
      items: n.lines.map((L, i) => ({ id: 'p' + i, name: L.name, code: L.code, qty: L.qty, uom: L.uom, make: L.make, spec: L.spec, packing: L.packing, files: (L.files || []).map(f => ({ name: f.name, link: f.link, size: f.size })) })) };
    return api('POST', '/api/preview', { data }).then(r => r.link);
  }
  function shipTable(sh, kind) { const rows = LOGI.SHIP.filter(([k]) => sh && sh[k]).map(([k, l]) => `<tr><td style="border:1px solid #ddd;padding:6px 10px;background:#f3f4f6">${escH(l)}</td><td style="border:1px solid #ddd;padding:6px 10px">${escH(sh[k])}</td></tr>`); if (kind === 'AIR' && LOGI.chargeable(sh)) rows.push(`<tr><td style="border:1px solid #ddd;padding:6px 10px;background:#f3f4f6">Chargeable weight (kg)</td><td style="border:1px solid #ddd;padding:6px 10px">${LOGI.chargeable(sh)}</td></tr>`); return `<table style="border-collapse:collapse;font-size:13px">${rows.join('')}</table>`; }
  function inqEmailHTML(inq, s, link) {
    if (LOGI[inq.kind]) { const c = s && bestEmail(s); return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">Dear ${escH((c && c.person) || 'Sir/Madam')},<br>West-Coast Pharmaceutical Works has raised a new <b>${escH(LOGI[inq.kind].label)}</b> inquiry <b>${escH(inq.code)}</b> and would like your freight quotation (in ${escH(inq.currency || 'INR')}).<br><br>${shipTable(inq.shipment || {}, inq.kind)}${inq.notes ? `<p>${escH(inq.notes)}</p>` : ''}${(inq.files || []).length ? `<p>Attachments:<br>${inq.files.map(f => `<a href="${escH(f.link)}">${escH(f.name)}</a>`).join('<br>')}</p>` : ''}<p><a href="${escH(link)}" style="color:#0A66C2;font-weight:bold">Click here to view the inquiry and submit your quotation</a></p>Regards,<br>Logistics / Purchase Department<br>West-Coast Pharmaceutical Works Ltd., Ahmedabad</div>`; }
    const c = s && bestEmail(s); const dear = (c && c.person) || 'Vendor';
    const files = [...(inq.files || []), ...(inq.items || []).flatMap(i => i.files || [])];
    return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">Dear ${escH(dear)},<br>West-Coast Pharmaceutical Works has raised a new purchase inquiry <b>${escH(inq.code)}</b> and would like to request your quotation.<br><br>
<table style="border-collapse:collapse;font-size:13px"><tr><th style="border:1px solid #ddd;padding:6px 10px;background:#f3f4f6;text-align:left">Product</th><th style="border:1px solid #ddd;padding:6px 10px;background:#f3f4f6;text-align:left">Qty</th><th style="border:1px solid #ddd;padding:6px 10px;background:#f3f4f6;text-align:left">Details</th></tr>${(inq.items || []).map(i => `<tr><td style="border:1px solid #ddd;padding:6px 10px">${escH(i.name)}${i.code ? ' (' + escH(i.code) + ')' : ''}</td><td style="border:1px solid #ddd;padding:6px 10px">${escH(i.qty)} ${escH(i.uom)}</td><td style="border:1px solid #ddd;padding:6px 10px">${[i.make && 'Make: ' + escH(i.make), i.spec && 'Spec: ' + escH(i.spec), i.packing && 'Packing: ' + escH(i.packing)].filter(Boolean).join(' · ') || '—'}</td></tr>`).join('')}</table>
${inq.deliveryTime || inq.deliveryLocation ? `<p>Delivery: ${escH(inq.deliveryTime || '—')}${inq.deliveryLocation ? ' to ' + escH(inq.deliveryLocation) : ''}</p>` : ''}${inq.notes ? `<p>${escH(inq.notes)}</p>` : ''}
${files.length ? `<p>Attachments:<br>${files.map(f => `<a href="${escH(f.link)}">${escH(f.name)}</a>`).join('<br>')}</p>` : ''}
<p><a href="${escH(link)}" style="color:#0A66C2;font-weight:bold">Click here to view the inquiry and submit your quotation</a></p>Regards,<br>Purchase Department (${activeDept()})<br>West-Coast Pharmaceutical Works Ltd., Ahmedabad</div>`;
  }
  Object.assign(A, {
    niType: async el => { if (el.dataset.d !== activeDept()) { await A.setDept(el); } UI.ni = null; const n = NI(); n.kind = el.dataset.k || ''; if (n.kind) { n.ship = n.ship || {}; n.currency = 'INR'; } render(); },
    niNext: () => { NI().step = 2; render(); },
    niBack: () => { syncNI(); UI.ni.step = Math.max(1, UI.ni.step - 1); render(); },
    niAdd: () => { syncNI(); UI.ni.lines.push(blankLine()); render(); },
    niRm: el => { syncNI(); UI.ni.lines = UI.ni.lines.filter(L => L.id !== el.dataset.id); render(); },
    niRmFile: el => { syncNI(); const L = UI.ni.lines.find(x => x.id === el.dataset.l); L.files.splice(+el.dataset.i, 1); render(); },
    niRmGFile: el => { syncNI(); UI.ni.files.splice(+el.dataset.i, 1); render(); },
    niVAll: () => { syncNI(); const n = UI.ni; const vq = normText(n.vq || ''); listSup().filter(s => !vq || normText([s.name, s.city, s.state, (s.materials || []).join(' ')].join(' ')).includes(vq)).forEach(s => { if (!n.vendors.includes(s.id)) n.vendors.push(s.id); }); render(); },
    niVNone: () => { syncNI(); UI.ni.vendors = []; render(); },
    niVSugg: () => { syncNI(); const n = UI.ni; n.lines.flatMap(L => (byId('items', L.itemId) || {}).vendors || []).forEach(id => { if (!n.vendors.includes(id) && byId('suppliers', id)) n.vendors.push(id); }); render(); },
    niTest: async () => {
      const n = UI.ni; const to = (UI.niTestTo ?? ME.email).trim(); const s = byId('suppliers', n.vendors[0]);
      startJob('Sending test email');
      try { await api('POST', '/api/outlook/draft', { to, subject: '[TEST] Purchase Inquiry — Quotation Request', html: '<p style="color:#b45309"><b>TEST — the link below opens a preview. In the real email every vendor gets a personal link where they can submit rates.</b></p>' + inqEmailHTML({ code: 'INQ-TEST', items: n.lines, deliveryTime: n.deliveryTime, deliveryLocation: n.deliveryLocation, notes: n.notes, files: n.files }, s, await previewLink(n)) }).then(d => api('POST', '/api/outlook/send', { id: d.id })); n.testOk = true; toast('Test email sent to ' + to); }
      catch (e) { toast('Test email failed: ' + e.message, 'err'); }
      endJob();
    },
    niCreate: async () => {
      if (!$('#niOk') || !$('#niOk').checked) return toast('Tick “I received the test email” first.', 'err');
      if (UI.ni.wa && (!UI.ni.waTpl || !UI.ni.waTestOk)) return toast('WhatsApp is on — choose the template and send the test WhatsApp first (or switch WhatsApp off).', 'err');
      const n = UI.ni; startJob('Creating inquiry');
      try {
        const { code } = await api('POST', '/api/inquiries/code');
        const inq = { id: uid('inq'), code, dept: activeDept(), kind: n.kind || '', shipment: LOGI[n.kind] ? { ...(n.ship || {}) } : null, currency: n.currency || 'INR', cc: n.cc, bcc: n.bcc, waTpl: n.wa ? n.waTpl : '', waMap: n.wa ? { ...niGuessAll((W.templates || []).find(x => x.name === n.waTpl) || { params: [] }), ...(n.waMap || {}) } : {}, items: n.lines.map(L => ({ ...L })), deliveryTime: n.deliveryTime, deliveryLocation: n.deliveryLocation, notes: n.notes, files: n.files, vendors: [...n.vendors], links: {}, sent: {}, status: 'draft', createdBy: ME.id, createdByName: ME.name, createdAt: nowISO() };
        persist('inquiries', inq); await drain();
        const { links } = await api('POST', `/api/inquiries/${inq.id}/links`, {}); const fresh = (await api('GET', '/api/data?dept=' + activeDept())).inquiries.find(x => x.id === inq.id); if (fresh) inq.links = fresh.links;
        let i = 0, ok = 0; const st = HEALTH.settings || {};
        inq.wa = {}; let okWa = 0; const useWa = n.wa && HEALTH.wati && n.waTpl;
        for (const sid of inq.vendors) {
          const s = byId('suppliers', sid); const c = s && bestEmail(s); i++; setProgress(`${i}/${inq.vendors.length}`);
          const jobs = [];
          if (c) jobs.push((async () => { try { const d = await api('POST', '/api/outlook/draft', { to: c.value, cc: inq.cc, bcc: inq.bcc, replyTo: st.replyToCc !== false ? inq.cc : '', subject: `Purchase Inquiry ${code} — Quotation Request`, html: inqEmailHTML(inq, s, links[sid]) }); await api('POST', '/api/outlook/send', { id: d.id }); inq.sent[sid] = { ok: true, to: c.value, at: nowISO(), graphId: d.id, conversationId: d.conversationId }; ok++; } catch (e) { inq.sent[sid] = { ok: false, error: e.message, at: nowISO() }; } })());
          else inq.sent[sid] = { ok: false, error: 'No email address', at: nowISO() };
          if (useWa) { const num = s && waNumberOf(s);
            if (num) jobs.push((async () => { try { const d = await api('POST', '/api/wati/send', { number: num, template: n.waTpl, params: niWaParams(n, inq, s, links[sid]), broadcast: code }); inq.wa[sid] = { ok: true, number: num, at: nowISO(), id: d.localMessageId || '' }; okWa++; } catch (e) { inq.wa[sid] = { ok: false, number: num, error: e.message, at: nowISO() }; } })());
            else inq.wa[sid] = { ok: false, error: 'No WhatsApp mobile number', at: nowISO() }; }
          await Promise.all(jobs); await pmSleep(useWa ? 900 : 500);
        }
        inq.status = 'sent'; inq.sentAt = nowISO(); persist('inquiries', inq);
        audit('Inquiry sent', 'inquiry', inq.id, `${code}: ${ok}/${inq.vendors.length} emailed${useWa ? `, ${okWa} WhatsApp` : ''}, ${inq.items.length} item(s)`);
        UI.ni = null; UI.inqId = inq.id; endJob(); toast(`${code} sent: ${ok} email(s)${useWa ? `, ${okWa} WhatsApp` : ''}.`); go('inquiries', { inqId: inq.id });
      } catch (e) { endJob(); toast('Could not create the inquiry: ' + e.message, 'err'); }
    }
  });
  Object.assign(CHANGE, {
    niPick: el => { syncNI(); const L = UI.ni.lines.find(x => x.id === el.dataset.id); const v = el.value; const it = S.items.find(i => !i.deleted && (v === i.name || v === i.name + (i.code ? ' — ' + i.code : '')));
      if (it) { Object.assign(L, { itemId: it.id, name: it.name, code: it.code || '', make: it.make || '', spec: it.spec || '', packing: it.packing || '', uom: it.uom || L.uom, qty: L.qty || it.qty || '', files: [...(it.files || [])] }); (it.vendors || []).forEach(id => { if (!UI.ni.vendors.includes(id) && byId('suppliers', id)) UI.ni.vendors.push(id); }); }
      else { L.itemId = ''; L.name = v; } render(); },
    niCopy: el => { if (!el.value) return; syncNI(); const p = byId('inquiries', el.value); UI.ni.lines = (p.items || []).map(i => ({ ...i, id: uid('li') })); UI.ni.vendors = [...new Set([...UI.ni.vendors, ...(p.vendors || []).filter(id => byId('suppliers', id))])]; render(); },
    niLineFiles: async el => { syncNI(); const L = UI.ni.lines.find(x => x.id === el.dataset.id); await uploadFiles(el, L.files); render(); },
    niFiles: async el => { syncNI(); await uploadFiles(el, UI.ni.files); render(); },
    niV: el => { syncNI(); const v = UI.ni.vendors; el.checked ? v.push(el.dataset.id) : v.splice(v.indexOf(el.dataset.id), 1); render(); }
  });
  INPUT.niVq = v => { syncNI(); UI.ni.vq = v; }; INPUT.niTestTo = v => UI.niTestTo = v;
  SUBMIT.niNext2 = () => { syncNI(); const n = UI.ni;
    if (LOGI[n.kind]) { const sh = n.ship || {}; if (!sh.destination || !sh.portDischarge) return toast('Destination and port of discharge are required.', 'err'); if (n.kind === 'AIR' && !LOGI.chargeable(sh)) return toast('Enter the gross or volume weight.', 'err'); if (!n.vendors.length) return toast('Select at least one forwarder.', 'err');
      n.lines = [{ id: 'ship', itemId: '', name: `${LOGI[n.kind].label} — ${sh.destination}${sh.portDischarge ? ' (' + sh.portDischarge + ')' : ''}`, code: '', qty: n.kind === 'AIR' ? String(LOGI.chargeable(sh)) : (sh.cartons ? sh.cartons + ' cartons' : '1'), uom: n.kind === 'AIR' ? 'kg chargeable' : 'shipment', make: '', spec: sh.commodity || '', packing: sh.dimensions || '', files: [] }]; n.step = 3; n.testOk = false; render(); return; } if (!n.lines.every(L => L.name && L.qty)) return toast('Every item needs a product and quantity.', 'err'); if (!n.vendors.length) return toast('Select at least one vendor.', 'err'); n.step = 3; n.testOk = false; render(); };

  /* ---------- Inquiry management: comparison, lowest rate, finalize ---------- */
  function quotesFor(inq) { return S.quotes.filter(q => q.inquiryId === inq.id); }
  function vInqs() {
    const f = UI.filters; const q = normText(f.nq || '');
    let list = S.inquiries.slice().sort((a, b) => String(b.createdAt).localeCompare(a.createdAt));
    if (q) list = list.filter(x => normText(x.code + ' ' + (x.items || []).map(i => i.name).join(' ')).includes(q));
    if (f.nst) list = list.filter(x => x.status === f.nst);
    const inq = byId('inquiries', UI.inqId) || list[0]; if (inq) UI.inqId = inq.id;
    const ST = { draft: ['Draft', ''], sent: ['Sent', 'info'], closed: ['Closed', 'ok'], cancelled: ['Cancelled', 'bad'] };
    return `<div class="page-head"><div><h1>Inquiry management <span class="tag">${activeDept()}</span></h1><p>Track inquiries and compare vendor quotations. The lowest rate for each item is highlighted.</p></div><div class="row"><button class="btn" data-act="inqRefresh" ${BUSY ? 'disabled' : ''}>↻ Refresh</button><button class="btn primary" data-go="newinq">+ New inquiry</button></div></div>
    <div class="inq-grid"><div class="panel inq-list"><input class="inp" placeholder="Search" value="${escH(f.nq || '')}" data-input="nq"><select class="inp" data-change="nst" style="margin-top:8px"><option value="">All statuses</option>${Object.entries(ST).map(([k, v]) => `<option value="${k}" ${f.nst === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
      <div class="inq-items">${list.map(x => { const qn = quotesFor(x).length; return `<button class="inq-row ${inq && x.id === inq.id ? 'on' : ''}" data-act="inqOpen" data-id="${x.id}"><span><strong>${escH(x.code)}</strong><small>${escH((x.items || []).map(i => i.name).join(', ').slice(0, 42))}</small></span><span class="inq-meta">${badge(ST[x.status] || [x.status, ''])}<small>${qn}/${(x.vendors || []).length} quotes</small></span></button>`; }).join('') || '<p class="muted" style="padding:10px">No inquiries yet.</p>'}</div></div>
      <div>${inq ? inqDetail(inq) : `<div class="panel">${emptyBox('No inquiry selected', 'Create one with + New inquiry.')}</div>`}</div></div>`;
  }
  function logiCompare(inq, it, qs) {
    const L = LOGI[inq.kind]; const cur = inq.currency || 'INR';
    const rows = qs.filter(q => q.items && q.items[it.id]).map(q => ({ q, v: q.items[it.id], s: byId('suppliers', q.supplierId), t: num(q.items[it.id].total) })).sort((a, b) => (a.t ?? 1e15) - (b.t ?? 1e15));
    const vals = rows.map(r => r.t).filter(x => x != null); const min = vals.length ? Math.min(...vals) : null;
    const cols = L.fields.filter(f => f[0] !== 'remarks');
    return `<div class="panel"><div class="row"><h2 style="margin:0">${escH(L.label)}</h2><span class="faint">${escH(it.name)}</span></div>
      <div class="files">${shipTable(inq.shipment || {}, inq.kind).replace(/style="border-collapse:collapse;font-size:13px"/, 'class="shiptbl"')}</div>
      ${rows.length ? `<div class="tbl-wrap"><table class="cmp"><thead><tr><th>Vendor</th>${cols.map(f => `<th>${escH(f[1].replace(' *', ''))}</th>`).join('')}<th>Total (${escH(cur)})</th><th>Remarks</th><th></th></tr></thead><tbody>
      ${rows.map(r => { const low = r.t != null && r.t === min && vals.length > 1; const fin = r.v.status === 'finalized'; const diff = r.t != null && min ? (r.t - min) / min * 100 : null;
        return `<tr class="${low ? 'lowest' : ''} ${fin ? 'final' : ''}"><td><strong>${escH(r.s ? r.s.name : r.q.supplierName)}</strong>${low ? ' <span class="b ok">Lowest total</span>' : diff ? ` <small class="faint">+${diff.toFixed(1)}%</small>` : ''}${fin ? ' <span class="b ind">Finalized</span>' : ''}<div class="faint" style="font-size:11.5px">${fmtDate(r.q.submittedAt)}</div></td>${cols.map(f => `<td>${escH(r.v[f[0]] || '—')}</td>`).join('')}<td><b>${money(r.t)}</b></td><td>${escH(r.v.remarks || '—')}${fin && r.v.finalRemarks ? `<div class="faint">Our note: ${escH(r.v.finalRemarks)}</div>` : ''}</td>
        <td>${fin ? '' : `<button class="btn sm ${low ? 'primary' : ''}" data-act="finOpen" data-q="${r.q.id}" data-i="${it.id}" ${canWrite() ? '' : 'disabled'}>Finalize</button>`}</td></tr>`; }).join('')}</tbody></table></div>
      ${vals.length > 1 ? `<p class="hint" style="margin-top:8px">Lowest total: <b>${cur} ${money(min)}</b> · highest ${cur} ${money(Math.max(...vals))}. Air: total = total freight (or rate × chargeable weight) + all charges. Sea: ocean freight + all charges.</p>` : ''}` : '<p class="muted">No quotation yet.</p>'}</div>`;
  }
  function inqDetail(inq) {
    const qs = quotesFor(inq); const cmp = UI.cmpTax ? landed : netRate;
    const vendors = (inq.vendors || []).map(id => byId('suppliers', id)).filter(Boolean);
    const items = (inq.items || []).map(it => { if (LOGI[inq.kind]) return logiCompare(inq, it, qs);
      const rows = qs.filter(q => q.items && q.items[it.id]).map(q => ({ q, v: q.items[it.id], s: byId('suppliers', q.supplierId) }));
      const vals = rows.map(r => cmp(r.v)).filter(x => x != null); const min = vals.length ? Math.min(...vals) : null; const max = vals.length ? Math.max(...vals) : null;
      return `<div class="panel"><div class="row"><h2 style="margin:0">${escH(it.name)}</h2>${it.code ? `<span class="tag mono">${escH(it.code)}</span>` : ''}<span class="faint">${escH(it.qty)} ${escH(it.uom)}${it.make ? ' · ' + escH(it.make) : ''}${it.spec ? ' · ' + escH(it.spec) : ''}${it.packing ? ' · ' + escH(it.packing) : ''}</span></div>
      <div class="files">${fileChips(it.files)}</div>
      ${rows.length ? `<div class="tbl-wrap"><table class="cmp"><thead><tr><th>Vendor</th><th>Rate</th><th>Disc %</th><th>Final / Net</th><th>Tax %</th><th>With tax</th><th>MRP</th><th>Packing</th><th>Freight</th><th>Insurance</th><th>Delivery</th><th>Payment</th><th>Validity</th><th>Remarks</th><th></th></tr></thead><tbody>
      ${rows.sort((a, b) => (cmp(a.v) ?? 1e15) - (cmp(b.v) ?? 1e15)).map(r => { const c = cmp(r.v); const low = c != null && c === min && vals.length > 1; const fin = r.v.status === 'finalized'; const diff = c != null && min ? ((c - min) / min * 100) : null;
        return `<tr class="${low ? 'lowest' : ''} ${fin ? 'final' : ''}"><td><strong>${escH(r.s ? r.s.name : r.q.supplierName)}</strong>${low ? ' <span class="b ok">Lowest rate</span>' : diff ? ` <small class="faint">+${diff.toFixed(1)}%</small>` : ''}${fin ? ' <span class="b ind">Finalized</span>' : ''}<div class="faint" style="font-size:11.5px">${fmtDate(r.q.submittedAt)}</div></td>
        <td>${escH(r.v.rate || '—')}</td><td>${escH(r.v.discount || '—')}</td><td><b>${money(netRate(r.v))}</b></td><td>${escH(r.v.tax || '—')}</td><td>${money(landed(r.v))}</td><td>${escH(r.v.mrp || '—')}</td><td>${escH(r.v.packing || '—')}</td><td>${escH(r.v.freight || '—')}</td><td>${escH(r.v.insurance || '—')}</td><td>${escH(r.v.delivery || '—')}</td><td>${escH(r.v.payment || '—')}</td><td>${escH(r.v.validity || '—')}</td><td>${escH(r.v.remarks || '—')}${fin && r.v.finalRemarks ? `<div class="faint">Our note: ${escH(r.v.finalRemarks)}</div>` : ''}</td>
        <td>${fin ? '' : `<button class="btn sm ${low ? 'primary' : ''}" data-act="finOpen" data-q="${r.q.id}" data-i="${it.id}" ${canWrite() ? '' : 'disabled'}>Finalize</button>`}</td></tr>`; }).join('')}</tbody></table></div>
      ${vals.length > 1 ? `<p class="hint" style="margin-top:8px">Lowest ${UI.cmpTax ? 'rate including tax' : 'net rate'}: <b>${money(min)}</b> · highest: ${money(max)} · difference ${money(max - min)} per ${escH(it.uom || 'unit')} (${money((max - min) * (num(it.qty) || 0))} on ${escH(it.qty)} ${escH(it.uom)}).</p>` : ''}` : '<p class="muted">No quotation for this item yet.</p>'}</div>`;
    }).join('');
    const vpanel = `<div class="panel"><div class="row"><h2 style="margin:0">Vendors (${vendors.length})</h2><span class="spacer"></span><span class="faint">${qs.length} submitted · ${vendors.length - qs.length} pending</span></div>
      <div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>Vendor</th><th>Email</th><th>WhatsApp</th><th>Quotation</th><th></th></tr></thead><tbody>${vendors.map(s => { const se = (inq.sent || {})[s.id]; const q = qs.find(x => x.supplierId === s.id); const wa = (inq.wa || {})[s.id];
        return `<tr><td><strong>${escH(s.name)}</strong></td><td>${se && se.ok ? `<span class="b ok">Sent</span> <small class="faint">${escH(se.to)}</small>` : se ? `<span class="b bad" title="${escH(se.error)}">Not sent</span> <small class="faint">${escH(se.error || '')}</small>` : '<span class="b">—</span>'}</td><td>${wa ? (wa.ok ? `<span class="b ok">Sent</span> <small class="faint mono">${escH(wa.number)}</small>` : `<span class="b bad" title="${escH(wa.error)}">Not sent</span> <small class="faint">${escH(wa.error || '')}</small>`) : '<span class="faint">—</span>'}</td><td>${q ? `<span class="b ok">Submitted</span> <small class="faint">${fmtDate(q.submittedAt)}</small>` : '<span class="b warn">Pending</span>'}</td>
        <td><div class="row" style="gap:6px"><button class="btn sm" data-act="inqLink" data-s="${s.id}">Copy link</button>${!q && bestEmail(s) && HEALTH.outlookConnected && inq.status === 'sent' ? `<button class="btn sm" data-act="inqResend" data-s="${s.id}">Resend email</button>` : ''}${!q && HEALTH.wati && inq.waTpl && waNumberOf(s) && inq.status === 'sent' ? `<button class="btn sm" data-act="inqWaResend" data-s="${s.id}">${wa && wa.ok ? 'Resend' : 'Send'} WhatsApp</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table></div></div>`;
    return `<div class="panel"><div class="row"><h1 style="margin:0;font-size:22px">${escH(inq.code)}</h1><span class="tag">${escH(inq.dept || 'RM')}</span>${badge({ draft: ['Draft', ''], sent: ['Sent', 'info'], closed: ['Closed', 'ok'], cancelled: ['Cancelled', 'bad'] }[inq.status] || [inq.status, ''])}<span class="spacer"></span>
      ${LOGI[inq.kind] ? '' : `<label class="row" style="gap:6px;font-size:13.5px"><input type="checkbox" class="chk" data-change="cmpTax" ${UI.cmpTax ? 'checked' : ''}> Compare including tax</label>`}<button class="btn sm" data-act="inqExcel">Excel</button>${inq.status === 'sent' && canWrite() ? '<button class="btn sm" data-act="inqClose">Close</button><button class="btn sm danger" data-act="inqCancel">Cancel inquiry</button>' : ''}</div>
      <div class="faint" style="margin-top:6px">Created ${fmtDate(inq.createdAt)} by ${escH(inq.createdByName || '')} · ${LOGI[inq.kind] ? `${escH(LOGI[inq.kind].label)} · quotes in ${escH(inq.currency || 'INR')}${inq.deliveryTime ? ' · needed by ' + escH(inq.deliveryTime) : ''}` : `Delivery ${escH(inq.deliveryTime || '—')} to ${escH(inq.deliveryLocation || '—')}`}</div>${(inq.files || []).length ? `<div class="files">${fileChips(inq.files)}</div>` : ''}</div>${items}${vpanel}`;
  }
  Object.assign(A, {
    inqOpen: el => { UI.inqId = el.dataset.id; render(); },
    inqRefresh: async () => { startJob('Refreshing'); try { await loadData(); } catch (e) { toast(e.message, 'err'); } endJob(); },
    inqLink: async el => { try { const { links } = await api('POST', `/api/inquiries/${UI.inqId}/links`, { supplierIds: [el.dataset.s] }); const l = links[el.dataset.s]; await navigator.clipboard.writeText(l).catch(() => {}); modal(`<h2>Quotation link</h2><p class="muted">Personal link for this vendor — share by WhatsApp or email.</p><input class="inp mono" value="${escH(l)}" readonly><div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn primary" data-act="closeModal">Done</button></div>`); toast('Link copied'); } catch (e) { toast(e.message, 'err'); } },
    inqResend: async el => { const inq = byId('inquiries', UI.inqId); const s = byId('suppliers', el.dataset.s); const c = bestEmail(s); startJob('Sending'); try { const { links } = await api('POST', `/api/inquiries/${inq.id}/links`, { supplierIds: [s.id] }); const st = HEALTH.settings || {}; const icc = inq.cc !== undefined ? inq.cc : st.ccEmails; const d = await api('POST', '/api/outlook/draft', { to: c.value, cc: icc, bcc: inq.bcc || '', replyTo: st.replyToCc !== false ? icc : '', subject: `Reminder: Purchase Inquiry ${inq.code} — Quotation Request`, html: inqEmailHTML(inq, s, links[s.id]) }); await api('POST', '/api/outlook/send', { id: d.id }); inq.sent[s.id] = { ok: true, to: c.value, at: nowISO(), graphId: d.id, reminder: true }; persist('inquiries', inq); audit('Inquiry reminder sent', 'inquiry', inq.id, s.name); toast('Reminder sent'); } catch (e) { toast(e.message, 'err'); } endJob(); },
    inqClose: () => { const inq = byId('inquiries', UI.inqId); if (!confirm('Close this inquiry? Vendors can no longer submit.')) return; inq.status = 'closed'; persist('inquiries', inq); audit('Inquiry closed', 'inquiry', inq.id, inq.code); render(); },
    inqCancel: () => { const inq = byId('inquiries', UI.inqId); if (!confirm('Cancel this inquiry? Vendors can no longer submit.')) return; inq.status = 'cancelled'; persist('inquiries', inq); audit('Inquiry cancelled', 'inquiry', inq.id, inq.code); render(); },
    inqExcel: () => { const inq = byId('inquiries', UI.inqId); const rows = [];
      if (LOGI[inq.kind]) { const L = LOGI[inq.kind]; quotesFor(inq).forEach(q => Object.values(q.items || {}).forEach(v => rows.push(Object.assign({ Inquiry: inq.code, Type: L.label, Vendor: (byId('suppliers', q.supplierId) || {}).name || q.supplierName }, Object.fromEntries(L.fields.map(f => [f[1].replace(' *', ''), v[f[0]] || ''])), { [`Total (${inq.currency || 'INR'})`]: num(v.total), Status: v.status || 'Submitted', Submitted: fmtDate(q.submittedAt) })))); rows.sort((a, b) => a[`Total (${inq.currency || 'INR'})`] - b[`Total (${inq.currency || 'INR'})`]); const f0 = xlsxFile([['Comparison', rows]]); f0 && saveFile(`${inq.code}_freight_comparison.xlsx`, f0, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); return; } (inq.items || []).forEach(it => { const qs = quotesFor(inq).filter(q => q.items && q.items[it.id]); const vals = qs.map(q => netRate(q.items[it.id])).filter(x => x != null); const min = vals.length ? Math.min(...vals) : null;
      qs.forEach(q => { const v = q.items[it.id]; rows.push({ Inquiry: inq.code, Item: it.name, Code: it.code, Qty: `${it.qty} ${it.uom}`, Vendor: (byId('suppliers', q.supplierId) || {}).name || q.supplierName, Rate: v.rate, 'Discount %': v.discount, 'Net rate': netRate(v), 'Tax %': v.tax, 'With tax': landed(v), MRP: v.mrp, Packing: v.packing, Freight: v.freight, Insurance: v.insurance, Delivery: v.delivery, Payment: v.payment, Validity: v.validity, Remarks: v.remarks, Lowest: netRate(v) === min ? 'YES' : '', Status: v.status || 'Submitted', Submitted: fmtDate(q.submittedAt) }); }); });
      const f = xlsxFile([['Comparison', rows]]); f && saveFile(`${inq.code}_comparison.xlsx`, f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); },
    finOpen: el => { const q = byId('quotes', el.dataset.q); const inq = byId('inquiries', UI.inqId); const it = inq.items.find(i => i.id === el.dataset.i); const s = byId('suppliers', q.supplierId);
      modal(`<h2>Finalize ${escH(it.name)}</h2><p>Vendor: <b>${escH(s ? s.name : q.supplierName)}</b> · net rate <b>${money(netRate(q.items[it.id]))}</b></p><form data-submit="finSave" data-q="${q.id}" data-i="${it.id}"><label class="f">Remarks to the vendor (optional)<textarea name="rem" rows="3" placeholder="e.g. FINAL PRICE MAKE RS.70"></textarea></label>
      <label class="row" style="gap:8px;margin-top:10px;font-size:14px"><input type="checkbox" class="chk" name="mail" ${HEALTH.outlookConnected && s && bestEmail(s) ? 'checked' : 'disabled'}> Email the vendor (“Quotation Finalized”) with CC</label>
      <div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary">Finalize</button></div></form>`); }
  });
  SUBMIT.finSave = async (f, fd) => {
    const q = byId('quotes', f.dataset.q); const inq = byId('inquiries', UI.inqId); const it = inq.items.find(i => i.id === f.dataset.i); const v = q.items[it.id]; const s = byId('suppliers', q.supplierId);
    v.status = 'finalized'; v.finalizedAt = nowISO(); v.finalizedBy = ME.name; v.finalRemarks = String(fd.get('rem') || '').trim(); persist('quotes', q);
    it.finalized = { supplierId: q.supplierId, quoteId: q.id, at: nowISO() }; persist('inquiries', inq);
    audit('Quotation finalized', 'inquiry', inq.id, `${inq.code} — ${it.name} → ${s ? s.name : q.supplierName} @ ${money(netRate(v))}`);
    closeModal();
    if (fd.get('mail')) {
      startJob('Emailing vendor');
      try { const st = HEALTH.settings || {}; const c = bestEmail(s); const LL = LOGI[inq.kind]; const head = LL ? [...LL.fields.map(f => f[1].replace(' *', '')), `Total (${inq.currency || 'INR'})`] : ['Product', 'Qty', 'Rate', 'MRP', 'Discount', 'Tax', 'Available Packing', 'Freight', 'Insurance', 'Delivery Time', 'Payment Terms', 'Validity', 'Remarks'];
        const cells = LL ? [...LL.fields.map(f => v[f[0]]), v.total] : [it.name, `${it.qty} ${it.uom}`, v.rate, v.mrp, v.discount ? v.discount + '%' : '', v.tax ? v.tax + '%' : '', v.packing, v.freight, v.insurance, v.delivery, v.payment, v.validity, v.remarks];
        const html = `<div style="font-family:Arial,sans-serif;font-size:14px">Congratulations — your quotation for <b>${escH(it.name)}</b> on inquiry <b>${escH(inq.code)}</b> has been finalized.<br><br><table style="border-collapse:collapse;font-size:13px"><tr>${head.map(h => `<th style="border:1px solid #ddd;padding:6px;background:#f3f4f6;text-align:left">${h}</th>`).join('')}</tr><tr>${cells.map(c => `<td style="border:1px solid #ddd;padding:6px">${escH(c) || '-'}</td>`).join('')}</tr></table>
          <p>Any other item you quoted on this inquiry is still under review, unless you are separately notified.</p>${v.finalRemarks ? `<p><b>Remarks:</b> ${escH(v.finalRemarks)}</p>` : ''}<p>Please proceed as per the agreed terms.</p>Regards,<br>Purchase Department (${escH(inq.dept || activeDept())})<br>West-Coast Pharmaceutical Works Ltd.</div>`;
        const icc = inq.cc !== undefined ? inq.cc : st.ccEmails; const d = await api('POST', '/api/outlook/draft', { to: c.value, cc: icc, bcc: inq.bcc || '', replyTo: st.replyToCc !== false ? icc : '', subject: `Quotation Finalized — ${it.name} (${inq.code})`, html }); await api('POST', '/api/outlook/send', { id: d.id }); toast('Vendor informed by email'); }
      catch (e) { toast('Finalized, but the email failed: ' + e.message, 'err'); }
      endJob();
    } else render();
  };
  Object.assign(CHANGE, { nst: el => { UI.filters.nst = el.value; render(); }, cmpTax: el => { UI.cmpTax = el.checked; render(); } });
  INPUT.nq = v => UI.filters.nq = v;

  /* ---------- Backups: Google Drive + a folder on this PC ---------- */
  function buildAllExcel() {
    const sup = live().map(s => ({ Company: s.name, Dept: s.dept || 'RM', Materials: (s.materials || []).join(', '), City: s.city, State: s.state, Country: s.country, Website: s.website, Emails: contactsOf(s.id).filter(c => c.kind === 'email').map(c => c.value).join(', '), Phones: contactsOf(s.id).filter(c => c.kind !== 'email').map(c => c.normalized || c.value).join(', ') }));
    const items = S.items.filter(i => !i.deleted).map(i => ({ Item: i.name, Code: i.code, Make: i.make, Qty: i.qty, UOM: i.uom, Spec: i.spec, Packing: i.packing, Files: (i.files || []).map(f => f.link).join(' | '), Vendors: (i.vendors || []).map(id => (byId('suppliers', id) || {}).name).filter(Boolean).join(', ') }));
    const inqs = S.inquiries.map(x => ({ Inquiry: x.code, Dept: x.dept, Status: x.status, Items: (x.items || []).map(i => `${i.name} ${i.qty} ${i.uom}`).join('; '), Vendors: (x.vendors || []).length, Quotes: quotesFor(x).length, Created: fmtDate(x.createdAt), By: x.createdByName }));
    const quotes = []; S.quotes.forEach(q => { const x = byId('inquiries', q.inquiryId) || {}; Object.entries(q.items || {}).forEach(([iid, v]) => { const it = (x.items || []).find(i => i.id === iid) || {}; quotes.push({ Inquiry: x.code, Item: it.name, Vendor: (byId('suppliers', q.supplierId) || {}).name || q.supplierName, Rate: v.rate, 'Net rate': netRate(v), 'Tax %': v.tax, Delivery: v.delivery, Payment: v.payment, Status: v.status || 'Submitted', Remarks: v.remarks }); }); });
    const au = S.audit.slice().sort((a, b) => a.at.localeCompare(b.at)).map(a => ({ When: fmtDate(a.at), Who: a.by, Action: a.action, Detail: a.detail }));
    return xlsxFile([['Vendors', sup], ['Items', items], ['Inquiries', inqs], ['Quotations', quotes], ['Audit', au]]);
  }
  const backupJSON = () => JSON.stringify({ app: 'WESTCOAST AI Procurement Agent', dept: activeDept(), exportedAt: nowISO(), data: S });
  const today = () => new Date().toISOString().slice(0, 10);
  const idb = (mode, key, val) => new Promise((res, rej) => { const r = indexedDB.open('wcpa', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onerror = () => rej(r.error); r.onsuccess = () => { const tx = r.result.transaction('kv', mode); const st = tx.objectStore('kv'); const q = mode === 'readwrite' ? st.put(val, key) : st.get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }; });
  async function localBackup(auto) {
    const dir = await idb('readonly', 'backupDir').catch(() => null); if (!dir) { if (!auto) toast('Choose a backup folder first.', 'err'); return false; }
    let perm = await dir.queryPermission({ mode: 'readwrite' }); if (perm !== 'granted' && !auto) perm = await dir.requestPermission({ mode: 'readwrite' }); if (perm !== 'granted') return false;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const put = async (name, data) => { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(data); await w.close(); };
    await put(`westcoast_${activeDept()}_backup_${stamp}.json`, backupJSON()); const x = buildAllExcel(); if (x) await put(`westcoast_${activeDept()}_all_data_${stamp}.xlsx`, x);
    localStorage.setItem('wcpa-local-backup', JSON.stringify({ at: nowISO(), day: today(), folder: dir.name })); if (!auto) toast('Backup saved in folder “' + dir.name + '”'); audit('Local folder backup', 'backup', '', dir.name + (auto ? ' (automatic)' : '')); return true;
  }
  const _vBackups = vBackups;
  vBackups = function () {
    const lb = JSON.parse(localStorage.getItem('wcpa-local-backup') || 'null'); const fsOk = 'showDirectoryPicker' in window;
    return _vBackups().replace('<div class="grid g3">', `<div class="grid g2" style="margin-bottom:18px">
      <div class="panel"><h2>Google Drive (cloud)</h2><p class="muted">${HEALTH.gdriveConnected ? `Connected${UI.gAcc ? ' to <b>' + escH(UI.gAcc) + '</b>' : ''}. All data is saved to <b>WESTCOAST Procurement / Backups</b> in Drive${HEALTH.cron ? ' every night automatically' : ''}; artwork files go to <b>Inquiry files</b>.` : 'Not connected. The admin connects the company Google account once in Integrations.'}</p>
        <div class="row">${HEALTH.gdriveConnected ? `<button class="btn primary" data-act="gBackup" ${BUSY ? 'disabled' : ''}>Back up to Google Drive now</button>` : isAdmin() && HEALTH.gdrive ? '<button class="btn blue" data-act="gConnect">Connect Google Drive</button>' : ''}</div>${UI.gLast ? `<p class="hint" style="margin-top:8px">Last Drive backup: ${escH(UI.gLast)}</p>` : ''}</div>
      <div class="panel"><h2>Folder on this PC (local)</h2><p class="muted">${fsOk ? `Pick a folder once (for example D:\\Westcoast Backup). The tool saves a JSON + Excel copy there and repeats it automatically once a day when you open it on this PC.` : 'Your browser cannot write to folders — use Chrome or Edge on a PC. You can still download a backup below.'}</p>
        ${fsOk ? `<div class="row"><button class="btn" data-act="lChoose">${lb ? 'Change folder' : 'Choose backup folder'}</button><button class="btn primary" data-act="lNow" ${lb ? '' : 'disabled'}>Back up to folder now</button></div>${lb ? `<p class="hint" style="margin-top:8px">Folder: <b>${escH(lb.folder)}</b> · last backup ${fmtDate(lb.at)}</p>` : ''}` : ''}</div></div><div class="grid g3">`);
  };
  Object.assign(A, {
    gConnect: () => { location.href = '/api/gdrive/connect'; },
    gBackup: async () => { startJob('Backing up to Google Drive'); try { const r = await api('POST', '/api/gdrive/backup'); const x = buildAllExcel(); if (x) { const blob = new File([x], `westcoast_${activeDept()}_all_data_${today()}.xlsx`, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }); await driveUpload(blob, 'backups', false); } UI.gLast = fmtDate(nowISO()) + ' — ' + r.name; audit('Google Drive backup', 'backup', r.id, r.name); toast('Saved to Google Drive'); } catch (e) { toast('Drive backup failed: ' + e.message, 'err'); } endJob(); },
    lChoose: async () => { try { const dir = await window.showDirectoryPicker({ id: 'wcpa-backup', mode: 'readwrite' }); await idb('readwrite', 'backupDir', dir); await localBackup(false); render(); } catch (e) { if (e.name !== 'AbortError') toast(e.message, 'err'); } },
    lNow: async () => { try { await localBackup(false); render(); } catch (e) { toast('Local backup failed: ' + e.message, 'err'); } }
  });
  // daily automatic local backup when the app is opened (only if the folder permission is still granted)
  setTimeout(async () => { try { const lb = JSON.parse(localStorage.getItem('wcpa-local-backup') || 'null'); if (ME && lb && lb.day !== today() && 'showDirectoryPicker' in window) await localBackup(true); } catch {} }, 8000);

  /* ---------- Integrations: Google Drive card ---------- */
  const _vInt = vIntegrations;
  vIntegrations = function () {
    return _vInt().replace('<div class="grid g2">', `<div class="grid g2"><div class="panel icard"><div class="row"><h2 style="margin:0">Google Drive</h2><span class="spacer"></span>${HEALTH.gdriveConnected ? '<span class="b ok">Connected</span>' : '<span class="b">Not connected</span>'}</div><p class="muted">${HEALTH.gdrive ? 'Company Drive for artwork / spec attachments and backups (folder “WESTCOAST Procurement”). The app can only see files it created.' : 'Needs a Google Cloud OAuth client. Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_URL (see README).'}</p><div class="row">${HEALTH.gdrive && isAdmin() ? (HEALTH.gdriveConnected ? '<button class="btn sm danger" data-act="gDisconnect">Disconnect</button>' : '<button class="btn sm blue" data-act="gConnect">Connect Google Drive</button>') : ''}${HEALTH.gdriveConnected ? `<button class="btn sm" data-act="itest" data-k="gdrive" ${BUSY ? 'disabled' : ''}>Run test</button>` : ''}</div>${UI.tests && UI.tests.gdrive ? `<div class="note ${UI.tests.gdrive.ok ? '' : 'bad'}" style="margin-top:10px;font-size:13px">${escH(UI.tests.gdrive.msg)}</div>` : ''}</div>`);
  };
  A.gDisconnect = async () => { if (!confirm('Disconnect Google Drive? Files already in Drive stay there.')) return; await api('POST', '/api/gdrive/disconnect'); HEALTH.gdriveConnected = false; render(); };
  // hash messages after Google sign-in
  const _hashBoot = boot;
  boot = async function () { const h = new URLSearchParams(location.hash.slice(1)); await _hashBoot(); if (!ME) return; if (HEALTH.gdriveConnected) api('GET', '/api/gdrive/status').then(r => { UI.gAcc = r.account; UI.gLast = r.lastBackup ? fmtDate(r.lastBackup.at) + ' — ' + r.lastBackup.name : ''; }).catch(() => {}); if (activeDept() !== 'RM' && UI.view === 'find' && !h.get('outlook')) go('inquiries'); if (h.get('gdrive') === 'connected') { toast('Google Drive connected'); history.replaceState(null, '', '/'); go('integrations'); } else if (h.get('gdrive') === 'error') { toast('Google Drive: ' + (h.get('msg') || 'failed'), 'err'); history.replaceState(null, '', '/'); go('integrations'); } };
  Object.assign(window.EXTRA_VIEWS_PM = {}, { inquiries: () => vInqs(), newinq: () => vNewInq(), itemsm: () => vItems() });


  /* ================= v2.4 — Rich email templates (formatting, tables, attachments) ================= */
  const OK_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN', 'DIV', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD', 'A', 'HR', 'BLOCKQUOTE', 'FONT', 'SUB', 'SUP', 'COLGROUP', 'COL', 'CAPTION']);
  const OK_CSS = /^(color|background-color|background|font-size|font-weight|font-style|font-family|text-align|text-decoration|vertical-align|border(-(top|right|bottom|left))?(-(width|style|color))?|border-collapse|padding(-(top|right|bottom|left))?|margin(-(top|bottom))?|width|min-width|height|line-height|white-space)$/i;
  function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString('<div>' + String(html || '') + '</div>', 'text/html');
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 8) { n.remove(); return; }
        if (n.nodeType !== 1) return;
        if (!OK_TAGS.has(n.tagName)) { if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'META', 'LINK', 'TITLE', 'XML'].includes(n.tagName) || n.tagName.includes(':')) { n.remove(); return; } walk(n); n.replaceWith(...n.childNodes); return; }
        [...n.attributes].forEach(a => {
          const k = a.name.toLowerCase();
          if (k === 'style') { const keep = a.value.split(';').map(x => x.trim()).filter(x => { const [p, v] = x.split(':'); return p && v && OK_CSS.test(p.trim()) && !/url\(|expression|javascript/i.test(v); }).join('; '); keep ? n.setAttribute('style', keep) : n.removeAttribute('style'); }
          else if (k === 'href') { if (!/^(https?:|mailto:|tel:)/i.test(a.value.trim()) && !/^\{\{/.test(a.value.trim())) n.removeAttribute('href'); else { n.setAttribute('target', '_blank'); n.setAttribute('rel', 'noopener noreferrer'); } }
          else if (!['colspan', 'rowspan', 'align', 'valign', 'width', 'border', 'cellpadding', 'cellspacing', 'color', 'size', 'target', 'rel'].includes(k)) n.removeAttribute(a.name);
        });
        walk(n);
      });
    };
    walk(doc.body.firstChild); return doc.body.firstChild.innerHTML;
  }
  window.sanitizeHtml = sanitizeHtml;
  // Excel / Word put colours and borders in <style> classes — copy them onto the cells so they survive.
  function inlineClassStyles(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html'); const rules = {};
    doc.querySelectorAll('style').forEach(st => { for (const m of st.textContent.matchAll(/((?:[\w-]*\.[\w-]+\s*,?\s*)+)\{([^}]*)\}/g)) m[1].split(',').forEach(sel => { const cls = (sel.trim().match(/\.([\w-]+)$/) || [])[1]; if (cls) rules[cls] = (rules[cls] || '') + ';' + m[2]; }); });
    doc.querySelectorAll('[class]').forEach(el => { const css = [...el.classList].map(c => rules[c] || '').join(';'); if (css) el.setAttribute('style', css + ';' + (el.getAttribute('style') || '')); });
    doc.querySelectorAll('td,th').forEach(td => { if (!/border/i.test(td.getAttribute('style') || '')) td.setAttribute('style', (td.getAttribute('style') || '') + ';border:1px solid #9aa4b2;padding:4px 8px'); });
    doc.querySelectorAll('table').forEach(t => t.setAttribute('style', 'border-collapse:collapse;' + (t.getAttribute('style') || '')));
    return doc.body.innerHTML;
  }
  const textToHtml = t => esc(t || '').replace(/\n/g, '<br>');
  const htmlToText = h => { const d = document.createElement('div'); d.innerHTML = sanitizeHtml(String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|h\d|li|tr)>/gi, '\n')); [...d.querySelectorAll('td,th')].forEach(c => c.append(' \t ')); return d.textContent.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); };
  function fillHtml(html, pr, s, c) {
    const vals = {}; const [filled] = fillTpl(PLACEHOLDERS.map(k => `{{${k}}}`).join('\u0003'), pr, s, c); filled.split('\u0003').forEach((v, i) => vals[PLACEHOLDERS[i]] = v);
    const out = html.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (m, k) => vals[k] !== undefined && vals[k] !== `{{${k}}}` ? esc(vals[k]) : m);
    const miss = [...out.matchAll(/\{\{\s*([A-Z_]+)\s*\}\}/g)].map(m => m[1]);
    return [out, [...new Set(miss)]];
  }
  const tplHtml = t => t ? (t.html ? sanitizeHtml(t.html) : textToHtml(t.body)) : '';
  // email wrapper: inline font so Outlook / Gmail render it consistently
  const mailWrap = h => `<div style="font-family:Calibri,Arial,sans-serif;font-size:14px;color:#111">${h}</div>`;

  /* ---------- editor ---------- */
  let TE = null;   // template being edited
  const FONT_SIZES = [['2', 'Small'], ['3', 'Normal'], ['4', 'Large'], ['5', 'Larger'], ['6', 'Huge']];
  tplForm = function (t) {
    TE = t ? JSON.parse(JSON.stringify(t)) : { name: 'New RFQ template', subject: isPM() ? 'Request for Quotation — {{MATERIAL}} — {{QUANTITY}} {{UNIT}}' : 'Request for Quotation — {{API_NAME}}', html: '', body: '', files: [] };
    TE.files = TE.files || [];
    const html = TE.html ? sanitizeHtml(TE.html) : textToHtml(TE.body);
    const btn = (cmd, label, title, arg) => `<button type="button" class="tb" data-act="teCmd" data-c="${cmd}" ${arg !== undefined ? `data-v="${arg}"` : ''} title="${title}">${label}</button>`;
    modal(`<h2>${t ? 'Edit template' : 'New template'}</h2><form data-submit="saveTpl" data-id="${t ? t.id : ''}" id="teForm">
      <div class="form" style="grid-template-columns:1fr"><label class="f">Name<input name="name" required value="${esc(TE.name)}"></label><label class="f">Subject<input name="subject" id="teSubj" required value="${esc(TE.subject)}"></label></div>
      <div class="f" style="margin-top:12px"><span>Body</span>
      <div class="toolbar" role="toolbar" aria-label="Formatting">
        ${btn('undo', '↶', 'Undo')}${btn('redo', '↷', 'Redo')}<i></i>
        <select data-change="teBlock" title="Paragraph style"><option value="p">Normal</option><option value="h2">Heading</option><option value="h3">Sub-heading</option></select>
        <select data-change="teSize" title="Font size">${FONT_SIZES.map(([v, l]) => `<option value="${v}" ${v === '3' ? 'selected' : ''}>${l}</option>`).join('')}</select><i></i>
        ${btn('bold', '<b>B</b>', 'Bold (Ctrl+B)')}${btn('italic', '<i>I</i>', 'Italic (Ctrl+I)')}${btn('underline', '<u>U</u>', 'Underline (Ctrl+U)')}${btn('strikeThrough', '<s>S</s>', 'Strikethrough')}
        <label class="tb clr" title="Text colour">A<input type="color" data-change="teColor" value="#c00000"></label><label class="tb clr hl" title="Highlight">▮<input type="color" data-change="teHilite" value="#ffff00"></label><i></i>
        ${btn('justifyLeft', '⯇', 'Align left')}${btn('justifyCenter', '≡', 'Centre')}${btn('justifyRight', '⯈', 'Align right')}${btn('insertUnorderedList', '• List', 'Bullets')}${btn('insertOrderedList', '1. List', 'Numbering')}<i></i>
        <button type="button" class="tb" data-act="teTable" title="Insert table">▦ Table</button><button type="button" class="tb" data-act="teRow" title="Add row below">+Row</button><button type="button" class="tb" data-act="teCol" title="Add column right">+Col</button><button type="button" class="tb" data-act="teDelRow" title="Delete row">−Row</button><button type="button" class="tb" data-act="teDelCol" title="Delete column">−Col</button><button type="button" class="tb" data-act="teHead" title="Header row colour">Head</button><i></i>
        <button type="button" class="tb" data-act="teLink" title="Insert link">🔗</button>${btn('insertHorizontalRule', '―', 'Line')}${btn('removeFormat', '⌫ Fmt', 'Clear formatting')}
        <select data-change="tePh" title="Insert placeholder"><option value="">+ Placeholder</option>${PLACEHOLDERS.map(p => `<option value="${p}">{{${p}}}</option>`).join('')}</select>
      </div>
      <div class="editor" id="teBody" contenteditable="true" spellcheck="true">${html || '<p><br></p>'}</div>
      <span class="hint">Tip: copy a table from Excel or Word and paste it here — borders and colours are kept. Placeholders are filled for every supplier.</span></div>
      <h3 style="margin-top:14px">Attachments (sent with every email that uses this template)</h3>
      <div class="files" id="teFiles"></div><label class="btn sm" style="cursor:pointer">Add files<input type="file" multiple hidden data-change="teFilesIn"></label> <span class="hint">${HEALTH.gdriveConnected ? 'Stored in Google Drive (up to 100 MB per file; big files go as download links).' : 'Without Google Drive: up to 2.5 MB in total.'}</span>
      <div class="row" style="margin-top:16px"><button class="btn" type="button" data-act="tePreview">Preview</button><span class="spacer"></span><button class="btn" type="button" data-act="closeModal">Cancel</button><button class="btn primary">Save template</button></div></form>`, true);
    paintTeFiles();
    const ed = $('#teBody'); try { document.execCommand('styleWithCSS', false, true); document.execCommand('defaultParagraphSeparator', false, 'p'); } catch {}
    ed.addEventListener('paste', e => { const h = e.clipboardData && e.clipboardData.getData('text/html'); if (h) { e.preventDefault(); document.execCommand('insertHTML', false, sanitizeHtml(inlineClassStyles(h.replace(/<!--StartFragment-->|<!--EndFragment-->/g, '')))); } });
    ed.addEventListener('keyup', saveSel); ed.addEventListener('mouseup', saveSel);
  };
  let SEL = null;
  function saveSel() { const s = window.getSelection(); if (s.rangeCount && $('#teBody') && $('#teBody').contains(s.anchorNode)) SEL = s.getRangeAt(0).cloneRange(); }
  function restoreSel() { const ed = $('#teBody'); ed.focus(); if (SEL) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(SEL); } }
  const cmd = (c, v) => { restoreSel(); document.execCommand(c, false, v); saveSel(); };
  function paintTeFiles() { const el = $('#teFiles'); if (el) el.innerHTML = TE.files.map((f, i) => `<span class="fchip">📎 ${esc(f.name)} <small>${(f.size / 1048576).toFixed(1)} MB</small> <button type="button" class="x" data-act="teRmFile" data-i="${i}" aria-label="Remove">×</button></span>`).join('') || '<span class="faint" style="font-size:13px">No attachments</span>'; }
  function curCell() { const s = window.getSelection(); let n = SEL ? SEL.startContainer : s.anchorNode; while (n && n.id !== 'teBody') { if (n.nodeName === 'TD' || n.nodeName === 'TH') return n; n = n.parentNode; } return null; }
  const CELL = 'border:1px solid #9aa4b2;padding:6px 10px;';
  Object.assign(A, {
    teCmd: el => cmd(el.dataset.c, el.dataset.v),
    teTable: () => { const r = Math.min(30, Math.max(1, +prompt('Rows (including the header row)?', '3') || 0)); if (!r) return; const c = Math.min(12, Math.max(1, +prompt('Columns?', '4') || 0)); if (!c) return;
      const head = `<tr>${Array.from({ length: c }, (_, i) => `<th style="${CELL}background-color:#fff200;font-weight:bold;text-align:left">Heading ${i + 1}</th>`).join('')}</tr>`;
      const body = Array.from({ length: r - 1 }, () => `<tr>${Array.from({ length: c }, () => `<td style="${CELL}">&nbsp;</td>`).join('')}</tr>`).join('');
      cmd('insertHTML', `<table style="border-collapse:collapse;margin:6px 0"><tbody>${head}${body}</tbody></table><p><br></p>`); },
    teRow: () => { const c = curCell(); if (!c) return toast('Click inside a table first.', 'err'); const tr = c.parentNode; const n = tr.cloneNode(true); [...n.children].forEach(x => { const td = document.createElement('td'); td.setAttribute('style', CELL); td.innerHTML = '&nbsp;'; x.replaceWith(td); }); tr.after(n); },
    teCol: () => { const c = curCell(); if (!c) return toast('Click inside a table first.', 'err'); const i = [...c.parentNode.children].indexOf(c); c.closest('table').querySelectorAll('tr').forEach((tr, ri) => { const ref = tr.children[i]; const x = document.createElement(ref && ref.nodeName === 'TH' ? 'th' : 'td'); x.setAttribute('style', ref ? ref.getAttribute('style') || CELL : CELL); x.innerHTML = '&nbsp;'; ref ? ref.after(x) : tr.append(x); }); },
    teDelRow: () => { const c = curCell(); if (!c) return toast('Click inside a table first.', 'err'); const t = c.closest('table'); c.parentNode.remove(); if (!t.querySelector('tr')) t.remove(); SEL = null; },
    teDelCol: () => { const c = curCell(); if (!c) return toast('Click inside a table first.', 'err'); const i = [...c.parentNode.children].indexOf(c); const t = c.closest('table'); t.querySelectorAll('tr').forEach(tr => tr.children[i] && tr.children[i].remove()); if (!t.querySelector('td,th')) t.remove(); SEL = null; },
    teHead: () => { const c = curCell(); if (!c) return toast('Click inside a table first.', 'err'); const col = prompt('Header row colour (e.g. #fff200 yellow, #dbeafe blue, #e5e7eb grey):', '#fff200'); if (!col || !/^#[0-9a-f]{3,6}$/i.test(col)) return; [...c.parentNode.children].forEach(x => { x.style.backgroundColor = col; x.style.fontWeight = 'bold'; }); },
    teLink: () => { const u = prompt('Link address (https://…)', 'https://'); if (u && /^(https?:|mailto:)/i.test(u)) cmd('createLink', u); },
    teRmFile: el => { TE.files.splice(+el.dataset.i, 1); paintTeFiles(); },
    tePreview: () => { const pr = byId('prs', UI.prId) || S.prs[0] || { api: 'Sample material', qty: '1000', unit: 'Nos', pharmacopoeia: 'IP', code: 'PR-0000' }; const s = live()[0] || { name: 'Sample Supplier Pvt Ltd', id: '' };
      const [h] = fillHtml(sanitizeHtml($('#teBody').innerHTML), pr, s, s.id ? bestEmail(s) : null); const [sub] = fillTpl($('#teSubj').value, pr, s, s.id ? bestEmail(s) : null);
      const w = document.createElement('div'); w.className = 'modal-bg'; w.style.zIndex = 95; w.innerHTML = `<div class="modal wide pop"><h2>Preview — ${esc(s.name)}</h2><div class="preview html"><div class="pv-h">Subject: ${esc(sub)}</div>${mailWrap(h)}</div><div class="faint" style="margin-top:8px">${TE.files.length ? '📎 ' + TE.files.map(f => esc(f.name)).join(', ') : 'No attachments'}</div><div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn primary" type="button">Close preview</button></div></div>`;
      w.querySelector('button').onclick = () => w.remove(); document.body.append(w); }
  });
  Object.assign(CHANGE, {
    teBlock: el => cmd('formatBlock', el.value), teSize: el => cmd('fontSize', el.value), teColor: el => cmd('foreColor', el.value), teHilite: el => cmd('hiliteColor', el.value),
    tePh: el => { if (el.value) cmd('insertText', `{{${el.value}}}`); el.value = ''; },
    teFilesIn: async el => {
      const files = [...el.files]; el.value = ''; const total = () => TE.files.reduce((n, f) => n + f.size, 0);
      if (total() + files.reduce((n, f) => n + f.size, 0) > 20 * 1048576) return toast('More than 20 MB in total — Outlook rejects bigger emails.', 'err');
      startJob('Adding attachments');
      for (const f of files) { try {
        if (HEALTH.gdriveConnected) { const d = await driveUpload(f, 'files', false); TE.files.push({ id: d.id, name: f.name, size: f.size, mimeType: f.type || 'application/octet-stream' }); }
        else { if (total() + f.size > 2.5 * 1048576) { toast(f.name + ': without Google Drive at most 2.5 MB in total.', 'err'); continue; } const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(f); }); TE.files.push({ name: f.name, size: f.size, mimeType: f.type || 'application/octet-stream', b64 }); }
      } catch (e) { toast(f.name + ': ' + e.message, 'err'); } }
      endJob(); paintTeFiles();
    }
  });
  SUBMIT.saveTpl = (f, fd) => {
    const html = sanitizeHtml($('#teBody').innerHTML).trim();
    const t = f.dataset.id ? byId('templates', f.dataset.id) : { id: uid('tpl'), archived: false, createdAt: nowISO(), ...(myDept() || activeDept() ? { dept: activeDept() } : {}) };
    t.name = fd.get('name'); t.subject = fd.get('subject'); t.html = html; t.body = htmlToText(html); t.files = TE.files;
    const is = tplIssues({ subject: t.subject, body: t.subject + ' ' + html });
    persist('templates', t); audit('Saved template', 'template', t.id, t.name + (t.files.length ? ` (${t.files.length} attachment(s))` : '')); closeModal(); TE = null;
    if (is.bad.length || is.broken) toast('Saved, but unknown placeholders: ' + is.bad.join(', '), 'err'); else toast('Template saved'); render();
  };

  /* ---------- use rich templates when sending ---------- */
  const _attachPayload = attachPayload;
  attachPayload = function () {
    const tpl = byId('templates', UI.mailTpl); const tf = (tpl && tpl.files) || [];
    const fs = [...(UI.sendFiles || []), ...tf.filter(x => !(UI.sendFiles || []).some(y => y.id && y.id === x.id))];
    if (!fs.length) return {};
    return { driveFiles: fs.filter(f => f.id).map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType })), attachments: fs.filter(f => f.b64).map(f => ({ name: f.name, contentType: f.mimeType, b64: f.b64 })) };
  };
  const _mailFor = mailFor;
  mailFor = function (pr, s) {
    const m = _mailFor(pr, s); const tpl = byId('templates', UI.mailTpl);
    if (tpl && tpl.html) { const [h, miss] = fillHtml(sanitizeHtml(tpl.html), pr, s, bestEmail(s)); m.html = mailWrap(h); m.missing = [...new Set([...(m.missing || []), ...miss])]; }
    return m;
  };


  /* ================= v2.5 — Item master: Excel import ================= */
  const ITF = [['name', 'Product / material name *', /product|material|item|description|name/i], ['code', 'Code', /code|item\s*no|part\s*no|sku/i], ['make', 'Make / type', /make|type|category|^item$/i],
    ['qty', 'Usual quantity', /qty|quantity|req/i], ['uom', 'Unit (UOM)', /uom|unit/i], ['spec', 'Specification', /spec|gsm|size|grade/i], ['packing', 'Packing specification', /packing|pack/i], ['vendors', 'Vendors (names, comma separated)', /vendor|supplier|party/i]];
  const IT = { file: '', wb: null, sheets: [], sheet: 0, rows: [], head: 0, map: {}, done: null };
  const icell = (r, k) => IT.map[k] === undefined || IT.map[k] === '' ? '' : String(r[IT.map[k]] ?? '').trim();
  function itAutoMap() {
    const h = (IT.rows[IT.head] || []).map(x => String(x || '').trim()); const used = new Set(); IT.map = {};
    // code / qty / uom / spec / packing / make / vendors first, so "name" doesn't grab "Item code"
    ['code', 'uom', 'qty', 'packing', 'spec', 'make', 'vendors', 'name'].forEach(k => { const re = ITF.find(f => f[0] === k)[2]; const i = h.findIndex((x, j) => !used.has(j) && x && re.test(x)); if (i >= 0) { IT.map[k] = i; used.add(i); } });
  }
  function itRead() {
    IT.rows = XLSX.utils.sheet_to_json(IT.wb.Sheets[IT.sheets[IT.sheet]], { header: 1, defval: '', raw: false }).filter(r => r.some(c => String(c).trim()));
    const kw = /product|material|item|code|qty|quantity|spec|uom|packing|make/i;
    IT.head = Math.max(0, IT.rows.slice(0, 15).findIndex(r => r.filter(c => kw.test(String(c))).length >= 2)); itAutoMap();
  }
  const itRows = () => IT.rows.slice(IT.head + 1).filter(r => icell(r, 'name'));
  const vendorByName = n => { const k = normName(n); if (!k) return null; return live().find(s => s.normName === k) || live().find(s => normName(s.name).startsWith(k) || k.startsWith(normName(s.name))) || null; };
  function itFind(r) { const code = icell(r, 'code'), nm = normText(icell(r, 'name')); return S.items.find(i => !i.deleted && ((code && normText(i.code) === normText(code)) || (!code && normText(i.name) === nm))); }
  function itStats() { const rows = itRows(); let dup = 0, vm = 0, vu = 0; rows.forEach(r => { if (itFind(r)) dup++; splitList(icell(r, 'vendors')).forEach(v => vendorByName(v) ? vm++ : vu++); }); return { rows: rows.length, dup, vm, vu }; }
  async function itImport() {
    const rows = itRows(); if (!rows.length) return toast('No rows with a product name — check the column mapping.', 'err');
    startJob('Importing items'); let nNew = 0, nUpd = 0, i = 0; const unknown = new Set();
    for (const r of rows) {
      i++; if (i % 25 === 0) { setProgress(`${i}/${rows.length}`); await new Promise(res => setTimeout(res, 0)); }
      let it = itFind(r); const isNew = !it;
      if (isNew) it = { id: uid('itm'), files: [], vendors: [], createdAt: nowISO() };
      it.name = icell(r, 'name') || it.name;
      ['code', 'make', 'qty', 'uom', 'spec', 'packing'].forEach(k => { const v = icell(r, k); if (v) it[k] = v; });
      if (!it.uom) it.uom = isPM() ? 'NOS' : 'KG';
      splitList(icell(r, 'vendors')).forEach(v => { const s = vendorByName(v); if (s) { if (!it.vendors.includes(s.id)) it.vendors.push(s.id); } else unknown.add(v); });
      it.imported = IT.file; persist('items', it); isNew ? nNew++ : nUpd++;
    }
    setProgress('saving'); await drain();
    audit('Items imported from Excel', 'item', '', `${IT.file}: ${nNew} new, ${nUpd} updated (${activeDept()})`);
    IT.done = { nNew, nUpd, rows: rows.length, unknown: [...unknown].slice(0, 30) }; IT.rows = []; endJob();
    toast(`${nNew} new and ${nUpd} existing items saved in ${activeDept()}.`);
  }
  function itPanel() {
    if (IT.rows.length) {
      const st = itStats(); const head = IT.rows[IT.head] || [];
      return `<div class="panel"><div class="row"><h2 style="margin:0">Check columns — ${esc(IT.file)}</h2>${IT.sheets.length > 1 ? `<select class="inp" style="width:auto" data-change="itSheet">${IT.sheets.map((n, i) => `<option value="${i}" ${i === IT.sheet ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}<span class="spacer"></span><label class="f" style="flex-direction:row;align-items:center;gap:6px">Header row<input class="inp" type="number" min="1" style="width:70px" value="${IT.head + 1}" data-change="itHead"></label></div>
        <div class="map-grid">${ITF.map(([k, l]) => `<label class="f">${l}<select data-change="itMap" data-k="${k}"><option value="">— not in file —</option>${head.map((h, i) => `<option value="${i}" ${IT.map[k] === i ? 'selected' : ''}>${esc(String(h || 'Column ' + (i + 1)))}</option>`).join('')}</select></label>`).join('')}</div>
        <div class="stat-row"><div><b>${st.rows}</b><span>items in file</span></div><div><b>${st.rows - st.dup}</b><span>new</span></div><div><b>${st.dup}</b><span>already in Item master (will be updated)</span></div><div><b>${st.vm}</b><span>vendor names matched${st.vu ? ` · ${st.vu} not found` : ''}</span></div></div>
        <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr>${ITF.map(([, l]) => `<th>${l.replace(' *', '').replace(' (names, comma separated)', '')}</th>`).join('')}</tr></thead><tbody>${itRows().slice(0, 8).map(r => `<tr>${ITF.map(([k]) => `<td>${esc(icell(r, k))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
        <div class="row" style="margin-top:14px"><button class="btn" data-act="itCancel">Cancel</button><button class="btn primary" data-act="itGo" ${IT.map.name === undefined || BUSY ? 'disabled' : ''}>Import ${st.rows} items into ${activeDept()}</button></div></div>`;
    }
    return IT.done ? `<div class="note" style="margin-bottom:16px">Imported ${IT.done.rows} rows: <b>${IT.done.nNew}</b> new items, <b>${IT.done.nUpd}</b> updated.${IT.done.unknown.length ? ` Vendors not found in Vendor master (add them there, then import again): ${esc(IT.done.unknown.join(', '))}` : ''}</div>` : '';
  }
  const _vItems = vItems;
  vItems = function () {
    return _vItems().replace('<button class="btn primary" data-act="itemNew"', `<label class="btn" style="cursor:pointer">Upload Excel / CSV<input type="file" accept=".xlsx,.xls,.csv" hidden data-change="itFile" ${canWrite() ? '' : 'disabled'}></label><button class="btn" data-act="itSample">Sample format</button><button class="btn primary" data-act="itemNew"`)
      .replace('<div class="panel"><input class="inp" style="max-width:280px;margin-bottom:12px" placeholder="Search item', itPanel() + '<div class="panel"><input class="inp" style="max-width:280px;margin-bottom:12px" placeholder="Search item');
  };
  Object.assign(CHANGE, {
    itFile: async el => { const f = el.files[0]; el.value = ''; if (!f) return; if (f.size > 15e6) return toast('File is bigger than 15 MB.', 'err');
      try { IT.wb = XLSX.read(await f.arrayBuffer(), { type: 'array' }); IT.sheets = IT.wb.SheetNames; IT.sheet = 0; IT.file = f.name; IT.done = null; itRead(); if (IT.map.name === undefined) toast('Could not find the product-name column — pick it below.', 'err'); render(); }
      catch (e) { toast('Could not read this file: ' + e.message, 'err'); } },
    itSheet: el => { IT.sheet = +el.value; itRead(); render(); },
    itHead: el => { IT.head = Math.max(0, (+el.value || 1) - 1); itAutoMap(); render(); },
    itMap: el => { if (el.value === '') delete IT.map[el.dataset.k]; else IT.map[el.dataset.k] = +el.value; render(); }
  });
  Object.assign(A, {
    itGo: () => itImport(), itCancel: () => { IT.rows = []; render(); },
    itSample: () => { const f = xlsxFile([['Items', [
      { 'Product / Material name': 'VERASOFT LOTION', 'Code': '25361017', 'Make': 'LABEL', 'Qty': '3100', 'UOM': 'NOS', 'Specification': 'Chromo Label', 'Packing': 'Chromo Label', 'Vendors': 'AANAND JYOT PRINT PACK, AARYAN PRINTECH' },
      { 'Product / Material name': 'MONET F (Mometasone Furoate 0.1% + Fusidic Acid 2% Cream)', 'Code': 'WG60361026', 'Make': 'BOX', 'Qty': '3100', 'UOM': 'NOS', 'Specification': '350FBB, UV Varnish', 'Packing': '', 'Vendors': '' }]]]);
      f && saveFile('item_master_format.xlsx', f, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); }
  });


  /* ================= v2.6 — send statistics, Gmail card, faster uploads, auto backup ================= */
  const isReplied = (r) => r.status === 'replied' || S.replies.some(x => x.supplierId === r.supplierId && x.prId === r.prId && (!r.sentAt || String(x.receivedAt || x.createdAt) >= r.sentAt));
  function sendStats(rfqs) {
    const m = new Map();
    rfqs.filter(r => (r.channel || 'email') === 'email' || r.channel === 'whatsapp').forEach(r => {
      const key = (r.channel === 'whatsapp' ? 'WhatsApp · ' + (r.subject || '').replace('WhatsApp: ', '') : ((byId('templates', r.templateId) || {}).name || 'Email')) + '|' + (r.provider || (r.channel === 'whatsapp' ? 'wati' : 'outlook'));
      const g = m.get(key) || { name: key.split('|')[0], via: key.split('|')[1], sent: 0, failed: 0, replied: 0, drafts: 0, failedList: [], last: '' };
      if (['sent', 'wa_sent', 'replied', 'followup'].includes(r.status)) { g.sent++; if (isReplied(r)) g.replied++; }
      else if (r.status === 'failed') { g.failed++; g.failedList.push(r); } else if (r.status === 'drafted') g.drafts++;
      if (String(r.sentAt || r.createdAt) > g.last) g.last = r.sentAt || r.createdAt; m.set(key, g);
    });
    return [...m.values()].sort((a, b) => String(b.last).localeCompare(a.last));
  }
  const VIA = { outlook: 'Outlook', gmail: 'Gmail', wati: 'WATI' };
  function statsTable(rows, withRetry) {
    if (!rows.length) return '<p class="muted" style="margin-top:8px">Nothing sent yet.</p>';
    return `<div class="tbl-wrap" style="margin-top:10px"><table><thead><tr><th>Template</th><th>Sent with</th><th>Sent</th><th>Failed</th><th>Replied</th><th>No reply yet</th><th>Reply rate</th><th>Last sent</th>${withRetry ? '<th></th>' : ''}</tr></thead><tbody>${rows.map(g => `<tr><td><strong>${esc(g.name)}</strong></td><td>${esc(VIA[g.via] || g.via)}</td><td><span class="b ok plain">${g.sent}</span>${g.drafts ? ` <small class="faint">+${g.drafts} drafts</small>` : ''}</td><td>${g.failed ? `<span class="b bad plain" title="${esc(g.failedList.map(r => ((byId('suppliers', r.supplierId) || {}).name || r.to) + ': ' + ((r.history || []).slice(-1)[0] || {}).note).join('\n'))}">${g.failed}</span>` : '0'}</td><td><span class="b ind plain">${g.replied}</span></td><td>${g.sent - g.replied}</td><td>${g.sent ? Math.round(g.replied / g.sent * 100) + '%' : '—'}</td><td>${fmtDate(g.last)}</td>${withRetry ? `<td>${g.failed ? `<button class="btn sm" data-act="sRetry" data-n="${esc(g.name)}">Select failed</button>` : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }
  const _vSend2 = vSend;
  vSend = function () {
    let h = _vSend2(); const pr = byId('prs', UI.prId); if (!pr) return h;
    const rf = S.rfqs.filter(r => r.prId === pr.id); const st = sendStats(rf);
    const tot = { sent: st.reduce((n, g) => n + g.sent, 0), failed: st.reduce((n, g) => n + g.failed, 0), replied: st.reduce((n, g) => n + g.replied, 0) };
    const failedRows = rf.filter(r => r.status === 'failed');
    const panel = `<div class="panel" id="sendStats"><div class="row"><h2 style="margin:0">Sent so far for ${esc(pr.code)}</h2><span class="spacer"></span>${HEALTH.outlookConnected ? `<button class="btn sm" data-act="syncInbox" ${BUSY ? 'disabled' : ''}>Check Outlook for replies</button>` : ''}</div>
      <div class="stat-row"><div><b>${tot.sent}</b><span>emails / messages sent</span></div><div><b style="color:var(--red)">${tot.failed}</b><span>not sent (failed)</span></div><div><b style="color:var(--indigo-ink)">${tot.replied}</b><span>replied</span></div><div><b>${tot.sent - tot.replied}</b><span>waiting for reply</span></div></div>
      ${statsTable(st, true)}
      ${failedRows.length ? `<details class="excl"><summary>${failedRows.length} not sent — see why</summary>${failedRows.map(r => `<div class="act"><span><strong>${esc((byId('suppliers', r.supplierId) || {}).name || '')}</strong> <span class="faint mono">${esc(r.to || '')}</span></span><span class="faint" style="font-size:12.5px">${esc(((r.history || []).slice(-1)[0] || {}).note || '')}</span></div>`).join('')}</details>` : ''}
      ${S.rfqs.some(r => r.prId === pr.id && r.provider === 'gmail') ? '<p class="hint" style="margin-top:8px">Replies to Gmail are not read automatically (Google only allows that for verified apps). They reach the CC addresses; log them in Supplier replies, or use Outlook to have replies counted automatically.</p>' : ''}</div>`;
    return h.replace('<div class="send-grid">', panel + '<div class="send-grid">');
  };
  A.sRetry = el => { const pr = byId('prs', UI.prId); const ids = S.rfqs.filter(r => r.prId === pr.id && r.status === 'failed' && (((byId('templates', r.templateId) || {}).name || 'Email') === el.dataset.n || r.channel === 'whatsapp')).map(r => r.supplierId); UI.sendSel = new Set(ids); UI.sendSrc = 'all'; toast(ids.length + ' failed supplier(s) selected — fix their email if needed, test, then Send all.'); render(); };
  // Templates tab: performance across all requests
  const _vRFQ = vRFQ;
  vRFQ = function () {
    let h = _vRFQ(); if (UI.tab !== 'tpl') return h;
    return h.replace('<div class="row" style="margin-bottom:14px"><button class="btn primary" data-act="newTpl">', `<div class="panel" style="margin-bottom:16px"><h2 style="margin:0">Template results (${activeDept()})</h2>${statsTable(sendStats(S.rfqs), false)}</div><div class="row" style="margin-bottom:14px"><button class="btn primary" data-act="newTpl">`);
  };

  /* ---------- Gmail connect ---------- */
  A.gmConnect = () => { location.href = '/api/gmail/connect'; };
  A.gmDisconnect = async () => { if (!confirm('Disconnect Gmail?')) return; await api('POST', '/api/gmail/disconnect'); HEALTH.gmailConnected = false; UI.gmAcc = ''; render(); };
  const _vInt2 = vIntegrations;
  vIntegrations = function () {
    return _vInt2().replace('<div class="grid g2">', `<div class="grid g2"><div class="panel icard"><div class="row"><h2 style="margin:0">Gmail</h2><span class="spacer"></span>${HEALTH.gmailConnected ? '<span class="b ok">Connected</span>' : '<span class="b">Not connected</span>'}</div><p class="muted">${HEALTH.gmail ? `Send inquiries from your own Gmail${UI.gmAcc ? ' (<b>' + esc(UI.gmAcc) + '</b>)' : ''}. The tool can only <b>send</b> — it cannot read your Gmail. Each user connects their own.` : 'Uses the same Google client as Drive. Add the redirect URI …/api/gmail/callback and the gmail.send scope in Google Cloud (see README).'}</p><div class="row">${HEALTH.gmail ? (HEALTH.gmailConnected ? '<button class="btn sm danger" data-act="gmDisconnect">Disconnect</button>' : '<button class="btn sm blue" data-act="gmConnect">Connect Gmail</button>') : ''}${HEALTH.gmailConnected ? `<button class="btn sm" data-act="itest" data-k="gmail" ${BUSY ? 'disabled' : ''}>Run test</button>` : ''}</div>${UI.tests && UI.tests.gmail ? `<div class="note ${UI.tests.gmail.ok ? '' : 'bad'}" style="margin-top:10px;font-size:13px">${esc(UI.tests.gmail.msg)}</div>` : ''}</div>`);
  };
  const _bootG = boot;
  boot = async function () {
    const h = new URLSearchParams(location.hash.slice(1)); await _bootG(); if (!ME) return;
    if (HEALTH.gmailConnected) api('GET', '/api/gmail/status').then(r => { UI.gmAcc = r.account && r.account.email; }).catch(() => {});
    if (h.get('gmail') === 'connected') { toast('Gmail connected'); history.replaceState(null, '', '/'); go('integrations'); }
    else if (h.get('gmail') === 'error') { toast('Gmail: ' + (h.get('msg') || 'failed'), 'err'); history.replaceState(null, '', '/'); go('integrations'); }
    setTimeout(() => autoBackup('app opened'), 20000);
  };

  /* ---------- faster uploads: 4 MB chunks, 3 files at a time, up to 100 MB per file ---------- */
  const MAXF = 100 * 1048576;
  driveUpload = async function (file, folder = 'files', share = true) {
    if (!file.size) throw new Error('The file is empty'); if (file.size > MAXF) throw new Error('File is bigger than 100 MB');
    const { token } = await api('POST', '/api/gdrive/upload/start', { name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, folder, share });
    const CH = 16 * 256 * 1024; let start = 0, tries = 0;
    while (start < file.size) {
      let r, d;
      try { r = await fetch(`/api/gdrive/upload/chunk?t=${encodeURIComponent(token)}&start=${start}&total=${file.size}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/octet-stream', 'X-WCPA': '1' }, body: file.slice(start, Math.min(file.size, start + CH)) }); d = await r.json().catch(() => ({})); }
      catch (e) { if (++tries <= 3) { await sleep(1500 * tries); continue; } throw new Error('Network problem while uploading — try again'); }
      if (!r.ok) { if (r.status >= 500 && ++tries <= 3) { await sleep(1500 * tries); continue; } throw new Error(d.error || 'Upload failed (HTTP ' + r.status + ')'); }
      tries = 0; if (d.done) return d.file;
      start = d.next; UP.done[file.name] = start; setProgress(upLabel());
    }
    throw new Error('Upload did not finish');
  };
  const UP = { total: 0, done: {} };
  const upLabel = () => { const d = Object.values(UP.done).reduce((a, b) => a + b, 0); return `${(d / 1048576).toFixed(1)} of ${(UP.total / 1048576).toFixed(1)} MB (${UP.total ? Math.round(d / UP.total * 100) : 0}%)`; };
  async function uploadMany(files, onFile, share = false) {
    UP.total = files.reduce((n, f) => n + f.size, 0); UP.done = {};
    await pool(files, 3, async f => { try { const d = await driveUpload(f, 'files', share); UP.done[f.name] = f.size; setProgress(upLabel()); await onFile(f, d); } catch (e) { toast(f.name + ': ' + e.message, 'err'); } });
  }
  uploadFiles = async function (input, target) {
    const files = [...input.files]; input.value = ''; if (!files.length) return;
    if (!HEALTH.gdriveConnected) return toast('Attachments are stored in Google Drive. Ask the admin to connect Google Drive in Integrations.', 'err');
    const big = files.find(f => f.size > MAXF); if (big) return toast(big.name + ' is bigger than 100 MB.', 'err');
    startJob('Uploading'); await uploadMany(files, async (f, d) => { target.push(d); }, true); endJob();
  };
  addSendFiles = async function (el) {
    const files = [...el.files]; el.value = ''; if (!files.length) return; UI.sendFiles = UI.sendFiles || [];
    const big = files.find(f => f.size > MAXF); if (big) return toast(big.name + ' is bigger than 100 MB.', 'err');
    startJob('Adding attachments');
    if (HEALTH.gdriveConnected) await uploadMany(files, async (f, d) => { UI.sendFiles.push({ id: d.id, name: f.name, size: f.size, mimeType: f.type || 'application/octet-stream' }); });
    else for (const f of files) { const total = UI.sendFiles.reduce((n, x) => n + x.size, 0); if (total + f.size > 2.5 * 1048576) { toast(f.name + ': without Google Drive at most 2.5 MB in total — connect Google Drive for files up to 100 MB.', 'err'); continue; }
      const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(f); }); UI.sendFiles.push({ name: f.name, size: f.size, mimeType: f.type || 'application/octet-stream', b64 }); }
    UI.testMailOk = false; UI.sendOk = false; endJob();
  };
  CHANGE.teFilesIn = async el => {
    const files = [...el.files]; el.value = ''; if (!files.length) return;
    const big = files.find(f => f.size > MAXF); if (big) return toast(big.name + ' is bigger than 100 MB.', 'err');
    startJob('Adding attachments');
    if (HEALTH.gdriveConnected) await uploadMany(files, async (f, d) => { TE.files.push({ id: d.id, name: f.name, size: f.size, mimeType: f.type || 'application/octet-stream' }); });
    else for (const f of files) { const total = TE.files.reduce((n, x) => n + x.size, 0); if (total + f.size > 2.5 * 1048576) { toast(f.name + ': without Google Drive at most 2.5 MB in total.', 'err'); continue; } const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(r.error); r.readAsDataURL(f); }); TE.files.push({ name: f.name, size: f.size, mimeType: f.type || 'application/octet-stream', b64 }); }
    endJob(); paintTeFiles();
  };

  /* ---------- automatic backup: on opening the app and after every important action (max every 2 hours) ---------- */
  let autoTimer = null; const AUTO_EVERY = 2 * 3600e3;
  async function autoBackup(reason) {
    if (!ME || !canWrite() || BUSY) return;
    const last = +(localStorage.getItem('wcpa-auto-drive') || 0);
    if (HEALTH.gdriveConnected && Date.now() - last > AUTO_EVERY) {
      try { const r = await api('POST', '/api/gdrive/backup'); localStorage.setItem('wcpa-auto-drive', String(Date.now())); UI.gLast = fmtDate(nowISO()) + ' — ' + r.name + ' (automatic)'; } catch {}
    }
    try { const lb = JSON.parse(localStorage.getItem('wcpa-local-backup') || 'null'); if (lb && Date.now() - new Date(lb.at).getTime() > AUTO_EVERY && 'showDirectoryPicker' in window) await localBackup(true); } catch {}
  }
  const KEY_ACTIONS = /imported|Inquiry sent|Inquiry reminder|Bulk inquiry|Quotation finalized|Outlook drafts created|Find suppliers finished|Item (created|updated)|Restored/i;
  const _audit = audit;
  audit = function (action, ...rest) { _audit(action, ...rest); if (KEY_ACTIONS.test(action)) { clearTimeout(autoTimer); autoTimer = setTimeout(() => autoBackup(action), 15000); } };


  /* ================= v2.7 — speed: lazy Excel library, lazy page texts, full data for backups; WhatsApp gets the same link ================= */
  let xlsxP = null;
  const needXLSX = () => window.XLSX ? Promise.resolve() : (xlsxP = xlsxP || new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = '/vendor/xlsx.full.min.js'; sc.onload = res; sc.onerror = () => { xlsxP = null; rej(new Error('Excel library did not load')); }; document.head.append(sc); }));
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1500));
  idle(() => needXLSX().catch(() => {}));
  ['impFile', 'itFile'].forEach(k => { const f = CHANGE[k]; CHANGE[k] = async (el, e) => { try { await needXLSX(); } catch (x) { return toast(x.message, 'err'); } return f(el, e); }; });
  const _xlsxFile = xlsxFile;
  xlsxFile = function (sheets) { if (!window.XLSX) { needXLSX().then(() => toast('Excel is ready — click the button again.')); toast('Preparing Excel… one moment.'); return null; } return _xlsxFile(sheets); };
  const _efs = extractFromSource;
  extractFromSource = async function (pr, src, keep) {
    if (!src.text && src.textLazy) { try { const full = await api('GET', `/api/data/sources/${encodeURIComponent(src.id)}`); src.text = full.text || ''; delete src.textLazy; delete src.textLen; } catch (e) { toast('Could not load the page text: ' + e.message, 'err'); return; } }
    return _efs(pr, src, keep);
  };
  async function fullData() { const d = await api('GET', '/api/data?full=1&dept=' + activeDept()); return JSON.stringify({ app: 'WESTCOAST AI Procurement Agent', dept: activeDept(), exportedAt: nowISO(), data: d }); }
  A.backup = async () => { startJob('Preparing backup'); try { saveFile(`wc_procurement_${activeDept()}_backup_${new Date().toISOString().slice(0, 10)}.json`, await fullData(), 'application/json'); } catch (e) { toast(e.message, 'err'); } endJob(); };
  localBackup = async function (auto) {
    const dir = await idb('readonly', 'backupDir').catch(() => null); if (!dir) { if (!auto) toast('Choose a backup folder first.', 'err'); return false; }
    let perm = await dir.queryPermission({ mode: 'readwrite' }); if (perm !== 'granted' && !auto) perm = await dir.requestPermission({ mode: 'readwrite' }); if (perm !== 'granted') return false;
    await needXLSX().catch(() => {});
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const put = async (name, data) => { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(data); await w.close(); };
    await put(`westcoast_${activeDept()}_backup_${stamp}.json`, await fullData()); const x = buildAllExcel(); if (x) await put(`westcoast_${activeDept()}_all_data_${stamp}.xlsx`, x);
    localStorage.setItem('wcpa-local-backup', JSON.stringify({ at: nowISO(), day: today(), folder: dir.name })); if (!auto) toast('Backup saved in folder “' + dir.name + '”'); audit('Local folder backup', 'backup', '', dir.name + (auto ? ' (automatic)' : '')); return true;
  };
  // WhatsApp: always carry the same personal link as the email
  const _niGuess = niGuess;
  var niGuessAll = (t) => { const g = t.params.map(p => [p, _niGuess(p)]); if (!g.some(([, k]) => k === 'link') && g.length) g[g.length - 1][1] = 'link'; return Object.fromEntries(g); };

  window.EXTRA_VIEWS = { find: vFind, send: vSend, users: vUsers, backups: vBackups, mylist: vMyList, inquiries: () => vInqs(), newinq: () => vNewInq(), itemsm: () => vItems() };
  try { applyTheme(); } catch {}
  boot();
})();
