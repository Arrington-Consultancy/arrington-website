// Server-side client for the Google Places API (New) "Place Details" endpoint.
// Reviews are cached in-process (not the database) since they only need to
// refresh every so often and this avoids a schema migration; the cache resets
// on deploy/restart, which just means one slightly-slower first request.
const PLACE_ID = 'ChIJYf49saEhrmgRStXTX_3VXB4'; // Arrington Consultancy — verified against the same listing used in JSON-LD sameAs
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cache = null; // { data, fetchedAt }

async function fetchPlaceDetails() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;
  const res = await fetch(`https://places.googleapis.com/v1/places/${PLACE_ID}`, {
    headers: {
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,googleMapsUri,reviews'
    }
  });
  if (!res.ok) throw new Error(`Places API responded ${res.status}`);
  return res.json();
}

// Returns { rating, userRatingCount, googleMapsUri, reviews: [...] } or null
// if the API key is unset or every fetch attempt (fresh and stale-fallback)
// has failed. Never throws — a broken reviews fetch shouldn't break a page.
async function getGoogleReviews() {
  const now = Date.now();
  if (cache && (now - cache.fetchedAt) < CACHE_TTL_MS) {
    return cache.data;
  }
  try {
    const data = await fetchPlaceDetails();
    if (data) cache = { data, fetchedAt: now };
    return data;
  } catch (err) {
    console.error('Google Places fetch failed:', err.message);
    return cache ? cache.data : null; // serve stale data over nothing, if we have it
  }
}

module.exports = { getGoogleReviews };
