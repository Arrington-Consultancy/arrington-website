// Do the "fix this" links on the Today page go anywhere real? (16/09/2026)
//
// Tom asked for a clickable link on every NEEDS ATTENTION row. The two
// ways that goes wrong are both silent from the code: a link whose path
// is not a registered route (404), and a link whose #anchor does not
// exist in the page it opens (lands at the top, looks like the wrong
// page). Both are asserted here against the REAL route registrations and
// the REAL view files, so a rename on either side fails a test rather
// than a link.
//
// The third failure is subtler and is why the mapping is derived from
// structured fields at all: a destination routed off the WORDING of a
// gap description would change the moment the model reworded it, with
// nothing on screen to show it had. The last block pins that.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const fix = require('../../lib/workspace/fixDestination');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Every destination the module can produce, collected from its own
// tables plus the two fallbacks, so adding an entry without an anchor
// fails here rather than in front of Tom.
function allDestinations() {
  const out = [...Object.values(fix.NAMESPACE_FIXES).map((d) => d.href)];
  for (const href of Object.values(fix.CLASS_PAGES)) out.push(href);
  out.push(fix.fixForRecord({ record_key: 'authority.constitution', source_class: 'authority' })[0].href);
  out.push(fix.fixForGap({ id: 7, record_key: '' })[0].href);
  return out;
}

test('every destination is a registered workspace page route', () => {
  const routes = read('routes/workspace.js');
  const registered = new Set();
  for (const m of routes.matchAll(/\bpage\('(\/workspace[^']*)'/g)) registered.add(m[1]);
  for (const m of routes.matchAll(/\bclassPage\('(\/workspace[^']*)'/g)) registered.add(m[1]);
  assert.ok(registered.size >= 10, 'the route scan found the page registrations');

  for (const href of allDestinations()) {
    const pathOnly = href.split('#')[0].split('?')[0];
    assert.ok(registered.has(pathOnly), `${href} points at an unregistered route (${pathOnly})`);
  }
});

test('every #anchor exists in the view that route renders', () => {
  // Route path -> the view it renders. Kept here rather than derived,
  // because the derivation would be a second guess about the same thing;
  // the test above already pins the path, and a wrong view file here
  // makes the anchor assertion fail rather than pass.
  const VIEWS = {
    '/workspace/finance': 'views/workspace/finance.ejs',
    '/workspace/email': 'views/workspace/email.ejs',
    '/workspace/gaps': 'views/workspace/gaps.ejs',
    '/workspace/brain': 'views/workspace/brain.ejs'
  };

  const anchored = allDestinations().filter((h) => h.includes('#'));
  assert.ok(anchored.length >= 3, 'there are anchored destinations to check');

  for (const href of anchored) {
    const [pathOnly, anchor] = href.split('#');
    const view = VIEWS[pathOnly];
    assert.ok(view, `no view mapped for ${pathOnly}`);
    const src = read(view);
    if (anchor.startsWith('gap-')) {
      // The gap anchors are per row, so the view carries the template
      // that generates them rather than a literal id.
      assert.match(src, /id="gap-<%=\s*g\.id\s*%>"/, 'the gaps register gives each gap an id');
    } else {
      assert.ok(src.includes(`id="${anchor}"`), `${view} has no id="${anchor}" for ${href}`);
    }
  }
});

// The EJS conditions enclosing a given offset, innermost last. Written
// for the test below and nothing else, so it handles the shapes these
// views actually use (`<% if (x) { %>`, `<% } else { %>`, `<% } %>`)
// rather than being a general parser.
function enclosingConditions(src, offset) {
  // It tracks BRACE DEPTH, not if/else shapes, and both earlier versions
  // of it were wrong for the same underlying reason: a frame that is
  // pushed by one construct and popped by another drains the stack, and
  // then everything after that point in the file reads as unconditional
  // and the test below passes on a view it never really checked. The
  // first version lost a frame on `<% } else { %>`; the second still lost
  // one on `<% gmail.messages.forEach(function (m) { %>` ... `<% }) %>`,
  // which opens and closes a brace while being no kind of condition.
  // Non-conditional frames are pushed as null and dropped at the end, so
  // they hold their place without pretending to be a condition.
  //
  // It assumes no brace appears inside a string or regex literal in a
  // scriptlet, which is true of these views and is why this lives in the
  // test rather than being offered as a general parser.
  const stack = [];
  for (const m of src.matchAll(/<%[^-=#][\s\S]*?%>/g)) {
    if (m.index >= offset) break;
    const code = m[0].slice(2, -2);
    const ifCond = code.match(/\bif\s*\(([\s\S]*)\)\s*\{\s*$/);
    let popped = null;
    for (const ch of code) {
      if (ch === '}') popped = stack.length ? stack.pop() : null;
      else if (ch === '{') {
        if (ifCond) stack.push(ifCond[1].trim());
        else if (/\belse\b/.test(code) && popped !== null) stack.push(`!(${popped})`);
        else stack.push(null);
      }
    }
  }
  return stack.filter((c) => c !== null);
}

test('an anchor never sits inside a connector-state conditional', () => {
  // THE DEFECT THIS TEST IS NAMED FOR, and it was real: the email anchor
  // was first put on the "Update the Company Brain" form, which renders
  // only when Gmail is configured AND answering. The id was in the view
  // source, so a plain text scan passed it; fetching the link over real
  // HTTP with Gmail unconfigured showed it absent from the served page.
  // An anchor that disappears when a connector is down is worst in
  // exactly the state a "this is stale" link is followed in.
  const VIEWS = {
    '/workspace/finance': 'views/workspace/finance.ejs',
    '/workspace/email': 'views/workspace/email.ejs'
  };
  const CONNECTOR_FLAG = /\b(configured|enabled|connected|error|failed|writesEnabled|sendEnabled|driveEnabled)\b/;

  let checked = 0;
  for (const href of allDestinations().filter((h) => h.includes('#'))) {
    const [pathOnly, anchor] = href.split('#');
    const view = VIEWS[pathOnly];
    if (!view) continue; // the gap anchors are per row; covered above
    const src = read(view);
    const at = src.indexOf(`id="${anchor}"`);
    assert.ok(at > 0, `${view} has no id="${anchor}"`);
    for (const cond of enclosingConditions(src, at)) {
      assert.ok(!CONNECTOR_FLAG.test(cond), `${href} is inside "${cond}", so it vanishes when that connector is down`);
    }
    checked += 1;
  }
  assert.ok(checked >= 3, 'the anchored connector destinations were all checked');

  // A positive control on the helper itself: it must actually SEE the
  // conditions, or the sweep above passes by finding nothing.
  const email = read('views/workspace/email.ejs');
  const sendForm = email.indexOf('id="wsEmailSendForm"');
  assert.ok(sendForm > 0);
  const around = enclosingConditions(email, sendForm);
  assert.ok(around.some((c) => CONNECTOR_FLAG.test(c)), 'the helper detects a genuinely connector-gated element');
});

test('the Company Brain fallback lands on the record, using the search the brain page actually reads', () => {
  const [link] = fix.fixForRecord({ record_key: 'worker_register.current', source_class: 'worker_register' });
  assert.equal(link.href, '/workspace/brain?q=worker_register.current');
  // The brain route reads ?q= and searches on it. If that ever became a
  // different parameter this link would quietly show the whole list.
  assert.match(read('routes/workspace.js'), /req\.query\.q/);
  // And the search has to match on the RECORD KEY, which is what this
  // link puts in the box. It did not until 16/09/2026: the query covered
  // title and body only, so following this link reported "no matches"
  // about a record that was sitting in the database. Found by fetching
  // the link, not by reading the module that builds it.
  assert.match(read('lib/workspace/repo.js'), /WHERE title ILIKE \$1 OR body ILIKE \$1 OR record_key ILIKE \$1/);
});

// --- The mapping itself, both directions -------------------------------

test('a stale record links to the control that rewrites it', () => {
  const cases = [
    ['finance.summary', '/workspace/finance#wsAnnaUpload'],
    ['receivables.summary', '/workspace/finance#wsReceivables'],
    ['hours.log', '/workspace/finance#wsReceivables'],
    ['email.summary', '/workspace/email#wsEmailBrain']
  ];
  for (const [key, href] of cases) {
    const actions = fix.fixForRecord({ record_key: key, source_class: 'finance' });
    assert.equal(actions.length, 1, `${key} offers exactly one action`);
    assert.equal(actions[0].href, href, `${key} routes to its own control`);
    assert.ok(actions[0].label.length > 0);
  }
});

test('a snapshot record gets the Company Brain, NOT a page with no control for it', () => {
  // The negative half, and the point of the whole design: authority,
  // strategy, worker_register, technical_state and control_pack records
  // are corrected in Drive and re-ingested at boot. There is no button,
  // so sending Tom to one would be a link that looks like progress and
  // is not.
  for (const cls of ['authority', 'strategy', 'worker_register', 'technical_state', 'control_pack']) {
    const [action] = fix.fixForRecord({ record_key: `${cls}.thing`, source_class: cls });
    assert.match(action.href, /^\/workspace\/brain\?q=/, `${cls} falls back to the brain`);
  }
  // The two classes that DO have a listing page get it.
  assert.equal(fix.fixForRecord({ record_key: 'opportunity.wsa', source_class: 'opportunity' })[0].href, '/workspace/opportunities');
  assert.equal(fix.fixForRecord({ record_key: 'project.scott', source_class: 'project' })[0].href, '/workspace/projects');
});

test('a gap offers where to fix it AND where to close it, and only a human closes it', () => {
  const actions = fix.fixForGap({ id: 12, record_key: 'finance.summary' });
  assert.equal(actions.length, 2);
  assert.equal(actions[0].href, '/workspace/finance#wsAnnaUpload');
  // The second is not decoration: a gap is only ever closed on the
  // register, with a written statement of what was done.
  assert.equal(actions[1].href, '/workspace/gaps#gap-12');
  assert.equal(actions[1].label, 'Close the gap');
});

test('a gap naming no record links only to the register, and says so', () => {
  const actions = fix.fixForGap({ id: 4, record_key: '' });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].href, '/workspace/gaps#gap-4');
  assert.equal(actions[0].label, 'Open the gap', 'it does not claim to be the fix');

  // And a gap with no usable id still lands on the register rather than
  // on a broken anchor.
  assert.equal(fix.fixForGap({ record_key: '' })[0].href, '/workspace/gaps');
  assert.equal(fix.fixForGap(null)[0].href, '/workspace/gaps');
});

test('the destination is derived from the record key, NOT from the wording of the description', () => {
  // THE ASSERTION THIS MODULE EXISTS FOR. These two gaps read as though
  // they are about email and banking respectively; neither names a
  // record. If the wording were what routed, the first would go to the
  // inbox. It must not: nothing structured says so, and a model rewrite
  // could flip it with no visible change.
  const soundsLikeEmail = fix.fixForGap({
    id: 1, record_key: '',
    description: 'No confirmed billing email address; the inbox only shows a sender address.'
  });
  assert.equal(soundsLikeEmail[0].href, '/workspace/gaps#gap-1');

  const soundsLikeBanking = fix.fixForGap({
    id: 2, record_key: '',
    description: 'finance.summary shows two credits but does not identify them as an amount owed.'
  });
  assert.equal(soundsLikeBanking[0].href, '/workspace/gaps#gap-2');

  // The same sentence WITH the record key recorded on the row does route
  // to the control, so the rule narrows on evidence rather than just
  // refusing everything.
  const recorded = fix.fixForGap({ id: 2, record_key: 'finance.summary', description: 'anything at all' });
  assert.equal(recorded[0].href, '/workspace/finance#wsAnnaUpload');
});

test('a namespace is only the segment before the first dot', () => {
  assert.equal(fix.namespaceOf('finance.summary'), 'finance');
  assert.equal(fix.namespaceOf('a.b.c'), 'a');
  assert.equal(fix.namespaceOf('nodots'), '', 'a key with no dot has no namespace');
  assert.equal(fix.namespaceOf('.leading'), '', 'and neither does a leading dot');
  assert.equal(fix.namespaceOf(null), '');
  assert.equal(fix.namespaceOf(42), '');
});

test('the Today view renders the links, and the route supplies them', () => {
  // Cheap, and it is the join that carries the whole feature: the module
  // could be perfect and the view print nothing.
  const view = read('views/workspace/today.ejs');
  assert.match(view, /a\.actions/, 'the attention rows render their actions');
  assert.match(view, /href="<%=\s*act\.href\s*%>"/, 'escaped through EJS, not concatenated');

  const routes = read('routes/workspace.js');
  assert.match(routes, /fixDestination\.fixForRecord\(r\)/);
  assert.match(routes, /fixDestination\.fixForGap\(g\)/);
  // Strict CSP: no inline style attribute may creep into these views.
  // This has been a repeat defect on the Finance view specifically.
  for (const v of ['views/workspace/today.ejs', 'views/workspace/finance.ejs', 'views/workspace/email.ejs', 'views/workspace/gaps.ejs']) {
    assert.ok(!read(v).includes('style="'), `${v} carries an inline style attribute, which the CSP blocks`);
  }
});
