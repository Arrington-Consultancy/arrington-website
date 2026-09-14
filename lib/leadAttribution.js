'use strict';
// Where an enquiry came from.
//
// The browser captures, once per session on the first page it sees, the
// landing page, the referrer, any utm_* parameters and the Google Ads click
// id (gclid), and sends that object with every form that writes a lead.
// The server stores it as one JSONB column on the row and prints it in the
// notification email, so "which channel did this enquiry come from" is a
// recorded fact rather than a guess.
//
// Nothing arriving here is trusted. It is visitor-supplied text, so every
// value is allowlisted by key, stripped to plain text, shape-checked and
// length-capped before it reaches the database or an email. Anything that
// fails a check is dropped, never guessed at.
const sanitizeHtml = require('sanitize-html');

const LIMITS = Object.freeze({
  landing_page: 300,
  referrer: 500,
  utm_source: 200,
  utm_medium: 200,
  utm_campaign: 200,
  utm_term: 200,
  utm_content: 200,
  gclid: 200,
  captured_at: 40
});
const KEYS = Object.freeze(Object.keys(LIMITS));

function plain(value, max) {
  return sanitizeHtml(String(value ?? ''), { allowedTags: [], allowedAttributes: {} })
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, max);
}

// Visitor input in, a clean allowlisted object out. {} when nothing usable.
function parseAttribution(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const key of KEYS) {
    if (!Object.hasOwn(raw, key)) continue;
    const value = plain(raw[key], LIMITS[key]);
    if (!value) continue;
    // A landing page is a root-relative path on this site, nothing else.
    if (key === 'landing_page' && !/^\/(?!\/)/.test(value)) continue;
    // A referrer is an http(s) URL or it is not recorded at all.
    if (key === 'referrer' && !/^https?:\/\/\S+$/i.test(value)) continue;
    if (key === 'captured_at' && Number.isNaN(Date.parse(value))) continue;
    out[key] = value;
  }
  return out;
}

function referrerHost(referrer) {
  try {
    return new URL(referrer).hostname.replace(/^www\./, '');
  } catch (err) {
    return '';
  }
}

// One short phrase for lists (admin panel, CRM event summaries):
// "google / cpc / Leads-Search-1", "Google Ads click", "referrer: bing.com",
// "direct", or '' when nothing was captured at all.
function attributionSummary(attr) {
  const a = parseAttribution(attr);
  if (a.utm_source || a.utm_medium || a.utm_campaign) {
    const parts = [a.utm_source || 'unknown source', a.utm_medium || 'unknown medium'];
    if (a.utm_campaign) parts.push(a.utm_campaign);
    return parts.join(' / ');
  }
  if (a.gclid) return 'Google Ads click';
  if (a.referrer) {
    const host = referrerHost(a.referrer);
    return host ? `referrer: ${host}` : 'referrer';
  }
  if (a.landing_page) return 'direct';
  return '';
}

// Lines for the owner notification email. Empty array when nothing was
// captured, so the email says nothing rather than "Source: unknown".
function describeAttribution(attr) {
  const a = parseAttribution(attr);
  const lines = [];
  const summary = attributionSummary(a);
  if (summary) lines.push(`Source: ${summary}`);
  if (a.landing_page) lines.push(`Landing page: ${a.landing_page}`);
  if (a.referrer) lines.push(`Referrer: ${a.referrer}`);
  if (a.utm_term) lines.push(`Search term (utm_term): ${a.utm_term}`);
  if (a.utm_content) lines.push(`Ad content (utm_content): ${a.utm_content}`);
  if (a.gclid) lines.push(`Google Ads click id: ${a.gclid}`);
  return lines;
}

module.exports = { parseAttribution, attributionSummary, describeAttribution, KEYS, LIMITS };
