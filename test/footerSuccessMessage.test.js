// The footer enquiry form's success message speaks as the business: "we".
// It shows for up to a second before the redirect to /thank-you, on every
// page, so it is website copy like any other. Until 26/09/2026 it said "I will
// get back to you", against the Brand Operating System's rule that the website
// uses "we" outside Useful Thinking. The message lives in both copies of the
// site script (the shared partial and index.ejs's own), and a fix to one of a
// duplicated pair silently leaves half the site on the old wording, so both
// are asserted.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

for (const file of ['views/partials/site-chrome-script.ejs', 'views/index.ejs']) {
  test(`${file}: the footer success message says "we", not "I"`, () => {
    const src = read(file);
    assert.ok(src.includes("status.textContent = 'Thanks. We will get back to you shortly.';"), 'the "we" success message has gone');
    assert.ok(!/I will get back to you/.test(src), 'the first-person success message is back');
  });
}
