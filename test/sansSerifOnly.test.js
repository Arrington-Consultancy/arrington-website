// Brand OS FONT RULE (00 ARRINGTON BRAND OPERATING SYSTEM, read 06/10/2026):
// "Use sans serif fonts only for all documents, PDFs, presentations, website
// assets and other materials. Preferred order: 1. Poppins". Until 06/10/2026
// every public page set its headings in DM Serif Display.
//
// Settled the same day, on Tom's decision after trying Poppins everywhere
// ("not completely sold on the new look"): HEADINGS ARE POPPINS, BODY TEXT
// IS DM SANS, on the public site, the CMS admin styles, the Scott demo and
// the Workspace. Poppins is the only face on the Brand OS list that can be
// served on the web (Aptos and Calibri are licensed Microsoft fonts); DM Sans
// is sans serif and reads better at paragraph length. No serif anywhere, and
// no third face.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SERIF = /DM Serif|DM\+Serif|Playfair|Source Sans|Source\+Sans|Georgia|Times New Roman|Garamond|Baskerville|Lora\b|Merriweather|Fraunces|(?<![-\w])serif\s*[;'",)]/i;

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.(ejs|css|html)$/.test(e.name) ? [p] : [];
  });
}

const ALL = () => [...files(path.join(ROOT, 'views')), path.join(ROOT, 'public', 'css', 'admin.css')];

test('no view or site stylesheet uses a serif font or a third face', () => {
  const offenders = [];
  for (const f of ALL()) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*|<%#)/.test(line)) return;
      if (SERIF.test(line.replace(/sans-serif/gi, ''))) offenders.push(`${path.relative(ROOT, f)}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepStrictEqual(offenders, [], `serif or unapproved font:\n${offenders.join('\n')}`);
});

test('every font loaded from Google Fonts is Poppins or DM Sans, and what a page asks for it loads', () => {
  for (const f of files(path.join(ROOT, 'views'))) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/family=([A-Za-z+0-9]+)/g)) {
      assert.ok(['Poppins', 'DM+Sans'].includes(m[1]), `${path.relative(ROOT, f)} loads ${m[1]}`);
    }
    if (/fonts\.googleapis\.com\/css2/.test(src)) {
      if (/font-family:\s*'Poppins'/.test(src)) assert.ok(/family=Poppins/.test(src), `${path.relative(ROOT, f)} uses Poppins but does not load it`);
      if (/'DM Sans'/.test(src)) assert.ok(/family=DM\+Sans/.test(src), `${path.relative(ROOT, f)} uses DM Sans but does not load it`);
    }
  }
});

test('body text is DM Sans and headings are Poppins in the shared site styles', () => {
  const chrome = fs.readFileSync(path.join(ROOT, 'views/partials/site-chrome-styles.ejs'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'views/index.ejs'), 'utf8');
  assert.ok(/body\s*\{[^}]*font-family:\s*'DM Sans'/.test(index), 'index.ejs body is not DM Sans');
  assert.ok(/font-family:\s*'Poppins'/.test(chrome + index), 'no heading uses Poppins');
  const scott = fs.readFileSync(path.join(ROOT, 'views/scott/partials/styles.ejs'), 'utf8');
  assert.ok(/\.sc-h\s*\{[^}]*'Poppins'/.test(scott), 'Scott headings are not Poppins');
  assert.ok(/font-family:\s*'DM Sans'/.test(scott), 'Scott body is not DM Sans');
});
