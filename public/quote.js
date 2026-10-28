"use strict";
(function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tok = (location.pathname.match(/^\/q\/([A-Za-z0-9]{10})$/) || [])[1] || new URLSearchParams(location.search).get('t') || '';
  const F = [['rate', 'Rate (per unit) *', ''], ['discount', 'Discount %', ''], ['finalRate', 'Final / Net Rate', 'after discount'], ['tax', 'Tax %', 'e.g. 18'], ['mrp', 'MRP', ''], ['delivery', 'Delivery Time', 'e.g. 7 days'], ['packing', 'Available Packing', 'e.g. Box of 500'], ['freight', 'Freight', 'e.g. Included / Extra'], ['insurance', 'Insurance', ''], ['payment', 'Payment Terms', 'e.g. 30 days'], ['validity', 'Offer Valid For', 'e.g. 15 days']];
  const fileLinks = fs => (fs || []).length ? `<div class="files">${fs.map(f => `<a class="file" href="${esc(f.link)}" target="_blank" rel="noopener noreferrer">📄 ${esc(f.name)}${f.size ? ` <span class="hint">${(f.size / 1048576).toFixed(1)} MB</span>` : ''}</a>`).join('')}</div>` : '';
  async function call(method, body) {
    const r = await fetch('/api/portal/' + encodeURIComponent(tok), { method, headers: { 'Content-Type': 'application/json', 'X-WCPA': '1' }, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({})); if (!r.ok) throw new Error(d.error || 'Something went wrong (HTTP ' + r.status + ')'); return d;
  }
  function renderLogi(d, msg, preview) {
    const I = d.inquiry, L = window.LOGI[I.kind], it = I.items[0] || { id: 'ship' }, cur = I.currency || 'INR';
    const done = !!(d.quote && d.quote.submittedAt); const v = (d.quote && d.quote.items && d.quote.items[it.id]) || {};
    const sh = I.shipment || {}; const ship = window.LOGI.SHIP.filter(([k]) => sh[k]).map(([k, l]) => `<div>${esc(l)}: <b>${esc(sh[k])}</b></div>`).join('');
    const cw = I.kind === 'AIR' ? window.LOGI.chargeable(sh) : 0;
    $('#app').innerHTML = `${preview ? '<div class="note warn" style="margin-bottom:16px">PREVIEW of the vendor quotation page (test link — submitting is off)</div>' : ''}
      <div class="card"><div class="row"><h1>Quotation Request</h1><span class="spacer"></span><span class="badge brand">${esc(L.label)}</span></div><p class="muted" style="margin:4px 0 0">From West-Coast Pharmaceutical Works Ltd. · ${esc(I.code)}</p>
      <p class="muted" style="margin:8px 0 0">${done ? 'You have already submitted your quotation for this inquiry. Contact West-Coast Pharmaceutical Works if you need to update it.' : `Dear ${esc(d.vendor.name)}, please enter your freight quotation in <b>${esc(cur)}</b> and press Submit. You can submit once.`}</p></div>
      <div class="card"><h2>${I.kind === 'AIR' ? '✈ Air Freight Quotation' : '⛴ Sea Freight Quotation'}${v.status === 'finalized' ? ' <span class="badge ok">✓ Finalized</span>' : ''}</h2><div class="meta">${ship}${cw ? `<div>Chargeable weight: <b>${cw} kg</b></div>` : ''}</div>${(I.files || []).length ? `<div class="files">${I.files.map(f => `<a class="file" href="${esc(f.link)}" target="_blank" rel="noopener noreferrer">📄 ${esc(f.name)}</a>`).join('')}</div>` : ''}
      <form id="qf"><div class="grid">${L.fields.map(([k, l, type, ph]) => `<label class="${k === 'remarks' ? 'span3' : ''}">${esc(l)}${type === 'num' ? ` (${esc(cur)})` : ''}<input name="${it.id}|${k}" value="${esc(v[k])}" placeholder="${done ? '' : esc(ph)}" ${done ? 'disabled' : ''} ${type === 'num' ? 'inputmode="decimal"' : ''}></label>`).join('')}</div>
      <div class="totalbox"><span>Total Amount (${esc(cur)})</span><b id="tot">${esc(cur)} ${(+(v.total || 0)).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b></div>
      ${I.kind === 'AIR' ? '<p class="hint">Total = Total Freight (or Rate per kg × chargeable weight) + all charges.</p>' : '<p class="hint">Total = Ocean Freight + all charges.</p>'}
      ${msg ? `<div class="note ${msg.ok ? 'ok' : 'bad'}" style="margin:12px 0">${esc(msg.t)}</div>` : ''}
      ${preview ? '' : done ? `<div class="note ok" style="margin-top:12px">✓ Quotation submitted${d.quote.submittedAt ? ' on ' + new Date(d.quote.submittedAt).toLocaleString('en-IN') : ''}</div>` : '<div style="margin-top:14px"><button class="btn" id="sb">Submit quote</button></div>'}</form></div>`;
    const f = $('#qf'); const read = () => { const o = {}; new FormData(f).forEach((val, key) => { o[key.split('|')[1]] = String(val); }); return o; };
    const upd = () => { if (done) return; $('#tot').textContent = cur + ' ' + window.LOGI.total(I.kind, read(), sh).toLocaleString('en-IN', { maximumFractionDigits: 2 }); };
    f.addEventListener('input', upd); upd();
    if (!done && !preview) f.addEventListener('submit', async e => {
      e.preventDefault(); if (!confirm('Submit your quotation now? You cannot change it afterwards.')) return;
      $('#sb').disabled = true; $('#sb').textContent = 'Submitting…';
      try { await call('POST', { items: { [it.id]: read() } }); renderAny(await call('GET'), { ok: true, t: 'Thank you — your quotation has been received.' }); }
      catch (err) { $('#sb').disabled = false; $('#sb').textContent = 'Submit quote'; const old = f.querySelector('.note.bad'); if (old) old.remove(); $('#sb').insertAdjacentHTML('beforebegin', `<div class="note bad" style="margin-bottom:12px">${esc(err.message)}</div>`); }
    });
    if (preview) f.addEventListener('submit', e => e.preventDefault());
  }
  const renderAny = (d, msg, preview) => (d.inquiry && window.LOGI && window.LOGI[d.inquiry.kind]) ? renderLogi(d, msg, preview) : render(d, msg, preview);
  function render(d, msg, preview) {
    const done = !!(d.quote && d.quote.submittedAt); const q = (d.quote && d.quote.items) || {}; const I = d.inquiry;
    $('#app').innerHTML = `<div class="card"><div class="row"><h1>Inquiry ${esc(I.code)}</h1><span class="spacer"></span><span class="badge brand">${esc(I.dept)}</span></div>
      <p class="muted" style="margin:6px 0 0">${done ? 'You have already submitted your quotation for this inquiry. It has been recorded and cannot be changed here — contact West-Coast Pharmaceutical Works if you need to update it.' : `Dear ${esc(d.vendor.name)}, please enter your offer for each item below and press Submit. You can submit once.`}</p>
      ${I.deliveryTime || I.deliveryLocation ? `<div class="meta">${I.deliveryTime ? `<div>Required delivery: <b>${esc(I.deliveryTime)}</b></div>` : ''}${I.deliveryLocation ? `<div>Deliver to: <b>${esc(I.deliveryLocation)}</b></div>` : ''}</div>` : ''}${fileLinks(I.files)}</div>
      <form id="qf">${I.items.map(it => { const v = q[it.id] || {}; const st = v.status === 'finalized' ? '<span class="badge ok">✓ Finalized</span>' : done && q[it.id] ? '<span class="badge">Under review</span>' : '';
        return `<div class="card"><div class="row"><h2>${esc(it.name)}</h2>${st}</div>
        <div class="meta"><div>Quantity: <b>${esc(it.qty)} ${esc(it.uom)}</b></div>${it.code ? `<div>Code: <b>${esc(it.code)}</b></div>` : ''}${it.make ? `<div>Make: <b>${esc(it.make)}</b></div>` : ''}${it.packing ? `<div>Packing: <b>${esc(it.packing)}</b></div>` : ''}${it.spec ? `<div class="span3">Specification: <b>${esc(it.spec)}</b></div>` : ''}</div>${fileLinks(it.files)}
        <div class="grid">${F.map(([k, l, ph]) => `<label>${l}<input name="${it.id}|${k}" value="${esc(v[k])}" placeholder="${done ? '' : esc(ph)}" ${done ? 'disabled' : ''} ${['rate', 'mrp', 'discount', 'tax', 'finalRate'].includes(k) ? 'inputmode="decimal"' : ''}></label>`).join('')}
        <label class="span3">Remarks<textarea name="${it.id}|remarks" rows="2" ${done ? 'disabled' : ''}>${esc(v.remarks)}</textarea></label></div></div>`; }).join('')}
      ${msg ? `<div class="note ${msg.ok ? 'ok' : 'bad'}" style="margin-bottom:14px">${esc(msg.t)}</div>` : ''}
      ${preview ? '<div class="note warn">PREVIEW — this is what each vendor sees. Submitting is disabled here; vendors use the personal link in their own email.</div>' : done ? `<div class="note ok">✓ Quotation submitted${d.quote.submittedAt ? ' on ' + new Date(d.quote.submittedAt).toLocaleString('en-IN') : ''}</div>` : `<button class="btn" id="sb">Submit quotation</button> <span class="hint">Leave an item blank if you do not supply it.</span>`}</form>`;
    if (preview) { $('#app').insertAdjacentHTML('afterbegin', '<div class="note warn" style="margin-bottom:16px">PREVIEW of the vendor quotation page (test link — submitting is off)</div>'); return; }
    const f = $('#qf'); if (!done) f.addEventListener('submit', async e => {
      e.preventDefault(); const items = {};
      new FormData(f).forEach((val, key) => { const [id, k] = key.split('|'); (items[id] = items[id] || {})[k] = String(val); });
      if (!confirm('Submit your quotation now? You cannot change it afterwards.')) return;
      $('#sb').disabled = true; $('#sb').textContent = 'Submitting…';
      try { await call('POST', { items }); render(await call('GET'), { ok: true, t: 'Thank you — your quotation has been received.' }); }
      catch (err) { $('#sb').disabled = false; $('#sb').textContent = 'Submit quotation'; const old = f.querySelector('.note.bad'); if (old) old.remove(); f.querySelector('#sb').insertAdjacentHTML('beforebegin', `<div class="note bad" style="margin-bottom:14px">${esc(err.message)}</div>`); }
    });
  }
  const pv = new URLSearchParams(location.hash.slice(1)).get('preview');
  if (pv) {
    try {
      const d = JSON.parse(decodeURIComponent(escape(atob(pv.replace(/-/g, '+').replace(/_/g, '/')))));
      renderAny({ inquiry: d, vendor: { name: 'Vendor' }, quote: null }, null, true);
      return;
    } catch { $('#app').innerHTML = '<div class="card"><div class="note bad">This preview link is damaged. Send the test email again.</div></div>'; return; }
  }
  if (!tok) { $('#app').innerHTML = '<div class="card"><div class="note bad">This link is incomplete — it has no vendor code (<b>?t=…</b>). If this came from a <b>[TEST]</b> email, that is expected: only the real inquiry email has a personal link. Otherwise open the link from the email again, or ask West-Coast Pharmaceutical Works to resend it.</div></div>'; return; }
  call('GET').then(d => renderAny(d, null, !!d.preview)).catch(e => { $('#app').innerHTML = `<div class="card"><div class="note bad">${esc(e.message)}</div></div>`; });
})();
