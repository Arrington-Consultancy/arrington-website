// The approved website voice sweep (Tom, 07/10/2026). Pins the approved
// wording on both halves (CMS migration data and code-rendered pages), the
// guard that stops a later CMS edit being overwritten, and the exclusions.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { GROUPS, planGroup, VOICE_SWEEP_MARKER } = require('../lib/voiceSweepCopy');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const visible = (html) => html.replace(/<br\s*\/?>/g, ' ').replace(/<\/?p>/g, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const allTo = GROUPS.flatMap((g) => g.rows.map((r) => r.to));
const find = (key) => GROUPS.flatMap((g) => g.rows).filter((r) => r.key === key);

test('the CMS half carries the approved wording, word for word', () => {
  const approved = [
    'What you should end up with is a stronger business that makes better money and needs less from you to keep it running.',
    'We came into a fast growing business where a VAT problem had been building in the background for over a year.',
    'Tom Arrington spent over 20 years building and running businesses across Devon and Cornwall. That taught him how much the small decisions made every day affect the money, the workload and how much ends up back with the owner.',
    'Soon after, Tom and his wife Hannah started Arrington Consultancy to help other owners build stronger businesses that do not need them involved in everything.',
    'to formalise what those twenty years had taught him.',
    'Hannah brings it back to something practical, making sure what the business says matches what it actually does.',
    "We started this because we learned these lessons running businesses ourselves. Most of an owner's time goes on keeping things running, and the things that move the business forward get less attention. An outside view early on would have saved us time, money and a lot of pressure, and that is the view we now bring.",
    'If something in your business is creating more pressure than it should, tell us what is going on.',
    'The advice comes from businesses Tom has run, rebuilt and sold.',
    'No presentations and no jargon, just an honest conversation about where things stand.',
    'If too much of the business depends on you, a commercial review shows what is getting in the way and what to sort out first.',
    'The aim is better commercial decisions and a business that relies less on the owner being involved in everything.',
    "Tristan had built a successful business and, like most owners, was busy running it. The VAT had been handled incorrectly for over a year, and the liability building up behind it was big enough to take the company's entire cash reserve. We sat in the room with the figures, worked through eighteen months of data and rebuilt the reconciliation from scratch. We corrected the filing, secured the position with HMRC and saved the business from a six figure cash flow collapse.",
    'Years later Abacus and Falmouth Taxis sold, not because everything had always gone right, but because Tom had rebuilt the business after it nearly went wrong.',
    'More profit from the same workload, with revenue improving as well.',
    'a free service run by counsellors',
    'World Student Advisors was built for £999. Have a look, then tell us what yours needs to do.',
    'Built from scratch, not from a template, and completely customisable.',
    'Eight quick questions will show you how much still runs through you.'
  ];
  const corpus = visible(allTo.join(' '));
  for (const a of approved) assert.ok(corpus.includes(a), `approved wording missing: ${a}`);
});

test('every landing page gets the same lines, and Devon and Cornwall come into line with Exeter and Plymouth', () => {
  for (const slug of ['devon', 'cornwall', 'exeter', 'plymouth']) {
    const g = GROUPS.find((x) => x.page === `business-consultant-${slug}`);
    assert.ok(g, `${slug} group missing`);
    const text = visible(g.rows.map((r) => r.to).join(' '));
    assert.ok(!/30-minute/.test(text), `${slug} still says 30-minute`);
    assert.ok(text.includes('30 minute conversation'), `${slug} lost its 30 minute conversation`);
  }
  for (const slug of ['devon', 'cornwall']) {
    const g = GROUPS.find((x) => x.page === `business-consultant-${slug}`);
    const text = visible(g.rows.map((r) => r.to).join(' '));
    assert.ok(text.includes('the next step is the £500 Commercial Review.'), `${slug} step 2`);
    assert.ok(/No obligation\.$/.test(visible(g.rows.find((r) => r.key.endsWith('step_3_body')).to)), `${slug} step 3`);
  }
});

test('the replacement copy keeps the brand rules: no dashes, no hyphenated words, no first person', () => {
  const text = visible(allTo.join(' '));
  assert.ok(!/[—–]/.test(text), 'an em or en dash');
  assert.deepStrictEqual(text.match(/[A-Za-z]+-[A-Za-z]+/g) || [], [], 'a hyphenated word');
  assert.ok(!/\b(I|I'm|I've|my|me)\b/.test(text), 'first person outside Useful Thinking');
  assert.ok(!/black hole|the stomach|mess the owner|within days, not years|That is what structure does/.test(text), 'a removed line came back');
});

test('the guard: an edited row makes its whole group stand down, nothing half written', () => {
  const g = GROUPS.find((x) => x.name === 'evidence VAT Intervention');
  const cur = Object.fromEntries(g.rows.map((r) => [r.key, r.from]));
  assert.strictEqual(planGroup(g, cur).action, 'write');
  assert.strictEqual(planGroup(g, cur).writes.length, 3);
  const edited = { ...cur, [g.rows[1].key]: 'Tom edited this in the CMS' };
  const plan = planGroup(g, edited);
  assert.strictEqual(plan.action, 'stand_down');
  assert.strictEqual(plan.writes.length, 0, 'a stood-down group writes nothing');
  assert.strictEqual(plan.mismatched[0].value, 'Tom edited this in the CMS', 'the live value is reported');
  const done = Object.fromEntries(g.rows.map((r) => [r.key, r.to]));
  assert.strictEqual(planGroup(g, done).action, 'done', 'a rerun after the change writes nothing');
  assert.strictEqual(planGroup(g, {}).action, 'stand_down', 'a database without these rows writes nothing');
  assert.ok(/^site\./.test(VOICE_SWEEP_MARKER));
});

test('kept lines are kept, and excluded pages are untouched', () => {
  const keys = GROUPS.flatMap((g) => g.rows.map((r) => r.key));
  assert.ok(!GROUPS.some((g) => g.page === 'what-we-do'), 'What We Do line 5 was to be kept');
  assert.ok(!allTo.some((t) => /Understanding the business matters more/.test(t)), 'Websites and AI line 33 was to be kept');
  assert.ok(!keys.some((k) => /^article__\d+\.(body|heading)/.test(k)), 'a Useful Thinking article body was touched');
  assert.strictEqual(find('intervention__7.heading').length, 0, 'The reason we are here heading was to be kept');
  for (const v of ['views/taxi-operators.ejs', 'views/start-up-review.ejs', 'views/privacy.ejs']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', v)));
  }
});

test('the code-rendered half carries the approved wording and none of the old lines', () => {
  const checks = [
    ['views/index.ejs', 'A free five minute quiz that shows where the business still depends on you. No email needed to see your result.', 'and what that is costing'],
    ['views/index.ejs', 'Eight quick questions will show you how much still runs through you.', 'One straightforward question'],
    ['views/where-to-start.ejs', 'An outside read on the business, written down.', 'where the next edge may be'],
    ['views/where-to-start.ejs', 'If you go on to either bigger option, the £500 comes off.', 'richer, sharper or more capable'],
    ['views/where-to-start.ejs', 'A fixed-price website built from scratch, not from a template, and completely customisable.', 'API integrations, CRM-style'],
    ['views/where-to-start.ejs', "taking work off the owner's desk.", 'worth protecting'],
    ['views/where-to-start.ejs', 'can connect to the systems you already use or use AI where it is useful.', 'within days, not years'],
    ['views/where-to-start-commercial-review.ejs', 'The Commercial Review stands on its own. You are paying for our judgement and a written direction you can act on.', 'A genuine Commercial Review in its own right'],
    ['views/where-to-start-commercial-review.ejs', 'produce a written report: what we found, what we would do about it and what to do first.', 'assessment, recommendations, direction, and next steps'],
    ['views/where-to-start-commercial-review.ejs', 'We listen for as long as it takes, whether that is thirty minutes or two hours.', 'as long as it genuinely takes'],
    ['views/where-to-start-full-commercial-review.ejs', 'We spend a lot more time following the evidence, including time inside the business where it helps, and work the recommendations through with you in far more depth.', 'Substantially more time'],
    ['views/where-to-start-full-review-website-build.ejs', 'They have grown, added services or changed direction, and the website still describes the business they used to be.', 'fresh commercial platform'],
    ['views/where-to-start-website-build.ejs', 'Built from scratch, not from a template, and completely customisable.', 'Not dropped into a template'],
    ['views/owner-check.ejs', 'It is hard to see your own business clearly from the inside. These short checks ask a few honest questions and show you where to look first, without jargon or generic advice.', 'Just practical insight'],
    ['views/owner-check.ejs', 'Written answers in your own words', 'free-text'],
    ['views/commercial-gaps-review.ejs', 'Usually 11 or 12 questions, around 10 minutes.', '8&ndash;15'],
    ['views/commercial-gaps-review.ejs', 'It is a starting point. It helps you and us see what is worth talking about, so the conversation starts in the right place.', 'not an online consultancy service'],
    ['views/product-guide.ejs', 'It gives you a sensible next step. It does not replace Tom looking at the business properly.', 'This is not a diagnostic'],
    ['views/sale-readiness.ejs', 'in a seven figure exit.', 'seven-figure']
  ];
  for (const [file, now, gone] of checks) {
    const src = read(file);
    assert.ok(src.includes(now), `${file}: approved line missing: ${now}`);
    assert.ok(!src.includes(gone), `${file}: old line still present: ${gone}`);
  }
  for (const f of ['views/owner-check.ejs', 'views/commercial-gaps-review.ejs']) {
    assert.ok(!/day-to-day|free-text/.test(visible(read(f).replace(/<%[\s\S]*?%>/g, ''))), `${f} still says day-to-day or free-text`);
  }
  for (const f of ['views/where-to-start-website-build.ejs', 'views/where-to-start-full-review-website-build.ejs']) {
    assert.ok(!read(f).includes('on-page'), `${f} still says on-page`);
  }
});
