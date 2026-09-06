// Scott's Armchair & Knitting Service: the ONE demonstration invoice.
//
// Tom's instruction (06/09/2026): for the fictional Scott demonstration,
// create one clearly isolated DEMO invoice inside the Scott application
// only. It must never be written to Arrington's Zoho Invoice, to
// Arrington's accounting records, to any real customer, to any real
// email address or to any payment system. It must look and behave like a
// proper invoice, and one consequential action must remain deliberately
// blocked so it can never become a real transaction: SEND / ISSUE is
// permanently disabled and labelled DEMO ONLY - NOT A REAL INVOICE.
//
// How the isolation is made structural rather than hoped for:
//
//   - This module is PURE. It reads no environment variable, opens no
//     network connection, imports nothing, and writes nothing. The
//     invoice is a constant; the totals are arithmetic over it.
//   - It is not a row in scott_fin_documents and posts no journal, so it
//     cannot move the fictional ledger either. The Sales ledger links to
//     it as a document to look at, not as a debtor.
//   - There is no send function that works. sendDemoInvoice() exists so
//     that a caller written in good faith gets a clear refusal rather
//     than a silent no-op, and a test asserts it throws for every input.
//   - Nothing here names Arrington, Zoho, a real address or a real
//     person. The customer is a fictional trade account from the 07-series
//     canon. Tests pin that this file mentions no workspace, Zoho, mail
//     or fetch symbol.
//
// The clearance model is unchanged: the page that renders this is gated
// on the same 'invoice_status' domain as the Sales & Invoices tab.

const DEMO_LABEL = 'DEMO ONLY - NOT A REAL INVOICE';

const VAT_RATE = 0.2;

const COMPANY = Object.freeze({
  tradingName: "Scott's Armchair & Knitting Service",
  legalName: "SCOTT'S ARMCHAIR & KNITTING SERVICE LTD",
  companyNumber: '10648271',
  addressLines: Object.freeze(['Unit 4, Brunel Craft Estate', 'Newton Abbot', 'Devon', 'TQ12 4SA']),
  vatNote: 'VAT registered (demonstration record; no real VAT number is shown)',
  fictionNote: 'Fictional company, demonstration use only'
});

const CUSTOMER = Object.freeze({
  name: 'Moorland Holiday Lets',
  contact: 'Accounts',
  addressLines: Object.freeze(['The Old Dairy', 'Widecombe-in-the-Moor', 'Devon', 'TQ13 7TA']),
  // A fictional address in a fictional record. Not an email: the demo
  // invoice has nowhere to be sent, by design.
  reference: 'Cottage refurbishment, autumn 2026'
});

// Net unit prices in integer pence, same money discipline as the ledger.
const LINES = Object.freeze([
  Object.freeze({ description: 'Re-upholster wingback armchair in Harris tweed, including new foam and webbing', quantity: 2, unitNetPence: 38500, vatable: true }),
  Object.freeze({ description: 'Hand-knitted arm covers, pair, colour-matched to tweed', quantity: 2, unitNetPence: 4500, vatable: true }),
  Object.freeze({ description: 'Collection and return, Widecombe round trip', quantity: 1, unitNetPence: 6000, vatable: true })
]);

const DEMO_INVOICE = Object.freeze({
  ref: 'SAKS-DEMO-0001',
  kind: 'sales',
  status: 'demo',
  statusLabel: 'DEMO',
  issueDate: '2026-09-01',
  dueDate: '2026-10-01',
  terms: '30 days from invoice date',
  company: COMPANY,
  customer: CUSTOMER,
  lines: LINES,
  notes: 'Thank you for your order. This document is part of a demonstration and cannot be issued, sent or paid.',
  demoLabel: DEMO_LABEL,
  sendBlocked: true
});

function pounds(pence) {
  const sign = pence < 0 ? '-' : '';
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}

function totals(lines = LINES) {
  const rows = lines.map((l) => {
    const netPence = l.quantity * l.unitNetPence;
    const vatPence = l.vatable ? Math.round(netPence * VAT_RATE) : 0;
    return { ...l, netPence, vatPence, grossPence: netPence + vatPence };
  });
  const netPence = rows.reduce((s, r) => s + r.netPence, 0);
  const vatPence = rows.reduce((s, r) => s + r.vatPence, 0);
  return { rows, netPence, vatPence, grossPence: netPence + vatPence, vatRatePercent: VAT_RATE * 100 };
}

// The complete, render-ready document. Always the same; nothing about it
// depends on who is looking or when.
function build() {
  const t = totals();
  return {
    ...DEMO_INVOICE,
    lines: t.rows,
    netPence: t.netPence,
    vatPence: t.vatPence,
    grossPence: t.grossPence,
    vatRatePercent: t.vatRatePercent,
    balanceDuePence: t.grossPence,
    format: pounds
  };
}

class DemoInvoiceSendRefused extends Error {
  constructor() {
    super(`${DEMO_LABEL}: sending or issuing the demonstration invoice is permanently disabled. Nothing was sent.`);
    this.name = 'DemoInvoiceSendRefused';
  }
}

// The one consequential action, blocked by construction. Not a flag that
// could be set; not a parameter that could be passed. It throws.
function sendDemoInvoice() {
  throw new DemoInvoiceSendRefused();
}

module.exports = {
  DEMO_LABEL,
  VAT_RATE,
  DEMO_INVOICE,
  DemoInvoiceSendRefused,
  build,
  totals,
  pounds,
  sendDemoInvoice
};
