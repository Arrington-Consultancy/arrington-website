// The sidebar's social strip.
//
// Two properties matter here and neither is cosmetic: the platform list
// must stay the approved four, and the connection state must not leak to
// a viewer who is not cleared for it.
const test = require('node:test');
const assert = require('node:assert/strict');

const { PLATFORMS, platformsForViewer } = require('../../lib/scott/social/platforms');
const deepFacts = require('../../lib/scott/deepBusinessFacts');

test('the platform list is exactly the approved four', () => {
  // The approved v0.1 social expansion named Facebook, Instagram,
  // LinkedIn and X. A fifth platform is a new source, not a new icon, so
  // it goes to Governance rather than being added here quietly. This
  // test exists to make that a deliberate act.
  assert.deepEqual(PLATFORMS.map((p) => p.name), ['Facebook', 'Instagram', 'LinkedIn', 'X']);
});

test('the strip matches the accounts the demonstration actually holds', () => {
  const dataPlatforms = deepFacts.SOCIAL_ACCOUNTS.map((a) => a.platform).sort();
  assert.deepEqual(
    PLATFORMS.map((p) => p.name).sort(), dataPlatforms,
    'the sidebar would advertise a platform the records do not describe, or omit one they do'
  );
});

test('a cleared viewer sees the real connection state, including "not connected"', () => {
  const out = platformsForViewer({ canSee: () => true, accounts: deepFacts.SOCIAL_ACCOUNTS });
  const x = out.find((p) => p.id === 'x');
  assert.equal(x.connected, false, 'X has no account opened; the strip must not imply otherwise');
  assert.equal(out.find((p) => p.id === 'facebook').connected, true);
});

test('an uncleared viewer is told nothing about connection state', () => {
  const out = platformsForViewer({ canSee: () => false, accounts: deepFacts.SOCIAL_ACCOUNTS });
  // null, not false. "You may not see this" and "there is nothing here"
  // must not render identically - that difference is the whole point of
  // the clearance demonstration, and a status dot is a disclosure.
  assert.ok(out.every((p) => p.connected === null), 'connection state leaked to a viewer without marketing_performance');
  assert.equal(out.length, 4, 'the platforms themselves are navigation and stay visible');
});

test('a missing or unreadable account list never invents a connection', () => {
  for (const accounts of [undefined, null, []]) {
    const out = platformsForViewer({ canSee: () => true, accounts });
    assert.ok(out.every((p) => p.connected === false), 'an absent record produced a claimed connection');
  }
});
