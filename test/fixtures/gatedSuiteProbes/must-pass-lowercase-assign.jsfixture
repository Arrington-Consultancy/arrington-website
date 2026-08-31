// Finding V3(b): the assign and delete suppressors were upper-case only,
// so this ordinary manipulation was reported as an undeclared gate.
const test = require('node:test');
test('sets and restores a lower-case key', () => {
  process.env.myFlag = 'x';
  delete process.env.myFlag;
});
