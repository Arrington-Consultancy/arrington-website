// The Built proof section on Evidence.
//
// Two classes of thing are worth pinning here, and neither is layout.
//
// 1. REGISTRATION. A template has to be listed in three separate
//    VALID_TEMPLATES arrays (routes/content.js, routes/admin.js,
//    server.js) that this codebase keeps in sync by hand, and must NOT be
//    in the two auto-merge lists, or it would start appearing on pages
//    nobody added it to. Three lists kept in sync by hand is exactly the
//    thing a test should be doing instead.
//
// 2. WHAT IT WILL PUT IN A src ATTRIBUTE. The image fields are ordinary
//    CMS content, so a person can type anything into them. The render
//    path validates them the same way the documents template validates
//    its previews: a path that fails renders nothing rather than reaching
//    the page.
//
// Not pinned here, deliberately: that the screenshots look good. That is
// a judgement made by looking at them, and a test asserting an image byte
// count would only make it harder to replace one.

const { describe, test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const TEMPLATE = 'builtproof';

describe('the template is registered everywhere it has to be', () => {
  ['routes/content.js', 'routes/admin.js', 'server.js'].forEach((file) => {
    test(`${file} lists it in VALID_TEMPLATES`, () => {
      const line = read(file).split('\n').find((l) => l.includes('const VALID_TEMPLATES'));
      assert.ok(line, `${file} has no VALID_TEMPLATES line`);
      assert.ok(line.includes(`'${TEMPLATE}'`), `${file} does not list ${TEMPLATE}`);
    });
  });

  test('it is picker-only: never auto-merged onto the main page', () => {
    const line = read('server.js').split('\n').find((l) => l.includes('const defaultOrder'));
    assert.ok(line, 'server.js has no defaultOrder line');
    assert.ok(!line.includes(`'${TEMPLATE}'`),
      'a new page or a boot must never inject this section on its own');
  });

  test('it is not seeded into a newly created page', () => {
    const line = read('routes/admin.js').split('\n').find((l) => l.includes('NEW_PAGE_TEMPLATES ='));
    assert.ok(line);
    assert.ok(!line.includes(`'${TEMPLATE}'`));
  });

  test('the picker offers it, with a thumbnail that exists', () => {
    assert.match(read('views/partials/add-section-modal.ejs'), new RegExp(`id: '${TEMPLATE}'`));
    assert.ok(fs.existsSync(path.join(ROOT, `public/img/templates/${TEMPLATE}.svg`)),
      'every picker entry needs its wireframe thumbnail');
  });

  test('a new instance starts neutral rather than claiming work', () => {
    const lorem = require('../db/lorem');
    assert.ok(lorem[TEMPLATE], 'no lorem entry, so a new instance would come up empty');
    // Unlike proofstrip, whose lorem deliberately names real clients, this
    // one must not arrive pre-filled with claims about work nobody did.
    assert.match(lorem[TEMPLATE].item_1_title, /lorem ipsum|dolor/i);
    // And it must not arrive pointing at somebody else's screenshots.
    [1, 2, 3].forEach((n) => {
      assert.equal(lorem[TEMPLATE][`item_${n}_image`], '');
      assert.equal(lorem[TEMPLATE][`item_${n}_image_mobile`], '');
    });
  });

  test('the edit modal knows what every field is called', () => {
    const admin = read('public/js/admin.js');
    assert.match(admin, new RegExp(`${TEMPLATE}: 'Built proof'`));
    [1, 2, 3].forEach((n) => {
      ['title', 'body', 'outcome', 'caption', 'image', 'image_mobile'].forEach((f) => {
        assert.ok(admin.includes(`'${TEMPLATE}.item_${n}_${f}'`),
          `no label for item_${n}_${f}, so it would render as a raw key`);
      });
    });
  });
});

describe('what can reach a src attribute', () => {
  // The exact expression the section uses. Kept here as a copy on purpose:
  // if somebody loosens the one in the view, this test still holds the
  // rule and goes red.
  const ok = (p) => {
    const v = (p || '').trim();
    return !!(v && !v.includes('..') && /^\/[A-Za-z0-9._\-\/]*\.(jpe?g|png|webp|avif)$/.test(v));
  };

  test('the real paths this section ships with are accepted', () => {
    [
      '/img/evidence/scott-money-desktop.jpg',
      '/img/evidence/scott-money-mobile.jpg',
      '/img/evidence/workspace-contacts-desktop.jpg',
      '/img/evidence/workspace-contacts-mobile.jpg',
      '/img/wsa/wsa-homepage.jpg'
    ].forEach((p) => {
      assert.ok(ok(p), `${p} should be accepted`);
      assert.ok(fs.existsSync(path.join(ROOT, 'public', p)), `${p} is not in the repository`);
    });
  });

  test('anything that is not a root-relative image is refused', () => {
    [
      'javascript:alert(1)',
      'data:image/svg+xml;base64,AAAA',
      'https://example.com/shot.jpg',
      '/img/../../etc/passwd.jpg',
      '/img/evidence/shot.svg',
      '/img/evidence/shot.pdf',
      'img/evidence/shot.jpg',
      '',
      '   '
    ].forEach((p) => {
      assert.ok(!ok(p), `${JSON.stringify(p)} must never reach a src attribute`);
    });
  });

  test('the view actually applies that guard to both image fields', () => {
    const view = read('views/index.ejs');
    const start = view.indexOf("_tpl === 'builtproof'");
    assert.ok(start > 0, 'the section is missing from the view');
    const block = view.slice(start, start + 4200);
    assert.match(block, /_imgOk\(content\[_k \+ '\.item_' \+ n \+ '_image'\]\)/);
    assert.match(block, /_imgOk\(content\[_k \+ '\.item_' \+ n \+ '_image_mobile'\]\)/);
    assert.match(block, /includes\('\.\.'\)/, 'the traversal check is gone');
  });
});

describe('what the section renders', () => {
  const view = read('views/index.ejs');
  const start = view.indexOf("_tpl === 'builtproof'");
  const block = view.slice(start, start + 5200);

  test('an item with no title is dropped rather than rendering an empty band', () => {
    assert.match(block, /\.filter\(\(it\) => _strip\(it\.title\)\)/);
  });

  test('the phone gets its own crop through <picture>, not the desktop one scaled', () => {
    assert.match(block, /<source media="\(max-width: 720px\)"/);
  });

  test('no inline style attribute, which the strict CSP would block', () => {
    assert.ok(!/\sstyle="/.test(block),
      'inline styles are blocked by the CSP and have bitten this codebase before');
  });
});
