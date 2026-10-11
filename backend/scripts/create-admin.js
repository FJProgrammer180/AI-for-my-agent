'use strict';
/**
 * Provisi akun administrator.
 * Tidak dapat dilakukan lewat registrasi publik — hanya lewat CLI ini atau fungsi
 * `provisionAdmin` (dipakai script dan test).
 */
const db = require('../config/db');
const userRepo = require('../repositories/userRepo');
const { hashPassword, validatePasswordStrength } = require('../utils/password');

async function provisionAdmin({ email, username, fullName, password }) {
  const strength = validatePasswordStrength(password);
  if (!strength.ok) throw new Error(strength.message);
  const existing = await userRepo.findByEmail(email);
  if (existing) {
    await userRepo.setRole(existing.id, 'ADMIN');
    return { created: false, id: existing.id, email };
  }
  const passwordHash = await hashPassword(password);
  const user = await userRepo.create({ fullName, username, email, passwordHash });
  await userRepo.setRole(user.id, 'ADMIN');
  await userRepo.markOnboardingComplete(user.id);
  return { created: true, id: user.id, email };
}

module.exports = { provisionAdmin };

// Jalankan sebagai CLI
if (require.main === module) {
  const logger = require('../utils/logger');
  const [email, username, fullName, password] = process.argv.slice(2);
  if (!email || !username || !fullName || !password) {
    console.error('Pemakaian: node backend/scripts/create-admin.js <email> <username> "<Nama>" "<password>"');
    process.exit(1);
  }
  (async () => {
    try {
      const r = await provisionAdmin({ email, username, fullName, password });
      logger.info(r.created ? 'Akun admin dibuat.' : 'Peran ADMIN diberikan ke akun yang sudah ada.', { email: r.email });
    } catch (err) {
      logger.error('Gagal membuat admin', { error: logger.describe(err) });
      process.exitCode = 1;
    } finally {
      await db.pool.end();
    }
  })();
}
