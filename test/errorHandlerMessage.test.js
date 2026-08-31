// Central error handler's message selection (server.js, the last
// middleware). Found 31/08/2026: a genuine CSRF rejection (403,
// EBADCSRFTOKEN — an expired or stale session/page, not a server fault)
// rendered to the visitor as the bare text "Internal server error", with
// no styling, indistinguishable from a real crash. The masking was
// applied by status-agnostic isProd check alone, hiding err.message on
// every error regardless of whether that message was actually sensitive.
//
// Replicated here rather than imported, same reason as canonicalHost.test.js:
// server.js binds a port and opens a DB pool on require. This is a small,
// stable rule; if the real one changes, this must change with it.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

function resolveErrorMessage(err, isProd) {
  const status = err.status || err.statusCode || 500;
  const isClientError = status >= 400 && status < 500;
  if (err.code === 'EBADCSRFTOKEN') {
    return 'Your session or this page has expired. Please reload the page and try again.';
  }
  if (isProd && !isClientError) {
    return 'Internal server error';
  }
  return err.message;
}

describe('central error handler message selection', () => {
  test('a CSRF token error gets a clear, actionable message, not the generic 500 text', () => {
    const err = { status: 403, code: 'EBADCSRFTOKEN', message: 'invalid csrf token' };
    assert.equal(resolveErrorMessage(err, true), 'Your session or this page has expired. Please reload the page and try again.');
  });

  test('a genuine 500 in production is still masked (the property this handler exists to protect)', () => {
    const err = { message: 'connection to database failed at 10.0.0.4:5432' };
    assert.equal(resolveErrorMessage(err, true), 'Internal server error');
  });

  test('an ordinary 4xx validation error is shown verbatim in production, since it is never sensitive', () => {
    const err = { status: 400, message: 'Username must be at least 2 characters' };
    assert.equal(resolveErrorMessage(err, true), 'Username must be at least 2 characters');
  });

  test('outside production, the real message is always shown for debugging', () => {
    const err = { message: 'connection to database failed' };
    assert.equal(resolveErrorMessage(err, false), 'connection to database failed');
  });
});
