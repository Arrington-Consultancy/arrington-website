// Evolving fictional business memory — "SCOTT EVOLVING FICTIONAL BUSINESS
// MEMORY - APPROVED DESIGN CHANGE - 31 AUGUST 2026". Covers, per that
// document's own required test list: first-time fact creation, repeat-
// question consistency, equivalent wording, unreasonable-question
// refusal, existing-evidence precedence, simultaneous first-write
// conflict, and clearance isolation. Drive-export provenance and
// specialist/Ruth isolation are covered in the neighbouring
// driveExport.test.js and orchestratorMemory.integration.test.js.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const memory = require('../../../lib/scott/memory/factLedger');

// ------------------------------------------------------------
// Pure logic — no database needed, always runs.
// ------------------------------------------------------------
describe('canonicalizeQuestion (equivalent wording)', () => {
  test('word order and case do not change the key', () => {
    assert.equal(
      memory.canonicalizeQuestion('What is our marketing budget'),
      memory.canonicalizeQuestion('Our marketing budget, what is it')
    );
  });

  test('genuinely different questions produce different keys', () => {
    assert.notEqual(
      memory.canonicalizeQuestion('what is our marketing budget'),
      memory.canonicalizeQuestion('who is our usual glue supplier')
    );
  });

  test('materially equivalent phrasing collapses to the same key (the doc\'s own example shape)', () => {
    const a = memory.canonicalizeQuestion("what's our usual glue supplier");
    const b = memory.canonicalizeQuestion('our usual supplier for glue');
    assert.equal(a, b);
    assert.equal(a, 'glue-supplier');
  });
});

describe('classifyReasonableness', () => {
  test('refuses a domain outside the curated allowlist', () => {
    const result = memory.classifyReasonableness({ workerId: 'operations', personaId: 'scott_mercer', domain: 'finance_full', canonicalQuestion: 'what is our overdraft limit' });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'domain_not_eligible');
  });

  test('refuses a worker proposing a domain it does not itself hold, even if the domain is eligible', () => {
    // marketing_performance is eligible in principle, but the operations
    // worker's own WORKER_DOMAINS list does not include it (that domain
    // belongs to customers_marketing, and separately to commercial).
    const result = memory.classifyReasonableness({ workerId: 'operations', personaId: 'scott_mercer', domain: 'marketing_performance', canonicalQuestion: 'what is our usual boosted-post budget' });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'worker_not_authorised_for_domain');
  });

  // Governance review 1 (31/08/2026), finding M1 (HIGH): the persona leg
  // of "narrowest wins" was entirely missing. This is the exact reachable
  // scenario the reviewer demonstrated: Chloe Reed's own specialist,
  // customers_marketing, holds marketing_performance, but her PERSONA
  // deliberately does not (see the comment on her PERSONA_DOMAINS entry
  // in clearance.js — "not what the company pays to acquire a lead").
  test('refuses a persona proposing a domain their OWN clearance withholds, even though the worker they asked holds it (M1)', () => {
    const result = memory.classifyReasonableness({ workerId: 'customers_marketing', personaId: 'chloe_reed', domain: 'marketing_performance', canonicalQuestion: 'what is our usual boosted-post budget' });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'persona_not_authorised_for_domain');
  });

  test('allows the same worker/domain when the ASKING persona does hold the domain (the positive case the M1 fix must not break)', () => {
    // tony_marsh holds marketing_performance (07E, given deliberately to
    // Tony and not Chloe) and customers_marketing holds it as a worker
    // permission — both legs satisfied.
    const result = memory.classifyReasonableness({ workerId: 'customers_marketing', personaId: 'tony_marsh', domain: 'marketing_performance', canonicalQuestion: 'what is our usual boosted-post budget' });
    assert.equal(result.allowed, true);
  });

  test('fails closed (refuses) when personaId is missing entirely, even for an otherwise-eligible worker/domain pair', () => {
    // No default to the owner persona here (M5's fail-closed direction
    // applied consistently to the creation gate too) — unlike this is
    // unreachable in production (clearance.getEffectivePersonaId never
    // returns falsy), a future caller that forgets to pass one must not
    // silently get owner-level creation rights.
    const result = memory.classifyReasonableness({ workerId: 'operations', domain: 'suppliers_ops', canonicalQuestion: 'who is our usual glue supplier' });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'persona_not_authorised_for_domain');
  });

  for (const [label, question] of [
    ['tax', 'what did we file on our last VAT return'],
    ['bank/DLA', "what is Scott's DLA balance"],
    ['insurance', 'what is our public liability cover'],
    ['personal data', "what is Mike's home address"],
    ['external platform activity', 'how many Instagram followers do we actually have'],
    ['consequential promise', 'do we guarantee a refund on every repair'],
    ['predictive', 'what will our marketing budget be next year']
  ]) {
    test(`refuses a reserved topic even inside an eligible domain (${label})`, () => {
      const result = memory.classifyReasonableness({ workerId: 'customers_marketing', personaId: 'tony_marsh', domain: 'marketing_performance', canonicalQuestion: question });
      assert.equal(result.allowed, false, `expected refusal for: ${question}`);
      assert.match(result.reason, /^reserved_topic:/);
    });
  }

  // Governance review 1, finding M2: these eight exact rephrasings
  // evaded every pattern before the fix (see
  // review/scott-evolving-memory-governance-review-1-2026-08-31.md).
  // Pinned individually, verbatim, so a future edit to the patterns
  // cannot silently reopen any of them.
  for (const [label, question] of [
    ['predictive, seasonal, no "will be"', 'what will our glue costs look like in the run up to spring'],
    ['predictive, "will...charge"', 'what will our timber supplier charge us in the autumn'],
    ['unsigned agreement, no "signed"', 'what are the minimum order terms in our agreement with the timber merchant'],
    ['unsigned arrangement, no "signed"', 'is there a written arrangement with our usual glue supplier about payment terms'],
    ['discretionary discount, no "discount"', 'do we always knock a bit off the price for regulars'],
    ['free extra, no "free of charge"', 'do we throw in free delivery for repeat customers'],
    ['fabricated analytics, "conversion rate"', 'what is our usual conversion rate from boosted posts'],
    ['fabricated analytics, "see our posts"', 'how many people usually see our posts each month']
  ]) {
    test(`M2 regression: previously-evading rephrasing is now refused (${label})`, () => {
      const result = memory.classifyReasonableness({ workerId: 'customers_marketing', personaId: 'tony_marsh', domain: 'marketing_performance', canonicalQuestion: question });
      assert.equal(result.allowed, false, `expected refusal for: ${question}`);
      assert.match(result.reason, /^reserved_topic:/);
    });
  }

  test('refuses a question too vague to be worth establishing as a fact', () => {
    const result = memory.classifyReasonableness({ workerId: 'operations', personaId: 'tony_marsh', domain: 'suppliers_ops', canonicalQuestion: 'why' });
    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'too_vague');
  });

  test('allows a genuinely ordinary, low-consequence question in an eligible domain both the worker and the persona hold', () => {
    const result = memory.classifyReasonableness({ workerId: 'operations', personaId: 'tony_marsh', domain: 'suppliers_ops', canonicalQuestion: 'who is our usual glue supplier' });
    assert.equal(result.allowed, true);
    // 'who', 'is', 'our' and 'usual' are all stopwords, leaving glue/supplier.
    assert.equal(result.canonicalKey, 'glue-supplier');
  });
});

// ------------------------------------------------------------
// Database-backed behaviour.
// ------------------------------------------------------------
const DB_AVAILABLE = !!process.env.DATABASE_URL;

describe('evolving fictional memory ledger (real database)', { skip: DB_AVAILABLE ? false : 'set DATABASE_URL to run' }, () => {
  const db = require('../../../db/pool');
  const created = [];

  after(async () => {
    if (created.length) {
      await db.query('DELETE FROM scott_memory_facts WHERE id = ANY($1::int[])', [created]);
    }
  });

  function unique(label) {
    return `${label} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  test('a sensible missing low-consequence fact is created, answered and persisted', async () => {
    const question = unique('what is our usual varnish supplier');
    const result = await memory.establishFact({
      workerId: 'operations',
      domain: 'suppliers_ops',
      canonicalQuestion: question,
      answerText: 'Newton Abbot Timber and Finishes, our usual account for varnish and lacquer.',
      askedByPersonaId: 'tony_marsh'
    });
    assert.equal(result.ok, true);
    assert.equal(result.created, true);
    assert.ok(result.fact.id);
    created.push(result.fact.id);
    assert.equal(result.fact.provenance, 'ai_generated_fictional_memory');
    assert.equal(result.fact.status, 'runtime_generated');

    const stored = await db.query('SELECT * FROM scott_memory_facts WHERE id = $1', [result.fact.id]);
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].domain, 'suppliers_ops');
  });

  test('asking the same question again returns the same fact, not a new one', async () => {
    const question = unique('what is our usual glue for chair frames');
    const first = await memory.establishFact({
      workerId: 'operations', domain: 'suppliers_ops', canonicalQuestion: question,
      answerText: 'Titebond III, kept in the workshop stores.', askedByPersonaId: 'tony_marsh'
    });
    created.push(first.fact.id);

    const second = await memory.establishFact({
      workerId: 'operations', domain: 'suppliers_ops', canonicalQuestion: question,
      // Deliberately a DIFFERENT answer, to prove model variation cannot
      // change a stored fact once one exists.
      answerText: 'Gorilla Glue, bought from the hardware shop.', askedByPersonaId: 'tony_marsh'
    });
    assert.equal(second.ok, true);
    assert.equal(second.created, false);
    assert.equal(second.fact.id, first.fact.id);
    assert.equal(second.fact.answer, first.fact.answer, 'the ORIGINAL answer must win, not the second model call\'s');

    const rows = await db.query('SELECT * FROM scott_memory_facts WHERE domain = $1 AND canonical_key = $2', ['suppliers_ops', memory.canonicalizeQuestion(question)]);
    assert.equal(rows.rows.length, 1, 'exactly one row must exist, not two');
  });

  test('materially equivalent wording retrieves the same canonical fact', async () => {
    const base = unique('what glue do we normally use for frames');
    const first = await memory.establishFact({
      workerId: 'operations', domain: 'suppliers_ops', canonicalQuestion: base,
      answerText: 'Titebond III.', askedByPersonaId: 'tony_marsh'
    });
    created.push(first.fact.id);

    // Same significant words, reordered and reworded around them, plus the
    // same uniqueness marker so this test's own facts don't collide with
    // another run's.
    const marker = base.match(/\d+-[a-z0-9]+$/)[0];
    const rewordedKey = memory.canonicalizeQuestion(`normally frames glue use ${marker}`);
    assert.equal(rewordedKey, memory.canonicalizeQuestion(base), 'the two phrasings must canonicalise identically for this test to prove anything');

    const found = await memory.findActiveFact('suppliers_ops', rewordedKey);
    assert.ok(found, 'the reworded question must retrieve the same stored fact');
    assert.equal(found.id, first.fact.id);
  });

  test('an unreasonable question is refused rather than invented, and nothing is persisted', async () => {
    const question = unique("what is Scott's bank balance");
    const before = (await db.query('SELECT COUNT(*)::int AS n FROM scott_memory_facts')).rows[0].n;
    const result = await memory.establishFact({
      workerId: 'finance_accounts', domain: 'finance_full', canonicalQuestion: question,
      answerText: 'made up figure', askedByPersonaId: 'scott_mercer'
    });
    assert.equal(result.ok, false);
    const after = (await db.query('SELECT COUNT(*)::int AS n FROM scott_memory_facts')).rows[0].n;
    assert.equal(after, before, 'a refused fact must not be persisted');
  });

  test('two simultaneous first questions cannot establish contradictory facts', async () => {
    const question = unique('what is our usual thread colour for repairs');
    const [a, b] = await Promise.all([
      memory.establishFact({ workerId: 'operations', domain: 'suppliers_ops', canonicalQuestion: question, answerText: 'Natural cream, matches most frames.', askedByPersonaId: 'tony_marsh' }),
      memory.establishFact({ workerId: 'operations', domain: 'suppliers_ops', canonicalQuestion: question, answerText: 'Charcoal grey, our other standard.', askedByPersonaId: 'tony_marsh' })
    ]);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    created.push(a.fact.id);
    if (b.fact.id !== a.fact.id) created.push(b.fact.id);

    // Exactly one row must exist for this canonical key, and both callers
    // must agree on which answer it holds.
    assert.equal(a.fact.id, b.fact.id, 'both concurrent callers must resolve to the SAME row');
    assert.equal(a.fact.answer, b.fact.answer);

    const rows = await db.query('SELECT * FROM scott_memory_facts WHERE domain = $1 AND canonical_key = $2', ['suppliers_ops', memory.canonicalizeQuestion(question)]);
    assert.equal(rows.rows.length, 1, 'the unique index must have let exactly one insert through');
  });

  test('clearance isolation: a generated fact is visible only to a persona/worker pair that already holds the domain', async () => {
    const question = unique('what is our usual foam density for seat cushions');
    const result = await memory.establishFact({
      workerId: 'operations', domain: 'materials', canonicalQuestion: question,
      answerText: 'Medium-firm 35kg/m3 foam, our standard for seat cushions.', askedByPersonaId: 'ellie_park'
    });
    created.push(result.fact.id);

    // ellie_park holds 'materials' in PERSONA_DOMAINS and operations holds
    // it in WORKER_DOMAINS — visible.
    const visibleToEllie = await memory.findRelevantFacts('ellie_park', 'operations', question);
    assert.ok(visibleToEllie.some((f) => f.id === result.fact.id), 'ellie_park via operations should see a materials fact');

    // mike_evans does not hold 'materials' at all — invisible regardless
    // of which worker is asked.
    const visibleToMike = await memory.findRelevantFacts('mike_evans', 'operations', question);
    assert.ok(!visibleToMike.some((f) => f.id === result.fact.id), 'mike_evans must not see a materials fact — his persona does not hold that domain');

    // Governance review 1, finding M5: a falsy personaId used to default
    // to the owner (fail open). It must now see nothing at all, not the
    // owner's full view.
    const visibleToNoPersona = await memory.findRelevantFacts('', 'operations', question);
    assert.deepEqual(visibleToNoPersona, [], 'an empty/missing personaId must fail closed to nothing, never the owner view');
    const visibleToUndefinedPersona = await memory.findRelevantFacts(undefined, 'operations', question);
    assert.deepEqual(visibleToUndefinedPersona, [], 'an undefined personaId must fail closed to nothing, never the owner view');
  });

  test('legitimate supersession retains history rather than overwriting the row in place', async () => {
    const question = unique('what is our usual varnish sheen');
    const first = await memory.establishFact({
      workerId: 'operations', domain: 'suppliers_ops', canonicalQuestion: question,
      answerText: 'Satin, our long-standing default.', askedByPersonaId: 'tony_marsh'
    });
    created.push(first.fact.id);

    const superseded = await memory.supersedeFact(first.fact.id, {
      answerText: 'Matt, switched over after a genuine change of supplier stock.',
      workerId: 'operations', askedByPersonaId: 'tony_marsh', reasonForChange: 'supplier changed their standard stock finish'
    });
    assert.equal(superseded.ok, true);
    created.push(superseded.fact.id);
    assert.equal(superseded.fact.supersedesId, first.fact.id);
    assert.equal(superseded.fact.version, 2);

    const oldRow = await db.query('SELECT status FROM scott_memory_facts WHERE id = $1', [first.fact.id]);
    assert.equal(oldRow.rows[0].status, 'superseded', 'the old fact must be retained, marked superseded, never deleted');

    const active = await memory.findActiveFact('suppliers_ops', memory.canonicalizeQuestion(question));
    assert.equal(active.id, superseded.fact.id, 'only the new fact should be active now');
  });
});
