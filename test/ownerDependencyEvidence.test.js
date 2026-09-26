// Owner-dependency market evidence (26/09/2026): what the Owner Dependency
// Quiz and the sale-readiness page may say, where it sits, and that it stays
// off every other page.
//
// The approved package is deliberately small, and each test below guards one
// of its limits. The decision, the sources and the freshness requirement live
// in the Website handoff in Drive, not here. What lives here is the part a
// well-meaning later edit breaks: the wording drifting past its source, the
// evidence growing into the page, and a figure about who holds day-to-day
// control being turned into a claim about owner dependency, value or sale.
//
// If a source is refreshed (the survey is annual), change the wording here and
// on the page in the same commit, after verifying the new release.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
// What the browser receives. EJS comments are stripped because a comment may
// name a forbidden claim in order to forbid it.
const emitted = (p) => read(p).replace(/<%#[\s\S]*?%>/g, '');
// The words a reader sees in a fragment. Inline tags in these paragraphs sit
// inside sentences, so they are removed rather than replaced with a space.
const words = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const paragraphWithClass = (html, cls) => {
  const m = html.match(new RegExp(`<p class="(?:[^"]*\\s)?${cls}(?:\\s[^"]*)?"[^>]*>([\\s\\S]*?)</p>`));
  return m ? m[1] : null;
};
const between = (html, from, to) => {
  const a = html.indexOf(from);
  assert.ok(a > -1, `marker not found: ${from}`);
  const b = html.indexOf(to, a + from.length);
  assert.ok(b > -1, `marker not found after ${from}: ${to}`);
  return html.slice(a, b);
};

const QUIZ = 'views/owner-dependency-quiz.ejs';
const SALE = 'views/sale-readiness.ejs';

const QUIZ_EVIDENCE = "The Government's 2024 Small Business Survey found that 69% of UK businesses with 1 to 249 employees had no director in day-to-day control who was not also an owner or partner. That does not make them badly run or overly reliant on their owners. It shows how often day-to-day control stays with the people who own the business.";
const QUIZ_SOURCE = 'Source: Department for Business and Trade, Longitudinal Small Business Survey 2024: SME employers, published September 2025.';
const DBT_URL = 'https://www.gov.uk/government/statistics/small-business-survey-2024-businesses-with-employees/longitudinal-small-business-survey-2024-sme-employers-businesses-with-1-to-249-employees';
const SALE_EVIDENCE = "The British Business Bank's guidance on selling a business lists a business that relies on its owner or a single customer among the reasons an exit may not be viable.";
const BBB_URL = 'https://www.british-business-bank.co.uk/business-guidance/guidance-articles/business-essentials/selling-your-business';

const quizIntro = () => between(emitted(QUIZ), 'id="odr-intro"', '</section>');
const buyerSection = () => between(emitted(SALE), '<h2>What a buyer will want to understand</h2>', '<h2>Where the Commercial Review comes in</h2>');

test('the quiz intro carries the approved evidence and its source, word for word', () => {
  const intro = quizIntro();
  const evidence = paragraphWithClass(intro, 'odr-evidence');
  assert.ok(evidence, 'the evidence paragraph has gone from the quiz intro');
  assert.strictEqual(words(evidence), QUIZ_EVIDENCE, 'the quiz evidence wording has changed from the approved text');
  // The figure is the only emphasis, so nothing else in the sentence is
  // quietly promoted into a headline claim.
  assert.deepStrictEqual(evidence.match(/<strong>[^<]*<\/strong>/g), ['<strong>69%</strong>']);

  const source = paragraphWithClass(intro, 'odr-source');
  assert.ok(source, 'the source line has gone from the quiz intro');
  assert.strictEqual(words(source), QUIZ_SOURCE, 'the source line has changed from the approved text');
  assert.ok(source.includes(`href="${DBT_URL}"`), 'the source no longer links to the published survey');
});

test('on the quiz intro the order is explanation, evidence, button, then source', () => {
  const intro = quizIntro();
  const explanation = intro.indexOf('It is a starting point for your own judgement');
  const evidence = intro.indexOf('class="odr-evidence"');
  const button = intro.indexOf('id="odr-start"');
  const source = intro.indexOf('class="odr-source"');
  assert.ok(explanation > -1 && evidence > -1 && button > -1 && source > -1, 'a piece of the intro is missing');
  assert.ok(explanation < evidence, 'the evidence comes before the explanation of the quiz');
  assert.ok(evidence < button, 'the evidence is no longer before "Start the quiz"');
  assert.ok(button < source, 'the source line has moved above "Start the quiz"');

  // The quiz stays the one thing to do: a single primary button, and no link
  // ahead of it that leads off the page.
  assert.strictEqual((intro.match(/btn-primary/g) || []).length, 1, 'the intro no longer has exactly one primary button');
  assert.strictEqual((intro.match(/<button\b/g) || []).length, 1, 'the intro has gained a second button');
  assert.ok(!/<a\b/.test(intro.slice(0, button)), 'a link now sits ahead of "Start the quiz"');
});

test('the quiz evidence stays small: no chart, no callout, no second figure', () => {
  const intro = quizIntro();
  for (const heavy of [/<svg\b/i, /<canvas\b/i, /<table\b/i, /<figure\b/i, /<img\b/i, /chart/i]) {
    assert.ok(!heavy.test(intro), `the quiz intro has gained ${heavy}, which is heavier than the approved treatment`);
  }
  // 69% is the only figure. The 73%/98% callout and the 79/75/69 trend were
  // considered and rejected, and the British Business Bank line belongs to
  // the sale page, not to a check about day-to-day dependency.
  assert.deepStrictEqual(words(intro).match(/\d+\s?%/g), ['69%'], 'the quiz intro carries a figure other than the approved one');
  assert.ok(!/British Business Bank/i.test(emitted(QUIZ)), 'the British Business Bank point has been added to the quiz page');

  // No display numeral: the figure is bold body text, not a stat tile.
  const css = emitted(QUIZ).replace(/\/\*[\s\S]*?\*\//g, '');
  const strongRule = (css.match(/\.odr-evidence strong\s*\{[^}]*\}/) || [''])[0];
  assert.ok(strongRule, 'the figure has lost its styling rule');
  assert.ok(!/font-size|font-family/.test(strongRule), 'the figure is being styled as a display numeral');
  // Its size is what keeps "Start the quiz" on the first screen of a 390x844
  // phone: measured in a real browser at 0.9rem / 1.5, where 0.94rem pushed
  // the button off the screen. The browser check is the real proof; this
  // stops a later edit quietly enlarging it.
  const bodyRule = (css.match(/\.odr-evidence\s*\{[^}]*\}/) || [''])[0];
  const size = bodyRule.match(/font-size:\s*([\d.]+)rem/);
  const leading = bodyRule.match(/line-height:\s*([\d.]+)\s*;/);
  assert.ok(size && Number(size[1]) <= 0.9, 'the evidence has been enlarged past the size that keeps "Start the quiz" on the first screen');
  assert.ok(leading && Number(leading[1]) <= 1.5, 'the evidence line height has been opened up past the measured budget');
});

test('the sale page closes the buyer points with the approved line and adds nothing else', () => {
  const section = buyerSection();
  const line = paragraphWithClass(section, 'sr-evidence');
  assert.ok(line, 'the evidence line has gone from "What a buyer will want to understand"');
  assert.strictEqual(words(line), SALE_EVIDENCE, 'the British Business Bank line has changed from the approved text');
  assert.ok(line.includes(`href="${BBB_URL}"`), 'the line no longer links to the British Business Bank guidance');

  // It closes the section: after the five points, and nothing after it.
  assert.ok(section.indexOf(' sr-evidence"') > section.lastIndexOf('class="sr-item"'), 'the line is no longer after the buyer points');
  const afterLine = section.slice(section.indexOf('</p>', section.indexOf('class="sr-aside sr-evidence"')) + 4);
  assert.ok(/^\s*<\/div>\s*<div class="sr-section[^"]*">\s*$/.test(afterLine), 'something has been added after the evidence line inside the buyer section');
  assert.strictEqual((section.match(/class="sr-item"/g) || []).length, 5, 'the five buyer points are no longer five');

  // No new section, heading or call to action came with it.
  assert.strictEqual((section.match(/<h[1-6]\b/g) || []).length, 1, 'a heading has been added inside the buyer section');
  assert.ok(!/\bbtn\b/.test(section), 'a button has been added to the buyer section');
  assert.strictEqual((section.match(/<a\b/g) || []).length, 1, 'the buyer section has gained a link other than the source');

  // The survey figures belong to the quiz, not here.
  assert.ok(!/Small Business Survey|\b69\s?%/.test(emitted(SALE)), 'the survey figures have been added to the sale page');
});

test('no evidence claim goes beyond what its source says', () => {
  // The sentence carrying the 69% states a management-structure measure and
  // nothing else: no dependency, value, sale, failure, growth or profit claim.
  const quizText = words(quizIntro());
  const figureSentence = quizText.split(/(?<=\.)\s+/).find((s) => s.includes('69%'));
  assert.ok(figureSentence, 'the figure sentence has gone');
  const leak = figureSentence.match(/dependen|relian|valu|\bsell|\bsale|fail|grow|profit|risk/i);
  assert.ok(!leak, `the 69% sentence now makes a claim beyond management structure: "${leak && leak[0]}"`);
  // The caveat is the guardrail made visible, so it cannot be dropped.
  assert.ok(quizText.includes('That does not make them badly run or overly reliant on their owners.'), 'the caveat under the figure has gone');

  // The British Business Bank line keeps both halves of their wording and its
  // own modesty: one reason among several, and "may not", never "will not".
  const saleLine = words(paragraphWithClass(buyerSection(), 'sr-evidence') || '');
  assert.ok(/relies on its owner or a single customer/.test(saleLine), 'the line has dropped half of the British Business Bank wording');
  assert.ok(/among the reasons/.test(saleLine), 'the line now presents one reason as the guidance\'s whole verdict');
  assert.ok(/may not be viable/.test(saleLine), 'the line no longer uses the source\'s own "may not be viable"');
  assert.ok(!/will not|won't|cannot|can't|never/i.test(saleLine), 'the line has hardened the source\'s claim');

  // Across both pages: no valuation effect, sale or failure odds, guarantee,
  // or statement that a share of businesses is owner dependent.
  const forbidden = [
    [/\d+\s?%\s+(?:more|less)\s+likely/i, 'a likelihood figure'],
    [/\b(?:increase|boost|raise|add|lift)s?\b[^.]{0,60}\b(?:valuation|value|price)\b[^.]{0,20}\bby\s*\d/i, 'a valuation effect'],
    [/\bguarantee[sd]?\b[^.]{0,30}\b(?:sale|buyer|price|value)\b/i, 'a guaranteed sale or price'],
    [/\d+\s?%\s+of\b[^.]*\b(?:are|were)\s+(?:owner[- ]dependent|dependent on)/i, 'a share of businesses called owner dependent'],
    [/\bmore likely to (?:fail|close|sell)\b/i, 'a failure or sale probability']
  ];
  for (const view of [QUIZ, SALE]) {
    const text = words(emitted(view));
    for (const [rx, label] of forbidden) {
      const hit = text.match(rx);
      assert.ok(!hit, `${view} now carries ${label}: "${hit && hit[0]}"`);
    }
  }
});

test('the evidence stays off the homepage, Market Ready Test, Owner Check and the quiz results', () => {
  const markers = [/Small Business Survey/i, /British Business Bank/i, /british-business-bank\.co\.uk/i, /\b69\s?%/, /data-evidence-source/];
  const elsewhere = [
    'views/index.ejs',
    'views/market-ready-test.ejs',
    'views/market-ready-test-result.ejs',
    'views/owner-check.ejs',
    'db/seed.js',
    'db/defaults.js'
  ];
  for (const file of elsewhere) {
    const text = emitted(file);
    for (const rx of markers) {
      assert.ok(!rx.test(text), `${file} now carries the owner-dependency evidence (${rx})`);
    }
  }
  const results = between(emitted(QUIZ), 'id="odr-results"', '</section>');
  for (const rx of markers) {
    assert.ok(!rx.test(results), `the quiz results screen now carries the evidence (${rx})`);
  }
});

test('every evidence source click is measured, on the pages that carry a source', () => {
  const script = read('views/partials/site-chrome-script.ejs');
  assert.ok(/document\.querySelectorAll\('a\[data-evidence-source\]'\)/.test(script), 'the evidence source listener has gone');
  assert.ok(/gtag\('event', 'evidence_source_click'/.test(script), 'the evidence_source_click event has gone');
  assert.ok(/evidence_source: a\.dataset\.evidenceSource/.test(script), 'the event no longer names which source was clicked');
  // "source" is a GA4 traffic-source field; a custom parameter must not use it.
  assert.ok(!/[{,]\s*source\s*:/.test(script.slice(script.indexOf('evidence_source_click'))), 'the event uses the GA4 traffic-source name "source"');

  // A listener only counts on a page that runs it.
  for (const view of [QUIZ, SALE]) {
    assert.ok(/<script nonce="<%= nonce %>">\s*<%- include\('partials\/site-chrome-script'\) %>/.test(read(view)), `${view} no longer runs the shared site script`);
  }

  // Each source link carries its id, and there are exactly these two.
  const ids = [QUIZ, SALE].flatMap((v) => [...emitted(v).matchAll(/data-evidence-source="([^"]+)"/g)].map((m) => m[1]));
  assert.deepStrictEqual(ids.sort(), ['bbb-selling-your-business', 'dbt-lsbs-2024']);
  assert.ok(paragraphWithClass(quizIntro(), 'odr-source').includes('data-evidence-source="dbt-lsbs-2024"'), 'the survey link is not the one measured');
  assert.ok(paragraphWithClass(buyerSection(), 'sr-evidence').includes('data-evidence-source="bbb-selling-your-business"'), 'the guidance link is not the one measured');
});

test('the source links are ordinary same-tab links', () => {
  // Same tab on purpose: Back returns the visitor to exactly where they were,
  // and a new tab would need its own warning for screen reader users.
  for (const [view, slice] of [[QUIZ, paragraphWithClass(quizIntro(), 'odr-source')], [SALE, paragraphWithClass(buyerSection(), 'sr-evidence')]]) {
    assert.ok(!/\btarget=/.test(slice), `${view}: the source link opens a new tab without the warning that needs`);
    assert.ok(!/nofollow/.test(slice), `${view}: the source link is marked nofollow`);
  }
});
