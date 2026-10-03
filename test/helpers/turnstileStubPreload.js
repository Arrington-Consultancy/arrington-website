// Preload for the Owner Dependency Quiz notification suite
// (test/quizNotifications.test.js), loaded into the SERVER process with
// node --require. Opt-in: with QUIZ_TEST_TURNSTILE_STUB unset it does nothing.
//
// Why it exists: lib/turnstile.js verifies every completion against
// Cloudflare's siteverify endpoint, and the sandbox this suite runs in has
// no route to challenges.cloudflare.com, so without this every completion
// is refused before the code under test (the completion claim) is reached.
// The stub answers for that one URL only and behaves the way Cloudflare
// does on the two points the suite depends on: a token is accepted the
// FIRST time it is presented and refused as timeout-or-duplicate after
// that, and a token that does not start with "pass-" is refused. Every
// other fetch goes through untouched. Production code is not changed.

if ((process.env.QUIZ_TEST_TURNSTILE_STUB || '').trim() === 'true') {
  const realFetch = globalThis.fetch;
  const spent = new Set();

  globalThis.fetch = function stubbedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (!/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/.test(url)) {
      return realFetch(input, init);
    }
    const body = init && init.body;
    const token = body && typeof body.get === 'function' ? String(body.get('response') || '') : '';
    let payload;
    if (!token.startsWith('pass-')) {
      payload = { success: false, 'error-codes': ['invalid-input-response'] };
    } else if (spent.has(token)) {
      payload = { success: false, 'error-codes': ['timeout-or-duplicate'] };
    } else {
      spent.add(token);
      payload = { success: true };
    }
    return Promise.resolve(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }));
  };
}
