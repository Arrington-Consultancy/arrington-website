// The VAT Intervention in "we" voice, 15 September 2026.
//
// Tom's brand decision: "normal Arrington website/commercial copy must use
// 'we', not 'I'. First person is reserved for Useful Thinking where it is
// deliberately Tom's personal voice."
//
// The case study was restored to the home page the day before, attached
// exactly as it stood, which left two first-person sentences there. These
// tests pin the correction and, more importantly, pin that it was a PRONOUN
// change and nothing else: the instruction was to preserve the facts, the
// meaning and the evidence exactly, and a "voice fix" is the easiest possible
// cover for quietly improving a commercial claim.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const seed = fs.readFileSync(path.join(root, 'db/seed.js'), 'utf8');
const defaults = require('../db/defaults');

const MARKER = 'homepage.vat_intervention_we_voice_2026-09-15';
const start = seed.indexOf(MARKER);
const block = start === -1 ? '' : seed.slice(start - 2500, start + 4000);

// Pronouns that mark Tom's personal voice. "we"/"our" are the house voice and
// are not listed. Deliberately excludes possessive "mine"/"me" inside quoted
// testimonial speech, which this file never touches.
const FIRST_PERSON = /\b(I|I'm|I've|I'll|my)\b/;

test('the home page VAT Intervention copy carries no first person', () => {
  for (const key of ['casestudy2.intro', 'casestudy2.body', 'casestudy2.outcome', 'casestudy2.heading']) {
    const value = defaults[key];
    assert.ok(typeof value === 'string' && value.length, `${key} is missing from the seeded defaults`);
    assert.ok(
      !FIRST_PERSON.test(value.replace(/<[^>]+>/g, ' ')),
      `${key} is back in first person, against the brand decision of 15/09/2026: ${value}`
    );
  }
});

test('the migration exists, runs once, and lets a CMS edit win', () => {
  assert.ok(start > -1, 'the we-voice migration is gone');
  assert.ok(
    /UPDATE content SET content = \$1 WHERE section_key = \$2 AND content = \$3/.test(block),
    'the migration no longer matches the exact old value, so it could overwrite a CMS edit'
  );
  assert.ok(
    /\[WE_VOICE_MARKER, 'true'\]/.test(block),
    'the migration no longer stamps its marker, so it would run on every deploy'
  );
});

test('the rewrite changes pronouns and nothing else', () => {
  // Pull the real from/to pairs out of the migration rather than restating
  // them here, so this test cannot pass against a migration that says
  // something different from what this file asserts.
  const voiceOnly = block.slice(block.indexOf('const REWRITES = ['), block.indexOf('];', block.indexOf('const REWRITES = [')));
  const rewrites = [...voiceOnly.matchAll(/from:\s*(['"])([\s\S]*?)\1,\s*\n\s*to:\s*(['"])([\s\S]*?)\3/g)]
    .map((m) => ({ from: m[2], to: m[4] }));

  assert.strictEqual(rewrites.length, 2, 'expected exactly the two rewritten rows');

  for (const { from, to } of rewrites) {
    assert.ok(FIRST_PERSON.test(from), 'a rewrite claims to fix copy that was not in first person');
    assert.ok(!FIRST_PERSON.test(to), `the replacement is still first person: ${to}`);

    // Word for word, the only differences may be a first-person pronoun
    // becoming a first-person-plural one. Anything else is a copy change
    // wearing a voice fix as a disguise.
    const a = from.split(/\s+/);
    const b = to.split(/\s+/);
    assert.strictEqual(a.length, b.length, 'the rewrite added or removed words');
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      assert.ok(
        /^I$/.test(a[i]) && /^[Ww]e$/.test(b[i]),
        `the rewrite changed "${a[i]}" to "${b[i]}", which is not a pronoun correction`
      );
    }
  }
});

test('every fact in the restored case study survives the rewrite', () => {
  const copy = [defaults['casestudy2.intro'], defaults['casestudy2.body'], defaults['casestudy2.outcome']].join(' ');
  for (const fact of [
    // 'Tristan' is deliberately absent: the home page carries a summary as of
    // 15/09/2026, and the named client belongs to the fuller telling.
    'over a year',
    'eighteen months',
    'reconciliation process',
    'cash reserve',
    'HMRC',
    'six-figure cash flow collapse'
  ]) {
    assert.ok(copy.includes(fact), `the evidence "${fact}" was lost in the voice correction`);
  }
});

test('the outcome row was deliberately left alone', () => {
  // It already read "We corrected the filing...". Touching it would have been
  // an unrequested edit to the commercial claim.
  assert.ok(
    defaults['casestudy2.outcome'].startsWith('We corrected the filing'),
    'the outcome row was rewritten; it was already in house voice and is not part of this correction'
  );
});
