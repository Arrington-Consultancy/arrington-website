'use strict';

// Seals the firm's mailbox token for the database (Tom, 10 November 2026:
// "We need the email api as well"). The token is issued when the firm's
// own staff connect their mailbox from Settings, so nobody copies it into
// a chat, an email or a variable: it goes straight from Google to this
// office, sealed with AES-256-GCM under ABACUS_OFFICE_TOKEN_KEY, which
// lives only in Railway. A copy of the database alone cannot open it.

const crypto = require('crypto');

const MIN_KEY = 32;

function keyFrom(env = process.env) {
  const raw = String(env.ABACUS_OFFICE_TOKEN_KEY || '').trim();
  if (raw.length < MIN_KEY) return null;
  return crypto.createHash('sha256').update(raw).digest();
}

const available = (env = process.env) => Boolean(keyFrom(env));

function seal(text, env = process.env) {
  const key = keyFrom(env);
  if (!key) throw new Error(`ABACUS_OFFICE_TOKEN_KEY must be set (${MIN_KEY} characters or more) before a mailbox can be connected`);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), body.toString('base64url')].join('.');
}

// -> the text, or null when there is nothing sealed, no key, or the seal
// does not open (a changed key, or a tampered value). Never throws.
function open(sealed, env = process.env) {
  const key = keyFrom(env);
  const parts = String(sealed || '').split('.');
  if (!key || parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64url'));
    d.setAuthTag(Buffer.from(parts[2], 'base64url'));
    return Buffer.concat([d.update(Buffer.from(parts[3], 'base64url')), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}

module.exports = { seal, open, available, MIN_KEY };
