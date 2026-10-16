'use strict';

// The Websites and AI page's section for taxi firms (Tom, 16/10/2026:
// "Website page needs our new taxi page on there as well"). Pins the copy to
// the Brand OS rules, the migration's placement and guards, and the button
// path the renderer now accepts.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { MARKER, SLUG, TARGET, COPY, applyWebsitesAiTaxiSection } = require('../lib/websitesAiTaxiSection');

const strip = (h) => h.replace(/<[^>]+>/g, '');

test('the copy follows the brand rules and claims only what the live pages already say', () => {
  const text = [COPY.label, COPY.heading, COPY.subtext, COPY.button_text].map(strip).join(' ');
  assert.ok(!/[–—]/.test(text), 'no dashes');
  assert.ok(!/\b[A-Za-z]+-[A-Za-z]+\b/.test(text), 'no hyphenated words');
  assert.ok(!/\b(I|I'm|I've|my|me)\b/.test(text), 'no first person singular');
  assert.match(text, /\bTom ran Abacus and Falmouth Taxis for nearly twenty years\b/, 'Tom in the third person, the Evidence fact');
  assert.match(text, /where it has a booking API/, "the £999 page's own qualifier on the dispatch link");
  assert.match(text, /a person in the office decides what goes out/, 'AI inside rules, a person decides');
  assert.ok(!/£|\d/.test(text), 'no price or figure');
  for (const w of ['solutions?', 'synergy', 'leverage', 'empower', 'journey', 'holistic', 'tailored', 'bespoke', 'transformational', 'world class', 'seamless']) {
    assert.ok(!new RegExp(`\\b${w}\\b`, 'i').test(text), w);
  }
  assert.strictEqual(COPY.button_link, TARGET);
  assert.strictEqual(TARGET, 'taxi-and-private-hire-operators/websites');
});

test('the intervention button now accepts a sub-page path and still refuses anything that is not a plain path', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'views', 'index.ejs'), 'utf8');
  const m = /const _validSlug = (\/\^.*\$\/)\.test\(_btnSlug\);/.exec(src);
  assert.ok(m, 'the intervention button guard is where it was');
  const re = new RegExp(m[1].slice(1, -1));
  for (const ok of ['main', 'evidence#documents', TARGET, 'taxi-and-private-hire-operators/websites#conversation']) assert.ok(re.test(ok), ok);
  for (const bad of ['/evidence', '../admin', 'a//b', 'https://evil.example', 'javascript:alert(1)', 'a/../b', 'Evidence', 'a/']) assert.ok(!re.test(bad), bad);
});

function fakeDb({ pages, content }) {
  const store = new Map(Object.entries(content));
  const pageMap = new Map(Object.entries(pages).map(([slug, order]) => [slug, { section_order: order }]));
  return {
    store, pageMap,
    async query(sql, params = []) {
      if (/^SELECT 1 FROM content WHERE section_key = \$1/.test(sql)) return { rows: store.has(params[0]) ? [{}] : [] };
      if (/^SELECT section_order FROM pages WHERE slug = \$1/.test(sql)) return { rows: pageMap.has(params[0]) ? [pageMap.get(params[0])] : [] };
      if (/^SELECT section_key FROM content WHERE \(section_key LIKE '%\.heading'/.test(sql)) {
        const [heading, target, ids] = params;
        return { rows: [...store].filter(([k, v]) => ids.includes(k.split('.')[0]) && ((k.endsWith('.heading') && v === heading) || (k.endsWith('.button_link') && v === target))).map(([k]) => ({ section_key: k })) };
      }
      if (/^SELECT section_order FROM pages$/.test(sql)) return { rows: [...pageMap.values()] };
      if (/^SELECT DISTINCT split_part/.test(sql)) return { rows: [...new Set([...store.keys()].map((k) => k.split('.')[0]))].map((p) => ({ instance_id: p })) };
      if (/^INSERT INTO content/.test(sql)) { if (!store.has(params[0])) store.set(params[0], params[1]); return { rowCount: 1 }; }
      if (/^UPDATE pages SET section_order = \$1::jsonb WHERE slug = \$2 AND section_order = \$3::jsonb/.test(sql)) {
        const page = pageMap.get(params[1]);
        if (!page || JSON.stringify(page.section_order) !== params[2]) return { rowCount: 0 };
        page.section_order = JSON.parse(params[0]);
        return { rowCount: 1 };
      }
      throw new Error('unexpected query: ' + sql);
    }
  };
}

test('the section goes in on a fresh id just before the closing call to action, once', async () => {
  const db = fakeDb({
    pages: { [SLUG]: ['hero__5', 'biography__6', 'insights__2', 'intervention__4'], 'what-we-do': ['hero', 'intervention__9'] },
    content: { 'intervention__4.heading': 'Technology should make the business stronger', 'intervention__5.heading': 'orphan', 'intervention.heading': 'x' }
  });
  const note = await applyWebsitesAiTaxiSection(db);
  assert.match(note, /^section added as intervention__2 before the closing intervention__4/);
  assert.deepStrictEqual(db.pageMap.get(SLUG).section_order, ['hero__5', 'biography__6', 'insights__2', 'intervention__2', 'intervention__4']);
  assert.strictEqual(db.store.get('intervention__2.button_link'), TARGET);
  assert.strictEqual(db.store.get('intervention__4.heading'), 'Technology should make the business stronger', 'nothing on the page is edited');
  assert.ok(db.store.has(MARKER));
  assert.strictEqual(await applyWebsitesAiTaxiSection(db), null, 'a redeploy is a no-op');
});

test('a page that already links to the taxi websites page is left alone; no page, no marker', async () => {
  const db = fakeDb({ pages: { [SLUG]: ['hero__5', 'intervention__7'] }, content: { 'intervention__7.button_link': TARGET } });
  assert.match(await applyWebsitesAiTaxiSection(db), /already carries a taxi section \(intervention__7\)/);
  assert.deepStrictEqual(db.pageMap.get(SLUG).section_order, ['hero__5', 'intervention__7']);
  const empty = fakeDb({ pages: {}, content: {} });
  assert.match(await applyWebsitesAiTaxiSection(empty), /no Websites and AI page/);
  assert.ok(!empty.store.has(MARKER), 'a database without the page is not marked as done');
});

test('the seed runs it, never fatally', () => {
  const seed = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.js'), 'utf8');
  assert.ok(seed.includes("require('../lib/websitesAiTaxiSection').applyWebsitesAiTaxiSection(db)"));
  assert.match(seed, /Websites and AI taxi section migration failed \(boot continues\)/);
});
