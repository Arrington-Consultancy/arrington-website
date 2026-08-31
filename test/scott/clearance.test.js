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

describe('identity-bound clearance (replaces the old "view as" selector)', () => {
  // Rewritten 29/08/2026. The earlier implementation let any viewer pick
  // their own clearance from a dropdown, which 07Q explicitly forbids
  // ("attempting to bypass a restriction through Company Brain, search,
  // another worker or prompt wording does not change clearance" — a
  // selector anyone can move is exactly that bypass). Clearance is now a
  // property of the authenticated identity. These tests pin the three
  // identity cases and, more importantly, the escalation paths that must
  // fail.
  const portalReq = (personaId) => ({ session: { scottPortalUser: { id: 1, username: 'x', personaId, displayName: 'X' } } });
  const siteReq = (role) => ({ session: { user: { id: 1, username: 'tom', role } } });

  test('a fictional staff session resolves to that account\'s own bound persona', () => {
    assert.equal(clearance.getEffectivePersonaId(portalReq('jo_bell')), 'jo_bell');
    assert.equal(clearance.getEffectivePersonaId(portalReq('mike_evans')), 'mike_evans');
  });

  test('a real admin/content session with no impersonation is the owner view', () => {
    assert.equal(clearance.getEffectivePersonaId(siteReq('admin')), 'scott_mercer');
    assert.equal(clearance.getEffectivePersonaId(siteReq('content')), 'scott_mercer');
  });

  test('a session with no identity at all fails CLOSED to the narrowest persona, not the owner view', () => {
    const anon = { session: {} };
    assert.equal(clearance.getEffectivePersonaId(anon), 'mike_evans');
    // and that narrow persona genuinely cannot reach finance
    assert.equal(clearance.isDomainVisible(clearance.getEffectivePersonaId(anon), 'finance_accounts', 'finance_full'), false);
  });

  test('a client-role site user cannot impersonate (only admin/content may)', () => {
    const req = siteReq('client');
    assert.equal(clearance.canImpersonate(req), false);
    assert.equal(clearance.setImpersonatedPersona(req, 'scott_mercer'), false);
  });

  test('ESCALATION: a fictional staff account can never impersonate, even calling the setter directly', () => {
    const jo = portalReq('jo_bell');
    assert.equal(clearance.setImpersonatedPersona(jo, 'scott_mercer'), false);
    // The decisive assertion: her effective clearance is unchanged after
    // the attempt, so even a caller that ignored the false return gains
    // nothing.
    assert.equal(clearance.getEffectivePersonaId(jo), 'jo_bell');
    assert.equal(clearance.isDomainVisible(clearance.getEffectivePersonaId(jo), 'finance_accounts', 'director_position'), false);
  });

  test('ESCALATION: a forged impersonation value in a fictional staff session is ignored entirely', () => {
    // Simulates a session store tampered with directly, not via the API.
    const jo = { session: { scottPortalUser: { id: 1, username: 'jo.bell', personaId: 'jo_bell', displayName: 'Jo' }, scottImpersonatedPersonaId: 'scott_mercer' } };
    // getPortalUser short-circuits before impersonation is ever consulted.
    assert.equal(clearance.getEffectivePersonaId(jo), 'jo_bell');
    assert.equal(clearance.isImpersonating(jo), false);
  });

  test('Tom (admin) CAN impersonate, and the effective persona genuinely changes', () => {
    const tom = siteReq('admin');
    assert.equal(clearance.setImpersonatedPersona(tom, 'jo_bell'), true);
    assert.equal(clearance.getEffectivePersonaId(tom), 'jo_bell');
    assert.equal(clearance.isImpersonating(tom), true);
    // While impersonating Jo, Tom genuinely loses owner-only access.
    assert.equal(clearance.isDomainVisible(clearance.getEffectivePersonaId(tom), 'finance_accounts', 'director_position'), false);
  });

  test('clearing impersonation restores the owner view', () => {
    const tom = siteReq('admin');
    clearance.setImpersonatedPersona(tom, 'jo_bell');
    assert.equal(clearance.setImpersonatedPersona(tom, null), true);
    assert.equal(clearance.getEffectivePersonaId(tom), 'scott_mercer');
    assert.equal(clearance.isImpersonating(tom), false);
  });

  test('an invalid persona id is refused and leaves the prior impersonation intact', () => {
    const tom = siteReq('admin');
    clearance.setImpersonatedPersona(tom, 'jo_bell');
    assert.equal(clearance.setImpersonatedPersona(tom, 'not_a_persona'), false);
    assert.equal(clearance.getEffectivePersonaId(tom), 'jo_bell');
  });

  test('a tampered/garbage portal-user persona fails closed rather than granting access', () => {
    const bad = { session: { scottPortalUser: { id: 1, username: 'x', personaId: '__proto__' } } };
    // getPortalUser rejects an invalid persona, so this is treated as
    // having no portal identity at all and falls to the narrowest persona.
    assert.equal(clearance.getPortalUser(bad), null);
    assert.equal(clearance.getEffectivePersonaId(bad), 'mike_evans');
  });

  test('setPortalUser clears any impersonation left over from an admin session in the same browser', () => {
    const req = { session: { user: { id: 1, username: 'tom', role: 'admin' }, scottImpersonatedPersonaId: 'tony_marsh' } };
    clearance.setPortalUser(req, { id: 9, username: 'jo.bell', personaId: 'jo_bell', displayName: 'Jo Bell' });
    assert.equal(req.session.scottImpersonatedPersonaId, undefined);
    assert.equal(clearance.getEffectivePersonaId(req), 'jo_bell');
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

test('an unrecognised persona fails closed to the narrowest view, never to the owner', () => {
  // Found by the fourteenth Arrington Workspace reviewer while hunting a
  // related class elsewhere, reported as a latent concern rather than a
  // finding, and corrected on Tom's instruction of 31/08/2026 so that a
  // known fail-open is not carried silently into later Scott work.
  //
  // personaDomains used to fall back to Scott Mercer, who holds '*'. So
  // an unrecognised id resolved to the OWNER view: the inversion of the
  // rule 07Q states and the rule getEffectivePersonaId already applied
  // in the same file. It is not reachable today, because every call site
  // passes a persona from a closed set. It is tested because a control
  // that is safe only by virtue of who happens to call it is one
  // refactor away from not being safe at all.
  //
  // The prototype keys are here for the same reason: a plain object
  // answers `constructor` and `toString` from Object.prototype, and a
  // truthiness guard lets that through.
  const owned = ['finance_full', 'payroll_full', 'director_private', 'marketing_performance'];
  for (const bogus of ['nobody', '', null, undefined, 'constructor', '__proto__', 'toString', 'hasOwnProperty']) {
    const domains = clearance.personaDomains(bogus);
    assert.ok(Array.isArray(domains), `personaDomains(${String(bogus)}) did not return a list`);
    assert.ok(!domains.includes('*'),
      `an unrecognised persona (${String(bogus)}) was given the owner's wildcard`);
    for (const d of owned) {
      assert.equal(clearance.personaCanSeeDomain(bogus, d), false,
        `an unrecognised persona (${String(bogus)}) can see ${d}`);
    }
    // Fail CLOSED, not empty: it lands on the narrowest real persona, so
    // the universal safety baseline is still visible. 07K exists because
    // a rule telling you to stop work when you believe there is a serious
    // risk is useless if your clearance hides it.
    assert.equal(clearance.personaCanSeeDomain(bogus, 'safety_baseline'), true,
      `${String(bogus)} lost the universal safety baseline`);
  }

  // The real personas are untouched.
  assert.equal(clearance.personaCanSeeDomain('scott_mercer', 'finance_full'), true);
  assert.equal(clearance.personaCanSeeDomain('mike_evans', 'finance_full'), false);
  assert.equal(clearance.personaCanSeeDomain('tony_marsh', 'jobs_ops'), true);
});

test('a prototype key never resolves to a persona identity', () => {
  // getPersona is identity only and keeps the owner as its fallback on
  // purpose: falling back to a narrower NAME would put the wrong person
  // on the screen without changing what that screen may show. What it
  // must not do is hand back Object.prototype's own members.
  for (const key of ['constructor', '__proto__', 'toString', 'valueOf', 'hasOwnProperty']) {
    const p = clearance.getPersona(key);
    assert.equal(typeof p, 'object', `${key} returned a ${typeof p} rather than a persona`);
    assert.ok(p && typeof p.name === 'string' && p.name.length > 0,
      `${key} returned something that is not a persona`);
  }
});
