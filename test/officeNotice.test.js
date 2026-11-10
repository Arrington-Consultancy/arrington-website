'use strict';

// Tom hears when a watched person is in the Abacus office and what they did
// (Tom, 10 November 2026: "I want to know when he is in and what he does").
// The office posts a notice to the site; the site emails Tom through its
// existing guest-alert transport, to the fixed recipient, and only for a
// request carrying the shared key.

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const notify = require('../abacus-office/lib/notify');

const KEY = 'k'.repeat(40);

test('the office watches dan by default, nobody with an empty list, and sends nothing without a 32+ character key', async () => {
  assert.deepEqual(notify.config({}).watch, ['dan']);
  assert.deepEqual(notify.config({ ABACUS_OFFICE_WATCH_USERNAMES: '' }).watch, []);
  assert.deepEqual(notify.config({ ABACUS_OFFICE_WATCH_USERNAMES: 'Dan, terrel' }).watch, ['dan', 'terrel']);
  assert.equal(notify.watched('DAN', {}), true);
  assert.equal(notify.watched('sam', {}), false);
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return { ok: true, status: 200 }; };
  assert.equal((await notify.signedIn({ username: 'dan' }, { env: { ABACUS_OFFICE_NOTICE_KEY: 'short' }, fetchImpl })).sent, false);
  assert.equal(calls, 0, 'a short key sends nothing');
  assert.match(notify.describeNoticeStatus({ ABACUS_OFFICE_NOTICE_KEY: 'short' }), /off for dan .*5 chars/);
  assert.match(notify.describeNoticeStatus({ ABACUS_OFFICE_NOTICE_KEY: KEY }), /Tom is emailed when dan signs in/);
});

test('a sign-in and a finished visit each post one notice with the key in a header, and say what was done', async () => {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url, init }); return { ok: true, status: 200 }; };
  const env = { ABACUS_OFFICE_NOTICE_KEY: KEY, ABACUS_OFFICE_PUBLIC_URL: 'https://www.a2bstaff.com' };
  await notify.signedIn({ username: 'dan' }, { env, fetchImpl });
  await notify.signedIn({ username: 'sam' }, { env, fetchImpl });
  assert.equal(sent.length, 1, 'only a watched person');
  assert.equal(sent[0].url, 'https://www.arringtonconsultancy.com/api/office-notice');
  assert.equal(sent[0].init.headers['x-office-notice-key'], KEY);
  const first = JSON.parse(sent[0].init.body);
  assert.equal(first.subject, 'dan is in the office now');
  assert.match(first.text, /https:\/\/www\.a2bstaff\.com\/activity/);
  await notify.visitEnded({ user_name: 'dan', started_at: '2026-11-10T15:00:00Z', last_at: '2026-11-10T15:09:00Z', ended_at: '2026-11-10T15:09:00Z', ended_how: 'signed out',
    pages: [{ at: '2026-11-10T15:00:00Z', what: 'signed in' }, { at: '2026-11-10T15:02:00Z', what: 'opened Council' }, { at: '2026-11-10T15:09:00Z', what: 'signed out' }] }, { env, fetchImpl });
  const second = JSON.parse(sent[1].init.body);
  assert.equal(second.subject, 'what dan did (9 min)');
  assert.match(second.text, /for 9 min and signed out/);
  assert.match(second.text, /15:02 {2}opened Council/);
});

test('the site accepts a notice only with the key, emails it to the fixed recipient, and is mounted ahead of CSRF', async (t) => {
  const fs = require('fs'); const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(src.indexOf('app.use(officeNoticeRoutes)') > 0 && src.indexOf('app.use(officeNoticeRoutes)') < src.indexOf('doubleCsrfProtection(req, res, next)'));

  const gap = require('../lib/scott/gapNotifier');
  const mails = [];
  gap.__setTransportForTests({ sendMail: async (m) => { mails.push(m); return {}; } });
  const before = process.env.OFFICE_NOTICE_KEY;
  t.after(() => { gap.__resetTransportForTests(); if (before === undefined) delete process.env.OFFICE_NOTICE_KEY; else process.env.OFFICE_NOTICE_KEY = before; });
  const app = express();
  app.use(require('../routes/officeNotice'));
  const server = await new Promise((r) => { const s = app.listen(0, () => r(s)); });
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/office-notice`;
  const send = (key, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-office-notice-key': key } : {}) }, body: JSON.stringify(body) });

  process.env.OFFICE_NOTICE_KEY = 'too-short';
  assert.equal((await send('too-short', { subject: 'x', text: 'y' })).status, 404, 'a short key turns the route off');
  process.env.OFFICE_NOTICE_KEY = KEY;
  assert.equal((await send('', { subject: 'x', text: 'y' })).status, 404);
  assert.equal((await send('k'.repeat(39) + 'x', { subject: 'x', text: 'y' })).status, 404);
  assert.equal((await send(KEY, { subject: '', text: 'y' })).status, 400);
  const ok = await send(KEY, { subject: 'dan is in the office now\nBcc: someone@example.invalid', text: 'dan signed in.', to: 'someone@example.invalid' });
  assert.equal(ok.status, 200);
  assert.equal(mails.length, 1);
  assert.notEqual(mails[0].to, 'someone@example.invalid', 'the caller cannot choose the recipient');
  assert.equal(mails[0].from, 'tom@arringtonconsultancy.com');
  assert.equal(mails[0].subject, 'Abacus office: dan is in the office now Bcc: someone@example.invalid', 'no line break reaches the subject');
});
