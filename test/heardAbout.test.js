// "How did you hear about us?" on the footer contact form (19/09/2026).
//
// Three things are worth pinning here and the rest follows from them:
// the question is OPTIONAL, so an unanswered form must still submit; the
// selection is an ALLOWLIST, so a crafted value cannot write arbitrary text
// into the record; and the free-text box belongs to Other alone, so the
// stored answer always means what the dropdown says it means.
//
// The last block is a source scan rather than a unit test, because the
// failure it guards against is not a wrong value: it is the answer being
// collected and then quietly not reaching Tom. That was the explicit ask.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { OPTIONS, OTHER_ID, parseHeardAbout, describeHeardAbout } = require('../lib/heardAbout');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('the six options Tom asked for, in his order, with Other last', () => {
  assert.deepEqual(OPTIONS.map((o) => o.label), [
    'Google search',
    'Google advert',
    'Recommended by someone',
    'Social media',
    'AI assistant, such as ChatGPT',
    'Other'
  ]);
  assert.equal(OPTIONS[OPTIONS.length - 1].id, OTHER_ID, 'Other is the fallback, so it sits last');
  assert.equal(new Set(OPTIONS.map((o) => o.id)).size, OPTIONS.length, 'ids are unique');
});

test('an unanswered question is a normal submission, not an error', () => {
  // The whole point of "optional". Every one of these is a real shape a
  // browser can post: the field absent, empty, or the body itself missing.
  for (const body of [{}, { heard_about: '' }, { heard_about: '   ' }, null, undefined, 'nonsense', []]) {
    assert.deepEqual(parseHeardAbout(body), { heardAbout: '', heardAboutOther: '' });
  }
  assert.equal(describeHeardAbout('', ''), '', 'and nothing is printed for it');
});

test('every real option round-trips to its own label', () => {
  for (const opt of OPTIONS) {
    const parsed = parseHeardAbout({ heard_about: opt.id });
    assert.equal(parsed.heardAbout, opt.id);
    assert.equal(describeHeardAbout(parsed.heardAbout, parsed.heardAboutOther), opt.label);
  }
});

test('only an allowlisted id is stored, and a prototype key is not one', () => {
  // THE ASSERTION THIS MODULE'S null-prototype MAP EXISTS FOR. "constructor"
  // and "toString" resolve on a plain object, so a crafted selection would
  // otherwise be treated as a real option. Same shape as workspace finding
  // T3 and the Scott ACTION_DOMAINS fix.
  for (const hostile of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    assert.equal(parseHeardAbout({ heard_about: hostile }).heardAbout, '', `${hostile} is not an option`);
    assert.equal(describeHeardAbout(hostile, ''), '', `${hostile} prints nothing`);
  }
  // And neither is a near-miss or a label typed in place of an id.
  for (const wrong of ['Google search', 'google_searchx', 'GOOGLE_SEARCH', 'other other', 42, {}]) {
    assert.equal(parseHeardAbout({ heard_about: wrong }).heardAbout, '');
  }
  // Surrounding whitespace IS forgiven, because every field on this form is
  // trimmed and "other " means other. Matching is exact after that.
  assert.equal(parseHeardAbout({ heard_about: '  other  ' }).heardAbout, 'other');
});

test('the free-text box belongs to Other alone', () => {
  // THE RULE THAT KEEPS THE ANSWER MEANINGFUL. Without it a submission
  // could select "Google search" and still post arbitrary prose into the
  // record, so a counted answer would no longer mean what it says.
  const smuggled = parseHeardAbout({ heard_about: 'google_search', heard_about_other: 'anything at all' });
  assert.deepEqual(smuggled, { heardAbout: 'google_search', heardAboutOther: '' });
  assert.equal(describeHeardAbout(smuggled.heardAbout, smuggled.heardAboutOther), 'Google search');

  // With Other it is kept, and it is what gets shown, because "Other" on
  // its own says almost nothing.
  const kept = parseHeardAbout({ heard_about: 'other', heard_about_other: 'At the Devon Chamber breakfast' });
  assert.deepEqual(kept, { heardAbout: 'other', heardAboutOther: 'At the Devon Chamber breakfast' });
  assert.equal(describeHeardAbout(kept.heardAbout, kept.heardAboutOther), 'Other: At the Devon Chamber breakfast');

  // Other with nothing typed is still a real answer, just a thin one.
  assert.equal(describeHeardAbout('other', ''), 'Other');
  assert.equal(describeHeardAbout('other', '   '), 'Other');
});

test('the free text is stripped, flattened and capped like every other field', () => {
  const nasty = parseHeardAbout({
    heard_about: 'other',
    heard_about_other: '  <script>alert(1)</script>A friend\r\nat\tthe pub  '
  });
  assert.equal(nasty.heardAboutOther, 'A friend at the pub', 'no tags, no newlines, trimmed');
  assert.ok(!nasty.heardAboutOther.includes('<'));

  const long = parseHeardAbout({ heard_about: 'other', heard_about_other: 'x'.repeat(5000) });
  assert.equal(long.heardAboutOther.length, 200, 'capped under the column width');
});

test('an id with no matching option reports nothing rather than a raw value', () => {
  // A row stored before an option was renamed. Printing "google_serch" at
  // Tom in the Leads panel would be worse than printing nothing.
  assert.equal(describeHeardAbout('retired_option', ''), '');
  assert.equal(describeHeardAbout(null, 'text'), '');
  assert.equal(describeHeardAbout(undefined, undefined), '');
});

// --- Does the answer actually reach Tom? ------------------------------

test('the form offers exactly the module\'s options and posts both fields', () => {
  const footer = read('views/partials/site-footer.ejs');
  assert.match(footer, /name="heard_about"/, 'the question is on the form');
  assert.match(footer, /name="heard_about_other"/, 'so is the Other box');
  // Rendered from the module, never hand-listed, so the dropdown and the
  // server's allowlist cannot drift apart.
  assert.match(footer, /heardAboutOptions\.forEach/);
  for (const opt of OPTIONS) {
    assert.ok(!footer.includes(`value="${opt.id}"`), `${opt.id} must not be hard-coded in the view`);
  }
  // The options reach the view without being threaded through fourteen
  // includes; a missed include would be a 500 on a live page.
  assert.match(read('server.js'), /app\.locals\.heardAboutOptions\s*=\s*require\('\.\/lib\/heardAbout'\)\.OPTIONS/);
  // The Other box starts hidden in the markup so it cannot flash on load.
  assert.match(footer, /id="leadHeardAboutOtherRow"[^>]*/);
  assert.match(footer, /class="[^"]*lead-row-hidden[^"]*"[^>]*id="leadHeardAboutOtherRow"/);
});

test('the answer is stored, emailed and shown in the admin Leads panel', () => {
  // The explicit ask was that it "comes through with the rest of the
  // enquiry". Collecting it and dropping it on the floor is the failure
  // this test exists for, and it is invisible to every unit test above.
  const leads = read('routes/leads.js');
  assert.match(leads, /INSERT INTO leads[\s\S]*heard_about, heard_about_other/, 'stored on the row');
  assert.match(leads, /How they heard about us: \$\{heardAboutLine\}/, 'in the notification email');
  assert.match(leads, /parseHeardAbout\(body\)/, 'parsed through the allowlist, not read raw');

  const admin = read('routes/admin.js');
  assert.match(admin, /heard_about, heard_about_other/, 'selected by the Leads API');
  assert.match(admin, /heard_about_summary: describeHeardAbout/, 'and derived server-side');

  const adminJs = read('public/js/admin.js');
  assert.match(adminJs, /lead\.heard_about_summary/, 'rendered in the panel');
  // Raw visitor input, so it must go through escapeHtml like the rest.
  assert.match(adminJs, /Heard about us: \$\{escapeHtml\(lead\.heard_about_summary\)\}/);
});

test('both columns exist in the schema, added the way that reaches production', () => {
  const schema = read('db/schema.sql');
  // CREATE TABLE IF NOT EXISTS is skipped once the table exists, so a new
  // column only reaches a live database through a standalone ALTER.
  assert.match(schema, /ALTER TABLE leads ADD COLUMN IF NOT EXISTS heard_about VARCHAR\(40\) NOT NULL DEFAULT ''/);
  assert.match(schema, /ALTER TABLE leads ADD COLUMN IF NOT EXISTS heard_about_other VARCHAR\(255\) NOT NULL DEFAULT ''/);
});

test('the toggle script is in both copies of the duplicated chrome script', () => {
  // views/index.ejs and views/partials/site-chrome-script.ejs are the
  // documented duplicated pair, kept in sync by hand. A change landing in
  // one and not the other means the Other box never appears on half the
  // site, which looks exactly like the feature not working.
  for (const p of ['views/index.ejs', 'views/partials/site-chrome-script.ejs']) {
    const src = read(p);
    assert.match(src, /getElementById\('leadHeardAbout'\)/, `${p} wires the select`);
    assert.match(src, /lead-row-hidden/, `${p} toggles the Other row`);
    assert.match(src, /if \(!isOther\) otherInput\.value = '';/, `${p} clears a stale Other value`);
  }
  // Same for the two CSS copies: a select styled in one and not the other
  // would render as a browser-default control on half the pages.
  for (const p of ['views/index.ejs', 'views/partials/site-chrome-styles.ejs']) {
    const src = read(p);
    assert.match(src, /\.lead-form select,/, `${p} styles the select like the inputs`);
    assert.match(src, /\.lead-form select:focus,/, `${p} gives it the same focus state`);
    assert.match(src, /\.lead-row-hidden\s*\{\s*display: none;/, `${p} can hide the Other row`);
  }
});

test('the question is optional and does not say so, and the other two still do', () => {
  // Tom, 19/09/2026: "Is making it optional a barrier that means people won't
  // use it? Or could you have it optional without saying its optional?"
  //
  // Both halves matter and they pull against each other, which is why they
  // are asserted together. Drop the word but quietly add `required` and the
  // form starts refusing enquiries; keep it genuinely optional but print
  // "(optional)" and the label is an invitation to skip.
  const footer = read('views/partials/site-footer.ejs');
  const block = footer.slice(footer.indexOf('name="heard_about"'), footer.indexOf('lead-privacy-note'));

  assert.ok(!/optional/i.test(block), 'neither the prompt nor the Other box nags about being optional');
  assert.ok(!/\brequired\b/.test(block), 'and neither is required, so the word was not traded for the behaviour');
  assert.match(block, /<option value="">How did you hear about us\?<\/option>/, 'the prompt is the question itself');
  assert.match(block, /aria-label="How did you hear about us\?"/, 'a screen reader hears the same words a sighted visitor reads');

  // The two fields ABOVE it keep their marker, because there the word answers
  // a real hesitation ("do I have to give you my phone number?"). Removing it
  // from those would be a different and worse change.
  assert.match(footer, /name="phone" placeholder="Phone \(optional\)"/);
  assert.match(footer, /name="preferred_time" placeholder="[^"]*\(optional\)"/);
});

test('an untouched dropdown submits, which is what optional has to mean', () => {
  // The behaviour behind the missing word. A browser posts '' for a select
  // left on its prompt, and that has to be an ordinary submission rather than
  // a validation error.
  assert.deepEqual(parseHeardAbout({ heard_about: '', name: 'Someone', email: 'a@b.invalid' }),
    { heardAbout: '', heardAboutOther: '' });
  // routes/leads.js rejects only on name and email, and the question is not
  // named in that check.
  const leads = read('routes/leads.js');
  const guard = leads.slice(leads.indexOf('if (!name || !email)'), leads.indexOf('Please enter a valid email'));
  assert.ok(!guard.includes('heard'), 'the required-field guard does not mention the question');
});

test('nothing else on the form changed', () => {
  // Tom asked for one optional question and nothing else touched. The
  // existing fields, the honeypot and the privacy note are all still there
  // and still exactly as they were.
  const footer = read('views/partials/site-footer.ejs');
  for (const field of ['name="website"', 'name="name"', 'name="email"', 'name="phone"', 'name="preferred_time"', 'name="message"']) {
    assert.ok(footer.includes(field), `${field} is untouched`);
  }
  assert.match(footer, /required>\s*\n\s*<input type="email"/, 'name and email are still the only required fields');
  assert.ok(!footer.includes('heard_about" required'), 'the new question is never required');
  assert.match(footer, /lead-privacy-note/);
});
