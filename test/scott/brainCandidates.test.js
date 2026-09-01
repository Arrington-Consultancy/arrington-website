// Scott AI Demonstration — proposed brain facts.
//
// Two properties matter more than the individual checks, and both are
// asserted directly rather than inferred from a passing case elsewhere:
//
//   1. No assessment can admit a fact. The verdicts describe what the
//      checks found; only a human decision puts anything in the brain.
//   2. Every check is exercised in BOTH directions. A rule that only ever
//      forbids is satisfied by a function that flags everything, and a
//      queue that flags legitimate facts is one nobody reads. So each
//      case that must be caught is paired with one that must not.

const { describe, test } = require('node:test');
const assert = require('node:assert');

const bc = require('../../lib/scott/brainCandidates');
const clearance = require('../../lib/scott/clearance');

const CANON = bc.allCanonRecords();
const PROFILE = bc.deriveWorldProfile();

function candidate(over = {}) {
  return {
    domain: 'finance_full',
    factKey: 'september_turnover_forecast',
    factValue: 'Forecast revenue for September 2026 is GBP 44,000.',
    sourceLabel: '07A Finance & Accounts',
    proposedByWorkerId: 'finance_accounts',
    ...over
  };
}

const assess = (c, opts = {}) => bc.assessCandidate(c, { canon: CANON, ...opts });

describe('a proposal can never admit itself', () => {
  test('no candidate shape produces a verdict that puts a fact in the brain', () => {
    const shapes = [
      candidate(),
      candidate({ domain: 'nonsense_domain' }),
      candidate({ factValue: '' }),
      candidate({ sourceLabel: '' }),
      candidate({ factValue: 'A contract worth GBP 9,000,000.' }),
      candidate({ factValue: 'Northern Loom Supplies Ltd took over.' }),
      {},
      null,
      { domain: 'finance_full' }
    ];
    shapes.forEach((s) => {
      const r = assess(s);
      assert.ok(bc.VERDICTS.includes(r.verdict), `unexpected verdict ${r.verdict}`);
      assert.notEqual(r.verdict, 'approved');
    });
    assert.ok(!bc.VERDICTS.includes('approved'), 'the verdict vocabulary must not contain approved');
  });

  test('a clean candidate still says a person has to approve it', () => {
    const r = assess(candidate());
    assert.equal(r.verdict, 'admissible');
    assert.match(r.summary, /needs a person to approve it/i);
  });
});

describe('conflict: does it contradict what the company already holds', () => {
  const held = {
    domain: 'finance_full',
    factKey: 'september_turnover_forecast',
    factValue: 'Forecast revenue for September 2026 is GBP 41,000.'
  };

  test('same key, different value, is blocked', () => {
    const r = assess(candidate(), { canon: CANON.concat([held]) });
    assert.equal(r.verdict, 'blocked');
    assert.ok(r.conflictFlags.some((f) => f.code === 'duplicate_key'));
  });

  test('same key, SAME value, is not a conflict', () => {
    const same = { ...held, factValue: candidate().factValue };
    const r = assess(candidate(), { canon: CANON.concat([same]) });
    assert.equal(r.conflictFlags.length, 0, 'restating a fact the brain already holds is not a contradiction');
    assert.equal(r.verdict, 'admissible');
  });

  test('the same key in a DIFFERENT domain is not a conflict', () => {
    const elsewhere = { ...held, domain: 'kpi_trend' };
    const r = assess(candidate(), { canon: CANON.concat([elsewhere]) });
    assert.equal(r.conflictFlags.length, 0);
  });

  test('a figure that disagrees with a held figure is reported as a figure clash', () => {
    const r = assess(candidate(), { canon: CANON.concat([held]) });
    assert.ok(r.conflictFlags.some((f) => f.code === 'figure_contradiction'));
    assert.match(r.summary, /41,000/);
  });

  test('a second proposal for the same key blocks rather than queueing a contradiction', () => {
    const other = candidate({ factValue: 'Forecast revenue for September 2026 is GBP 39,500.' });
    const r = assess(candidate(), { pending: [other] });
    assert.equal(r.verdict, 'blocked');
    assert.ok(r.conflictFlags.some((f) => f.code === 'pending_duplicate'));
  });

  test('an identical pending proposal is not treated as contradicting itself', () => {
    const r = assess(candidate(), { pending: [candidate()] });
    assert.equal(r.conflictFlags.length, 0);
  });
});

describe('drift: is it believable for this company', () => {
  test('an unknown clearance domain blocks, because the fact could not be access-controlled', () => {
    const r = assess(candidate({ domain: 'made_up_domain' }));
    assert.equal(r.verdict, 'blocked');
    assert.ok(r.driftFlags.some((f) => f.code === 'unknown_domain'));
  });

  test('every real clearance domain is accepted', () => {
    Object.keys(clearance.DOMAIN_LABELS).forEach((d) => {
      const r = assess(candidate({ domain: d, factKey: `probe_${d}` }));
      assert.ok(!r.driftFlags.some((f) => f.code === 'unknown_domain'), `${d} should be a known domain`);
    });
  });

  test('a figure far beyond annual turnover is sent to review, not blocked', () => {
    const r = assess(candidate({ factValue: 'A new contract worth GBP 4,000,000.' }));
    assert.equal(r.verdict, 'review');
    assert.ok(r.driftFlags.some((f) => f.code === 'scale_implausible'));
  });

  test('an ordinary trading figure is not flagged', () => {
    const r = assess(candidate({ domain: 'jobs_ops', factKey: 'large_job', factValue: 'A refit billed at GBP 18,500.' }));
    assert.equal(r.driftFlags.length, 0, 'a plausible job value must not reach the queue');
  });

  test('the anchor is trading turnover, not the largest money figure on record', () => {
    // Regression: the first version took the maximum of anything
    // money-shaped, which is the employers' liability cover of GBP 10m, and
    // waved a GBP 4m contract through as unremarkable.
    assert.equal(PROFILE.annualTradingGbp, 565000);
    assert.ok(PROFILE.moneyCeilingGbp < 10000000, 'an insurance cover limit must not set the trading envelope');
  });

  test('with no turnover on record the size is reported as unchecked rather than passed', () => {
    const empty = bc.deriveWorldProfile([]);
    assert.equal(empty.scaleCheckable, false);
    const r = bc.assessCandidate(candidate({ factValue: 'Worth GBP 900.' }), { canon: [], profile: empty });
    assert.ok(r.driftFlags.some((f) => f.code === 'scale_unchecked'));
    assert.match(r.summary, /not checked against anything/i);
  });

  test('a negative amount is flagged, whichever side of the symbol the sign is on', () => {
    assert.deepEqual(bc.extractMoneyFigures('an adjustment of £-2,000'), [-2000]);
    assert.deepEqual(bc.extractMoneyFigures('an adjustment of -£2,000'), [-2000]);
    ['An adjustment of £-2,000 was posted.', 'An adjustment of -£2,000 was posted.'].forEach((v) => {
      const r = assess(candidate({ factValue: v }));
      assert.ok(r.driftFlags.some((f) => f.code === 'scale_implausible'), `not flagged: ${v}`);
    });
  });

  test('an ordinary positive amount is still read as positive', () => {
    assert.deepEqual(bc.extractMoneyFigures('billed at GBP 18,500'), [18500]);
    assert.deepEqual(bc.extractMoneyFigures('billed at £1,234.56'), [1234.56]);
  });

  test('an invented company is flagged', () => {
    const r = assess(candidate({ domain: 'suppliers_ops', factKey: 'new_supplier', factValue: 'Northern Loom Supplies Ltd now supplies yarn.' }));
    assert.equal(r.verdict, 'review');
    assert.ok(r.driftFlags.some((f) => f.code === 'unknown_entity'));
  });

  test('people and suppliers the company really has are NOT flagged', () => {
    const r = assess(candidate({
      domain: 'suppliers_ops',
      factKey: 'delivery_note',
      factValue: 'Tony Marsh confirmed South Devon Foam & Webbing Ltd delivered late.'
    }));
    assert.ok(!r.driftFlags.some((f) => f.code === 'unknown_entity'), 'real staff and suppliers must pass');
  });

  test('house style is enforced on the fact text', () => {
    const r = assess(candidate({ factValue: 'A seamless and transformative result.' }));
    assert.ok(r.driftFlags.some((f) => f.code === 'register'));
    const dash = assess(candidate({ factValue: 'Revenue rose — slightly.' }));
    assert.ok(dash.driftFlags.some((f) => f.code === 'register'));
  });

  test('ordinary plain English is not mistaken for house-style breach', () => {
    const r = assess(candidate({ factValue: 'Revenue rose slightly in September against a flat August.' }));
    assert.ok(!r.driftFlags.some((f) => f.code === 'register'));
  });

  test('a fact with no named source is held for review', () => {
    const r = assess(candidate({ sourceLabel: '' }));
    assert.ok(r.driftFlags.some((f) => f.code === 'unsourced'));
  });
});

describe('the worker contract', () => {
  const { validateWorkerReply, buildWorkerSystemPrompt } = require('../../lib/scott/orchestrator');
  const { getWorker } = require('../../lib/scott/workers');

  const gap = { type: 'missing', missing: 'a monthly forecast', whyItMatters: 'asked for one', domain: 'finance_full', workCanContinue: true };
  const base = { reply: 'There is no forecast on record.', certainty: 'UNPROVEN', writeback: null, escalation: null, refused: false };
  const proposal = { domain: 'finance_full', factKey: 'september_forecast', factValue: 'GBP 44,000.', sourceLabel: '07A' };

  test('a proposal alongside a gap is accepted', () => {
    const r = validateWorkerReply({ ...base, gap, factProposal: proposal });
    assert.equal(r.valid, true, r.errors && r.errors.join('; '));
  });

  test('a proposal WITHOUT a gap is refused, so it cannot become a general write path into the brain', () => {
    const r = validateWorkerReply({ ...base, gap: null, factProposal: proposal });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /only valid alongside a gap/i.test(e)));
  });

  test('a proposal with no named source is refused at the contract, before it reaches the queue', () => {
    const r = validateWorkerReply({ ...base, gap, factProposal: { ...proposal, sourceLabel: '' } });
    assert.equal(r.valid, false);
    assert.ok(r.errors.some((e) => /sourceLabel/.test(e)));
  });

  test('each required field of a proposal is actually required', () => {
    ['domain', 'factKey', 'factValue'].forEach((field) => {
      const partial = { ...proposal };
      delete partial[field];
      const r = validateWorkerReply({ ...base, gap, factProposal: partial });
      assert.equal(r.valid, false, `${field} should be required`);
    });
  });

  test('omitting a proposal entirely is still a valid reply', () => {
    assert.equal(validateWorkerReply({ ...base, gap }).valid, true);
    assert.equal(validateWorkerReply({ ...base, gap, factProposal: null }).valid, true);
  });

  test('the prompt asks for a reasoned estimate and still requires it to be labelled', () => {
    // This replaces an earlier test that pinned the opposite policy, when
    // a proposal was a suggestion for a person rather than the answer
    // being given. The rule changed deliberately (Scott is fiction, and a
    // fiction full of holes reads as an empty system), so the test that
    // pinned the old rule had to change with it rather than be worked
    // around. What must NOT change is that an estimate is visibly an
    // estimate, which is what this now asserts.
    const prompt = buildWorkerSystemPrompt(getWorker('finance_accounts'));
    assert.match(prompt, /factProposal/);
    assert.match(prompt, /as an estimate and not as a filed figure/i);
    assert.match(prompt, /"estimated": true/);
    assert.match(prompt, /basis/i);
    // The company holds it afterwards: that is the whole point.
    assert.match(prompt, /the next question that touches the same thing will see it/i);
    // And the one hole it must still admit to.
    assert.match(prompt, /A guess with no basis is worse than an admitted hole/i);
  });

  test('an estimate must declare a basis, enforced at the contract', () => {
    const withEstimate = (extra) => validateWorkerReply({
      ...base, gap, factProposal: { ...proposal, ...extra }
    });
    assert.equal(withEstimate({ estimated: true, basis: 'typical for this turnover' }).valid, true);
    const noBasis = withEstimate({ estimated: true });
    assert.equal(noBasis.valid, false);
    assert.ok(noBasis.errors.some((e) => /basis/.test(e)));
    // A non-estimate does not need one.
    assert.equal(withEstimate({ estimated: false }).valid, true);
    assert.equal(withEstimate({ estimated: 'yes' }).valid, false, 'estimated must be a real boolean');
  });
});

describe('autofill: what may enter the fiction without a person', () => {
  const on = { enabled: true };
  const clean = () => assess(candidate());

  test('off unless the variable is exactly true, so it can be stopped without a deploy', () => {
    const had = Object.prototype.hasOwnProperty.call(process.env, 'SCOTT_BRAIN_AUTOFILL');
    const prev = process.env.SCOTT_BRAIN_AUTOFILL;
    try {
      delete process.env.SCOTT_BRAIN_AUTOFILL;
      assert.equal(bc.isAutofillEnabled(), false);
      assert.equal(bc.autofillDecision(clean()).autofill, false);
      process.env.SCOTT_BRAIN_AUTOFILL = 'yes';
      assert.equal(bc.isAutofillEnabled(), false, 'only the exact string true arms it');
      process.env.SCOTT_BRAIN_AUTOFILL = 'true';
      assert.equal(bc.isAutofillEnabled(), true);
      assert.equal(bc.autofillDecision(clean()).autofill, true);
    } finally {
      if (had) process.env.SCOTT_BRAIN_AUTOFILL = prev;
      else delete process.env.SCOTT_BRAIN_AUTOFILL;
    }
  });

  test('a clean estimate goes in', () => {
    const d = bc.autofillDecision(clean(), { ...on, estimated: true, basis: 'typical for this turnover' });
    assert.equal(d.autofill, true);
  });

  test('anything that contradicts a record or an earlier estimate is refused', () => {
    const held = { domain: 'finance_full', factKey: 'september_turnover_forecast', factValue: 'It is GBP 41,000.' };
    const a = assess(candidate(), { canon: CANON.concat([held]) });
    const d = bc.autofillDecision(a, on);
    assert.equal(d.autofill, false, 'consistency is the whole reason this is worth doing');
    assert.match(d.reason, /disagrees with something already on record/i);
  });

  test('an unknown clearance domain is refused, so an invented HR fact cannot leak', () => {
    const d = bc.autofillDecision(assess(candidate({ domain: 'made_up' })), on);
    assert.equal(d.autofill, false);
    assert.match(d.reason, /not a clearance domain/i);
  });

  test('a figure the wrong size for this company is refused', () => {
    const d = bc.autofillDecision(assess(candidate({ factValue: 'A contract worth GBP 4,000,000.' })), on);
    assert.equal(d.autofill, false);
    assert.match(d.reason, /twice the company's annual turnover/i);
  });

  test('a size that could not be judged is refused, because unchecked is not the same as fine', () => {
    const empty = bc.deriveWorldProfile([]);
    const a = bc.assessCandidate(candidate({ factValue: 'Worth GBP 900.' }), { canon: [], profile: empty });
    assert.equal(bc.autofillDecision(a, on).autofill, false);
  });

  test('an estimate with no stated basis is refused', () => {
    const d = bc.autofillDecision(clean(), { ...on, estimated: true, basis: '  ' });
    assert.equal(d.autofill, false);
    assert.match(d.reason, /assertion, not an estimate/i);
  });

  test('cosmetic drift does NOT stop the fiction growing', () => {
    // Inventing a supplier is what inventing a supplier looks like, and a
    // register slip is a tone problem rather than a coherence one. Both
    // stay recorded on the row; neither blocks.
    const newSupplier = assess(candidate({
      domain: 'suppliers_ops', factKey: 'new_supplier', factValue: 'Northern Loom Supplies Ltd now supplies yarn.'
    }));
    assert.equal(newSupplier.verdict, 'review');
    assert.equal(bc.autofillDecision(newSupplier, { ...on, estimated: true, basis: 'typical second supplier' }).autofill, true);
  });

  test('every blocking code is a real drift code, so a typo cannot silently stop blocking', () => {
    const real = new Set(['unknown_domain', 'scale_implausible', 'scale_unchecked', 'unknown_entity', 'register', 'unsourced', 'empty_value']);
    bc.AUTOFILL_BLOCKING_DRIFT.forEach((c) => assert.ok(real.has(c), `${c} is not a drift code this module emits`));
  });

  test('an unassessed object is refused rather than waved through', () => {
    assert.equal(bc.autofillDecision(null, on).autofill, false);
    assert.equal(bc.autofillDecision({}, on).autofill, false);
  });
});

describe('an estimate is recalled as an estimate', () => {
  test('the brain record carries the marker and the basis', () => {
    const rec = bc.toBrainRecord({
      domain: 'marketing_performance', fact_key: 'next_month_ad_budget',
      fact_value: 'About GBP 4,460 plus VAT.', source_label: 'Estimated',
      estimated: true, basis: 'typical ad spend for a business of this turnover'
    });
    assert.equal(rec.estimated, true);
    assert.match(rec.basis, /typical ad spend/);
  });

  test('a real record carries no estimate marker at all', () => {
    const rec = bc.toBrainRecord({ domain: 'finance_full', fact_key: 'k', fact_value: 'v', estimated: false });
    assert.equal(rec.estimated, undefined, 'a filed record must not be labelled an estimate');
    assert.equal(rec.basis, undefined);
  });

  test('the prompt tells the worker to reuse an estimate rather than make a second one', () => {
    const { buildWorkerSystemPrompt } = require('../../lib/scott/orchestrator');
    const { getWorker } = require('../../lib/scott/workers');
    const prompt = buildWorkerSystemPrompt(getWorker('finance_accounts'));
    assert.match(prompt, /Never estimate a figure a record already answers/i);
    assert.match(prompt, /Never contradict an estimate the company already holds/i);
    assert.match(prompt, /Set "certainty" to LIKELY/i);
    assert.match(prompt, /Never invent a named person/i);
  });

  test('the governance preamble no longer forbids what the contract now asks for', () => {
    const gov = require('fs').readFileSync(require.resolve('../../lib/scott/governance.js'), 'utf8');
    assert.ok(!/Never fill a gap by inference/.test(gov), 'the old blanket prohibition would override the new instruction');
    assert.match(gov, /Never present a guess AS the record/i, 'the part worth keeping must survive');
    assert.match(gov, /reasoned estimate/i);
  });
});

describe('an invited viewer never sees the machinery', () => {
  const { canReviewProposedFacts } = require('../../routes/scott');
  const session = (user, portal) => ({ session: { user, scottPortalUser: portal } });

  test('Tom and Nat can review, an invited client account cannot', () => {
    assert.equal(canReviewProposedFacts(session({ id: 2, username: 'tom', role: 'content' })), true);
    assert.equal(canReviewProposedFacts(session({ id: 1, username: 'nat', role: 'admin' })), true);
    // The whole point: Will's account defaults to the owner view with full
    // FICTIONAL clearance, and still must not see facts being proposed and
    // approved. The queue is Arrington's machinery, not part of the company
    // he is being shown.
    assert.equal(canReviewProposedFacts(session({ id: 9, username: 'will', role: 'client' })), false);
  });

  test('a fictional staff login and an anonymous request cannot review', () => {
    assert.equal(canReviewProposedFacts(session(null, { personaId: 'jo_bell', id: 5 })), false);
    assert.equal(canReviewProposedFacts({ session: {} }), false);
  });

  test('the gate reads the real site role, not the fictional persona', () => {
    // A client account impersonating the owner is still a client account.
    const willAsOwner = session({ id: 9, username: 'will', role: 'client' });
    willAsOwner.session.scottImpersonatedPersonaId = 'scott_mercer';
    assert.equal(canReviewProposedFacts(willAsOwner), false);
  });
});

describe('the invited-viewer login alert', () => {
  const notifier = require('../../lib/scott/gapNotifier');
  const withEnv = (value, fn) => {
    const had = Object.prototype.hasOwnProperty.call(process.env, 'SCOTT_LOGIN_ALERT_USERNAMES');
    const prev = process.env.SCOTT_LOGIN_ALERT_USERNAMES;
    if (value === undefined) delete process.env.SCOTT_LOGIN_ALERT_USERNAMES;
    else process.env.SCOTT_LOGIN_ALERT_USERNAMES = value;
    try { return fn(); } finally {
      if (had) process.env.SCOTT_LOGIN_ALERT_USERNAMES = prev;
      else delete process.env.SCOTT_LOGIN_ALERT_USERNAMES;
    }
  };

  test('watches will by default and stays silent for Tom and the fictional staff', () => {
    withEnv(undefined, () => {
      assert.equal(notifier.shouldAlertOnLogin('will'), true);
      assert.equal(notifier.shouldAlertOnLogin('Will'), true, 'the login lowercases, so this must too');
      assert.equal(notifier.shouldAlertOnLogin('tom'), false);
      assert.equal(notifier.shouldAlertOnLogin('nat'), false);
      assert.equal(notifier.shouldAlertOnLogin('jo.bell'), false);
      assert.equal(notifier.shouldAlertOnLogin(''), false);
      assert.equal(notifier.shouldAlertOnLogin(undefined), false);
    });
  });

  test('the watch list is configurable, and an empty value turns it off', () => {
    withEnv('will, someone.else', () => {
      assert.deepEqual(notifier.loginAlertUsernames(), ['will', 'someone.else']);
      assert.equal(notifier.shouldAlertOnLogin('someone.else'), true);
    });
    withEnv('', () => {
      assert.deepEqual(notifier.loginAlertUsernames(), []);
      assert.equal(notifier.shouldAlertOnLogin('will'), false, 'an empty list must send nothing');
    });
  });

  test('an unwatched login sends nothing and says so', async () => {
    const r = await withEnv(undefined, () => notifier.sendLoginNotification({ username: 'tom' }));
    assert.equal(r.sent, false);
    assert.match(r.reason, /not a watched account/);
  });

  test('with no mail configured it reports that nothing was sent rather than claiming a send', async () => {
    notifier.__setTransportForTests(null);
    try {
      const r = await withEnv(undefined, () => notifier.sendLoginNotification({ username: 'will' }));
      assert.equal(r.sent, false);
      assert.match(r.reason, /GMAIL_APP_PASSWORD/);
    } finally { notifier.__resetTransportForTests(); }
  });

  test('a watched login sends, and the body names the approval queue', async () => {
    const sent = [];
    notifier.__setTransportForTests({ sendMail: async (m) => { sent.push(m); return {}; } });
    try {
      const r = await withEnv(undefined, () => notifier.sendLoginNotification({ username: 'will', pendingFacts: 3 }));
      assert.equal(r.sent, true);
      assert.equal(sent.length, 1);
      assert.match(sent[0].subject, /will has just logged in/i);
      assert.match(sent[0].text, /3 proposed facts are waiting/i);
      assert.match(sent[0].text, /\/scott\/gaps/);
      // It must not imply anything was sent to the visitor.
      assert.match(sent[0].text, /Nothing has been sent to them/i);
    } finally { notifier.__resetTransportForTests(); }
  });

  test('an empty queue is said plainly rather than as a number', async () => {
    const sent = [];
    notifier.__setTransportForTests({ sendMail: async (m) => { sent.push(m); return {}; } });
    try {
      await withEnv(undefined, () => notifier.sendLoginNotification({ username: 'will', pendingFacts: 0 }));
      assert.match(sent[0].text, /Nothing is waiting/i);
    } finally { notifier.__resetTransportForTests(); }
  });

  test('a send failure is reported, never dressed up as a send', async () => {
    notifier.__setTransportForTests({ sendMail: async () => { throw new Error('smtp refused'); } });
    try {
      const r = await withEnv(undefined, () => notifier.sendLoginNotification({ username: 'will', pendingFacts: 1 }));
      assert.equal(r.sent, false);
      assert.match(r.reason, /smtp refused/);
    } finally { notifier.__resetTransportForTests(); }
  });
});

describe('shape and provenance', () => {
  test('normalisation accepts snake_case and fills gaps without throwing', () => {
    const c = bc.normaliseCandidate({ fact_key: 'Some Key', fact_value: ' x ', source_label: '07A', gap_id: 4 });
    assert.equal(c.factKey, 'some_key');
    assert.equal(c.factValue, 'x');
    assert.equal(c.gapId, 4);
    assert.doesNotThrow(() => bc.normaliseCandidate(null));
  });

  test('an approved fact carries a domain, so the existing clearance filter governs it', () => {
    const rec = bc.toBrainRecord({
      domain: 'finance_full',
      fact_key: 'september_turnover_forecast',
      fact_value: 'GBP 44,000.',
      source_label: '07A',
      decided_by_name: 'Scott Mercer'
    });
    assert.equal(rec.domain, 'finance_full');

    // The point of the shape: no second access model. A finance fact
    // reaches the owner and does not reach the driver, decided by the same
    // function every other record goes through.
    const owner = clearance.filterByClearance('scott_mercer', 'finance_accounts', [rec]);
    const driver = clearance.filterByClearance('mike_evans', 'finance_accounts', [rec]);
    assert.equal(owner.length, 1, 'the owner view should see an approved finance fact');
    assert.equal(driver.length, 0, 'the narrowest persona must not see it');
  });
});
