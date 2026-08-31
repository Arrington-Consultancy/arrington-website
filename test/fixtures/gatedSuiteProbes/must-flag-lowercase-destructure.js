// The destructure shape in lower case. Invisible to the runner too,
// because a test that never registers emits nothing.
const test = require('node:test');
const { runLiveThing } = process.env;
if (runLiveThing) {
  test('costs money', () => {});
}
