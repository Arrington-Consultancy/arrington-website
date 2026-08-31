// Arrington: the social record the SOCIAL CONTENT BUILDER lane holds.
//
// Unlike the Scott demonstration, none of this is invented. Every entry
// comes from a controlled source and says which one:
//
//   Drive, "Arrington Consultancy Published Social Posts" (reviewed
//   12 June 2026) for the posts, their themes, the notes on what worked
//   and the reusable lines.
//
//   The live website and lib/usefulThinkingArticles.js for the Useful
//   Thinking articles, which is the source of truth for what is
//   actually published rather than what was planned.
//
// Arrington has been posting for months, not years, so this is a short
// record honestly presented rather than a long one padded out. Where the
// source does not record something, it says so: see MEMORY_GAPS, which
// exists because two things Tom asked for are genuinely not written down
// anywhere yet, and inventing them would be worse than missing them.

const SOURCE_POSTS = 'Drive: Arrington Consultancy Published Social Posts (reviewed 12 June 2026)';
const SOURCE_ARTICLES = 'Live website and lib/usefulThinkingArticles.js';

// Every published post on the record. dateRecorded is deliberately null
// where the source says "Not yet logged": that is a fact about the
// record, not a date to guess at.
const PUBLISHED_POSTS = [
  { ref: '001', platform: 'LinkedIn (personal)', dateRecorded: null, title: 'Most consultants try to fix your business before they understand it', theme: 'Consultant differentiation, action over theory, operator credibility', note: 'Weaker than the later Tom-voiced posts. Generic consultant language, broad claims. Kept as a reference point for what to move away from.', source: SOURCE_POSTS },
  { ref: '002', platform: 'LinkedIn (personal)', dateRecorded: null, title: 'First live project for Arrington Consultancy is underway with Core Gym in Plympton', theme: 'First live project, local proof, missed income, operational gaps', note: 'Useful proof post. Caution: do not overuse Core Gym as proof before outcomes are specific.', source: SOURCE_POSTS },
  { ref: '003', platform: 'LinkedIn (personal)', dateRecorded: null, title: 'Staff retention, in the real owner-run business sense', theme: 'Staff retention, loyalty, culture, owner pressure', note: 'Strong people post. Avoids soft HR language. Reusable idea: loyalty is valuable, but it is not permanence.', source: SOURCE_POSTS },
  { ref: '004', platform: 'LinkedIn (personal)', dateRecorded: null, title: 'One of the biggest mistakes I made in business was ignoring a bad feeling for too long', theme: 'Gut feeling, operational drift, growth creating distance', note: 'Strong operator post. Gut feeling framed as experience detecting drift before the numbers show it.', source: SOURCE_POSTS },
  { ref: '005', platform: 'LinkedIn (personal)', dateRecorded: null, title: 'An old office kept because it was convenient and easier not to change', theme: 'Old decisions, hidden costs, visibility, owner proximity', note: 'Strong operator post. Core idea: the hidden cost is visibility, not the invoice.', source: SOURCE_POSTS },
  { ref: '006', platform: 'LinkedIn (company page)', dateRecorded: null, title: 'Arrington Consultancy is now on LinkedIn', theme: 'Company page launch, positioning', engagement: '1 reaction', note: 'Functional launch post rather than traction content, which is fine for a first company post.', source: SOURCE_POSTS },
  { ref: '007', platform: 'LinkedIn (personal)', dateRecorded: null, title: 'In trying to be fair, I was causing constant conflict', theme: 'Fairness, hierarchy, authority, structure', note: 'Strong. Admits a real owner mistake and links it to structure rather than personality.', source: SOURCE_POSTS },
  { ref: 'F001', platform: 'Facebook', dateRecorded: '30 April', title: 'You do not own a business. You own a job you cannot leave', theme: 'Owner dependency, structure problem, bottleneck', note: 'Direct but more salesy than the operator stories. Future posts should prove the point through examples.', source: SOURCE_POSTS },
  { ref: 'F002', platform: 'Facebook', dateRecorded: '1 May', title: 'First week of Arrington Consultancy', theme: 'Core Gym, advertising space, practical income improvement', note: 'Useful proof post showing a practical commercial outcome.', source: SOURCE_POSTS },
  { ref: 'F003', platform: 'Facebook', dateRecorded: '12 May', title: 'A bit of a follow up from last week on the work with Core Gym', theme: 'Hidden revenue, small gaps, time space and attention', note: 'Strong. Shows the method without sounding like a pitch. Reusable line: find the small gaps, tighten what is already there.', source: SOURCE_POSTS },
  { ref: 'F004', platform: 'Facebook', dateRecorded: '2 June, 08:30', title: 'The reverse economy of scale', theme: 'Growth, distance from the front line, structure beneath growth', note: 'One of the best reusable concepts: growth does not remove pressure on the owner unless the structure underneath grows with it.', source: SOURCE_POSTS },
  { ref: 'F005', platform: 'Facebook', dateRecorded: '4 June, 08:15', title: 'An old office kept because it was convenient and easier not to change', theme: 'Old decisions, hidden costs, visibility', crossPost: 'Same story as LinkedIn 005', note: 'Reuse warning: do not run another old-office version soon unless it adds a new angle.', source: SOURCE_POSTS },
  { ref: 'F006', platform: 'Facebook', dateRecorded: '9 June, 19:30', title: 'In trying to be fair, I was causing constant conflict', theme: 'Fairness, hierarchy, clarity', crossPost: 'Shorter version of LinkedIn 007', note: 'Cleaner than the LinkedIn version. Lands on a clear practical line.', source: SOURCE_POSTS },
  { ref: 'I001', platform: 'Instagram', dateRecorded: '12 May', title: 'Working with Core Gym in Plympton has already proved something simple', theme: 'Hidden money, space and time, making more of what already works', engagement: '1 like', note: 'Fits Instagram better than the long Facebook version.', source: SOURCE_POSTS },
  { ref: 'I002', platform: 'Instagram', dateRecorded: '10 May', title: 'Most businesses do not need a dramatic rebuild', theme: 'Small operational pressure, unlocking existing gains', engagement: '0 likes at the time of the screenshot', note: 'Caption duplicated its middle section. A future version keeps one clean paragraph.', source: SOURCE_POSTS }
];

const DRAFT_POSTS = [
  { ref: '008', platform: 'LinkedIn first, then Facebook after 3 to 5 days', title: 'The tightrope between staff loyalty and damage control is brutal', theme: 'Staff loyalty, damage control, standards, blame culture', recommendedTiming: 'Tuesday 08:15 to 08:45 on LinkedIn; Facebook later the same week, Thursday around 19:30', note: 'Strong Tom-voiced post. Admits the owner mistake rather than blaming the staff member. NOTE: this became a published Useful Thinking article of the same name, so check whether the social version has already been superseded before posting it.', source: SOURCE_POSTS }
];

// The published Useful Thinking articles.
//
// These are EVERGREEN website thinking, not time-led posts, and they
// were never designed around a publication date. They are deliberately
// kept separate from the chronological social record above: a social
// post belongs to the week it went out, an article does not expire.
//
// So no date is carried, none is inferred, and none is treated as
// missing. If the timing of an article ever genuinely matters, the
// evidence is the repository history of when it first entered the site,
// not a field backfilled after the fact.
//
// The live site is the source of truth for what is actually published.
const USEFUL_THINKING_ARTICLES = [
  { slug: 'being-certain-isnt-the-same-as-being-right', title: "Being Certain Isn't the Same as Being Right" },
  { slug: 'the-customer-who-messaged-me-at-4am', title: 'The Customer Who Messaged Me at 4am' },
  { slug: 'you-dont-get-to-decide-when-youve-made-things-right', title: "You Don't Get to Decide When You've Made Things Right" },
  { slug: 'the-tightrope-between-staff-loyalty-and-damage-control', title: 'The Tightrope Between Staff Loyalty and Damage Control', socialCrossover: 'Also written as draft social post 008' },
  { slug: 'a-profitable-job-is-not-necessarily-good-business', title: 'A Profitable Job Is Not Necessarily Good Business' },
  { slug: 'every-rule-changes-behaviour', title: 'Every Rule Changes Behaviour' },
  { slug: 'the-turning-that-never-came', title: 'The Turning That Never Came' },
  { slug: 'serendipity-is-not-a-system', title: 'Serendipity Is Not a System' },
  { slug: 'some-people-are-worth-the-risk', title: 'Some People Are Worth the Risk' },
  { slug: 'the-connection-isnt-the-sale', title: "The Connection Isn't the Sale" },
  { slug: 'the-monument-to-wasted-money', title: 'The Monument to Wasted Money' },
  { slug: 'you-build-a-business-one-problem-at-a-time', title: 'You Build a Business One Problem at a Time' },
  { slug: 'you-can-train-but-you-shouldnt-blame', title: "You Can Train, But You Shouldn't Blame" }
].map((a) => ({ ...a, published: true, source: SOURCE_ARTICLES }));

// The eight themes the record itself identifies, with the line the
// source picked out as the strongest expression of each.
const REUSABLE_THEMES = [
  { theme: 'Owner dependency and structure', bestLine: 'You do not own a business. You own a job you cannot leave.', caution: 'Punchy, but can sound accusatory if overused.' },
  { theme: 'Making existing businesses stronger', bestLine: 'Not walking into a broken business, but stepping into one that already has something good and finding the bits that could work harder.' },
  { theme: 'Hidden income and practical improvement', bestLine: 'Find the small gaps. Tighten what is already there.' },
  { theme: 'Growth reducing visibility', bestLine: 'Growth does not remove pressure on the owner unless the structure underneath grows with it.', note: 'The strongest recurring thought on the record.' },
  { theme: 'Owner fairness and hierarchy', bestLine: 'In trying not to upset people, I was creating a situation that upset almost everyone.' },
  { theme: 'Staff loyalty and retention', bestLine: 'Loyalty is valuable, but it is not permanence.' },
  { theme: 'Gut feeling as operational intelligence', bestLine: 'Your instinct is often your experience noticing something before the numbers catch up.' },
  { theme: 'Old decisions becoming hidden cost', bestLine: 'Some of the things costing a business most are not always the obvious numbers on the P and L.' }
];

// The working rules the record sets for future content.
const CONTENT_RULES = [
  { rule: 'The anchor frame', detail: 'Real owner mistake, then commercial truth, then what it taught Tom, then why it matters to owner-run businesses. Returned to whenever content starts sounding generic or consultant led.' },
  { rule: 'Show, do not declare', detail: 'The strongest posts show the business truth through a real example. The weaker ones declare the positioning directly.' },
  { rule: 'Do not weaken content to chase likes', detail: 'Traction has been weak, but the more likely cause is audience size and relevance, not the writing. Improve distribution and connections while keeping the operator voice intact.' },
  { rule: 'Platform split', detail: 'LinkedIn for the operator stories, Facebook for local proof and practical updates, Instagram for real images and short sharp captions rather than long essays.' },
  { rule: 'No engagement bait', detail: 'It would cheapen the brand.' }
];

// What the record does not hold. Stated because two of the three are
// things worth having and nobody has written them down yet, and a
// memory that quietly omits its own holes is not a memory.
const MEMORY_GAPS = [
  { item: 'Dates for the LinkedIn social posts', position: 'NOT LOGGED', detail: 'Every LinkedIn entry on the record reads "Date posted: Not yet logged". The Facebook and Instagram posts carry a day and month but no year. Ordering and anniversary prompts for social are therefore unavailable, and no date on this page is inferred. This is a social record problem only: the Useful Thinking articles are evergreen and are not part of this chronology.' },
  { item: 'Performance figures', position: 'ALMOST NONE', detail: 'Two engagement notes exist in the whole record: one reaction on the company page launch, one like on an Instagram post. There is no reach, no click and no enquiry attribution for any post, so nothing here can be ranked by what it produced.' },
  { item: 'Directory and listing entries', position: 'NOT SUPPLIED', detail: 'No record of paid or free listings, their cost or their renewal dates. This is usually the spend that renews unreviewed.' }
];

module.exports = {
  SOURCE_POSTS,
  SOURCE_ARTICLES,
  PUBLISHED_POSTS,
  DRAFT_POSTS,
  USEFUL_THINKING_ARTICLES,
  REUSABLE_THEMES,
  CONTENT_RULES,
  MEMORY_GAPS
};
