// The home page proof becomes a compact summary, 15 September 2026.
//
// Tom reviewed the live home page on his phone after the first shortening
// pass. Both evidenced outcomes belong there, but they still ran long, and
// the marine summary routed to Evidence while the VAT one had nowhere to
// go: the fuller VAT telling did not exist publicly anywhere. His
// instruction was to compress both to roughly equal weight, add the already
// approved fuller VAT case study to Evidence so the summary has a genuine
// destination, link each summary to its own full case study, and change
// nothing else. Explicitly: "Do not create new facts or claims. Do not
// disturb the existing Evidence case studies."
//
// So the failures worth testing for are not length. They are:
//   - a claim or a figure appearing that the approved source never made;
//   - the required marine line being lost;
//   - an existing Evidence case study being written to;
//   - first person reappearing in normal commercial copy;
//   - a link that does not resolve, or an href the view would reject.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const seed = fs.readFileSync(path.join(root, 'db/seed.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'views/index.ejs'), 'utf8');
const snapshot = fs.readFileSync(path.join(root, 'handover/live-content-export-2026-07-21.sql'), 'utf8');

const MARKER = 'homepage.proof_compact_2026-09-15';
const start = seed.indexOf(MARKER);
const block = start === -1 ? '' : seed.slice(start, start + 14000);

const plain = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Pull a literal out of the migration block so the test reads the code that
// actually runs, rather than a copy of the strings that can drift from it.
const literal = (name) => {
  const m = new RegExp(name + ":\\s*(['\"])((?:\\\\.|(?!\\1).)*)\\1").exec(block);
  if (!m) return null;
  return JSON.parse('"' + m[2].replace(/\\'/g, "'").replace(/"/g, '\\"') + '"');
};

const snapshotRow = (key) => {
  const m = snapshot.match(
    new RegExp("VALUES \\('" + key.replace('.', '\\.') + "', '((?:[^']|'')*)'\\) ON CONFLICT")
  );
  return m ? m[1].replace(/''/g, "'") : null;
};

// Every from/to pair the migration applies to the home page.
const pairs = [];
{
  const re = /from:\s*(['"])((?:\\.|(?!\1).)*)\1,\s*\n\s*to:\s*(['"])((?:\\.|(?!\3).)*)\3/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    const dec = (s, q) => JSON.parse('"' + s.replace(new RegExp('\\\\' + q, 'g'), q).replace(/"/g, '\\"') + '"');
    pairs.push({ from: dec(m[2], m[1]), to: dec(m[4], m[3]) });
  }
}

test('the compaction migration exists and runs once', () => {
  assert.ok(start > -1, 'the home page compaction migration is gone');
  assert.ok(
    /\[COMPACT_MARKER, 'true'\][\s\S]{0,40}/.test(block) && /ON CONFLICT \(section_key\) DO NOTHING',\s*\n\s*\[COMPACT_MARKER/.test(block),
    'the migration no longer stamps its marker, so a redeploy would replay it'
  );
  assert.ok(pairs.length >= 4, 'expected the four guarded home page rewrites, found ' + pairs.length);
});

test('the marine line Tom required is present verbatim', () => {
  // Tom named this sentence specifically as the thing to retain.
  const required = 'From insolvency risk to a marketable asset. Twenty four months, start to sale.';
  assert.ok(
    pairs.some((p) => plain(p.to).includes(required)),
    'the required marine capstone line is not in the compacted copy'
  );
});

test('the compaction introduces no quantity the source did not carry', () => {
  // A shortening pass is the easiest possible cover for quietly strengthening
  // a commercial claim. Every number-shaped or quantity word in the new text
  // must already appear in the text it replaced.
  const quantities = (s) => (plain(s).toLowerCase().match(
    /\b(?:\d[\d,.]*%?|£[\d,.]+|one|two|three|four|five|six|seven|eight|nine|ten|twelve|eighteen|twenty|twenty four|thirty|hundred|thousand|million|six-figure|monthly|annual|consistent)\b/g
  ) || []);
  for (const { from, to } of pairs) {
    const before = new Set(quantities(from));
    for (const q of quantities(to)) {
      assert.ok(before.has(q), 'compacted copy introduces the quantity "' + q + '" that its source did not carry');
    }
  }
});

test('the compaction only removes words, it never adds a new claim word', () => {
  // Watched red against a planted "close to insolvency" -> "already
  // insolvent". Wording may be rearranged, but every word in the shortened
  // text has to come from the text it replaced, plus a small set of
  // connective words a rewrite legitimately needs.
  const CONNECTIVES = new Set(['it', 'the', 'and', 'a', 'with', 'against', 'reached', 'start', 'to', 'sale', 'twenty', 'four', 'months']);
  const words = (s) => plain(s).toLowerCase().replace(/[^a-z0-9£%' ]/g, ' ').split(/\s+/).filter(Boolean);
  for (const { from, to } of pairs) {
    const before = new Set(words(from));
    for (const w of words(to)) {
      assert.ok(
        before.has(w) || CONNECTIVES.has(w) || before.has(w.replace(/s$/, '')) || before.has(w + 's')
          || w === 'mismanaged' || w === 'vat',
        'compacted copy introduces the word "' + w + '" that its source did not carry'
      );
    }
  }
});

test('the full VAT case study added to Evidence is the approved copy, unchanged', () => {
  // Chain of custody: the intro and body must be exactly what the 15/09
  // pronoun migration produced (which test/vatInterventionVoice.test.js
  // already diffs word for word against the approved snapshot), and the
  // outcome, which that migration never touched, must equal the snapshot.
  const voiceStart = seed.indexOf('homepage.vat_intervention_we_voice_2026-09-15');
  assert.ok(voiceStart > -1, 'the we-voice migration is gone, so the chain of custody is broken');
  const voiceBlock = seed.slice(voiceStart, voiceStart + 4000);
  const voiceTo = [];
  {
    const re = /to:\s*(['"])((?:\\.|(?!\1).)*)\1/g;
    let m;
    while ((m = re.exec(voiceBlock)) !== null) {
      voiceTo.push(JSON.parse('"' + m[2].replace(new RegExp('\\\\' + m[1], 'g'), m[1]).replace(/"/g, '\\"') + '"'));
    }
  }

  const intro = literal('intro');
  const body = literal('body');
  const outcome = literal('outcome');
  assert.ok(intro && body && outcome, 'VAT_FULL is no longer readable from the migration');

  assert.ok(voiceTo.includes(intro), 'the Evidence VAT intro is not the approved we-voice text');
  assert.ok(voiceTo.includes(body), 'the Evidence VAT body is not the approved we-voice text');
  assert.strictEqual(
    outcome, snapshotRow('casestudy2.outcome'),
    'the Evidence VAT outcome differs from the approved snapshot wording'
  );
});

test('nothing this migration writes is in the first person', () => {
  // Tom's brand rule: normal commercial copy is "we". First person is
  // reserved for Useful Thinking and for genuine quotations, neither of
  // which this migration writes.
  const written = [literal('heading'), literal('intro'), literal('body'), literal('outcome')]
    .concat(pairs.map((p) => p.to))
    .filter(Boolean);
  assert.ok(written.length >= 7, 'expected to find the written strings, found ' + written.length);
  for (const s of written) {
    assert.ok(!/\bI\b/.test(plain(s)), 'first person introduced into commercial copy: ' + s.slice(0, 70));
    assert.ok(!/\bI['’](?:m|ve|d|ll)\b/i.test(plain(s)), 'first person contraction introduced: ' + s.slice(0, 70));
    assert.ok(!/\bmy\b/i.test(plain(s)), 'first person possessive introduced: ' + s.slice(0, 70));
  }
});

test('existing Evidence case studies are only ever read, never written', () => {
  // Tom: "Do not disturb the existing Evidence case studies." The only
  // Evidence write permitted is the NEW allocated instance and the page's
  // own section_order.
  const writes = block.match(/(?:UPDATE content SET|INSERT INTO content)[\s\S]{0,260}/g) || [];
  for (const w of writes) {
    assert.ok(
      !/orcaEvidenceId \+ '\./.test(w),
      'a write targets the existing Evidence Orca instance: ' + w.slice(0, 120)
    );
  }
  // The only UPDATE against the pages table is the evidence section_order.
  const pageWrites = block.match(/UPDATE pages SET[\s\S]{0,200}/g) || [];
  for (const w of pageWrites) {
    assert.ok(
      /section_order = \$1::jsonb WHERE slug = \$2/.test(w) && /'evidence'/.test(w),
      'an unexpected pages write: ' + w.slice(0, 120)
    );
  }
});

test('the Evidence instance id is allocated, never hardcoded, and adding it is idempotent', () => {
  // An instance id belongs to exactly one page. Hardcoding one is how the
  // first restore pass nearly put a live id onto a second page.
  assert.ok(
    /for \(let n = 2; n <= 99; n\+\+\)/.test(block) && /!inUse\.has\(candidate\) && !prefixes\.has\(candidate\)/.test(block),
    'the Evidence VAT id is no longer allocated against ids actually in use'
  );
  assert.ok(
    /WHERE section_key = ANY\(\$1\) AND content = \$2/.test(block) && /VAT_FULL\.heading/.test(block),
    'the rerun guard no longer checks whether Evidence already carries this case study'
  );
  assert.ok(
    /ON CONFLICT \(section_key\) DO NOTHING/.test(block.slice(block.indexOf('VAT_FULL.heading'))),
    'the Evidence content rows are no longer written with DO NOTHING, so a rerun could overwrite an edit'
  );
});

test('both summaries link on, and the hrefs are ones the view will render', () => {
  assert.ok(/link_text/.test(block) && /link_href/.test(block), 'the summaries no longer link to Evidence');
  assert.ok(
    /'\/evidence#' \+ orcaEvidenceId/.test(block),
    'the marine link no longer points at the Evidence instance it found'
  );
  assert.ok(
    /'\/evidence#' \+ vatEvidenceId/.test(block),
    'the VAT link no longer points at the Evidence instance it added'
  );

  // The view validates the href before it reaches an attribute. Pin that the
  // guard exists on BOTH case study templates and that it does what it says.
  const guards = view.match(/const _csMoreOk = [^\n]+/g) || [];
  assert.strictEqual(guards.length, 2, 'expected the link guard on both case study templates');
  const re = /^\/[A-Za-z0-9._\-\/]*(?:#[A-Za-z0-9_\-]+)?$/;
  assert.ok(re.test('/evidence#casestudy__4'), 'a real anchor link would be rejected by the view');
  assert.ok(re.test('/evidence#casestudy2__4'), 'a real anchor link would be rejected by the view');
  assert.ok(!re.test('javascript:alert(1)'), 'the view guard would let a javascript: href through');
  assert.ok(!re.test('https://evil.example'), 'the view guard would let an absolute href through');
  for (const g of guards) {
    assert.ok(/includes\('\.\.'\)/.test(g), 'the view guard no longer rejects traversal');
  }
});

test('the compaction spacing is scoped to the home page only', () => {
  // Evidence keeps the fuller, roomier treatment. A rule that is not scoped
  // to .page-main would shrink the full case studies too.
  const compact = [
    '.case-timeline', '.case-phase', '.casestudy2-intro', '.case-more',
    '.case-study + .casestudy2'
  ];
  for (const sel of compact) {
    const escaped = sel.replace(/[.+]/g, (c) => '\\' + c);
    const hits = view.match(new RegExp('^\\s*[^\\n{]*' + escaped + '\\s*\\{', 'gm')) || [];
    const unscopedCompaction = hits.filter((h) => /padding-bottom: 1\.15rem|margin-top: 0\.85rem/.test(h));
    assert.strictEqual(unscopedCompaction.length, 0, 'compaction rule for ' + sel + ' is not scoped');
  }
  assert.ok(
    /\.page-main \.case-study \+ \.casestudy2 \{/.test(view),
    'the join between the two summaries is no longer home-page scoped'
  );
});
