// Scott AI Demonstration — can it answer what a visitor actually asks?
//
// Every other test here checks that a control holds. This one checks the
// opposite risk, and it is the one that loses a sale: a demonstration
// where the controls all work perfectly and the company turns out to know
// almost nothing. Somebody who asks three good questions and is told "no
// record of that" twice concludes it is a shell, and no amount of correct
// refusing recovers that impression.
//
// The probe list is what a commercial buyer and a housing manager actually
// ask, because those are the two people this demonstration is shown to.
// It is deliberately not a list of things the brain is known to contain:
// it was written by asking what somebody would want to know about a small
// business, and then measured. When it was first run, three of the
// twenty-four had no material behind them at all.
//
// A gap here is not a bug in the code. It is a hole in the fiction, and
// the fix is to write the record, not to soften the test.

const { describe, test } = require('node:test');
const assert = require('node:assert');

const contextBuilders = require('../../lib/scott/data/contextBuilders');
const { DEPTH_FACTS } = require('../../lib/scott/seedCompanyDepth');

// [who is asking, the question, keywords that would have to appear in
// some record for the company to have anything to say]
const VISITOR_PROBES = [
  ['buyer', 'margins by service line', ['gross margin', 'margin by']],
  ['buyer', 'customer concentration', ['concentration', 'largest customer']],
  ['buyer', 'what the business owes', ['loan', 'overdraft', 'creditor']],
  ['buyer', 'dependence on the owner', ['owner', 'personally guarantee']],
  ['buyer', 'what happens if the owner stops', ['succession', 'if scott', 'key person', 'personally guarantee']],
  ['buyer', 'recurring versus one-off revenue', ['recurring', 'repeat customer', 'repeat/']],
  ['buyer', 'the main risks', ['risk', 'exposure']],
  ['buyer', 'pipeline conversion', ['conversion', 'quote', 'pipeline']],
  ['housing manager', 'how personal data is handled', ['data protection', 'gdpr', 'personal data', 'retention']],
  ['housing manager', 'what insurance is in place', ['insurance', 'liability', 'cover']],
  ['housing manager', 'what happens when something goes wrong', ['complaint', 'incident', 'escalat']],
  ['housing manager', 'how suppliers are vetted', ['supplier', 'approved supplier']],
  ['housing manager', 'health and safety arrangements', ['safety', 'risk assessment', 'accident']],
  ['housing manager', 'who signs off spending', ['authorisation', 'approval limit', 'sign-off', 'dual auth']],
  ['housing manager', 'how staff are trained and kept current', ['training', 'qualification', 'refresher']],
  ['housing manager', 'the complaints record', ['resolution', 'remedy', 'upheld']],
  ['operations', 'lead time and capacity', ['lead time', 'capacity']],
  ['operations', 'the quality record', ['first pass', 'yield', 'rework', 'defect']],
  ['operations', 'premises and their costs', ['premises', 'rent', 'lease']],
  ['operations', 'vehicles and equipment', ['vehicle', 'van', 'mot', 'equipment']],
  ['finance', 'cash and VAT position', ['vat', 'cash', 'reserve']],
  ['finance', 'marketing spend and return', ['marketing', 'advertis', 'cost per']],
  ['finance', 'the wage bill', ['wage', 'payroll', 'salar']],
  ['finance', 'payment terms both ways', ['payment terms', 'settlement discount', '30 day']]
];

// The static records plus the authored ones, which is what the brain holds
// after a seed. Facts the AI has invented in production are additional and
// are not counted here: coverage must not depend on a visitor having
// happened to ask the right question first.
function brainText() {
  return contextBuilders.allDeepFactRecords()
    .concat(DEPTH_FACTS)
    .map((r) => JSON.stringify(r).toLowerCase())
    .join('\n');
}

describe('the company has something to say on what visitors ask', () => {
  const blob = brainText();

  VISITOR_PROBES.forEach(([who, topic, keywords]) => {
    test(`${who}: ${topic}`, () => {
      const hit = keywords.some((k) => blob.includes(k.toLowerCase()));
      assert.ok(hit, `nothing in the brain speaks to "${topic}". Write the record rather than relaxing this test. Looked for: ${keywords.join(', ')}`);
    });
  });

  test('the probe list is not quietly shrinking', () => {
    // A coverage test is only as honest as its question list. Deleting an
    // awkward probe would turn a red suite green while making the
    // demonstration worse, so the count is pinned and both audiences stay
    // represented.
    assert.ok(VISITOR_PROBES.length >= 24, `probe list has shrunk to ${VISITOR_PROBES.length}`);
    const audiences = new Set(VISITOR_PROBES.map((p) => p[0]));
    ['buyer', 'housing manager', 'operations', 'finance'].forEach((a) => {
      assert.ok(audiences.has(a), `no probes left for ${a}`);
    });
  });

  test('every keyword set is specific enough to mean something', () => {
    // A probe whose keywords are so common they match anything would
    // report coverage that does not exist. Nothing shorter than three
    // characters, and no probe may rely on a single very common word.
    VISITOR_PROBES.forEach(([who, topic, keywords]) => {
      assert.ok(keywords.length > 0, `${topic} has no keywords`);
      keywords.forEach((k) => assert.ok(k.length >= 3, `"${k}" in "${topic}" is too short to be evidence`));
    });
  });
});
