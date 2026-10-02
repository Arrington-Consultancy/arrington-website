// Business Consultant Plymouth (02/10/2026). Tom: "Exeter is now the
// controlled template for this geographic landing-page family." Plymouth is
// an exact structural and commercial duplicate of the live Exeter page, with
// only the location rows changed, plus the two copy corrections Tom named
// (applied to Exeter and Plymouth). These pin: the copy comes from Exeter and
// not from Devon or from new wording; Exeter is only ever read; exactly three
// location rows change; the corrections are the two named and nothing wider;
// the hero is a cover hero by slug; the page is indexable and out of the menu.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const seed = fs.readFileSync(path.join(root, 'db', 'seed.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'views', 'index.ejs'), 'utf8');
const qa = fs.readFileSync(path.join(root, '.github', 'workflows', 'production-qa.yml'), 'utf8');

function block() {
  const start = seed.indexOf("const PLYMOUTH_MARKER = 'site.plymouth_page_2026-10-02'");
  assert.ok(start > 0, 'the Plymouth migration is in db/seed.js');
  const end = seed.indexOf('// Migration: swap known old logo assets', start);
  assert.ok(end > start);
  return seed.slice(start, end);
}

function correctionsBlock() {
  const start = seed.indexOf('const applyLandingCopyCorrections = async');
  assert.ok(start > 0, 'the landing copy corrections helper is in db/seed.js');
  const end = seed.indexOf("const PLYMOUTH_MARKER = 'site.plymouth_page_2026-10-02'", start);
  return seed.slice(start, end);
}

test('Plymouth copies the EXETER page, and Exeter is only ever read', () => {
  const b = block();
  assert.match(b, /FROM pages WHERE slug = 'business-consultant-exeter'/);
  const writes = b.match(/(UPDATE|DELETE FROM|INSERT INTO)[^;]*?business-consultant-exeter/g) || [];
  assert.deepStrictEqual(writes, []);
  assert.ok(!/business-consultant-devon/.test(b), 'Devon is not the source for this page');
  assert.match(b, /INSERT INTO content \(section_key, content\) VALUES \(\$1, \$2\) ON CONFLICT \(section_key\) DO NOTHING',\s*\[`\$\{ids\[tpl\]\}\.\$\{field\}`/);
});

test('the migration is guarded on a marker and adopts a hand-made page', () => {
  const b = block();
  assert.match(b, /SELECT 1 FROM content WHERE section_key = \$1', \[PLYMOUTH_MARKER\]/);
  assert.match(b, /adopted existing page/);
});

test('exactly three location rows change, with Plymouth-area places and no keyword stuffing', () => {
  const b = block();
  const sets = b.match(/await set\(/g) || [];
  assert.strictEqual(sets.length, 3);
  assert.match(b, /in Plymouth'\)/);
  assert.match(b, /Working in and around Plymouth/);
  const sentence = /across <strong>Plymouth and the surrounding area, including ([^<]*)\.<\/strong>/.exec(b);
  assert.ok(sentence, 'the areas sentence follows the Exeter shape');
  const places = sentence[1].split(/,\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
  assert.ok(places.length >= 4 && places.length <= 6, `a restrained list, got ${places.length}`);
  assert.ok(!places.includes('Exmouth') && !places.includes('Crediton'), 'not a copy of the Exeter list');
  assert.ok(!/consultant/i.test(sentence[1]), 'no service keywords inside the places sentence');
});

test('the two copy corrections are the two named, applied to Exeter and to the Plymouth copy', () => {
  const c = correctionsBlock();
  assert.match(c, /replace\(content, 'the <strong>Commercial Review, £500\.<\/strong>', 'the <strong>£500 Commercial Review\.<\/strong>'\)/);
  assert.match(c, /replace\(content, 'No obligation\. No pressure\.', 'No obligation\.'\)/);
  // both guarded on the substring being present, so a CMS edit wins
  assert.match(c, /LIKE '%the <strong>Commercial Review, £500\.<\/strong>%'/);
  assert.match(c, /LIKE '%No obligation\. No pressure\.%'/);
  // Exeter gets them via its own marker, Plymouth via the copy path
  assert.match(c, /site\.exeter_copy_corrections_2026-10-02/);
  assert.match(c, /slug = 'business-consultant-exeter'/);
  assert.match(block(), /applyLandingCopyCorrections\(ids\.approach\)/);
  // and nothing names the Devon or Cornwall approach instances
  assert.ok(!/business-consultant-devon|business-consultant-cornwall/.test(c));
});

test('the new copy keeps to the Brand Operating System', () => {
  const b = (correctionsBlock() + block()).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const strings = Array.from(b.matchAll(/'((?:[^'\\]|\\.)*)'/g)).map((m) => m[1]).filter((s) => /\s/.test(s) && !/^[A-Z_ ]+$/.test(s));
  const copy = strings.join('\n');
  assert.ok(!/—/.test(copy), 'no em dashes');
  assert.ok(!/\bfire|firefight/i.test(copy), 'no fire metaphors');
  assert.ok(!/\bI\b (was|rebuilt|built|walked)/.test(copy), 'no first person');
  assert.ok(!/\bhelp rescue\b|seven-figure/i.test(copy), 'no founder-story claims');
  for (const banned of ['solutions', 'synergy', 'leverage', 'empower', 'journey', 'holistic', 'tailored', 'bespoke', 'coach', 'transformational', 'world class']) {
    assert.ok(!copy.toLowerCase().includes(banned), `avoids "${banned}"`);
  }
});

test('the page is indexable and out of the top menu, with search metadata inside the limits', () => {
  const b = block();
  assert.match(b, /VALUES \(\$1, \$2, \$3, false, false, \$4::jsonb/, 'hidden = false, show_in_nav = false');
  assert.match(b, /, false\)`/, 'noindex = false');
  const title = /'(Business Consultant Plymouth \| Arrington Consultancy)'/.exec(b)[1];
  assert.ok(title.length <= 65, `meta title ${title.length} chars`);
  const desc = /'(Business consultant for owner run businesses in Plymouth[^']*)'/.exec(b)[1];
  assert.ok(desc.length <= 160, `meta description ${desc.length} chars`);
});

test('the hero is a cover hero by SLUG with crops for desktop and phone, and structured data names Plymouth', () => {
  const m = /const HERO_COVER_SLUGS = \[([^\]]*)\]/.exec(view);
  const slugs = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.ok(slugs.includes('business-consultant-plymouth'));
  assert.ok(slugs.includes('business-consultant-exeter'), 'Exeter stays');
  const crops = view.match(/\.page-business-consultant-plymouth \.hero\.hero-cover \.hero-photo img \{ object-position:/g) || [];
  assert.strictEqual(crops.length, 2);
  const i = view.indexOf("'business-consultant-plymouth': {");
  assert.ok(i > 0);
  const entry = view.slice(i, view.indexOf('url: seo.canonical', i));
  assert.match(entry, /name: 'Business consultant Plymouth'/);
  assert.match(entry, /\{ '@type': 'City', name: 'Plymouth' \}, \{ '@type': 'AdministrativeArea', name: 'Devon' \}/);
});

test('the production inspection workflow covers the page by default', () => {
  assert.match(qa, /default: "[^"]*\/business-consultant-plymouth[^"]*"/);
});
