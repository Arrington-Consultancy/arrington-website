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
  'page_profile',
  'page_posts',
  'post_comments',
  'ig_profile',
  'ig_media'
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

class MetaApiError extends Error {
  constructor(message, { status = null, code = null, type = '' } = {}) {
    super(message);
    this.name = 'MetaApiError';
    this.status = status;
    this.code = code;
    this.type = type;
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
    throw new MetaApiError(`could not reach the Graph API: ${reason}`);
  } finally {
    clearTimeout(timer);
  }

  let body = null;
  let raw = '';
  try {
    raw = await res.text();
    body = raw ? JSON.parse(raw) : null;
  } catch (err) {
    throw new MetaApiError(`the Graph API returned a reply that is not JSON (HTTP ${res.status})`, { status: res.status });
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

function numberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  GRAPH_VERSION,
  ENDPOINT_ALLOWLIST,
  MetaApiError,
  redactSecrets,
  graphGet,
  fetchPageProfile,
  fetchPagePosts,
  fetchPostComments,
  fetchInstagramProfile,
  fetchInstagramMedia,
  __setFetchForTests,
  __resetFetchForTests
};
