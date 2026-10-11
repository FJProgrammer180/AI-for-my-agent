'use strict';
/**
 * Runner migrasi — dapat dipakai CLI (backend/scripts/migrate.js) maupun test.
 * File SQL diterapkan berurutan dan dicatat di schema_migrations.
 */
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'database', 'migrations');

function listMigrations() {
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

async function up(db, log = () => {}) {
  await ensureTable(db);
  const done = new Set(
    (await db.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version)
  );
  const applied = [];
  for (const file of listMigrations()) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    log(`menerapkan ${file}`);
    await db.query(sql);
    await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    applied.push(file);
  }
  return applied;
}

async function status(db) {
  await ensureTable(db);
  const done = new Set(
    (await db.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version)
  );
  return listMigrations().map((f) => ({ file: f, applied: done.has(f) }));
}

/**
 * Rollback penuh: menghapus seluruh tabel FINOVA (skema publik).
 * Hanya berjalan bila opts.force === true — mencegah penghapusan tidak sengaja.
 */
async function down(db, { force = false } = {}) {
  if (!force) throw new Error('Rollback memerlukan konfirmasi eksplisit (--force).');
  const tables = await db.query(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
  );
  const names = tables.rows.map((r) => r.tablename);
  if (names.length) {
    await db.query(`TRUNCATE ${names.map((n) => `"${n}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
  const files = listMigrations();
  if (files.length) {
    await db.query('DELETE FROM schema_migrations WHERE version = ANY($1::text[])', [files]);
  }
  return names;
}

module.exports = { up, down, status, listMigrations };
