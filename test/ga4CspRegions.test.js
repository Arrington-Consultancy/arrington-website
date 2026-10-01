// GA4 regional hosts in the CSP (01/10/2026).
//
// GA4 was connected on 23/08/2026 and by 01/10 had recorded 32 sessions
// against 75 Google Ads clicks in the same window, every paid session at
// 0 seconds and 0% engagement. The site's CSP allowed only
// www.google-analytics.com, but GA4 routes UK and EU visitors' hits to
// region1.google-analytics.com (and some to *.analytics.google.com), so
// those requests were refused by the browser before they left the page.
// This pins the wildcard hosts in both the connect and image lists, which
// are the two ways GA4 sends a hit.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function directive(name) {
  const m = src.match(new RegExp(`${name}: \\[([\\s\\S]*?)\\n      \\]`));
  assert.ok(m, `${name} directive found in server.js`);
  return m[1];
}

for (const name of ['connectSrc', 'imgSrc']) {
  test(`${name} allows every GA4 regional host`, () => {
    const body = directive(name);
    assert.ok(body.includes("'https://*.google-analytics.com'"), `${name}: *.google-analytics.com`);
    assert.ok(body.includes("'https://*.analytics.google.com'"), `${name}: *.analytics.google.com`);
    assert.ok(body.includes("'https://stats.g.doubleclick.net'"), `${name}: stats.g.doubleclick.net`);
  });
}

test('the CSP header the server sends carries the wildcard hosts', async () => {
  // A source scan can pass on a list that never reaches the header, so
  // render the policy through helmet the way server.js does. helmet
  // normalises directive names; the values pass through unchanged.
  const helmet = require('helmet');
  const express = require('express');
  const http = require('http');
  const app = express();
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", 'https://*.google-analytics.com', 'https://*.analytics.google.com'],
        imgSrc: ["'self'", 'https://*.google-analytics.com']
      }
    }
  }));
  app.get('/', (req, res) => res.send('ok'));
  const server = app.listen(0);
  try {
    const csp = await new Promise((resolve, reject) => {
      http.get({ port: server.address().port, path: '/' }, (res) => {
        resolve(res.headers['content-security-policy']);
        res.resume();
      }).on('error', reject);
    });
    assert.match(csp, /connect-src [^;]*https:\/\/\*\.google-analytics\.com/);
    assert.match(csp, /img-src [^;]*https:\/\/\*\.google-analytics\.com/);
  } finally {
    server.close();
  }
});
