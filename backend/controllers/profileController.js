'use strict';
const db = require('../config/db');
const userRepo = require('../repositories/userRepo');
const auditRepo = require('../repositories/auditRepo');
const session = require('../middleware/session');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../utils/password');
const { ok, badRequest } = require('../utils/respond');

async function getProfile(req, res, next) {
  try {
    const p = await userRepo.getProfile(req.user.id);
    ok(res, {
      user: {
        id: p.id, fullName: p.full_name, username: p.username, email: p.email,
        role: p.role, createdAt: p.created_at, lastLoginAt: p.last_login_at,
      },
      profile: {
        avatarUrl: p.avatar_url, currency: p.currency, timezone: p.timezone,
        notifyEmail: p.notify_email, notifyPush: p.notify_push,
        monthlyIncome: Number(p.monthly_income || 0),
      },
    });
  } catch (err) { next(err); }
}

async function updateProfile(req, res, next) {
  try {
    const p = await userRepo.updateProfile(req.user.id, req.body);
    ok(res, { profile: p });
  } catch (err) { next(err); }
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await userRepo.findById(req.user.id);
    const valid = await verifyPassword(user.password_hash, currentPassword);
    if (!valid) throw badRequest('Kata sandi saat ini tidak sesuai.');
    const strength = validatePasswordStrength(newPassword);
    if (!strength.ok) throw badRequest(strength.message);
    const newHash = await hashPassword(newPassword);
    await db.withTransaction(async (client) => {
      await userRepo.updatePassword(req.user.id, newHash, client);
      await auditRepo.record({
        actorId: req.user.id, actorRole: req.user.role, action: 'PASSWORD_CHANGED',
        entityType: 'user', entityId: req.user.id, ip: req.ip,
      }, client);
    });
    // Cabut semua sesi lain, pertahankan sesi aktif
    await session.destroyAllSessions(req.user.id, req.sessionId);
    ok(res, { changed: true });
  } catch (err) { next(err); }
}

async function listSessions(req, res, next) {
  try {
    const r = await db.query(
      `SELECT id, user_agent, ip, created_at, last_seen_at, expires_at
       FROM user_sessions
       WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY last_seen_at DESC`,
      [req.user.id]
    );
    ok(res, {
      sessions: r.rows.map((s) => ({
        id: s.id, userAgent: s.user_agent, ip: s.ip,
        createdAt: s.created_at, lastSeenAt: s.last_seen_at,
        current: s.id === req.sessionId,
      })),
    });
  } catch (err) { next(err); }
}

async function logoutAll(req, res, next) {
  try {
    await session.destroyAllSessions(req.user.id, null);
    res.clearCookie(session.COOKIE_NAME, { path: '/' });
    res.clearCookie(session.CSRF_COOKIE, { path: '/' });
    ok(res, { loggedOutAll: true });
  } catch (err) { next(err); }
}

async function revokeSession(req, res, next) {
  try {
    await db.query(
      `UPDATE user_sessions SET revoked_at = now()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
      [req.params.id, req.user.id]
    );
    ok(res, { revoked: true });
  } catch (err) { next(err); }
}

/** Permintaan penghapusan akun — menandai status DELETED dan mencabut sesi. */
async function deleteAccount(req, res, next) {
  try {
    const { password } = req.body || {};
    const user = await userRepo.findById(req.user.id);
    const valid = password ? await verifyPassword(user.password_hash, password) : false;
    if (!valid) throw badRequest('Konfirmasi kata sandi tidak sesuai.');
    await db.withTransaction(async (client) => {
      await client.query(`UPDATE users SET status = 'DELETED', updated_at = now() WHERE id = $1`, [req.user.id]);
      await client.query('UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1', [req.user.id]);
      await auditRepo.record({
        actorId: req.user.id, actorRole: req.user.role, action: 'ACCOUNT_DELETED',
        entityType: 'user', entityId: req.user.id, ip: req.ip,
      }, client);
    });
    res.clearCookie(session.COOKIE_NAME, { path: '/' });
    res.clearCookie(session.CSRF_COOKIE, { path: '/' });
    ok(res, { deleted: true });
  } catch (err) { next(err); }
}

module.exports = {
  getProfile, updateProfile, changePassword, listSessions,
  logoutAll, revokeSession, deleteAccount,
};
