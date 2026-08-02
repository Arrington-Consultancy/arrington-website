const CANONICAL_HOST = 'www.arringtonconsultancy.com';
const CANONICAL_ORIGIN = `https://${CANONICAL_HOST}`;
const CANONICAL_REDIRECT_HOSTS = new Set([
  'arringtonconsultancy.com',
  'arringtonconsultancy.co.uk',
  'www.arringtonconsultancy.co.uk'
]);

function parseHost(hostHeader = '') {
  const raw = String(hostHeader || '').trim().toLowerCase();
  if (!raw) return { raw: '', hostname: '' };
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    const hostname = end !== -1 ? raw.slice(1, end) : raw;
    return { raw, hostname };
  }
  const [hostname] = raw.split(':');
  return { raw, hostname };
}

function isLocalHost(hostname = '') {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isRailwayPreviewHost(hostname = '') {
  return hostname.endsWith('.up.railway.app');
}

function shouldBypassCanonicalRedirect(hostname = '') {
  return isLocalHost(hostname) || isRailwayPreviewHost(hostname);
}

function resolveCanonicalOverride(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) return `${CANONICAL_ORIGIN}${trimmed}`;
  return trimmed;
}

function buildCanonicalPageUrl({ slug, isUsefulThinkingArticle = false }) {
  if (slug === 'main') return `${CANONICAL_ORIGIN}/`;
  const path = isUsefulThinkingArticle
    ? `/useful-thinking/${slug}`
    : `/${slug}`;
  return `${CANONICAL_ORIGIN}${path}`;
}

function resolveCanonicalForPage({ pageCanonical = '', slug, isUsefulThinkingArticle = false }) {
  const explicitCanonical = resolveCanonicalOverride(pageCanonical);
  return explicitCanonical || buildCanonicalPageUrl({ slug, isUsefulThinkingArticle });
}

function buildRobotsTxt() {
  return `User-agent: *\nAllow: /\nDisallow: /login\nDisallow: /market-ready-test\n\nSitemap: ${CANONICAL_ORIGIN}/sitemap.xml\n`;
}

function isAllowedCanonicalOverride(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === CANONICAL_HOST;
  } catch (err) {
    return false;
  }
}

function getCanonicalRedirectLocation({ hostHeader = '', forwardedProto = '', url = '/', isProd = false }) {
  if (!isProd) return null;
  const { raw, hostname } = parseHost(hostHeader);
  if (!hostname || shouldBypassCanonicalRedirect(hostname)) return null;
  const proto = String(forwardedProto || '').split(',')[0].trim().toLowerCase();
  const isHttps = proto === 'https';
  const mustCanonicalizeHost = CANONICAL_REDIRECT_HOSTS.has(hostname);
  const targetHost = mustCanonicalizeHost ? CANONICAL_HOST : raw;
  if (!targetHost) return null;
  if (mustCanonicalizeHost || !isHttps) {
    return `https://${targetHost}${url}`;
  }
  return null;
}

module.exports = {
  CANONICAL_HOST,
  CANONICAL_ORIGIN,
  buildCanonicalPageUrl,
  buildRobotsTxt,
  getCanonicalRedirectLocation,
  isAllowedCanonicalOverride,
  resolveCanonicalForPage,
  resolveCanonicalOverride
};
