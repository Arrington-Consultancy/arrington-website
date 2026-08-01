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
  }
];

function publishedArticles() {
  return ARTICLES.filter((a) => a.published);
}

function findBySlug(slug) {
  return ARTICLES.find((a) => a.slug === slug) || null;
}

module.exports = { ARTICLES, publishedArticles, findBySlug };
