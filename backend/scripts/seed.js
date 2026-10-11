'use strict';
/**
 * Seed: menerapkan berkas SQL di database/seeds lalu menyegarkan aset pasar
 * dari penyedia data aktif (snapshot lokal kecuali dikonfigurasi lain).
 * Aman dijalankan berulang.
 */
const fs = require('node:fs');
const path = require('node:path');
const db = require('../config/db');
const marketService = require('../services/marketService');

const SEEDS_DIR = path.join(__dirname, '..', '..', 'database', 'seeds');

async function runSeed() {
  let sqlFiles = 0;
  if (fs.existsSync(SEEDS_DIR)) {
    for (const file of fs.readdirSync(SEEDS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
      await db.query(fs.readFileSync(path.join(SEEDS_DIR, file), 'utf8'));
      sqlFiles++;
    }
  }
  const market = await marketService.refreshFromProvider();
  return { sqlFiles, market };
}

module.exports = { runSeed };

if (require.main === module) {
  (async () => {
    const logger = require('../utils/logger');
    try {
      const r = await runSeed();
      logger.info('Seed selesai', r);
    } catch (err) {
      logger.error('Seed gagal', { error: logger.describe(err) });
      process.exitCode = 1;
    } finally {
      await db.pool.end();
    }
  })();
}
