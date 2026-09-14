// Scott portal: the closing "deeper dive" invitation (14/09/2026).
//
// Tom's direction: somebody who has explored the fictional company needs an
// obvious next step into the real one. What these tests actually guard is
// the three ways that could go wrong quietly:
//
//   1. The CTA points at a Scott route. /scott/* is access-gated, so an
//      invited guest following it would meet a 404, and a link that 404s
//      for its own audience is worse than no link.
//   2. It turns into a second sales process. Scott is a demonstration of
//      how the work is done, never an offer with its own funnel, so the
//      CTA must land on Arrington's ordinary contact block.
//   3. A page gets added later and silently ends without it.
//
// None of these is visible from reading one file, which is why they are
// pinned here rather than left to care.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');

const SCOTT_VIEWS = path.join(__dirname, '..', '..', 'views', 'scott');
const PARTIAL = path.join(SCOTT_VIEWS, 'partials', 'deeper-dive.ejs');

// Pages that deliberately do not carry it. Login and the 404 page are not
// places anybody has explored from; lead.ejs has no <main> of its own.
const EXEMPT = new Set(['login.ejs', 'not-found.ejs', 'lead.ejs']);

function portalPages() {
  return fs
    .readdirSync(SCOTT_VIEWS)
    .filter((f) => f.endsWith('.ejs') && !EXEMPT.has(f));
}

function renderPartial() {
  return ejs.render(fs.readFileSync(PARTIAL, 'utf8'), {}, { filename: PARTIAL });
}

test('the invitation renders with no data at all', () => {
  // It takes no props on purpose: a block that reads no record cannot leak
  // one, which is what keeps it outside the clearance model rather than
  // being one more surface that has to be filtered per persona.
  const html = renderPartial();
  assert.ok(html.includes('Want to go deeper into Scott'), 'heading missing');
  assert.ok(html.includes('only scratched the surface'), 'opening line missing');
  assert.ok(html.includes('Have a deeper dive into Scott'), 'CTA text missing');
});

test('the CTA goes to the Arrington contact block, never into /scott', () => {
  const html = renderPartial();
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

  assert.deepStrictEqual(hrefs, ['/#conversation'], 'expected exactly one link, to the site contact block');

  for (const href of hrefs) {
    assert.ok(
      !href.startsWith('/scott'),
      `the CTA must not point into the access-gated portal (got ${href})`
    );
  }
});

test('it creates no second enquiry route', () => {
  // A new form, a new endpoint or a mailto here would be a parallel sales
  // process for a demonstration that is not an offer. The existing contact
  // block is the one route.
  const src = fs.readFileSync(PARTIAL, 'utf8');
  assert.ok(!/<form\b/i.test(src), 'the invitation must not carry its own form');
  assert.ok(!/mailto:/i.test(src), 'the invitation must not carry a direct mailto');
  assert.ok(!/\/api\//.test(src), 'the invitation must not call an endpoint of its own');
});

test('every portal page ends with the invitation, immediately before </main>', () => {
  const missing = [];
  const misplaced = [];

  for (const page of portalPages()) {
    const src = fs.readFileSync(path.join(SCOTT_VIEWS, page), 'utf8');
    if (!src.includes("include('partials/deeper-dive')")) {
      missing.push(page);
      continue;
    }
    // It has to be the LAST thing in the main column. Included higher up it
    // would interrupt the records rather than close them.
    const includeAt = src.indexOf("include('partials/deeper-dive')");
    const mainAt = src.search(/^[ \t]*<\/main>[ \t]*$/m);
    if (mainAt === -1 || includeAt > mainAt) misplaced.push(page);
  }

  assert.deepStrictEqual(missing, [], 'portal pages with no closing invitation');
  assert.deepStrictEqual(misplaced, [], 'portal pages where it is not the last block in <main>');
});

test('the exempt pages do not carry it', () => {
  for (const page of EXEMPT) {
    const file = path.join(SCOTT_VIEWS, page);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(
      !src.includes('deeper-dive'),
      `${page} is exempt and should not carry the invitation`
    );
  }
});

test('it carries no inline style attribute', () => {
  // Strict CSP blocks inline style="" on this site; nonces cover <style>
  // and <script> elements only. This has bitten the workspace Finance view
  // twice, and curl-based smoke testing never catches it.
  const src = fs.readFileSync(PARTIAL, 'utf8');
  assert.ok(!/style="/.test(src), 'inline style attribute would be blocked by the CSP');
});

test('its styles are defined, so it cannot render unstyled', () => {
  // The .sc-pill-ok precedent: classes used on a Scott page but never
  // defined rendered as plain text and made the whole page look broken.
  const styles = fs.readFileSync(path.join(SCOTT_VIEWS, 'partials', 'styles.ejs'), 'utf8');
  const used = new Set(
    [...renderPartial().matchAll(/class="([^"]+)"/g)]
      .flatMap((m) => m[1].split(/\s+/))
      .filter(Boolean)
  );
  const undefinedClasses = [...used].filter((c) => !styles.includes(`.${c}`));
  assert.deepStrictEqual(undefinedClasses, [], 'classes used but never defined in the Scott stylesheet');
});
