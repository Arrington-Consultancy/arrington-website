const test = require('node:test');
const env = process.env;
if (env.runLiveThing) {
  test('costs money', () => {});
}
