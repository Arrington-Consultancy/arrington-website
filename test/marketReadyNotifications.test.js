// One owner email per Market Ready Test submission, and none for sharing
// (Tom, 03/10/2026: "apply the same principle to the Market Ready Test").
//
// Inspected before changing: the share buttons posted to
// /api/market-ready-test/share-notify, which emailed on every click by
// design, the same as the quiz. The completion path was DIFFERENT from the
// quiz: submit is fired by the button, not by Turnstile's callback, so a
// refreshed token was not the weakness. The weakness was that every submit
// minted a fresh result token and wrote a fresh row with no server-side
// idempotency, so a retry after a lost response, an error-screen retry or a
// double click produced a second submission, lead row and owner email. The
// fix is a submission id minted once per assessment (kept across retries in
// the saved progress) and claimed by the insert under a unique index, with a
// duplicate answered by the EXISTING result URL.
//
// Emails are counted without sending any: GMAIL_APP_PASSWORD is unset in the
// child, so the submit route logs one "skipping Market Ready Test emails"
// line per submission that would have emailed, and the suite counts those.

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('source: what the browser sends and what the server offers', () => {
  const page = read('views/market-ready-test.ejs');
  const result = read('views/market-ready-test-result.ejs');
  const route = read('routes/marketReadyTest.js');

  test('the assessment mints a submission id once and keeps it in the saved progress', () => {
    assert.match(page, /if \(!\/\^\[a-f0-9\]\{32\}\$\/\.test\(String\(state\.submissionId \|\| ''\)\)\) \{\s*state\.submissionId = newSubmissionId\(\);\s*saveProgress\(\);/);
    assert.match(page, /submissionId: state\.submissionId,/);
  });

  test('a submit click spends its token so a double click cannot resend the same one', () => {
    assert.match(page, /var tokenForThisSubmit = turnstileToken;\s*turnstileToken = null;/);
    assert.match(page, /turnstileToken: tokenForThisSubmit/);
  });

  test('share and copy clicks on the result page are a GA4 event and no server call', () => {
    assert.doesNotMatch(result, /share-notify/);
    assert.match(result, /gtag\('event', 'market_ready_test_share', \{ event_category: 'tool', platform: platform \}\)/);
    assert.doesNotMatch(route, /router\.post\('\/api\/market-ready-test\/share-notify'/);
  });

  test('the insert claims the submission id and a conflict returns the existing result', () => {
    assert.match(route, /ON CONFLICT \(submission_id\) DO NOTHING\s*RETURNING result_token/);
    assert.match(route, /SELECT result_token FROM market_ready_submissions WHERE submission_id = \$1/);
    const verifyAt = route.indexOf('verifyTurnstileToken(plainText(body.turnstileToken, 2000)');
    const claimAt = route.indexOf('const submissionId = submissionKey(');
    const emailAt = route.indexOf("subject: `${subjectFlag}Market Ready Test");
    assert.ok(verifyAt > 0 && claimAt > verifyAt && emailAt > claimAt, 'verify, then claim, then email');
  });

  test('the schema adds the column and unique index as standalone statements', () => {
    const schema = read('db/schema.sql');
    assert.match(schema, /ALTER TABLE market_ready_submissions ADD COLUMN IF NOT EXISTS submission_id VARCHAR\(64\);/);
    assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS uq_market_ready_submission_id ON market_ready_submissions \(submission_id\);/);
    assert.ok(schema.indexOf('ADD COLUMN IF NOT EXISTS submission_id') < schema.indexOf('uq_market_ready_submission_id'), 'the column exists before the index names it');
  });
});

// ---------------------------------------------------------------------------

const TEST_DB_URL = process.env.QUIZ_TEST_DATABASE_URL;

describe('over HTTP: one email per submission, none for sharing', { skip: TEST_DB_URL ? false : 'set QUIZ_TEST_DATABASE_URL to run' }, () => {
  const PORT = 3976;
  const BASE = `http://127.0.0.1:${PORT}`;
  let server;
  let serverLog = '';
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    DATABASE_URL: TEST_DB_URL,
    SESSION_SECRET: 'mrt-notify-test-secret',
    NAT_PASSWORD: 'mrt-test-nat-password',
    TOM_PASSWORD: 'mrt-test-tom-password',
    PORT: String(PORT),
    QUIZ_TEST_TURNSTILE_STUB: 'true',
    NODE_OPTIONS: `--require ${path.join(ROOT, 'test', 'helpers', 'turnstileStubPreload.js')}`
  };

  const emailCount = () => (serverLog.match(/skipping Market Ready Test emails/g) || []).length;
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
    sql("DELETE FROM market_ready_submissions; DELETE FROM leads WHERE kind = 'market_ready_test'");
  });

  after(() => { if (server) server.kill(); });

  async function session() {
    const res = await fetch(`${BASE}/market-ready-test`);
    assert.equal(res.status, 200);
    // Keep the name=value of each cookie the page set, last one per name
    // winning, which is what a browser does (the Market Ready Test page sets
    // _csrf twice; the browser keeps the second and the meta tag matches it).
    const jar = new Map();
    for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''])) {
      const pair = c.split(';')[0];
      if (pair.includes('=')) jar.set(pair.split('=')[0], pair);
    }
    const cookie = Array.from(jar.values()).join('; ');
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
  const submission = (submissionId, token, extra) => ({
    submissionId,
    firstName: 'Probe',
    lastName: 'Owner',
    businessName: 'Probe Joinery Ltd',
    email: 'probe@example.invalid',
    answers: [1, 2, 0, 3, 1, 1, 2, 0, 1, 2],
    turnstileToken: token,
    ...extra
  });
  let firstResultUrl;

  test('submit the assessment: exactly one email, one submission row, one lead row', async () => {
    const s = await session();
    const r = await post(s, '/api/market-ready-test/submit', submission('a'.repeat(32), 'pass-mrt-1'));
    await settle();
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, true);
    assert.match(r.data.resultUrl, /^\/market-ready-test\/result\/[a-f0-9]{48}$/);
    assert.equal(r.data.duplicate, undefined);
    firstResultUrl = r.data.resultUrl;
    assert.equal(emailCount(), 1);
    assert.equal(sql('SELECT count(*) FROM market_ready_submissions'), '1');
    assert.equal(sql("SELECT count(*) FROM leads WHERE kind='market_ready_test'"), '1');
  });

  test('a retry of the same assessment with a fresh token: the SAME result, no email, no second row', async () => {
    const s = await session();
    const r = await post(s, '/api/market-ready-test/submit', submission('a'.repeat(32), 'pass-mrt-retry'));
    await settle();
    assert.equal(r.status, 200);
    assert.deepEqual(r.data, { ok: true, resultUrl: firstResultUrl, duplicate: true });
    assert.equal(emailCount(), 1);
    assert.equal(sql('SELECT count(*) FROM market_ready_submissions'), '1');
    assert.equal(sql("SELECT count(*) FROM leads WHERE kind='market_ready_test'"), '1');
  });

  test('an exact replay of the spent request: refused by verification, nothing written', async () => {
    const s = await session();
    const r = await post(s, '/api/market-ready-test/submit', submission('a'.repeat(32), 'pass-mrt-1'));
    assert.equal(r.status, 400);
    assert.equal(emailCount(), 1);
  });

  test('five concurrent requests for one assessment: one row, one email, five visitors reach the same result', async () => {
    const s = await session();
    const id = 'b'.repeat(32);
    const rs = await Promise.all([1, 2, 3, 4, 5].map((i) => post(s, '/api/market-ready-test/submit', submission(id, `pass-mrt-burst-${i}`, { businessName: 'Burst Builders' }))));
    await settle();
    assert.ok(rs.every((r) => r.status === 200 && r.data.ok));
    assert.equal(new Set(rs.map((r) => r.data.resultUrl)).size, 1, 'everyone gets the same result URL');
    assert.equal(rs.filter((r) => !r.data.duplicate).length, 1, 'one winner');
    assert.equal(emailCount(), 2);
    assert.equal(sql('SELECT count(*) FROM market_ready_submissions'), '2');
  });

  test('a failed verification does not burn the id: the retry gets its one email', async () => {
    const s = await session();
    const id = 'c'.repeat(32);
    const bad = await post(s, '/api/market-ready-test/submit', submission(id, 'nope'));
    assert.equal(bad.status, 400);
    const good = await post(s, '/api/market-ready-test/submit', submission(id, 'pass-mrt-after-fail'));
    await settle();
    assert.equal(good.status, 200);
    assert.equal(good.data.duplicate, undefined);
    assert.equal(emailCount(), 3);
  });

  test('a stale page sending no submission id still gets one email, and one only', async () => {
    const s = await session();
    const body = submission(undefined, 'pass-mrt-stale-1', { businessName: 'Stale Page Ltd' });
    delete body.submissionId;
    const first = await post(s, '/api/market-ready-test/submit', body);
    const second = await post(s, '/api/market-ready-test/submit', { ...body, turnstileToken: 'pass-mrt-stale-2' });
    await settle();
    assert.equal(first.data.duplicate, undefined);
    assert.equal(second.data.duplicate, true);
    assert.equal(second.data.resultUrl, first.data.resultUrl);
    assert.equal(emailCount(), 4);
  });

  test('a separate assessment is a new id and gets its own email', async () => {
    const s = await session();
    const r = await post(s, '/api/market-ready-test/submit', submission('d'.repeat(32), 'pass-mrt-second', { businessName: 'Second Business' }));
    await settle();
    assert.equal(r.data.duplicate, undefined);
    assert.equal(emailCount(), 5);
  });

  test('the result page renders, and reloading it sends nothing', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${BASE}${firstResultUrl}`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /Probe Joinery Ltd|New Owner Ready Score/);
    }
    await settle();
    assert.equal(emailCount(), 5);
  });

  test('Facebook, LinkedIn, X, copy text and copy link: no route, no email, repeated or not', async () => {
    const s = await session();
    const token = firstResultUrl.split('/').pop();
    for (const platform of ['facebook', 'facebook', 'linkedin', 'x', 'copy_text', 'copy_link', 'copy_link']) {
      const r = await post(s, '/api/market-ready-test/share-notify', { token, platform });
      assert.equal(r.status, 404, `${platform}: the share endpoint no longer exists`);
    }
    await settle();
    assert.equal(emailCount(), 5);
  });

  test('the server log names each outcome by id only, never the business or the answers', () => {
    assert.match(serverLog, /Market Ready Test submission aaaaaaaaaaaa: \d+\/100, one notification sent/);
    assert.match(serverLog, /Market Ready Test submission aaaaaaaaaaaa: duplicate request, existing result returned, no notification sent/);
    assert.doesNotMatch(serverLog, /Probe Joinery/);
  });
});
