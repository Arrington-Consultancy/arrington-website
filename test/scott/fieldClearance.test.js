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
