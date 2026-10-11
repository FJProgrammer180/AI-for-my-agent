'use strict';
/**
 * Pengaturan database untuk test integrasi.
 *
 * Prioritas:
 *  1. DATABASE_URL nyata bila PostgreSQL dapat dihubungi.
 *  2. Fallback: PostgreSQL asli in-process via PGlite (WASM) + socket server,
 *     sehingga driver `pg`, migrasi SQL, transaksi, dan constraint diuji sungguhan.
 *
 * Semua dijalankan in-process (bukan subprocess) agar event loop tetap melayani
 * socket server PGlite.
 */
const { Pool } = require('pg');

async function probe(url) {
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 3000 });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (_) {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

/**
 * @returns {Promise<{url:string, kind:string, stop:Function}|null>}
 */
async function setup() {
  const realUrl = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finova';
  if (await probe(realUrl)) {
    return { url: realUrl, kind: 'postgres', async stop() {} };
  }
  let pgl;
  try {
    pgl = await require('./pglite').start();
  } catch (err) {
    return null;
  }
  if (!pgl) return null;
  return { url: pgl.url, kind: 'pglite', stop: pgl.stop };
}

module.exports = { setup, probe };
