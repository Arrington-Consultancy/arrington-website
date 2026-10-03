// The global smooth-scroll handler must read an anchor's href at click time
// (found 03/10/2026 while fixing the quiz notification flood). The Owner
// Dependency Quiz and Market Ready Test share buttons are anchors that start
// as href="#" and are given their real facebook/linkedin/x URL once a result
// exists. The handler matched them at load, and on click ran preventDefault
// before querySelector threw on the URL, so the share window never opened.
// Both copies of the chrome script carry the handler, so both are pinned.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

for (const file of ['views/partials/site-chrome-script.ejs', 'views/index.ejs']) {
  test(`${file}: the anchor handler re-reads the href and stands down when it is no longer in-page`, () => {
    const src = read(file);
    const handler = src.match(/querySelectorAll\('a\[href\^="#"\]'\)\.forEach\(a => \{[\s\S]*?\n\s*\}\);\n\s*\}\);/);
    assert.ok(handler, 'the smooth-scroll handler is still present');
    const body = handler[0];
    const readAt = body.indexOf("a.getAttribute('href')");
    const preventAt = body.indexOf('e.preventDefault()');
    assert.ok(readAt > 0 && readAt < preventAt, 'the href is read before the click is cancelled');
    assert.match(body, /if \(href\.charAt\(0\) !== '#' \|\| href\.length < 2\) return;/);
  });
}

test('the share anchors both tools render still start as href="#", which is what makes the guard necessary', () => {
  for (const file of ['views/owner-dependency-quiz.ejs', 'views/market-ready-test-result.ejs']) {
    assert.match(read(file), /<a href="#" id="(odr|mrt)-share-facebook" target="_blank"/);
  }
});
