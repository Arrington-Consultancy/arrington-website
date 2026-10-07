'use strict';

// The approved website voice sweep, CMS half (Tom, 07/10/2026; Website &
// Hosting Handoff Log, "7 October 2026 Voice sweep final approval and
// implementation authority"). The code-rendered half was changed in the
// views directly (commit 16dde9d).
//
// Every `from` is production's exact stored value, read back by a read-only
// seed probe on deployment 55ddd57b (07/10/2026) rather than taken from the
// July snapshot, because rows edited in the CMS since then carry wording and
// inline tags no file in this repository holds. Instance ids are production's
// own allocations, so on any other database nothing matches and nothing is
// written, which is the intended behaviour.
//
// THE GUARD, applied by db/seed.js: a group is written only if EVERY row in
// it still holds its `from` value (or already holds its `to`). A row Tom has
// edited in the CMS since the probe makes the whole group stand down and its
// live value is logged, so a later CMS edit is never overwritten and a case
// study is never left half old and half new. Run once, under a marker.
//
// Inline emphasis (<strong>) already on a line is kept where the approved
// wording still contains the emphasised words, so the change is to the words
// and not to the look.

const VOICE_SWEEP_MARKER = 'site.voice_sweep_2026-10-07';

const BR = '<br /><br />\n\n';

// The four city landing pages carry the same rows on different instance ids.
const LANDING = [
  { page: 'business-consultant-devon', hero: 'hero__4', cs: 'casestudy', ap: 'approach', bio: 'biography', older: true },
  { page: 'business-consultant-cornwall', hero: 'hero__6', cs: 'casestudy__8', ap: 'approach__3', bio: 'biography__8', older: true },
  { page: 'business-consultant-exeter', hero: 'hero__7', cs: 'casestudy__9', ap: 'approach__4', bio: 'biography__9', older: false },
  { page: 'business-consultant-plymouth', hero: 'hero__8', cs: 'casestudy__10', ap: 'approach__5', bio: 'biography__10', older: false }
];

const STEP_3_LEAD = 'You leave with a clear understanding of the opportunities, the priorities and whether working together makes commercial sense.';
const STEP_2_TAIL = 'We listen, go through the business and the evidence, and write it up: what we found, what we would do about it, and what to do first.';

function landingGroup(l) {
  const rows = [
    // 11. 30 minute, not 30-minute.
    { key: `${l.hero}.cta`,
      from: 'Book your <strong>30-minute conversation</strong>',
      to: 'Book your <strong>30 minute conversation</strong>' },
    // 15. Dependency line.
    { key: `${l.hero}.subtext`,
      from: `Built from <strong>over 20 years</strong> running, growing and selling real businesses.${BR}If your business depends too heavily on you, a commercial review helps identify what is working, what is getting in the way and where the biggest improvements can be made.`,
      to: `Built from <strong>over 20 years</strong> running, growing and selling real businesses.${BR}If too much of the business depends on you, a commercial review shows what is getting in the way and what to sort out first.` },
    // 12. Operator proof.
    { key: `${l.cs}.subtext`,
      from: 'The advice we give comes from businesses we have actually <strong>run, rebuilt and successfully exited.</strong>',
      to: 'The advice comes from businesses Tom has <strong>run, rebuilt and sold.</strong>' },
    // 11 and 13. Discussion line.
    { key: `${l.ap}.step_1_body`,
      from: `A <strong>30-minute conversation</strong> about your business.${BR}No presentations. No jargon. Just an honest discussion about where things stand.`,
      to: `A <strong>30 minute conversation</strong> about your business.${BR}No presentations and no jargon, just an honest conversation about where things stand.` },
    // 11. 30 minute.
    { key: `${l.bio}.col_1_p2`,
      from: 'Most relationships begin with a straightforward 30-minute conversation before deciding whether a commercial review is the right next step.',
      to: 'Most relationships begin with a straightforward 30 minute conversation before deciding whether a commercial review is the right next step.' },
    // 16. Outcome line.
    { key: `${l.bio}.col_2_p2`,
      from: 'The objective is simple: better commercial decisions, clearer structure and a business that relies less on the owner being involved in everything.',
      to: 'The aim is better commercial decisions and a business that relies less on the owner being involved in everything.' }
  ];
  if (l.older) {
    // 14. Devon and Cornwall into line with Exeter and Plymouth.
    rows.push(
      { key: `${l.ap}.step_2_body`,
        from: `If we both think it is worth exploring further, the next step is the <strong>Commercial Review, £500.</strong>${BR}${STEP_2_TAIL}`,
        to: `If we both think it is worth exploring further, the next step is the <strong>£500 Commercial Review.</strong>${BR}${STEP_2_TAIL}` },
      { key: `${l.ap}.step_3_body`,
        from: `${STEP_3_LEAD}${BR}No obligation. No pressure.`,
        to: `${STEP_3_LEAD}${BR}No obligation.` }
    );
  }
  return { name: `landing page ${l.page}`, page: l.page, rows };
}

const ABOUT_STORY_HEAD = 'At 22 Tom sold his PlayStation, TV and bike, then borrowed the rest to buy a struggling taxi firm. There was no plan B, just a gut feeling and plenty to learn.<br /><br />Over the next two decades the business grew fifteenfold and eventually sold for seven figures. Those years taught him that small daily decisions make or break a company.<br /><br />It was those small calls that carried the business through the shocks of Covid and allowed Tom to support the drivers and the community around them.<br /><br />After the sale Tom took six months off, then studied at Oxford’s Saïd Business School to formalise what those twenty years had ';

const HANNAH_HEAD = "Hannah leads the marketing side of the business. She has spent fifteen years working in marketing across some of the UK's most recognised organisations, including the Trussell Trust and the Woodland Trust.<br /><br />That background taught her the most important lesson in marketing: <strong>what you say only works if it matches how you actually operate</strong>, and if the right people understand it quickly. In most owner run businesses, marketing is either overcomplicated or completely neglected. ";

const ABACUS_HEAD = 'The taxi business came far closer to the edge than it should have.<br /><br />The lesson in hindsight was not complicated. A business can be growing and still be drifting away from what actually makes it work.<br /><br />Tom rebuilt the structure, tightened control, got closer to the numbers, and brought the focus back to the business that had real momentum. Over time, the business became stronger, clearer, and less dependent on everything running through him. ';

const GROUPS = [
  { name: 'home', page: 'main', rows: [
    // 2. Core outcome.
    { key: 'filter.p2',
      from: '<p>The work is better control, clearer structure, stronger margin, and a business that leans less on the owner being in the middle of everything.</p>',
      to: '<p>What you should end up with is a stronger business that makes better money and needs less from you to keep it running.</p>' },
    // 3. VAT case study line.
    { key: 'casestudy2.intro',
      from: 'We walked into a business where the growth was real but the oversight was non-existent.',
      to: 'We came into a fast growing business where a VAT problem had been building in the background for over a year.' },
    // 4. Operator proof.
    { key: 'filter__2.p1',
      from: '<p>Tom Arrington has spent over 20 years inside real businesses across Devon and Cornwall, where the small decisions made every day shaped the numbers, the people, the customers and the pressure on the owner. That experience now helps owner run businesses see which calls matter most.</p>',
      to: '<p>Tom Arrington spent over 20 years building and running businesses across Devon and Cornwall. That taught him how much the small decisions made every day affect the money, the workload and how much ends up back with the owner.</p>' }
  ] },
  { name: 'about us', page: 'about-us', rows: [
    // 6 and 7. Oxford line and Arrington purpose; the purpose keeps its emphasis.
    { key: 'intervention__3.subtext',
      from: `${ABOUT_STORY_HEAD}actually taught him. Soon after, Tom and his wife Hannah started Arrington Consultancy. <strong>Helping owners strengthen the structure underneath the business, so the business does not need the owner for everything.</strong>`,
      to: `${ABOUT_STORY_HEAD}taught him. Soon after, Tom and his wife Hannah started Arrington Consultancy <strong>to help other owners build stronger businesses that do not need them involved in everything.</strong>` },
    // 8. Hannah.
    { key: 'intervention__2.subtext',
      from: `${HANNAH_HEAD}Hannah brings it back to something practical. Clear positioning, consistent messaging, and no gap between what the business says and what it does.`,
      to: `${HANNAH_HEAD}Hannah brings it back to something practical, making sure what the business says matches what it actually does.` },
    // 9. The reason we are here: one paragraph, heading kept.
    { key: 'intervention__7.subtext',
      from: 'We started this because we learned these lessons by running businesses ourselves.<br><br>Early on, an outside perspective would have saved time, money, and a lot of pressure.<br><br>Most of the time goes into keeping things running. What moves the business forward gets less attention.<br /><br /><strong>The perspective we needed is the one we now bring.</strong>',
      to: "We started this because we learned these lessons running businesses ourselves. Most of an owner's time goes on keeping things running, and the things that move the business forward get less attention. An outside view early on would have saved us time, money and a lot of pressure, and that is the view we now bring." },
    // 10. CTA.
    { key: 'hero__2.heading',
      from: 'You’ve seen how we work. If something in your business is creating more pressure than it should, tell us what is going on.',
      to: 'If something in your business is creating more pressure than it should, tell us what is going on.' }
  ] },
  ...LANDING.map(landingGroup),
  { name: 'evidence VAT Intervention', page: 'evidence', rows: [
    // 17. Same facts, no verdict on the owner. The case study keeps its
    // three parts: pull quote, body, highlighted outcome.
    { key: 'casestudy2__5.intro',
      from: 'We walked into a business where the growth was real but the oversight was non-existent. Tristan had built a success, but the back office was a black hole.',
      to: 'Tristan had built a successful business and, like most owners, was busy running it.' },
    { key: 'casestudy2__5.body',
      from: "The VAT had been incorrectly managed for over a year, creating a hidden liability that was threatening to swallow the company's entire cash reserve. We didn't just find the error; we sat in the room, untangled eighteen months of forensic data, and rebuilt the reconciliation process from scratch.",
      to: "The VAT had been handled incorrectly for over a year, and the liability building up behind it was big enough to take the company's entire cash reserve.<br /><br />We sat in the room with the figures, worked through eighteen months of data and rebuilt the reconciliation from scratch." },
    { key: 'casestudy2__5.outcome',
      from: 'We corrected the filing, secured the position with HMRC, and saved the business from a <strong>six-figure cash flow collapse</strong>. It wasn\'t about "consultancy". It was about having the stomach to fix the mess the owner was too busy to see.',
      to: 'We corrected the filing, secured the position with HMRC and saved the business from a <strong>six figure cash flow collapse</strong>.' }
  ] },
  { name: 'evidence Abacus', page: 'evidence', rows: [
    // 18. Drop the badge that repeats the sentence below it.
    { key: 'biography__2.stat_number', from: 'A seven figure exit', to: '' },
    { key: 'biography__2.stat_label', from: 'nearly twenty years after Tom bought the business at 22', to: '' },
    // 19.
    { key: 'biography__2.col_2_p2',
      from: `${ABACUS_HEAD}Years later, Abacus and Falmouth Taxis sold properly, not because everything had always gone right, but because the business had been rebuilt after things had nearly gone wrong.`,
      to: `${ABACUS_HEAD}Years later Abacus and Falmouth Taxis sold, not because everything had always gone right, but because Tom had rebuilt the business after it nearly went wrong.` }
  ] },
  { name: 'evidence margin case', page: 'evidence', rows: [
    // 20. Badge kept; the repeat and the slogan go.
    { key: 'casestudy2__2.outcome',
      from: `<strong>Profit margins improved with no extra appointments.</strong>${BR}More profit from the same workload, with revenue improving as well. That is what structure does.`,
      to: 'More profit from the same workload, with revenue improving as well.' }
  ] },
  { name: 'evidence World Student Advisors', page: 'evidence', rows: [
    // 21.
    { key: 'builtproof.item_3_body',
      from: 'World Student Advisors places students with schools and universities worldwide. The site had to explain a free, counsellor-led service to families in several countries, and get a serious enquiry to the right person quickly.',
      to: 'World Student Advisors places students with schools and universities worldwide. The site had to explain a free service run by counsellors to families in several countries, and get a serious enquiry to the right person quickly.' }
  ] },
  { name: 'websites and AI', page: 'websites-and-ai', rows: [
    // 31 and 32.
    { key: 'hero__5.subtext',
      from: 'If we built World Student Advisors for £999, imagine what we could build for your business.<br><br>Not dropped into a template.',
      to: 'World Student Advisors was built for £999. Have a look, then tell us what yours needs to do.<br><br>Built from scratch, not from a template, and completely customisable.' },
    // Hyphen housekeeping.
    { key: 'filter__3.item_5', from: 'A one-hour recorded planning conversation', to: 'A recorded planning conversation lasting one hour' }
  ] },
  { name: 'booking page', page: 'book-a-30-minute-conversation', rows: [
    { key: 'hero__3.cta', from: 'Book a Time', to: 'Book a time' }
  ] },
  { name: 'useful thinking index', page: 'useful-thinking', rows: [
    // 39. The quiz is eight questions, not one.
    { key: 'intervention__23.subtext',
      from: 'One straightforward question is usually enough to work out whether a commercial review would help.',
      to: 'Eight quick questions will show you how much still runs through you.' },
    // Hyphen housekeeping: the index summary only, never the article body.
    { key: 'article__4.index_summary',
      from: 'A fifteen-year employee was 98% brilliant, and impossible the rest of the time. Tom spent years finding excuses for the other 2%.',
      to: 'An employee of fifteen years was 98% brilliant, and impossible the rest of the time. Tom spent years finding excuses for the other 2%.' }
  ] }
];

// Pure: given the current values of a group's rows, decide what to write.
// Returns { action: 'write'|'done'|'stand_down', writes, mismatched }.
function planGroup(group, current) {
  const writes = [];
  const mismatched = [];
  for (const r of group.rows) {
    const v = Object.prototype.hasOwnProperty.call(current, r.key) ? current[r.key] : undefined;
    if (v === r.to) continue;
    if (v === r.from) writes.push(r);
    else mismatched.push({ key: r.key, value: v === undefined ? null : v });
  }
  if (mismatched.length) return { action: 'stand_down', writes: [], mismatched };
  return { action: writes.length ? 'write' : 'done', writes, mismatched };
}

async function applyVoiceSweep(db) {
  const { rows: marker } = await db.query('SELECT 1 FROM content WHERE section_key = $1', [VOICE_SWEEP_MARKER]);
  if (marker.length) return null;
  const keys = GROUPS.flatMap((g) => g.rows.map((r) => r.key));
  const { rows } = await db.query('SELECT section_key, content FROM content WHERE section_key = ANY($1)', [keys]);
  const current = Object.create(null);
  for (const r of rows) current[r.section_key] = r.content;
  const report = [];
  let found = 0;
  for (const g of GROUPS) {
    const plan = planGroup(g, current);
    if (plan.action === 'write') {
      for (const r of plan.writes) {
        await db.query('UPDATE content SET content = $1, updated_at = NOW() WHERE section_key = $2 AND content = $3', [r.to, r.key, r.from]);
      }
    }
    if (plan.action !== 'stand_down') found++;
    report.push({ name: g.name, action: plan.action, written: plan.writes.length, mismatched: plan.mismatched });
  }
  // Stamped only when at least one group was recognised, so a database that
  // carries none of these rows (a fresh one) is not marked as done.
  if (!found) {
    // None of production's rows exist here (a fresh or local database): say
    // so in one line rather than listing every row as a mismatch.
    return [{ name: 'all groups', action: 'not applicable, none of the production rows exist on this database', written: 0, mismatched: [] }];
  }
  await db.query('INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING', [VOICE_SWEEP_MARKER, 'true']);
  return report;
}

module.exports = { VOICE_SWEEP_MARKER, GROUPS, LANDING, planGroup, applyVoiceSweep };
