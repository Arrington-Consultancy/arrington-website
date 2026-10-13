// The one place SESSION_SECRET is read (fix brief of 12/10/2026, item 1).
//
// Three things are keyed on it: the session cookie (server.js), the gated PDF
// download links (routes/leads.js) and the Contact conversion token
// (lib/contactConversion.js). Each used to carry its own copy of the same
// development fallback, so the boot check in server.js protected the first
// and only by luck the other two: a production process whose secret was
// missing or set to the development value would have signed download links
// and conversion tokens with a key anybody can read in this public
// repository, which lets anybody mint a Contact conversion.
//
// Now all three ask this module, and in production it refuses both a missing
// value and the development value itself. server.js asks once at boot and
// exits with FATAL, so production refuses to start rather than run with the
// wrong key; the other two ask per use, so they can never see a different
// value from the one the boot check approved.
//
// The value is returned exactly as set, never trimmed: trimming would change
// the key under every live session and every token already issued.
const DEV_SESSION_SECRET = 'dev-only-secret-change-me';

function isProduction(env = process.env) {
  return !!env.RAILWAY_ENVIRONMENT || env.NODE_ENV === 'production';
}

// Null when the value is usable, otherwise why it is not.
function sessionSecretProblem(env = process.env) {
  const raw = env.SESSION_SECRET;
  if (typeof raw !== 'string' || raw.trim() === '') return 'SESSION_SECRET is not set';
  if (raw.trim() === DEV_SESSION_SECRET) return 'SESSION_SECRET is the development value';
  return null;
}

function getSessionSecret(env = process.env) {
  const problem = sessionSecretProblem(env);
  if (!problem) return env.SESSION_SECRET;
  if (isProduction(env)) {
    throw new Error('FATAL: ' + problem + '. Production must have its own real SESSION_SECRET.');
  }
  return DEV_SESSION_SECRET;
}

// For the boot log: never the value, only whether it is real and its length.
function describeSessionSecret(env = process.env) {
  const problem = sessionSecretProblem(env);
  if (problem) return problem + (isProduction(env) ? '' : '; using the development value (local only)');
  return 'set (' + env.SESSION_SECRET.length + ' chars), not the development value';
}

module.exports = { getSessionSecret, sessionSecretProblem, describeSessionSecret, isProduction, DEV_SESSION_SECRET };
