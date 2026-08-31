// Arrington AI Workspace: the second factor.
//
// Governance finding F1, Tom's decision of 31/08/2026: "implement option
// 3 ... Do not accept the existing CMS-admin takeover risk, and preserve
// the legitimate account recovery route."
//
// Those two sentences are what this file exists for, and it is worth
// being plain about why the user-id binding alone does not satisfy them.
// The demonstrated attack is an admin CMS account resetting the password
// behind the cleared username and logging in. After that the attacker is
// the right username with the right user id, so neither binding sees
// anything wrong. The only thing that can tell the owner from someone
// who has taken the owner's account is a secret the CMS cannot rewrite.
//
// WORKSPACE_ACCESS_PASSPHRASE is that secret. It lives in Railway, which
// is Tom's own account and is not reachable from CMS admin. So:
//
//   * an admin who seizes the CMS account still cannot enter the
//     workspace, cannot read the brain and cannot erase a contact;
//   * the legitimate recovery route is untouched. An admin can still
//     reset Tom's site password so he can get back into the CMS, and Tom
//     can still rotate this passphrase himself in Railway if he loses
//     it. Nobody is locked out of anything they own.
//
// Deliberate design notes:
//
//   * There is no second user store and no second identity. This is one
//     extra fact about an already-authenticated session, not a login.
//   * It is compared in constant time over SHA-256 digests, so the
//     comparison cannot leak the passphrase's length or prefix.
//   * The unlocked flag is bound to the user id that unlocked it, so a
//     session that somehow changes hands does not carry the unlock with
//     it, and it expires on its own well inside the 8-hour session.
//   * Unset passphrase means NO access, including for Tom. An
//     environment that has not been configured is not one that should
//     fall through to the weaker rule this finding was about.
const crypto = require('node:crypto');

// Four hours. Shorter than the session so an unattended browser stops
// holding the workspace open for a whole working day, long enough that
// it is not asked for repeatedly during one sitting.
const UNLOCK_TTL_MS = 4 * 60 * 60 * 1000;

function configuredPassphrase() {
  const v = process.env.WORKSPACE_ACCESS_PASSPHRASE;
  return typeof v === 'string' && v.trim().length >= 12 ? v : null;
}

// Reported at boot and on the unlock screen. Never returns the value,
// and reports length only, which is enough to tell an empty Railway
// variable from a real one without revealing anything about it. That
// distinction is exactly what cost a whole session on the Market Ready
// Test, so it is worth the line.
function describeUnlockConfig() {
  const v = process.env.WORKSPACE_ACCESS_PASSPHRASE;
  if (typeof v !== 'string' || v.trim() === '') {
    return { ok: false, detail: 'WORKSPACE_ACCESS_PASSPHRASE is unset or empty' };
  }
  if (v.trim().length < 12) {
    return { ok: false, detail: `WORKSPACE_ACCESS_PASSPHRASE is only ${v.trim().length} characters; 12 is the minimum` };
  }
  return { ok: true, detail: `WORKSPACE_ACCESS_PASSPHRASE set, length ${v.length}` };
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

// Constant-time over fixed-width digests, so neither the length nor any
// prefix of the real passphrase is observable from timing.
function passphraseMatches(candidate) {
  const real = configuredPassphrase();
  if (!real) return false;
  if (typeof candidate !== 'string' || candidate === '') return false;
  return crypto.timingSafeEqual(digest(candidate), digest(real));
}

// The unlock is recorded against the user id that performed it and
// against a fingerprint of the passphrase in force at the time, so
// rotating the passphrase in Railway invalidates every open unlock
// immediately rather than at the next expiry.
function passphraseFingerprint() {
  const real = configuredPassphrase();
  return real ? digest(real).toString('hex').slice(0, 16) : null;
}

function recordUnlock(req) {
  req.session.workspaceUnlock = {
    userId: req.session.user ? String(req.session.user.id) : null,
    fingerprint: passphraseFingerprint(),
    at: Date.now()
  };
}

function clearUnlock(req) {
  if (req.session) delete req.session.workspaceUnlock;
}

// Every condition must hold. An unlock from a different user, from a
// superseded passphrase, or from more than four hours ago is no unlock.
function isUnlocked(req) {
  if (!configuredPassphrase()) return false;
  if (!req.session || !req.session.user) return false;
  const u = req.session.workspaceUnlock;
  if (!u || typeof u !== 'object') return false;
  if (u.userId !== String(req.session.user.id)) return false;
  if (u.fingerprint !== passphraseFingerprint()) return false;
  if (!Number.isFinite(u.at) || Date.now() - u.at > UNLOCK_TTL_MS) return false;
  return true;
}

module.exports = {
  UNLOCK_TTL_MS,
  configuredPassphrase,
  describeUnlockConfig,
  passphraseMatches,
  passphraseFingerprint,
  recordUnlock,
  clearUnlock,
  isUnlocked
};
