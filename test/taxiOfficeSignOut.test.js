'use strict';

// Sign out from the Tidewell office (Tom, 17/10/2026: "in the taxi demo site
// i need to be able to sign out"). Every office page carries a Sign out
// button in its header, posting to the site's own /logout with the CSRF
// token, and the visitor lands back on the demo's staff portal page. The
// logout route only follows a path on this site; anything else goes home.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const express = require('express');

process.env.ENABLE_TAXI_OFFICE_AI = '';
const office = require('../lib/taxiOffice/office');
const { mountPageRoute, BASE } = require('../routes/taxiOffice');
const authRoutes = require('../routes/auth');

const SESSION_ID = 'sign-out-test';

function listen(app) {
  return new Promise((resolve) => { const srv = app.listen(0, '127.0.0.1', () => resolve(srv)); });
}

test('every office page has a Sign out button that posts to /logout and returns to the staff portal page', async () => {
  office.reset(SESSION_ID);
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use((req, res, next) => {
    req.session = { id: SESSION_ID, user: { id: 1, username: 'tom', role: 'admin' } };
    res.locals.csrfToken = 'tok-123';
    next();
  });
  mountPageRoute(app);
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    for (const page of ['/', '/inbox', '/dispatch', '/complaints', '/licensing', '/social']) {
      const html = await (await fetch(base + BASE + page)).text();
      const form = (html.match(/<form class="to-signout"[\s\S]*?<\/form>/) || [''])[0];
      assert.ok(form, `${page}: has a sign-out form`);
      assert.match(form, /method="post" action="\/logout"/, page);
      assert.match(form, /name="_csrf" value="tok-123"/, `${page}: carries the CSRF token`);
      assert.match(form, /name="next" value="\/taxi-demo\/staff-portal"/, page);
      assert.match(form, />Sign out<\/button>/, page);
      // In the header, not buried at the foot of the page.
      assert.ok(html.indexOf(form) < html.indexOf('<main'), `${page}: in the header`);
    }
  } finally {
    srv.close();
    office.reset(SESSION_ID);
  }
});

test('logout ends the session and follows only a path on this site', async () => {
  const destroyed = [];
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    req.session = { destroy(cb) { destroyed.push(true); cb(); } };
    next();
  });
  app.use(authRoutes);
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const post = (body) => fetch(base + '/logout', { method: 'POST', redirect: 'manual', body: new URLSearchParams(body) });
  try {
    let r = await post({ next: '/taxi-demo/staff-portal' });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('location'), '/taxi-demo/staff-portal');
    // The CMS log out sends no next and still goes home, as before.
    r = await post({});
    assert.equal(r.headers.get('location'), '/');
    for (const bad of ['//evil.example', 'https://evil.example/', '/\\evil.example', 'javascript:alert(1)']) {
      r = await post({ next: bad });
      assert.equal(r.headers.get('location'), '/', `${bad} is refused`);
    }
    assert.equal(destroyed.length, 6, 'every request ended its session');
  } finally {
    srv.close();
  }
});
