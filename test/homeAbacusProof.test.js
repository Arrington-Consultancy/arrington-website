'use strict';

// Tom's decision of 22/10/2026 on the homepage review: the Abacus and
// Falmouth Taxis story replaces the VAT Intervention as the second proof on
// the home page, approved words only, and the full VAT case stays on
// Evidence. The migration finds the VAT instance by its live heading, copies
// the approved Abacus copy onto a freshly allocated instance in its place,
// and hides (never deletes) the VAT instance.

const test = require('node:test');
const assert = require('node:assert');
const { MARKER, ABACUS, EVIDENCE_LINK, applyHomeAbacusProof } = require('../lib/homeAbacusProof');
const { COPY: CORNWALL } = require('../lib/cornwallExperienceSection');

function fakeDb({ pages, content }) {
  const store = new Map(Object.entries(content));
  return {
    store, pages,
    async query(sql, params = []) {
      if (/^SELECT 1 FROM content WHERE section_key = \$1/.test(sql)) return { rows: store.has(params[0]) ? [{}] : [] };
      if (/^SELECT section_order, hidden_sections FROM pages WHERE slug = 'main'/.test(sql)) return { rows: pages.filter((p) => p.slug === 'main') };
      if (/^SELECT content FROM content WHERE section_key = \$1/.test(sql)) return { rows: store.has(params[0]) ? [{ content: store.get(params[0]) }] : [] };
      if (/^INSERT INTO content/.test(sql)) { if (!store.has(params[0])) store.set(params[0], params[1]); return { rowCount: 1 }; }
      if (/^SELECT section_order FROM pages$/.test(sql)) return { rows: pages.map((p) => ({ section_order: p.section_order })) };
      if (/^SELECT DISTINCT split_part/.test(sql)) return { rows: [...new Set([...store.keys()].map((k) => k.split('.')[0]))].map((instance_id) => ({ instance_id })) };
      if (/^UPDATE pages SET section_order = \$1::jsonb, hidden_sections = \$2::jsonb WHERE slug = 'main' AND section_order = \$3::jsonb AND hidden_sections = \$4::jsonb/.test(sql)) {
        const main = pages.find((p) => p.slug === 'main');
        if (JSON.stringify(main.section_order) !== params[2] || JSON.stringify(main.hidden_sections) !== params[3]) return { rowCount: 0 };
        main.section_order = JSON.parse(params[0]);
        main.hidden_sections = JSON.parse(params[1]);
        return { rowCount: 1 };
      }
      throw new Error(`unexpected query: ${sql}`);
    }
  };
}

// Production's home page after the three offer release: ids as production
// allocated them (the Orca copy is casestudy__7 there, casestudy__10 on a
// local rebuild), What we do hidden, and the Evidence page holding the
// casestudy2 ids that are already taken.
const livePages = () => [
  { slug: 'main', section_order: ['hero', 'filter', 'casestudy__7', 'casestudy2', 'filter__2'], hidden_sections: ['filter'] },
  { slug: 'evidence', section_order: ['hero__2', 'biography__2', 'casestudy__4', 'casestudy2__2', 'casestudy2__5', 'documents'], hidden_sections: [] },
  { slug: 'what-we-do', section_order: ['hero__9', 'casestudy2__3'], hidden_sections: [] }
];
const liveContent = () => ({
  'casestudy2.label': 'Case study',
  'casestudy2.heading': 'The VAT Intervention',
  'casestudy2.intro': 'We came into a fast growing business where a VAT problem had been building in the background for over a year.',
  'casestudy2.link_text': 'Read the full case study',
  'casestudy2.link_href': '/evidence#casestudy2__5',
  'casestudy2__4.heading': 'An orphaned instance whose rows are still in the table',
  'casestudy__7.heading': 'The Insolvent Turnaround',
  'biography__2.heading': '<strong>Abacus and Falmouth Taxis</strong><br />Built, very nearly lost, then rebuilt properly'
});

test('the copy is approved words only: the Cornwall section Tom approved, the Evidence heading, no dashes, no AI', () => {
  const strip = (p) => p.replace(/^<p>/, '').replace(/<\/p>$/, '');
  assert.strictEqual(ABACUS.intro, strip(CORNWALL.p1), 'the intro is not the Cornwall section\'s first paragraph');
  assert.strictEqual(ABACUS.body, strip(CORNWALL.p2), 'the body is not the Cornwall section\'s second paragraph');
  assert.strictEqual(ABACUS.heading, 'Abacus and Falmouth Taxis');
  assert.strictEqual(ABACUS.outcome, '', 'an outcome was written');
  assert.strictEqual(ABACUS.link_href, EVIDENCE_LINK);
  assert.strictEqual(EVIDENCE_LINK, '/evidence#biography__2', 'the link does not go to the full Abacus case study on Evidence');
  const text = Object.values(ABACUS).join(' ');
  assert.ok(!/[–—]/.test(text), 'a dash in the copy');
  assert.ok(!/\bAI\b/.test(text), 'AI in the proof copy');
  assert.ok(/less dependent on its owner/.test(ABACUS.body), 'the owner-dependency line, the reason this story was chosen, is missing');
  assert.ok(!/£|\d{3,}/.test(text), 'a money figure or a count crept in');
});

test('the Abacus story takes the VAT Intervention\'s place; the VAT case is hidden, not deleted; run once', async () => {
  const db = fakeDb({ pages: livePages(), content: liveContent() });
  const note = await applyHomeAbacusProof(db);
  assert.match(note, /Abacus story added as casestudy2__6 in place of casestudy2 \(hidden, not deleted\)/);
  const main = db.pages[0];
  assert.deepStrictEqual(main.section_order, ['hero', 'filter', 'casestudy__7', 'casestudy2__6', 'casestudy2', 'filter__2'], 'the new instance is not in the VAT slot, or the VAT instance was removed');
  assert.deepStrictEqual(main.hidden_sections, ['filter', 'casestudy2']);
  // Allocated past every id in use on any page and every prefix in the content
  // table (casestudy2__2, __3 and __5 are on pages, __4 is an orphan with rows).
  assert.strictEqual(db.store.get('casestudy2__6.heading'), 'Abacus and Falmouth Taxis');
  assert.strictEqual(db.store.get('casestudy2__6.intro'), ABACUS.intro);
  assert.strictEqual(db.store.get('casestudy2__6.body'), ABACUS.body);
  assert.strictEqual(db.store.get('casestudy2__6.outcome'), '');
  assert.strictEqual(db.store.get('casestudy2__6.label'), 'Case study', 'the label is not the one the VAT instance carried');
  assert.strictEqual(db.store.get('casestudy2__6.link_text'), 'Read the full case study', 'the link text is not the one the VAT instance carried');
  assert.strictEqual(db.store.get('casestudy2__6.link_href'), '/evidence#biography__2');
  // The VAT rows are untouched.
  assert.strictEqual(db.store.get('casestudy2.heading'), 'The VAT Intervention');
  assert.strictEqual(db.store.get('casestudy2.link_href'), '/evidence#casestudy2__5');
  assert.ok(db.store.has(MARKER));
  // Run once: a second boot, and a later CMS change, are left alone.
  main.hidden_sections = ['filter'];
  assert.strictEqual(await applyHomeAbacusProof(db), null);
  assert.deepStrictEqual(main.hidden_sections, ['filter']);
});

test('the VAT instance is found by its live heading, never by an assumed id', async () => {
  const pages = livePages();
  pages[0].section_order = ['hero', 'casestudy__7', 'casestudy2__9', 'filter__2'];
  const content = liveContent();
  delete content['casestudy2.heading'];
  content['casestudy2__9.heading'] = 'The <strong>VAT</strong> Intervention';
  content['casestudy2__9.label'] = 'Case study';
  const db = fakeDb({ pages, content });
  const note = await applyHomeAbacusProof(db);
  assert.match(note, /in place of casestudy2__9/);
  assert.deepStrictEqual(db.pages[0].section_order, ['hero', 'casestudy__7', 'casestudy2__6', 'casestudy2__9', 'filter__2']);
  assert.deepStrictEqual(db.pages[0].hidden_sections, ['filter', 'casestudy2__9']);
});

test('no VAT Intervention on the home page: nothing written, marker stamped', async () => {
  const pages = livePages();
  pages[0].section_order = ['hero', 'casestudy__7', 'filter__2'];
  const db = fakeDb({ pages, content: liveContent() });
  const before = db.store.size;
  const note = await applyHomeAbacusProof(db);
  assert.match(note, /no VAT Intervention on the home page/);
  assert.strictEqual(db.store.size, before + 1, 'rows were written');
  assert.ok(db.store.has(MARKER));
});

test('a home page that already carries the Abacus story is adopted, not given a second copy', async () => {
  const pages = livePages();
  pages[0].section_order = ['hero', 'casestudy__7', 'casestudy2__8', 'casestudy2', 'filter__2'];
  const content = liveContent();
  content['casestudy2__8.heading'] = '<strong>Abacus and Falmouth Taxis</strong>';
  const db = fakeDb({ pages, content });
  const note = await applyHomeAbacusProof(db);
  assert.match(note, /already carries the Abacus story \(casestudy2__8\)/);
  assert.deepStrictEqual(db.pages[0].section_order, ['hero', 'casestudy__7', 'casestudy2__8', 'casestudy2', 'filter__2']);
  assert.deepStrictEqual(db.pages[0].hidden_sections, ['filter'], 'the VAT case was hidden although the story was already there');
  assert.ok(db.store.has(MARKER));
});

test('a concurrent CMS change wins: rows written, nothing placed, no marker', async () => {
  const db = fakeDb({ pages: livePages(), content: liveContent() });
  const realQuery = db.query.bind(db);
  db.query = async (sql, params) => {
    // Tom reorders the page between the read and the write.
    if (/^SELECT DISTINCT split_part/.test(sql)) db.pages[0].section_order = ['hero', 'casestudy2', 'casestudy__7', 'filter__2'];
    return realQuery(sql, params);
  };
  const note = await applyHomeAbacusProof(db);
  assert.match(note, /changed while this ran; casestudy2__6 rows written but not placed/);
  assert.deepStrictEqual(db.pages[0].section_order, ['hero', 'casestudy2', 'casestudy__7', 'filter__2']);
  assert.ok(!db.store.has(MARKER), 'the marker was stamped without the page being changed');
});

test('no home page: nothing to do and no marker', async () => {
  const db = fakeDb({ pages: [livePages()[1]], content: liveContent() });
  assert.match(await applyHomeAbacusProof(db), /no home page/);
  assert.ok(!db.store.has(MARKER));
});

test('the seed runs the migration after the three offers one, never fatally', () => {
  const seed = require('fs').readFileSync(require('path').join(__dirname, '..', 'db', 'seed.js'), 'utf8');
  const three = seed.indexOf("require('../lib/threeOffersSite')");
  const abacus = seed.indexOf("require('../lib/homeAbacusProof')");
  assert.ok(three > 0 && abacus > three, 'the Abacus migration does not run after the three offers one');
  assert.ok(/applyHomeAbacusProof\(db\);[\s\S]{0,200}catch \(err\)/.test(seed), 'the migration is not wrapped so a failure cannot stop the boot');
});
