const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Without this, a database that accepts no connections leaves requests waiting
  // on the OS TCP timeout (~2 min) instead of failing, so pages hang rather than
  // erroring. Seen 15/07/2026 when a Railway restart left Postgres wedged.
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

// An idle client erroring (DB restart, network drop) emits on the pool. Without a
// listener this reaches uncaughtException and takes the process down.
pool.on('error', (err) => {
  console.error('Postgres pool error (idle client):', err.message);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
