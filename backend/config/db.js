'use strict';
const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function query(text, params) {
  return pool.query(text, params);
}

/** Jalankan fn(client) di dalam transaksi database. */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* abaikan */ }
    throw err;
  } finally {
    client.release();
  }
}

async function health() {
  const r = await pool.query('SELECT now() AS now');
  return r.rows[0].now;
}

module.exports = { pool, query, withTransaction, health };
