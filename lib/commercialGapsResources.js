// Commercial Gaps Review (AI) — content matching.
//
// The brief is explicit: recommend exactly ONE relevant Arrington resource,
// never more, and explain why it is relevant without pretending it solves
// the business. This list is deliberately short and grounded only in
// content confirmed live on the site during the pre-build audit (checked
// 29/07/2026): the single published Useful Thinking piece ("Instinct") and
// the three case studies on What We Have Done. Nothing here is invented —
// Tom should extend this list as more Useful Thinking pages, case studies
// or approved social posts go live, rather than this module guessing at
// content that doesn't exist yet.
//
// Every case study currently lives on the same /what-we-have-done page (no
// per-story anchors exist in the live markup as of the audit), so all three
// entries share that URL and are told apart by title and reason text.

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
    title: 'What We Have Done: Abacus and Falmouth Taxis',
    url: 'https://www.arringtonconsultancy.com/what-we-have-done',
    type: 'case_study',
    categories: ['owner_dependency', 'commercial_priorities', 'business_model'],
    reasonTemplate: 'A business that grew but quietly drifted from what was actually working, similar in shape to what came up in your answer on {label}.'
  },
  {
    id: 'case_study_insolvent_turnaround',
    title: 'What We Have Done: The Insolvent Turnaround',
    url: 'https://www.arringtonconsultancy.com/what-we-have-done',
    type: 'case_study',
    categories: ['margin', 'pricing', 'capacity', 'delivery'],
    reasonTemplate: 'Financial control brought back under a business before it was too late, relevant given what your answer on {label} suggested.'
  },
  {
    id: 'case_study_aesthetic_clinics_margin',
    title: 'What We Have Done: More Margin From the Work Already There',
    url: 'https://www.arringtonconsultancy.com/what-we-have-done',
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
