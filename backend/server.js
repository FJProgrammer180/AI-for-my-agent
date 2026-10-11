'use strict';
const { createApp } = require('./app');
const env = require('./config/env');
const db = require('./config/db');
const logger = require('./utils/logger');
const websocket = require('./websocket');
const jobs = require('./workers/scheduledJobs');

async function main() {
  const app = createApp();

  try {
    await db.health();
    logger.info('PostgreSQL terhubung.');
  } catch (err) {
    logger.error('PostgreSQL tidak dapat dihubungi. Jalankan `npm run migrate` dan periksa DATABASE_URL.', { error: logger.describe(err) });
  }

  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`FINOVA berjalan di ${env.PUBLIC_URL} (port ${env.PORT})`);
  });

  // Kanal realtime (notifikasi & sinyal harga) — opsional, tidak merusak saat putus
  websocket.handle = websocket.attach(server);

  // Pekerja terjadwal: penyegaran data pasar + evaluasi alert + akrual bunga
  jobs.start({ marketMinutes: 5, interestHours: 6 });

  const shutdown = async (signal) => {
    logger.info(`Menghentikan layanan (${signal}) ...`);
    try { websocket.handle?.close(); } catch (_) { /* diamkan */ }
    server.close(async () => {
      await db.pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
