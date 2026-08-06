// Short, human-readable reference codes (e.g. "ARR-724193") for records a
// visitor or Tom might need to read aloud, type into an email, or search
// for quickly — used first for the Commercial Gaps Review recovery flow.
// Deliberately not derived from the row's own serial id: a random code
// doesn't reveal how many submissions have ever been made.
const db = require('../db/pool');

const MIN = 100000;
const MAX = 999999;

function randomCode() {
  return `ARR-${Math.floor(Math.random() * (MAX - MIN + 1)) + MIN}`;
}

// Generates a code guaranteed not to collide with an existing row in the
// given table/column, retrying on the rare clash. Capped attempts so a
// pathological run of collisions fails loudly rather than looping forever.
async function generateUniqueShortReference(table, column) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomCode();
    const { rows } = await db.query(
      `SELECT 1 FROM ${table} WHERE ${column} = $1`,
      [candidate]
    );
    if (rows.length === 0) return candidate;
  }
  throw new Error(`Could not generate a unique short reference for ${table}.${column} after 10 attempts`);
}

module.exports = { generateUniqueShortReference };
