// Cloudflare Turnstile server-side verification, shared by the Owner
// Dependency Quiz, Commercial Gaps Review and Market Ready Test — the one
// human-verification check each of these public assessment tools requires
// immediately before its final submission (never mid-assessment).
//
// Configuration: TURNSTILE_SITE_KEY (public, embedded in the page) and
// TURNSTILE_SECRET_KEY (private, used only here to call Cloudflare's
// siteverify endpoint). Same "required in production, optional locally"
// pattern as GMAIL_APP_PASSWORD elsewhere in this codebase, except this is
// a security gate rather than a notification channel, so the fallback
// behaviour is the opposite: in production, a missing secret key fails
// every verification closed (submissions are rejected) rather than silently
// waving them through. Locally, with no real Cloudflare account needed,
// both keys default to Cloudflare's publicly documented "always passes"
// test pair so the full flow can be built and tested end to end:
// https://developers.cloudflare.com/turnstile/troubleshooting/testing/
const isProd = !!process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';

const DEV_TEST_SITE_KEY = '1x00000000000000000000AA';
const DEV_TEST_SECRET_KEY = '1x0000000000000000000000000000000AA';

const SITE_KEY = process.env.TURNSTILE_SITE_KEY || (isProd ? '' : DEV_TEST_SITE_KEY);
const SECRET_KEY = process.env.TURNSTILE_SECRET_KEY || (isProd ? '' : DEV_TEST_SECRET_KEY);

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

if (isProd && !process.env.TURNSTILE_SECRET_KEY) {
  console.warn('TURNSTILE_SECRET_KEY is not set — human verification will fail closed on every assessment submission until it is configured.');
}

// Verifies a Turnstile response token against Cloudflare. Never throws —
// callers always get a definite { success, reason } back so a network
// hiccup fails the submission rather than crashing the request.
async function verifyTurnstileToken(token, remoteIp) {
  if (!SECRET_KEY) {
    return { success: false, reason: 'not_configured' };
  }
  if (!token || typeof token !== 'string') {
    return { success: false, reason: 'missing_token' };
  }

  try {
    const body = new URLSearchParams();
    body.append('secret', SECRET_KEY);
    body.append('response', token);
    if (remoteIp) body.append('remoteip', remoteIp);

    const resp = await fetch(SITEVERIFY_URL, { method: 'POST', body });
    if (!resp.ok) {
      return { success: false, reason: `siteverify_http_${resp.status}` };
    }
    const data = await resp.json();
    if (!data || data.success !== true) {
      const codes = (data && data['error-codes']) || [];
      return { success: false, reason: codes.join(',') || 'verification_failed' };
    }
    return { success: true };
  } catch (err) {
    console.error('Turnstile verification request failed:', err.message);
    return { success: false, reason: 'verify_request_failed' };
  }
}

// Whether a verification result should BLOCK a public submission.
//
// We block only when a token was supplied and Cloudflare actively rejected
// it — a malformed, expired or already-used token is a strong bot or replay
// signal. We deliberately do NOT block when there is no token at all, or when
// verification could not be performed (no secret key configured, or the
// siteverify call itself failed): those are exactly the cases that would turn
// away a genuine visitor whose widget was blocked by a privacy extension or
// never loaded. The footer form keeps its honeypot, its JavaScript-only rule
// and its sales-pitch screening in those cases, so nothing is defenceless;
// a real enquiry is simply never lost to a check that could not run.
//
// Pure and side-effect free, so the policy can be unit-tested without a
// network call. See routes/leads.js for the one caller.
const TURNSTILE_SOFT_REASONS = new Set(['not_configured', 'missing_token', 'verify_request_failed']);

function turnstileBlocks(result) {
  if (!result || result.success) return false;
  const reason = result.reason || '';
  if (TURNSTILE_SOFT_REASONS.has(reason)) return false;
  if (/^siteverify_http_/.test(reason)) return false;
  return true;
}

module.exports = { verifyTurnstileToken, turnstileBlocks, SITE_KEY };
