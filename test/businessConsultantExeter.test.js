// Business Consultant Exeter (02/10/2026). The Google Ads gap analysis
// showed Exeter as the largest single source of ad impressions with no
// enquiry and no page of its own: "business consultant exeter" was shown 31
// times and clicked zero times because nothing said Exeter. Tom's decision:
// build it the way Cornwall was built, without repeating the two things that
// went wrong on Cornwall's launch (a side-by-side hero because the cover
// treatment was keyed to an instance id nobody could know in advance, and a
// founder-story proof block that had to be corrected afterwards). These pin
// the parts that would quietly go wrong: the migration writing to the Devon
// ads page, the copy drifting out of the Brand Operating System, the hero
// treatment depending on an instance id, or the page being hidden from the
// search engines it exists for.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const seed = fs.readFileSync(path.join(root, 'db', 'seed.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'views', 'index.ejs'), 'utf8');
const qa = fs.readFileSync(path.join(root, '.github', 'workflows', 'production-qa.yml'), 'utf8');

function block() {
  const start = seed.indexOf("const EXETER_MARKER = 'site.exeter_page_2026-10-02'");
  assert.ok(start > 0, 'the Exeter migration is in db/seed.js');
  const end = seed.indexOf('// Migration: set a site-wide default Open Graph image', start);
  assert.ok(end > start);
  return seed.slice(start, end);
}

test('the migration is guarded on a marker, so a page Tom deletes stays deleted', () => {
  const b = block();
  assert.match(b, /SELECT 1 FROM content WHERE section_key = \$1', \[EXETER_MARKER\]/);
  assert.match(b, /adopted existing page/, 'a hand-made page with the slug is adopted, not rebuilt');
});

test('the Devon ads page is only ever read: no UPDATE or DELETE names it', () => {
  const b = block();
  const writes = b.match(/(UPDATE|DELETE FROM|INSERT INTO)[^;]*?business-consultant-devon/g) || [];
  assert.deepStrictEqual(writes, []);
  assert.match(b, /FROM pages WHERE slug = 'business-consultant-devon'/);
  // and the copied rows never overwrite an existing row
  assert.match(b, /INSERT INTO content \(section_key, content\) VALUES \(\$1, \$2\) ON CONFLICT \(section_key\) DO NOTHING',\s*\[`\$\{ids\[tpl\]\}\.\$\{field\}`/);
});

test('the Cornwall page and About Us are not written to', () => {
  const b = block();
  const cw = b.match(/(UPDATE|DELETE FROM|INSERT INTO)[^;]*?business-consultant-cornwall/g) || [];
  assert.deepStrictEqual(cw, []);
  assert.ok(!/about-us/.test(b), 'no About Us block is added for Exeter');
});

test('it runs AFTER the Devon review pass, so it copies the corrected proof block and step 2', () => {
  const devonPass = seed.indexOf("const DEVON_MARKER = 'site.devon_review_pass_2026-10-01'");
  const exeter = seed.indexOf("const EXETER_MARKER = 'site.exeter_page_2026-10-02'");
  assert.ok(devonPass > 0 && exeter > devonPass, 'the Exeter migration must follow the Devon review pass in db/seed.js');
});

test('the Exeter wording is the three rows only, with the towns named', () => {
  const b = block();
  for (const town of ['Exeter', 'Exmouth', 'Crediton', 'Tiverton', 'Cullompton', 'Honiton', 'Newton Abbot']) {
    assert.ok(b.includes(town), `names ${town}`);
  }
  assert.match(b, /Working in and around Exeter/);
  assert.match(b, /in Exeter'\)/, 'the hero heading ends "in Exeter"');
  const sets = b.match(/await set\(/g) || [];
  assert.strictEqual(sets.length, 3, 'exactly three rows are rewritten; everything else is the approved Devon copy');
});

test('the new copy keeps to the Brand Operating System', () => {
  // The OLD map is the founder story being REMOVED (the from-values of the
  // belt-and-braces correction), so it is cut out before the scan; the scan
  // covers everything the migration writes as new copy.
  const b = block().split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
    .replace(/const OLD = \{[\s\S]*?\};/, '');
  const strings = Array.from(b.matchAll(/'((?:[^'\\]|\\.)*)'/g)).map((m) => m[1]).filter((s) => /\s/.test(s) && !/^[A-Z_ ]+$/.test(s));
  const copy = strings.join('\n');
  assert.ok(!/—/.test(copy), 'no em dashes');
  assert.ok(!/\bfire|firefight/i.test(copy), 'no fire metaphors');
  assert.ok(!/\bI\b (was|rebuilt|built|walked)/.test(copy), 'no first person');
  assert.ok(!/\bhelp rescue\b|seven-figure/i.test(copy), 'no founder-story claims written');
  for (const banned of ['solutions', 'synergy', 'leverage', 'empower', 'journey', 'holistic', 'tailored', 'bespoke', 'coach', 'transformational', 'world class']) {
    assert.ok(!copy.toLowerCase().includes(banned), `avoids "${banned}"`);
  }
});

test('the founder story cannot reach the Exeter page even if the Devon rows still carry it', () => {
  // The Cornwall lesson: the proof block had to be corrected after launch.
  // The migration checks what it copied and applies the same correction
  // from the home page's approved compact copy, and names the £500 review
  // in step 2, so the page lands right whatever state the Devon rows are in.
  const b = block();
  assert.match(b, /to help rescue it\|seven-figure exit/, 'detects the founder story in the copied rows');
  assert.match(b, /Twenty four months, start to sale/, 'takes the replacement from the approved compact home page copy only');
  assert.match(b, /Commercial Review, £500\./, 'step 2 names the Commercial Review and its price');
  assert.match(b, /\/where-to-start\/commercial-review/, 'and links to the review page');
  assert.match(b, /proof block already in its corrected form/, 'and says so when there was nothing to correct');
});

test('the page is indexable and out of the top menu, with search metadata inside the limits', () => {
  const b = block();
  assert.match(b, /VALUES \(\$1, \$2, \$3, false, false, \$4::jsonb/, 'hidden = false, show_in_nav = false');
  assert.match(b, /, false\)`/, 'noindex = false');
  const title = /'(Business Consultant Exeter \| Arrington Consultancy)'/.exec(b)[1];
  assert.ok(title.length <= 65, `meta title ${title.length} chars`);
  const desc = /'(Business consultant for owner run businesses in Exeter[^']*)'/.exec(b)[1];
  assert.ok(desc.length <= 160, `meta description ${desc.length} chars`);
});

test('the hero is a cover hero by SLUG, so it cannot launch side-by-side like Cornwall did', () => {
  const m = /const HERO_COVER_SLUGS = \[([^\]]*)\]/.exec(view);
  assert.ok(m, 'HERO_COVER_SLUGS is declared in views/index.ejs');
  const slugs = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  assert.ok(slugs.includes('business-consultant-exeter'));
  assert.match(view, /HERO_COVER_SLUGS\.includes\(currentPage\.slug\) && _iid === sectionOrder\[0\]/, 'only the page-opening hero is covered');
  // and the photo crop is keyed to the page class, desktop and phone
  const crops = view.match(/\.page-business-consultant-exeter \.hero\.hero-cover \.hero-photo img \{ object-position:/g) || [];
  assert.strictEqual(crops.length, 2);
  // the migration never tries to hardcode the hero id into the view
  assert.ok(!/hero__7/.test(view), 'no guessed instance id in the view');
});

test('the view carries structured data for the page, Exeter and Devon', () => {
  const i = view.indexOf("'business-consultant-exeter': {");
  assert.ok(i > 0);
  const entry = view.slice(i, view.indexOf('url: seo.canonical', i));
  assert.match(entry, /name: 'Business consultant Exeter'/);
  assert.match(entry, /\{ '@type': 'City', name: 'Exeter' \}, \{ '@type': 'AdministrativeArea', name: 'Devon' \}/);
});

test('the production inspection workflow covers the page by default', () => {
  assert.match(qa, /default: "[^"]*\/business-consultant-exeter[^"]*"/);
});
