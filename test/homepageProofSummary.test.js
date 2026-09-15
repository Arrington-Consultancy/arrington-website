// The home page proof becomes a summary, 15 September 2026.
//
// Tom inspected the live home page on his phone: restoring the two case
// studies was right, but it put two FULL case studies before the existing
// twenty-years proof block and the testimonials, which reads as repetition
// and makes the page far too long. His instruction was to keep both
// evidenced outcomes as concise summaries, preserve the strongest evidenced
// problem, intervention and result, and route on to Evidence for the detail.
//
// The risk in any "shorten this" task is not length, it is a claim quietly
// appearing that the source never made, or an evidenced figure being lost.
// These tests are aimed at exactly those two failures.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const seed = fs.readFileSync(path.join(root, 'db/seed.js'), 'utf8');
const snapshot = fs.readFileSync(path.join(root, 'handover/live-content-export-2026-07-21.sql'), 'utf8');
const defaults = require('../db/defaults');

const MARKER = 'homepage.proof_summarised_2026-09-15';
const start = seed.indexOf(MARKER);
const block = start === -1 ? '' : seed.slice(start, start + 9000);

const plain = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// The approved Evidence-page wording, from the committed snapshot. This is
// the corpus the summary is allowed to draw on.
const snapshotRow = (key) => {
  const m = snapshot.match(
    new RegExp("VALUES \\('" + key.replace('.', '\\.') + "', '((?:[^']|'')*)'\\) ON CONFLICT")
  );
  return m ? m[1].replace(/''/g, "'") : null;
};

test('the summary migration exists and runs once', () => {
  assert.ok(start > -1, 'the home page summary migration is gone');
  assert.ok(/\[SUMMARY_MARKER, 'true'\]/.test(block), 'the migration no longer stamps its marker');
});

test('Orca is guarded against its LIVE Evidence source, not a hardcoded string', () => {
  // The home page rows were copied from the Evidence page, so "is this still
  // an untouched copy" is the only guard that stays true if either side is
  // edited. A hardcoded old value would silently stop matching.
  assert.ok(/const ORCA_SOURCE = 'casestudy__4'/.test(block), 'the Orca source instance changed');
  assert.ok(
    /SELECT content FROM content WHERE section_key = \$1', \[ORCA_SOURCE \+ '\.' \+ field\]/.test(block),
    'the Orca guard no longer reads the live source value'
  );
});

test('the Evidence page is only ever read, never written', () => {
  // Tom: "Do not alter the full Evidence-page case studies."
  const writes = block.match(/(UPDATE content SET|INSERT INTO content)[\s\S]{0,220}/g) || [];
  for (const w of writes) {
    assert.ok(
      !/ORCA_SOURCE \+ '\.'/.test(w) || /SELECT/.test(w.slice(0, 30)),
      'a write in the summary migration targets the Evidence-page instance'
    );
  }
  assert.ok(
    !/UPDATE content SET content = \$1 WHERE section_key = \$2 AND content = \$3',\s*\n\s*\[to, ORCA_SOURCE/.test(block),
    'the migration writes to the Evidence-page instance'
  );
});

test('the summary invents no quantity the approved source did not state', () => {
  // Numbers and money are where an invented claim actually does damage.
  //
  // KNOWN LIMIT, stated rather than papered over: this checks the corpus as a
  // whole, so a quantity moved from one case study into the other passes here
  // ("eighteen" is real, just not Orca's). Swapping Orca's twenty four months
  // for eighteen is caught by the next test, which pins the figures per case.
  // Neither test is sufficient alone; both were watched red against a planted
  // change before being trusted.
  const shortCopy = [
    ...(block.match(/phase_[123]_body: '([^']*)'/g) || []),
    defaults['casestudy2.intro'], defaults['casestudy2.body'], defaults['casestudy2.outcome']
  ].join(' ');

  const source = [
    snapshotRow('casestudy__4.phase_1_body'),
    snapshotRow('casestudy__4.phase_2_body'),
    snapshotRow('casestudy__4.phase_3_body'),
    snapshotRow('casestudy2.intro'),
    snapshotRow('casestudy2.body'),
    snapshotRow('casestudy2.outcome')
  ].filter(Boolean).join(' ');
  assert.ok(source.length > 400, 'the approved source copy could not be read from the snapshot');

  const quantities = plain(shortCopy).match(
    /£[\d,]+|\b\d[\d,]*\b|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty|thirty)\b|\bsix-figure\b|\bseven-figure\b/gi
  ) || [];
  assert.ok(quantities.length > 0, 'no quantities found at all, so this check is proving nothing');

  for (const q of new Set(quantities.map((x) => x.toLowerCase()))) {
    assert.ok(
      source.toLowerCase().includes(q),
      `the summary states "${q}", which the approved source copy never did`
    );
  }
});

test('the evidence Tom named by hand survives in the summary', () => {
  const orca = (block.match(/phase_[123]_body: '([^']*)'/g) || []).join(' ');
  // "insolvency risk to stable profit and becoming a marketable/saleable
  // asset over 24 months", in his words.
  for (const fact of ['insolvency', 'Twenty four months', 'monthly profit', 'sold at a profit', 'marketable asset', 'Princess Yachts']) {
    assert.ok(orca.includes(fact), `the Orca summary lost the evidenced detail "${fact}"`);
  }

  const vat = [defaults['casestudy2.body'], defaults['casestudy2.outcome']].join(' ');
  for (const fact of ['VAT', 'HMRC', 'six-figure cash flow collapse', 'eighteen months']) {
    assert.ok(vat.includes(fact), `the VAT summary lost the evidenced detail "${fact}"`);
  }
});

test('the summary is actually shorter than what it replaced', () => {
  const orcaShort = plain((block.match(/phase_[123]_body: '([^']*)'/g) || []).join(' ')).length;
  const orcaLong = plain([
    snapshotRow('casestudy__4.phase_1_body'),
    snapshotRow('casestudy__4.phase_2_body'),
    snapshotRow('casestudy__4.phase_3_body')
  ].join(' ')).length;
  assert.ok(orcaShort < orcaLong * 0.8, `the Orca summary is not materially shorter (${orcaShort} vs ${orcaLong})`);

  const vatShort = plain([defaults['casestudy2.intro'], defaults['casestudy2.body'], defaults['casestudy2.outcome']].join(' ')).length;
  const vatLong = plain([snapshotRow('casestudy2.intro'), snapshotRow('casestudy2.body'), snapshotRow('casestudy2.outcome')].join(' ')).length;
  assert.ok(vatShort < vatLong * 0.8, `the VAT summary is not materially shorter (${vatShort} vs ${vatLong})`);
});

test('the home page still routes on to Evidence', () => {
  // It already did, through the twenty-years block's own button, which is why
  // the migration adds nothing when it finds one. If that check is removed the
  // page gains a duplicate call to action, which is the repetition complained of.
  assert.ok(
    /SELECT 1 FROM content WHERE section_key = ANY\(\$1\) AND content = 'evidence'/.test(block),
    'the Evidence-route check is gone or no longer scoped to the home page'
  );
  assert.ok(
    /order\.map\(\(id\) => id \+ '\.button_link'\)/.test(block),
    'the route check no longer looks at the home page sections only'
  );
});
