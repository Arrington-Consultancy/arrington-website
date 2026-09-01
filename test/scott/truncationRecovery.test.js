// Scott AI Demonstration — a cut-off reply must not reach a visitor as a
// technical problem.
//
// Found live on 01/09/2026, twice, in front of Tom. The receptionist was
// cut off at her 512-token ceiling, the retry correctly doubled it, and
// the second reply came back as "Unexpected token in JSON at position
// 1045". A parse failure took a different branch that breaks immediately,
// so a reply that had simply run out of room twice was reported as
// "Derek Haines hit a technical problem". Nothing was wrong with the
// model or the schema; we had not left space for the answer.
//
// The existing truncation tests did not catch this because they cover the
// stop_reason path, where the model tells us it was cut off. This is the
// case where it does not, and the shape of the text is the only evidence.

const { describe, test } = require('node:test');
const assert = require('node:assert');
const { looksUnterminated, extractJson } = require('../../lib/scott/orchestrator');

describe('telling a cut-off reply from a malformed one', () => {
  test('an object that stopped mid-flight is recognised', () => {
    assert.equal(looksUnterminated('{"reply":"we should look at the'), true, 'cut off inside a string');
    assert.equal(looksUnterminated('{"reply":"ok","route":[{"worker":"finance"'), true, 'cut off inside an array');
    assert.equal(looksUnterminated('{"reply":"ok"'), true, 'never closed the object');
  });

  test('a complete object is not mistaken for one', () => {
    assert.equal(looksUnterminated('{"reply":"ok"}'), false);
    assert.equal(looksUnterminated('{"reply":"ok","route":[{"worker":"finance"}]}'), false);
  });

  test('braces and quotes INSIDE a string do not count, which is where a naive check breaks', () => {
    assert.equal(looksUnterminated('{"reply":"a } inside a string"}'), false);
    assert.equal(looksUnterminated('{"reply":"an escaped \\" quote"}'), false);
    assert.equal(looksUnterminated('{"reply":"braces {{{ and ]]] in prose"}'), false);
  });

  test('genuinely malformed JSON is NOT treated as truncation, so it fails fast as before', () => {
    // The important negative. Retrying malformed output with more room
    // just spends money to fail again more slowly.
    assert.equal(looksUnterminated('not json at all'), false);
    assert.equal(looksUnterminated('{"reply": }'), false);
    assert.equal(looksUnterminated(''), false);
    assert.equal(looksUnterminated(null), false);
    assert.equal(looksUnterminated(undefined), false);
  });

  test('the text that failed to parse travels with the error', () => {
    // Without this the retry has only the parser's message, which says
    // where it gave up and nothing about whether the object ever finished.
    let caught = null;
    try { extractJson('{"reply":"cut off here'); } catch (err) { caught = err; }
    assert.ok(caught, 'a malformed reply must still throw');
    assert.equal(typeof caught.rawText, 'string');
    assert.equal(looksUnterminated(caught.rawText), true);
  });

  test('a fenced reply still parses, and carries its raw text when it does not', () => {
    assert.deepEqual(extractJson('```json\n{"reply":"ok"}\n```'), { reply: 'ok' });
    let caught = null;
    try { extractJson('```json\n{"reply":"cut\n```'); } catch (err) { caught = err; }
    assert.ok(caught && typeof caught.rawText === 'string');
  });
});

describe('the receptionist has room to route across nine workers', () => {
  test('her ceiling is above the 512 that was cutting her off', () => {
    // Pinned as a number rather than described, because this is the exact
    // value that failed live and the regression is silent: a lower ceiling
    // does not error, it just truncates on the broad questions.
    const src = require('fs').readFileSync(require.resolve('../../lib/scott/orchestrator.js'), 'utf8');
    const m = src.match(/validateReceptionistReply,\s*(\d+)\)/);
    assert.ok(m, 'could not find the receptionist ceiling');
    assert.ok(Number(m[1]) >= 1024, `receptionist ceiling is ${m[1]}, which is what was truncating her`);
  });
});
