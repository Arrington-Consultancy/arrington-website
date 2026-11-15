// The home page on the "apply to work with us" theme (Tom, 15/11/2026).
//
// Tom, in chat: the site "over explains without hooking", "lacks humanity and
// looks desperate"; "Good sites say without saying, we are in demand"; "the
// theme is, apply to work with us". Then: "Our time to dedicate to your
// business is the limiting factor. We are also selective about whom we work
// with, we also won't charge a sunk ship", a way of saying free "that doesn't
// seem cheap", and "Tom does the work himself sounds small time". He approved
// "made stronger" in place of "turned around" (Brand OS: the reader's
// business is not broken and Arrington is not a rescue service).
//
// What the home page is now: the approved headline, one button ("Apply to
// work with us"), results first, who we work with, three steps, the three
// offers as quiet links with no prices (prices stay on the offer pages), one
// line of Tom's from Useful Thinking, the Google rating, and the form headed
// "Apply to work with us". This replaces the three priced boxes (Tom,
// 21/10/2026) and the "free, no obligation" lines by the home page's buttons
// (Tom, 11/10/2026) on the home page only. Every other page is unchanged.
//
// All the wording lives here, in one place, so the view holds no copy.
'use strict';

const MARKER = 'homepage.apply_theme_2026-11-15';

const HERO_SUB_FROM = 'Business consultant for established owner run businesses across Devon and Cornwall.';
const HERO_SUB_TO = 'We work with a small number of established owner run businesses across Devon and Cornwall.';
const HERO_CTA_FROM = 'Tell us what is going on';
const HERO_CTA_TO = 'Apply to work with us';

// The World Student Advisors figure is typed once, here, and the tile shows
// only while the case study's own result line on Evidence still says it. A
// figure changed in the CMS takes the tile off the home page rather than
// leaving a stale number on it.
const WSA_FIGURE_PHRASE = 'around 30 a day';

const HOME_APPLY = Object.freeze({
  results: Object.freeze({
    label: 'What we have done',
    heading: 'Different businesses, made stronger in different ways.',
    more: 'Read the case study',
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
    }),
    wsa: Object.freeze({ figure: '30', unit: 'a day', name: 'World Student Advisors.' })
  }),
  fit: Object.freeze({
    label: 'Who we work with',
    heading: 'We are selective about who we work with.',
    intro: 'The limit is our time. Each business gets the attention it needs, so we take on a few at a time, and only where we are confident we can make it stronger.',
    yesHeading: 'We are probably a fit if',
    yes: Object.freeze([
      'You have built something that already works.',
      'Too much of it still runs through you.',
      'There are people, sites or information that could come off your plate.',
      'You want a straight answer, even when it is not the comfortable one.'
    ]),
    noHeading: 'We are probably not if',
    no: Object.freeze([
      'The business is past the point where we can help. We will say so, and we won’t take your money.',
      'You are looking for coaching, a programme or a monthly retainer.',
      'You want someone to agree with you.'
    ])
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
  }),
  // Tom's own sentence, word for word, from the Useful Thinking article it
  // links to. First person is right here: it is quoted speech from the one
  // part of the site written in his voice.
  quote: Object.freeze({
    text: 'It turns out being indispensable isn’t necessarily something to be proud of.',
    by: 'Tom Arrington, in Useful Thinking',
    more: 'Read the piece',
    href: '/useful-thinking/the-most-expensive-person-doing-the-job-might-be-you'
  }),
  rating: Object.freeze({ more: 'See what business owners say', href: '/evidence#googlereviews' })
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

// What the view renders. `wsa` is readWsaCaseStudy()'s answer (or null).
function homeApplyData({ wsa } = {}) {
  const r = HOME_APPLY.results;
  const tiles = [];
  if (wsa && typeof wsa.result === 'string' && wsa.result.includes(WSA_FIGURE_PHRASE) && /^\/evidence#[A-Za-z0-9_]+$/.test(wsa.href || '')) {
    tiles.push({ figure: r.wsa.figure, unit: r.wsa.unit, name: r.wsa.name, text: wsa.result, href: wsa.href });
  }
  tiles.push({ ...r.marine }, { ...r.abacus });
  return { ...HOME_APPLY, results: { label: r.label, heading: r.heading, more: r.more, tiles } };
}

const plain = (v) => String(v == null ? '' : v).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// Run once. Moves the home page hero's line and button to the new wording
// (each only while it still holds the wording it replaces, so a CMS edit
// wins and is logged), and hides the home page's other sections, which the
// new page replaces. Hidden, not deleted: each shows dimmed to a logged-in
// editor and comes back with its eye button. The marker row records which
// sections this hid.
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
  for (const [field, from, to] of [['subtext', HERO_SUB_FROM, HERO_SUB_TO], ['cta', HERO_CTA_FROM, HERO_CTA_TO]]) {
    const key = `${heroId}.${field}`;
    const { rows } = await db.query('SELECT content FROM content WHERE section_key = $1', [key]);
    const stored = rows.length ? rows[0].content : null;
    if (stored !== null && plain(stored) === from) {
      const { rowCount } = await db.query('UPDATE content SET content = $1 WHERE section_key = $2 AND content = $3', [to, key, stored]);
      notes.push(rowCount ? `${key} now "${to}"` : `${key} changed while this ran, left alone`);
    } else if (stored !== null && plain(stored) === to) {
      notes.push(`${key} already reads "${to}"`);
    } else {
      notes.push(`${key} left alone (live value: ${JSON.stringify(stored)})`);
    }
  }

  const toHide = order.filter((id) => id !== heroId && !hidden.includes(id));
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
  await db.query(
    'INSERT INTO content (section_key, content) VALUES ($1, $2) ON CONFLICT (section_key) DO NOTHING',
    [MARKER, JSON.stringify({ hidden: toHide })]
  );
  return notes.join('; ');
}

module.exports = {
  MARKER, HOME_APPLY, HOME_APPLY_CONTACT, WSA_FIGURE_PHRASE,
  HERO_SUB_FROM, HERO_SUB_TO, HERO_CTA_FROM, HERO_CTA_TO,
  homeApplyData, applyHomeApplyTheme
};
