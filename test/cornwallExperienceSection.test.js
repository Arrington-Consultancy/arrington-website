'use strict';

// The Cornwall landing page's section on Abacus and Falmouth Taxis
// (11/10/2026). The copy is the brief's proposed wording, verified against
// Tom's own records; these tests stop it drifting into claims the evidence
// does not carry, and pin the migration's guard.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { MARKER, SLUG, COPY, applyCornwallExperienceSection, TRIM_MARKER, OLD_HEADING, applyCornwallRealTrim } = require('../lib/cornwallExperienceSection');

const strip = (h) => h.replace(/<[^>]+>/g, '');

// The brief's proposed wording, exactly as sent.
const BRIEF = {
  heading: 'Built on real business experience in Cornwall',
  p1: 'Before starting Arrington Consultancy, Tom spent more than 18 years building and running Abacus & Falmouth Taxis. What began as a relatively small operation grew into a business handling thousands of bookings each week, with drivers, office staff, vehicles and systems to manage.',
  p2: 'He eventually sold the business. That experience shapes how Arrington Consultancy works today: understanding where the pressure sits, getting better control of the numbers and making the business less dependent on its owner.'
};

test('the copy is the brief wording, with only "&" written as "and" and "real" out of the heading', () => {
  // "real" taken out on Tom's instruction of 12/10/2026 ("limit use of real
  // over use"). Deletion only: the heading is the brief's minus one word.
  assert.strictEqual(COPY.heading, BRIEF.heading.replace('real ', ''));
  assert.strictEqual(OLD_HEADING, BRIEF.heading);
  assert.strictEqual(strip(COPY.p1), BRIEF.p1.replace('Abacus & Falmouth Taxis', 'Abacus and Falmouth Taxis'));
  assert.strictEqual(strip(COPY.p2), BRIEF.p2);
  assert.strictEqual(COPY.button_text, '', 'no button: the hero call to action keeps the page hierarchy');
});

test('no figure, price, headcount or claim beyond the evidence', () => {
  const text = [COPY.heading, COPY.p1, COPY.p2].map(strip).join(' ');
  assert.deepStrictEqual(text.match(/\d+/g), ['18'], 'the only number is the years');
  assert.ok(!/£|\bmillion\b|seven figure|turnover|\bstaff of\b|\bclients?\b/i.test(text));
  assert.ok(!/[–—]/.test(text), 'no dashes');
  assert.ok(!/\b[A-Za-z]+-[A-Za-z]+\b/.test(text), 'no hyphenated words');
  assert.ok(!/\b(I|my|me|we)\b/.test(text), 'Tom in the third person');
  for (const w of ['solutions', 'synergy', 'leverage', 'empower', 'journey', 'holistic', 'tailored', 'bespoke', 'transformational', 'rescue', 'fire']) {
    assert.ok(!new RegExp(`\\b${w}`, 'i').test(text), w);
  }
});

function fakeDb({ pages, content }) {
  const store = new Map(Object.entries(content));
  const pageMap = new Map(Object.entries(pages).map(([slug, order]) => [slug, { section_order: order }]));
  const db = {
    store, pageMap,
    async query(sql, params = []) {
      if (/^SELECT 1 FROM content WHERE section_key = \$1/.test(sql)) {
        return { rows: store.has(params[0]) ? [{}] : [] };
      }
      if (/^SELECT section_order FROM pages WHERE slug = \$1/.test(sql)) {
        return { rows: pageMap.has(params[0]) ? [pageMap.get(params[0])] : [] };
      }
      if (/^SELECT section_key FROM content WHERE section_key LIKE '%\.heading'/.test(sql)) {
        const ids = params[1];
        return { rows: [...store].filter(([k, v]) => k.endsWith('.heading') && v === params[0] && ids.includes(k.split('.')[0])).map(([k]) => ({ section_key: k })) };
      }
      if (/^SELECT section_order FROM pages$/.test(sql)) return { rows: [...pageMap.values()] };
      if (/^SELECT content FROM content WHERE section_key = \$1/.test(sql)) {
        return { rows: store.has(params[0]) ? [{ content: store.get(params[0]) }] : [] };
      }
      if (/^UPDATE content SET content = \$1 WHERE section_key = \$2 AND content = \$3/.test(sql)) {
        if (store.get(params[1]) !== params[2]) return { rowCount: 0 };
        store.set(params[1], params[0]);
        return { rowCount: 1 };
      }
      if (/^UPDATE content SET content = '' WHERE section_key = \$1 AND content = \$2/.test(sql)) {
        if (store.get(params[0]) !== params[1]) return { rowCount: 0 };
        store.set(params[0], '');
        return { rowCount: 1 };
      }
      if (/^SELECT DISTINCT split_part/.test(sql)) {
        return { rows: [...new Set([...store.keys()].map((k) => k.split('.')[0]))].map((instance_id) => ({ instance_id })) };
      }
      if (/^INSERT INTO content .* ON CONFLICT \(section_key\) DO NOTHING/.test(sql)) {
        if (store.has(params[0])) return { rowCount: 0, rows: [] };
        store.set(params[0], params[1]);
        return { rowCount: 1, rows: [] };
      }
      if (/^UPDATE pages SET section_order = \$1::jsonb WHERE slug = \$2/.test(sql)) {
        const page = pageMap.get(params[1]);
        // Honour the guard only if the SQL states it, so a missing guard fails.
        if (!page || (/AND section_order = \$3/.test(sql) && JSON.stringify(page.section_order) !== params[2])) return { rowCount: 0 };
        page.section_order = JSON.parse(params[0]);
        return { rowCount: 1 };
      }
      throw new Error(`unexpected query: ${sql}`);
    }
  };
  return db;
}

const LIVE = () => ({
  pages: {
    [SLUG]: ['hero__6', 'casestudy__8', 'approach__3', 'biography__8'],
    main: ['hero', 'filter', 'casestudy__7', 'casestudy2', 'filter__2']
  },
  content: {
    'hero__6.heading': 'Business consultant in Cornwall',
    'filter.heading': 'What we do',
    'filter__2.heading': 'Built from running real businesses',
    'filter__3.heading': 'An orphaned section, not on any page'
  }
});

test('adds one section straight after the hero, on a free id, and edits nothing else', async () => {
  const db = fakeDb(LIVE());
  const before = new Map(db.store);
  const note = await applyCornwallExperienceSection(db);
  assert.match(note, /section added as filter__4 after hero__6/);
  assert.deepStrictEqual(db.pageMap.get(SLUG).section_order, ['hero__6', 'filter__4', 'casestudy__8', 'approach__3', 'biography__8']);
  assert.deepStrictEqual(db.pageMap.get('main').section_order, LIVE().pages.main);
  for (const [k, v] of before) assert.strictEqual(db.store.get(k), v, k);
  assert.strictEqual(db.store.get('filter__4.heading'), COPY.heading);
  assert.ok(db.store.has(MARKER));
});

test('a second run is a silent no-op', async () => {
  const db = fakeDb(LIVE());
  await applyCornwallExperienceSection(db);
  const order = [...db.pageMap.get(SLUG).section_order];
  const size = db.store.size;
  assert.strictEqual(await applyCornwallExperienceSection(db), null);
  assert.deepStrictEqual(db.pageMap.get(SLUG).section_order, order);
  assert.strictEqual(db.store.size, size);
});

test('a section already on the page with this heading is adopted, not duplicated', async () => {
  const live = LIVE();
  live.pages[SLUG] = ['hero__6', 'filter__9', 'casestudy__8'];
  live.content['filter__9.heading'] = COPY.heading;
  const db = fakeDb(live);
  assert.match(await applyCornwallExperienceSection(db), /already carries this section \(filter__9\)/);
  assert.deepStrictEqual(db.pageMap.get(SLUG).section_order, ['hero__6', 'filter__9', 'casestudy__8']);
});

test('no Cornwall page: nothing written and not marked done', async () => {
  const live = LIVE();
  delete live.pages[SLUG];
  const db = fakeDb(live);
  assert.match(await applyCornwallExperienceSection(db), /no Cornwall page/);
  assert.ok(!db.store.has(MARKER));
});

test('a page order changed mid-run is not overwritten', async () => {
  const db = fakeDb(LIVE());
  const real = db.query.bind(db);
  db.query = async (sql, params) => {
    if (/^UPDATE pages/.test(sql)) db.pageMap.get(SLUG).section_order = ['hero__6', 'approach__3'];
    return real(sql, params);
  };
  assert.match(await applyCornwallExperienceSection(db), /order changed/);
  assert.deepStrictEqual(db.pageMap.get(SLUG).section_order, ['hero__6', 'approach__3']);
  assert.ok(!db.store.has(MARKER));
});

test('the seed runs it, and the heading balance rule is scoped to the Cornwall page', () => {
  const seed = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.js'), 'utf8');
  assert.ok(seed.includes("require('../lib/cornwallExperienceSection').applyCornwallExperienceSection(db)"));
  const view = fs.readFileSync(path.join(__dirname, '..', 'views', 'index.ejs'), 'utf8');
  assert.ok(view.includes('.page-business-consultant-cornwall .filter .section-heading { text-wrap: balance; }'));
});

// ---- 12/10/2026: fewer "real"s on the Cornwall page ----

const TRIM_LIVE = () => ({
  pages: {
    [SLUG]: ['hero__6', 'filter__6', 'casestudy__8', 'approach__3', 'biography__8'],
    'business-consultant-devon': ['hero__4', 'casestudy', 'approach', 'biography']
  },
  content: {
    'filter__6.heading': OLD_HEADING,
    'casestudy__8.label': '<strong>Real commercial experience</strong>',
    'casestudy__8.heading': 'Commercial decisions<br />with real consequences',
    'casestudy.label': '<strong>Real commercial experience</strong>'
  }
});

test('the trim takes "real" out of the heading and the label off the Cornwall proof block only', async () => {
  const db = fakeDb(TRIM_LIVE());
  const note = await applyCornwallRealTrim(db);
  assert.match(note, /filter__6: heading now "Built on business experience in Cornwall"/);
  assert.match(note, /casestudy__8: "Real commercial experience" label removed/);
  assert.strictEqual(db.store.get('filter__6.heading'), COPY.heading);
  assert.strictEqual(db.store.get('casestudy__8.label'), '');
  assert.strictEqual(db.store.get('casestudy__8.heading'), TRIM_LIVE().content['casestudy__8.heading'], 'proof heading untouched');
  assert.strictEqual(db.store.get('casestudy.label'), TRIM_LIVE().content['casestudy.label'], 'Devon untouched');
  assert.ok(db.store.has(TRIM_MARKER));
  assert.strictEqual(await applyCornwallRealTrim(db), null, 'a second run is a no-op');
});

test('a label edited in the CMS since is left alone and its live value logged', async () => {
  const live = TRIM_LIVE();
  live.content['casestudy__8.label'] = 'Commercial experience in Cornwall';
  const db = fakeDb(live);
  assert.match(await applyCornwallRealTrim(db), /casestudy__8: label left alone, live value "Commercial experience in Cornwall"/);
  assert.strictEqual(db.store.get('casestudy__8.label'), 'Commercial experience in Cornwall');
});

test('a fresh database gets the trimmed heading straight away, and the trim then finds it done', async () => {
  const db = fakeDb(LIVE());
  await applyCornwallExperienceSection(db);
  assert.strictEqual(db.store.get('filter__4.heading'), COPY.heading);
  assert.match(await applyCornwallRealTrim(db), /filter__4: heading already trimmed/);
});

test('no Cornwall page: the trim writes nothing and is not marked done', async () => {
  const live = TRIM_LIVE();
  delete live.pages[SLUG];
  const db = fakeDb(live);
  assert.match(await applyCornwallRealTrim(db), /no Cornwall page/);
  assert.ok(!db.store.has(TRIM_MARKER));
});

test('the case study template renders no label paragraph when the label is empty', () => {
  const view = fs.readFileSync(path.join(__dirname, '..', 'views', 'index.ejs'), 'utf8');
  const block = view.slice(view.indexOf("<% if (_tpl === 'casestudy') { %>"));
  const labelLine = block.split('\n').find((l) => l.includes("content[_k + '.label']"));
  assert.match(labelLine, /<% if \(\(content\[_k \+ '\.label'\] \|\| ''\)\.replace\(\/<\[\^>\]\+>\/g, ''\)\.trim\(\)\) \{ %><p class="section-label">/);
});

test('the seed runs the trim after the section migration', () => {
  const seed = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.js'), 'utf8');
  const a = seed.indexOf('applyCornwallExperienceSection(db)');
  const b = seed.indexOf('applyCornwallRealTrim(db)');
  assert.ok(a > 0 && b > a);
});
