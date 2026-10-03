// One owner email per completed Owner Dependency Quiz, and none for sharing
// (Tom, 03/10/2026: one test journey flooded his inbox with "completed",
// "Share on Facebook", "Share on LinkedIn" and "Copy quiz link" emails).
//
// Two mechanisms were behind it and both are pinned here. The share and
// copy buttons posted to /api/quiz/share-notify, which emailed on every
// click by design. And the completion request was fired from Turnstile's
// callback, which runs every time the widget issues a token, including its
// own background refresh of an expired one, so one completion could post
// several times, each with a fresh valid token. The fix is a completion id
// minted once per verification screen, claimed server-side under a primary
// key so the database and not the browser decides which request is first.
//
// The first half is a source scan (the client must send the id, the
// callback must be guarded, the share route must be gone). The second half
// is the real server over real HTTP against a throwaway database and is the
// half that matters; it is gated on QUIZ_TEST_DATABASE_URL because it seeds
// and writes to that database, and declared in test/gatedSuites.test.js.
//
// Emails are counted without sending any: GMAIL_APP_PASSWORD is left unset
// in the child, so routes/leads.js notify() logs one warning line per
// notification it would have sent, and the suite counts those lines.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('source: what the browser sends and what the server offers', () => {
  const view = read('views/owner-dependency-quiz.ejs');
  const route = read('routes/leads.js');

  test('the completion request carries a completion id minted per verification screen', () => {
    assert.match(view, /completionId = newCompletionId\(\);/);
    assert.match(view, /fetch\('\/api\/quiz\/complete-notify'[\s\S]{0,400}completionId: completionId/);
  });

  test('the Turnstile callback runs showResults once per verification screen', () => {
    assert.match(view, /callback: function \(token\) \{\s*turnstileToken = token;\s*if \(verifiedThisScreen\) return;\s*verifiedThisScreen = true;\s*onVerified\(\);/);
    assert.match(view, /verifiedThisScreen = false;\s*showScreen\(verifyEl\);/, 'the guard resets when the screen is shown again (a retake)');
  });

  test('share and copy clicks are a GA4 event and no server call', () => {
    assert.doesNotMatch(view, /share-notify/);
    assert.match(view, /gtag\('event', 'dependency_quiz_share', \{ event_category: 'tool', platform: platform \}\)/);
    assert.doesNotMatch(route, /router\.post\('\/api\/quiz\/share-notify'/);
  });

  test('the server claims the completion before writing the lead or notifying', () => {
    assert.match(route, /INSERT INTO quiz_completions \(completion_id, score, band\)[\s\S]{0,80}ON CONFLICT \(completion_id\) DO NOTHING RETURNING completion_id/);
    const claimAt = route.indexOf('const claimed = await claimQuizCompletion(');
    const leadAt = route.indexOf("INSERT INTO leads (kind, name, email, message) VALUES ('quiz_results', '', '', $1)");
    const verifyAt = route.indexOf("verifyTurnstileToken(plainText(body.turnstileToken)");
    assert.ok(verifyAt > 0 && claimAt > verifyAt, 'verification happens before the claim, so a failed attempt cannot burn the id');
    assert.ok(leadAt > claimAt, 'the lead is written only after the claim');
  });

  test('the schema creates the claim table with the id as primary key', () => {
    assert.match(read('db/schema.sql'), /CREATE TABLE IF NOT EXISTS quiz_completions \(\s*completion_id VARCHAR\(64\) PRIMARY KEY/);
  });
});

// ---------------------------------------------------------------------------

const TEST_DB_URL = process.env.QUIZ_TEST_DATABASE_URL;

describe('over HTTP: one email per completion, none for sharing', { skip: TEST_DB_URL ? false : 'set QUIZ_TEST_DATABASE_URL to run' }, () => {
  const PORT = 3977;
  const BASE = `http://127.0.0.1:${PORT}`;
  let server;
  let serverLog = '';
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    DATABASE_URL: TEST_DB_URL,
    SESSION_SECRET: 'quiz-notify-test-secret',
    NAT_PASSWORD: 'quiz-test-nat-password',
    TOM_PASSWORD: 'quiz-test-tom-password',
    PORT: String(PORT),
    QUIZ_TEST_TURNSTILE_STUB: 'true',
    NODE_OPTIONS: `--require ${path.join(ROOT, 'test', 'helpers', 'turnstileStubPreload.js')}`
    // GMAIL_APP_PASSWORD deliberately absent: no email can be sent.
  };

  const notifyCount = () => (serverLog.match(/skipping lead notification email/g) || []).length;
  const sql = (q) => execFileSync('psql', [TEST_DB_URL, '-At', '-c', q], { encoding: 'utf8' }).trim();

  before(async () => {
    execFileSync('node', ['db/seed.js'], { cwd: ROOT, env, stdio: 'pipe' });
    server = spawn('node', ['server.js'], { cwd: ROOT, env });
    server.stdout.on('data', (d) => { serverLog += d.toString(); });
    server.stderr.on('data', (d) => { serverLog += d.toString(); });
    const started = Date.now();
    while (!/running on port/.test(serverLog)) {
      if (Date.now() - started > 20000) throw new Error(`server did not start:\n${serverLog}`);
      await new Promise((r) => setTimeout(r, 200));
    }
    sql('DELETE FROM quiz_completions; DELETE FROM leads WHERE kind = $$quiz_results$$');
  });

  after(() => { if (server) server.kill(); });

  // The quiz page hands out the CSRF cookie and token together.
  async function session() {
    const res = await fetch(`${BASE}/owner-dependency-quiz`);
    assert.equal(res.status, 200);
    const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
    const html = await res.text();
    const token = html.match(/name="csrf-token" content="([^"]+)"/)[1];
    return { cookie, token };
  }

  async function post(s, route, body) {
    const res = await fetch(`${BASE}${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.token, Cookie: s.cookie },
      body: JSON.stringify(body)
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* 404 page */ }
    return { status: res.status, data };
  }

  const settle = () => new Promise((r) => setTimeout(r, 300));
  const result = (completionId, token) => ({
    completionId,
    score: 9,
    band: 'Significant dependency',
    resultsText: 'Score: 9/16 (Significant dependency)\n\nRED - Decisions: everything waits for you.',
    turnstileToken: token
  });

  test('complete the quiz: exactly one email and one lead row', async () => {
    const s = await session();
    const id = 'a'.repeat(32);
    const r = await post(s, '/api/quiz/complete-notify', result(id, 'pass-first'));
    await settle();
    assert.deepEqual(r, { status: 200, data: { ok: true } });
    assert.equal(notifyCount(), 1);
    assert.equal(sql("SELECT count(*) FROM leads WHERE kind='quiz_results'"), '1');
    assert.equal(sql('SELECT count(*) FROM quiz_completions'), '1');
  });

  test('the same completion again with a REFRESHED token (what Turnstile does after expiry): no email', async () => {
    const s = await session();
    const id = 'a'.repeat(32);
    const r = await post(s, '/api/quiz/complete-notify', result(id, 'pass-refreshed'));
    await settle();
    assert.deepEqual(r, { status: 200, data: { ok: true, duplicate: true } });
    assert.equal(notifyCount(), 1);
    assert.equal(sql("SELECT count(*) FROM leads WHERE kind='quiz_results'"), '1');
  });

  test('an exact replay of the spent request: refused by verification, no email', async () => {
    const s = await session();
    const r = await post(s, '/api/quiz/complete-notify', result('a'.repeat(32), 'pass-first'));
    await settle();
    assert.equal(r.status, 400);
    assert.equal(notifyCount(), 1);
  });

  test('a burst of six concurrent requests for one completion: exactly one email', async () => {
    const s = await session();
    const id = 'b'.repeat(32);
    const rs = await Promise.all([1, 2, 3, 4, 5, 6].map((i) => post(s, '/api/quiz/complete-notify', result(id, `pass-burst-${i}`))));
    await settle();
    assert.ok(rs.every((r) => r.status === 200));
    assert.equal(rs.filter((r) => r.data && !r.data.duplicate).length, 1, 'one winner');
    assert.equal(notifyCount(), 2);
    assert.equal(sql("SELECT count(*) FROM leads WHERE kind='quiz_results'"), '2');
  });

  test('a failed verification does not burn the id: the retry still gets its one email', async () => {
    const s = await session();
    const id = 'c'.repeat(32);
    const bad = await post(s, '/api/quiz/complete-notify', result(id, 'nope'));
    assert.equal(bad.status, 400);
    const good = await post(s, '/api/quiz/complete-notify', result(id, 'pass-retry'));
    await settle();
    assert.deepEqual(good, { status: 200, data: { ok: true } });
    assert.equal(notifyCount(), 3);
  });

  test('a stale page sending no completion id still gets one email, and one only', async () => {
    const s = await session();
    const body = result(undefined, 'pass-stale-1');
    delete body.completionId;
    const first = await post(s, '/api/quiz/complete-notify', body);
    const second = await post(s, '/api/quiz/complete-notify', { ...body, turnstileToken: 'pass-stale-2' });
    await settle();
    assert.deepEqual(first, { status: 200, data: { ok: true } });
    assert.deepEqual(second, { status: 200, data: { ok: true, duplicate: true } });
    assert.equal(notifyCount(), 4);
  });

  test('a second, genuine completion (a retake) is a new id and gets its own email', async () => {
    const s = await session();
    const r = await post(s, '/api/quiz/complete-notify', result('d'.repeat(32), 'pass-retake'));
    await settle();
    assert.deepEqual(r, { status: 200, data: { ok: true } });
    assert.equal(notifyCount(), 5);
  });

  test('Facebook, LinkedIn, X, copy text and copy link: no route, no email, repeated or not', async () => {
    const s = await session();
    for (const platform of ['facebook', 'facebook', 'linkedin', 'x', 'copy_text', 'copy_link', 'copy_link']) {
      const r = await post(s, '/api/quiz/share-notify', { platform, score: 9, band: 'Significant dependency' });
      assert.equal(r.status, 404, `${platform}: the share endpoint no longer exists`);
    }
    await settle();
    assert.equal(notifyCount(), 5);
  });

  test('revisiting the quiz page (a refresh) sends nothing', async () => {
    await session();
    await session();
    await settle();
    assert.equal(notifyCount(), 5);
    assert.equal(sql("SELECT count(*) FROM leads WHERE kind='quiz_results'"), '5');
  });

  test('the server log names each outcome without the result text', () => {
    assert.match(serverLog, /Quiz completion aaaaaaaaaaaa: 9\/16, one notification sent/);
    assert.match(serverLog, /Quiz completion aaaaaaaaaaaa: duplicate request ignored, no notification sent/);
    assert.doesNotMatch(serverLog, /everything waits for you/);
  });
});
