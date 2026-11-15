// The home page on the "apply to work with us" theme (Tom, 15/11/2026).
//
// Tom, in chat: the site "over explains without hooking", "lacks humanity and
// looks desperate"; "Good sites say without saying, we are in demand"; "the
// theme is, apply to work with us". Then: "Our time to dedicate to your
// business is the limiting factor", "we also won't charge a sunk ship", a way
// of saying free "that doesn't seem cheap", "Tom does the work himself sounds
// small time" and "let's not over mention Tom, in the right place and for
// good reason yes". He approved "made stronger" in place of "turned around"
// (Brand OS: the reader's business is not broken and Arrington is not a
// rescue service).
//
// An outside judge then read the build, and Tom approved five changes and two
// amendments the same day: the live hero line stays as it is (it carries the
// search words); selectiveness is said once ("The limit is our time, so we
// take on a few businesses at a time."); no list of who we are not for (Tom,
// 06/10/2026: "we don't tell them what we won't do, that's the brand"), only
// the one promise about a business past help; the World Student Advisors
// result says what we did, uses the case study's own sentence and carries one
// whole sentence of the client's quote; the home page's live client quote
// block with the Google rating stays, and Tom's own Useful Thinking line is
// not used.
//
// What the home page is now: the approved headline and line, one button
// ("Apply to work with us"), results first, who we work with, three steps,
// the three offers as quiet links with no prices (prices stay on the offer
// pages), the live client quote block, and the form headed "Apply to work
// with us". This replaces the three priced boxes (Tom, 21/10/2026) and the
// "free, no obligation" lines by the home page's buttons (Tom, 11/10/2026)
// on the home page only. Every other page is unchanged.
//
// All the wording lives here, in one place, so the view holds no copy.
'use strict';

const MARKER = 'homepage.apply_theme_2026-11-15';

const HERO_CTA_FROM = 'Tell us what is going on';
const HERO_CTA_TO = 'Apply to work with us';

// WORLD STUDENT ADVISORS. Nothing about this client is stated from here
// alone. The result sentence, the sentence saying what we did and the
// client's own sentence are each shown only while the case study on Evidence
// still carries them, so a figure or a quote changed or withdrawn there
// leaves the home page as well. Tim's consent (14/11/2026) covers the firm's
// name and the two figures, "around 30 a day" and "since June 2026"; his
// quote is live on Evidence. Tom approved one whole sentence of it here on
// 15/11/2026; whether Tim was asked about the home page is Tom's to confirm.
const WSA_FIGURE_PHRASE = 'around 30 a day';
const WSA_DID = 'We rebuilt the website around the enquiry and connected it to the CRM.';
const WSA_QUOTE_SENTENCE = 'I brought Tom in to tackle owner dependency, but he blew me away with his use of technology, revolutionising the website and integrating the CRM and AI.';

const HOME_APPLY = Object.freeze({
  results: Object.freeze({
    label: 'What we have done',
    heading: 'Different businesses, made stronger in different ways.',
    more: 'Read the case study',
    // "around" is part of the figure, as the client's consent words it.
    wsa: Object.freeze({ pre: 'around', figure: '30', unit: 'a day', name: 'World Student Advisors.' }),
    marine: Object.freeze({
      figure: '24',
      unit: 'months',
      text: 'A Devon marine firm, from insolvency risk to a marketable asset, start to sale.',
      href: '/evidence#casestudy__4'
    }),
    abacus: Object.freeze({
      figure: '18',
      unit: 'years',
      text: 'Tom spent more than 18 years building and running Abacus and Falmouth Taxis, grew it to thousands of bookings each week, and sold it.',
      href: '/evidence#biography__2'
    })
  }),
  fit: Object.freeze({
    label: 'Who we work with',
    heading: 'The limit is our time, so we take on a few businesses at a time.',
    yesHeading: 'We are probably a fit if',
    yes: Object.freeze([
      'You have built something that already works.',
      'Too much of it still runs through you.',
      'There are people, sites or information that could come off your plate.',
      'You want a straight answer, even when it is not the comfortable one.'
    ]),
    // One promise, standing alone. Not a list of who we are not for.
    promise: 'If the business is past the point where we can help, we will say so, and we won’t take your money.'
  }),
  steps: Object.freeze({
    label: 'How it works',
    items: Object.freeze([
      Object.freeze({ title: 'You apply', text: 'Tell us about the business and what you want to change. A few lines is plenty.' }),
      Object.freeze({ title: 'We talk', text: 'If it looks like a fit, we arrange a 30 minute conversation. We don’t charge for it, and it is how we both decide whether to go further.' }),
      Object.freeze({ title: 'We start in the business', text: 'Most work begins with a Commercial Review: a day in the business with you, then a written assessment, recommendations and next steps.' })
    ])
  }),
  offers: Object.freeze({
    label: 'What we do',
    items: Object.freeze([
      Object.freeze({ name: 'Commercial Review', line: 'For owner run businesses', href: '/where-to-start/commercial-review' }),
      Object.freeze({ name: 'Website Build', line: 'Built from scratch, around what the business needs to do', href: '/where-to-start/website-build' }),
      Object.freeze({ name: 'Taxi office workspace', line: 'For taxi and private hire operators', href: '/taxi-and-private-hire-operators/office-workspace' })
    ])
  })
});

// The form on the home page only. Fields, endpoint, attribution and the
// Contact conversion are the shared footer's and are not touched.
const HOME_APPLY_CONTACT = Object.freeze({
  headerCtaText: 'Apply to work with us',
  hideNavWhatsapp: true,
  label: '',
  heading: 'Apply to work with us',
  body: 'Tell us about the business and what you want to change. You do not need a polished brief or perfect set of accounts.',
  messagePlaceholder: 'The business, what is working, and what you want to change',
  submitText: 'Send your application',
  nextText: 'We read every application and reply, usually within one working day.'
});

const straight = (s) => String(s || '').replace(/[‘’]/g, "'");

// What the view renders. `wsa` is readWsaHomeProof()'s answer (or null).
function homeApplyData({ wsa } = {}) {
  const r = HOME_APPLY.results;
  let lead = null;
  if (wsa && typeof wsa.result === 'string' && wsa.result.includes(WSA_FIGURE_PHRASE) && /^\/evidence#[A-Za-z0-9_]+$/.test(wsa.href || '')) {
    lead = { pre: r.wsa.pre, figure: r.wsa.figure, unit: r.wsa.unit, name: r.wsa.name, text: wsa.result, href: wsa.href, did: '', quote: '', quoteName: '' };
    if (straight(wsa.body).includes(straight(WSA_DID).replace(/\.$/, ''))) lead.did = WSA_DID;
    if (wsa.quoteName && straight(wsa.quote).includes(straight(WSA_QUOTE_SENTENCE))) {
      lead.quote = WSA_QUOTE_SENTENCE;
      lead.quoteName = wsa.quoteName;
    }
  }
  return { ...HOME_APPLY, results: { label: r.label, heading: r.heading, more: r.more, lead, tiles: [{ ...r.marine }, { ...r.abacus }] } };
}

const plain = (v) => String(v == null ? '' : v).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// Run once. Moves the home page hero's button to the new wording (only while
// it still holds the wording it replaces, so a CMS edit wins and is logged)
// and hides the home page's other sections, which the new page replaces.
// The hero's line is not touched. A client quote block (an intervention
// section carrying a quote attribution) stays on the page. Hidden, not
// deleted: each shows dimmed to a logged-in editor and comes back with its
// eye button. The marker row records which sections this hid.
async function applyHomeApplyTheme(db) {
  const { rows: done } = await db.query('SELECT 1 FROM content WHERE section_key = $1', [MARKER]);
  if (done.length) return null;
  const { rows: pages } = await db.query("SELECT section_order, hidden_sections FROM pages WHERE slug = 'main'");
  if (!pages.length) return null;
  const order = Array.isArray(pages[0].section_order) ? pages[0].section_order : [];
  const hidden = Array.isArray(pages[0].hidden_sections) ? pages[0].hidden_sections : [];
  const heroId = order[0];
  if (!/^hero(?:__\d+)?$/.test(heroId || '')) return 'the home page does not open with a hero; nothing changed';

  const notes = [];
  const key = `${heroId}.cta`;
  const { rows } = await db.query('SELECT content FROM content WHERE section_key = $1', [key]);
  const stored = rows.length ? rows[0].content : null;
  if (stored !== null && plain(stored) === HERO_CTA_FROM) {
    const { rowCount } = await db.query('UPDATE content SET content = $1 WHERE section_key = $2 AND content = $3', [HERO_CTA_TO, key, stored]);
    notes.push(rowCount ? `${key} now "${HERO_CTA_TO}"` : `${key} changed while this ran, left alone`);
  } else if (stored !== null && plain(stored) === HERO_CTA_TO) {
    notes.push(`${key} already reads "${HERO_CTA_TO}"`);
  } else {
    notes.push(`${key} left alone (live value: ${JSON.stringify(stored)})`);
  }

  const kept = [];
  const toHide = [];
  for (const id of order) {
    if (id === heroId || hidden.includes(id)) continue;
    if (/^intervention(?:__\d+)?$/.test(id)) {
      const { rows: q } = await db.query('SELECT content FROM content WHERE section_key = $1', [`${id}.quote_attribution`]);
      if (q.length && plain(q[0].content)) { kept.push(id); continue; }
    }
    toHide.push(id);
  }
  if (toHide.length) {
    const { rowCount } = await db.query(
      "UPDATE pages SET hidden_sections = $1::jsonb WHERE slug = 'main' AND hidden_sections = $2::jsonb",
      [JSON.stringify([...hidden, ...toHide]), JSON.stringify(hidden)]
    );
    if (!rowCount) return 'the home page changed while this ran; nothing hidden, will try again on the next start';
    notes.push(`hidden, not deleted: ${toHide.join(', ')}`);
  } else {
    notes.push('no other section to hide');
  }
  notes.push(kept.length ? `client quote block kept: ${kept.join(', ')}` : 'no client quote block found on the home page');
  await db.query(
    'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
    [MARKER, JSON.stringify({ hidden: toHide, kept })]
  );
  return notes.join('; ');
}

module.exports = {
  MARKER, HOME_APPLY, HOME_APPLY_CONTACT, WSA_FIGURE_PHRASE, WSA_DID, WSA_QUOTE_SENTENCE,
  HERO_CTA_FROM, HERO_CTA_TO,
  homeApplyData, applyHomeApplyTheme
};
