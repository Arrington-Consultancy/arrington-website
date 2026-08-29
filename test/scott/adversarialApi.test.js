// Adversarial integration tests through the REAL authenticated path.
//
// Everything here logs in over HTTP the way a person does, keeps the
// session cookie, and posts to the live API. Nothing calls a permission
// function directly, because the failures these are written for were all
// of the same shape: the model said no while the route never asked it.
//
// Three attacks are covered, each one a thing that actually worked before
// this file existed:
//
//   1. Cross-role conversation leakage. getConversation's WHERE clause
//      short-circuited its own ownership test on any job- or enquiry-
//      scoped conversation, and a fictional staff member (user_id NULL)
//      could reach only those. A knitting operative could read the
//      owner's thread about a job, including AI replies generated from
//      evidence at the owner's clearance.
//
//   2. Direct API calls. Every mutating endpoint was gated on "is this
//      person invited to the demo", never on whether they may perform the
//      action. The difference between an operative and the owner was
//      which buttons rendered.
//
//   3. Privilege escalation. Posting straight to the impersonation
//      endpoint, and posting a forged persona.
//
// Requires a running server (SCOTT_TEST_BASE_URL) and the staff password
// (SCOTT_DEMO_STAFF_PASSWORD). Skipped otherwise rather than silently
// passing, because a skipped adversarial test that reports green is
// worse than no test.
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.SCOTT_TEST_BASE_URL;
const STAFF_PW = process.env.SCOTT_DEMO_STAFF_PASSWORD;
const RUNNABLE = !!(BASE && STAFF_PW);

function makeJar() {
  const jar = new Map();
  return {
    pull(res) {
      (res.headers.getSetCookie ? res.headers.getSetCookie() : []).forEach((c) => {
        const pair = c.split(';')[0];
        const i = pair.indexOf('=');
        jar.set(pair.slice(0, i), pair.slice(i + 1));
      });
    },
    header: () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
  };
}

// Logs in as a fictional staff member over the real login route and
// returns a session that can call the API.
async function loginPortal(username, password) {
  const jar = makeJar();
  const g = await fetch(`${BASE}/scott/login`, { redirect: 'manual' });
  jar.pull(g);
  const html = await g.text();
  const tokens = [...html.matchAll(/name="_csrf"\s+value="([^"]+)"/g)].map((m) => m[1]);
  const body = new URLSearchParams({ username, password });
  if (tokens.length) body.set('_csrf', tokens[tokens.length - 1]);
  const p = await fetch(`${BASE}/scott/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: jar.header() },
    body: body.toString(),
    redirect: 'manual'
  });
  jar.pull(p);
  return { jar, landed: p.headers.get('location') };
}

// A page load refreshes the CSRF cookie, so the token must be scraped
// from the same response whose cookie is now in the jar.
async function csrfFrom(jar, path) {
  const r = await fetch(`${BASE}${path}`, { headers: { Cookie: jar.header() }, redirect: 'manual' });
  jar.pull(r);
  const html = await r.text();
  return (html.match(/name="csrf-token" content="([^"]+)"/) || html.match(/name="_csrf" value="([^"]+)"/) || [])[1] || '';
}

async function apiPost(jar, path, payload, token) {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: jar.header(), 'x-csrf-token': token },
    body: JSON.stringify(payload || {}),
    redirect: 'manual'
  });
}

async function apiGet(jar, path) {
  return fetch(`${BASE}${path}`, { headers: { Cookie: jar.header() }, redirect: 'manual' });
}

describe('adversarial: real session and API path', { skip: RUNNABLE ? false : 'set SCOTT_TEST_BASE_URL and SCOTT_DEMO_STAFF_PASSWORD' }, () => {
  let owner;
  let operative;
  let driver;
  let baitIds = [];

  // The tests plant their own bait rather than relying on whatever
  // conversations happen to exist. Ambient data made the leak test pass
  // vacuously on a database with nothing to leak, which is the same
  // failure as not having written it. Fixtures go in through the database
  // because creating one through the API needs a live model call; the
  // ATTACK is still pure HTTP against the real authenticated route.
  async function plantBait() {
    if (!process.env.DATABASE_URL) return [];
    const db = require('../../db/pool');
    const { rows: staff } = await db.query(
      "SELECT id, persona_id FROM scott_portal_users WHERE username IN ('scott.mercer','tony.marsh')");
    const ids = [];
    for (const s of staff) {
      const { rows } = await db.query(
        `INSERT INTO scott_conversations (portal_user_id, persona_id, title, related_job_id)
         VALUES ($1, $2, $3, (SELECT id FROM scott_jobs ORDER BY id LIMIT 1)) RETURNING id`,
        [s.id, s.persona_id, `adversarial bait for ${s.persona_id}`]);
      const id = rows[0].id;
      // A job-scoped conversation with real content: the exact shape the
      // old WHERE clause handed to anybody who asked for it by id.
      await db.query(
        `INSERT INTO scott_messages (conversation_id, sender, worker_id, content)
         VALUES ($1,'user',NULL,$2), ($1,'worker','company_brain',$3)`,
        [id, 'What is the director loan position?',
         'BAIT-MARKER-DLA the balance is GBP 9,850 owed to Scott Mercer.']);
      ids.push(id);
    }
    return ids;
  }

  before(async () => {
    baitIds = await plantBait();
    owner = await loginPortal('scott.mercer', STAFF_PW);
    operative = await loginPortal('jo.bell', STAFF_PW);
    driver = await loginPortal('mike.evans', STAFF_PW);
    assert.match(owner.landed || '', /\/scott$/, 'owner login must succeed');
    assert.match(operative.landed || '', /\/scott$/, 'operative login must succeed');
    assert.match(driver.landed || '', /\/scott$/, 'driver login must succeed');
  });

  // ---------------------------------------------------------------
  // 1. Cross-role conversation leakage
  // ---------------------------------------------------------------
  test('the bait exists, so the leak tests are not passing on an empty table', () => {
    assert.ok(baitIds.length >= 2,
      'expected planted bait conversations; without them the leak tests prove nothing');
  });

  test('a low-clearance login cannot read another login\'s conversation', async () => {
    // Walk conversation ids directly. This is the attack as performed:
    // no UI, just an authenticated GET against every id in range.
    const leaked = [];
    for (const id of baitIds) {
      const r = await apiGet(operative.jar, `/api/scott/conversations/${id}/messages`);
      assert.notEqual(r.status, 200,
        `bait conversation ${id} (owned by another login) was readable by jo.bell`);
    }
    for (let id = 1; id <= 60; id += 1) {
      const r = await apiGet(operative.jar, `/api/scott/conversations/${id}/messages`);
      if (r.status === 200) {
        const body = await r.json();
        if (Array.isArray(body.messages) && body.messages.length) leaked.push(id);
      }
    }
    assert.deepEqual(leaked, [],
      `conversation ids ${leaked.join(', ')} were readable by jo.bell, who owns none of them`);
  });

  test('the driver cannot read conversations either', async () => {
    const leaked = [];
    for (let id = 1; id <= 60; id += 1) {
      const r = await apiGet(driver.jar, `/api/scott/conversations/${id}/messages`);
      if (r.status === 200) {
        const body = await r.json();
        if (Array.isArray(body.messages) && body.messages.length) leaked.push(id);
      }
    }
    assert.deepEqual(leaked, [], `conversation ids ${leaked.join(', ')} were readable by mike.evans`);
  });

  // ---------------------------------------------------------------
  // 2. Direct API calls against mutating endpoints
  // ---------------------------------------------------------------
  test('an operative cannot change a job status by posting directly', async () => {
    const token = await csrfFrom(operative.jar, '/scott');
    const r = await apiPost(operative.jar, '/api/scott/jobs/SAKS-1041/status', { status: 'completed' }, token);
    assert.equal(r.status, 403, `expected 403, got ${r.status}: ${(await r.text()).slice(0, 160)}`);
  });

  test('an operative cannot assign an enquiry by posting directly', async () => {
    const token = await csrfFrom(operative.jar, '/scott');
    const r = await apiPost(operative.jar, '/api/scott/enquiries/1/assign', { workerId: 'commercial' }, token);
    assert.equal(r.status, 403, `expected 403, got ${r.status}`);
  });

  test('a driver cannot decide a writeback by posting directly', async () => {
    const token = await csrfFrom(driver.jar, '/scott');
    const r = await apiPost(driver.jar, '/api/scott/approvals/1/decide', { decision: 'approve' }, token);
    // 403 for authority, or 404 if that id is not pending. Never 200.
    assert.notEqual(r.status, 200, 'a driver must never successfully decide an approval');
    assert.ok([403, 404].includes(r.status), `expected 403 or 404, got ${r.status}`);
  });

  test('a driver cannot redraft a writeback by posting directly', async () => {
    const token = await csrfFrom(driver.jar, '/scott');
    const r = await apiPost(driver.jar, '/api/scott/approvals/1/redraft', {}, token);
    assert.notEqual(r.status, 200);
  });

  test('the owner CAN change a job status, so the guard is authority and not a blanket block', async () => {
    // Without this, every test above would pass on a route that is simply
    // broken for everyone.
    const token = await csrfFrom(owner.jar, '/scott');
    const r = await apiPost(owner.jar, '/api/scott/jobs/SAKS-1041/status', { status: 'in_progress' }, token);
    assert.equal(r.status, 200, `owner must be able to act, got ${r.status}`);
  });

  // ---------------------------------------------------------------
  // 3. Privilege escalation
  // ---------------------------------------------------------------
  test('a fictional staff member cannot impersonate anyone', async () => {
    const token = await csrfFrom(operative.jar, '/scott');
    const r = await apiPost(operative.jar, '/api/scott/impersonate', { personaId: 'scott_mercer' }, token);
    assert.equal(r.status, 403);
  });

  test('and still sees nothing extra after trying', async () => {
    // The attempt must not leave a half-applied state behind.
    const r = await apiGet(operative.jar, '/scott/finance');
    const html = await r.text();
    assert.ok(!html.includes('owed to Scott Mercer'),
      'the director loan figure must not appear after a refused escalation');
  });

  test('the bait marker appears on no surface the operative can reach', async () => {
    // The document's own bar: a single restricted value appearing in any
    // surface is a failure even if the main screen hides it.
    const surfaces = ['/scott', '/scott/finance', '/scott/brain', '/scott/activity',
      '/api/scott/search?q=director', '/api/scott/search?q=loan'];
    for (const path of surfaces) {
      const r = await apiGet(operative.jar, path);
      const text = await r.text();
      assert.ok(!text.includes('BAIT-MARKER-DLA'),
        `the planted marker leaked to jo.bell via ${path}`);
    }
  });

  test('search returns nothing beyond the operative\'s clearance', async () => {
    const r = await apiGet(operative.jar, '/api/scott/search?q=moorland');
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.deepEqual(body.customers || [], [], 'customer rows must not reach a login without customers_contact');
    assert.deepEqual(body.enquiries || [], [], 'enquiry rows must not reach a login without leads');
    (body.jobs || []).forEach((j) => {
      assert.ok(!('price_pence' in j), 'a job price must not reach a login without job_margin');
    });
  });

  // ------------------------------------------------------------
  // Brain Gaps: closing one is an act, not a view
  // ------------------------------------------------------------
  // The resolve route is the one place where a person asserts that a
  // controlled record has been put right, so it is worth attacking
  // directly rather than trusting that the button only appears for the
  // right people.
  describe('brain gap resolution', () => {
    let financeGapId;
    let yarnGapId;

    before(async () => {
      if (!process.env.DATABASE_URL) return;
      const db = require('../../db/pool');
      const mk = async (domain, text) => {
        const { rows } = await db.query(
          `INSERT INTO scott_brain_gaps (domain, gap_type, missing_evidence, why_it_matters,
             expected_source, responsible_persona_id, responsible_name, work_can_continue,
             material, status, notify_decision, email_status)
           VALUES ($1,'conflicting',$2,'planted by the adversarial suite','07 test source',
             null,'',false,true,'open','routed','pending') RETURNING id`,
          [domain, text]);
        return rows[0].id;
      };
      financeGapId = await mk('finance_full', 'BAIT-GAP-FINANCE the August margin contradicts the ledger');
      yarnGapId = await mk('yarn_stock', 'BAIT-GAP-YARN the cream count contradicts the purchase order');
    });

    after(async () => {
      if (!process.env.DATABASE_URL) return;
      const db = require('../../db/pool');
      await db.query('DELETE FROM scott_brain_gaps WHERE missing_evidence LIKE $1', ['BAIT-GAP-%']);
    });

    test('a finance gap is invisible on the gaps page to a knitting operative', async () => {
      const r = await apiGet(operative.jar, '/scott/gaps');
      assert.equal(r.status, 200);
      const html = await r.text();
      assert.ok(!html.includes('BAIT-GAP-FINANCE'),
        'a gap description quotes the missing evidence, so an unfiltered list is a leak');
    });

    test('a knitting operative cannot close a finance gap by calling the API directly', async () => {
      const token = await csrfFrom(operative.jar, '/scott/gaps');
      const r = await apiPost(operative.jar, `/api/scott/gaps/${financeGapId}/resolve`,
        { sourceCorrected: true, note: 'I have corrected the ledger, closing this.' }, token);
      assert.equal(r.status, 403, 'closing a gap requires clearance for the record it is about');
    });

    test('a close with no explanation is refused, on a gap the caller CAN see', async () => {
      // Positive control on the clearance half: this one is refused for
      // the note, not for the domain, which proves the previous 403 was
      // really about authority.
      const token = await csrfFrom(operative.jar, '/scott/gaps');
      const r = await apiPost(operative.jar, `/api/scott/gaps/${yarnGapId}/resolve`,
        { sourceCorrected: true, note: 'done' }, token);
      assert.equal(r.status, 400);
      const body = await r.json();
      assert.match(body.error, /Say what you corrected/);
    });

    test('an authorised close works, and a second one is refused as a conflict', async () => {
      const token = await csrfFrom(operative.jar, '/scott/gaps');
      const ok = await apiPost(operative.jar, `/api/scott/gaps/${yarnGapId}/resolve`,
        { sourceCorrected: true, note: 'Counted it: 0 on hand, 24 due 2 September. Source corrected.' }, token);
      assert.equal(ok.status, 200, 'the person who owns the yarn must be able to close a yarn gap');
      const body = await ok.json();
      assert.equal(body.gap.status, 'resolved');

      const again = await apiPost(operative.jar, `/api/scott/gaps/${yarnGapId}/resolve`,
        { sourceCorrected: true, note: 'Closing it again for good measure.' }, token);
      assert.equal(again.status, 409, 'a second close must not read as a second, different close');
    });

    test('the owner can close the finance gap the operative could not', async () => {
      // Without this the 403 above could be satisfied by a route that
      // refuses everybody.
      const token = await csrfFrom(owner.jar, '/scott/gaps');
      const r = await apiPost(owner.jar, `/api/scott/gaps/${financeGapId}/resolve`,
        { sourceCorrected: false, note: 'Planted by the test suite, not a real gap.' }, token);
      assert.equal(r.status, 200);
      const body = await r.json();
      assert.equal(body.gap.status, 'dismissed', 'no source correction claimed means dismissed, not resolved');
    });
  });
});
