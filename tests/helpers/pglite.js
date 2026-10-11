'use strict';
/**
 * Helper test: menyediakan PostgreSQL nyata (PGlite/WASM) yang dapat diakses
 * lewat driver `pg` melalui socket server, sehingga seluruh lapisan aplikasi
 * (pool, migrasi, transaksi, SQL asli) diuji persis seperti di production.
 *
 * Dipakai hanya oleh test — tidak menyentuh kode produksi.
 */
async function start() {
  let PGlite, mod;
  try {
    ({ PGlite } = require('@electric-sql/pglite'));
    mod = require('@electric-sql/pglite-socket');
  } catch (_) {
    return null; // dependensi test opsional tidak terpasang
  }
  const db = await PGlite.create();
  const server = new mod.PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 24 });
  await server.start();
  const conn = server.getServerConn(); // mis. socket:/127.0.0.1:xxxx
  const m = String(conn).match(/(\d+\.\d+\.\d+\.\d+):(\d+)/);
  if (!m) { await server.stop(); await db.close(); return null; }
  return {
    db,
    server,
    url: `postgres://postgres:postgres@${m[1]}:${m[2]}/postgres`,
    async stop() {
      await server.stop().catch(() => {});
      await db.close().catch(() => {});
    },
  };
}

module.exports = { start };
