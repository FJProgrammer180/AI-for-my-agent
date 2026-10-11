'use strict';
/**
 * CLI migrasi.
 *   node backend/scripts/migrate.js        -> terapkan migrasi yang belum jalan
 *   node backend/scripts/migrate.js status      -> tampilkan status
 *   node backend/scripts/migrate.js down --force -> kosongkan seluruh tabel (rollback data & versi)
 */
const db = require('../config/db');
const logger = require('../utils/logger');
const runner = require('../services/migrationRunner');

(async () => {
  try {
    const cmd = process.argv[2] || 'up';
    if (cmd === 'down') {
      const force = process.argv.includes('--force');
      const dropped = await runner.down(db, { force });
      logger.info(`Rollback: ${dropped.length} tabel dikosongkan & versi migrasi dihapus.`);
    } else if (cmd === 'status') {
      for (const s of await runner.status(db)) console.log(`${s.applied ? '[x]' : '[ ]'} ${s.file}`);
    } else {
      const applied = await runner.up(db, (m) => logger.info(m));
      logger.info(applied.length ? `Migrasi selesai (${applied.length} berkas).` : 'Tidak ada migrasi baru.');
    }
  } catch (err) {
    logger.error('Migrasi gagal', { error: logger.describe(err) });
    process.exitCode = 1;
  } finally {
    await db.pool.end();
  }
})();
