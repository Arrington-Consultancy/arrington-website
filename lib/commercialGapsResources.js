// Commercial Gaps Review (AI) — content matching.
//
// The brief is explicit: recommend exactly ONE relevant Arrington resource,
// never more, and explain why it is relevant without pretending it solves
// the business. Nothing here is invented — Tom should extend this list as
// more Useful Thinking pages, case studies or approved social posts go
// live, rather than this module guessing at content that doesn't exist yet.
//
// Updated 01/08/2026: added the four published Useful Thinking articles
// from "Arrington Website Worker Handover 01" (see
// lib/usefulThinkingArticles.js), each tagged with a category from the
// real, closed taxonomy in lib/commercialGapsQuestions.js — no other
// taxonomy exists anywhere in the app, so the handover's own
// plain-language "CGR subjects" were mapped onto these 11 real categories
// rather than invented:
//   - Being Certain: "decision-making under pressure" -> decision_making
//     (direct match)
//   - 4am Customer: "owner boundaries; owner dependency" -> owner_dependency
//     (direct match)
//   - GBP120k Account: "accountability" -> delivery (the real mechanism —
//     one person's unchecked action nearly sinking a huge account —
//     matches delivery's actual question, "how much of that depends on
//     any one person?", more precisely than any other category; delivery
//     was removed from the insolvent-turnaround case study below to avoid
//     two resources silently competing for the same category)
//   - Tightrope: "staff management; blame culture" -> blind_spots (no
//     staff-culture category exists in the real taxonomy; blind_spots, an
//     uncomfortable truth nobody wanted to confront, is the closest
//     genuine fit)
// "The Reverse Economy of Scale" is held pending Tom's voice-approval
// pass and deliberately has no entry here yet.
//
// Updated 01/08/2026 (2): added a fifth article, "A Profitable Job Is
// Not Necessarily Good Business", supplied directly by Tom rather than
// via the handover — title/slug/summary/category were all an editorial
// call made in lib/usefulThinkingArticles.js, not a preserved
// instruction. Tagged "margin" (a story about profitable-on-paper work
// that ties up cash for months), reassigned outright from the two case
// studies below, which still keep their other categories.
//
// The single old generic "Useful Thinking" entry has been reworked into a
// pure fallback: its categories array is empty on purpose, so it is never
// matched directly and only ever used via matchResource's `|| RESOURCES[0]`
// path — the specific stories above are always better than a generic link
// to the library page itself for any category they actually cover.
// missed_opportunities has no dedicated match at all currently (none of
// the existing case studies or articles are really about a chased-but-
// never-pursued opportunity) and falls back to the generic entry — a real
// coverage gap, not silently forced onto an unrelated piece.
//
// Updated 01/08/2026 (3): added a sixth article, "Every Rule Changes
// Behaviour", from "Arrington Website Worker Handover 02" — supplied
// directly by Tom, pressure-tested and signed off. Tagged "capacity" (a
// taxi rota story literally about not having enough cars on the road at
// the right time), reassigned outright from the two case studies below,
// which still keep their other genuine categories. Handover 02 also
// re-listed "A Profitable Job Is Not Necessarily Good Business" with a
// shorter, different body edit than what's live — that's a genuine
// conflict between Handover 01 (which explicitly marks its own longer
// version "APPROVED BY TOM. READY FOR WEBSITE PUBLICATION," matching
// what's live) and Handover 02. Flagged to Tom rather than silently
// resolved; the live copy and this module's entry for that article are
// both untouched.
//
// Case study URLs: What We Have Done, What the Work Looks Like and What
// Business Owners Say were merged into a single /evidence page (see
// db/seed.js's Evidence-merge migration) — the old /what-we-have-done URL
// no longer resolves. Section instance IDs carried across the merge
// unchanged, so each case study has its own confirmed anchor on /evidence
// (checked directly against the live content: biography__2 = Abacus and
// Falmouth Taxis, casestudy__4 = The Insolvent Turnaround, casestudy2__2 =
// More Margin From the Work Already There). Linking to the specific anchor
// rather than the top of the page means a respondent lands on the exact
// story being referenced, not the top of a long page.

const RESOURCES = [
  {
    id: 'useful_thinking_library',
    title: 'Useful Thinking',
    url: 'https://www.arringtonconsultancy.com/useful-thinking',
    type: 'useful_thinking',
    categories: [],
    reasonTemplate: "A few short, real examples of the thinking behind Arrington Consultancy, relevant background given what your answer on {label} pointed at."
  },
  {
    id: 'article_being_certain',
    title: 'Useful Thinking: "Being Certain Isn\'t the Same as Being Right"',
    url: 'https://www.arringtonconsultancy.com/useful-thinking/being-certain-isnt-the-same-as-being-right',
    type: 'useful_thinking',
    categories: ['decision_making'],
    reasonTemplate: 'On acting on certainty instead of evidence before a decision is made, close to what your answer on {label} was pointing at.'
  },
  {
    id: 'article_4am_customer',
    title: 'Useful Thinking: "The Customer Who Messaged Me at 4am"',
    url: 'https://www.arringtonconsultancy.com/useful-thinking/the-customer-who-messaged-me-at-4am',
    type: 'useful_thinking',
    categories: ['owner_dependency'],
    reasonTemplate: 'On the difference between being responsive and being permanently on call, relevant given what your answer on {label} suggested.'
  },
  {
    id: 'article_120k_account',
    title: 'Useful Thinking: "You Don\'t Get to Decide the Consequences"',
    url: 'https://www.arringtonconsultancy.com/useful-thinking/you-dont-get-to-decide-when-youve-made-things-right',
    type: 'useful_thinking',
    categories: ['delivery'],
    reasonTemplate: 'On what happens when too much of the outcome depends on any one person, close to what your answer on {label} was pointing at.'
  },
  {
    id: 'article_staff_tightrope',
    title: 'Useful Thinking: "The Tightrope Between Staff Loyalty and Damage Control"',
    url: 'https://www.arringtonconsultancy.com/useful-thinking/the-tightrope-between-staff-loyalty-and-damage-control',
    type: 'useful_thinking',
    categories: ['blind_spots'],
    reasonTemplate: 'On the uncomfortable things a business can end up absorbing rather than confronting, relevant given what your answer on {label} suggested.'
  },
  {
    id: 'case_study_abacus_falmouth',
    title: 'Evidence: Abacus and Falmouth Taxis',
    url: 'https://www.arringtonconsultancy.com/evidence#biography__2',
    type: 'case_study',
    categories: ['owner_dependency', 'commercial_priorities', 'business_model'],
    reasonTemplate: 'A business that grew but quietly drifted from what was actually working, similar in shape to what came up in your answer on {label}.'
  },
  {
    id: 'case_study_insolvent_turnaround',
    title: 'Evidence: The Insolvent Turnaround',
    url: 'https://www.arringtonconsultancy.com/evidence#casestudy__4',
    type: 'case_study',
    categories: ['pricing'],
    reasonTemplate: 'Financial control brought back under a business before it was too late, relevant given what your answer on {label} suggested.'
  },
  {
    id: 'case_study_aesthetic_clinics_margin',
    title: 'Evidence: More Margin From the Work Already There',
    url: 'https://www.arringtonconsultancy.com/evidence#casestudy2__2',
    type: 'case_study',
    categories: ['demand', 'pricing'],
    reasonTemplate: 'A busy, well-liked business that was still losing money it had already earned, which echoes your answer on {label}.'
  },
  {
    // Added 01/08/2026, supplied directly by Tom. "margin" reassigned
    // here outright (removed from the two case studies above) — a story
    // about work that was profitable on paper but tied up cash for
    // months is a more precise match for margin's real question than
    // either general case study, and matchResource only ever returns one
    // resource per category, so only one entry should claim it.
    id: 'article_profitable_job_not_good_business',
    title: 'Useful Thinking: "A Profitable Job Is Not Necessarily Good Business"',
    url: 'https://www.arringtonconsultancy.com/useful-thinking/a-profitable-job-is-not-necessarily-good-business',
    type: 'useful_thinking',
    categories: ['margin'],
    reasonTemplate: 'On work that looks profitable on paper but ties up cash for months, close to what your answer on {label} was pointing at.'
  },
  {
    // Added 01/08/2026 from Handover 02. "capacity" reassigned here
    // outright (removed from the two case studies above) — this piece's
    // own closing line ("having enough capacity in the right place at
    // the right time") is a near word-for-word match for capacity's real
    // question, more precise than either general case study.
    id: 'article_every_rule_changes_behaviour',
    title: 'Useful Thinking: "Every Rule Changes Behaviour"',
    url: 'https://www.arringtonconsultancy.com/useful-thinking/every-rule-changes-behaviour',
    type: 'useful_thinking',
    categories: ['capacity'],
    reasonTemplate: 'On how a rota rule that looks fair can still leave a business short of capacity exactly when it needs it, close to what your answer on {label} was pointing at.'
  }
];

const CATEGORY_LABELS = {
  business_model: 'your business model',
  commercial_priorities: 'your commercial priorities',
  pricing: 'pricing',
  margin: 'margin',
  demand: 'demand',
  capacity: 'capacity',
  delivery: 'delivery',
  owner_dependency: 'owner dependency',
  decision_making: 'decision making',
  missed_opportunities: 'missed opportunities',
  blind_spots: 'commercial blind spots'
};

// Picks exactly one resource for the given primary issue category. Falls
// back to the Useful Thinking piece (the most generally applicable entry)
// if no resource is tagged for that category, so this always returns
// something rather than nothing.
function matchResource(primaryCategory) {
  const label = CATEGORY_LABELS[primaryCategory] || 'what you described';
  const candidate = RESOURCES.find((r) => r.categories.includes(primaryCategory)) || RESOURCES[0];
  return {
    title: candidate.title,
    url: candidate.url,
    type: candidate.type,
    reason: candidate.reasonTemplate.replace('{label}', label)
  };
}

module.exports = { RESOURCES, matchResource };
