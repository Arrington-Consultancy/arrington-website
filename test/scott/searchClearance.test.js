// Search as a clearance bypass route.
//
// 07Q is explicit: "attempting to bypass a restriction through Company
// Brain, search, another worker or prompt wording does not change
// clearance". Search is the easiest of those four to actually attempt,
// and until 29/08/2026 it was the one that worked: /api/scott/search
// returned every matching job, enquiry and customer row to any
// authenticated portal user, with no clearance check of any kind, and
// with the raw row including its price, its risk note and the customer's
// private notes.
//
// Three separate things have to hold, and a test for only the first would
// pass while the other two leaked:
//   1. whole categories are withheld,
//   2. restricted FIELDS are stripped from rows that are otherwise shown,
//   3. the Company Brain snippet is built after redaction, not before.
const test = require('node:test');
const assert = require('node:assert');

const clearance = require('../../lib/scott/clearance');
const contextBuilders = require('../../lib/scott/data/contextBuilders');
const facts = require('../../lib/scott/deepBusinessFacts');

test('Company Brain search respects clearance', async (t) => {
  const all = contextBuilders.allDeepFactRecords();

  await t.test('a human reading directly is gated by persona alone', () => {
    // filterAndRedact with a null worker means "nobody is mediating this
    // read". Routing that through workerCanReadDomain would return
    // nothing at all, which is how the Company Brain search silently
    // returned zero results for every persona including the owner.
    assert.ok(clearance.filterAndRedact('scott_mercer', null, all).length > 100,
      'the owner reading directly must see the whole brain');
    assert.equal(clearance.filterAndRedact('mike_evans', null, all).length, 0,
      'the narrowest persona must see none of it');
  });

  await t.test('visibility is graduated, not all-or-nothing', () => {
    const count = (p) => clearance.filterAndRedact(p, null, all).length;
    const scott = count('scott_mercer');
    const tony = count('tony_marsh');
    const jo = count('jo_bell');
    assert.ok(scott > tony, `owner (${scott}) must see more than senior management (${tony})`);
    assert.ok(tony > jo, `senior management (${tony}) must see more than a knitting operative (${jo})`);
    assert.ok(jo > 0, 'a knitting operative must still see her own yarn stock');
  });

  await t.test('every record returned is one the reader is cleared for', () => {
    Object.keys(clearance.PERSONAS).forEach((personaId) => {
      clearance.filterAndRedact(personaId, null, all).forEach((r) => {
        assert.ok(clearance.personaCanSeeDomain(personaId, r.domain),
          `${personaId} was handed a ${r.domain} record`);
      });
    });
  });

  await t.test('a snippet cannot quote a field the reader cannot see', () => {
    // The ordering bug worth guarding: redact first, then take the
    // snippet. Snippet-then-redact would hand back the restricted
    // sentence verbatim while the record around it looked correctly
    // filtered.
    const enquiry = facts.PIPELINE_ENQUIRIES.find((e) => e.detailRestricted);
    assert.ok(enquiry, 'expected an enquiry with a restricted detail');
    const redacted = clearance.filterAndRedact('tony_marsh', null, [enquiry])[0];
    assert.ok(redacted, 'Tony can see leads, so the record itself must survive');
    const serialised = JSON.stringify(redacted);
    assert.ok(!serialised.includes(enquiry.detailRestricted),
      'the restricted sentence must not survive into anything a snippet is cut from');
  });
});

test('search category and field gating', async (t) => {
  // These mirror the constants the route uses. Kept as an explicit table
  // so the test states the intended rule rather than re-deriving it from
  // the implementation it is meant to be checking.
  const CATEGORY_DOMAINS = { jobs: 'jobs_ops', enquiries: 'leads', customers: 'customers_contact' };

  await t.test('the narrowest personas get no searchable category at all', () => {
    ['mike_evans', 'jo_bell'].forEach((personaId) => {
      const visible = Object.values(CATEGORY_DOMAINS)
        .filter((d) => clearance.personaCanSeeDomain(personaId, d));
      assert.deepEqual(visible, [], `${personaId} must not be able to search company records`);
    });
  });

  await t.test('office admin can find customers and enquiries but not job margin', () => {
    assert.ok(clearance.personaCanSeeDomain('chloe_reed', 'customers_contact'));
    assert.ok(clearance.personaCanSeeDomain('chloe_reed', 'leads'));
    assert.ok(!clearance.personaCanSeeDomain('chloe_reed', 'job_margin'),
      'a job price must not come back in her search results');
  });

  await t.test('senior management can see margin, the workshop cannot', () => {
    assert.ok(clearance.personaCanSeeDomain('tony_marsh', 'job_margin'));
    ['ellie_park', 'ravi_singh', 'jo_bell', 'mike_evans'].forEach((p) => {
      assert.ok(!clearance.personaCanSeeDomain(p, 'job_margin'), `${p} must not see job margin`);
    });
  });
});
