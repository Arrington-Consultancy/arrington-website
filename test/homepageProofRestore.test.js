// The home page proof restoration, 15 September 2026.
//
// Tom: "Put both Orca Marine and the VAT Intervention back onto the homepage
// as evidenced commercial outcomes... Use only the existing approved evidence
// and copy, with no embellishment."
//
// The migration in db/seed.js that does this had one obvious wrong version and
// one correct one, and the wrong one looks right. Both case study templates sit
// in the home page's deleted_sections, so "pull them out of deleted_sections"
// is the reading that suggests itself. But the committed production snapshot
// shows the base `casestudy` instance is LIVE on the business-consultant-devon
// ads page, and an instance id belongs to exactly one page. These tests pin the
// properties that stop that being reintroduced by a later edit.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const seed = fs.readFileSync(path.join(root, 'db/seed.js'), 'utf8');

// The migration's own block, so these assertions cannot accidentally be
// satisfied by unrelated code elsewhere in a 6,000 line file.
const MARKER = 'homepage.proof_restored_2026-09-15';
const start = seed.indexOf(MARKER);
const block = start === -1 ? '' : seed.slice(start - 4000, start + 7000);

test('the home page proof restoration exists and runs once', () => {
  assert.ok(start > -1, 'the homepage proof restore migration is gone');
  assert.ok(
    /INSERT INTO content \(section_key, content\) VALUES \(\$1, \$2\) ON CONFLICT \(section_key\) DO NOTHING',\s*\n\s*\[PROOF_RESTORE_MARKER/.test(block),
    'the migration no longer stamps its marker, so it would run on every deploy'
  );
});

test('it allocates against every page, not just the home page', () => {
  // This is the property that prevents the collision. The base casestudy
  // instance is live on another page; an id is only free if NO page uses it.
  // Matched with its closing quote and bracket, so a WHERE clause scoping it
  // back to the home page fails this rather than passing on the prefix.
  assert.ok(
    /db\.query\('SELECT slug, section_order FROM pages'\)/.test(block),
    'the migration no longer reads every page unscoped, so it can attach an id another page already uses'
  );
  assert.ok(
    /const inUse = new Set\(\);[\s\S]*?for \(const pg of allPages\)/.test(block),
    'the in-use instance set is no longer built from all pages'
  );
  assert.ok(
    /!inUse\.has\(candidate\)/.test(block),
    'allocation no longer checks the in-use set'
  );
});

test('it never names the bare casestudy instance as a source', () => {
  // casestudy (base) is the Google Ads landing page's section, and its phase 2
  // still contains "constant firefighting", which the Brand Operating System no
  // longer allows. Neither the collision nor that copy may reach the home page.
  const restore = block.slice(block.indexOf('const RESTORE = ['), block.indexOf('];', block.indexOf('const RESTORE = [')) + 2);
  assert.ok(restore.includes('casestudy__4'), 'the Orca Marine source is no longer the Evidence page version');
  assert.ok(
    !/sources: \[[^\]]*'casestudy'[^\]]*\]/.test(restore),
    "the bare casestudy instance was named as a source; it is live on the ads page and carries superseded copy"
  );
  // casestudy2 (the VAT Intervention) is the one that may be attached as it
  // stands, because it is on no page.
  assert.ok(/sources: \['casestudy2'/.test(restore), 'the VAT Intervention source changed');
});

test('an orphaned source is attached without writing any copy', () => {
  const orphanBranch = block.slice(block.indexOf('if (!inUse.has(source))'), block.indexOf('// Live on another page'));
  assert.ok(orphanBranch.length > 0, 'the orphan branch is gone');
  assert.ok(
    !/INSERT INTO content|UPDATE content/.test(orphanBranch),
    'the orphan path now writes content, which breaks "use only the existing approved copy"'
  );
});

test('a live source is copied, never moved off the page it is on', () => {
  const copyBranch = block.slice(block.indexOf('// Live on another page'), block.indexOf('order.push(allocated)'));
  assert.ok(copyBranch.length > 0, 'the copy branch is gone');
  assert.ok(
    /ON CONFLICT \(section_key\) DO NOTHING/.test(copyBranch),
    'the copy now overwrites existing rows at the destination'
  );
  assert.ok(
    !/UPDATE pages/.test(copyBranch),
    'the copy branch now edits a page row, so it could strip the section off the page it came from'
  );
});

test('it leaves a home page that already carries a case study alone', () => {
  assert.ok(
    /if \(order\.some\(\(id\) => isInstance\.test\(id\)\)\)/.test(block),
    'the already-on-the-page guard is gone, so a redeploy could add a second copy'
  );
});

test('the committed production snapshot still supports the sources this migration names', () => {
  // The sources were identified from this file rather than guessed. If the
  // snapshot is ever regenerated and these instances move, that is a decision
  // to re-take, not something to discover from a blank section on the live site.
  const snap = fs.readFileSync(path.join(root, 'handover/live-content-export-2026-07-21.sql'), 'utf8');
  assert.ok(/'casestudy__4\.heading', '<strong>The Insolvent Turnaround<\/strong>'/.test(snap),
    'casestudy__4 is no longer the Insolvent Turnaround in the committed snapshot');
  assert.ok(/'casestudy2\.heading', 'The VAT Intervention'/.test(snap),
    'casestudy2 is no longer the VAT Intervention in the committed snapshot');
});
