// Useful Thinking articles — registry.
//
// Single source of truth for the long-form Useful Thinking pieces added
// 01/08/2026 from "Arrington Website Worker Handover 01". Each article is a
// real row in the `pages` table (see db/seed.js), with `show_in_nav: false`
// so it stays out of the primary nav and mobile menu — discovered instead
// through the Useful Thinking library list, the Commercial Gaps Review, and
// each other's "related" links, same pattern already used for Websites and
// AI / Useful Thinking itself before they were promoted (see CLAUDE.md).
//
// `instanceId` is the `article` template instance that owns the page's
// content keys (heading, body, index_summary, related_text, related_link).
// Instance IDs must match the site-wide `{template}` / `{template}__N`
// format (routes/content.js's isValidInstance regex has no room for
// underscores or words in the base) — so these are `article`, `article__2`
// etc., not descriptive names. The actual title/summary/body text lives in
// the `content` table like every other piece of copy on the site, edited
// the normal CMS way — this file only holds the structural facts a piece
// of code needs: which slug maps to which instance, whether it's
// published, and which Commercial Gaps Review category it answers to.
//
// cgrCategory values are constrained to the fixed, real taxonomy in
// lib/commercialGapsQuestions.js (business_model, commercial_priorities,
// demand, capacity, delivery, pricing, margin, owner_dependency,
// decision_making, missed_opportunities, blind_spots) — there is no other
// taxonomy anywhere in the app. The handover's own "plain-language CGR
// subjects" were mapped onto this real list rather than invented:
//   - Being Certain: "decision-making under pressure" -> decision_making (direct match)
//   - 4am Customer: "owner boundaries; owner dependency" -> owner_dependency (direct match)
//   - GBP120k Account: "accountability" -> the actual mechanism (one person's
//     unchecked action nearly sinking a huge account) matches delivery's real
//     question ("how much of that depends on any one person?") more precisely
//     than any other category
//   - Tightrope: "staff management; blame culture" -> no staff-culture
//     category exists in the real taxonomy; blind_spots is the closest
//     genuine fit (an uncomfortable truth nobody wanted to confront)
//
// The Reverse Economy of Scale is intentionally NOT listed here yet. Its
// content is seeded under the reserved instance `article__5` (see
// db/seed.js) with no page row pointing at it, so it has no route, no
// library entry and no CGR link — it sits as an orphaned instance, exactly
// like any other section that isn't currently attached to a page, until
// Tom approves the voice pass per the handover's explicit hold
// instruction. At that point it can be attached the normal way: give it a
// `pages` row (or reuse the existing orphaned-instance flow) and add it to
// the ARTICLES array below.

const ARTICLES = [
  {
    slug: 'being-certain-isnt-the-same-as-being-right',
    instanceId: 'article',
    published: true,
    cgrCategory: 'decision_making'
  },
  {
    slug: 'the-customer-who-messaged-me-at-4am',
    instanceId: 'article__2',
    published: true,
    cgrCategory: 'owner_dependency'
  },
  {
    slug: 'you-dont-get-to-decide-when-youve-made-things-right',
    instanceId: 'article__3',
    published: true,
    cgrCategory: 'delivery'
  },
  {
    slug: 'the-tightrope-between-staff-loyalty-and-damage-control',
    instanceId: 'article__4',
    published: true,
    cgrCategory: 'blind_spots'
  },
  {
    // Added 01/08/2026, supplied directly by Tom (not part of Handover
    // 01) — no title/slug/summary/category was specified, so all of
    // that is an editorial call made here, not a preserved instruction.
    // "margin" (real question: "Do you know which parts of the business
    // make good money and which are quietly losing it...") is a precise
    // match for a story literally about a job that looked profitable but
    // tied up cash for months — reassigned outright from the two case
    // studies below that previously listed it, to avoid two resources
    // silently competing for the same category (same approach used for
    // "delivery" earlier). No related-link: nothing else on the site is
    // a natural fit for a cash-flow/credit-control story.
    slug: 'a-profitable-job-is-not-necessarily-good-business',
    instanceId: 'article__6',
    published: true,
    cgrCategory: 'margin'
  },
  {
    // Added 01/08/2026 from "Arrington Website Worker Handover 02" —
    // supplied directly by Tom this session, pressure-tested and
    // finalized with his sign-off (not sourced from Drive research).
    // Note: Handover 02 also re-lists "A Profitable Job Is Not
    // Necessarily Good Business" with a shorter, different edit of the
    // body than what's live (which matches Handover 01's own item 6,
    // explicitly marked "APPROVED BY TOM. READY FOR WEBSITE
    // PUBLICATION" and already verified live) — that's a genuine
    // conflict between the two handover docs, flagged to Tom rather
    // than silently resolved; the live copy has been left as-is.
    // "capacity" (real question: "If demand doubled tomorrow, could the
    // business actually deliver it without everything breaking?") is a
    // near word-for-word match for this piece's own closing point
    // ("having enough capacity in the right place at the right time") —
    // reassigned outright from the two case studies that previously
    // listed it (same approach used for "delivery" and "margin"
    // earlier), which still keep their other genuine categories.
    slug: 'every-rule-changes-behaviour',
    instanceId: 'article__7',
    published: true,
    cgrCategory: 'capacity'
  },
  {
    // Added per Tom's request (approved article, supplied directly, not
    // sourced from a handover doc) — connected into the Owner Dependency
    // Quiz rather than Commercial Gaps Review, so deliberately has no
    // cgrCategory here (lib/commercialGapsResources.js is untouched by
    // this addition). The ODQ recommendation itself lives in
    // views/owner-dependency-quiz.ejs, shown only when the quiz's
    // "Decision dependency" category scores red — the article is a
    // first-person account of a decision the narrator already knew the
    // answer to and delayed anyway, a precise match for that category's
    // real question ("what is the first port of call?") rather than a
    // generic owner-dependency fit.
    slug: 'the-turning-that-never-came',
    instanceId: 'article__8',
    published: true
  },
  {
    // Added per Tom's request (approved article, supplied directly, not
    // sourced from a handover doc) — like "The Turning That Never Came",
    // connected into the Owner Dependency Quiz rather than Commercial
    // Gaps Review, so deliberately has no cgrCategory here. The ODQ
    // recommendation lives in views/owner-dependency-quiz.ejs, shown
    // only when the quiz's "Succession readiness" or "Cash control"
    // category scores red — the article is a first-person account of
    // cash-position knowledge and business continuity existing only in
    // the owner's head, a precise match for those two categories' real
    // questions rather than a generic owner-dependency fit. Kept
    // diagnostically separate from "The Turning That Never Came" (which
    // stays mapped to "Decision dependency" only): that article is about
    // delayed judgement on a decision already known to be wrong, this
    // one is about structural dependence and knowledge trapped with the
    // owner — different problems, checked in priority order so only one
    // shows if a respondent's answers trigger both.
    slug: 'serendipity-is-not-a-system',
    instanceId: 'article__9',
    published: true
  },
  {
    // Added per Tom's request, supplied via "Arrington Website Worker
    // Handover 03" as a deliberate companion piece to "Serendipity Is Not
    // a System" — both reference the same real person (Tom's manager
    // during and after his 2017 accident), anonymised throughout as "my
    // manager"/"she"/"her" per Tom's explicit confidentiality decision;
    // no name, initials or other identifying detail was added. Connected
    // into the Owner Dependency Quiz rather than Commercial Gaps Review,
    // so deliberately has no cgrCategory here. The ODQ recommendation
    // lives in views/owner-dependency-quiz.ejs, shown only when the
    // quiz's "Delegation" category scores red — the article is a
    // first-person account of delegating in name only and still taking
    // decisions back, a precise match for that category's real question
    // ("when you outsource a task, what normally happens?") and its red
    // indicator ("work you hand off tends to come back to you"). Kept
    // deliberately separate from "Serendipity Is Not a System" (mapped to
    // "Succession readiness"/"Cash control" only): that article argues
    // the business must not depend on one person or on luck; this one
    // argues against over-correcting into never letting anyone become
    // important — opposite pulls, checked in priority order (after
    // Turning and Serendipity) so only one recommendation shows.
    slug: 'some-people-are-worth-the-risk',
    instanceId: 'article__10',
    published: true
  }
];

function publishedArticles() {
  return ARTICLES.filter((a) => a.published);
}

function findBySlug(slug) {
  return ARTICLES.find((a) => a.slug === slug) || null;
}

module.exports = { ARTICLES, publishedArticles, findBySlug };
