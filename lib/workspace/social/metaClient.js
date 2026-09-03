// Arrington AI Workspace: Meta Graph API reader.
//
// Added 03/09/2026. Until then the social area had a registry, a
// schema, a page and a permission model, and NO code that ever called
// an API: the credential variable names appeared only in a list of what
// was required, and nothing read their values. So a correctly pasted
// token produced an empty page forever. This file is the missing half,
// and only that half.
//
// READ ONLY, and structurally so rather than by intention:
//
//   - Every request is a GET. There is no function here that takes a
//     method, so a write cannot be made by passing a different one.
//   - Only the endpoints listed in ENDPOINT_ALLOWLIST are reachable,
//     and each is a read path. A caller cannot compose a new one.
//   - The scopes the token carries are declared in registry.js, and a
//     test rejects any manage/publish/delete-shaped scope that is not
//     individually justified. The token therefore cannot perform the
//     actions the connector layer refuses.
//
// Instagram comments are deliberately NOT fetched. The only Meta scope
// that exposes them also confers moderation (governance finding F5,
// 30/08/2026), so the token does not hold it and this file must not
// pretend otherwise by trying.
//
// The token travels in the Authorization header, never in the query
// string. That is not style: an error path that echoes a failing URL
// would otherwise write the access token into last_error, which is
// rendered on the Social page and stored in the database. redactSecrets
// below is the second line of the same defence.

const GRAPH_VERSION = 'v21.0';
const GRAPH_HOST = 'https://graph.facebook.com';

// Every path this client may request, as a template. Anything not here
// cannot be fetched, which is what makes "read only" a property of the
// module rather than a promise about how it is called.
const ENDPOINT_ALLOWLIST = Object.freeze([
  'page_list',
  'page_profile',
  'page_metadata',
  'page_insights',
  'page_posts',
  'post_insights',
  'post_comments',
  'ig_profile',
  'ig_media',
  'ig_insights',
  'ig_media_insights'
]);

// Endpoints that CHANGE something on Meta. Kept in their own list, and
// unreachable through graphGet, which is GET-only. Anything here can be
// called only through graphPost, which refuses to run unless it is
// handed an approval a person has explicitly granted. See mutations.js.
const MUTATION_ALLOWLIST = Object.freeze([
  'page_publish_post',
  'page_reply_comment',
  'page_hide_comment',
  'page_update_metadata'
]);

const DEFAULT_TIMEOUT_MS = 15000;

// Injectable so tests exercise this module rather than a copy of it.
// The default is the platform fetch; no HTTP library is added.
let fetchImpl = (...args) => globalThis.fetch(...args);
function __setFetchForTests(fn) { fetchImpl = fn; }
function __resetFetchForTests() { fetchImpl = (...args) => globalThis.fetch(...args); }

// Anything token-shaped is removed before an error is stored or shown.
// Meta tokens are long opaque strings, commonly EAA-prefixed; the
// generic rule catches a long unbroken credential-looking run whatever
// the prefix, because relying on one vendor prefix is how the next
// format slips through.
function redactSecrets(text, extraSecrets = []) {
  let out = String(text == null ? '' : text);
  for (const secret of extraSecrets) {
    const s = String(secret || '').trim();
    if (s.length >= 8) out = out.split(s).join('[redacted]');
  }
  out = out.replace(/EAA[A-Za-z0-9_-]{10,}/g, '[redacted]');
  out = out.replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted]');
  out = out.replace(/(access_token=)[^&\s]+/gi, '$1[redacted]');
  return out;
}

// Meta's own error codes, so a failure can be reported as the thing it
// actually is. An operator who is told "the token expired" knows what
// to do; one told "sync failed" does not, and the difference is the
// whole point of recording an outcome truthfully.
//
// 190 is the token family (expired, revoked, password changed).
// 10 and 200-299 are permission refusals: the app was not granted, or
// no longer holds, what it asked for.
// 4, 17, 32, 613 and HTTP 429 are the throttling family.
const ERROR_KINDS = Object.freeze({
  EXPIRED: 'token_expired',
  DENIED: 'permission_denied',
  RATE_LIMITED: 'rate_limited',
  MALFORMED: 'malformed_response',
  UNREACHABLE: 'unreachable',
  UNKNOWN: 'unknown'
});

function classifyError({ status = null, code = null, type = '' } = {}) {
  const c = Number(code);
  if (c === 190) return ERROR_KINDS.EXPIRED;
  if (type === 'OAuthException' && (c === 102 || c === 463 || c === 467)) return ERROR_KINDS.EXPIRED;
  if (c === 10 || (c >= 200 && c <= 299)) return ERROR_KINDS.DENIED;
  if ([4, 17, 32, 613].includes(c) || status === 429) return ERROR_KINDS.RATE_LIMITED;
  if (status === 403) return ERROR_KINDS.DENIED;
  return ERROR_KINDS.UNKNOWN;
}

class MetaApiError extends Error {
  constructor(message, { status = null, code = null, type = '', kind = null } = {}) {
    super(message);
    this.name = 'MetaApiError';
    this.status = status;
    this.code = code;
    this.type = type;
    this.kind = kind || classifyError({ status, code, type });
    // Whether trying again later could plausibly succeed without a
    // person changing something. Throttling yes; an expired token no.
    this.retryable = this.kind === ERROR_KINDS.RATE_LIMITED || this.kind === ERROR_KINDS.UNREACHABLE;
  }
}

// One GET against the Graph API.
//
// `endpoint` must name an allowlisted read. `path` is built by the
// caller below from an id the operator supplied, and ids are checked
// against a conservative pattern rather than interpolated raw.
async function graphGet(endpoint, path, { token, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!ENDPOINT_ALLOWLIST.includes(endpoint)) {
    throw new MetaApiError(`refusing to call an endpoint that is not on the read allowlist: ${endpoint}`);
  }
  if (!token || !String(token).trim()) {
    throw new MetaApiError('no access token supplied');
  }
  const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${String(token).trim()}`, Accept: 'application/json' },
      signal: controller.signal
    });
  } catch (err) {
    const reason = err && err.name === 'AbortError'
      ? `no response within ${timeoutMs}ms`
      : redactSecrets(err && err.message ? err.message : String(err), [token]);
    throw new MetaApiError(`could not reach the Graph API: ${reason}`, { kind: ERROR_KINDS.UNREACHABLE });
  } finally {
    clearTimeout(timer);
  }

  let body = null;
  let raw = '';
  try {
    raw = await res.text();
    body = raw ? JSON.parse(raw) : null;
  } catch (err) {
    throw new MetaApiError(`the Graph API returned a reply that is not JSON (HTTP ${res.status})`, { status: res.status, kind: ERROR_KINDS.MALFORMED });
  }

  // Meta reports failures in the body as well as the status, and the
  // body's message is the useful one: "Error validating access token"
  // tells the operator what to fix, where a bare 400 does not.
  if (!res.ok || (body && body.error)) {
    const e = (body && body.error) || {};
    const detail = redactSecrets(e.message || `HTTP ${res.status}`, [token]);
    throw new MetaApiError(detail, { status: res.status, code: e.code ?? null, type: e.type || '' });
  }
  return body || {};
}

// ---- Mutations -----------------------------------------------------
//
// The ONLY function in this file that changes anything on Meta, and it
// is deliberately awkward to call.
//
// Tom's instruction of 03/09/2026 was that the system be "technically
// capable of the Meta permissions we have configured without granting
// autonomous authority to use them". This is where that line is drawn.
// The capability exists; the authority does not. Three things must all
// be true before a single byte is written to Meta:
//
//   1. ENABLE_SOCIAL_MUTATIONS is exactly 'true'. Unset, this whole
//      path is inert, which is what makes merging it harmless.
//   2. The endpoint is on MUTATION_ALLOWLIST. A caller cannot compose
//      a new one, exactly as with reads.
//   3. An approval is supplied that a NAMED HUMAN has granted. Not a
//      flag, not a boolean a caller can pass: an object carrying the
//      approval row's id, its granted status and who granted it. A
//      caller with no such row cannot construct one that satisfies
//      this, and an AI path has no way to obtain one.
//
// It THROWS rather than returning false, the same discipline the
// refusal layer uses, so a caller who ignores the result still cannot
// proceed.
function assertMutationAuthorised(endpoint, approval, env = process.env) {
  if (env.ENABLE_SOCIAL_MUTATIONS !== 'true') {
    throw new MetaApiError('social mutations are not enabled in this environment (ENABLE_SOCIAL_MUTATIONS is not set to true)');
  }
  if (!MUTATION_ALLOWLIST.includes(endpoint)) {
    throw new MetaApiError(`refusing to call an endpoint that is not on the mutation allowlist: ${endpoint}`);
  }
  const a = approval || {};
  if (!a.approvalId || a.status !== 'approved' || !a.approvedBy || !String(a.approvedBy).trim()) {
    throw new MetaApiError('refusing to change anything on Meta without an approval a person has granted');
  }
  // 'workspace_ai' is the actor name the AI paths use. A decision
  // attributed to it is not a human decision, whatever the status says.
  if (String(a.approvedBy).trim() === 'workspace_ai') {
    throw new MetaApiError('refusing to act on an approval that was not granted by a person');
  }
  return true;
}

async function graphPost(endpoint, path, { token, body = {}, approval = null, env = process.env, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  assertMutationAuthorised(endpoint, approval, env);
  if (!token || !String(token).trim()) throw new MetaApiError('no access token supplied');

  const url = new URL(`${GRAPH_HOST}/${GRAPH_VERSION}/${path}`);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) form.set(k, String(v));
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${String(token).trim()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: form.toString(),
      signal: controller.signal
    });
  } catch (err) {
    const reason = err && err.name === 'AbortError'
      ? `no response within ${timeoutMs}ms`
      : redactSecrets(err && err.message ? err.message : String(err), [token]);
    throw new MetaApiError(`could not reach the Graph API: ${reason}`, { kind: ERROR_KINDS.UNREACHABLE });
  } finally {
    clearTimeout(timer);
  }

  let parsed = null;
  try {
    const raw = await res.text();
    parsed = raw ? JSON.parse(raw) : {};
  } catch (err) {
    throw new MetaApiError(`the Graph API returned a reply that is not JSON (HTTP ${res.status})`, { status: res.status, kind: ERROR_KINDS.MALFORMED });
  }
  if (!res.ok || (parsed && parsed.error)) {
    const e = (parsed && parsed.error) || {};
    throw new MetaApiError(redactSecrets(e.message || `HTTP ${res.status}`, [token]), {
      status: res.status, code: e.code ?? null, type: e.type || ''
    });
  }
  return parsed || {};
}

// Ids come from Railway variables typed by a person. Meta's ids are
// numeric, and anything else is a paste error worth catching before it
// becomes a request path.
function assertId(value, name) {
  const v = String(value == null ? '' : value).trim();
  if (!/^\d{1,32}$/.test(v)) {
    throw new MetaApiError(`${name} should be a numeric id, and this one is not. Check the value in Railway.`);
  }
  return v;
}

// ---- Facebook Page ------------------------------------------------

async function fetchPageProfile({ pageId, token }) {
  const id = assertId(pageId, 'FACEBOOK_PAGE_ID');
  const data = await graphGet('page_profile', id, {
    token,
    params: { fields: 'id,name,followers_count,fan_count' }
  });
  return {
    accountRef: data.id || id,
    displayName: data.name || '',
    // followers_count is the modern field; fan_count is the older page
    // likes count and is the fallback rather than a second number,
    // because showing two different "followers" would be worse than one.
    followers: numberOrNull(data.followers_count ?? data.fan_count)
  };
}

async function fetchPagePosts({ pageId, token, limit = 25 }) {
  const id = assertId(pageId, 'FACEBOOK_PAGE_ID');
  const data = await graphGet('page_posts', `${id}/posts`, {
    token,
    params: {
      // Insights are requested inline so a post and its metrics arrive
      // together. If read_insights is missing, Meta omits the field
      // rather than failing the call, and the post still lands with
      // null metrics, which the page shows honestly as unknown.
      fields: 'id,message,permalink_url,created_time,comments.summary(true).limit(0)',
      limit: Math.min(Math.max(Number(limit) || 25, 1), 100)
    }
  });
  return (data.data || []).map((p) => ({
    externalId: String(p.id || ''),
    body: String(p.message || ''),
    permalink: String(p.permalink_url || ''),
    postedAt: p.created_time ? new Date(p.created_time) : null,
    impressions: null,
    engagements: null,
    commentsCount: numberOrNull(p.comments && p.comments.summary && p.comments.summary.total_count)
  })).filter((p) => p.externalId);
}

async function fetchPostComments({ postId, token, limit = 25 }) {
  // A post id is "{page}_{post}", so it is not a bare number and gets
  // its own narrower check rather than assertId.
  const id = String(postId || '').trim();
  if (!/^[0-9_]{3,64}$/.test(id)) throw new MetaApiError('post id is not in the expected form');
  const data = await graphGet('post_comments', `${id}/comments`, {
    token,
    params: {
      fields: 'id,from,message,created_time,permalink_url',
      limit: Math.min(Math.max(Number(limit) || 25, 1), 100)
    }
  });
  return (data.data || []).map((c) => ({
    externalId: String(c.id || ''),
    kind: 'comment',
    author: String((c.from && c.from.name) || ''),
    body: String(c.message || ''),
    permalink: String(c.permalink_url || ''),
    occurredAt: c.created_time ? new Date(c.created_time) : null
  })).filter((c) => c.externalId);
}

// Pages this token can see. pages_show_list is the scope for it.
//
// /me/accounts returns a per-page access_token, and this function
// deliberately DROPS it. A token that arrives in a response is still a
// token: keeping it would put a live credential in a variable that
// nothing here needs, and eventually in a log.
async function fetchPageList({ token }) {
  const data = await graphGet('page_list', 'me/accounts', { token, params: { fields: 'id,name,category' } });
  return (data.data || []).map((p) => ({
    id: String(p.id || ''),
    name: String(p.name || ''),
    category: String(p.category || '')
  })).filter((p) => p.id);
}

// Page metadata. Reading it needs pages_read_engagement; changing it is
// a mutation and lives in mutations.js behind a human approval.
async function fetchPageMetadata({ pageId, token }) {
  const id = assertId(pageId, 'FACEBOOK_PAGE_ID');
  const data = await graphGet('page_metadata', id, {
    token,
    params: { fields: 'id,name,about,category,website,link,verification_status,is_published' }
  });
  return {
    about: String(data.about || ''),
    category: String(data.category || ''),
    website: String(data.website || ''),
    link: String(data.link || ''),
    verificationStatus: String(data.verification_status || ''),
    isPublished: data.is_published === undefined ? null : !!data.is_published
  };
}

// Page-level insights. read_insights is the scope.
//
// Metric availability changes between Graph versions and between page
// types, and Meta answers a metric it will not serve by omitting it
// rather than failing. So this returns whatever came back, keyed by
// name, and the caller reports what it got instead of assuming a shape.
async function fetchPageInsights({ pageId, token, metrics = ['page_impressions', 'page_post_engagements', 'page_fans'], period = 'day' }) {
  const id = assertId(pageId, 'FACEBOOK_PAGE_ID');
  const data = await graphGet('page_insights', `${id}/insights`, {
    token,
    params: { metric: metrics.join(','), period }
  });
  return summariseInsights(data);
}

async function fetchPostInsights({ postId, token, metrics = ['post_impressions', 'post_engaged_users'] }) {
  const id = String(postId || '').trim();
  if (!/^[0-9_]{3,64}$/.test(id)) throw new MetaApiError('post id is not in the expected form');
  const data = await graphGet('post_insights', `${id}/insights`, { token, params: { metric: metrics.join(',') } });
  return summariseInsights(data);
}

// Insights come back as a list of metrics, each with a list of dated
// values. The most recent value is the useful one here; the rest is
// history this workspace does not currently store.
function summariseInsights(data) {
  const out = {};
  for (const metric of (data && data.data) || []) {
    const name = String(metric.name || '');
    if (!name) continue;
    const values = Array.isArray(metric.values) ? metric.values : [];
    const last = values.length ? values[values.length - 1] : null;
    const v = last && typeof last.value === 'object' && last.value !== null
      // Some metrics are broken down by key rather than a single
      // number. Summing them is the honest reduction to one figure.
      ? Object.values(last.value).reduce((a, b) => a + (Number(b) || 0), 0)
      : (last ? last.value : null);
    out[name] = numberOrNull(v);
  }
  return out;
}

// ---- Instagram Business account -----------------------------------

async function fetchInstagramProfile({ accountId, token }) {
  const id = assertId(accountId, 'INSTAGRAM_BUSINESS_ACCOUNT_ID');
  const data = await graphGet('ig_profile', id, {
    token,
    params: { fields: 'id,username,followers_count,media_count' }
  });
  return {
    accountRef: data.id || id,
    displayName: data.username ? `@${data.username}` : '',
    followers: numberOrNull(data.followers_count)
  };
}

async function fetchInstagramMedia({ accountId, token, limit = 25 }) {
  const id = assertId(accountId, 'INSTAGRAM_BUSINESS_ACCOUNT_ID');
  const data = await graphGet('ig_media', `${id}/media`, {
    token,
    params: {
      fields: 'id,caption,permalink,timestamp,like_count,comments_count',
      limit: Math.min(Math.max(Number(limit) || 25, 1), 100)
    }
  });
  return (data.data || []).map((m) => ({
    externalId: String(m.id || ''),
    body: String(m.caption || ''),
    permalink: String(m.permalink || ''),
    postedAt: m.timestamp ? new Date(m.timestamp) : null,
    impressions: null,
    // Likes are the engagement signal available without an insights
    // call per item. Named honestly rather than presented as a total
    // "engagements" figure that would mean something different here
    // from what it means on Facebook.
    engagements: numberOrNull(m.like_count),
    commentsCount: numberOrNull(m.comments_count)
  })).filter((m) => m.externalId);
}

// Instagram account insights. instagram_manage_insights is Meta's
// read-only metrics scope for professional accounts despite its name;
// see registry.js for why that exception is declared explicitly.
async function fetchInstagramInsights({ accountId, token, metrics = ['impressions', 'reach', 'profile_views'], period = 'day' }) {
  const id = assertId(accountId, 'INSTAGRAM_BUSINESS_ACCOUNT_ID');
  const data = await graphGet('ig_insights', `${id}/insights`, { token, params: { metric: metrics.join(','), period } });
  return summariseInsights(data);
}

async function fetchInstagramMediaInsights({ mediaId, token, metrics = ['impressions', 'reach'] }) {
  const id = String(mediaId || '').trim();
  // Instagram media ids are plain numeric, unlike Facebook's compound
  // {page}_{post} form, so they get their own check rather than sharing
  // a looser pattern with it.
  if (!/^\d{3,32}$/.test(id)) throw new MetaApiError('media id is not in the expected form');
  const data = await graphGet('ig_media_insights', `${id}/insights`, { token, params: { metric: metrics.join(',') } });
  return summariseInsights(data);
}

function numberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  GRAPH_VERSION,
  ENDPOINT_ALLOWLIST,
  MUTATION_ALLOWLIST,
  ERROR_KINDS,
  classifyError,
  MetaApiError,
  redactSecrets,
  graphGet,
  graphPost,
  assertMutationAuthorised,
  fetchPageList,
  fetchPageProfile,
  fetchPageMetadata,
  fetchPageInsights,
  fetchPagePosts,
  fetchPostInsights,
  summariseInsights,
  fetchPostComments,
  fetchInstagramProfile,
  fetchInstagramMedia,
  fetchInstagramInsights,
  fetchInstagramMediaInsights,
  __setFetchForTests,
  __resetFetchForTests
};
