'use strict';

// Each office AI worker has a small icon beside its name (Tom, 17/10/2026:
// "our ai workers with a small logo next to them"). Line icons drawn for
// the office, decorative only, in every place a worker is named.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const { WORKERS } = require('../lib/taxiOffice/workers');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const PARTIAL = path.join(ROOT, 'views/taxi-office/partials/worker-icon.ejs');

test('every worker has its own icon, decorative, in the office colours and without inline styles', async () => {
  const seen = new Set();
  for (const w of WORKERS) {
    const tile = await ejs.renderFile(PARTIAL, { id: w.id, tile: true });
    const chip = await ejs.renderFile(PARTIAL, { id: w.id });
    assert.match(tile, new RegExp(`class="to-wicon to-wicon-${w.id}"`), `${w.id}: tile`);
    assert.match(chip, /class="to-wicon-inline"/, `${w.id}: chip`);
    for (const html of [tile, chip]) {
      assert.match(html, /<svg [^>]*aria-hidden="true" focusable="false"/, `${w.id}: hidden from screen readers, the name is beside it`);
      assert.match(html, /stroke="currentColor"/, `${w.id}: takes its colour from the page`);
      assert.doesNotMatch(html, /style="/, `${w.id}: no inline style (strict CSP)`);
    }
    const shape = tile.replace(/<\/?span[^>]*>/g, '');
    assert.ok(!seen.has(shape), `${w.id}: its own icon, not another worker's`);
    seen.add(shape);
  }
  assert.equal((await ejs.renderFile(PARTIAL, { id: 'nobody', tile: true })).trim(), '', 'an unknown worker gets nothing rather than a broken icon');
});

test('the icon sits beside each worker on the Today cards, the worker pages and the chips', () => {
  assert.match(read('views/taxi-office/today.ejs'), /include\('partials\/worker-icon', \{ id: w\.id, tile: true \}\)/);
  for (const [view, id] of [['complaints', 'complaints'], ['licensing', 'licensing'], ['social', 'social']]) {
    assert.match(read(`views/taxi-office/${view}.ejs`), new RegExp(`<h1 class="to-h1-icon"><%- include\\('partials/worker-icon', \\{ id: '${id}', tile: true \\}\\) %>`), view);
  }
  assert.match(read('views/taxi-office/inbox.ejs'), /<span class="to-chip"><%- include\('partials\/worker-icon', \{ id: row\.worker \}\) %>/);
  assert.match(read('views/taxi-office/email.ejs'), /<span class="to-chip"><%- include\('partials\/worker-icon', \{ id: worker \}\) %>/);
  const css = read('public/css/taxi-office.css');
  for (const rule of ['.to-wicon {', '.to-wicon svg', '.to-worker-head {', '.to-h1-icon {', '.to-wicon-inline svg']) assert.ok(css.includes(rule), rule);
});
