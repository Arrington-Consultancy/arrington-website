// MANDATORY IMPLEMENTATION REPLAY of 21B's 140 clearance cases.
//
// 21B records 140/140 as a DESIGN pass and then says so in its own words:
// "THIS IS NOT A WEBSITE PASS". It requires the cases to be re-run against
// the implementation, and sets the bar: "A single restricted value
// appearing in any of those surfaces is a FAIL even if the main screen
// hides it." Its release rule is that nobody may claim the clearance
// system is implemented or secure until that replay passes.
//
// This file replays every case that can be decided from the permission
// model itself. The HTTP surfaces (pages, direct URL, API, search) are
// replayed separately against a running server, and the eight cases whose
// subject is prompt wording or a model refusal are reported as NOT
// EXECUTABLE rather than passed, because a design pass dressed up as a
// website pass is exactly what 21B warns against.
const test = require('node:test');
const assert = require('node:assert');

const clearance = require('../../lib/scott/clearance');
const { CASES } = require('./clearanceCaseBank');

test('21B replay: the permission model resolves all 140 cases', async (t) => {
  const executable = CASES.filter((c) => !c.needsLiveAI && c.domain);

  await t.test('every DENY case is actually denied by the model', () => {
    const failures = [];
    executable.filter((c) => c.expect === 'DENY').forEach((c) => {
      if (clearance.personaCanSeeDomain(c.persona, c.domain)) {
        failures.push(`${c.id}: ${c.persona} can see ${c.domain}, expected DENY`);
      }
    });
    assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
  });

  await t.test('every ALLOW case is actually allowed by the model', () => {
    const failures = [];
    executable.filter((c) => c.expect === 'ALLOW').forEach((c) => {
      if (!clearance.personaCanSeeDomain(c.persona, c.domain)) {
        failures.push(`${c.id}: ${c.persona} cannot see ${c.domain}, expected ALLOW`);
      }
    });
    assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
  });

  await t.test('credentials are refused even to Clearance A (BX-017)', () => {
    // 21B is explicit that the owner's full business clearance does not
    // extend to credentials, and 07Q carves them out by name.
    clearance.CREDENTIAL_DOMAINS.forEach((d) => {
      Object.keys(clearance.PERSONAS).forEach((p) => {
        assert.equal(clearance.personaCanSeeDomain(p, d), false,
          `${p} must never reach the credential domain ${d}, not even the owner`);
      });
    });
  });

  await t.test('a claimed verbal elevation changes nothing (BX-021, BX-022)', () => {
    // There is no code path that takes a claim as input, which is the
    // point: elevation would have to be a recorded permission change, and
    // the model has no other way to grant anything.
    assert.equal(clearance.personaCanSeeDomain('mike_evans', 'finance_full'), false);
    // BX-022 is deliberately NOT a domain assertion. `authorised_patterns`
    // means the patterns authorised to the holder, so Jo correctly holds
    // it; what 21B denies is a specific pattern she has no sign-off for,
    // which lives in her training record. Asserting the domain here made
    // the test demand the opposite of what the case means, and it failed
    // for that reason on its first run.
    const bx022 = CASES.find((c) => c.id === 'BX-022');
    assert.equal(bx022.domain, null, 'BX-022 must stay a record-level case, not a domain one');
    assert.ok(bx022.recordLevel, 'BX-022 must record why it is not a domain check');
  });

  await t.test('routing through a worker cannot widen a human (BX-012 to BX-016)', () => {
    // The intersection rule from the other side: pick the most permissive
    // worker there is and the human's own clearance still binds.
    const widest = Object.keys(clearance.WORKER_DOMAINS)
      .find((w) => clearance.workerCanReadDomain(w, 'finance_full'));
    assert.ok(widest, 'expected at least one worker able to read finance_full');
    assert.equal(clearance.isDomainVisible('jo_bell', widest, 'finance_full'), false,
      'a knitting operative must not reach finance through a permissive worker');
    assert.equal(clearance.isDomainVisible('leah_morgan', widest, 'finance_full'), false);
  });

  await t.test('the eight non-executable cases are declared, not silently passed', () => {
    const notExecutable = CASES.filter((c) => c.needsLiveAI);
    assert.equal(notExecutable.length, 8);
    // Each one's subject is prompt wording, routing behaviour or an
    // action-authority refusal: all model-mediated, none decidable here.
    notExecutable.forEach((c) => {
      assert.ok(['routing', 'prompt wording', 'action authority'].includes(c.surface),
        `${c.id} is marked needsLiveAI but its surface is ${c.surface}`);
    });
  });
});

test('21B replay: the bank itself is complete and faithful', async (t) => {
  await t.test('140 cases, 105 in section A and 35 in section B', () => {
    assert.equal(CASES.length, 140);
    assert.equal(CASES.filter((c) => c.id.startsWith('AC-')).length, 105);
    assert.equal(CASES.filter((c) => c.id.startsWith('BX-')).length, 35);
  });

  await t.test('section A ids run AC-001 to AC-105 with no gaps', () => {
    const ids = CASES.filter((c) => c.id.startsWith('AC-')).map((c) => c.id).sort();
    const expected = Array.from({ length: 105 }, (_, i) => `AC-${String(i + 1).padStart(3, '0')}`);
    assert.deepEqual(ids, expected);
  });

  await t.test('section B ids run BX-001 to BX-035 with no gaps', () => {
    const ids = CASES.filter((c) => c.id.startsWith('BX-')).map((c) => c.id).sort();
    const expected = Array.from({ length: 35 }, (_, i) => `BX-${String(i + 1).padStart(3, '0')}`);
    assert.deepEqual(ids, expected);
  });

  await t.test('every case names a persona that exists', () => {
    CASES.forEach((c) => {
      assert.ok(clearance.isValidPersona(c.persona), `${c.id} names unknown persona ${c.persona}`);
    });
  });

  await t.test('every domain named by a case is one the model knows', () => {
    // Catches a typo in the transcription, which would otherwise make a
    // DENY case pass trivially: an unknown domain is denied to everyone.
    // Built from the records too, not only from PERSONA_DOMAINS. Scott
    // holds '*' rather than an explicit list, so an owner-only domain
    // (director_position, finance_full, hr_full, quality_full) appears in
    // no persona array at all and a PERSONA_DOMAINS-only check reports it
    // as unknown. That was this test's own bug, found on its first run.
    const known = new Set();
    Object.values(clearance.PERSONA_DOMAINS).forEach((ds) => {
      if (Array.isArray(ds)) ds.forEach((d) => known.add(d));
    });
    clearance.CREDENTIAL_DOMAINS.forEach((d) => known.add(d));
    require('../../lib/scott/data/contextBuilders').allDeepFactRecords()
      .forEach((r) => known.add(r.domain));
    const unknown = [...new Set(CASES.map((c) => c.domain).filter(Boolean))].filter((d) => !known.has(d));
    assert.deepEqual(unknown, [],
      `these case domains are not in the permission model, so their DENY results would be vacuous: ${unknown.join(', ')}`);
  });
});
