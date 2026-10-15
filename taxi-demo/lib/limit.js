'use strict';

// Fixed-window rate limits per client address, in memory. Enough to stop a
// script filling the demo with bookings; not a security boundary.

function createLimiter({ windowMs, max, now = () => Date.now() }) {
  const hits = new Map();
  return function allow(key) {
    const t = now();
    const h = hits.get(key);
    if (!h || t - h.start >= windowMs) {
      hits.set(key, { start: t, count: 1 });
      if (hits.size > 10000) for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
      return true;
    }
    h.count += 1;
    return h.count <= max;
  };
}

module.exports = { createLimiter };
