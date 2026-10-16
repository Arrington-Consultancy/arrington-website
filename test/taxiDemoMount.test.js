'use strict';
// The taxi demo is part of this site at /taxi-demo (15/10/2026). Where it is
// mounted is the whole point: after the HTTPS and host redirect, so it is
// only ever served on the canonical host over HTTPS, and before helmet, the
// session, the body parsers and the CSRF check, none of which it may inherit
// (a second CSP on its pages, a cookie on a site that says it sets none, its
// booking form refused, its request body read before it can read it).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const at = (needle) => {
  const i = src.indexOf(needle);
  assert.ok(i !== -1, `server.js no longer contains ${needle}`);
  return i;
};

test('the demo is mounted after the HTTPS redirect and before everything it must not inherit', () => {
  const mount = at("app.use('/taxi-demo',");
  assert.ok(at('return res.redirect(301, `https://${targetHost}${req.url}`)') < mount, 'mounted before the HTTPS and host redirect');
  for (const later of ['app.use(compression())', 'app.use(helmet(', 'app.use(cookieParser())', 'app.use(express.json(', 'app.use(express.urlencoded(', 'app.use(session(', 'doubleCsrfProtection(req, res, next)']) {
    assert.ok(mount < at(later), `the demo now sits behind ${later}`);
  }
});

test('it is mounted with its base path and nothing else from this site reaches it', () => {
  assert.match(src, /require\('\.\/taxi-demo\/server'\)\.createApp\(\{ basePath: '\/taxi-demo' \}\)/);
  const start = at("app.use('/taxi-demo',");
  const block = src.slice(start, src.indexOf('\n});', start));
  assert.match(block, /taxiDemo\.handle\(req, res\)/);
  assert.match(block, /Strict-Transport-Security/);
  // The one request that goes on to this site is the office
  // (routes/taxiOffice.js), which needs the login, session and CSRF the
  // public demo deliberately lacks. Nothing else may fall through.
  const nexts = block.match(/next\(/g) || [];
  assert.equal(nexts.length, 1, 'a demo request must never fall through to this site');
  assert.match(block, /if \(\/\^\\\/taxi-demo\\\/office\(\\\/\|\\\?\|\$\)\/\.test\(req\.originalUrl\)\) return next\(\);/);
});
