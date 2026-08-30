// Arrington AI Workspace: social connector registry.
//
// Four platforms, one control area, per Tom's SOCIAL MEDIA CONNECTOR
// REQUIREMENT of 30/08/2026. This file is the single description of
// what each connector is allowed to do, and it is deliberately the only
// place that answers that question: a route, a view or a worker lane
// asking "may I do this" resolves here rather than carrying its own
// idea of the permissions.
//
// Three rules are structural rather than conventional:
//
// 1. LEAST PRIVILEGE. Each connector declares the narrowest scopes that
//    serve the approved read/analyse/draft purpose. No connector
//    declares a publishing scope, because publishing is not authorised
//    (see 2), and an unused write scope on a live token is exactly the
//    thing that turns a mistake into a public post.
//
// 2. CONSEQUENTIAL ACTIONS ARE HUMAN. Publishing, deleting, replying
//    publicly, changing account settings and spending money are
//    ACTION_CLASS_HUMAN. The workspace may prepare them and record them
//    for a person to carry out; no code path here performs them. This
//    mirrors the control pack's action classes: the workspace performs
//    class 3 (its own record writes) and nothing above it.
//
// 3. A CREDENTIAL IS NOT A RETRIEVAL. Connector state carries the last
//    successful retrieval separately from whether a credential exists,
//    because "connected" and "working" are different claims and the
//    interface must never make the second one on the strength of the
//    first.
//
// Nothing here reaches the Scott demonstration, and nothing in the Scott
// demonstration reaches this: Scott's equivalent is its own fictional
// dataset with no credential path at all (lib/scott/social/*).

// What a connector may do without a human in the loop.
const READ = 'read';           // fetch posts, metrics, comments, messages
const ANALYSE = 'analyse';     // summarise and interpret what was fetched
const DRAFT = 'draft';         // prepare content for a human to review

// What it may never do on its own. Named so a reviewer can grep for it.
const ACTION_CLASS_HUMAN = [
  'publish',
  'delete',
  'reply_publicly',
  'send_message',
  'change_account_settings',
  'advertising_spend'
];

const AUTONOMOUS_CAPABILITIES = [READ, ANALYSE, DRAFT];

const PLATFORMS = {
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    // Meta Graph API, Page-scoped. A Page access token derived from a
    // user token, not a personal profile token: Arrington's presence is
    // a Page, and personal-profile reading is neither needed nor
    // available.
    api: 'Meta Graph API (Page)',
    authRoute: 'Meta app + Facebook Login for Business, Page access token',
    credentialEnv: ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN'],
    readScopes: ['pages_read_engagement', 'pages_read_user_content', 'read_insights'],
    capabilities: AUTONOMOUS_CAPABILITIES,
    supports: { posts: true, metrics: true, comments: true, messages: true, followers: true },
    setupNote: 'Requires a Meta app with App Review for the listed permissions before it reads anything beyond test users.'
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    // Instagram is read through the same Meta app, via the Business
    // account linked to the Page, so it shares the app but not the
    // token or the scopes.
    api: 'Instagram Graph API (Business account via linked Page)',
    authRoute: 'Same Meta app; Instagram Business account linked to the Facebook Page',
    credentialEnv: ['INSTAGRAM_BUSINESS_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'],
    readScopes: ['instagram_basic', 'instagram_manage_insights', 'instagram_manage_comments'],
    capabilities: AUTONOMOUS_CAPABILITIES,
    supports: { posts: true, metrics: true, comments: true, messages: false, followers: true },
    setupNote: 'Requires an Instagram Business or Creator account linked to the Facebook Page. Personal accounts cannot be read.'
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    api: 'LinkedIn Marketing / Community Management API (organisation)',
    authRoute: 'LinkedIn app, OAuth 2.0 three-legged, organisation admin consent',
    credentialEnv: ['LINKEDIN_ORGANISATION_URN', 'LINKEDIN_ACCESS_TOKEN'],
    readScopes: ['r_organization_social', 'r_organization_admin'],
    capabilities: AUTONOMOUS_CAPABILITIES,
    supports: { posts: true, metrics: true, comments: true, messages: false, followers: true },
    setupNote: 'Organisation-level reading requires LinkedIn product access on the app; personal profile feeds are not available through it.'
  },
  x: {
    id: 'x',
    name: 'X',
    api: 'X API v2',
    authRoute: 'X developer app, OAuth 2.0 user context',
    credentialEnv: ['X_USER_ID', 'X_BEARER_TOKEN'],
    readScopes: ['tweet.read', 'users.read'],
    capabilities: AUTONOMOUS_CAPABILITIES,
    supports: { posts: true, metrics: true, comments: true, messages: false, followers: true },
    // Recorded because it is a commercial fact about the connector, not
    // a technical one, and it decides whether this platform is worth
    // connecting at all.
    setupNote: 'X API read access is a paid tier. Free access does not permit reading posts or metrics, so this connector stays unconfigured until a paid plan exists.'
  }
};

const PLATFORM_IDS = Object.keys(PLATFORMS);

function getPlatform(id) {
  return PLATFORMS[id] || null;
}

// Whether the environment actually carries every credential a platform
// needs. Absence is a normal state, not an error: an unconfigured
// connector renders as "not connected" and returns no data at all,
// rather than showing an empty timeline that reads like "no activity".
function isConfigured(platformId, env = process.env) {
  const p = PLATFORMS[platformId];
  if (!p) return false;
  return p.credentialEnv.every((k) => !!(env[k] && String(env[k]).trim()));
}

// The permission question, answered in one place. Anything in
// ACTION_CLASS_HUMAN is false for every platform, by construction
// rather than by a list someone has to remember to update.
function connectorMayDo(platformId, capability) {
  const p = PLATFORMS[platformId];
  if (!p) return false;
  if (ACTION_CLASS_HUMAN.includes(capability)) return false;
  return p.capabilities.includes(capability);
}

// Which platforms can even be asked about a given kind of content, so a
// view never renders a "no messages" panel for a platform whose API
// does not expose messages at all. Not knowing and having nothing are
// different answers.
function platformsSupporting(feature) {
  return PLATFORM_IDS.filter((id) => PLATFORMS[id].supports[feature]);
}

module.exports = {
  PLATFORMS,
  PLATFORM_IDS,
  AUTONOMOUS_CAPABILITIES,
  ACTION_CLASS_HUMAN,
  READ,
  ANALYSE,
  DRAFT,
  getPlatform,
  isConfigured,
  connectorMayDo,
  platformsSupporting
};
