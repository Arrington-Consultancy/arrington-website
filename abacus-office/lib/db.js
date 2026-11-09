'use strict';

// This service's own connection pool. DATABASE_URL on the Railway service
// is a reference to the office's own Postgres (Postgres-bYAT), never the
// Arrington site's database.

const { Pool } = require('pg');

function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const internal = /railway\.internal|localhost|127\.0\.0\.1/.test(connectionString);
  const pool = new Pool({
    connectionString,
    ssl: internal ? false : { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    max: 8
  });
  pool.on('error', (err) => console.error('Abacus office database: idle client error', err.message));
  return pool;
}

module.exports = { createPool };
