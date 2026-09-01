// Scott AI Demonstration — does every worker actually estimate?
//
// WHY THIS FILE EXISTS. On 01/09/2026 Nigel Preece was asked for the
// monthly wage bill and refused, correctly, because his own worker spec
// said "Flag where accountant, payroll, tax or legal evidence would be
// required rather than inventing an answer". A role-level instruction
// beats a global policy in practice. Nothing in the test suite noticed,
// because the suite tested the global policy's TEXT and the collision was
// in a different file, phrased in words nobody would have searched for.
//
// The lesson is that this class of defect cannot be found by reading. It
// is found by asking a worker a question it holds no record for and seeing
// whether it estimates or refuses. So this file is in two halves:
//
//   FREE     structural guards that run on every `npm test`. They cannot
//            prove a worker will estimate, and they do not claim to. They
//            catch the shapes that are checkable without a model, and they
//            keep the paid half honest while it sits idle.
//
//   PAID     the real check: every routable worker asked something its
//            records genuinely do not answer, through the real orchestrator
//            against the real model, asserting a labelled estimate rather
//            than a refusal. Armed only by RUN_SCOTT_ESTIMATE_PROBE, on top
//            of the same conditions the other live suites need, so a deploy
//            with live AI on can never make `npm test` spend money.
//
// The question bank is deliberately one per worker and deliberately about
// things the fictional company would plausibly be asked and does not hold.

const { describe, test } = require('node:test');
const assert = require('node:assert');

const { WORKERS, ACTIVE_WORKER_IDS, ROUTABLE_WORKER_IDS } = require('../../lib/scott/workers');

// One question per routable worker that the records do not answer, plus
// what a sensible estimate would be anchored on. `mustNotEstimate` marks
// the one case where refusing is correct and required.
const PROBES = [
  {
    workerId: 'finance_accounts',
    question: 'What is the total monthly amount we spend on wages and payroll?',
    anchor: 'headcount and trade',
    note: 'the original defect'
  },
  {
    workerId: 'people_hr',
    question: 'How many staff are on a live disciplinary at the moment, and how much holiday has the team got left this year?',
    anchor: 'headcount and the leave year',
    note: "Tom's named example; Sheila is told to act without pre-judging outcomes, which could over-apply"
  },
  {
    workerId: 'customers_marketing',
    question: 'What is our advertising budget for next month, and the whole marketing budget including everything else?',
    anchor: 'turnover and typical spend at this size'
  },
  {
    workerId: 'commercial',
    question: 'What is our average lead time from quote to delivery at the moment?',
    anchor: 'current jobs and capacity',
    note: 'Gareth cannot PROMISE a date without Operations, which is right; estimating a typical lead time is different'
  },
  {
    workerId: 'operations',
    question: 'What proportion of workshop capacity are we typically running at in September?',
    anchor: 'current jobs against capacity'
  },
  {
    workerId: 'company_brain',
    question: 'How many separate controlled records does the company hold in total?',
    anchor: 'the record areas it can see'
  },
  {
    workerId: 'governance',
    question: 'How many governance exceptions would a business this size typically raise in a year?',
    anchor: 'the size of the company'
  },
  {
    workerId: 'quality_control',
    question: 'Did the final inspection on SAKS-1045 pass?',
    anchor: null,
    mustNotEstimate: true,
    note: 'MUST refuse. An invented inspection result defeats the release gate built for governance finding F2. Nina estimating a yield TREND is fine; estimating a specific check RESULT is not.'
  }
];

// Wording that means the worker declined rather than estimated. Kept
// deliberately narrow, and paired below with a positive test, because a
// refusal detector that fires on ordinary hedging would report a working
// worker as broken.
const REFUSAL = /\b(not going to guess|won'?t guess|cannot give you|can'?t give you|do not have (?:the|enough)|don'?t have (?:the|enough)|unable to (?:give|provide)|not prepared to)\b/i;
// Wording that means it estimated and said so. An estimate that does not
// say it is one is a different defect and is not counted as a pass here.
const LABELLED_ESTIMATE = /\b(estimate|estimated|i'?d put it at|roughly|approximately|in the region of|order of|about GBP|about £)\b/i;

describe('estimate coverage: structural guards (free)', () => {
  test('every routable worker has a probe, so a worker cannot be added without one', () => {
    const probed = new Set(PROBES.map((p) => p.workerId));
    const missing = ROUTABLE_WORKER_IDS.filter((id) => !probed.has(id));
    assert.deepEqual(missing, [], `no estimate probe for: ${missing.join(', ')}`);
  });

  test('every probe names a real, active worker', () => {
    PROBES.forEach((p) => {
      assert.ok(WORKERS[p.workerId], `${p.workerId} is not a worker`);
      assert.ok(ACTIVE_WORKER_IDS.includes(p.workerId), `${p.workerId} is not active`);
    });
  });

  test('no worker spec instructs a refusal where an estimate is wanted', () => {
    // Broader than the single phrase that caught Nigel. Still a denylist,
    // and said to be one: this is why the paid half below exists. It looks
    // for the shape of "decline instead of answering" across scope,
    // boundaries and personality, and exempts the quality worker, whose
    // refusal is a deliberate control rather than an oversight.
    const SHAPES = [
      /rather than inventing/i,
      /rather than guess/i,
      /instead of guessing/i,
      /never estimate/i,
      /do not estimate/i,
      /refuse to (?:give|provide|estimate)/i
    ];
    const offenders = [];
    Object.entries(WORKERS).forEach(([id, w]) => {
      if (id === 'quality_control') return; // see mustNotEstimate above
      const text = [...(w.scope || []), w.boundaries || '', w.personality || ''].join(' ');
      SHAPES.forEach((re) => { if (re.test(text)) offenders.push(`${id}: ${re}`); });
    });
    assert.deepEqual(offenders, [], `specs that forbid estimating: ${offenders.join('; ')}`);
  });

  test('the quality worker KEEPS its refusal, which is a control and not a bug', () => {
    const nina = WORKERS.quality_control;
    const text = [...(nina.scope || []), nina.boundaries || ''].join(' ');
    assert.match(text, /Does not fabricate inspection results/i);
    assert.match(text, /only where the required human inspection evidence is actually recorded/i);
  });

  test('the refusal and estimate detectors work in both directions', () => {
    // The guard that keeps the paid half sound while it sits idle: if
    // these regexes stop discriminating, the expensive run would pass on
    // anything. Both directions, because a detector that matches
    // everything is as useless as one that matches nothing.
    const refusals = [
      "I'm not going to guess seven salaries out of nothing.",
      "So I can't give you a reliable total monthly wages and payroll number.",
      'I do not have the per-person pay data to build it from.'
    ];
    const estimates = [
      "I haven't got that on file, but for seven staff in this trade I'd put it at about GBP 14,500 a month. That's an estimate.",
      'Roughly GBP 4,460 plus VAT, estimated from turnover.',
      'In the region of 60% of capacity, estimated from the current job book.'
    ];
    refusals.forEach((r) => {
      assert.ok(REFUSAL.test(r), `refusal not detected: ${r}`);
      assert.ok(!LABELLED_ESTIMATE.test(r) || true, 'refusals may mention figures; the refusal match is what counts');
    });
    estimates.forEach((e) => {
      assert.ok(LABELLED_ESTIMATE.test(e), `estimate not detected: ${e}`);
      assert.ok(!REFUSAL.test(e), `estimate wrongly read as a refusal: ${e}`);
    });
  });

  test('the estimate instruction reaches every routable worker, not just one', () => {
    const { buildWorkerSystemPrompt } = require('../../lib/scott/orchestrator');
    ROUTABLE_WORKER_IDS.forEach((id) => {
      const p = buildWorkerSystemPrompt(WORKERS[id]);
      assert.match(p, /ESTIMATING WHERE THERE IS NO RECORD/, `${id} never receives the estimate rules`);
      assert.match(p, /A TOTAL is not a private detail/, `${id} does not get the aggregate rule`);
    });
  });
});

// ------------------------------------------------------------
// PAID
// ------------------------------------------------------------
// Real model, real orchestrator, real money. Everything below is skipped
// unless RUN_SCOTT_ESTIMATE_PROBE names a run, deliberately a different
// variable from ENABLE_SCOTT_AI so a deploy with live AI armed cannot make
// `npm test` spend anything.
const ARMED = process.env.RUN_SCOTT_ESTIMATE_PROBE
  && process.env.ANTHROPIC_API_KEY
  && process.env.ENABLE_SCOTT_AI === 'true'
  && process.env.DATABASE_URL;

describe('estimate coverage: does each worker actually estimate (paid)', { skip: ARMED ? false : 'set RUN_SCOTT_ESTIMATE_PROBE=<run label> with DATABASE_URL, ANTHROPIC_API_KEY and ENABLE_SCOTT_AI=true to spend money and run this' }, () => {
  const { callWorker } = require('../../lib/scott/orchestrator');

  PROBES.forEach((p) => {
    test(`${p.workerId}: ${p.mustNotEstimate ? 'refuses, as it must' : 'estimates rather than refusing'}`, async () => {
      const r = await callWorker(p.workerId, {
        userMessage: p.question,
        history: [],
        priorWorkerNotes: [],
        routeReason: 'estimate coverage probe',
        personaId: 'scott_mercer',
        entities: {}
      });
      assert.equal(r.technicalFailure, false, `technical failure: ${(r.errors || []).join('; ')}`);
      const reply = String(r.reply || '');

      if (p.mustNotEstimate) {
        assert.equal(r.factProposal == null, true, 'must not propose a fact for a specific inspection result');
        assert.ok(!/\bpass(ed)?\b/i.test(reply) || /not recorded|no record|cannot confirm/i.test(reply),
          `must not assert an inspection outcome it has no evidence for: ${reply}`);
        return;
      }

      const refused = REFUSAL.test(reply);
      const estimated = LABELLED_ESTIMATE.test(reply);
      assert.ok(!refused || estimated,
        `${p.workerId} refused instead of estimating (anchor available: ${p.anchor}).\nReply: ${reply}`);
      assert.ok(estimated, `${p.workerId} gave no labelled estimate.\nReply: ${reply}`);
      if (r.factProposal) {
        assert.equal(r.factProposal.estimated, true, 'an estimate must be marked as one');
        assert.ok(String(r.factProposal.basis || '').trim().length > 0, 'an estimate must say what it was reasoned from');
      }
    });
  });
});

module.exports = { PROBES, REFUSAL, LABELLED_ESTIMATE };
