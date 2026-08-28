// GLOBAL WRITING RULE enforcement.
//
// The live Drive authority (00A MASTER AI RULEBOOK, "GLOBAL WRITING RULE")
// bans em dashes across "all AI and human-drafted worker outputs, website
// copy, landing pages, SEO metadata, advertising, social content, emails,
// proposals, reports, handoffs, internal records, documents, presentations
// and all staff-facing or user-facing writing". Tom restated it on
// 28/08/2026 as banned across every project, everywhere.
//
// This test exists because a manual sweep already failed once. On
// 28/08/2026 a grep for the literal "—" character reported the Scott views
// clean while three em dashes were still rendering on screen, because they
// were written as the HTML entity &mdash;. A promise that the copy is clean
// is not worth anything; a failing test is. So this checks all four ways an
// em dash can reach a reader.
//
// Scope note: this deliberately checks RENDERED text and model-facing
// prompt text, not source comments. A comment explaining a CSS decision is
// not writing anyone reads as Arrington's voice. Prompt text IS checked,
// because a system prompt instructing a model to "never use em dashes"
// while itself using them is teaching by counter-example.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

// All four routes an em dash can take to a reader.
const EM_DASH = /—|&mdash;|&#8212;|&#x2014;/;

// Items awaiting Tom's explicit decision, each with the reason it is not
// simply fixed. These are NOT permanent exemptions: delete the entry once
// Tom rules on it. Anything not listed here must stay clean.
//
// Keyed on a distinctive snippet of the line rather than a line number, on
// purpose. A line number silently drifts the moment anyone edits anything
// above it in the file, which would either stop exempting the real line or
// start exempting an innocent one.
const AWAITING_TOM = [
  {
    file: 'views/index.ejs',
    contains: 'intervention-quote-attribution',
    reason:
      'Testimonial attribution dash before a name. A comma reads wrong there, so the fix ' +
      'is either dropping the dash entirely or keeping it as a typographic convention ' +
      'rather than prose. That is a visible change to live public copy and a style call, ' +
      'so it is Tom\'s to make, not mine.'
  }
];

function isExempt(relPath, line) {
  return AWAITING_TOM.some((e) => e.file === relPath && line.includes(e.contains));
}

// Strips EJS comments (<%# ... %>), EJS-embedded JS block/line comments, and
// HTML comments, so a note-to-self about a CSS decision does not fail a copy
// rule.
//
// Every branch blanks non-newline characters only, so reported line numbers
// match the real file. Note [^\S\n] rather than \s for the leading indent:
// \s matches newlines, so with the m flag `^\s*//` happily swallows the
// preceding blank line and the replacement then deletes that newline,
// shifting every line number after it by one. That bug was real and did
// misreport this file's own findings before it was fixed.
const blankKeepingNewlines = (m) => m.replace(/[^\n]/g, ' ');

function stripComments(source) {
  return source
    .replace(/<%#[\s\S]*?%>/g, blankKeepingNewlines)
    .replace(/<!--[\s\S]*?-->/g, blankKeepingNewlines)
    .replace(/\/\*[\s\S]*?\*\//g, blankKeepingNewlines)
    .replace(/^[^\S\n]*\/\/.*$/gm, blankKeepingNewlines)
    .replace(/^[^\S\n]*\*.*$/gm, blankKeepingNewlines);
}

function walk(dir, filter, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, filter, found);
    else if (filter(full)) found.push(full);
  }
  return found;
}

function offendingLines(absPath) {
  const rel = path.relative(ROOT, absPath);
  const cleaned = stripComments(fs.readFileSync(absPath, 'utf8'));
  const hits = [];
  cleaned.split('\n').forEach((line, i) => {
    if (EM_DASH.test(line) && !isExempt(rel, line)) {
      hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
    }
  });
  return hits;
}

describe('GLOBAL WRITING RULE: no em dashes in anything a reader sees', () => {
  test('no view template renders an em dash, in any of its four forms', () => {
    const views = walk(path.join(ROOT, 'views'), (f) => f.endsWith('.ejs'));
    assert.ok(views.length > 10, 'expected to actually find the view templates');

    const hits = views.flatMap(offendingLines);
    assert.deepEqual(
      hits,
      [],
      `Em dash in rendered copy. Use a comma, full stop or brackets instead:\n${hits.join('\n')}`
    );
  });

  test('no Scott worker prompt or UI string contains an em dash', () => {
    const libFiles = walk(path.join(ROOT, 'lib', 'scott'), (f) => f.endsWith('.js'));
    assert.ok(libFiles.length > 5, 'expected to actually find the Scott lib files');

    const hits = libFiles.flatMap(offendingLines);
    assert.deepEqual(
      hits,
      [],
      `Em dash in Scott prompt or UI text. The governance preamble tells every worker never ` +
        `to use one, so the prompts themselves must not:\n${hits.join('\n')}`
    );
  });

  test('the exemption list stays short and documented', () => {
    // A guard against this list quietly becoming the place em dashes go to
    // live. If it is growing, the rule is not being enforced, it is being
    // routed around.
    assert.ok(
      AWAITING_TOM.length <= 3,
      `${AWAITING_TOM.length} exemptions is too many. These are meant to be decisions ` +
        `pending with Tom, not a permanent allow-list.`
    );
    for (const e of AWAITING_TOM) {
      assert.ok(e.reason && e.reason.length > 40, `exemption for ${e.file} needs a real reason`);
    }
  });
});
