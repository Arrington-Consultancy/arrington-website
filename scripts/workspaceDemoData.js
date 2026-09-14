#!/usr/bin/env node
// Arrington AI Workspace: a public-safe demonstration state, for capturing
// screenshots of the REAL interface without putting real business data on
// the public website.
//
// WHY THIS EXISTS. The Workspace screens are worth showing because they
// hold real information: actual enquiries, named contacts, the ANNA
// balance, Tom's inbox. That is exactly what must not appear on
// /evidence. Screenshotting an ordinary development database instead
// produces "No statement uploaded yet" and "0 records", which is honest
// and proves nothing. So this fills a THROWAWAY database with invented
// Arrington-shaped data and the real code renders it.
//
// It is the real interface, the real import path and the real CRM
// projection. Only the facts are invented. It is not a separate demo
// product and must never become one: if a screen needs changing to look
// good here, change the screen.
//
// WHERE IT MUST NEVER RUN. Production, staging, or any database holding a
// real enquiry. It is deliberately NOT wired into db/seed.js, so nothing
// in the boot path can reach it; it only runs when a person types it. On
// top of that it refuses to run unless all three hold:
//
//   1. WORKSPACE_DEMO_CONFIRM is exactly the phrase below. No default, no
//      'true', nothing a stray environment variable produces by accident.
//   2. The app does not consider itself the live public site.
//   3. The target database contains no lead that is not already
//      demonstration data. This is the guard that actually protects Tom:
//      a database with one genuine enquiry in it is refused outright,
//      whatever the other two say.
//
// Usage:
//   DATABASE_URL=postgres://.../throwaway \
//   WORKSPACE_DEMO_CONFIRM='yes, this is a throwaway database' \
//   node scripts/workspaceDemoData.js

const db = require('../db/pool');
const financeRepo = require('../lib/workspace/finance/repo');
const annaCsv = require('../lib/workspace/finance/annaStatementCsv');
const crmContacts = require('../lib/crm/contacts');

const CONFIRM_PHRASE = 'yes, this is a throwaway database';

// Every invented address uses a reserved example domain (RFC 2606), so a
// demonstration row can always be told from a real one, by this script and
// by a person reading the table.
const DEMO_EMAIL_SUFFIX = '@example.invalid';
const isDemoEmail = (email) => String(email || '').toLowerCase().endsWith(DEMO_EMAIL_SUFFIX);

// Invented enquiries. Devon and Cornwall owner-run businesses, the real
// audience, with the acquisition detail the Contacts screen exists to
// answer. No real person, business, figure or address appears here.
const DEMO_LEADS = [
  {
    kind: 'contact', name: 'Rachel Thornbury', email: 'rachel.thornbury' + DEMO_EMAIL_SUFFIX,
    phone: '01752 000101', message: 'We run three sites and everything still comes back to me. Would like to talk about what to change first.',
    daysAgo: 2, signup_source: '',
    attribution: { landing_page: '/where-to-start', referrer: 'https://www.google.com/', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'Leads-Search-1' }
  },
  {
    kind: 'contact', name: 'Daniel Pengelly', email: 'daniel.pengelly' + DEMO_EMAIL_SUFFIX,
    phone: '01326 000202', message: 'Margins have slipped two years running and I cannot see where. Recommended by a supplier.',
    daysAgo: 5, signup_source: '',
    attribution: { landing_page: '/', referrer: '' }
  },
  {
    kind: 'quiz_results', name: 'Marie Hosking', email: 'marie.hosking' + DEMO_EMAIL_SUFFIX,
    phone: '', message: 'Owner Dependency Quiz results requested.',
    daysAgo: 6, signup_source: 'google',
    attribution: { landing_page: '/owner-dependency-quiz', referrer: 'https://www.linkedin.com/' }
  },
  {
    kind: 'pdf_download', name: '', email: 'j.warleggan' + DEMO_EMAIL_SUFFIX,
    phone: '', message: '', document: '90-day-action-plan.pdf',
    daysAgo: 8, signup_source: '',
    attribution: { landing_page: '/evidence', referrer: 'https://www.google.com/' }
  },
  {
    kind: 'contact', name: 'Rachel Thornbury', email: 'rachel.thornbury' + DEMO_EMAIL_SUFFIX,
    phone: '01752 000101', message: 'Following up after the call. Happy to book the review.',
    daysAgo: 1, signup_source: '',
    attribution: { landing_page: '/where-to-start/commercial-review', referrer: '' }
  },
  {
    kind: 'market_ready_test', name: 'Stephen Carlyon', email: 'stephen.carlyon' + DEMO_EMAIL_SUFFIX,
    phone: '01579 000303', message: 'Market Ready Test completed.',
    daysAgo: 11, signup_source: '',
    attribution: { landing_page: '/market-ready-test', referrer: '' }
  },
  {
    kind: 'contact', name: 'Angela Treloar', email: 'angela.treloar' + DEMO_EMAIL_SUFFIX,
    phone: '01208 000404', message: 'Two of the team are leaving and I am about to absorb both jobs myself. Need a plan before I do.',
    daysAgo: 14, signup_source: 'google',
    attribution: { landing_page: '/product-guide', referrer: 'https://www.google.com/', utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'Leads-Search-1' }
  },
  {
    kind: 'pdf_download', name: '', email: 'p.rosewarne' + DEMO_EMAIL_SUFFIX,
    phone: '', message: '', document: 'enactment-sheet.pdf',
    daysAgo: 19, signup_source: '',
    attribution: { landing_page: '/evidence', referrer: '' }
  }
];

// An invented bank statement in the shape ANNA exports, run through the
// real parser and the real import so the Balance, Cashflow and Estimated
// recurring costs cards are produced by production code rather than
// written into the database by hand. The repeating rows are there on
// purpose: the recurring-cost estimate needs three occurrences of a payee
// at a similar amount before it will say anything, and a screenshot of
// that card is only worth taking if the real rule produced it.
function demoStatementCsv(today = new Date()) {
  const rows = [['Date', 'Description', 'Reference', 'Category', 'Amount', 'Balance']];
  const iso = (d) => d.toISOString().slice(0, 10);
  // Never dates a transaction in the future: a statement showing money
  // moving next week is the first thing that would make a screenshot look
  // fabricated, which is exactly the impression this has to avoid.
  const at = (monthsBack, day) => {
    const d = new Date(today.getFullYear(), today.getMonth() - monthsBack, day);
    return iso(d > today ? new Date(today.getTime() - 86400000) : d);
  };

  let balance = 4200.00;
  const push = (date, description, reference, category, amount) => {
    balance = Math.round((balance + amount) * 100) / 100;
    rows.push([date, description, reference, category, amount.toFixed(2), balance.toFixed(2)]);
  };

  // Six months, newest last. Invented client names, invented amounts.
  for (let m = 5; m >= 0; m--) {
    push(at(m, 3), 'RAILWAY CORP', 'SUBSCRIPTION', 'Software', -49.99);
    push(at(m, 6), 'GOOGLE ADS', 'ADVERTISING', 'Marketing', -420.00);
    push(at(m, 9), 'ZOHO CORPORATION', 'SUBSCRIPTION', 'Software', -12.00);
    push(at(m, 12), 'ACCOUNTANCY RETAINER', 'MONTHLY', 'Professional fees', -180.00);
    if (m % 2 === 0) push(at(m, 15), 'HOLWELL JOINERY LTD', 'COMMERCIAL REVIEW', 'Sales', 500.00);
    if (m === 4 || m === 1) push(at(m, 18), 'TRENANCE MARINE SERVICES', 'REVIEW AND IMPLEMENTATION', 'Sales', 2500.00);
    if (m === 3) push(at(m, 21), 'PENWITH GARDEN CO', 'WEBSITE BUILD', 'Sales', 999.00);
    push(at(m, 24), 'MOBILE AND BROADBAND', 'MONTHLY', 'Utilities', -68.40);
    push(at(m, 26), 'FUEL', 'SITE VISITS', 'Travel', -95.00 - (m * 3));
  }
  return rows.map((r) => r.map((c) => (/[",]/.test(c) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n');
}

async function refuseIfUnsafe() {
  if (process.env.WORKSPACE_DEMO_CONFIRM !== CONFIRM_PHRASE) {
    throw new Error(`refused: set WORKSPACE_DEMO_CONFIRM to the exact phrase "${CONFIRM_PHRASE}"`);
  }

  const canonicalHost = (process.env.CANONICAL_HOST || 'www.arringtonconsultancy.com').trim().toLowerCase();
  if (canonicalHost === 'www.arringtonconsultancy.com') {
    throw new Error('refused: CANONICAL_HOST resolves to the live public site. Point this at a throwaway database and set CANONICAL_HOST to something else.');
  }

  // The guard that actually matters. One genuine enquiry in the target
  // database and this stops, whatever the other two checks say.
  const { rows } = await db.query('SELECT email FROM leads');
  const real = rows.filter((r) => !isDemoEmail(r.email));
  if (real.length) {
    throw new Error(`refused: this database holds ${real.length} lead row(s) that are not demonstration data. It is not a throwaway database.`);
  }
}

async function run() {
  await refuseIfUnsafe();

  await db.query('DELETE FROM leads WHERE email ILIKE $1', [`%${DEMO_EMAIL_SUFFIX}`]);

  for (const lead of DEMO_LEADS) {
    await db.query(
      `INSERT INTO leads (kind, name, email, phone, message, document, signup_source, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() - ($8 || ' days')::interval)`,
      [lead.kind, lead.name || '', lead.email, lead.phone || '', lead.message || '',
        lead.document || '', lead.signup_source || '', String(lead.daysAgo)]
    );
  }
  console.log(`Workspace demo: ${DEMO_LEADS.length} invented enquiries inserted.`);

  const crm = await crmContacts.syncFromLeads();
  console.log(`Workspace demo: ${crm.contactsTouched} contact record(s) built from them.`);

  const parsed = annaCsv.parseStatementCsv(demoStatementCsv());
  if (!parsed.transactions.length) {
    throw new Error(`the invented statement produced no transactions: ${parsed.warnings.join('; ')}`);
  }
  const imported = await financeRepo.recordCsvImport('anna_statement_csv', {
    transactions: parsed.transactions,
    warnings: parsed.warnings,
    closingBalancePence: parsed.closingBalancePence,
    closingBalanceDate: parsed.closingBalanceDate,
    importedBy: 'demo',
    source: 'Invented demonstration statement (scripts/workspaceDemoData.js). Not real Arrington banking data.'
  });
  console.log(`Workspace demo: ${parsed.transactions.length} invented bank rows parsed, ${imported.itemsWritten} written through the real ANNA import path, balance as of ${parsed.closingBalanceDate}.`);
  console.log('Workspace demo: ready. Nothing here is real Arrington data.');
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch((err) => {
    console.error(`Workspace demo: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { CONFIRM_PHRASE, DEMO_LEADS, DEMO_EMAIL_SUFFIX, isDemoEmail, demoStatementCsv, refuseIfUnsafe, run };
