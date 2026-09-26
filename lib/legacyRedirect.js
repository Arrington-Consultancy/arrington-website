// Permanent redirects from retired page URLs that KEEP the query string.
//
// Found 26/09/2026 while reconciling the site against the Google Ads
// account: the seven legacy redirects in server.js sent a fixed target and
// dropped everything after the "?". A visitor arriving at an old URL from an
// ad therefore reached the new page without the gclid Google Ads appends,
// or the utm_* tags on a campaign link, so the Google tag on the new page
// never saw the click and the lead's own attribution recorded nothing.
// Google's ad crawler (AdsBot-Google-Mobile) fetched /what-we-have-done on
// 18/09/2026, which is what made this worth fixing rather than noting.
//
// The query goes BEFORE any #fragment: "/evidence#documents" with "?gclid=x"
// becomes "/evidence?gclid=x#documents", because a browser never sends what
// follows a # to the server or treats it as part of the query.
function queryOf(req) {
  const url = req.originalUrl || req.url || '';
  const i = url.indexOf('?');
  return i === -1 ? '' : url.slice(i);
}

function withQuery(target, query) {
  const hashAt = target.indexOf('#');
  const path = hashAt === -1 ? target : target.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : target.slice(hashAt);
  return path + (query || '') + hash;
}

function legacyRedirect(target) {
  return (req, res) => res.redirect(301, withQuery(target, queryOf(req)));
}

module.exports = { legacyRedirect, withQuery, queryOf };
