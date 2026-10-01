// POST /api/csp-report: browsers send a report here when the Content Security
// Policy blocks something on a visitor's page (the policy's report-uri in
// server.js). Added 01/10/2026 after GA4 ran for five weeks recording a
// fraction of visits at 0 seconds: UK visitors' hits were going to
// region1.google-analytics.com, which the policy did not allow, and nothing
// anywhere said so. The admin panel's CSP violations list only ever showed
// what happened in the admin's own browser.
//
// Reports are stored, not emailed: a visitor's browser extension can trigger
// a violation, so one report is not an alarm. The admin panel shows the last
// 30 days grouped by what was blocked, and the boot log summarises the last
// 7 days on every deploy.
//
// Mounted BEFORE the CSRF middleware in server.js: the browser sends these on
// its own and carries no token. It is a fire-and-forget endpoint that answers
// 204 whatever it is given, so a hostile sender learns nothing from it.
const express = require('express');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const db = require('../db/pool');

const router = express.Router();

const reportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: false,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req),
  handler: (req, res) => res.status(204).end()
});

// Browser extensions inject scripts and requests that the policy rightly
// blocks; they say nothing about the site.
const EXTENSION_SCHEMES = /^(chrome|moz|safari|safari-web|ms-browser)-extension:/i;

function text(value, max) {
  if (value === undefined || value === null) return '';
  return String(value).slice(0, max);
}

// Normalise either report shape to one record. The legacy report-uri body
// is {"csp-report": {...}} with hyphenated keys; the Reporting API sends an
// array of {type: "csp-violation", body: {...}} with camelCase keys.
function normalise(body) {
  const out = [];
  const list = Array.isArray(body) ? body : [body];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const r = item['csp-report'] || item.body || item;
    if (!r || typeof r !== 'object') continue;
    const directive = text(r['effective-directive'] || r.effectiveDirective || r['violated-directive'] || r.violatedDirective, 80);
    const blocked = text(r['blocked-uri'] || r.blockedURL || r.blockedURI, 500);
    if (!directive) continue;
    if (EXTENSION_SCHEMES.test(blocked)) continue;
    out.push({
      directive,
      blockedUri: blocked || '(inline)',
      documentUri: text(r['document-uri'] || r.documentURL || r.documentURI, 500),
      sourceFile: text(r['source-file'] || r.sourceFile, 500),
      lineNumber: Number.isFinite(Number(r['line-number'] ?? r.lineNumber)) ? Number(r['line-number'] ?? r.lineNumber) : null
    });
  }
  return out;
}

router.post(
  '/api/csp-report',
  reportLimiter,
  express.json({ type: ['application/csp-report', 'application/reports+json', 'application/json'], limit: '16kb' }),
  async (req, res) => {
    res.status(204).end();
    const reports = normalise(req.body).slice(0, 10);
    if (!reports.length) return;
    const userAgent = text(req.get('user-agent'), 300);
    try {
      for (const r of reports) {
        await db.query(
          `INSERT INTO csp_reports (directive, blocked_uri, document_uri, source_file, line_number, user_agent)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [r.directive, r.blockedUri, r.documentUri, r.sourceFile, r.lineNumber, userAgent]
        );
      }
    } catch (err) {
      console.error('CSP report store failed:', err.message);
    }
  }
);

// A body express.json cannot parse throws before the handler runs. Swallow
// it here, in this router, so junk gets the same 204 as a real report and
// never reaches the site's error page.
router.use('/api/csp-report', (err, req, res, next) => { // eslint-disable-line no-unused-vars
  res.status(204).end();
});

module.exports = router;
module.exports.normalise = normalise;
