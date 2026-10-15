'use strict';

// The website's own record of bookings it has passed to dispatch, keyed by a
// random token that goes in the confirmation page's address. The dispatch
// reference is short and easy to read out on the phone, so it is not used to
// look a booking up: anyone could guess one. Held in memory for two hours.

const crypto = require('crypto');

const TTL = 2 * 60 * 60 * 1000;
const MAX = 5000;

function createStore(now = () => Date.now()) {
  const byToken = new Map();
  const byRef = new Map();
  function prune() {
    const cutoff = now() - TTL;
    for (const [t, r] of byToken) if (r.createdAt < cutoff) { byToken.delete(t); byRef.delete(r.ref); }
  }
  return {
    add(record) {
      prune();
      if (byToken.size >= MAX) throw new Error('store full');
      const token = crypto.randomBytes(16).toString('hex');
      const r = { ...record, token, createdAt: now() };
      byToken.set(token, r);
      byRef.set(r.ref, r);
      return r;
    },
    get(token) {
      if (!/^[a-f0-9]{32}$/.test(String(token || ''))) return null;
      const r = byToken.get(token);
      return r && r.createdAt >= now() - TTL ? r : null;
    },
    byRef: (ref) => byRef.get(ref) || null,
    size: () => byToken.size
  };
}

module.exports = { createStore, TTL };
