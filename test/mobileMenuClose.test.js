// The mobile menu's close button must sit above the open menu.
//
// Found 26/09/2026 on the sale-readiness journey audit: the nav is a fixed
// element with its own stacking context (z-index 100), so the hamburger's own
// z-index only counts inside the nav, and the full-screen menu (105) covered
// the whole bar including the X. On every page at phone width the only way out
// of the menu was to tap a link. The fix lifts the nav above the menu while it
// is open. Both copies of the styles and of the script carry it, because a fix
// in one of a duplicated pair silently does nothing on half the site.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const zOf = (css, selector) => {
  const m = new RegExp(selector.replace(/[.#]/g, '\\$&') + '\\s*\\{[^}]*?z-index:\\s*(\\d+)').exec(css);
  return m ? Number(m[1]) : null;
};

for (const file of ['views/partials/site-chrome-styles.ejs', 'views/index.ejs']) {
  test(`${file}: the open-menu nav stacks above the mobile menu`, () => {
    const css = read(file);
    const menu = zOf(css, '.mobile-menu');
    const openNav = zOf(css, 'nav.menu-open');
    assert.ok(menu !== null, 'mobile menu z-index not found');
    assert.ok(openNav !== null, 'nav.menu-open rule missing');
    assert.ok(openNav > menu, `nav.menu-open (${openNav}) must be above .mobile-menu (${menu})`);
  });
}

for (const file of ['views/partials/site-chrome-script.ejs', 'views/index.ejs']) {
  test(`${file}: opening and closing the menu toggles the nav's menu-open class`, () => {
    const src = read(file);
    const block = src.slice(src.indexOf('// Hamburger menu toggle'), src.indexOf('// Hamburger menu toggle') + 1500);
    assert.match(block, /navBar\.classList\.toggle\('menu-open', open\)/);
    assert.match(block, /navBar\.classList\.remove\('menu-open'\)/);
  });
}
