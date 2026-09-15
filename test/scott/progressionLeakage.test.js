// Scott demonstration: nothing leaks when the level or the persona changes.
//
// The progression adds two new ways to move around the demonstration:
// four levels, and a Viewing-as control that replaced the persona chips.
// Both change what is on screen, so both are new opportunities for the
// oldest defect in this codebase — a surface that renders its own data
// without going through the clearance filter, and is therefore fine until
// somebody switches to the persona it was never tested against.
//
// These tests render the REAL templates, at every level, as every
// persona, and sweep the rendered HTML for strings that only exist inside
// restricted records. A canary sweep of the rendered page is what found
// the per-field leak in the original build, and it found it because
// reading the code showed every record tagged correctly.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const clearance = require('../../lib/scott/clearance');
const registry = require('../../lib/scott/capabilityRegistry');
const progression = require('../../lib/scott/progression');
const leadFinder = require('../../lib/scott/leadFinder');

const SCOTT_VIEWS = path.join(__dirname, '..', '..', 'views', 'scott');
const LEVELS = [1, 2, 3, 4];
const PERSONA_IDS = Object.keys(clearance.PERSONAS);

// Strings that appear ONLY inside commercial_prospecting records. If one
// of these reaches a page rendered for anybody but the owner, the gate
// has failed, whatever the code reads like.
const PROSPECT_CANARIES = [
  'Hartwell Interiors',
  'Oakfield Care Home',
  'The Bay Hotel',
  '26/01847',
  'Devon Contracts Finder'
];

function renderSidebar(locals) {
  const file = path.join(SCOTT_VIEWS, 'partials', 'sidebar.ejs');
  return ejs.render(fs.readFileSync(file, 'utf8'), locals, { filename: file });
}

function renderLeadFinder(locals) {
  const file = path.join(SCOTT_VIEWS, 'lead-finder.ejs');
  return ejs.render(fs.readFileSync(file, 'utf8'), locals, { filename: file });
}

function sidebarLocals(personaId, level) {
  // Built from the capability registry, the same call routes/scott.js
  // makes, so this sweep exercises the real nav rather than a hand-made
  // approximation of it. Passing the persona's OWN clearance predicate is
  // the whole point: the registry's two legs are ANDed, and a sweep that
  // handed it a permissive stub would only ever test the level leg.
  const caps = registry.viewCapabilities(level, (d) => clearance.personaCanSeeDomain(personaId, d));
  return {
    active: 'dashboard',
    nonce: 'test-nonce',
    csrfToken: 'test-csrf',
    navCounts: { newEnquiries: 1, pendingApprovals: 2, openGaps: 3 },
    dataPages: [
      { path: '/scott/finance', nav: 'finance', label: 'Banking & Accounting' },
      { path: '/scott/social', nav: 'social', label: 'Social Media' },
      { path: '/scott/customers', nav: 'customers', label: 'Customers' },
      { path: '/scott/gaps', nav: 'gaps', label: 'Needs Human Input' }
    ],
    persona: clearance.getPersona(personaId),
    personaId,
    personas: clearance.PERSONAS,
    user: { kind: 'portal', username: personaId, displayName: clearance.getPersona(personaId).name, jobTitle: '' },
    canImpersonate: false,
    isImpersonating: false,
    canSee: (d) => clearance.personaCanSeeDomain(personaId, d),
    level,
    levels: progression.LEVELS,
    caps
  };
}

function leadFinderLocals(personaId, level) {
  return Object.assign(sidebarLocals(personaId, level), {
    opportunities: clearance.filterAndRedact(personaId, null, leadFinder.OPPORTUNITIES),
    leadSummary: leadFinder.summary(),
    facts: require('../../lib/scott/deepBusinessFacts'),
    deniedNote: clearance.clearanceDeniedNote
  });
}

describe('the rail renders in every state and never strands a visitor', () => {
  LEVELS.forEach((level) => {
    test(`level ${level}: all four steps are present and clickable`, () => {
      const html = renderSidebar(sidebarLocals('scott_mercer', level));
      // The rail itself is a separate partial, so render it directly.
      const file = path.join(SCOTT_VIEWS, 'partials', 'progression-rail.ejs');
      const rail = ejs.render(fs.readFileSync(file, 'utf8'), sidebarLocals('scott_mercer', level), { filename: file });
      LEVELS.forEach((n) => {
        assert.ok(rail.includes(`data-level="${n}"`), `level ${level} render is missing a control for level ${n}`);
      });
      // Exactly one current step, so the visitor always knows where they are.
      const currents = (rail.match(/aria-current="step"/g) || []).length;
      assert.equal(currents, 1, `level ${level} marks ${currents} steps as current`);
      assert.ok(html.length > 0);
    });
  });

  test('every step is reachable from every step, including backwards', () => {
    // Direct jumping is the normal case, not an edge case: somebody being
    // shown this is asked "what does that one do" out of order.
    LEVELS.forEach((from) => {
      const file = path.join(SCOTT_VIEWS, 'partials', 'progression-rail.ejs');
      const rail = ejs.render(fs.readFileSync(file, 'utf8'), sidebarLocals('scott_mercer', from), { filename: file });
      LEVELS.filter((n) => n !== from).forEach((to) => {
        assert.ok(rail.includes(`data-level="${to}"`), `cannot jump ${from} -> ${to}`);
      });
    });
  });
});

describe('the nav hides by level and refuses by clearance, never the other way round', () => {
  // THESE TWO ARE CONFIGURATION ASSERTIONS, not invariants.
  //
  // They pin the allocation Tom set on 15/09/2026, so that moving a
  // capability between levels is a deliberate act with a test to update
  // rather than something that drifts unnoticed. When he moves one after
  // using the real interface, the registry changes and so does the list
  // below. That is the intended workflow, not a failure of the test.

  test('Level 1 is the small calm workspace: the AI, today, messages and tasks', () => {
    const html = renderSidebar(sidebarLocals('scott_mercer', 1));
    ['/scott', '/scott/enquiries', '/scott/tasks']
      .forEach((p) => assert.ok(html.includes(`href="${p}"`), `Level 1 is missing ${p}`));
    // And nothing else. Everything below belongs to a larger workspace.
    ['/scott/jobs', '/scott/approvals', '/scott/customers', '/scott/email',
     '/scott/calendar', '/scott/finance', '/scott/lead-finder', '/scott/activity']
      .forEach((p) => assert.ok(!html.includes(`href="${p}"`), `Level 1 still lists ${p}`));
  });

  test('Level 2 adds the everyday applications and the business records', () => {
    const html = renderSidebar(sidebarLocals('scott_mercer', 2));
    ['/scott/email', '/scott/calendar', '/scott/jobs', '/scott/customers', '/scott/pipeline', '/scott/brain']
      .forEach((p) => assert.ok(html.includes(`href="${p}"`), `Level 2 is missing ${p}`));
    // Approvals means nothing in a workspace with one person in it, so it
    // waits for My Team. The full books wait for My Whole Company.
    ['/scott/approvals', '/scott/people', '/scott/activity', '/scott/social']
      .forEach((p) => assert.ok(!html.includes(`href="${p}"`), `Level 2 should not yet list ${p}`));
  });

  test('Level 3 is where more than one person starts to exist', () => {
    const html = renderSidebar(sidebarLocals('scott_mercer', 3));
    ['/scott/approvals', '/scott/people', '/scott/team', '/scott/quality', '/scott/stock']
      .forEach((p) => assert.ok(html.includes(`href="${p}"`), `Level 3 is missing ${p}`));
  });

  test('the workspace strictly grows: every level keeps everything below it', () => {
    // The invariant behind the three configuration assertions above. This
    // one does NOT need updating when Tom moves a capability, and it is
    // the one that would catch a move that accidentally removed something.
    const links = (lv) => (renderSidebar(sidebarLocals('scott_mercer', lv)).match(/href="\/scott[^"]*"/g) || []);
    for (let n = 2; n <= 4; n += 1) {
      const lower = links(n - 1);
      const higher = links(n);
      lower.forEach((href) => {
        // Sales & Invoices is the one deliberate exception: it is the
        // narrow view of an area that arrives whole at Level 4, so the
        // narrow link stands down rather than sitting beside it. The
        // capability is not withdrawn and the route is unchanged.
        if (href.includes('/scott/finance/sales')) return;
        assert.ok(higher.includes(href), `level ${n} dropped ${href}, which level ${n - 1} had`);
      });
      assert.ok(higher.length > lower.length, `level ${n} adds nothing over level ${n - 1}`);
    }
  });

  test('Lead Finder appears in the nav at Level 4 for the owner only', () => {
    assert.ok(renderSidebar(sidebarLocals('scott_mercer', 4)).includes('href="/scott/lead-finder"'));
    [1, 2, 3].forEach((n) => {
      assert.ok(!renderSidebar(sidebarLocals('scott_mercer', n)).includes('href="/scott/lead-finder"'),
        `Lead Finder is listed at level ${n}`);
    });
  });

  test('NO non-owner persona is offered Lead Finder at ANY level', () => {
    // The clearance leg. This is the one that must not depend on the
    // level at all: reaching Level 4 must never be a way in.
    PERSONA_IDS.filter((id) => id !== 'scott_mercer').forEach((id) => {
      LEVELS.forEach((level) => {
        const html = renderSidebar(sidebarLocals(id, level));
        assert.ok(!html.includes('/scott/lead-finder'),
          `${id} is offered Lead Finder at level ${level}`);
      });
    });
  });
});

describe('NO RESTRICTED DATA LEAKS AT ANY LEVEL, AS ANY PERSONA', () => {
  test('the prospecting canaries never reach a non-owner sidebar', () => {
    PERSONA_IDS.forEach((id) => {
      LEVELS.forEach((level) => {
        const html = renderSidebar(sidebarLocals(id, level));
        PROSPECT_CANARIES.forEach((c) => {
          assert.ok(!html.includes(c), `${id} at level ${level} sees "${c}" in the nav`);
        });
      });
    });
  });

  test('the Lead Finder page renders nothing restricted for a non-owner', () => {
    PERSONA_IDS.filter((id) => id !== 'scott_mercer').forEach((id) => {
      LEVELS.forEach((level) => {
        const html = renderLeadFinder(leadFinderLocals(id, level));
        PROSPECT_CANARIES.forEach((c) => {
          assert.ok(!html.includes(c),
            `${id} at level ${level} would see "${c}" if they reached the Lead Finder page`);
        });
      });
    });
  });

  test('POSITIVE CONTROL: the owner DOES see them, or the sweep proves nothing', () => {
    // A test that only asserts absence passes against a system that shows
    // nobody anything. This is the half that keeps the half above honest.
    const html = renderLeadFinder(leadFinderLocals('scott_mercer', 4));
    PROSPECT_CANARIES.forEach((c) => {
      assert.ok(html.includes(c), `the owner cannot see "${c}" either, so the leak sweep is measuring nothing`);
    });
  });

  test('the six evidence labels are on the page for the owner', () => {
    const html = renderLeadFinder(leadFinderLocals('scott_mercer', 4));
    ['Source', 'What changed', 'Why it may matter', 'Reasoning', 'Confidence', 'Suggested next action']
      .forEach((label) => assert.ok(html.includes(label), `the evidence label "${label}" is missing`));
  });

  test('THE PAGE TRUSTS ITS ROUTE, so the route is pinned here too', () => {
    // Stated plainly because it is a real limit on the tests above. The
    // Lead Finder template renders whatever `opportunities` it is handed:
    // it does not filter, and a route that forgot to would leak past
    // every render test in this file. Found by planting exactly that
    // defect and watching the sweep stay green.
    //
    // So the route's own two legs are asserted against its source. This
    // is a weaker instrument than exercising it, and the HTTP suite in
    // test/scott/progressionApi.test.js is what exercises it; this is
    // here because that suite needs a running server and this does not.
    const route = fs.readFileSync(path.join(__dirname, '..', '..', 'routes', 'scott.js'), 'utf8');
    const handler = route.slice(route.indexOf("app.get('/scott/lead-finder'"));
    const body = handler.slice(0, handler.indexOf('\n  });'));
    assert.ok(/personaCanSeeDomain\(\s*personaId\s*,\s*leadFinder\.DOMAIN\s*\)/.test(body),
      'the Lead Finder route no longer checks clearance before rendering');
    assert.ok(body.includes('res.status(404)'),
      'a viewer without clearance must get the ordinary 404, not an empty page');
    assert.ok(/opportunities:\s*clearance\.filterAndRedact\(/.test(body),
      'the Lead Finder route hands the template unfiltered records');
    // The clearance check must come FIRST. Ordered the other way, a
    // viewer who will never be allowed in could learn the area exists by
    // reaching Level 4 and being shown an empty page instead of a 404.
    assert.ok(body.indexOf('personaCanSeeDomain') < body.indexOf('res.render'),
      'the clearance check does not precede the render');
  });

  test('the evidence is collapsed until asked for', () => {
    const html = renderLeadFinder(leadFinderLocals('scott_mercer', 4));
    assert.ok(html.includes('See why I found this'), 'the expand control is missing');
    assert.match(html, /<div class="sc-ev" id="sc-ev-0" hidden>/,
      'the evidence panel is not hidden by default, so it permanently fills the page');
  });
});
