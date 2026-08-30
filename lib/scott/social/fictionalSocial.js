// Scott AI Demonstration: fictional social media activity.
//
// The same user-facing capability as the Arrington workspace's social
// control area, demonstrated inside the fictional company. Owned by
// SCOTT'S CUSTOMERS & MARKETING (Bob Fletcher), with Ruth routing
// social questions to him.
//
// THE PROJECT FIREWALL IS THE POINT OF THIS FILE.
//
// Every figure below is invented for Scott's Armchair & Knitting Co.
// This module reads NO credential, imports nothing from lib/workspace,
// and has no network path of any kind: there is no code here that could
// reach a real Facebook, Instagram, LinkedIn or X account even if a
// token were present in the environment. Connecting Scott to a genuine
// external account is a separate external-publication decision that
// Tom has explicitly reserved, and it is not implemented.
// test/scott/socialFirewall.test.js enforces all of this.
//
// CLEARANCE: no new domain was invented for social. The existing 07E
// tags carry it, which is what makes the demonstration honest rather
// than decorative:
//
//   marketing_performance  reach, spend-adjacent results, campaign
//                          outcome. Management level: Bob and Scott.
//   review_status          public comments, reviews and replies owed to
//                          a customer. Chloe holds this and NOT
//                          marketing_performance, so the same social
//                          page shows her the comments she must answer
//                          and none of the paid performance behind them.
//   marketing_consent      whether a customer's chair, home or photo may
//                          appear in a post at all.

// Connector state. Deliberately shaped like the real thing so the
// demonstration behaves the same way, including the honesty rule that a
// connected account is not proof that a retrieval succeeded.
const SOCIAL_ACCOUNTS = [
  { domain: 'marketing_performance', platform: 'Facebook', handle: 'Scott’s Armchair & Knitting Co.', status: 'CONNECTED', followers: 2140, followersChange30d: 38, lastRetrieval: '30 August 2026, 07:10', lastOutcome: 'OK', note: 'Page, not a personal profile' },
  { domain: 'marketing_performance', platform: 'Instagram', handle: '@scotts_armchair', status: 'CONNECTED', followers: 1685, followersChange30d: 74, lastRetrieval: '30 August 2026, 07:10', lastOutcome: 'OK', note: 'before and after work carries the account' },
  { domain: 'marketing_performance', platform: 'LinkedIn', handle: 'Scott’s Armchair & Knitting Co.', status: 'CONNECTED', followers: 412, followersChange30d: 6, lastRetrieval: '29 August 2026, 07:10', lastOutcome: 'OK', note: 'trade and care-home audience, low volume by design' },
  // Deliberately not connected, so the demonstration shows what an
  // unconfigured connector looks like rather than only the happy path.
  { domain: 'marketing_performance', platform: 'X', handle: 'not connected', status: 'NOT CONNECTED', followers: null, followersChange30d: null, lastRetrieval: null, lastOutcome: 'NEVER', note: 'no account opened. Nothing is retrieved and nothing is shown, rather than an empty timeline that would read as no activity' }
];

const SOCIAL_POSTS_30D = [
  { domain: 'marketing_performance', platform: 'Instagram', posted: '28 August 2026', kind: 'PUBLISHED', body: 'Before and after: a 1960s wing chair brought back for a customer in Ivybridge.', reach: 3120, engagements: 214, comments: 11, note: 'before and after remains the strongest format, consistent with 07E' },
  { domain: 'marketing_performance', platform: 'Facebook', posted: '26 August 2026', kind: 'PUBLISHED', body: 'Half term workshop: how a frame is re-glued and clamped.', reach: 1870, engagements: 96, comments: 7 },
  { domain: 'marketing_performance', platform: 'LinkedIn', posted: '22 August 2026', kind: 'PUBLISHED', body: 'Why care homes replace chairs three times more often than they need to.', reach: 640, engagements: 41, comments: 3, note: 'trade audience: low reach, high quality of enquiry' },
  { domain: 'marketing_performance', platform: 'Instagram', posted: '19 August 2026', kind: 'PUBLISHED', body: 'Yarn delivery day. Three new colours in the knitting range.', reach: 1450, engagements: 88, comments: 4 },
  // Drafted, not published. The distinction is load-bearing: a draft
  // must never be mistaken for something that went out.
  { domain: 'marketing_performance', platform: 'Instagram', posted: null, kind: 'PROPOSED', body: 'Draft: the Elaine Rogers frame repair, showing the clamped joint and the finished chair.', reach: null, engagements: null, comments: null, note: 'BLOCKED pending consent and quality sign-off, see the consent note below. Drafted by Bob Fletcher, not published and not scheduled.' },
  { domain: 'marketing_performance', platform: 'Facebook', posted: null, kind: 'PROPOSED', body: 'Draft: autumn re-upholstery slots, opening bookings for October.', reach: null, engagements: null, comments: null, note: 'awaiting Scott Mercer sign-off on the October capacity claim before anyone publishes it' }
];

// Public comments and messages. review_status, so Chloe sees these.
const SOCIAL_ENGAGEMENT_OPEN = [
  { domain: 'review_status', platform: 'Facebook', kind: 'COMMENT', author: 'Marian Hill', received: '29 August 2026', body: 'Do you collect from Salcombe? My mother’s chair needs the arm re-webbing.', needsReply: true, suggested: 'Bob has drafted a reply confirming the collection route and asking for photographs. Not sent: a person sends it.' },
  { domain: 'review_status', platform: 'Instagram', kind: 'COMMENT', author: '@harbourhouse_devon', received: '29 August 2026', body: 'How long does a full re-upholstery usually take?', needsReply: true, suggested: 'Draft quotes the standard range only. A specific date needs Operations, so the draft deliberately does not give one.' },
  { domain: 'review_status', platform: 'Facebook', kind: 'MESSAGE', author: 'Helen Price', received: '28 August 2026', body: 'I left a review but I am still waiting to hear about my chair.', needsReply: true, suggested: 'Linked to complaint C-260828-01. No marketing reply: this goes to the complaint workflow, not a general response.' },
  { domain: 'review_status', platform: 'Instagram', kind: 'COMMENT', author: '@devon_interiors', received: '27 August 2026', body: 'Beautiful work on that wing chair.', needsReply: false, suggested: 'No reply owed. Acknowledgement only if someone is passing.' }
];

// The consent rule, already part of Scott's 07P evidence, applied to
// social. This is why the Elaine Rogers post above is blocked.
const SOCIAL_CONSENT_NOTES = [
  { domain: 'marketing_consent', subject: 'Elaine Rogers, SAKS-1045', position: 'NO PHOTOGRAPHY CONSENT RECORDED', detail: 'The chair may not appear in any post until written consent exists AND the quality record passes. Two separate blocks: consent is not a substitute for the release gate.' },
  { domain: 'marketing_consent', subject: 'Care home contract work', position: 'CONSENT LIMITED', detail: 'Interiors may be shown; residents, name badges and room numbers may not appear in any frame.' },
  { domain: 'marketing_consent', subject: 'Ivybridge wing chair, SAKS-1031', position: 'CONSENT GIVEN IN WRITING', detail: 'Customer agreed to before and after use, no name. Already used on 28 August.' }
];

// Channel-level outcome. marketing_performance, so this is exactly what
// Chloe does NOT see while still seeing every comment above.
const SOCIAL_PERFORMANCE_90D = [
  { domain: 'marketing_performance', channel: 'Organic social', enquiries: 96, qualified: 44, accepted: 19, bookedRevenueGbp: 6540, spendGbp: 0, verdict: 'the useful channel: before and after plus process content' },
  { domain: 'marketing_performance', channel: 'Boosted social', enquiries: 47, qualified: 21, accepted: 9, bookedRevenueGbp: 2880, spendGbp: 1360, verdict: 'weaker per pound than strong organic. Do not increase boosts merely because reach is larger' }
];

module.exports = {
  SOCIAL_ACCOUNTS,
  SOCIAL_POSTS_30D,
  SOCIAL_ENGAGEMENT_OPEN,
  SOCIAL_CONSENT_NOTES,
  SOCIAL_PERFORMANCE_90D
};
