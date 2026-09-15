// Scott demonstration: the two ways it made itself look weak in front of a
// visitor, and the rules that stop them.
//
// Both were found by Tom using the live staging build on 15/09/2026, two
// messages apart, and neither was a leak, a permission fault or anything a
// leakage sweep would ever catch. They were the system talking itself down.
//
//   1. Asked how many hours the team would do, it gave a sound estimate and
//      then spent the rest of the reply undermining it: it could not give
//      "certified figures", the total was "a working figure rather than
//      something you can rely on to the hour", and the record it lacked was
//      named twice. The interface had ALREADY printed "LIKELY, NOT CERTAIN"
//      under it from the certainty field, so the reader was told four times.
//
//   2. Asked what date it was, it said "I can't tell you today's real date,
//      but this demonstration's snapshot is dated 29 August 2026". Two
//      defects in one sentence: nothing in the prompt told it the date, and
//      the prompt handed it the words "demonstration" and "snapshot" to
//      reach for when nobody had asked what this was.
//
// These are prompt-rule tests, so what they can prove is bounded: they
// assert the instruction is present and that the specific sentence which
// caused each failure is forbidden. Whether the model then obeys is a live
// question, and the paid pressure suite is where that gets answered.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const orchestrator = require('../../lib/scott/orchestrator');
const workers = require('../../lib/scott/workers');
const { SNAPSHOT_DATE } = require('../../lib/scott/config');

function everyPrompt() {
  const list = Object.values(workers.WORKERS || {})
    .filter((w) => w && w.id && w.id !== 'receptionist')
    .map((w) => ({ id: w.id, prompt: orchestrator.buildWorkerSystemPrompt(w) }));
  list.push({ id: 'receptionist', prompt: orchestrator.buildReceptionistSystemPrompt() });
  return list;
}

describe('it knows what day it is', () => {
  test('every prompt carries today, in words a person would use', () => {
    everyPrompt().forEach(({ id, prompt }) => {
      assert.match(prompt, /TODAY\n/, `${id} has no date block`);
      assert.match(prompt, /Today is \w+day, \d{1,2} \w+ \d{4}\./,
        `${id} has no readable date`);
    });
  });

  test('THE DATE IS COMPUTED PER CALL, NOT AT MODULE LOAD', () => {
    // The failure this guards is worse than the one it replaced. A date
    // interpolated into the module-level GOVERNANCE_PREAMBLE would freeze
    // at the moment the container booted, and these containers stay up for
    // days: the assistant would then state yesterday's date, or last
    // week's, with complete confidence. Absent and honest beats present
    // and wrong.
    const a = orchestrator.todayBlock(new Date('2026-09-15T09:00:00Z'));
    const b = orchestrator.todayBlock(new Date('2026-11-02T09:00:00Z'));
    assert.notEqual(a, b, 'todayBlock ignores the time it is given');
    assert.match(a, /Tuesday, 15 September 2026/);
    assert.match(b, /Monday, 2 November 2026/);
  });

  test('it is told to answer a plain question about the date plainly', () => {
    everyPrompt().forEach(({ id, prompt }) => {
      assert.match(prompt, /answer plainly if somebody simply asks what day it is/,
        `${id} is not told to just answer the question`);
    });
  });
});

describe('records have an age, and it is explained in business language', () => {
  test('the age of the records is stated, using the real compiled date', () => {
    everyPrompt().forEach(({ id, prompt }) => {
      assert.ok(prompt.includes(`last compiled on ${SNAPSHOT_DATE}`),
        `${id} is not told how old its records are`);
    });
  });

  test('"this week" in a record is translated, not repeated', () => {
    // The third defect in the same screenshot, and the subtlest: the
    // records were written as at late August and say things like "this
    // week", so repeating them verbatim in mid-September made Ravi's
    // annual leave "next week" when it had already happened.
    everyPrompt().forEach(({ id, prompt }) => {
      assert.match(prompt, /it means the week that date fell in/, `${id} may repeat a stale "this week"`);
      assert.match(prompt, /you translate it rather than repeating it/, `${id} is not told to translate it`);
    });
  });

  test('the old wording that produced the bad answer is gone', () => {
    everyPrompt().forEach(({ id, prompt }) => {
      assert.ok(!/Treat them as current for this demonstration/.test(prompt),
        `${id} still carries the sentence that invited the demo framing`);
      // The machine-readable snapshot label named a version and Drive. It
      // was in the prompt, so it was in the model's vocabulary.
      assert.ok(!/transcribed from Drive/.test(prompt),
        `${id} can still read the phrase "transcribed from Drive"`);
      assert.ok(!/v0\.2-partial/.test(prompt),
        `${id} can still read the snapshot version number`);
    });
  });
});

describe('it does not volunteer the machinery, and does not lie about it either', () => {
  // These two pull in opposite directions and both have to hold. The
  // honesty rule is Tom's and predates this fix; the quieter rule must
  // narrow WHEN the subject comes up, never whether the truth is told.

  test('THE HONESTY RULE IS UNTOUCHED', () => {
    everyPrompt().forEach(({ id, prompt }) => {
      assert.match(prompt, /If a visitor asks what this is, say so plainly/,
        `${id} has lost the honesty rule`);
      assert.match(prompt, /you must not pretend the demonstration itself is something other than a demonstration/,
        `${id} has lost the rule against pretending`);
    });
  });

  test('and the new rule explicitly says it does not soften it', () => {
    // Without this sentence the two rules sit next to each other and the
    // model picks one. It has to be told which wins.
    everyPrompt().forEach(({ id, prompt }) => {
      assert.match(prompt, /The honesty rule above stands and is not softened by this one/,
        `${id} could read the quieter rule as permission to dodge the question`);
    });
  });

  test('an ordinary business question is named as not being a question about what this is', () => {
    everyPrompt().forEach(({ id, prompt }) => {
      assert.match(prompt, /is not a question about what this is/, `${id} is not told the difference`);
      assert.match(prompt, /what date is it/, `${id} is not given the actual failing example`);
    });
  });

  test('it is told what to say instead about an old figure', () => {
    // A rule that only forbids leaves the model to invent a replacement.
    everyPrompt().forEach(({ id, prompt }) => {
      assert.match(prompt, /the figures I have were put together at the end of August/,
        `${id} is told what not to say and not what to say`);
    });
  });
});

describe('it states a figure once and stops apologising for it', () => {
  test('the say-it-once rule reaches every worker', () => {
    everyPrompt().filter((p) => p.id !== 'receptionist').forEach(({ id, prompt }) => {
      assert.match(prompt, /SAY IT ONCE/, `${id} has no limit on hedging`);
    });
  });

  test('it is told the interface already prints the caveat', () => {
    // This is the argument that makes the rule stick rather than a bare
    // instruction to be brief: the certainty badge is a second statement
    // of the same thing, so prose repeating it is the third and fourth.
    everyPrompt().filter((p) => p.id !== 'receptionist').forEach(({ id, prompt }) => {
      assert.match(prompt, /LIKELY, NOT CERTAIN" badge/, `${id} does not know the badge exists`);
    });
  });

  test('the exact sentence Tom saw is forbidden by name', () => {
    everyPrompt().filter((p) => p.id !== 'receptionist').forEach(({ id, prompt }) => {
      assert.match(prompt, /working figure rather than something you can rely on/,
        `${id} is not shown the sentence to avoid`);
      assert.match(prompt, /never apologise for the estimate you were asked to make/,
        `${id} is not told to stop apologising`);
    });
  });

  test('it still has to caveat once, so this did not overcorrect into false confidence', () => {
    // The opposite failure would be worse: an estimate stated as a filed
    // figure. The rule shortens the caveat, it does not remove it.
    everyPrompt().filter((p) => p.id !== 'receptionist').forEach(({ id, prompt }) => {
      assert.match(prompt, /Set "certainty" to LIKELY/, `${id} no longer marks an estimate as an estimate`);
      assert.match(prompt, /Never present a guess AS the record/, `${id} lost the rule against passing an estimate off as filed`);
    });
  });
});
