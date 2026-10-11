'use strict';
/**
 * Mode demo/pratinjau: menjalankan aplikasi dengan PostgreSQL nyata yang berjalan
 * di dalam proses (PGlite — PostgreSQL yang dikompilasi ke WASM) dan disimpan di
 * folder .finova-demo-db sehingga data bertahan antar-restart.
 *
 * Gunakan ini untuk mencoba FINOVA tanpa memasang server PostgreSQL.
 * Untuk produksi, jalankan PostgreSQL sungguhan (lihat docker-compose.yml) lalu
 * gunakan `npm run start`.
 *
 * Catatan: kanal data pasar memakai snapshot lokal berlabel "contoh", dan modul
 * Rekening memakai koneksi demo berlabel — tidak ada angka bank yang dikarang.
 */
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', '..', '.finova-demo-db');

(async () => {
  let PGlite, socketMod;
  try {
    ({ PGlite } = require('@electric-sql/pglite'));
    socketMod = require('@electric-sql/pglite-socket');
  } catch (_) {
    console.error('Mode demo memerlukan dependensi dev `@electric-sql/pglite`.\n'
      + 'Jalankan `npm install` atau gunakan PostgreSQL biasa + `npm run dev`.');
    process.exit(1);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const port = parseInt(process.env.DEMO_DB_PORT || '55432', 10);
  const db = await PGlite.create(DATA_DIR);
  const server = new socketMod.PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 8 });
  await server.start();

  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;
  // PGlite memproses satu kueri pada satu waktu: satu koneksi pool menghindari
  // interleaving transaksi.
  process.env.DATABASE_POOL_MAX = '1';
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';

  const dbcfg = require('../config/db');
  const runner = require('../services/migrationRunner');
  const applied = await runner.up(dbcfg);
  console.log(applied.length ? `Migrasi diterapkan: ${applied.join(', ')}` : 'Skema database siap (tidak ada migrasi baru).');

  try {
    await require('./seed').runSeed();
    console.log('Seed data contoh (tarif & snapshot pasar) siap.');
  } catch (err) {
    console.warn('Seed dilewati:', err.message);
  }

  const env = require('../config/env');

  // Akun admin opsional untuk pratinjau lokal. Dinonaktifkan kecuali diminta
  // eksplisit (DEMO_ADMIN=1); kata sandi dibuat acak dan hanya dicetak sekali.
  // Jalur produksi tetap memakai: node backend/scripts/create-admin.js
  if (process.env.DEMO_ADMIN === '1') {
    const { randomBytes } = require('node:crypto');
    const { provisionAdmin } = require('./create-admin');
    // Password acak yang selalu memenuhi kebijakan kekuatan
    // (huruf besar + huruf kecil + angka, panjang ≥ 8).
    const password = 'Aa1' + randomBytes(7).toString('base64url').replace(/[^A-Za-z0-9]/g, 'x');
    const email = process.env.DEMO_ADMIN_EMAIL || 'admin@localhost.local';
    try {
      const res = await provisionAdmin({ email, username: 'admin_demo', fullName: 'Admin Demo', password });
      if (res.created) {
        console.log(`  Akun admin demo → email: ${email}  kata sandi: ${password}`);
      } else {
        console.log(`  Akun admin demo sudah ada → email: ${email} (kata sandi tidak diubah)`);
      }
    } catch (err) {
      console.warn('  Pembuatan admin demo gagal:', err.message);
    }
  }

  require('../server');
  console.log('');
  console.log('  FINOVA (mode demo) — buka ' + (env.PUBLIC_URL || `http://localhost:${env.PORT}`));
  console.log('  Buat akun lewat halaman /register. Akun admin: jalankan');
  console.log('    node backend/scripts/create-admin.js <email> <username> "<Nama>" "<password>"');
  console.log('');

  const stop = async () => {
    try { await server.stop(); } catch (_) { /* diamkan */ }
    try { await db.close(); } catch (_) { /* diamkan */ }
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((err) => {
  console.error('Gagal menjalankan mode demo:', err.message);
  process.exit(1);
});
