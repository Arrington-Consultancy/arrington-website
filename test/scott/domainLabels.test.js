// Scott AI Demonstration: every domain the record set uses has a name a
// person can read.
//
// This test exists because its absence was a defect. The comment above
// DOMAIN_LABELS in lib/scott/clearance.js said "the Company Brain test
// asserts this map stays complete for every domain in the dataset". No
// such test existed. Fifteen domains had no label, so the Company Brain
// rendered raw database slugs ('assets_ops', 'vehicle_status' and thirteen
// narrower ones) in a list where every other row read as a sentence.
//
// Two of them were visible to the owner persona and therefore on the first
// screen anybody would look at. The other thirteen only surface for the
// people who hold those narrow domains, which is exactly why reading the
// screen was never going to find them and checking the map against the
// data was.
//
// The check runs in BOTH directions on purpose. Completeness alone is
// satisfied by labelling every string anyone can think of, and a label for
// a domain that carries no record is noise on a page whose whole claim is
// that it shows the record set rather than the permission model.

const { describe, test } = require('node:test');
const assert = require('node:assert');

const clearance = require('../../lib/scott/clearance');
const contextBuilders = require('../../lib/scott/data/contextBuilders');

// Every domain the dataset actually uses, as a record's own domain and as
// a per-field domain, since both reach the reader through the same label.
function domainsInUse() {
  const used = new Set();
  contextBuilders.allDeepFactRecords().forEach((record) => {
    if (!record) return;
    if (record.domain) used.add(record.domain);
    if (record.fieldDomains) {
      Object.values(record.fieldDomains).forEach((d) => { if (d) used.add(d); });
    }
  });
  return used;
}

describe('every domain in the record set has a readable name', () => {
  test('no domain in use falls back to its raw slug', () => {
    const missing = [...domainsInUse()]
      .filter((d) => !Object.prototype.hasOwnProperty.call(clearance.DOMAIN_LABELS, d))
      .sort();
    assert.deepEqual(missing, [],
      `these domains would render as raw slugs on the Company Brain: ${missing.join(', ')}`);
  });

  test('domainLabel never returns the slug it was given', () => {
    [...domainsInUse()].forEach((d) => {
      const label = clearance.domainLabel(d);
      assert.notEqual(label, d, `${d} has no human label`);
      assert.ok(label && label.trim().length > 2, `${d} has an empty or stub label`);
    });
  });

  test('the labels read as names, not as slugs', () => {
    // A label still carrying an underscore is the defect wearing a
    // disguise. Deliberately NOT asserted: that the label differs from the
    // slug with its underscores replaced by spaces. 'yarn_stock' is
    // genuinely called 'Yarn stock' and that is the right name, so the
    // stricter rule would only force a good label to be made worse.
    Object.entries(clearance.DOMAIN_LABELS).forEach(([domain, label]) => {
      assert.doesNotMatch(label, /_/, `${domain}: label still contains an underscore`);
      assert.match(label, /^[A-Z]/, `${domain}: label does not start as a sentence`);
    });
  });

  test('the map carries no label for a domain that holds no record', () => {
    // The page is a map of the record set. A label with nothing behind it
    // would promise an area that does not exist.
    const used = domainsInUse();
    const orphans = Object.keys(clearance.DOMAIN_LABELS).filter((d) => !used.has(d)).sort();
    assert.deepEqual(orphans, [],
      `labels with no records behind them: ${orphans.join(', ')}`);
  });
});
