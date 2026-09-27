// The Owner Dependency Quiz's bottom padding (Tom, 27/09/2026). The page's own
// 5rem stacked on the enquiry section's 5rem top padding and, after the intro's
// small citation line, read as 161px of empty navy on a phone. The fix is the
// quiz page only: the enquiry section's spacing is global and must not move,
// and Tom declined the extra space above the 69% evidence because it would push
// "Start the quiz" further down.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('the quiz page ends with 2.5rem of padding, not 5rem', () => {
  const src = read('views/owner-dependency-quiz.ejs');
  const main = src.match(/\n\s*main \{[^}]*\}/);
  assert.ok(main, 'the quiz page still has its main rule');
  assert.match(main[0], /padding: calc\(var\(--site-chrome\) \+ 2\.5rem\) 1\.5rem 2\.5rem;/);
});

test('the global enquiry-section spacing is untouched', () => {
  const chrome = read('views/partials/site-chrome-styles.ejs');
  assert.match(chrome, /\.footer-contact \{[^}]*padding: 5rem 2rem;/);
});

test('no extra space was added above the 69% evidence', () => {
  const src = read('views/owner-dependency-quiz.ejs');
  assert.match(src, /\.odr-evidence \{ font-size: 0\.9rem; line-height: 1\.5; color: var\(--text-muted\); margin: 0 0 1\.2rem; \}/);
});
