const { test, describe } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const path = require('path');

const { resolveWaiSeedMode, waiSeedWrites } = require('../lib/waiSeedMode');

const REVISION = '2026-08-15-999-conversion-page';
const MARKER_KEY = 'seed.websites_and_ai_revision';

// A stub with just enough shape to answer the two queries resolveWaiSeedMode
// makes, so the mode logic can be tested without a database.
function stubDb({ pageExists, marker }) {
  return {
    calls: 0,
    async query(sql) {
      this.calls++;
      if (sql.includes('FROM pages')) return { rows: pageExists ? [{ '?column?': 1 }] : [] };
      if (sql.includes('FROM content')) return { rows: marker === null ? [] : [{ content: marker }] };
      throw new Error('unexpected query: ' + sql);
    }
  };
}

describe('resolveWaiSeedMode', () => {
  test('page absent is fresh, whatever the marker says', async () => {
    assert.strictEqual(
      await resolveWaiSeedMode(stubDb({ pageExists: false, marker: null }), REVISION, MARKER_KEY),
      'fresh'
    );
    assert.strictEqual(
      await resolveWaiSeedMode(stubDb({ pageExists: false, marker: REVISION }), REVISION, MARKER_KEY),
      'fresh'
    );
  });

  test('page present with no marker is adopt (production before this gate shipped)', async () => {
    assert.strictEqual(
      await resolveWaiSeedMode(stubDb({ pageExists: true, marker: null }), REVISION, MARKER_KEY),
      'adopt'
    );
  });

  test('marker matching the current revision is skip', async () => {
    assert.strictEqual(
      await resolveWaiSeedMode(stubDb({ pageExists: true, marker: REVISION }), REVISION, MARKER_KEY),
      'skip'
    );
  });

  test('marker is compared after trimming, so stray whitespace still skips', async () => {
    assert.strictEqual(
      await resolveWaiSeedMode(stubDb({ pageExists: true, marker: `  ${REVISION}\n` }), REVISION, MARKER_KEY),
      'skip'
    );
  });

  test('a different marker is replay, the deliberate re-assert path', async () => {
    assert.strictEqual(
      await resolveWaiSeedMode(stubDb({ pageExists: true, marker: '2026-08-03-old' }), REVISION, MARKER_KEY),
      'replay'
    );
  });

  test('an empty marker value is replay, not skip', async () => {
    assert.strictEqual(
      await resolveWaiSeedMode(stubDb({ pageExists: true, marker: '' }), REVISION, MARKER_KEY),
      'replay'
    );
  });

  test('the page check short-circuits: fresh never reads the marker', async () => {
    const db = stubDb({ pageExists: false, marker: null });
    await resolveWaiSeedMode(db, REVISION, MARKER_KEY);
    assert.strictEqual(db.calls, 1);
  });
});

describe('waiSeedWrites', () => {
  test('only fresh and replay may write', () => {
    assert.strictEqual(waiSeedWrites('fresh'), true);
    assert.strictEqual(waiSeedWrites('replay'), true);
    assert.strictEqual(waiSeedWrites('adopt'), false);
    assert.strictEqual(waiSeedWrites('skip'), false);
  });
});

describe('db/seed.js declares the revision the tests assert against', () => {
  test('WAI_SEED_REVISION and the marker key match this file', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'db', 'seed.js'), 'utf8');
    assert.ok(
      src.includes(`const WAI_SEED_REVISION = '${REVISION}'`),
      'WAI_SEED_REVISION in db/seed.js has moved; update this test deliberately, ' +
      'because bumping it overwrites live CMS content on the next deploy'
    );
    assert.ok(src.includes(`const WAI_REVISION_KEY = '${MARKER_KEY}'`));
  });

  test('the three content-writing migrations are all gated', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'db', 'seed.js'), 'utf8');
    const gated = src.match(/if \(waiSeedWrites &&/g) || [];
    assert.strictEqual(gated.length, 4, 'expected all four write branches to be gated on waiSeedWrites');
  });
});

// ---------------------------------------------------------------------------
// Two-pass integration check against a real database.
//
// Skipped unless WAI_SEED_TEST_DATABASE_URL points at a database this test is
// allowed to wipe. It runs `node db/seed.js` as a child process, which is the
// exact command Railway runs on deploy, so it exercises the real path rather
// than a reimplementation of it.
// ---------------------------------------------------------------------------
const TEST_DB_URL = process.env.WAI_SEED_TEST_DATABASE_URL;

describe('two-pass seed', { skip: TEST_DB_URL ? false : 'set WAI_SEED_TEST_DATABASE_URL to run' }, () => {
  const repoRoot = path.join(__dirname, '..');
  const runSeed = () => execFileSync('node', ['db/seed.js'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL: TEST_DB_URL,
      SESSION_SECRET: 'test-secret',
      // Only consumed on the very first pass, when the users table is empty.
      NAT_PASSWORD: 'test-only-nat-password',
      TOM_PASSWORD: 'test-only-tom-password'
    }
  });

  const withClient = async (fn) => {
    const { Client } = require('pg');
    const c = new Client({ connectionString: TEST_DB_URL });
    await c.connect();
    try { return await fn(c); } finally { await c.end(); }
  };

  const getContent = (c, key) =>
    c.query('SELECT content FROM content WHERE section_key = $1', [key])
      .then((r) => (r.rows[0] ? r.rows[0].content : null));

  test('pass 1 on a fresh database builds the page, pass 2 preserves a CMS edit', async () => {
    await withClient(async (c) => {
      await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    });

    // ---- Pass 1: fresh database ----
    const firstRun = runSeed();
    assert.match(firstRun, /Websites and AI seed mode: fresh/);

    const afterFirst = await withClient(async (c) => {
      const page = await c.query(
        "SELECT section_order, meta_title FROM pages WHERE slug = 'websites-and-ai'"
      );
      assert.strictEqual(page.rows.length, 1, 'fresh seed must create the websites-and-ai page');
      const order = page.rows[0].section_order;
      assert.strictEqual(order.length, 5, 'page should end up with the five approved sections');

      const heroId = order[0];
      const wsaId = order[1];
      return {
        heroId,
        wsaId,
        marker: await getContent(c, MARKER_KEY),
        heading: await getContent(c, `${heroId}.heading`),
        wsaItem7: await getContent(c, `${wsaId}.item_7`),
        contactHeading: await getContent(c, 'wai.contact_heading'),
        metaTitle: page.rows[0].meta_title
      };
    });

    assert.strictEqual(afterFirst.marker, REVISION, 'fresh run must stamp the revision marker');
    assert.strictEqual(afterFirst.heading, 'A business website built around how you work');
    assert.strictEqual(
      afterFirst.wsaItem7,
      'Enquiry and registration forms built around what the team actually needs'
    );
    assert.strictEqual(afterFirst.contactHeading, 'Tell us what you want to build.');
    assert.ok(afterFirst.metaTitle.length > 0, 'fresh run must set the page SEO title');

    // ---- Simulate a CMS edit, of every kind the old code used to revert ----
    const EDITED_HEADING = 'CMS EDIT: a heading Tom typed himself';
    const EDITED_ITEM = 'CMS EDIT: a proof bullet Tom typed himself';
    const EDITED_CONTACT = 'CMS EDIT: a contact heading Tom typed himself';
    const EDITED_META = 'CMS EDIT: a meta title Tom typed himself';

    await withClient(async (c) => {
      await c.query('UPDATE content SET content = $1 WHERE section_key = $2', [EDITED_HEADING, `${afterFirst.heroId}.heading`]);
      await c.query('UPDATE content SET content = $1 WHERE section_key = $2', [EDITED_ITEM, `${afterFirst.wsaId}.item_7`]);
      await c.query('UPDATE content SET content = $1 WHERE section_key = $2', [EDITED_CONTACT, 'wai.contact_heading']);
      await c.query("UPDATE pages SET meta_title = $1 WHERE slug = 'websites-and-ai'", [EDITED_META]);
      // Hiding a section is stored on the page row, and was also being reset
      // on every boot.
      await c.query(
        "UPDATE pages SET hidden_sections = $1::jsonb WHERE slug = 'websites-and-ai'",
        [JSON.stringify([afterFirst.wsaId])]
      );
    });

    // ---- Pass 2: the next deploy ----
    const secondRun = runSeed();
    assert.match(secondRun, /Websites and AI seed mode: skip \(no content writes\)/);

    await withClient(async (c) => {
      assert.strictEqual(await getContent(c, `${afterFirst.heroId}.heading`), EDITED_HEADING);
      assert.strictEqual(await getContent(c, `${afterFirst.wsaId}.item_7`), EDITED_ITEM);
      assert.strictEqual(await getContent(c, 'wai.contact_heading'), EDITED_CONTACT);

      const page = await c.query(
        "SELECT meta_title, hidden_sections FROM pages WHERE slug = 'websites-and-ai'"
      );
      assert.strictEqual(page.rows[0].meta_title, EDITED_META);
      assert.deepStrictEqual(page.rows[0].hidden_sections, [afterFirst.wsaId]);
    });

    // ---- Pass 3: adopt. An existing database with the marker removed, which
    //      is exactly what production looks like on the first deploy after
    //      this gate ships. It must stamp without touching content. ----
    await withClient(async (c) => {
      await c.query('DELETE FROM content WHERE section_key = $1', [MARKER_KEY]);
    });

    const thirdRun = runSeed();
    assert.match(thirdRun, /Websites and AI seed mode: adopt \(no content writes\)/);

    await withClient(async (c) => {
      assert.strictEqual(await getContent(c, MARKER_KEY), REVISION, 'adopt must stamp the marker');
      assert.strictEqual(await getContent(c, `${afterFirst.heroId}.heading`), EDITED_HEADING, 'adopt must not overwrite content');
      assert.strictEqual(await getContent(c, 'wai.contact_heading'), EDITED_CONTACT);
    });
  });
});
