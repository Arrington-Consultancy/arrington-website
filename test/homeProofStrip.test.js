// The home page's three-tile proof strip comes off (Tom, 28/10/2026): it sat
// directly under the Abacus case study and restated both case studies above
// it. Rows and the p2 fallback are cleared only while they hold the strip's
// own values, so a CMS edit wins; run once under a marker.
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { MARKER, HEADING, applyHomeProofStrip } = require('../lib/homeProofStrip');

function fakeDb({ pages, content }) {
  const store = new Map(Object.entries(content));
  return {
    store,
    async query(sql, params = []) {
      if (/^SELECT 1 FROM content WHERE section_key = \$1/.test(sql)) return { rows: store.has(params[0]) ? [{}] : [] };
      if (/^SELECT section_order FROM pages WHERE slug = 'main'/.test(sql)) return { rows: pages.filter((p) => p.slug === 'main') };
      if (/^SELECT content FROM content WHERE section_key = \$1/.test(sql)) return { rows: store.has(params[0]) ? [{ content: store.get(params[0]) }] : [] };
      if (/^INSERT INTO content/.test(sql)) { if (!store.has(params[0])) store.set(params[0], params[1]); return { rowCount: 1 }; }
      if (/^UPDATE content SET content = \$1 WHERE section_key = \$2 AND content = \$3/.test(sql)) {
        if (!store.has(params[1]) || store.get(params[1]) !== params[2]) return { rowCount: 0 };
        store.set(params[1], params[0]);
        return { rowCount: 1 };
      }
      throw new Error(`unexpected query: ${sql}`);
    }
  };
}

// Production's home page: the strip is on filter__2 (the July 2026 instance),
// as tiles in the row fields and as three text lines in p2.
const livePages = () => [{ slug: 'main', section_order: ['hero', 'filter', 'casestudy__7', 'casestudy2__9', 'casestudy2', 'filter__2'] }];
const liveContent = () => ({
  'filter.heading': 'What we do',
  'filter__2.heading': HEADING,
  'filter__2.p1': '<p>Tom Arrington spent over 20 years building and running businesses across Devon and Cornwall.</p>',
  'filter__2.p2': 'Built and exited: Abacus and Falmouth Taxis.<br />Turned around: Devon marine firm.<br />Improved margin: South West aesthetic clinics.',
  'filter__2.row_1_action': 'Built and exited',
  'filter__2.row_1_client': 'Abacus and Falmouth Taxis',
  'filter__2.row_2_action': 'Turned around',
  'filter__2.row_2_client': 'Devon marine firm',
  'filter__2.row_3_action': 'Improved margin',
  'filter__2.row_3_client': 'South West aesthetic clinics',
  'filter__2.button_text': 'Read what we have done'
});

test('the three tiles and the p2 fallback are cleared; heading, paragraph and button stay; run once', async () => {
  const db = fakeDb({ pages: livePages(), content: liveContent() });
  const note = await applyHomeProofStrip(db);
  assert.match(note, /^filter__2: 7 value\(s\) cleared/);
  for (let n = 1; n <= 3; n++) {
    assert.strictEqual(db.store.get(`filter__2.row_${n}_action`), '');
    assert.strictEqual(db.store.get(`filter__2.row_${n}_client`), '');
  }
  assert.strictEqual(db.store.get('filter__2.p2'), '', 'the p2 fallback would print the same three lines as text');
  assert.strictEqual(db.store.get('filter__2.heading'), HEADING);
  assert.ok(db.store.get('filter__2.p1').includes('over 20 years'));
  assert.strictEqual(db.store.get('filter__2.button_text'), 'Read what we have done');
  assert.ok(db.store.has(MARKER));
  assert.strictEqual(await applyHomeProofStrip(db), null, 'a redeploy is not a no-op');
});

test('a tile Tom has edited keeps the whole strip, and the live value is logged', async () => {
  const content = liveContent();
  content['filter__2.row_2_client'] = 'Plymouth marine firm';
  const db = fakeDb({ pages: livePages(), content });
  const note = await applyHomeProofStrip(db);
  assert.match(note, /left alone.*row_2_client "Plymouth marine firm"/);
  assert.strictEqual(db.store.get('filter__2.row_1_client'), 'Abacus and Falmouth Taxis', 'an untouched tile was cleared beside an edited one');
  assert.strictEqual(db.store.get('filter__2.p2'), liveContent()['filter__2.p2']);
  assert.ok(db.store.has(MARKER), 'the boot would log this every time');
});

test('a p2 Tom has rewritten keeps the strip too, because clearing the rows would reveal it', async () => {
  const content = liveContent();
  content['filter__2.p2'] = '<p>Something Tom wrote.</p>';
  const db = fakeDb({ pages: livePages(), content });
  const note = await applyHomeProofStrip(db);
  assert.match(note, /left alone.*p2 "Something Tom wrote\."/);
  assert.strictEqual(db.store.get('filter__2.row_1_action'), 'Built and exited');
});

test('no such block, or already clear: stamp and do nothing', async () => {
  const none = fakeDb({ pages: [{ slug: 'main', section_order: ['hero', 'filter'] }], content: { 'filter.heading': 'What we do' } });
  assert.match(await applyHomeProofStrip(none), /nothing to do/);
  assert.ok(none.store.has(MARKER));
  const clear = fakeDb({ pages: livePages(), content: { 'filter__2.heading': HEADING, 'filter__2.p2': '' } });
  assert.match(await applyHomeProofStrip(clear), /already clear/);
});

test('a value that changes between the read and the write is not overwritten, and the marker waits', async () => {
  const db = fakeDb({ pages: livePages(), content: liveContent() });
  const realQuery = db.query.bind(db);
  let reads = 0;
  db.query = async (sql, params) => {
    const r = await realQuery(sql, params);
    // After every read is done, a CMS edit lands on the third tile.
    if (/^SELECT content/.test(sql) && ++reads === 8) db.store.set('filter__2.row_3_client', 'Edited mid-run');
    return r;
  };
  const note = await applyHomeProofStrip(db);
  assert.match(note, /changed while this ran/);
  assert.strictEqual(db.store.get('filter__2.row_3_client'), 'Edited mid-run');
  assert.ok(!db.store.has(MARKER));
});

test('the seed runs it after the Abacus proof, never fatally', () => {
  const seed = fs.readFileSync(path.join(__dirname, '..', 'db', 'seed.js'), 'utf8');
  const at = seed.indexOf("require('../lib/homeProofStrip')");
  assert.ok(at > seed.indexOf("require('../lib/homeAbacusProof')"), 'the strip migration is missing or runs before the Abacus proof');
  assert.ok(/try \{[^}]*homeProofStrip[\s\S]{0,400}catch/.test(seed), 'the migration is not wrapped so a failure cannot stop the boot');
});
