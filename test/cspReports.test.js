// CSP reports from visitors (01/10/2026). The policy blocked GA4's regional
// hosts for five weeks and nothing said so, because the only CSP list the
// site had was the admin's own browser. Now the policy carries report-uri,
// the browser posts what it blocked, the row is stored, the admin panel
// shows the last 30 days and the boot log summarises the last 7.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { normalise } = require('../routes/cspReport');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('both report shapes normalise to the same record', () => {
  const legacy = normalise({ 'csp-report': {
    'document-uri': 'https://www.arringtonconsultancy.com/',
    'effective-directive': 'connect-src',
    'blocked-uri': 'https://region1.google-analytics.com/g/collect',
    'source-file': 'https://www.googletagmanager.com/gtag/js',
    'line-number': 42
  } });
  const modern = normalise([{ type: 'csp-violation', body: {
    documentURL: 'https://www.arringtonconsultancy.com/',
    effectiveDirective: 'connect-src',
    blockedURL: 'https://region1.google-analytics.com/g/collect',
    sourceFile: 'https://www.googletagmanager.com/gtag/js',
    lineNumber: 42
  } }]);
  assert.deepStrictEqual(legacy, modern);
  assert.strictEqual(legacy[0].directive, 'connect-src');
  assert.strictEqual(legacy[0].blockedUri, 'https://region1.google-analytics.com/g/collect');
  assert.strictEqual(legacy[0].lineNumber, 42);
});

test('browser-extension noise is dropped, junk is dropped, and values are capped', () => {
  assert.deepStrictEqual(normalise({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'chrome-extension://abc/inject.js' } }), []);
  assert.deepStrictEqual(normalise({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'moz-extension://abc/x.js' } }), []);
  assert.deepStrictEqual(normalise('nonsense'), []);
  assert.deepStrictEqual(normalise({ 'csp-report': { 'blocked-uri': 'https://x' } }), [], 'no directive, no record');
  const long = normalise({ 'csp-report': { 'effective-directive': 'x'.repeat(200), 'blocked-uri': 'y'.repeat(2000) } });
  assert.strictEqual(long[0].directive.length, 80);
  assert.strictEqual(long[0].blockedUri.length, 500);
  assert.strictEqual(normalise({ 'csp-report': { 'effective-directive': 'style-src' } })[0].blockedUri, '(inline)');
});

function loadRouter(inserts) {
  const poolPath = require.resolve('../db/pool');
  const routePath = require.resolve('../routes/cspReport');
  const savedPool = require.cache[poolPath];
  const savedRoute = require.cache[routePath];
  require.cache[poolPath] = {
    id: poolPath, filename: poolPath, loaded: true,
    exports: { query: async (sql, params) => { inserts.push(params); return { rows: [] }; } }
  };
  delete require.cache[routePath];
  const router = require('../routes/cspReport');
  if (savedPool) require.cache[poolPath] = savedPool; else delete require.cache[poolPath];
  if (savedRoute) require.cache[routePath] = savedRoute; else delete require.cache[routePath];
  return router;
}

function post(port, body, type) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, path: '/api/csp-report', method: 'POST', headers: { 'Content-Type': type } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('the endpoint accepts a browser report with no CSRF token, stores it, and always answers 204', async () => {
  const inserts = [];
  const app = express();
  app.use(loadRouter(inserts));
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const status = await post(port, JSON.stringify({ 'csp-report': {
      'document-uri': 'https://www.arringtonconsultancy.com/evidence',
      'effective-directive': 'img-src',
      'blocked-uri': 'https://region1.google-analytics.com/g/collect'
    } }), 'application/csp-report');
    assert.strictEqual(status, 204);
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(inserts.length, 1);
    assert.strictEqual(inserts[0][0], 'img-src');
    assert.strictEqual(inserts[0][1], 'https://region1.google-analytics.com/g/collect');
    assert.strictEqual(inserts[0][2], 'https://www.arringtonconsultancy.com/evidence');

    const junk = await post(port, 'not json', 'application/csp-report');
    assert.strictEqual(junk, 204, 'junk gets the same answer and learns nothing');
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(inserts.length, 1, 'and nothing was stored');
  } finally {
    server.close();
  }
});

test('the policy reports to the endpoint, which is mounted ahead of the CSRF middleware', () => {
  const src = read('server.js');
  assert.match(src, /reportUri: \['\/api\/csp-report'\]/);
  const mount = src.indexOf('app.use(cspReportRoutes)');
  const csrf = src.indexOf('doubleCsrfProtection(req, res, next)');
  assert.ok(mount > 0 && csrf > mount, 'the report route is mounted before CSRF is applied');
});

test('the admin API is gated on view_csp, the panel reads it, and the boot log summarises it', () => {
  assert.match(read('routes/admin.js'), /router\.get\('\/csp-reports', requireCapability\('view_csp'\)/);
  assert.match(read('public/js/admin.js'), /fetch\('\/api\/admin\/csp-reports'/);
  assert.match(read('db/seed.js'), /CSP reports, last 7 days/);
  assert.match(read('db/schema.sql'), /CREATE TABLE IF NOT EXISTS csp_reports/);
});
