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
// - the HMAC means only this server can mint one. Nothing is stored, so
//   there is no table and no state to clean up.
//
// The honeypot path in routes/leads.js deliberately gets no token: a bot's
// "submission" is answered as a success and counts as nothing.
//
// Attribution is unaffected. Google Ads attributes the conversion from its
// own first-party click cookie, which the base tag in the page head reads on
// /thank-you exactly as it does on the page the form was on.
const crypto = require('crypto');

const TTL_MS = 30 * 60 * 1000;
const ID_RE = /^[A-Za-z0-9_-]{16,32}$/;
const TOKEN_RE = /^([A-Za-z0-9_-]{16,32})\.(\d{13})\.([a-f0-9]{64})$/;

function secret() {
  // Same key and same dev fallback as the gated PDF download links in
  // routes/leads.js, so this adds no new configuration.
  return process.env.SESSION_SECRET || 'dev-only-secret-change-me';
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

module.exports = { issueToken, verifyToken, TTL_MS, THANK_YOU_PATH: '/thank-you' };
