// Business Consultant Cornwall (01/10/2026). The first Search Console read
// showed one local term with any volume at all, "cornwall business
// consultant", sitting at position 24 against a site with no Cornwall page.
// Tom's decision: build one, from the approved Devon landing page copy, with
// the towns he confirmed. These pin the parts that would quietly go wrong:
// the migration writing to the Devon ads page, the copy drifting out of the
// Brand Operating System, the towns list losing a place Tom named, or the
// page being hidden from the search engines it exists for.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const seed = fs.readFileSync(path.join(root, 'db', 'seed.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'views', 'index.ejs'), 'utf8');

function block() {
  const start = seed.indexOf("const CORNWALL_MARKER = 'site.cornwall_page_2026-10-01'");
  assert.ok(start > 0, 'the Cornwall migration is in db/seed.js');
  const end = seed.indexOf('// Migration: tighten SEO snippets', start);
  assert.ok(end > start);
  return seed.slice(start, end);
}

test('the migration is guarded on a marker, so a page Tom deletes stays deleted', () => {
  const b = block();
  assert.match(b, /SELECT 1 FROM content WHERE section_key = \$1', \[CORNWALL_MARKER\]/);
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

test('the towns are the ones Tom confirmed, Newquay included', () => {
  const b = block();
  for (const town of ['Saltash', 'Liskeard', 'Bodmin', 'Truro', 'Falmouth', 'Newquay']) {
    assert.ok(b.includes(town), `names ${town}`);
  }
  assert.match(b, /Working across Cornwall/);
  assert.match(b, /in Cornwall'\)/, 'the hero heading ends "in Cornwall"');
});

test('the new copy keeps to the Brand Operating System', () => {
  // Comments carry apostrophes ("Tom's story"), which would pair up as
  // strings; scan the code only.
  const b = block().split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const strings = Array.from(b.matchAll(/'((?:[^'\\]|\\.)*)'/g)).map((m) => m[1]).filter((s) => /\s/.test(s) && !/^[A-Z_ ]+$/.test(s));
  const copy = strings.join('\n');
  assert.ok(!/—/.test(copy), 'no em dashes');
  assert.ok(!/\bfire|firefight/i.test(copy), 'no fire metaphors');
  assert.ok(!/\bprogramme\b|\b30 day\b|\bfour week\b/i.test(copy), 'no programme language');
  assert.ok(!/\bI\b (was|rebuilt|built|walked)/.test(copy), 'no first person');
  for (const banned of ['solutions', 'synergy', 'leverage', 'empower', 'journey', 'holistic', 'tailored', 'bespoke', 'coach', 'transformational', 'world class']) {
    assert.ok(!copy.toLowerCase().includes(banned), `avoids "${banned}"`);
  }
});

test('the page is indexable and out of the top menu, with search metadata inside the limits', () => {
  const b = block();
  assert.match(b, /VALUES \(\$1, \$2, \$3, false, false, \$4::jsonb/, 'hidden = false, show_in_nav = false');
  assert.match(b, /, false\)`/, 'noindex = false');
  const title = /'(Business Consultant Cornwall \| Arrington Consultancy)'/.exec(b)[1];
  assert.ok(title.length <= 65, `meta title ${title.length} chars`);
  const desc = /'(Business consultant for owner run businesses across Cornwall[^']*)'/.exec(b)[1];
  assert.ok(desc.length <= 160, `meta description ${desc.length} chars`);
});

test('the view carries structured data for the page, Cornwall only', () => {
  const i = view.indexOf("'business-consultant-cornwall': {");
  assert.ok(i > 0);
  const entry = view.slice(i, view.indexOf('url: seo.canonical', i));
  assert.match(entry, /name: 'Business consultant Cornwall'/);
  assert.match(entry, /areaServed: \[\{ '@type': 'AdministrativeArea', name: 'Cornwall' \}\]/);
});
