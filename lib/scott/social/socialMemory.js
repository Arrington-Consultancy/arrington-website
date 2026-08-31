// Scott AI Demonstration: the social memory behind Bob Fletcher.
//
// The point of this file is the thing a business owner never has and an
// agency never hands back: six years of what was actually posted, what
// it actually cost, what it actually produced, and which of it is worth
// doing again. Bob is the worker who holds it, so when Scott asks "what
// did we do last October" or "is the Yell listing earning its money",
// the answer comes from a record rather than a recollection.
//
// Every entry is invented for Scott's Armchair & Knitting Co. There is
// no credential path and no network path in this module; see
// lib/scott/social/fictionalSocial.js for the firewall note, which
// test/scott/socialFirewall.test.js enforces for this file too.
//
// CLEARANCE, using the existing 07E domains rather than a new one:
//   marketing_performance  what a thing cost and what it produced.
//                          Management level: Bob and Scott.
//   review_status          public comments and reviews owed a reply.
//                          Chloe holds this and NOT the money.
//   marketing_consent      whether a customer's chair or home may
//                          appear at all.

// Six years of posts, thinned to what is worth remembering: the ones
// that worked, the ones that did not, and the ones with a reason
// attached. A post nobody can explain is worse than no record.
const SOCIAL_POST_HISTORY = [
  { domain: 'marketing_performance', year: 2020, month: 'April', platform: 'Facebook', title: 'Lockdown repairs: chairs collected from the doorstep', format: 'photo + text', reach: 8400, engagements: 612, enquiries: 31, note: 'best organic month ever recorded. Circumstances, not craft: everyone was at home looking at their furniture.' },
  { domain: 'marketing_performance', year: 2020, month: 'October', platform: 'Facebook', title: 'Winter wing chair rescue, before and after', format: 'before/after', reach: 5100, engagements: 388, enquiries: 22, repeatable: true, note: 'the original before/after. Every strong post since is a version of this one.' },
  { domain: 'marketing_performance', year: 2021, month: 'February', platform: 'Facebook', title: 'How a frame is re-glued and clamped', format: 'process video', reach: 3900, engagements: 240, enquiries: 14, repeatable: true, note: 'process content converts lower but attracts trade enquiries' },
  { domain: 'marketing_performance', year: 2021, month: 'September', platform: 'Instagram', title: 'Account opened. First ten before and afters', format: 'carousel', reach: 1200, engagements: 96, enquiries: 4, note: 'slow start, as expected on a new account' },
  { domain: 'marketing_performance', year: 2022, month: 'March', platform: 'Instagram', title: 'The Ivybridge wing chair, start to finish', format: 'before/after', reach: 6200, engagements: 540, enquiries: 26, repeatable: true, note: 'first Instagram post to beat Facebook on the same subject' },
  { domain: 'marketing_performance', year: 2022, month: 'November', platform: 'Facebook', title: 'Christmas cut-off dates for repairs', format: 'text card', reach: 2400, engagements: 90, enquiries: 19, repeatable: true, seasonal: 'early November', note: 'dull to write, reliably books work. Repeat every year, first week of November.' },
  { domain: 'marketing_performance', year: 2023, month: 'January', platform: 'Facebook', title: 'Boosted: 20% off re-upholstery in January', format: 'boosted offer', reach: 14200, engagements: 410, enquiries: 38, accepted: 6, spendGbp: 240, note: 'high reach, poor quality. Discount attracted price shoppers and two complaints about lead time. Not repeated.' },
  { domain: 'marketing_performance', year: 2023, month: 'June', platform: 'LinkedIn', title: 'Account opened. Care home chair replacement cycles', format: 'article', reach: 380, engagements: 44, enquiries: 3, note: 'tiny reach, two of the three enquiries became contract work' },
  { domain: 'marketing_performance', year: 2024, month: 'May', platform: 'Instagram', title: 'Yarn delivery day', format: 'photo', reach: 1450, engagements: 88, enquiries: 2, note: 'liked, does not sell. Keep as filler, never as the main post of a week.' },
  { domain: 'marketing_performance', year: 2024, month: 'October', platform: 'Facebook', title: 'Half term workshop: how a frame is re-glued', format: 'process video', reach: 4100, engagements: 210, enquiries: 17, repeatable: true, seasonal: 'October half term', note: 'the 2021 process video, reshot. Better than the original.' },
  { domain: 'marketing_performance', year: 2025, month: 'February', platform: 'Instagram', title: 'A chair that came back after 40 years', format: 'story post', reach: 9800, engagements: 1240, enquiries: 44, repeatable: true, note: 'the best post the business has ever made. A story with a person in it, not a technique.' },
  { domain: 'marketing_performance', year: 2025, month: 'August', platform: 'LinkedIn', title: 'What care homes get wrong about chair budgets', format: 'article', reach: 720, engagements: 61, enquiries: 5, note: 'low volume, highest value per enquiry of any channel' },
  { domain: 'marketing_performance', year: 2026, month: 'March', platform: 'Instagram', title: 'Before and after: the Salcombe two-seater', format: 'before/after', reach: 5600, engagements: 470, enquiries: 21 },
  { domain: 'marketing_performance', year: 2026, month: 'August', platform: 'Instagram', title: '1960s wing chair brought back for a customer in Ivybridge', format: 'before/after', reach: 3120, engagements: 214, enquiries: 11, note: 'current month' }
];

// Every penny, by year and channel. The owner question this answers is
// not "what did we spend" but "what did we get for it".
const SOCIAL_SPEND_LEDGER = [
  { domain: 'marketing_performance', year: 2021, boostedSocialGbp: 320, directoriesGbp: 588, photographyGbp: 0, totalGbp: 908, enquiriesAttributed: 41, note: 'directories were most of the spend and produced least of the work' },
  { domain: 'marketing_performance', year: 2022, boostedSocialGbp: 480, directoriesGbp: 588, photographyGbp: 450, totalGbp: 1518, enquiriesAttributed: 63 },
  { domain: 'marketing_performance', year: 2023, boostedSocialGbp: 1240, directoriesGbp: 612, photographyGbp: 980, totalGbp: 2832, enquiriesAttributed: 88, note: 'the discount year. Most spend, worst quality of enquiry.' },
  { domain: 'marketing_performance', year: 2024, boostedSocialGbp: 890, directoriesGbp: 612, photographyGbp: 1240, totalGbp: 2742, enquiriesAttributed: 96 },
  { domain: 'marketing_performance', year: 2025, boostedSocialGbp: 640, directoriesGbp: 348, photographyGbp: 1680, totalGbp: 2668, enquiriesAttributed: 121, note: 'first year photography outspent everything else, and the first year organic beat paid on enquiries' },
  { domain: 'marketing_performance', year: 2026, boostedSocialGbp: 1360, directoriesGbp: 348, photographyGbp: 3420, totalGbp: 5128, enquiriesAttributed: 143, note: 'twelve months to date' }
];

// Directory and listing entries, the spend nobody reviews because it
// renews quietly. Kept here because it is the same question as a
// boosted post: what did this cost and what did it bring.
const DIRECTORY_LISTINGS = [
  { domain: 'marketing_performance', name: 'Yellow Pages print edition', status: 'CANCELLED 2023', annualCostGbp: 348, enquiriesLastFullYear: 2, note: 'cancelled after the 2022 book produced two enquiries, both price shoppers. Nobody missed it.' },
  { domain: 'marketing_performance', name: 'Yell.com online listing', status: 'ACTIVE', annualCostGbp: 348, renewalDate: '14 January 2027', enquiriesLastFullYear: 9, acceptedLastFullYear: 3, note: 'marginal. Three jobs at an average of GBP 410 against GBP 348 of cost. Worth a decision at renewal, not a reflex.' },
  { domain: 'marketing_performance', name: 'Thomson Local', status: 'CANCELLED 2021', annualCostGbp: 240, enquiriesLastFullYear: 0, note: 'no recorded enquiry in two years of paying for it' },
  { domain: 'marketing_performance', name: 'Google Business Profile', status: 'ACTIVE', annualCostGbp: 0, enquiriesLastFullYear: 82, acceptedLastFullYear: 27, note: 'free, and the single largest source of enquiries outside repeat and referral. Reviews are the whole of it.' },
  { domain: 'marketing_performance', name: 'Local parish magazine, quarter page', status: 'ACTIVE', annualCostGbp: 180, renewalDate: '1 April 2027', enquiriesLastFullYear: 11, acceptedLastFullYear: 7, note: 'cheapest acquisition of any paid channel. Older customers, larger jobs, no haggling.' }
];

// What to do again, and when. Each carries the evidence rather than an
// instinct, because "we always do a Christmas post" is not a reason.
const REPEAT_RECOMMENDATIONS = [
  { domain: 'marketing_performance', due: 'First week of November 2026', post: 'Christmas cut-off dates for repairs', firstRun: 'November 2022', timesRun: 4, evidence: 'averages 19 enquiries and books out December every year it has run. The only post that reliably fills a month.', confidence: 'HIGH' },
  { domain: 'marketing_performance', due: 'October half term 2026', post: 'How a frame is re-glued and clamped', firstRun: 'February 2021', timesRun: 3, evidence: 'the 2024 reshoot beat the 2021 original on every measure. Reshoot again rather than repost.', confidence: 'HIGH' },
  { domain: 'marketing_performance', due: 'Any month, needs a customer who will agree', post: 'A chair that came back after 40 years', firstRun: 'February 2025', timesRun: 1, evidence: 'the best performing post the business has made. Needs a real story and written consent, so it cannot be scheduled to order.', confidence: 'HIGH, subject to consent' },
  { domain: 'marketing_performance', due: 'January 2027, decide by December', post: 'Boosted January discount', firstRun: 'January 2023', timesRun: 1, evidence: 'do NOT repeat. Reached 14,200 people, produced 6 accepted jobs and 2 complaints about lead time. The reach was the only good number.', confidence: 'HIGH, against' }
];

// What the record cannot tell you. Stated rather than left as an
// apparent gap in performance.
const SOCIAL_MEMORY_LIMITS = [
  { domain: 'marketing_performance', item: 'Attribution before September 2021', position: 'NOT RECORDED', detail: 'enquiries were logged without a source before the current system. Figures for 2020 and early 2021 are reach and engagement only, and must not be presented as lead attribution.' },
  { domain: 'marketing_performance', item: 'Instagram data before the account opened', position: 'DOES NOT EXIST', detail: 'the account opened in September 2021. Any comparison against Facebook before that date is not like for like.' },
  { domain: 'marketing_performance', item: 'Repeat and referral attribution', position: 'PARTIAL', detail: 'a customer who saw a post and rang three months later is recorded as referral. The organic figures are therefore understated, and the paid ones flattered.' }
];

module.exports = {
  SOCIAL_POST_HISTORY,
  SOCIAL_SPEND_LEDGER,
  DIRECTORY_LISTINGS,
  REPEAT_RECOMMENDATIONS,
  SOCIAL_MEMORY_LIMITS
};
