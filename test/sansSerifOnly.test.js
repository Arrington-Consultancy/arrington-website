// Brand OS FONT RULE (00 ARRINGTON BRAND OPERATING SYSTEM, read 06/10/2026):
// "Use sans serif fonts only for all documents, PDFs, presentations, website
// assets and other materials. Preferred order: 1. Poppins". Until 06/10/2026
// every public page set its headings in DM Serif Display. Tom: "we shouldn't
// be using that font should we?" Headings moved to Poppins first.
//
// Tom, the same day: "Change the lot I ditched that font for a reason." So
// everything is Poppins, body text included: the public site, the CMS admin
// styles, the Scott demo and the Workspace. DM Sans, Playfair Display and
// Source Sans 3 are gone, and this test keeps them gone.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SERIF = /DM Serif|DM Sans|DM\+Sans|Source Sans|Source\+Sans|DM\+Serif|Playfair|Georgia|Times New Roman|Garamond|Baskerville|Lora\b|Merriweather|Fraunces|(?<![-\w])serif\s*[;'",)]/i;

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(ejs|css|html)$/.test(e.name) ? [p] : [];
  });
}

test('no view or site stylesheet uses a serif font or any face but Poppins', () => {
  const offenders = [];
  for (const f of [...files(path.join(ROOT, 'views')), path.join(ROOT, 'public', 'css', 'admin.css')]) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (SERIF.test(line.replace(/sans-serif/gi, ''))) offenders.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepStrictEqual(offenders, [], `serif font on the public site:\n${offenders.join('\n')}`);
});

test('Poppins is loaded wherever headings ask for it', () => {
  for (const f of files(path.join(ROOT, 'views'))) {
    const src = fs.readFileSync(f, 'utf8');
    if (/font-family:\s*'Poppins'/.test(src) && /fonts\.googleapis\.com/.test(src)) {
      assert.ok(/family=Poppins/.test(src), `${path.relative(ROOT, f)} uses Poppins but does not load it`);
    }
  }
});
