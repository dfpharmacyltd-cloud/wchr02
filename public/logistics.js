/* Logistics (air / sea freight) quotation fields — keep in sync with server/logistics.js */
(function () {
  const LOGI = {
    AIR: {
      label: 'Logistics – Air Freight', unit: 'per kg',
      fields: [
        ['forwarder', 'Freight Forwarder Name', 'text', 'Enter forwarder name'],
        ['ratePerKg', 'Air Freight Rate (per kg) *', 'num', 'Rate per kg', true],
        ['totalFreight', 'Total Freight', 'num', 'Total freight'],
        ['awb', 'Air Way Bill Charges', 'num', 'AWB charges'],
        ['ams', 'AMS Charges', 'num', 'AMS charges'],
        ['clearing', 'Clearing Charges', 'num', 'Clearing charges'],
        ['warehouse', 'Warehouse Charges', 'num', 'Warehouse charges'],
        ['hawb', 'House Air Way Bill', 'num', 'HAWB charges'],
        ['pca', 'PCA Per Shipment', 'num', 'PCA per shipment'],
        ['gmax', 'GMAX', 'num', 'GMAX charges'],
        ['additional', 'Additional Expense', 'num', 'Any additional expense'],
        ['airline', 'Airline Name', 'text', 'Enter airline name'],
        ['transit', 'Transit Time', 'text', 'e.g. 3-5 days'],
        ['validity', 'Offer Valid Till', 'text', 'e.g. 7 days'],
        ['remarks', 'Remarks', 'text', '']
      ],
      charges: ['awb', 'ams', 'clearing', 'warehouse', 'hawb', 'pca', 'gmax', 'additional']
    },
    SEA: {
      label: 'Logistics – Sea Freight', unit: 'per container / shipment',
      fields: [
        ['forwarder', 'Freight Forwarder Name', 'text', 'Enter forwarder name'],
        ['shippingLine', 'Shipping Line', 'text', 'e.g. Maersk, MSC'],
        ['container', 'Container Type', 'text', "20' / 40' / 40'HC / LCL"],
        ['oceanFreight', 'Ocean Freight *', 'num', 'Ocean freight', true],
        ['blCharges', 'B/L Charges', 'num', 'Bill of lading charges'],
        ['thc', 'THC (Terminal Handling)', 'num', 'THC'],
        ['clearing', 'Clearing Charges', 'num', 'Clearing charges'],
        ['cfs', 'CFS Charges', 'num', 'CFS charges'],
        ['docs', 'Documentation Charges', 'num', 'Documentation'],
        ['additional', 'Additional Expense', 'num', 'Any additional expense'],
        ['transit', 'Transit Time', 'text', 'e.g. 25-30 days'],
        ['freeDays', 'Free Days at Destination', 'text', 'e.g. 14 days'],
        ['validity', 'Offer Valid Till', 'text', 'e.g. 7 days'],
        ['remarks', 'Remarks', 'text', '']
      ],
      charges: ['blCharges', 'thc', 'clearing', 'cfs', 'docs', 'additional']
    },
    SHIP: [
      ['buyer', 'Buyer'], ['destination', 'Destination (country)'], ['portLoading', 'Port of Loading'], ['portDischarge', 'Port of Discharge'],
      ['commodity', 'Commodity / description'], ['incoterms', 'Incoterms'], ['cartons', 'Total Cartons'], ['grossWeight', 'Gross Weight (kg)'],
      ['volumeWeight', 'Volume Weight (kg)'], ['dimensions', 'Dimensions (L×W×H cm)'], ['cbm', 'Volume (CBM)'], ['readyDate', 'Cargo Ready Date']
    ],
    num: v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : 0; },
    chargeable: s => Math.max(LOGI.num(s && s.grossWeight), LOGI.num(s && s.volumeWeight)),
    total(kind, q, ship) {
      const d = LOGI[kind]; if (!d || !q) return 0; const n = LOGI.num;
      const base = kind === 'AIR' ? (n(q.totalFreight) || n(q.ratePerKg) * LOGI.chargeable(ship)) : n(q.oceanFreight);
      return Math.round((base + d.charges.reduce((a, k) => a + n(q[k]), 0)) * 100) / 100;
    }
  };
  window.LOGI = LOGI;
})();
