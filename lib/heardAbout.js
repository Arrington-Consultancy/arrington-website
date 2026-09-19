'use strict';
// "How did you hear about us?" on the footer contact form (19/09/2026).
//
// Tom's ask: an optional question on the existing enquiry form, with a small
// optional box when someone picks Other, and the answer arriving with the
// rest of the enquiry so the real acquisition channel is recorded rather
// than guessed at.
//
// This module is the ONE place the six options are written down. The form
// renders from it, the route validates against it, and the notification
// email and the admin Leads panel both read their wording from it, so a
// stored value and the label a person sees can never drift apart. Adding or
// renaming an option is a single edit here.
//
// It is pure: no database, no request, no clock.
//
// NOTHING ARRIVING HERE IS TRUSTED. The selection is a visitor-supplied
// string, so it is matched against the allowlist by exact id and anything
// else is dropped rather than stored. The free-text box is plain text,
// stripped and capped, the same treatment as every other field on this
// form. Both are OPTIONAL: an empty answer is a normal submission, never an
// error, because the question is optional and a required-feeling optional
// field costs enquiries.
const sanitizeHtml = require('sanitize-html');

// Order is the order they appear in the dropdown. "Other" stays last,
// because it is the fallback rather than a choice of its own.
const OPTIONS = Object.freeze([
  { id: 'google_search', label: 'Google search' },
  { id: 'google_advert', label: 'Google advert' },
  { id: 'recommendation', label: 'Recommended by someone' },
  { id: 'social_media', label: 'Social media' },
  { id: 'ai_assistant', label: 'AI assistant, such as ChatGPT' },
  { id: 'other', label: 'Other' }
].map(Object.freeze));

const OTHER_ID = 'other';
const OTHER_MAX = 200;

// Null-prototype so a crafted id like "constructor" or "toString" cannot
// resolve through Object.prototype and be treated as a real option. Same
// shape as workspace governance finding T3 and the Scott ACTION_DOMAINS
// fix, both of which were exactly this.
const BY_ID = Object.freeze(Object.assign(Object.create(null),
  ...OPTIONS.map((o) => ({ [o.id]: o }))));

function plain(value, max) {
  return sanitizeHtml(String(value ?? ''), { allowedTags: [], allowedAttributes: {} })
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, max);
}

// Visitor input in, a clean pair out. Both fields are '' when nothing
// usable was sent, which is what an unanswered optional question looks like.
//
// The free text is kept ONLY alongside the Other option. That is deliberate
// and is the one rule here worth stating: without it, a submission could
// select "Google search" and still post arbitrary text into the record, so
// the stored answer would no longer mean what the dropdown says it means.
function parseHeardAbout(body) {
  const src = body && typeof body === 'object' ? body : {};
  const id = plain(src.heard_about, 40);
  const heardAbout = Object.hasOwn(BY_ID, id) ? id : '';
  const heardAboutOther = heardAbout === OTHER_ID ? plain(src.heard_about_other, OTHER_MAX) : '';
  return { heardAbout, heardAboutOther };
}

// One short phrase for the notification email and the admin Leads panel, or
// '' when the visitor did not answer. A stored id with no matching option
// (an old row after an option is renamed) reports nothing rather than
// printing a raw database value at Tom.
function describeHeardAbout(heardAbout, heardAboutOther) {
  const option = Object.hasOwn(BY_ID, String(heardAbout ?? '')) ? BY_ID[heardAbout] : null;
  if (!option) return '';
  const detail = plain(heardAboutOther, OTHER_MAX);
  // "Other" on its own says almost nothing, so the visitor's own words are
  // what gets shown when they gave any.
  if (option.id === OTHER_ID && detail) return `Other: ${detail}`;
  return option.label;
}

module.exports = {
  OPTIONS,
  OTHER_ID,
  OTHER_MAX,
  parseHeardAbout,
  describeHeardAbout
};
