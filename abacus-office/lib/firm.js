'use strict';

// Who this office belongs to. Everything the pages and the AI say about the
// firm comes from here, and here reads the service's own variables, so the
// same code runs for a different operator by changing the variables, never
// the code. Defaults are a placeholder until Dan's brand assets and facts
// arrive (proposal of 9 November 2026, section 5).
//
// Nothing here is a secret. Credentials live in lib/mailbox.js's variables
// and ANTHROPIC_API_KEY, on the Railway service only.

const fs = require('fs');
const path = require('path');

function text(name, fallback) {
  const v = String(process.env[name] || '').trim();
  return v || fallback;
}

// The brands this office handles (Tom's email to Dan, 9 November 2026:
// Abacus first, Coastline after; Abacus staff see Abacus, Coastline staff
// see Coastline, Dan's office sees everything split by brand). Set as
// ABACUS_OFFICE_BRANDS, one brand per line or semicolon, "id=Name"; the id
// is what a case and a user carry. With nothing set, the firm is its own
// one brand.
function brands() {
  const raw = String(process.env.ABACUS_OFFICE_BRANDS || '').split(/[;\n]/).map((x) => x.trim()).filter(Boolean);
  const list = raw.map((x) => {
    const i = x.indexOf('=');
    const id = (i >= 0 ? x.slice(0, i) : x).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    const name = (i >= 0 ? x.slice(i + 1) : x).trim().slice(0, 80) || id;
    return id ? { id, name, logo: brandLogo(id) } : null;
  }).filter(Boolean);
  if (list.length) return list;
  const short = text('ABACUS_OFFICE_FIRM_SHORT', 'Abacus');
  const id = short.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'abacus';
  return [{ id, name: text('ABACUS_OFFICE_FIRM_NAME', 'Abacus Taxis'), logo: brandLogo(id) }];
}

// Each company's own logo, so a case, a list and an operator's portal show
// whose it is (Tom, 10 November 2026: "the staff portals for these
// companies need their logos so its identifiable"). The file is
// abacus-office/public/brand/<company id>.webp (or .png, .jpg); none means
// the company's name is shown instead.
function brandLogo(id) {
  const dir = path.join(__dirname, '..', 'public', 'brand');
  for (const ext of ['webp', 'png', 'jpg']) {
    if (fs.existsSync(path.join(dir, `${id}.${ext}`))) return `/brand/${id}.${ext}`;
  }
  return '';
}

// The logo in the office bar: a file under abacus-office/public/brand,
// named by ABACUS_OFFICE_FIRM_LOGO, or the one Tom supplied on 9 November
// 2026 when it is there. Empty means the lettered square.
function logo() {
  const dir = path.join(__dirname, '..', 'public', 'brand');
  const name = text('ABACUS_OFFICE_FIRM_LOGO', 'a2b-cornwall.webp').replace(/[^A-Za-z0-9._-]/g, '');
  if (!name || name === 'none') return '';
  return fs.existsSync(path.join(dir, name)) ? `/brand/${name}` : '';
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
    demo: text('ABACUS_OFFICE_MAIL_DRIVER', 'demo').toLowerCase() === 'demo',
    brands: brands(),
    // Which brand the connected mailbox belongs to: the first brand unless
    // ABACUS_OFFICE_MAILBOX_BRAND names another.
    mailboxBrand: (function () { const b = brands(); const want = text('ABACUS_OFFICE_MAILBOX_BRAND', '').toLowerCase(); return (b.find((x) => x.id === want) || b[0]).id; })(),
    logo: logo()
  };
}

function brandName(f, id) {
  const b = (f.brands || []).find((x) => x.id === id);
  return b ? b.name : (id || f.name);
}

module.exports = { firm, brands, brandName, logo, brandLogo };
