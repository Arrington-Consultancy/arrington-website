// The Brain Gap loop: what a gap is, who owns it, whether it earns an
// email, and what the interface is allowed to say about that.
//
// The behaviour these are really guarding is a negative one. An AI system
// under pressure to look useful will fill a gap by inference and report a
// notification it did not send, because both make the queue look better.
// Neither is prevented by asking the model nicely, so both are decided in
// code here and asserted below.
const test = require('node:test');
const assert = require('node:assert/strict');

const bg = require('../../lib/scott/brainGaps');
const clearance = require('../../lib/scott/clearance');
const facts = require('../../lib/scott/deepBusinessFacts');
const gapNotifier = require('../../lib/scott/gapNotifier');

const blockingGap = {
  type: 'stale',
  missing: 'The cream yarn on-hand count contradicts the purchase order',
  whyItMatters: 'A customer is waiting on a knitting date',
  domain: 'yarn_stock',
  workCanContinue: false
};

test('the ownership register', async (t) => {
  await t.test('every owner is a fictional HUMAN, never an AI worker', () => {
    // The instruction this encodes is blunt: AI workers are not people.
    // A worker cannot be sent away to go and correct a controlled record,
    // so it can never be the responsible party for one, however
    // convenient that would be for closing a queue.
    const workerIds = Object.keys(require('../../lib/scott/workers').WORKERS);
    facts.RECORD_OWNERSHIP.forEach((row) => {
      [row.owner, row.decisionOwner].filter(Boolean).forEach((id) => {
        assert.ok(clearance.PERSONAS[id], `${row.domain} is owned by ${id}, which is not a persona`);
        assert.ok(!workerIds.includes(id), `${row.domain} is owned by the AI worker ${id}`);
      });
    });
  });

  await t.test('every owner holds clearance for the record they own', () => {
    // Routing a gap to someone who cannot read the evidence produces an
    // email they can do nothing with, and the body quotes the evidence.
    // A first draft of the register failed this on five rows; the owners
    // were corrected rather than the clearances widened.
    facts.RECORD_OWNERSHIP.forEach((row) => {
      [row.owner, row.decisionOwner].filter(Boolean).forEach((id) => {
        assert.ok(clearance.personaCanSeeDomain(id, row.domain),
          `${id} owns ${row.domain} but cannot see it`);
      });
    });
  });

  await t.test('an unknown domain has no owner rather than a guessed one', () => {
    assert.equal(bg.responsibleFor('not_a_real_domain'), null);
    assert.equal(bg.responsibleFor(''), null);
  });
});

test('classifying what stopped the worker', async (t) => {
  await t.test('an approval request is never routed as an evidence gap', () => {
    // The two have different resolution paths, and an item sitting in
    // both is an item with two owners and no answer.
    const plan = bg.planGap(blockingGap, {
      escalation: { to: 'scott_mercer', reason: 'discount above my limit' },
      askerPersonaId: 'tony_marsh'
    });
    assert.equal(plan.notifyDecision, bg.NOTIFY_DECISIONS.APPROVAL_HAS_ITS_OWN_WORKFLOW);
    assert.equal(plan.shouldEmail, false);
    assert.match(bg.describeNotification({ ...plan, email_status: plan.emailStatus, notify_decision: plan.notifyDecision }),
      /approvals queue/);
  });

  await t.test('approval language alone is enough to keep it out of the email path', () => {
    const plan = bg.planGap({
      ...blockingGap,
      missing: 'Scott needs to approve the extra 15 per cent discount'
    }, { askerPersonaId: 'tony_marsh' });
    assert.equal(plan.notifyDecision, bg.NOTIFY_DECISIONS.APPROVAL_HAS_ITS_OWN_WORKFLOW);
  });

  await t.test('a gap that blocks no work and touches no live record is recorded, not emailed', () => {
    const plan = bg.planGap({ ...blockingGap, workCanContinue: true }, { askerPersonaId: 'tony_marsh' });
    assert.equal(plan.material, false);
    assert.equal(plan.notifyDecision, bg.NOTIFY_DECISIONS.NOT_MATERIAL);
    assert.equal(plan.shouldEmail, false);
    // Still a record. "Not worth an email" and "not worth keeping" are
    // different answers, and only the first one is being given.
    assert.equal(plan.status, 'open');
  });

  await t.test('a non-blocking gap attached to a live enquiry IS material', () => {
    // A real customer commitment is downstream of it, which is the whole
    // test for materiality.
    const plan = bg.planGap({ ...blockingGap, workCanContinue: true },
      { askerPersonaId: 'tony_marsh', relatedEnquiryId: 7 });
    assert.equal(plan.material, true);
    assert.equal(plan.shouldEmail, true);
  });

  await t.test('a missing workCanContinue flag is treated as blocking, not as harmless', () => {
    // The failure that matters is a blocking gap filed as harmless, so
    // the ambiguous case fails in the safe direction.
    const plan = bg.planGap({ ...blockingGap, workCanContinue: undefined }, { askerPersonaId: 'tony_marsh' });
    assert.equal(plan.workCanContinue, false);
    assert.equal(plan.material, true);
  });

  await t.test('a gap with no missing evidence or no reason is not a gap at all', () => {
    assert.equal(bg.planGap({ ...blockingGap, missing: '' }), null);
    assert.equal(bg.planGap({ ...blockingGap, whyItMatters: '  ' }), null);
    assert.equal(bg.planGap(null), null);
  });

  await t.test('the person who owns the record is not emailed about their own screen', () => {
    const plan = bg.planGap(blockingGap, { askerPersonaId: 'leah_morgan' });
    assert.equal(plan.responsiblePersonaId, 'leah_morgan');
    assert.equal(plan.notifyDecision, bg.NOTIFY_DECISIONS.OWNER_IS_THE_ASKER);
    assert.equal(plan.shouldEmail, false);
  });

  await t.test('a gap in a record nobody owns says so instead of picking someone', () => {
    const plan = bg.planGap({ ...blockingGap, domain: 'nobody_owns_this' }, { askerPersonaId: 'tony_marsh' });
    assert.equal(plan.responsiblePersonaId, null);
    assert.equal(plan.notifyDecision, bg.NOTIFY_DECISIONS.NO_OWNER);
    assert.equal(plan.shouldEmail, false);
  });
});

test('routing to the right human', async (t) => {
  await t.test('the yarn gap goes to the knitting lead, not to whoever is senior', () => {
    const plan = bg.planGap(blockingGap, { askerPersonaId: 'chloe_reed' });
    assert.equal(plan.responsiblePersonaId, 'leah_morgan');
    assert.equal(plan.responsibleName, 'Leah Morgan');
    assert.equal(plan.shouldEmail, true);
  });

  await t.test('the register overrides the worker\'s own description of the source', () => {
    // The register is controlled data. The worker's phrasing is not, and
    // "the stock thing" is not a record anyone can go and correct.
    const plan = bg.planGap({ ...blockingGap, expectedSource: 'the stock thing' }, { askerPersonaId: 'chloe_reed' });
    assert.match(plan.expectedSource, /07I/);
  });

  await t.test('where evidence and decision sit with different people, both are named', () => {
    // The van is the clearest case in the dataset: Mike reports its
    // condition, Operations decides about hire.
    const plan = bg.planGap({ ...blockingGap, domain: 'vehicle_status' }, { askerPersonaId: 'chloe_reed' });
    assert.equal(plan.responsibleName, 'Mike Evans');
    assert.equal(plan.decisionOwnerName, 'Tony Marsh');
    assert.match(bg.buildGapEmail(plan).text, /Tony Marsh/);
  });
});

test('the email says three things and proposes no answer', async (t) => {
  const plan = bg.planGap(blockingGap, { askerPersonaId: 'chloe_reed' });
  const { subject, text } = bg.buildGapEmail(plan, { portalUrl: 'https://example.test/scott/gaps' });

  await t.test('it states what is missing, why it matters, and which source to correct', () => {
    assert.match(text, /WHAT IS MISSING OR CONFLICTING/);
    assert.ok(text.includes(plan.missingEvidence));
    assert.match(text, /WHY IT MATTERS/);
    assert.ok(text.includes(plan.whyItMatters));
    assert.match(text, /WHAT WOULD CLOSE THIS/);
    assert.match(text, /07I/);
    assert.match(subject, /07I/);
  });

  await t.test('it never suggests what the value probably is', () => {
    // A suggested value is how a gap gets closed by inference with a
    // human's name on it. The regex deliberately targets suggestion
    // phrasing rather than the word "assume", because the email's own
    // closing line uses it to say the opposite.
    assert.doesNotMatch(text, /probably|presumably|best guess|estimated|our assumption|likely to be|should be around/i);
    assert.match(text, /Nothing has been assumed or filled in on your behalf/);
  });

  await t.test('it says plainly whether work is stopped', () => {
    assert.match(text, /Work on this is stopped/);
    const ok = bg.buildGapEmail(bg.planGap({ ...blockingGap, workCanContinue: true },
      { askerPersonaId: 'chloe_reed', relatedEnquiryId: 3 })).text;
    assert.match(ok, /Work is continuing in the meantime/);
  });

  await t.test('no em dash reaches a customer-visible or staff-visible send', () => {
    assert.ok(!text.includes('—'), 'em dash in the gap email');
  });
});

test('"[name] has been emailed" is only ever said after a send succeeded', async (t) => {
  const plan = bg.planGap(blockingGap, { askerPersonaId: 'chloe_reed' });

  t.after(() => gapNotifier.__resetTransportForTests());

  await t.test('a send that succeeds first time reports one attempt', async () => {
    let calls = 0;
    gapNotifier.__setTransportForTests({ sendMail: async () => { calls += 1; return { messageId: 'x' }; } });
    const r = await gapNotifier.sendGapNotification(plan, { sleepFn: async () => {} });
    assert.equal(calls, 1);
    assert.deepEqual({ s: r.emailStatus, a: r.attempts, e: r.error }, { s: 'sent', a: 1, e: '' });
    assert.equal(bg.describeNotification({ responsible_name: 'Leah Morgan', email_status: 'sent' }),
      'Leah Morgan has been emailed.');
  });

  await t.test('a first failure is retried exactly once, and the retry can succeed', async () => {
    let calls = 0;
    gapNotifier.__setTransportForTests({
      sendMail: async () => { calls += 1; if (calls === 1) throw new Error('421 temporary'); return { messageId: 'x' }; }
    });
    const r = await gapNotifier.sendGapNotification(plan, { sleepFn: async () => {} });
    assert.equal(calls, 2, 'retry-once, not retry-forever and not give-up-immediately');
    assert.equal(r.emailStatus, 'sent');
    assert.equal(r.attempts, 2);
  });

  await t.test('two failures stop, and report the REAL error rather than a success', async () => {
    let calls = 0;
    gapNotifier.__setTransportForTests({
      sendMail: async () => { calls += 1; throw new Error('535 authentication rejected'); }
    });
    const r = await gapNotifier.sendGapNotification(plan, { sleepFn: async () => {} });
    assert.equal(calls, 2, 'exactly two attempts, no third');
    assert.equal(r.emailStatus, 'failed');
    assert.match(r.error, /535 authentication rejected/);

    const said = bg.describeNotification({ responsible_name: 'Leah Morgan', email_status: 'failed', email_error: r.error, email_attempts: r.attempts });
    assert.match(said, /has NOT been emailed/);
    assert.match(said, /535 authentication rejected/, 'the actual failure must be reported, not paraphrased away');
    assert.match(said, /still open/);
  });

  await t.test('an unconfigured mailbox is reported as nothing attempted, not as a send', async () => {
    gapNotifier.__setTransportForTests(null);
    const r = await gapNotifier.sendGapNotification(plan, { sleepFn: async () => {} });
    assert.equal(r.emailStatus, 'failed');
    assert.equal(r.attempts, 0);
    assert.match(r.error, /not configured/);
    // The sentence must not claim a retry either: zero attempts means
    // "nothing was sent", not "the send failed after a retry".
    const said = bg.describeNotification({ responsible_name: 'Leah Morgan', email_status: 'failed', email_error: r.error, email_attempts: 0 });
    assert.match(said, /Nothing was sent/);
    assert.doesNotMatch(said, /after a retry/);
  });

  await t.test('no state short of a genuine send produces the emailed sentence', () => {
    // The one sentence that matters, checked against every other state
    // the row can be in.
    ['not_required', 'pending', 'failed'].forEach((status) => {
      const said = bg.describeNotification({ responsible_name: 'Leah Morgan', email_status: status, notify_decision: 'routed' });
      assert.doesNotMatch(said, /Leah Morgan has been emailed\./,
        `email_status '${status}' must not produce the emailed sentence`);
    });
  });
});

test('gap resolution authority', async (t) => {
  await t.test('closing a gap needs clearance for the record it is about', () => {
    assert.ok(clearance.personaCanResolveGap('leah_morgan', { domain: 'yarn_stock' }));
    assert.ok(!clearance.personaCanResolveGap('leah_morgan', { domain: 'finance_full' }));
    assert.ok(clearance.personaCanResolveGap('scott_mercer', { domain: 'finance_full' }));
  });

  await t.test('an unclassified gap is visible only to full clearance, not to everyone', () => {
    // A gap whose domain never resolved is the one row in the register
    // that could plausibly fail OPEN, since the filter is asked about an
    // empty string. It must fail closed, and it must fail closed the
    // same way personaCanResolveGap does, or the register would show a
    // gap to someone who then cannot close it (or worse, the reverse).
    const unclassified = [{ domain: '', missing: 'X' }, { domain: null, missing: 'Y' }, { missing: 'Z' }];
    const canSee = Object.keys(clearance.PERSONAS)
      .filter((p) => clearance.filterAndRedact(p, null, unclassified).length > 0);
    assert.deepEqual(canSee, ['scott_mercer'],
      'an unclassified gap must not be readable by every login');
    // The two rules agree: whoever can see it is whoever can close it.
    const canClose = Object.keys(clearance.PERSONAS)
      .filter((p) => clearance.personaCanResolveGap(p, { domain: '' }));
    assert.deepEqual(canClose, canSee,
      'visibility and closability of an unclassified gap must not diverge');
  });

  await t.test('an unclassified gap is the hardest to close, not the easiest', () => {
    // Failing open on a missing domain would make an unclassified gap
    // the one thing in the system anybody could clear.
    const openToEveryone = Object.keys(clearance.PERSONAS)
      .filter((p) => clearance.personaCanResolveGap(p, { domain: '' }));
    assert.deepEqual(openToEveryone, ['scott_mercer']);
    assert.equal(clearance.personaCanResolveGap('jo_bell', null), false);
  });
});
