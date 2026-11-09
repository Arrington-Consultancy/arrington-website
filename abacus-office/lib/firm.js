'use strict';

// Who this office belongs to. Everything the pages and the AI say about the
// firm comes from here, and here reads the service's own variables, so the
// same code runs for a different operator by changing the variables, never
// the code. Defaults are a placeholder until Dan's brand assets and facts
// arrive (proposal of 9 November 2026, section 5).
//
// Nothing here is a secret. Credentials live in lib/mailbox.js's variables
// and ANTHROPIC_API_KEY, on the Railway service only.

function text(name, fallback) {
  const v = String(process.env[name] || '').trim();
  return v || fallback;
}

function firm() {
  return {
    name: text('ABACUS_OFFICE_FIRM_NAME', 'Abacus Taxis'),
    short: text('ABACUS_OFFICE_FIRM_SHORT', 'Abacus'),
    town: text('ABACUS_OFFICE_FIRM_TOWN', 'Falmouth'),
    county: text('ABACUS_OFFICE_FIRM_COUNTY', 'Cornwall'),
    phone: text('ABACUS_OFFICE_FIRM_PHONE', ''),
    // The line under "Thanks," in every customer email.
    signature: text('ABACUS_OFFICE_FIRM_SIGNATURE', text('ABACUS_OFFICE_FIRM_NAME', 'Abacus Taxis')),
    // Facts a reply may rely on, one per line, set by the owner. Nothing
    // else about the firm may be assumed by the AI.
    facts: String(process.env.ABACUS_OFFICE_FIRM_FACTS || '').split('\n').map((s) => s.trim()).filter(Boolean),
    // Is the data in this office made up? True until a real mailbox is
    // connected, and shown on every page while it is.
    demo: text('ABACUS_OFFICE_MAIL_DRIVER', 'demo').toLowerCase() === 'demo'
  };
}

module.exports = { firm };
