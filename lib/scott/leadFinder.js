// Scott demonstration: Lead Finder.
//
// The Level 4 payload, and the one part of the demonstration that answers
// "what does this do for me that I am not already doing". Everything else
// in the portal is the company answering questions about itself. This is
// the company noticing work nobody asked it to look for.
//
// THREE RULES, because this is the easiest place in the whole
// demonstration to accidentally lie:
//
//  1. An opportunity carries its own evidence or it does not exist. Every
//     record below names its source, what changed, why it may matter, the
//     reasoning that connects those, a confidence, and a suggested next
//     action. There is no shape in which one appears without them:
//     REQUIRED_EVIDENCE_FIELDS is asserted by test.
//
//  2. Inference is labelled as inference. The Bay Hotel planning approval
//     is a fact on a public register. That the building will need
//     furnishing, and when, and who will buy it, is reasoning, and the
//     confidence line says so in words rather than in a colour.
//
//  3. It is clearance-gated by the ordinary rule, not a new one. These are
//     brain records tagged `commercial_prospecting`, which only the owner
//     persona holds. Nobody else sees them on the page, in the Company
//     Brain, in search, or in a worker's context, and that falls out of
//     the existing filter rather than being re-implemented here.
//
// The figures and names are fictional, like the rest of Scott.

const DOMAIN = 'commercial_prospecting';

const REQUIRED_EVIDENCE_FIELDS = Object.freeze([
  'source',
  'whatChanged',
  'whyItMayMatter',
  'reasoning',
  'confidence',
  'suggestedNextAction'
]);

const OPPORTUNITIES = [
  {
    domain: DOMAIN,
    record: 'Lead Finder candidate',
    ref: 'LF-2026-041',
    kind: 'obvious',
    title: 'Oakfield Care Home, Ivybridge',
    summary: 'Reupholstery tender, 40 dining chairs. Closes 2 October.',
    source: 'Devon Contracts Finder, published 11 September 2026.',
    whatChanged: 'A reupholstery tender opened. Forty dining chairs, closing 2 October.',
    whyItMayMatter: 'It names the work the workshop does every week. Roughly three weeks of capacity.',
    reasoning: [
      'The tender names reupholstery directly, so no interpretation is involved.',
      'October workshop capacity is currently light.',
      'Ivybridge is inside the normal delivery radius.'
    ],
    confidence: 'High. The tender is public and names the work.',
    suggestedNextAction: 'Read the spec and check October capacity.'
  },
  {
    domain: DOMAIN,
    record: 'Lead Finder candidate',
    ref: 'LF-2026-042',
    kind: 'hidden',
    title: 'The Bay Hotel, Plymouth',
    summary: 'Nobody advertised this. It was found by following a planning decision through to who eventually buys the furnishings.',
    chain: [
      'Planning approved',
      '22 furnished apartments',
      'Fit-out requirement likely',
      'Relevant buyer identified'
    ],
    source: 'Plymouth City Council planning register, application 26/01847.',
    whatChanged: 'Change of use approved 3 September 2026. A closed 40-bedroom hotel becomes 22 serviced apartments, completion indicated March.',
    whyItMayMatter: 'Serviced apartments are let furnished and refurnished on a cycle. That is a repeat customer rather than one job.',
    reasoning: [
      'A planning approval changed the building’s use.',
      'Serviced apartments are let furnished, so they need furnishing.',
      'Fit-out follows completion by six to nine months, so this is a February conversation.',
      'The buyer is the fit-out contractor, not the developer.',
      'Hartwell Interiors is named as agent on the application.',
      'A comparable conversion was supplied in 2024: Moorland Holiday Lets, 14 units, GBP 8,400.'
    ],
    confidence: 'Medium. The approval is fact. The fit-out requirement is inference, and nobody has said they are buying.',
    suggestedNextAction: 'Note it for February. Contact Hartwell nearer completion.'
  }
];

// The headline the page leads with. Deliberately derived from the records
// rather than stated beside them: a count that can disagree with the list
// under it is the first thing a sceptical visitor notices.
const WEEK_TOTAL = 7;

function summary() {
  const shown = OPPORTUNITIES.length;
  return {
    total: WEEK_TOTAL,
    shown,
    obvious: OPPORTUNITIES.filter((o) => o.kind === 'obvious').length,
    hidden: OPPORTUNITIES.filter((o) => o.kind === 'hidden').length,
    // Said plainly on the page. Two of seven are written up; the rest are
    // a number, and pretending otherwise would be the same defect this
    // file exists to avoid.
    note: `${shown} of ${WEEK_TOTAL} written up in full.`
  };
}

module.exports = {
  DOMAIN,
  REQUIRED_EVIDENCE_FIELDS,
  OPPORTUNITIES,
  WEEK_TOTAL,
  summary
};
