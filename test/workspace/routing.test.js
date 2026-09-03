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
  { record_key: 'project-scott-demonstration', source_class: 'project', sensitivity: 'commercial', doc_status: 'current', title: 'Scott pointer' },
  // Finance is in the fixture on purpose. Without it, a test named
  // "keeps finance" asserts routing and nothing else, and would stay
  // green if the general context stopped carrying finance entirely.
  { record_key: 'finance-summary', source_class: 'finance', sensitivity: 'confidential', doc_status: 'current', title: 'Bank position' },
  { record_key: 'workspace-source-map', source_class: 'control_pack', sensitivity: 'commercial', doc_status: 'current', title: 'Source map' }
];

const FINANCE_KEY = 'finance-summary';

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



test('the missed plurals now route, and the confidential lanes gain none of them by precedence', () => {
  // Every inflection repair lives in the low-precedence tail, including
  // these. An earlier version repaired the commercial-ceiling lanes IN
  // PLACE on the reasoning that a lane which cannot reach 'confidential'
  // cannot leak by winning earlier. That reasoning was measured wrong
  // twice (it defeated the money rule and it pre-empted later lanes), so
  // do not reinstate it: the test below forbids exactly that edit.
  const viaCommercialTail = [
    ['How are the campaigns doing?', 'google_ads'],
    ['Are our domains all valid?', 'website_hosting'],
    ['Which websites do we run?', 'website_hosting'],
    ['Are the servers healthy?', 'website_hosting'],
    ['Show me the archives', 'brain_keeper'],
    ['Draft some published posts', 'social_content_builder'],
    ['Which shortlists are we on?', 'ai_recommendation_visibility'],
    ['Tell me about the demonstrations', 'ai_demonstration_builder'],
    ['What is in the workspace control packs?', 'ai_workspace_builder']
  ];
  for (const [q, laneId] of viaCommercialTail) {
    assert.equal(routeToLane(q), laneId, `plural should route: ${q}`);
  }

  // The confidential-ceiling lanes are in the same tail, and route the
  // same way: when nothing else wants the question...
  const viaTail = [
    ['What are our prospects?', 'opportunity_builder'],
    ['Which proposals are outstanding?', 'opportunity_builder'],
    ['How are the pipelines looking?', 'opportunity_builder'],
    ['What permissions does the content role have?', 'governance_assurance'],
    ['Show me the audits', 'governance_assurance'],
    ['Which clearances exist?', 'governance_assurance']
  ];
  for (const [q, laneId] of viaTail) {
    assert.equal(routeToLane(q), laneId, `tail plural should route: ${q}`);
  }

  // ...and never take a question from a lane that already wins it. This
  // is the property that keeps the repair inside least privilege.
  const notPreEmpted = [
    ['Draft a LinkedIn post about our prospects', 'social_content_builder'],
    ['Draft a LinkedIn post about our audits', 'social_content_builder'],
    ['Which Drive document holds the proposals?', 'brain_keeper'],
    ['Is the website deploy blocked by permissions?', 'website_hosting']
  ];
  for (const [q, laneId] of notPreEmpted) {
    assert.equal(routeToLane(q), laneId, `the tail must not pre-empt a specific lane: ${q}`);
  }

  // The governance plurals move a question that used to get the general
  // context into the one lane that reads every source class. That is a
  // widening of the task-necessity leg, so it is measured rather than
  // assumed: the lane is the correct owner of the word, and the human
  // clearance leg still gates every record it returns.
  return withStubbedRecords(async () => {
    const general = keysOf(await buildLaneContext({ clearanceId: 'owner_admin', laneId: null }));
    const gov = keysOf(await buildLaneContext({ clearanceId: 'owner_admin', laneId: routeToLane('Show me the audits') }));
    assert.ok(gov.length > general.length, 'expected the governance lane to be the wider context here');
    // ...and a reader without the confidential ceiling still gets nothing
    // confidential out of it, which is the property that matters.
    const restricted = await buildLaneContext({ clearanceId: 'ws_restricted', laneId: routeToLane('Show me the audits') });
    assert.ok(restricted.every((r) => r.sensitivity === 'standard'),
      'the widened lane must still be gated by human clearance');
  });
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




test('the exported general source classes cannot be mutated by a caller', () => {
  // It was exported live and unfrozen, which is the exact hazard the
  // adjacent comment cites as the reason ROUTING_RULES is withheld: a
  // reviewer pushed 'opportunity' onto it and the confidential
  // opportunity record appeared in the no-lane context process-wide.
  assert.ok(Object.isFrozen(orchestrator.GENERAL_SOURCE_CLASSES));
  assert.throws(() => { orchestrator.GENERAL_SOURCE_CLASSES.push('opportunity'); });
  assert.deepEqual([...orchestrator.GENERAL_SOURCE_CLASSES],
    ['authority', 'strategy', 'worker_register', 'finance'],
    'the general context changed; the no-lane system prompt names these classes and must be revisited');
});


test('deleting the stem from rule three changed no routing a person would produce', () => {
  // The stem could never match either real spelling, which is why the
  // obvious phrasing reached no lane. It was NOT unmatchable, and this
  // test is titled for what it actually establishes: "opportunit" and
  // "opportunit-led" did reach the lane before and reach no lane now.
  // Neither is a phrase a person produces, so the change is neutral for
  // real input and is not neutral in the absolute. Both halves of what
  // matters are pinned: the subjects rule three really does own still
  // route to it, and both real spellings still route via the tail.
  for (const q of ['Any new leads?', 'that prospect', 'the pipeline', 'the proposal', 'ivybridge', 'icabbi']) {
    assert.equal(routeToLane(q), 'opportunity_builder', `rule three lost a subject it owns: ${q}`);
  }
  assert.equal(routeToLane('opportunity'), 'opportunity_builder');
  assert.equal(routeToLane('opportunities'), 'opportunity_builder');
});

test('routing to any lane but governance loses finance, which is a property of lanes.js and not of this change', async () => {
  // The honest statement of the trade, replacing four rounds of trying to
  // keep money questions out of lanes by enumerating money words. Each
  // round widened a keyword list and the next found more, and the rule
  // was defending a property that never held: on the base commit "what
  // are our hosting costs?" already reached website_hosting, which holds
  // no finance class.
  //
  // The real property is simple and is pinned here: finance is granted to
  // exactly one lane, so every other lane loses it, and the general
  // no-lane context is its only other route. This change adds more
  // questions that route at all, so it makes an existing trade more
  // visible; it does not create the trade.
  //
  // The repair is a finance lane, or finance granted to more than one
  // lane. Both are worker-permission changes reserved to Tom, and this
  // test fails the moment either is taken, so the note above cannot go
  // stale.
  const { LANES, laneById } = require('../../lib/workspace/lanes');
  assert.deepEqual(
    LANES.filter((l) => l.sourceClasses.includes('finance')).map((l) => l.id),
    ['governance_assurance'],
    'the set of lanes holding finance changed; the routing notes about the finance trade must be revisited'
  );
  assert.ok(orchestrator.GENERAL_SOURCE_CLASSES.includes('finance'));

  await withStubbedRecords(async () => {
    // The general context has finance...
    const general = keysOf(await buildLaneContext({ clearanceId: 'owner_admin', laneId: null }));
    assert.ok(general.includes(FINANCE_KEY));

    // ...governance keeps it...
    const gov = keysOf(await buildLaneContext({ clearanceId: 'owner_admin', laneId: 'governance_assurance' }));
    assert.ok(gov.includes(FINANCE_KEY));

    // ...and every other lane loses it, whatever the question said.
    for (const lane of LANES.filter((l) => l.id !== 'governance_assurance')) {
      const keys = keysOf(await buildLaneContext({ clearanceId: 'owner_admin', laneId: lane.id }));
      assert.ok(!keys.includes(FINANCE_KEY), `${lane.id} unexpectedly reads finance`);
    }

    // Worth stating concretely, because it is the case the reviews kept
    // returning to: an opportunity question that also names money routes
    // to the opportunity lane and does not see the banking record.
    assert.equal(routeToLane('Where are the opportunities to reduce our recurring costs?'), 'opportunity_builder');
    const oppKeys = keysOf(await buildLaneContext({ clearanceId: 'owner_admin', laneId: 'opportunity_builder' }));
    assert.ok(!oppKeys.includes(FINANCE_KEY));
    for (const key of OPPORTUNITY_KEYS) assert.ok(oppKeys.includes(key));
  });
});

test('a money question that names no lane still reaches the general context', async () => {
  // The other half: nothing about this change stops an ordinary money
  // question getting finance, because it names no lane at all.
  await withStubbedRecords(async () => {
    for (const q of ['What is our bank balance?', 'How much did we spend last month?', 'What do our overheads look like?']) {
      assert.equal(routeToLane(q), null, `expected no lane for: ${q}`);
      const keys = keysOf(await buildLaneContext({ clearanceId: 'owner_admin', laneId: routeToLane(q) }));
      assert.ok(keys.includes(FINANCE_KEY), `finance must reach the prompt for: ${q}`);
    }
  });
});

// Every subject the tail rules actually repair, derived once and reused,
// so a probe list cannot silently miss a rule. HEAD_SUBJECTS names one
// phrase per head rule; TAIL_SUBJECTS one per tail rule. Both are checked
// for completeness against the real table before they are used.
const HEAD_SUBJECTS = [
  ['google ads campaign', 'google_ads'],
  ['website deploy', 'website_hosting'],
  ['the pipeline', 'opportunity_builder'],
  ['drive archive', 'brain_keeper'],
  ['the constitution', 'governance_assurance'],
  ['linkedin', 'social_content_builder'],
  ['shortlist', 'ai_recommendation_visibility'],
  ['scott demonstration', 'ai_demonstration_builder'],
  ['workspace control pack', 'ai_workspace_builder']
];
const TAIL_SUBJECTS = [
  'campaigns', 'websites', 'archives', 'social posts', 'shortlists',
  'demonstrations', 'workspaces', 'opportunities', 'permissions'
];

test('the probe lists cover every rule in the real table, so no rule can escape the checks below', () => {
  // The guard on the guards. An earlier version of the pre-emption test
  // hand-listed tail subjects and missed social_content_builder's
  // entirely, so hoisting that rule to the top of the table left all
  // tests green while inverting routing. Coverage is now asserted against
  // the table itself rather than assumed.
  const table = orchestrator.__routingTableForTests;
  const head = table.slice(0, 9);
  const tail = table.slice(9);

  assert.equal(head.length + tail.length, table.length);
  assert.equal(HEAD_SUBJECTS.length, head.length, 'a head rule has no probe');
  assert.equal(TAIL_SUBJECTS.length, tail.length, 'a tail rule has no probe');

  for (const rule of head) {
    const re = new RegExp(rule.source, rule.flags);
    assert.ok(HEAD_SUBJECTS.some(([q]) => re.test(q)), `no head probe exercises ${rule.laneId}`);
  }
  for (const rule of tail) {
    const re = new RegExp(rule.source, rule.flags);
    assert.ok(TAIL_SUBJECTS.some((q) => re.test(q)), `no tail probe exercises ${rule.laneId}`);
  }
});

test('no tail rule can take a question from a lane that already wins it', () => {
  // Every head subject against every tail subject. With the completeness
  // check above, this covers the whole table, so hoisting any tail rule
  // fails here.
  for (const [subject, laneId] of HEAD_SUBJECTS) {
    assert.equal(routeToLane(subject), laneId, `head probe stopped resolving: ${subject}`);
    for (const tail of TAIL_SUBJECTS) {
      const combined = `${subject} and ${tail}`;
      assert.equal(routeToLane(combined), laneId,
        `a tail rule pre-empted a head lane: "${combined}"`);
    }
  }
});

test('the tail is ordered narrowest lane first, derived from lanes.js rather than restated', () => {
  // The ordering rule is that when a question names two tail subjects the
  // narrower lane wins, because task necessity is a permission leg and
  // the wider lane winning by accident of register order would widen it.
  // An earlier version ordered the commercial group by register order,
  // which contradicted that: "draft social posts about our campaigns"
  // reached google_ads rather than social_content_builder.
  const { laneById, SENSITIVITY_ORDER } = require('../../lib/workspace/lanes');
  const tail = orchestrator.__routingTableForTests.slice(9);
  // Ceiling outranks breadth. Ordered by breadth alone,
  // opportunity_builder (four classes, confidential) preceded
  // website_hosting (five classes, commercial), so "which proposals
  // relate to our websites?" reached the confidential lane. Fewer classes
  // is not narrower if one of them is confidential.
  const rank = (laneId) => {
    const lane = laneById(laneId);
    return [SENSITIVITY_ORDER.indexOf(lane.sensitivityCeiling), lane.sourceClasses.length];
  };
  for (let i = 1; i < tail.length; i += 1) {
    const [prevCeiling, prevWidth] = rank(tail[i - 1].laneId);
    const [ceiling, width] = rank(tail[i].laneId);
    assert.ok(ceiling > prevCeiling || (ceiling === prevCeiling && width >= prevWidth),
      `tail rule ${i} (${tail[i].laneId}) outranks the one before it (${tail[i - 1].laneId}) on ceiling then breadth`);
  }
  assert.equal(routeToLane('Which proposals relate to our websites?'), 'website_hosting',
    'a confidential tail lane pre-empted a commercial one');
  // And the behaviour that ordering exists for.
  assert.equal(routeToLane('Draft social posts about our campaigns'), 'social_content_builder');
  assert.equal(routeToLane('opportunities and permissions'), 'opportunity_builder');
});

test('every rule is pinned to its exact pattern and flags, not merely re-probed', () => {
  // A test that only re-runs probes stays green when a keyword is ADDED:
  // putting 'deployment' into rule two would move "is the deployment
  // healthy?" out of the general context and into website_hosting, losing
  // the finance record, with every probe still passing. The head rules
  // are therefore pinned literally, FLAGS INCLUDED: a rule rewritten with
  // 'g' would pass a source-only pin while making pattern.test() stateful
  // through lastIndex, so routing would differ between identical calls;
  // and a rule that lost 'i' would pass too, because every probe in this
  // file is lowercase. If a rule legitimately needs to change, this fails
  // and the change gets read.
  const table = orchestrator.__routingTableForTests;
  // Every rule, head AND tail. An earlier version pinned only the head,
  // which left the tail open to both hazards this test exists for:
  // adding 'deployment' to the tail website_hosting rule moved "is the
  // deployment healthy?" out of the general context and lost the finance
  // record with every test green, and a 'g' flag on the tail campaigns
  // rule made routeToLane alternate google_ads / null / google_ads on
  // identical input, also with every test green.
  assert.deepEqual(table.map((r) => `${r.laneId}::${r.flags}::${r.source}`), [
    'google_ads::i::\\b(google ads|paid (ads|advertising|media)|ppc|adwords|campaign|cost per (lead|click)|conversion tracking)\\b',
    'website_hosting::i::\\b(website|hosting|deploy|railway|github|domain|dns|cms|server|stripe|checkout|seo tag)\\b',
    'opportunity_builder::i::\\b(lead(s)?\\b|prospect|pipeline|proposal|commercial conversation|ivybridge|icabbi)\\b',
    'brain_keeper::i::\\b(drive|brain (index|structure|maintenance)|document status|superseded|archive|handoff standard)\\b',
    'governance_assurance::i::\\b(governance|assurance|constitution|permission|clearance|audit|stop decision|compliance|rulebook)\\b',
    'social_content_builder::i::\\b(linkedin|social (content|post|media)|story bank|published post)\\b',
    'ai_recommendation_visibility::i::\\b(ai (visibility|recommendation)|cited by ai|chatgpt recommend|shortlist)\\b',
    'ai_demonstration_builder::i::\\b(scott|demonstration|armchair|knitting|fictional)\\b',
    'ai_workspace_builder::i::\\b(workspace|control pack|brain gap standard|acceptance plan|implementation brief)\\b',
    'social_content_builder::i::\\b(social posts|story banks|published posts)\\b',
    'ai_demonstration_builder::i::\\b(demonstrations|armchairs)\\b',
    'ai_recommendation_visibility::i::\\b(shortlists|ai recommendations)\\b',
    'brain_keeper::i::\\b(archives|handoff standards|document statuses)\\b',
    'google_ads::i::\\bcampaigns\\b',
    'ai_workspace_builder::i::\\b(workspaces|control packs|brain gap standards|acceptance plans|implementation briefs)\\b',
    'website_hosting::i::\\b(websites|deploys|domains|servers|checkouts|seo tags)\\b',
    'opportunity_builder::i::\\b(opportunit(?:y|ies)|prospects|pipelines|proposals|commercial conversations)\\b',
    'governance_assurance::i::\\b(permissions|clearances|audits|rulebooks|stop decisions)\\b'
  ]);
});

test('the accepted finance trade is pinned on the questions that actually pay it', async () => {
  // The money test above pins questions that name NO lane. This one pins
  // the other half, which is where the trade is actually paid: a question
  // whose only lane signal is a tail plural, which also names money.
  // These reached no rule at the base and so got the general context with
  // the banking record; they now route and lose it.
  //
  // Recorded as accepted and escalated, not fixed, because the repair is
  // a finance lane or a wider grant and both are worker-permission
  // changes reserved to Tom. Pinned so the cost stays visible and so the
  // day the grant changes, this fails and the decision gets re-read.
  await withStubbedRecords(async () => {
    for (const [q, laneId] of [
      ['How much are the campaigns costing us?', 'google_ads'],
      ['What do our servers cost?', 'website_hosting'],
      ['How much do our domains cost?', 'website_hosting'],
      ['What did we pay for the archives?', 'brain_keeper'],
      ['Where are the opportunities to reduce our recurring costs?', 'opportunity_builder']
    ]) {
      assert.equal(routeToLane(q), laneId, `expected the tail plural to win: ${q}`);
      const keys = keysOf(await buildLaneContext({ clearanceId: 'owner_admin', laneId }));
      assert.ok(!keys.includes(FINANCE_KEY),
        `this is the accepted trade: ${laneId} cannot see finance, so ${JSON.stringify(q)} loses it`);
    }
  });
});

test('the no-lane system prompt names no source class, so it cannot hint at one a reader is not cleared for', () => {
  // It used to enumerate the general context's classes, including
  // 'finance', to every reader whatever their clearance. Telling a
  // narrower reader there are "finance records you are cleared for" is
  // exactly the existence signal this codebase treats as the leak, and
  // the prose duplicated GENERAL_SOURCE_CLASSES so it could drift from
  // it. The line now describes only "the records supplied below", which
  // is true for every reader and cannot go stale.
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../lib/workspace/orchestrator.js'), 'utf8');
  const line = src.split('\n').find((l) => l.includes('matched no specialist lane'));
  assert.ok(line, 'the no-lane system prompt line moved; this guard needs updating');
  for (const cls of orchestrator.GENERAL_SOURCE_CLASSES) {
    assert.ok(!line.toLowerCase().includes(cls.replace('_', ' ')) && !line.toLowerCase().includes(cls),
      `the no-lane prompt names the '${cls}' source class, which tells every reader it exists`);
  }
});
