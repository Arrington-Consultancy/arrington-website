// Question routing, and the permission legs it must never substitute for.
//
// Routing decides which lane a question is handed to. It is plumbing, not
// a permission: the lane's own source classes and sensitivity ceiling,
// and the human clearance leg, still decide what a reader may see. These
// tests pin both halves, because the tempting way to "fix" a routing miss
// is to widen the lane, and that would be the wrong repair.
const test = require('node:test');
const assert = require('node:assert/strict');

const repo = require('../../lib/workspace/repo');
const orchestrator = require('../../lib/workspace/orchestrator');
const { routeToLane, buildLaneContext } = orchestrator;

// A small stand-in record set covering every source class the routing
// tests care about. buildLaneContext reads through repo.listRecords, so
// swapping that one function exercises the real filtering with no
// database.
const RECORDS = [
  { record_key: 'brand-operating-system', source_class: 'authority', sensitivity: 'commercial', doc_status: 'current', title: 'Brand OS' },
  { record_key: 'current-operating-position', source_class: 'strategy', sensitivity: 'commercial', doc_status: 'current', title: 'Operating position' },
  { record_key: 'canonical-worker-register', source_class: 'worker_register', sensitivity: 'standard', doc_status: 'current', title: 'Worker register' },
  { record_key: 'live-commercial-opportunities', source_class: 'opportunity', sensitivity: 'confidential', doc_status: 'current', title: 'Live opportunities' },
  { record_key: 'project-pembroke-street', source_class: 'opportunity', sensitivity: 'confidential', doc_status: 'current', title: 'Pembroke Street' },
  { record_key: 'technical-state-production', source_class: 'technical_state', sensitivity: 'commercial', doc_status: 'current', title: 'Production state' },
  { record_key: 'project-scott-demonstration', source_class: 'project', sensitivity: 'commercial', doc_status: 'current', title: 'Scott pointer' }
];

const OPPORTUNITY_KEYS = ['live-commercial-opportunities', 'project-pembroke-street'];

function withStubbedRecords(fn) {
  const real = repo.listRecords;
  repo.listRecords = async () => RECORDS.map((r) => ({ ...r }));
  return Promise.resolve()
    .then(fn)
    .finally(() => { repo.listRecords = real; });
}

const keysOf = (records) => records.map((r) => r.record_key);

test('an ordinary question about opportunities reaches the Opportunity Builder lane', () => {
  // The defect: the rule read /\b(opportunit|...)\b/i, so the stem had to
  // be followed by a word boundary and "opportunity"/"opportunities"
  // never matched. Both spellings, and the plain noun on its own, are
  // pinned here because all three are how a person actually asks.
  for (const q of [
    'What commercial opportunities are live right now?',
    'Is there any opportunity worth chasing this week?',
    'opportunities',
    'Which opportunities need action?'
  ]) {
    assert.equal(routeToLane(q), 'opportunity_builder', `expected the opportunity lane for: ${q}`);
  }
});

test('the wordings that already worked still route to the same lane', () => {
  for (const q of ['What is in the pipeline?', 'Any new leads?', 'Tell me about that prospect', 'Where is the proposal up to?']) {
    assert.equal(routeToLane(q), 'opportunity_builder', `regressed on: ${q}`);
  }
});

test('a cleared reader asking about opportunities can use the authorised opportunity records', async () => {
  await withStubbedRecords(async () => {
    const records = await buildLaneContext({ clearanceId: 'owner_admin', laneId: routeToLane('What commercial opportunities are live right now?') });
    for (const key of OPPORTUNITY_KEYS) {
      assert.ok(keysOf(records).includes(key), `expected ${key} to reach the prompt`);
    }
  });
});

test('an ordinary general question gains no opportunity context', async () => {
  // Routing more opportunity questions into the lane must not leak the
  // other way: a question that matches no lane still gets the narrow
  // general context, which carries no opportunity source class at all.
  await withStubbedRecords(async () => {
    for (const q of ['What is the brand voice?', 'Who is on the worker register?', 'What changed since I last looked?']) {
      assert.equal(routeToLane(q), null, `expected no lane for: ${q}`);
      const keys = keysOf(await buildLaneContext({ clearanceId: 'owner_admin', laneId: routeToLane(q) }));
      for (const key of OPPORTUNITY_KEYS) {
        assert.ok(!keys.includes(key), `general context must not carry ${key} (question: ${q})`);
      }
    }
  });
});

test('a reader without the confidential ceiling still receives no opportunity material, however the question is routed', async () => {
  // The human clearance leg is applied before the lane leg and neither
  // may substitute for the other. ws_restricted holds 'standard' only,
  // so it must come away empty-handed even on the question that now
  // routes straight at the lane holding the material.
  await withStubbedRecords(async () => {
    const laneId = routeToLane('What commercial opportunities are live right now?');
    assert.equal(laneId, 'opportunity_builder');
    const keys = keysOf(await buildLaneContext({ clearanceId: 'ws_restricted', laneId }));
    for (const key of OPPORTUNITY_KEYS) {
      assert.ok(!keys.includes(key), `${key} must never reach a reader without the confidential ceiling`);
    }
    // Positive control, per this project's own rule that a test asserting
    // only absence passes against a system showing nobody anything: the
    // same call for a cleared reader does return the material, and the
    // restricted reader is not simply getting an empty context.
    const cleared = keysOf(await buildLaneContext({ clearanceId: 'owner_admin', laneId }));
    for (const key of OPPORTUNITY_KEYS) {
      assert.ok(cleared.includes(key), `positive control failed: ${key} should reach a cleared reader`);
    }
    assert.ok(keys.length > 0, 'the restricted reader should still see the records it IS cleared for, not an empty context');
    // And an unknown clearance fails closed rather than open.
    const unknown = keysOf(await buildLaneContext({ clearanceId: 'no-such-clearance', laneId }));
    for (const key of OPPORTUNITY_KEYS) {
      assert.ok(!unknown.includes(key), `${key} must not reach an unrecognised clearance`);
    }
  });
});

test('routing an opportunity question widens nothing about the lane itself', () => {
  // The repair had to be in the routing rule, not the register. If a
  // later change "fixes" a routing miss by giving the lane a new source
  // class or a higher ceiling, this fails.
  const { laneById } = require('../../lib/workspace/lanes');
  const lane = laneById('opportunity_builder');
  assert.deepEqual([...lane.sourceClasses].sort(), ['authority', 'opportunity', 'strategy', 'worker_register']);
  assert.equal(lane.sensitivityCeiling, 'confidential');
});

test('every other lane still answers its own single-topic trigger', () => {
  // Deliberately narrower than it first reads. This establishes that a
  // question naming ONLY another lane's subject still reaches that lane.
  // It does NOT establish that no question anywhere changed lane, and an
  // earlier version of this test claimed exactly that while passing --
  // see the mixed-topic test below for what actually changed.
  const expected = [
    ['How is the Google Ads campaign doing?', 'google_ads'],
    ['Is the website deploy healthy?', 'website_hosting'],
    ['What does the Drive brain index say?', 'brain_keeper'],
    ['What does the constitution say about permissions?', 'governance_assurance'],
    ['Draft a LinkedIn post', 'social_content_builder'],
    ['Are we cited by AI anywhere?', 'ai_recommendation_visibility'],
    ['Tell me about the Scott demonstration', 'ai_demonstration_builder'],
    ['What is in the workspace control pack?', 'ai_workspace_builder']
  ];
  for (const [q, laneId] of expected) {
    assert.equal(routeToLane(q), laneId, `routing moved for: ${q}`);
  }
});

test('a question naming another lane keeps that lane, even when it also says opportunity', async () => {
  // This is why the word sits in a trailing rule instead of the third
  // one. Five of the six lanes after that rule are capped at
  // 'commercial' (governance_assurance is the exception), so pre-empting
  // brain_keeper, social_content_builder or ai_workspace_builder with a
  // confidential-ceiling lane would raise the ceiling for those question
  // classes: task necessity is a permission leg, and widening it is
  // exactly what this change is not allowed to do.
  const cases = [
    ['What does governance say about approving an opportunity?', 'governance_assurance'],
    ['Which Drive document holds the opportunity record?', 'brain_keeper'],
    ['Draft a LinkedIn post about the opportunities we won', 'social_content_builder']
  ];
  for (const [q, laneId] of cases) {
    assert.equal(routeToLane(q), laneId, `a specific lane must win over the weak opportunity signal: ${q}`);
  }

  // And the ceiling really is the thing at stake: prove the reroute we
  // avoided would have raised it, so this test cannot pass vacuously.
  const { laneById } = require('../../lib/workspace/lanes');
  assert.equal(laneById('social_content_builder').sensitivityCeiling, 'commercial');
  assert.equal(laneById('opportunity_builder').sensitivityCeiling, 'confidential');

  await withStubbedRecords(async () => {
    const keys = keysOf(await buildLaneContext({ clearanceId: 'owner_admin', laneId: routeToLane('Draft a LinkedIn post about the opportunities we won') }));
    for (const key of OPPORTUNITY_KEYS) {
      assert.ok(!keys.includes(key), `a social-content question must not pull ${key} into the prompt`);
    }
  });
});

test('the strong opportunity keywords keep their original high precedence', () => {
  // 'pipeline', 'proposal' and 'leads' stayed in the third rule and have
  // always pre-empted the later lanes. That behaviour is untouched by
  // this change, and pinning it stops a future tidy-up from moving them
  // into the trailing rule and quietly changing routing.
  assert.equal(routeToLane('What does governance say about the pipeline?'), 'opportunity_builder');
  assert.equal(routeToLane('Which Drive document holds the proposal?'), 'opportunity_builder');

  // Pinned deliberately as a known limit, not as an endorsement: the
  // trailing placement stops this change ADDING an instance of the
  // ceiling pre-emption, and does not remove the pre-existing ones. The
  // same sentence with 'leads' instead of 'opportunities' still reaches
  // a confidential-ceiling lane. Out of scope for a bounded fix to one
  // word; flagged for its own decision.
  assert.equal(routeToLane('Draft a LinkedIn post about the leads we won'), 'opportunity_builder');
});

test('a question about opportunities leaves the general context, and so loses finance', async () => {
  // The one real consequence, and a cost this change imposes rather than
  // one it merely reveals. lanes.js holds 'finance' at least privilege:
  // governance_assurance is the only lane granted it, so for every other
  // lane the general no-lane context is the only route to it. This
  // question used to reach that context and see the banking records, and
  // now does not. The repair is not to hand finance to this lane.
  const { LANES, laneById } = require('../../lib/workspace/lanes');
  assert.deepEqual(
    LANES.filter((l) => l.sourceClasses.includes('finance')).map((l) => l.id),
    ['governance_assurance'],
    'the set of lanes holding finance changed; the note in orchestrator.js about this consequence must be revisited'
  );
  assert.ok(
    !laneById('opportunity_builder').sourceClasses.includes('finance'),
    'the opportunity lane must not have been handed finance to paper over this'
  );
  assert.equal(routeToLane('Where are the opportunities to reduce our recurring costs?'), 'opportunity_builder');
});

test('the Scott demonstration is untouched by this change', () => {
  // Scott has its own clearance model and its own records. Nothing in
  // the workspace routing path reaches it.
  //
  // Measured in a CHILD process that requires the orchestrator and
  // nothing else. Reading this process's own require.cache would test
  // process-global state, not this module's graph: under the default
  // per-file isolation no Scott module could ever be loaded so the
  // assertion would pass vacuously, and under a shared process a Scott
  // suite running alongside would fail it for a reason that has nothing
  // to do with routing.
  const { execFileSync } = require('node:child_process');
  const path = require('node:path');
  const probe = `require(${JSON.stringify(path.resolve(__dirname, '../../lib/workspace/orchestrator.js'))});`
    + `process.stdout.write(Object.keys(require.cache).filter((p) => p.includes(${JSON.stringify(`${path.sep}scott${path.sep}`)})).join(','));`;
  const reached = execFileSync(process.execPath, ['-e', probe], { encoding: 'utf8' }).trim();
  assert.equal(reached, '', `the workspace routing path pulled in Scott code: ${reached}`);

  // A question naming Scott routes to the demonstration-builder lane,
  // which reads Arrington records ABOUT the demonstration, never Scott's
  // own fictional dataset.
  assert.equal(routeToLane('Tell me about the Scott demonstration'), 'ai_demonstration_builder');
});
