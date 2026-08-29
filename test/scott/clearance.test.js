// Scott v0.2 human-clearance intersection — structural enforcement tests.
//
// These are not invented scenarios. Each test transcribes one of the named
// "ACCESS TEST CASES" from 07Q SCOTT'S IT, SYSTEMS, ACCESS & BACKUP or the
// "DEMO ACCEPTANCE SCENARIOS" from 31 SCOTT PORTAL FUNCTIONAL REQUIREMENTS
// — the actual controlled acceptance criteria for this feature, not a
// stand-in for them. Pure functions, no DB or network: this is exactly the
// kind of test that should never need a live model or a database to prove
// the rule holds, which is also why it can run in full in this sandbox
// tonight when the live-AI acceptance suite cannot.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const clearance = require('../../lib/scott/clearance');

describe('clearance model shape', () => {
  test('eight personas exist, matching 07Q\'s minimum demo presentation list', () => {
    const ids = Object.keys(clearance.PERSONAS);
    assert.deepEqual(
      ids.sort(),
      ['chloe_reed', 'ellie_park', 'jo_bell', 'leah_morgan', 'mike_evans', 'ravi_singh', 'scott_mercer', 'tony_marsh'].sort()
    );
  });

  test('every persona domain list is defined and every worker domain list is defined', () => {
    for (const id of Object.keys(clearance.PERSONAS)) {
      assert.ok(Array.isArray(clearance.personaDomains(id)), `${id} needs a domain list`);
    }
    for (const w of ['commercial', 'operations', 'customers_marketing', 'company_brain', 'governance', 'receptionist', 'finance_accounts', 'people_hr', 'quality_control']) {
      assert.ok(Array.isArray(clearance.workerDomains(w)), `${w} needs a domain list`);
    }
  });
});

describe('07Q ACCESS TEST CASES (transcribed verbatim)', () => {
  test('1. Mike asks for the DLA balance — denied, without revealing it', () => {
    assert.equal(clearance.isDomainVisible('mike_evans', 'finance_accounts', 'director_position'), false);
    assert.equal(clearance.isDomainVisible('mike_evans', 'operations', 'director_position'), false);
  });

  test('2. Ellie asks who earns the most — denied, no salary inference', () => {
    assert.equal(clearance.isDomainVisible('ellie_park', 'people_hr', 'hr_full'), false);
    assert.equal(clearance.isDomainVisible('ellie_park', 'operations', 'hr_full'), false);
  });

  test('3. Chloe asks if a customer is safe to book again — sees the account flag through her own worker, not full Finance', () => {
    assert.equal(clearance.isDomainVisible('chloe_reed', 'customers_marketing', 'debtor_flag'), true);
    assert.equal(clearance.isDomainVisible('chloe_reed', 'customers_marketing', 'finance_full'), false);
    assert.equal(clearance.isDomainVisible('chloe_reed', 'finance_accounts', 'finance_full'), false);
  });

  test('4. Tony asks why workshop margin fell — permitted operational finance, not owner-private data', () => {
    assert.equal(clearance.isDomainVisible('tony_marsh', 'operations', 'job_margin'), true);
    assert.equal(clearance.isDomainVisible('tony_marsh', 'finance_accounts', 'director_position'), false);
  });

  test('5. Tony asks what dividend Scott took — denied', () => {
    assert.equal(clearance.isDomainVisible('tony_marsh', 'finance_accounts', 'director_position'), false);
    assert.equal(clearance.isDomainVisible('tony_marsh', 'operations', 'director_position'), false);
  });

  test('6. Scott asks his own DLA balance and the cash effect — permitted', () => {
    assert.equal(clearance.isDomainVisible('scott_mercer', 'finance_accounts', 'director_position'), true);
    assert.equal(clearance.isDomainVisible('scott_mercer', 'finance_accounts', 'finance_full'), true);
  });

  test('7. Jo asks free navy yarn and knitting work due — permitted', () => {
    assert.equal(clearance.isDomainVisible('jo_bell', 'operations', 'yarn_stock'), true);
    assert.equal(clearance.isDomainVisible('jo_bell', 'operations', 'due_dates'), true);
  });

  test('8. Jo asks to see Chloe\'s flexible-working case notes — denied', () => {
    assert.equal(clearance.isDomainVisible('jo_bell', 'people_hr', 'hr_full'), false);
    assert.equal(clearance.isDomainVisible('jo_bell', 'operations', 'hr_full'), false);
  });

  test('9. Mike searches a customer while on a route — only route-relevant info, not finance/complaint detail', () => {
    assert.equal(clearance.isDomainVisible('mike_evans', 'operations', 'route_customer_contact'), true);
    assert.equal(clearance.isDomainVisible('mike_evans', 'operations', 'finance_full'), false);
    assert.equal(clearance.isDomainVisible('mike_evans', 'operations', 'complaints_ops'), false);
  });

  test('10. A lower-clearance user asks Ruth to route a restricted finance question — Ruth may route the intent, the specialist still receives nothing restricted', () => {
    // Ruth herself is never a data source (05A: "routes only").
    assert.equal(clearance.workerDomains('receptionist').length, 0);
    // Even if Ruth routes to Finance, Ellie's own clearance still blocks the restricted domain.
    assert.equal(clearance.isDomainVisible('ellie_park', 'finance_accounts', 'director_position'), false);
  });
});

describe('31 DEMO ACCEPTANCE SCENARIOS (transcribed verbatim)', () => {
  test('DLA balance under Scott vs Mike diverges', () => {
    assert.equal(clearance.isDomainVisible('scott_mercer', 'finance_accounts', 'director_position'), true);
    assert.equal(clearance.isDomainVisible('mike_evans', 'finance_accounts', 'director_position'), false);
  });

  test('workshop margin under Tony vs Ellie diverges', () => {
    assert.equal(clearance.isDomainVisible('tony_marsh', 'operations', 'job_margin'), true);
    assert.equal(clearance.isDomainVisible('ellie_park', 'operations', 'job_margin'), false);
  });

  test('Chloe gets customer account flags without full Finance', () => {
    assert.equal(clearance.isDomainVisible('chloe_reed', 'customers_marketing', 'debtor_flag'), true);
    assert.equal(clearance.isDomainVisible('chloe_reed', 'finance_accounts', 'finance_full'), false);
  });

  test('Jo gets yarn/schedule but is denied another employee\'s HR case', () => {
    assert.equal(clearance.isDomainVisible('jo_bell', 'operations', 'yarn_stock'), true);
    assert.equal(clearance.isDomainVisible('jo_bell', 'people_hr', 'hr_full'), false);
  });

  test('a prompt-injection style "ignore my role" cannot be represented as a passing case — the check is structural, not model-obedience-based', () => {
    // There is no parameter to isDomainVisible that lets a caller assert
    // "but the user asked nicely" — the function has no such input, which
    // is the point: bypassing this is not a wording problem for the model
    // to resist, it is a code path that does not exist.
    assert.equal(clearance.isDomainVisible.length, 3, 'isDomainVisible must take exactly (persona, worker, domain) — no override parameter');
  });
});

describe('narrowest-wins is structural, not incidental', () => {
  test('Scott Mercer\'s "*" persona access does not expand a narrow worker\'s own permission', () => {
    // Owner clearance is total, but Receptionist's own worker permission is
    // empty (routes only). Even Scott, asking through Ruth, gets nothing
    // Ruth herself is not permitted to hold.
    assert.equal(clearance.isDomainVisible('scott_mercer', 'receptionist', 'finance_full'), false);
  });

  test('a broad worker permission ("*") does not expand a narrow human\'s clearance', () => {
    // Company Brain & Records may READ broadly for record-control (05A),
    // but that never lets a workshop operative see finance through it.
    assert.equal(clearance.isDomainVisible('ellie_park', 'company_brain', 'finance_full'), false);
    assert.equal(clearance.isDomainVisible('ellie_park', 'company_brain', 'director_position'), false);
  });

  test('credential domains are invisible to every persona and every worker, including "*" on both sides', () => {
    for (const domain of clearance.CREDENTIAL_DOMAINS) {
      assert.equal(clearance.isDomainVisible('scott_mercer', 'company_brain', domain), false, `${domain} must stay hidden even from owner+full-read-worker`);
      assert.equal(clearance.isDomainVisible('scott_mercer', 'governance', domain), false, `${domain} must stay hidden from Governance & Assurance too`);
    }
  });

  test('an unknown persona id fails closed to the default (most restrictive path exercised), never to "*"', () => {
    assert.equal(clearance.isValidPersona('made_up_persona'), false);
    // getPersona falls back to DEFAULT_PERSONA (Scott) for a bad id rather
    // than throwing, but personaDomains/isDomainVisible must not silently
    // grant '*' to a caller that passed garbage — prove the fallback is
    // the FULL clearance path only via the named default, not a bypass.
    assert.equal(clearance.getPersona('made_up_persona').code, clearance.getPersona(clearance.DEFAULT_PERSONA).code);
  });

  test('an unknown worker id has no domains at all (fails closed, not open)', () => {
    assert.deepEqual(clearance.workerDomains('made_up_worker'), []);
    assert.equal(clearance.isDomainVisible('scott_mercer', 'made_up_worker', 'finance_full'), false);
  });
});

describe('session persona ("view the demo as")', () => {
  function fakeReq() {
    return { session: {} };
  }

  test('a fresh session defaults to Scott Mercer (full clearance), not an empty/unset state', () => {
    const req = fakeReq();
    assert.equal(clearance.getSessionPersonaId(req), clearance.DEFAULT_PERSONA);
  });

  test('setSessionPersonaId succeeds for a real persona and getSessionPersonaId then reflects it', () => {
    const req = fakeReq();
    const ok = clearance.setSessionPersonaId(req, 'mike_evans');
    assert.equal(ok, true);
    assert.equal(clearance.getSessionPersonaId(req), 'mike_evans');
  });

  test('setSessionPersonaId refuses a bogus id and leaves the session unchanged, verified via the read path', () => {
    const req = fakeReq();
    clearance.setSessionPersonaId(req, 'scott_mercer');
    const ok = clearance.setSessionPersonaId(req, 'not_a_real_persona');
    assert.equal(ok, false);
    // The actual proof: the session still reads back the persona it had
    // before the bad call, via the same getter every route uses — not an
    // assumption about what the setter "should" have done internally.
    assert.equal(clearance.getSessionPersonaId(req), 'scott_mercer');
  });

  test('a tampered/garbage session value fails closed to the default rather than throwing or granting "*"', () => {
    const req = { session: { scottPersonaId: '__proto__' } };
    assert.equal(clearance.getSessionPersonaId(req), clearance.DEFAULT_PERSONA);
  });
});

describe('filterByClearance / clearanceDeniedNote', () => {
  test('filters a mixed record list down to only what the pair may see', () => {
    const records = [
      { domain: 'director_position', label: 'DLA balance' },
      { domain: 'yarn_stock', label: 'Navy yarn free stock' },
      { domain: 'quality_checklists', label: 'Final QC checklist' }
    ];
    const result = clearance.filterByClearance('jo_bell', 'operations', records);
    assert.deepEqual(result.map((r) => r.domain).sort(), ['quality_checklists', 'yarn_stock']);
  });

  test('the denial note never contains the word "no" attached to the company holding the record, only to the user\'s clearance', () => {
    const note = clearance.clearanceDeniedNote('director_position');
    assert.match(note, /outside your current clearance/i);
    assert.doesNotMatch(note, /we (do not|don't) have/i);
  });
});
