const test = require('node:test');
const key = 'RUN_' + 'LIVE';
if (process.env[key]) {
  test('costs money', () => {});
}
