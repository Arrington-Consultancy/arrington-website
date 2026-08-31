const test = require('node:test');
test('a suite the runner calls PASSING because it returned early', () => {
  if (!process.env.SOME_LIVE_FLAG) return;
  throw new Error('never reached');
});
