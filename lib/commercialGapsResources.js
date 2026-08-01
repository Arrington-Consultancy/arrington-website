// Commercial Gaps Review (AI) — content matching.
//
// The brief is explicit: recommend exactly ONE relevant Arrington resource,
// never more, and explain why it is relevant without pretending it solves
// the business. This list is deliberately short and grounded only in
// content confirmed live on the site during the pre-build audit (checked
// 29/07/2026): the single published Useful Thinking piece ("Instinct") and
// the three case studies that were then on What We Have Done. Nothing here
// is invented — Tom should extend this list as more Useful Thinking pages,
// case studies or approved social posts go live, rather than this module
// guessing at content that doesn't exist yet.
//
// Updated 01/08/2026: What We Have Done, What the Work Looks Like and What
// Business Owners Say were merged into a single /evidence page (see
// db/seed.js's Evidence-merge migration) — the old /what-we-have-done URL
// no longer resolves. Section instance IDs carried across the merge
// unchanged, so each case study now has its own confirmed anchor on
// /evidence (checked directly against the live content: biography__2 =
// Abacus and Falmouth Taxis, casestudy__4 = The Insolvent Turnaround,
// casestudy2__2 = More Margin From the Work Already There). Linking to the
// specific anchor rather than the top of the page means a respondent lands
// on the exact story being referenced, not the top of a long page.

const RESOURCES = [
  {
    id: 'useful_thinking_instinct',
    title: 'Useful Thinking: "Listen to what feels wrong"',
    url: 'https://www.arringtonconsultancy.com/useful-thinking',
    type: 'useful_thinking',
    categories: ['decision_making', 'blind_spots', 'missed_opportunities'],
    reasonTemplate: 'This is about trusting what feels wrong before the numbers catch up, which is close to what your answer on {label} was pointing at.'
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
    categories: ['margin', 'pricing', 'capacity', 'delivery'],
    reasonTemplate: 'Financial control brought back under a business before it was too late, relevant given what your answer on {label} suggested.'
  },
  {
    id: 'case_study_aesthetic_clinics_margin',
    title: 'Evidence: More Margin From the Work Already There',
    url: 'https://www.arringtonconsultancy.com/evidence#casestudy2__2',
    type: 'case_study',
    categories: ['demand', 'margin', 'pricing', 'capacity'],
    reasonTemplate: 'A busy, well-liked business that was still losing money it had already earned, which echoes your answer on {label}.'
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
