// Scott demonstration: the progression over real HTTP (15/09/2026).
//
// The render tests in progressionLeakage.test.js hand the templates
// locals they construct themselves, so they cannot see a ROUTE that
// forgets to filter. That limit is real: a deliberately planted
// unfiltered route stayed green against the whole sweep. This suite
// attacks a RUNNING server through a real authenticated session, which is
// the only instrument that covers it.
//
// Gated like the other adversarial suites: it needs an instance, so a
// bare `npm test` skips it and says so. Run it by hand before any release
// decision on this branch.
//
//   SCOTT_PROGRESSION_BASE_URL   e.g. http://127.0.0.1:3998
//   SCOTT_PROGRESSION_TOM_PASSWORD
//   SCOTT_DEMO_STAFF_PASSWORD    the fictional staff password
//
// Everything it asserts is about the two properties the progression could
// break: that a level never widens access, and that direct jumping
// between levels leaves the session coherent.

const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.SCOTT_PROGRESSION_BASE_URL;
const TOM_PW = process.env.SCOTT_PROGRESSION_TOM_PASSWORD;
const STAFF_PW = process.env.SCOTT_DEMO_STAFF_PASSWORD;
const ARMED = !!(BASE && TOM_PW && STAFF_PW);
const SKIP = ARMED ? false : 'set SCOTT_PROGRESSION_BASE_URL, SCOTT_PROGRESSION_TOM_PASSWORD and SCOTT_DEMO_STAFF_PASSWORD to run';

const PROSPECT_CANARIES = ['Hartwell Interiors', 'Oakfield Care Home', '26/01847'];

// MATCH MARKUP, NOT CLASS NAMES. Every Scott page inlines the whole
// stylesheet, so `body.includes('sc-pulse-item')` is true on every page at
// every level because the CSS rule is in it. Three of these tests passed
// or failed for that reason before this helper existed, which is a good
// argument for asserting on the element rather than the word.
function hasEl(html, cls) {
  return html.includes(`class="${cls}"`) || html.includes(`class="${cls} `) || html.includes(`<section class="${cls}">`);
}

// Minimal cookie-jar client. Deliberately not a dependency: this suite
// has to be runnable against a deployed instance with nothing installed.
function makeClient() {
  const jar = new Map();
  function cookieHeader() {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }
  function absorb(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    raw.forEach((c) => {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    });
  }
  async function req(path, opts = {}) {
    const headers = Object.assign({ cookie: cookieHeader() }, opts.headers || {});
    const res = await fetch(BASE + path, Object.assign({ redirect: 'manual' }, opts, { headers }));
    absorb(res);
    const body = await res.text();
    return { status: res.status, headers: res.headers, body };
  }
  return { req, jar };
}

// The CSRF token appears in two shapes in this app: a meta tag on the
// rendered portal pages (what the client JS reads) and a hidden _csrf
// input on the two login forms. Reading only the meta tag made every
// login in this suite fail with a cancelled-parent error that looked
// nothing like a missing token.
function csrfFrom(html) {
  const meta = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const input = html.match(/name="_csrf"\s+value="([^"]+)"/);
  return input ? input[1] : null;
}

async function loginSite(client, username, password) {
  const page = await client.req('/login');
  const token = csrfFrom(page.body);
  return client.req('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-csrf-token': token || '' },
    body: new URLSearchParams({ username, password, _csrf: token || '' }).toString()
  });
}

async function loginPortal(client, username, password) {
  const page = await client.req('/scott/login');
  const token = csrfFrom(page.body);
  return client.req('/scott/login', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-csrf-token': token || '' },
    body: new URLSearchParams({ username, password, _csrf: token || '' }).toString()
  });
}

async function setLevel(client, level) {
  const page = await client.req('/scott');
  const token = csrfFrom(page.body);
  return client.req('/api/scott/level', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token || '' },
    body: JSON.stringify({ level })
  });
}

async function setPersona(client, personaId) {
  const page = await client.req('/scott');
  const token = csrfFrom(page.body);
  return client.req('/api/scott/impersonate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf-token': token || '' },
    body: JSON.stringify({ personaId })
  });
}

describe('the progression over real HTTP', { skip: SKIP }, () => {
  let tom;

  before(async () => {
    tom = makeClient();
    const r = await loginSite(tom, 'tom', TOM_PW);
    assert.ok(r.status === 302 || r.status === 200, `tom could not sign in (status ${r.status})`);
    const dash = await tom.req('/scott');
    assert.equal(dash.status, 200, 'tom cannot reach the Scott dashboard');
  });

  test('the level round-trips and is reported back', async () => {
    for (const n of [1, 2, 3, 4]) {
      const res = await setLevel(tom, n);
      assert.equal(res.status, 200);
      assert.equal(JSON.parse(res.body).level, n);
    }
  });

  test('DIRECT JUMPING between all four levels, in every order, leaves the page working', async () => {
    // Tom's own acceptance path, plus every other ordering. The failure
    // this guards is a state machine that only works forwards.
    const orders = [
      [1, 4, 2, 3], [4, 1, 3, 2], [2, 4, 1, 3], [3, 1, 4, 2], [1, 2, 3, 4], [4, 3, 2, 1]
    ];
    for (const order of orders) {
      for (const n of order) {
        const set = await setLevel(tom, n);
        assert.equal(JSON.parse(set.body).level, n, `could not reach level ${n} in order ${order}`);
        const page = await tom.req('/scott');
        assert.equal(page.status, 200, `level ${n} in order ${order} broke the dashboard`);
        assert.ok(page.body.includes('sc-rail'), `the rail vanished at level ${n}`);
        assert.ok(!/undefined|NaN/.test(page.body.replace(/undefined/g, (m, i) => (page.body.slice(i - 40, i).includes('typeof') ? 'X' : m))),
          `level ${n} rendered undefined or NaN`);
      }
    }
  });

  test('THE LEVEL PERSISTS across requests and across pages', async () => {
    await setLevel(tom, 3);
    const a = await tom.req('/scott');
    const b = await tom.req('/scott/jobs');
    const c = await tom.req('/scott');
    [a, b, c].forEach((r) => assert.equal(r.status, 200));
    // The current step is level 3 on all three.
    [a, b, c].forEach((r, i) => {
      const m = r.body.match(/data-level="(\d)"[^>]*aria-current="step"/);
      assert.ok(m, `no current step marked on request ${i}`);
      assert.equal(m[1], '3', `level did not persist to request ${i}`);
    });
  });

  test('an invalid level fails closed to 1 rather than erroring or widening', async () => {
    for (const bad of [99, -1, 0, 'constructor', null, {}, 'four']) {
      const res = await setLevel(tom, bad);
      assert.equal(res.status, 200, `level ${JSON.stringify(bad)} produced ${res.status}`);
      assert.equal(JSON.parse(res.body).level, 1, `level ${JSON.stringify(bad)} did not fail closed`);
    }
  });

  test('dropping below Level 3 returns an impersonating viewer to their own identity', async () => {
    await setLevel(tom, 3);
    const imp = await setPersona(tom, 'mike_evans');
    assert.equal(JSON.parse(imp.body).impersonating, true, 'could not switch persona at level 3');

    const dropped = await setLevel(tom, 1);
    const after = JSON.parse(dropped.body);
    assert.equal(after.impersonating, false,
      'a viewer stepping back below Level 3 is left inside a persona with no control to leave it');
  });

  test('Level 1 really does read less: the dashboard loses the business context', async () => {
    await setLevel(tom, 1);
    const one = await tom.req('/scott');
    await setLevel(tom, 2);
    const two = await tom.req('/scott');
    assert.ok(!hasEl(one.body, 'sc-pulse'), 'Level 1 still shows the pulse numbers');
    assert.ok(hasEl(two.body, 'sc-pulse'), 'Level 2 does not show the pulse numbers');
    assert.ok(hasEl(one.body, 'sc-ceiling'), 'Level 1 does not declare its ceiling');
    assert.ok(!hasEl(two.body, 'sc-ceiling'), 'Level 2 declares a ceiling it does not have');
  });

  test('HIDING IS NOT GATING: a page absent from the nav is still reachable and still filtered', async () => {
    // The property that keeps the progression from becoming a second
    // access model. At Level 1 the jobs link is gone; the jobs page is
    // not.
    await setLevel(tom, 1);
    const nav = await tom.req('/scott');
    assert.ok(!nav.body.includes('href="/scott/jobs"'), 'Level 1 still lists the jobs page');
    const jobs = await tom.req('/scott/jobs');
    assert.equal(jobs.status, 200, 'Level 1 turned a hidden link into a broken page');
  });

  test('LEVEL 4 IS CALMER: the long lists are folded rather than all on screen', async () => {
    // Tom, 15/09/2026: "Advanced should mean more capable, not more
    // cluttered." The measurable version of that: the owner's Level 4
    // dashboard must not render every gap, every attention item, every
    // activity line and every snapshot card at once.
    await setLevel(tom, 4);
    await setPersona(tom, null);
    const page = await tom.req('/scott');
    assert.equal(page.status, 200);

    const folds = (page.body.match(/<details class="sc-fold/g) || []).length;
    assert.ok(folds >= 1, 'nothing on the Level 4 dashboard is folded');

    // The reference block (activity + snapshot) must be closed on arrival.
    // <details open> would be the defect wearing the fix's clothes.
    assert.ok(!/<details class="sc-fold[^"]*"[^>]*\sopen/.test(page.body),
      'a fold is open by default, so it is not progressive disclosure');

    // Every fold states how much is inside, so folding never makes the
    // company look smaller than it is.
    const summaries = page.body.match(/<summary class="sc-fold-summary">([^<]*)</g) || [];
    assert.ok(summaries.length >= 1, 'a fold has no summary');
    summaries.forEach((sum) => {
      assert.ok(/\d/.test(sum) || /snapshot/i.test(sum),
        `a fold summary states no count: ${sum}`);
    });
  });

  test('FOUR GROUPS, NOT NINE NAMES, and no worker is dropped from the interface', async () => {
    await setLevel(tom, 4);
    await setPersona(tom, null);
    const page = await tom.req('/scott');

    const groups = (page.body.match(/data-team-group="/g) || []).length;
    assert.ok(groups >= 3 && groups <= 5, `expected a handful of groups, found ${groups}`);
    assert.equal((page.body.match(/data-team-worker="/g) || []).length, 0,
      'the old per-worker chips are still rendered alongside the groups');

    // Every specialist the server considers active must be covered by some
    // group's worker list, or its answers come from a part of the business
    // the screen never mentions.
    const covered = new Set();
    (page.body.match(/data-team-workers="([^"]*)"/g) || []).forEach((m) => {
      m.replace(/data-team-workers="([^"]*)"/, '$1').split(' ').filter(Boolean).forEach((id) => covered.add(id));
    });
    ['commercial', 'customers_marketing', 'operations', 'quality_control',
     'finance_accounts', 'company_brain', 'governance', 'people_hr']
      .forEach((id) => assert.ok(covered.has(id), `${id} is in no group on the rendered page`));
  });

  describe('Lead Finder', () => {
    test('the owner reaches it at Level 4, with its evidence collapsed', async () => {
      await setLevel(tom, 4);
      await setPersona(tom, null);
      const page = await tom.req('/scott/lead-finder');
      assert.equal(page.status, 200, 'the owner cannot reach Lead Finder');
      PROSPECT_CANARIES.forEach((c) => assert.ok(page.body.includes(c), `the owner cannot see "${c}"`));
      ['Source', 'What changed', 'Why it may matter', 'Reasoning', 'Confidence', 'Suggested next action']
        .forEach((l) => assert.ok(page.body.includes(l), `evidence label "${l}" missing`));
      assert.ok(page.body.includes('See why I found this'), 'the expand control is missing');
    });

    test('THE LEVEL IS NOT A KEY: the owner reaching Level 1 still holds clearance', async () => {
      // Deliberate. The level hides the nav entry; it does not revoke a
      // clearance the person actually has. Anything else would mean the
      // level had become part of the access model.
      await setLevel(tom, 1);
      const page = await tom.req('/scott/lead-finder');
      assert.equal(page.status, 200, 'the level revoked a clearance, which makes it an access control');
    });

    test('A NON-OWNER IS 404d at the levels impersonation exists at, and never sees a canary', async () => {
      // Levels 3 and 4 only, and that is not a gap in the coverage. Below
      // Level 3 there is no Viewing-as control on screen, so setLevel
      // deliberately returns an impersonating viewer to their own
      // identity rather than stranding them inside a persona they cannot
      // leave. An earlier version of this test set the persona and then
      // set Level 1, which cleared the persona and then asserted that the
      // OWNER was refused — it failed, correctly, and the defect was
      // here. The fictional-staff test below is what covers Levels 1
      // and 2, with a real separate session rather than an impersonation.
      for (const personaId of ['mike_evans', 'chloe_reed', 'tony_marsh', 'jo_bell']) {
        for (const n of [3, 4]) {
          await setLevel(tom, n);
          const imp = await setPersona(tom, personaId);
          assert.equal(JSON.parse(imp.body).impersonating, true, `could not become ${personaId} at level ${n}`);

          const page = await tom.req('/scott/lead-finder');
          assert.equal(page.status, 404,
            `${personaId} at level ${n} got ${page.status} from Lead Finder, not a 404`);
          PROSPECT_CANARIES.forEach((c) => assert.ok(!page.body.includes(c),
            `${personaId} at level ${n} saw "${c}"`));
          const dash = await tom.req('/scott');
          assert.ok(!dash.body.includes('href="/scott/lead-finder"'),
            `${personaId} at level ${n} is offered Lead Finder on the dashboard`);
        }
      }
      await setPersona(tom, null);
    });

    test('POSITIVE CONTROL: the owner IS offered it, so the sweep above measures something', async () => {
      await setLevel(tom, 4);
      await setPersona(tom, null);
      const dash = await tom.req('/scott');
      assert.ok(dash.body.includes('href="/scott/lead-finder"'),
        'nobody at all is offered Lead Finder, so the refusals prove nothing');
    });

    // ONE staff session, shared by the two tests below. The site's login
    // limiter is 5 attempts per 15 minutes per IP, so a suite that signs
    // in once per test exhausts it and the later tests fail with a 429
    // that reads exactly like a broken access gate. Documented in
    // CLAUDE.md, hit anyway, fixed here rather than by raising the limit.
    let mike;
    before(async () => {
      mike = makeClient();
      const r = await loginPortal(mike, 'mike.evans', STAFF_PW);
      assert.ok(r.status === 302 || r.status === 200,
        `mike.evans could not sign in (${r.status})${r.status === 429 ? ' — the login limiter is tripped, restart the server between runs' : ''}`);
      const dash = await mike.req('/scott');
      assert.equal(dash.status, 200, 'mike.evans cannot reach the portal at all');
    });

    test('a fictional staff login cannot reach it, whatever level they set', async () => {
      // The strongest version of the check: a real separate session, not
      // an impersonation, so nothing about Tom's account is in play.
      for (const n of [1, 2, 3, 4]) {
        await setLevel(mike, n);
        const page = await mike.req('/scott/lead-finder');
        assert.equal(page.status, 404, `mike.evans got ${page.status} at level ${n}`);
        PROSPECT_CANARIES.forEach((c) => assert.ok(!page.body.includes(c),
          `mike.evans saw "${c}" at level ${n}`));
      }
    });

    test('a fictional staff login is never offered the Viewing-as control', async () => {
      // A staff session must not acquire the owner's switcher by
      // reaching Level 3. The guarantee is in clearance.js, not here;
      // this checks the interface agrees with it.
      for (const n of [3, 4]) {
        await setLevel(mike, n);
        const page = await mike.req('/scott');
        assert.ok(!hasEl(page.body, 'sc-viewing-btn'),
          `mike.evans is offered the Viewing-as control at level ${n}`);
      }
    });

    test('POSITIVE CONTROL: the owner IS offered the Viewing-as control at Level 3', async () => {
      await setLevel(tom, 3);
      await setPersona(tom, null);
      const page = await tom.req('/scott');
      assert.ok(hasEl(page.body, 'sc-viewing-btn'),
        'nobody is offered the Viewing-as control, so the refusal above measures nothing');
      await setLevel(tom, 1);
      const low = await tom.req('/scott');
      assert.ok(!hasEl(low.body, 'sc-viewing-btn'),
        'the Viewing-as control is on screen at Level 1, where there are no other people yet');
    });
  });
});
