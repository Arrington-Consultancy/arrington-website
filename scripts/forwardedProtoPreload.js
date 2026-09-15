// Preload for HTTP suites run from INSIDE the container (see
// scripts/scottStagingCheckRunner.js).
//
// server.js forces HTTPS on any request that does not carry
// x-forwarded-proto: https. Railway's edge adds that header; a loopback
// request to 127.0.0.1 does not, so every request 301s before a route runs
// and a whole suite fails for a reason that has nothing to do with what it
// tests.
//
// This adds the header the edge would have added, and nothing else.
//
// WHY A PRELOAD RATHER THAN EDITING THE SUITES: test/scott/adversarialApi.js
// is a reviewed security artefact that calls fetch from a couple of dozen
// places with different header shapes. Threading an extra header through all
// of them is a large diff across exactly the file where a careless edit is
// most expensive, and it would leave the suites carrying a concern that
// belongs to the runner. This way both suites stay byte-for-byte what they
// were, and the emulation is one small file a reader can check in full.
//
// It is deliberately opt-in: with SCOTT_TEST_FORWARDED_PROTO unset this
// module does nothing at all, so it can never affect an ordinary test run.

const proto = (process.env.SCOTT_TEST_FORWARDED_PROTO || '').trim();

if (proto) {
  const realFetch = globalThis.fetch;

  globalThis.fetch = function patchedFetch(input, init) {
    const opts = init ? { ...init } : {};
    // Headers can arrive as a Headers instance, a plain object or an array
    // of pairs. Normalising through Headers handles all three, and leaves an
    // explicitly-set x-forwarded-proto alone: a test that sets the header
    // itself is testing something about the header, and must win.
    const headers = new Headers(opts.headers || undefined);
    if (!headers.has('x-forwarded-proto')) headers.set('x-forwarded-proto', proto);
    opts.headers = headers;
    return realFetch(input, opts);
  };
}
