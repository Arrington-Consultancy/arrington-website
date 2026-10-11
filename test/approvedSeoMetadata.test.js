// SEO metadata approved by Tom on 11/10/2026: four pages, search result
// titles and descriptions only. Pins the approved wording, one title and one
// description per page, the untouched canonicals and structured data, and
// the homepage migration's guard (a CMS edit made since always wins).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { APPROVED, HOME_LIVE_2026_10_11, applyHomeSeoMetadata } = require('../lib/approvedSeoMetadata');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const unescape = (s) => s.replace(/&amp;/g, '&');

const VIEWS = [
  ['views/sale-readiness.ejs', APPROVED.readyToSell, '/get-your-business-ready-to-sell'],
  ['views/taxi-operators.ejs', APPROVED.taxi, '/taxi-and-private-hire-operators'],
  ['views/owner-check.ejs', APPROVED.ownerCheck, '/owner-check']
];

test('each code page carries exactly one approved title and one approved description', () => {
  for (const [file, approved, p] of VIEWS) {
    const v = read(file);
    const titles = [...v.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => unescape(m[1]));
    assert.deepStrictEqual(titles, [approved.title], `${file}: title`);
    const descs = [...v.matchAll(/<meta name="description" content="([^"]*)">/g)].map((m) => unescape(m[1]));
    assert.deepStrictEqual(descs, [approved.description], `${file}: description`);
    assert.strictEqual((v.match(/rel="canonical"/g) || []).length, 1, `${file}: one canonical`);
    assert.ok(v.includes(`<link rel="canonical" href="https://www.arringtonconsultancy.com${p}">`), `${file}: canonical changed`);
    assert.ok(v.includes("include('partials/page-schema'"), `${file}: page structured data has gone`);
  }
});

test('the approved wording is exactly what Tom approved', () => {
  assert.strictEqual(APPROVED.home.title, 'Business Consultant Devon & Cornwall, Arrington Consultancy');
  assert.strictEqual(APPROVED.home.description, 'Business consultancy for established owner run businesses across Devon and Cornwall. An outside view on decisions, structure and what to deal with next.');
  assert.strictEqual(APPROVED.readyToSell.title, 'Get Your Business Ready to Sell');
  assert.strictEqual(APPROVED.taxi.title, 'Independent Taxi Dispatch System Advice | Arrington');
  assert.strictEqual(APPROVED.ownerCheck.title, 'Owner Check | Arrington Consultancy', 'the Owner Check title was to be preserved');
});

// A stand-in for the pages table, enough for the two statements the
// migration runs, so the guard is exercised without a database.
function fakeDb(row) {
  return {
    row,
    async query(sql, params) {
      if (/^SELECT/.test(sql.trim())) return { rows: this.row ? [{ ...this.row }] : [] };
      const col = sql.match(/SET (\w+) = \$1/)[1];
      // The guard is honoured only if the SQL actually states it, so a
      // migration that drops its WHERE clause overwrites here as it would
      // on the real table.
      const guarded = new RegExp(`AND ${col} = \\$2`).test(sql);
      if (!this.row || (guarded && this.row[col] !== params[1])) return { rowCount: 0 };
      this.row[col] = params[0];
      return { rowCount: 1 };
    }
  };
}

test('the homepage migration moves the live values and leaves blank sharing tags following the page', async () => {
  const db = fakeDb({ meta_title: HOME_LIVE_2026_10_11.title, meta_description: HOME_LIVE_2026_10_11.description, og_title: '', og_description: '' });
  const report = await applyHomeSeoMetadata(db);
  assert.strictEqual(db.row.meta_title, APPROVED.home.title);
  assert.strictEqual(db.row.meta_description, APPROVED.home.description);
  assert.strictEqual(db.row.og_title, '');
  assert.deepStrictEqual(report.map((r) => r.status), ['updated', 'updated', 'blank, follows the page', 'blank, follows the page']);
  // A redeploy changes nothing.
  const again = await applyHomeSeoMetadata(db);
  assert.deepStrictEqual(again.map((r) => r.status), ['already approved value', 'already approved value', 'blank, follows the page', 'blank, follows the page']);
});

test('a sharing tag that copies the old title moves with it; a CMS edit is left alone and logged', async () => {
  const db = fakeDb({ meta_title: 'Edited by Tom in the CMS', meta_description: HOME_LIVE_2026_10_11.description, og_title: HOME_LIVE_2026_10_11.title, og_description: 'Own sharing line' });
  const report = await applyHomeSeoMetadata(db);
  assert.strictEqual(db.row.meta_title, 'Edited by Tom in the CMS', 'a CMS edit was overwritten');
  assert.match(report[0].status, /^left alone, live value differs: "Edited by Tom in the CMS"/);
  assert.strictEqual(db.row.og_title, APPROVED.home.title);
  assert.strictEqual(db.row.og_description, 'Own sharing line');
});

test('the seed runs the homepage migration, and the homepage title still comes from meta_title', () => {
  assert.match(read('db/seed.js'), /require\('\.\.\/lib\/approvedSeoMetadata'\)\.applyHomeSeoMetadata\(db\)/);
  assert.match(read('server.js'), /currentPage\.og_title/);
});
