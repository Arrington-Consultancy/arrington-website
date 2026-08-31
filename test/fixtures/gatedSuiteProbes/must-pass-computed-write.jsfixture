// Sets and deletes env keys by computed name as part of a test. Five real
// suites here do this; flagging them was the false positive U4's
// narrowing deliberately avoided.
const test = require('node:test');
test('sets a key by computed name', () => {
  const name = 'WS_' + 'THING';
  process.env[name] = 'x';
  delete process.env[name];
});
