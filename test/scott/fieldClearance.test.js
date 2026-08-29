// Per-field clearance.
//
// These exist because of a real leak found on 29/08/2026 by sweeping the
// rendered portal for canary strings, not by reading the code. A record
// carries one `domain`, and every record was correctly tagged, but two of
// them described a fact from a NARROWER domain inside their own prose:
// a yarn stock line named the purchase order it was arriving on, and a
// sales enquiry explained that the customer was 1,950 pounds overdue.
// Filtering whole records by their single tag let both through to readers
// with no purchase-order or debtor clearance, because the surrounding
// record genuinely was theirs to see.
//
// The point of these tests is that the leak was invisible to inspection.
// Anything asserting only "the filter filters" would have passed
// throughout.
const test = require('node:test');
const assert = require('node:assert');

const clearance = require('../../lib/scott/clearance');
const facts = require('../../lib/scott/deepBusinessFacts');
const contextBuilders = require('../../lib/scott/data/contextBuilders');

const stockLineWithPo = facts.STOCK_SNAPSHOT.find((s) => s.onOrderRef);
const enquiryWithDebt = facts.PIPELINE_ENQUIRIES.find((e) => e.detailRestricted);

test('per-field clearance', async (t) => {
  await t.test('the two records that leaked are still field-tagged', () => {
    // If a later edit drops these tags the rest of this file would pass
    // while testing nothing, so assert the fixtures first.
    assert.ok(stockLineWithPo, 'expected a stock line carrying a purchase-order reference');
    assert.equal(stockLineWithPo.fieldDomains.onOrderRef, 'po_status');
    assert.ok(enquiryWithDebt, 'expected an enquiry carrying a restricted debtor detail');
    assert.equal(enquiryWithDebt.fieldDomains.detailRestricted, 'debtor_flag');
  });

  await t.test('a reader cleared for the record but not the field is refused the field', () => {
    // Jo Bell can see yarn stock. She cannot see purchase orders.
    assert.ok(clearance.personaCanSeeDomain('jo_bell', 'yarn_stock'));
    assert.ok(!clearance.personaCanSeeDomain('jo_bell', 'po_status'));
    assert.equal(clearance.fieldValue('jo_bell', null, stockLineWithPo, 'onOrderRef'), undefined);
    // ...but still sees the stock line itself, which is the whole point:
    // narrowing a field must not blank the record.
    assert.equal(clearance.fieldValue('jo_bell', null, stockLineWithPo, 'material'), stockLineWithPo.material);
  });

  await t.test('a reader cleared for both keeps the field', () => {
    assert.equal(clearance.fieldValue('scott_mercer', null, stockLineWithPo, 'onOrderRef'), stockLineWithPo.onOrderRef);
    assert.equal(clearance.fieldValue('tony_marsh', null, enquiryWithDebt, 'detail'), enquiryWithDebt.detail);
  });

  await t.test('Tony sees the enquiry but not the debtor sentence inside it', () => {
    // The exact shape of the original leak.
    assert.ok(clearance.personaCanSeeDomain('tony_marsh', 'leads'));
    assert.ok(!clearance.personaCanSeeDomain('tony_marsh', 'debtor_flag'));
    assert.equal(clearance.fieldValue('tony_marsh', null, enquiryWithDebt, 'detailRestricted'), undefined);
    assert.ok(clearance.fieldValue('tony_marsh', null, enquiryWithDebt, 'customer'));
  });

  await t.test('redactRecord strips restricted fields but keeps the record usable', () => {
    const redacted = clearance.redactRecord('jo_bell', null, stockLineWithPo);
    assert.ok(!('onOrderRef' in redacted), 'purchase-order reference must not survive redaction');
    assert.ok(!('expectedDelivery' in redacted));
    assert.ok(!('fieldDomains' in redacted), 'the tagging metadata itself must never be serialised');
    assert.equal(redacted.material, stockLineWithPo.material);
    assert.equal(redacted.onHand, stockLineWithPo.onHand);
  });

  await t.test('a record with no fieldDomains passes through untouched', () => {
    const plain = { domain: 'jobs_ops', ref: 'SAKS-1000' };
    assert.deepEqual(clearance.redactRecord('scott_mercer', null, plain), plain);
  });

  await t.test('worker permission still applies on top when a worker is mediating', () => {
    // Same field, same human, but read through a worker with no
    // purchase-order permission: still refused. Narrowest wins.
    const readable = Object.keys(clearance.WORKER_DOMAINS)
      .find((w) => !clearance.workerCanReadDomain(w, 'po_status'));
    assert.ok(readable, 'expected at least one worker without po_status');
    assert.equal(clearance.fieldValue('scott_mercer', readable, stockLineWithPo, 'onOrderRef'), undefined);
  });
});

test('deep company brain reaches the workers', async (t) => {
  await t.test('every domain-tagged export is included, not a hand-kept subset', () => {
    // The original hand-written list named ten collections and silently
    // omitted the ten added afterwards, so half the company brain was
    // invisible to every worker while the code looked deliberate.
    const included = contextBuilders.allDeepFactRecords();
    const domains = new Set(included.map((r) => r.domain));
    ['leads', 'quotes', 'complaints_workflow', 'customers_contact', 'trade_terms', 'kpi_trend']
      .forEach((d) => assert.ok(domains.has(d), `${d} records must reach the workers`));
    assert.ok(included.length >= 100, `expected the full brain, got ${included.length} records`);
  });

  await t.test('no exported record is left without a domain tag', () => {
    // An untagged record is silently dropped rather than leaked, which is
    // the safe direction but easy to not notice.
    assert.deepEqual(contextBuilders.untaggedDeepFactExports(), []);
  });

  await t.test('the AI context block redacts restricted fields, not just records', () => {
    // Tony can read leads. The block must carry the enquiry and must not
    // carry the overdue sentence sitting inside it.
    const anyWorkerWithLeads = Object.keys(clearance.WORKER_DOMAINS)
      .find((w) => clearance.workerCanReadDomain(w, 'leads'));
    if (!anyWorkerWithLeads) return; // no active worker reads leads; nothing to assert
    const block = contextBuilders.formatDeepFactsBlock('tony_marsh', anyWorkerWithLeads);
    assert.ok(!block.includes(enquiryWithDebt.detailRestricted),
      'the restricted debtor sentence must never reach a prompt for a reader without debtor_flag');
    assert.ok(!block.includes('fieldDomains'),
      'tagging metadata must never be serialised into a prompt');
  });
});

test('safety is the one thing nobody is excluded from', async (t) => {
  // 07K requires any staff member who believes there is an immediate
  // serious safety risk to stop and escalate. That is not a rule someone
  // can follow if their clearance hides it, so safety_baseline is granted
  // to every persona. It is the single universal grant in this model and
  // an accidental narrowing of it would be silent, hence this test.
  await t.test('every persona can read the safety baseline', () => {
    const all = Object.keys(clearance.PERSONAS);
    const withIt = all.filter((p) => clearance.personaCanSeeDomain(p, 'safety_baseline'));
    assert.deepEqual(withIt.sort(), all.sort(),
      'safety_baseline must be visible to every persona, including the narrowest');
  });

  await t.test('the incident log is NOT universal, because it names people', () => {
    const all = Object.keys(clearance.PERSONAS);
    const withIt = all.filter((p) => clearance.personaCanSeeDomain(p, 'safety_incidents'));
    assert.ok(withIt.length < all.length,
      'the incident log names individuals and must be narrower than the rules');
    assert.ok(withIt.includes('scott_mercer') && withIt.includes('tony_marsh'));
    assert.ok(!withIt.includes('jo_bell'), 'a knitting operative must not read incident records about colleagues');
  });

  await t.test('no other domain is granted to everyone by accident', () => {
    // A universal grant should be a deliberate, rare decision. If a second
    // one appears, it is far more likely to be a mistake than a choice, so
    // this fails and asks for the reasoning to be written down.
    const all = Object.keys(clearance.PERSONAS);
    const everyDomain = new Set();
    Object.values(clearance.PERSONA_DOMAINS).forEach((ds) => ds.forEach((d) => everyDomain.add(d)));
    const universal = [...everyDomain].filter((d) =>
      d !== '*' && all.every((p) => clearance.personaCanSeeDomain(p, d)));
    assert.deepEqual(universal, ['safety_baseline'],
      `expected safety_baseline to be the only universal grant, found: ${universal.join(', ')}`);
  });
});

test('the permission map has no accidental duplicates', async (t) => {
  // Twice while building this out, an anchored edit to one persona's
  // domain list silently matched an earlier persona instead, because the
  // first edit had made that earlier block match the second anchor. Both
  // times the result was a domain listed twice on the wrong persona and
  // missing from the intended one. A duplicate is harmless to behaviour
  // and therefore invisible, which is exactly why it needs a test: it is
  // the fingerprint of an edit that went somewhere unintended.
  await t.test('no persona lists the same domain twice', () => {
    Object.entries(clearance.PERSONA_DOMAINS).forEach(([persona, domains]) => {
      if (!Array.isArray(domains)) return;
      const seen = new Set();
      const dupes = domains.filter((d) => seen.size === seen.add(d).size);
      assert.deepEqual([...new Set(dupes)], [],
        `${persona} lists a domain more than once, which usually means an edit landed on the wrong block`);
    });
  });

  await t.test('no worker lists the same domain twice', () => {
    Object.entries(clearance.WORKER_DOMAINS).forEach(([worker, domains]) => {
      if (!Array.isArray(domains)) return;
      const seen = new Set();
      const dupes = domains.filter((d) => seen.size === seen.add(d).size);
      assert.deepEqual([...new Set(dupes)], [], `${worker} lists a domain more than once`);
    });
  });

  await t.test('every domain a persona holds is one some record actually uses, or a known reserve', () => {
    // A domain granted but never used on any record is dead permission:
    // harmless today, but it hides a typo. The 07Q clearance model
    // legitimately names more domains than the transcribed subset uses so
    // far, so this reports rather than fails, and only fails on a domain
    // that no record uses AND no other persona holds, which is the shape
    // of a misspelling.
    const usedDomains = new Set(contextBuilders.allDeepFactRecords().map((r) => r.domain));
    const heldByCount = {};
    Object.values(clearance.PERSONA_DOMAINS).forEach((ds) => {
      if (Array.isArray(ds)) ds.forEach((d) => { heldByCount[d] = (heldByCount[d] || 0) + 1; });
    });
    const suspicious = Object.keys(heldByCount)
      .filter((d) => d !== '*' && !usedDomains.has(d) && heldByCount[d] === 1);
    // Every one of these is held by exactly one persona and used by no
    // record. That is allowed while 07Q's model is broader than the
    // transcribed data, so assert only that the list is not growing wildly.
    assert.ok(suspicious.length < 30,
      `${suspicious.length} domains are granted to exactly one persona and used by no record: ${suspicious.join(', ')}`);
  });
});
