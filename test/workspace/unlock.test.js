// The workspace second factor.
//
// Governance finding F1, Tom's decision of 31/08/2026: "Do not accept
// the existing CMS-admin takeover risk, and preserve the legitimate
// account recovery route."
//
// The property under test is narrow and specific: after an admin has
// reset the cleared user's site password, that admin holds the right
// username and the right user id and still cannot open the workspace.
// Everything here exists to keep that true.
const test = require('node:test');
const assert = require('node:assert/strict');

const unlock = require('../../lib/workspace/unlock');

const KEY = 'WORKSPACE_ACCESS_PASSPHRASE';
const ORIGINAL = process.env[KEY];
const GOOD = 'a-long-enough-test-passphrase';
test.beforeEach(() => { process.env[KEY] = GOOD; });
test.after(() => {
  if (ORIGINAL === undefined) delete process.env[KEY];
  else process.env[KEY] = ORIGINAL;
});

function session(user = { id: 7, username: 'tom' }) {
  return { session: { user } };
}

test('an unset or trivial passphrase means nobody can unlock, including the owner', () => {
  delete process.env[KEY];
  assert.equal(unlock.configuredPassphrase(), null);
  assert.equal(unlock.passphraseMatches(''), false);
  assert.equal(unlock.passphraseMatches(GOOD), false, 'a match was reported against no configured value');
  const req = session();
  unlock.recordUnlock(req);
  assert.equal(unlock.isUnlocked(req), false, 'an unconfigured environment let a session through');

  // Too short is refused rather than accepted quietly, because a
  // four-character passphrase in Railway would look configured while
  // defending against nothing.
  process.env[KEY] = 'short';
  assert.equal(unlock.configuredPassphrase(), null);
  assert.match(unlock.describeUnlockConfig().detail, /only 5 characters/);
  assert.equal(unlock.describeUnlockConfig().ok, false);
});

test('the config description reports presence and length, never any part of the value', () => {
  const d = unlock.describeUnlockConfig();
  assert.equal(d.ok, true);
  assert.match(d.detail, /length 29/);
  assert.ok(!d.detail.includes(GOOD));
  assert.ok(!d.detail.includes(GOOD.slice(0, 6)), 'the description leaked a prefix of the passphrase');
});

test('only the exact passphrase matches', () => {
  assert.equal(unlock.passphraseMatches(GOOD), true);
  assert.equal(unlock.passphraseMatches(GOOD + ' '), false);
  assert.equal(unlock.passphraseMatches(GOOD.slice(0, -1)), false);
  assert.equal(unlock.passphraseMatches(GOOD.toUpperCase()), false);
  assert.equal(unlock.passphraseMatches(''), false);
  assert.equal(unlock.passphraseMatches(null), false);
  assert.equal(unlock.passphraseMatches(undefined), false);
  // A comparison over fixed-width digests means a candidate of a wildly
  // different length is neither an error nor a crash.
  assert.equal(unlock.passphraseMatches('x'.repeat(5000)), false);
});

test('an unlock belongs to the user who performed it', () => {
  const req = session({ id: 7, username: 'tom' });
  unlock.recordUnlock(req);
  assert.equal(unlock.isUnlocked(req), true);
  // The same session object now carrying a different user is not
  // unlocked. This is what stops an unlock surviving any path that
  // swaps the user on an existing session.
  req.session.user = { id: 8, username: 'tom' };
  assert.equal(unlock.isUnlocked(req), false);
});

test('rotating the passphrase in Railway closes every open session immediately', () => {
  const req = session();
  unlock.recordUnlock(req);
  assert.equal(unlock.isUnlocked(req), true);
  process.env[KEY] = 'a-completely-different-passphrase';
  assert.equal(unlock.isUnlocked(req), false,
    'an unlock survived the passphrase being changed, so rotation would not lock anyone out');
});

test('an unlock expires on its own', () => {
  const req = session();
  unlock.recordUnlock(req);
  req.session.workspaceUnlock.at = Date.now() - unlock.UNLOCK_TTL_MS - 1000;
  assert.equal(unlock.isUnlocked(req), false);
});

test('a forged or malformed unlock fact is not an unlock', () => {
  const req = session();
  // The shapes an attacker with a writable session store, or a bug,
  // might produce. None of them may pass.
  for (const forged of [true, 'yes', 1, {}, { at: Date.now() }, { userId: '7', at: Date.now() },
    { userId: '7', fingerprint: 'wrong', at: Date.now() },
    { userId: '7', fingerprint: unlock.passphraseFingerprint(), at: 'now' }]) {
    req.session.workspaceUnlock = forged;
    assert.equal(unlock.isUnlocked(req), false, `a forged unlock passed: ${JSON.stringify(forged)}`);
  }
});

test('locking forgets the fact and nothing else', () => {
  const req = session();
  unlock.recordUnlock(req);
  unlock.clearUnlock(req);
  assert.equal(unlock.isUnlocked(req), false);
  assert.ok(req.session.user, 'locking the workspace signed the user out of the site as well');
});

test('an anonymous session cannot hold an unlock', () => {
  const req = { session: {} };
  unlock.recordUnlock(req);
  assert.equal(unlock.isUnlocked(req), false);
});

// The finding, stated as a test. Everything above is machinery; this is
// the claim being made to Governance.
test('an admin who has taken the cleared account still cannot open the workspace', () => {
  // The takeover: same username, same user id, a password the attacker
  // chose. Nothing in the session distinguishes them from Tom.
  const attacker = session({ id: 7, username: 'tom' });
  assert.equal(unlock.isUnlocked(attacker), false,
    'a seized session was already unlocked without presenting the passphrase');
  // And they cannot obtain one by guessing, because the value is not in
  // the database, the CMS, or anything a CMS admin can write.
  for (const guess of ['tom', 'password', 'arrington', 'workspace', GOOD.slice(0, 10)]) {
    assert.equal(unlock.passphraseMatches(guess), false);
  }
});
