// Scott AI Demonstration: the Company Brain preview line.
//
// Every case here is taken from something the old code actually put on
// screen. The three defects it is pinning:
//
//   1. `Object.values(rec)[1]` picked whichever field came second, so real
//      record areas previewed as "8", "3750", "SAKS22V" and "Customers".
//   2. `.slice(0, 90)` cut mid-word with no ellipsis: "public marketin",
//      "before a failure oc", "demonstration use onl".
//   3. Nothing distinguished a preview that was cut from one that was not,
//      so a reader could not tell a truncated sentence from a short one.
//
// The last suite is the one that matters most: this module must never be
// given a way to choose which record it previews, because the caller
// choosing a CLEARED record is what stops the preview line becoming a way
// around the permission model.

const { describe, test } = require('node:test');
const assert = require('node:assert');

const preview = require('../../lib/scott/brainPreview');
const clearance = require('../../lib/scott/clearance');
const contextBuilders = require('../../lib/scott/data/contextBuilders');

describe('what it chooses to show', () => {
  test('a reference is carried in front of the description, not instead of it', () => {
    const record = { domain: 'jobs_ops', count: 8, name: 'Frame repair backlog', ref: 'SAKS-1041' };
    // Either half alone is worse: the ref is a single meaningless token,
    // and the description without it cannot be looked up.
    assert.equal(preview.previewOf(record), 'SAKS-1041 · Frame repair backlog');
  });

  test('a reference with nothing to describe it is still shown', () => {
    assert.equal(preview.previewOf({ domain: 'jobs_ops', ref: 'SAKS-1041' }), 'SAKS-1041');
  });

  test('a long identifier is not treated as a reference prefix', () => {
    // Guards the MAX_REFERENCE bound: a sentence sitting in a 'ref' field
    // must not be pinned in front of the real description.
    const record = {
      domain: 'jobs_ops',
      ref: 'a very long value that is clearly not a reference number at all',
      name: 'Frame repair backlog'
    };
    assert.equal(preview.previewOf(record), 'Frame repair backlog');
  });

  test('a bare count is never shown as a summary', () => {
    // The exact shape that produced "8" on the live screen.
    const record = { domain: 'marketing_performance', count: 8 };
    assert.equal(preview.previewOf(record), '');
  });

  test('a bare code or name is never shown as a summary', () => {
    ['SAKS22V', 'Customers', 'Tony Marsh', '3750'].forEach((value) => {
      const record = { domain: 'vehicle_status', code: value };
      assert.equal(preview.previewOf(record), value === 'Tony Marsh' ? 'Tony Marsh' : '',
        `${value} should not become a preview unless it reads as prose`);
    });
  });

  test('the longest sentence in the record is used when no descriptive field exists', () => {
    const record = {
      domain: 'continuity',
      owner: 'Scott Mercer',
      order: '1. Safety. 2. Customer property already in our care. 3. Existing promised jobs.'
    };
    assert.match(preview.previewOf(record), /^1\. Safety\./);
  });

  test('domain and source are never previewed, however long they are', () => {
    const record = {
      domain: 'finance_full',
      source: '07A Management Accounts, Cash Position and Debtor Ledger, full controlled record'
    };
    assert.equal(preview.previewOf(record), '');
  });

  test('a record that is not an object produces nothing rather than throwing', () => {
    [null, undefined, 'text', 42].forEach((bad) => {
      assert.equal(preview.previewOf(bad), '');
    });
  });
});

describe('how it cuts', () => {
  const long = 'No customer-identifiable story, image, quote or testimonial may be used in public marketing unless the customer has given written permission';

  test('a long preview is cut on a word boundary and marked as cut', () => {
    const out = preview.truncate(long);
    assert.ok(out.endsWith('…'), 'a cut preview must say it was cut');
    assert.ok(out.length <= preview.MAX_PREVIEW + 1);
    // The old bug: the cut landing inside a word.
    const body = out.slice(0, -1);
    assert.ok(long.startsWith(body), 'the kept text must be a real prefix of the original');
    assert.ok(long[body.length] === ' ' || long[body.length] === undefined
      || /[,;:.]/.test(long[body.length]), `cut mid-word: "${body.slice(-20)}"`);
  });

  test('a short preview is left exactly as it is, with no ellipsis', () => {
    const short = 'Yarn stock on the bench';
    assert.equal(preview.truncate(short), short);
    assert.ok(!preview.truncate(short).includes('…'));
  });

  test('trailing punctuation is not left stranded before the ellipsis', () => {
    const out = preview.truncate('Protect people and customer property first, then protect existing customer commitments, recover critical work');
    assert.doesNotMatch(out, /[,;:.\s]…$/);
  });

  test('one very long word still yields something readable rather than a stub', () => {
    const out = preview.truncate(`${'x'.repeat(200)}`);
    assert.ok(out.length > 40, 'a single long word must not collapse the preview');
  });
});

describe('against the real record set', () => {
  const all = contextBuilders.allDeepFactRecords();
  const visible = clearance.filterAndRedact('scott_mercer', null, all);
  const domains = [...new Set(visible.map((r) => r.domain))];

  test('no area on the owner\'s Company Brain previews as a bare number or code', () => {
    const bad = [];
    domains.forEach((d) => {
      const line = preview.previewFor(visible.find((r) => r.domain === d));
      if (line && !/\s/.test(line)) bad.push(`${d}: "${line}"`);
    });
    // A single-token preview is exactly the "8" / "SAKS22V" defect.
    assert.deepEqual(bad, [], `single-token previews: ${bad.join(', ')}`);
  });

  test('no preview ends mid-word', () => {
    const bad = [];
    domains.forEach((d) => {
      const line = preview.previewFor(visible.find((r) => r.domain === d));
      if (line.length > preview.MAX_PREVIEW && !line.endsWith('…')) bad.push(d);
    });
    assert.deepEqual(bad, []);
  });

  test('most areas do get a preview, so the fix did not just blank the column', () => {
    const withPreview = domains.filter((d) => preview.previewFor(visible.find((r) => r.domain === d)));
    // Refusing to invent a summary means some areas legitimately have
    // none. Asserting a majority keeps "show nothing" honest rather than
    // letting it become the answer everywhere.
    assert.ok(withPreview.length > domains.length / 2,
      `only ${withPreview.length} of ${domains.length} areas have a preview`);
  });
});

describe('what it must never be able to do', () => {
  test('it cannot reach the record set: it only ever sees the record it is handed', () => {
    const src = require('fs').readFileSync(require.resolve('../../lib/scott/brainPreview.js'), 'utf8');
    assert.doesNotMatch(src, /require\(/, 'the preview module must import nothing');
    assert.doesNotMatch(src, /allDeepFactRecords|filterAndRedact|db\.|query\(/,
      'the preview module must not be able to select which record it previews');
  });
});
