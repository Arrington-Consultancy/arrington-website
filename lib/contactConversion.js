// Contact form conversion token: what lets /thank-you fire the Google Ads
// "Contact" conversion for a real enquiry and for nothing else.
//
// WHY A TOKEN RATHER THAN "ANY VISIT TO /thank-you COUNTS". A conversion page
// that fires on every load counts a refresh, a bookmark, a back-button return
// and anybody who types the URL. The Contact action is the Primary conversion
// Google Ads bids on (see CLAUDE.md, Lead capture), so every false count is a
// signal telling the bidding to buy more of the wrong traffic.
//
// So POST /api/leads issues a token only AFTER the lead row is actually
// stored, and /thank-you renders the conversion snippet only when the token
// verifies. The token is:
//
//   <id>.<expiry ms>.<HMAC-SHA256 of "id:expiry", keyed on SESSION_SECRET>
//
// - <id> is random and becomes the conversion's transaction_id, so Google
//   Ads itself discards a second conversion carrying the same id. That is the
//   backstop for the one replay the page cannot prevent: a copied URL opened
//   again inside the expiry window.
// - the expiry keeps a leaked URL from being a standing way to fire it.
// - the HMAC means only this server can mint one.
// - it is single use (fix brief of 12/10/2026, item 5): the first render of
//   /thank-you claims the token's id in contact_conversion_claims, and only
//   that first render carries the conversion snippet. A replayed link, in
//   this browser or any other, shows the page and counts nothing. If the
//   claim cannot be made (database down), nothing counts either: a missed
//   conversion is cheaper than a false one.
//
// The honeypot path in routes/leads.js deliberately gets no token: a bot's
// "submission" is answered as a success and counts as nothing.
//
// Attribution is unaffected. Google Ads attributes the conversion from its
// own first-party click cookie, which the base tag in the page head reads on
// /thank-you exactly as it does on the page the form was on.
const crypto = require('crypto');
const { getSessionSecret } = require('./sessionSecret');

const TTL_MS = 30 * 60 * 1000;
const ID_RE = /^[A-Za-z0-9_-]{16,32}$/;
const TOKEN_RE = /^([A-Za-z0-9_-]{16,32})\.(\d{13})\.([a-f0-9]{64})$/;

function secret() {
  // Same key as the session cookie and the gated PDF download links, from the
  // one shared reader, which refuses a missing or development value in
  // production rather than signing with a key anybody can read.
  return getSessionSecret();
}

function sign(id, expiry, key) {
  return crypto.createHmac('sha256', key).update(`${id}:${expiry}`).digest('hex');
}

function issueToken({ now = Date.now(), key = secret() } = {}) {
  const id = crypto.randomBytes(12).toString('base64url');
  const expiry = now + TTL_MS;
  return `${id}.${expiry}.${sign(id, expiry, key)}`;
}

// Returns { id } for a genuine, unexpired token, and null for anything else:
// missing, malformed, tampered, expired, or not a string at all (Express hands
// a repeated ?c= over as an array).
function verifyToken(token, { now = Date.now(), key = secret() } = {}) {
  if (typeof token !== 'string') return null;
  const m = TOKEN_RE.exec(token);
  if (!m) return null;
  const [, id, expiryStr, sig] = m;
  const expiry = Number(expiryStr);
  if (!Number.isSafeInteger(expiry) || expiry < now) return null;
  const expected = Buffer.from(sign(id, expiry, key), 'hex');
  const given = Buffer.from(sig, 'hex');
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  if (!ID_RE.test(id)) return null;
  return { id };
}

// Claims a verified token's id. True only for the first claim of that id;
// false for any later one and for any failure, so the caller fires the
// conversion only on true. The insert is the whole check: two renders racing
// on one id cannot both land it (primary key). db is passed in so this module
// stays free of the pool and its tests need no database.
async function claimToken(id, db) {
  if (typeof id !== 'string' || !ID_RE.test(id) || !db) return false;
  try {
    const { rows } = await db.query(
      `INSERT INTO contact_conversion_claims (token_id) VALUES ($1)
       ON CONFLICT (token_id) DO NOTHING RETURNING token_id`,
      [id]
    );
    // Housekeeping, never allowed to affect the answer above.
    db.query(`DELETE FROM contact_conversion_claims WHERE claimed_at < NOW() - INTERVAL '1 day'`)
      .catch(() => {});
    return rows.length === 1;
  } catch (err) {
    console.error('Contact conversion claim failed; no conversion fired:', err.message);
    return false;
  }
}

module.exports = { issueToken, verifyToken, claimToken, TTL_MS, THANK_YOU_PATH: '/thank-you' };
