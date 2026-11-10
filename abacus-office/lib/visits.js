'use strict';

// Who has been in, and what they did (Tom, 10 November 2026: "Let's find
// out what dan does when he logs on"). Each page opened and each button
// pressed becomes one plain line on the person's visit. Background requests
// (the live refresh, assets) are not activity and record nothing.

const PAGES = {
  '/': 'Today',
  '/inbox': 'the inbox',
  '/complaints': 'Complaints',
  '/council': 'Council',
  '/write': 'Write',
  '/activity': 'Activity',
  '/users': 'Users',
  '/settings': 'Settings',
  '/account': 'their account'
};

const ACTIONS = {
  approve: 'approved the reply', draft: 'saved a draft', guide: 'guided the AI', note: 'added a note',
  take: 'took it', assign: 'reassigned it', status: 'changed its status', read: 'asked the AI to read it again',
  'pass-up': 'passed it up to a manager', holding: 'saved the holding reply', book: 'booked it into dispatch',
  'cancel-booking': 'cancelled the booking', 'dispatch-status': 'checked the dispatch status', company: 'moved it to another company',
  save: 'saved changes', discard: 'discarded it'
};

// The background requests a page makes on its own. They are not a person
// doing anything, and an open tab would otherwise keep a visit alive.
function isBackground(req) {
  return /\.json$/.test(req.path) || req.path === '/health' || req.path === '/robots.txt' || req.path === '/favicon.ico';
}

function describe(method, path, query = {}) {
  const p = String(path || '/').replace(/\/+$/, '') || '/';
  let m;
  if (method === 'GET') {
    if (PAGES[p]) return `opened ${PAGES[p]}${query.show ? ` (${String(query.show).slice(0, 20)})` : ''}`;
    if ((m = p.match(/^\/case\/(\d+)$/))) return `opened email ${m[1]}`;
    if ((m = p.match(/^\/write\/(\d+)$/))) return `opened draft ${m[1]}`;
    return `opened ${p.slice(0, 80)}`;
  }
  if ((m = p.match(/^\/case\/(\d+)\/([a-z-]+)$/))) return `email ${m[1]}: ${ACTIONS[m[2]] || m[2]}`;
  if ((m = p.match(/^\/write\/(\d+)\/([a-z-]+)$/))) return `draft ${m[1]}: ${ACTIONS[m[2]] || m[2]}`;
  if (p === '/write') return 'asked the AI to draft an email';
  if (p === '/inbox/sync') return 'checked the mailbox';
  if (p === '/account/password') return 'changed their password';
  return `pressed a button (${p.slice(0, 80)})`;
}

function minutes(v) {
  const end = new Date(v.ended_at || v.last_at); const start = new Date(v.started_at);
  return Math.max(0, Math.round((end - start) / 60000));
}

const ukTime = (d) => new Date(d).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// One line for the server log when a visit closes, so the visit can be read
// from Railway without opening the office.
function summaryLine(v) {
  const pages = Array.isArray(v.pages) ? v.pages : [];
  const what = pages.map((x) => x.what).filter((x) => x !== 'signed in').slice(0, 40).join('; ');
  return `Abacus office visit: ${v.user_name}, ${ukTime(v.started_at)}, ${minutes(v)} min, ${pages.length} step(s), ended ${v.ended_how || 'open'}${what ? `: ${what}` : ''}`;
}

module.exports = { describe, isBackground, summaryLine, minutes, ukTime };
