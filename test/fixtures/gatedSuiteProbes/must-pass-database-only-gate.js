const test = require('node:test');
// Gated only on the database. A developer without one knows it, and this
// is not an absence anyone has mistaken for coverage.
// To run this, set DATABASE_URL.
if (!process.env.DATABASE_URL) {
  test('nothing to do without a database', { skip: true }, () => {});
} else {
  test('does something', () => {});
}
