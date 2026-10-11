'use strict';
const db = require('../config/db');
const env = require('../config/env');
const userRepo = require('../repositories/userRepo');
const auditRepo = require('../repositories/auditRepo');
const { hashPassword, verifyPassword, validatePasswordStrength } = require('../utils/password');
const { randomToken, sha256 } = require('../utils/crypto');
const { ok, conflict, badRequest, unauthorized } = require('../utils/respond');
const session = require('../middleware/session');

const GENERIC_AUTH_ERROR = 'Email/nama pengguna atau kata sandi salah.';

async function register(req, res, next) {
  try {
    const { fullName, username, email, password } = req.body;
    const strength = validatePasswordStrength(password);
    if (!strength.ok) throw badRequest(strength.message);

    const existingEmail = await userRepo.findByEmail(email);
    if (existingEmail) throw conflict('Email sudah terdaftar.');
    const existingUsername = await userRepo.findByUsername(username);
    if (existingUsername) throw conflict('Nama pengguna sudah dipakai.');

    const passwordHash = await hashPassword(password);
    const user = await db.withTransaction(async (client) => {
      const u = await userRepo.create({ fullName, username, email, passwordHash }, client);
      await auditRepo.record({
        actorId: u.id, actorRole: 'USER', action: 'USER_REGISTERED', entityType: 'user', entityId: u.id, ip: req.ip,
      }, client);
      return u;
    });

    // Token verifikasi email (kedaluwarsa 24 jam). Tanpa layanan email, tautan
    // hanya ditampilkan pada mode pengembangan.
    const verifyToken = randomToken(32);
    await db.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '24 hours')`,
      [user.id, sha256(verifyToken)]
    );

    await session.createSession(res, user.id, req);
    await userRepo.touchLastLogin(user.id);
    const data = {
      user: {
        id: user.id, fullName: user.full_name, username: user.username, email: user.email,
        role: user.role, onboardingCompleted: false, emailVerified: false,
      },
      greeting: `${user.full_name}, selamat datang.`,
      verificationRequired: true,
    };
    if (!env.IS_PROD) data.devVerifyUrl = `/verify-account?token=${verifyToken}`;
    ok(res, data, 201);
  } catch (err) { next(err); }
}

async function login(req, res, next) {
  try {
    const { identifier, password } = req.body;
    let user = await userRepo.findByEmail(identifier);
    if (!user) user = await userRepo.findByUsername(identifier);
    const valid = user ? await verifyPassword(user.password_hash, password) : false;
    if (!user || !valid) throw unauthorized(GENERIC_AUTH_ERROR);
    if (user.status !== 'ACTIVE') throw unauthorized('Akun ini sedang tidak aktif. Hubungi dukungan FINOVA.');

    await session.createSession(res, user.id, req);
    await userRepo.touchLastLogin(user.id);
    await auditRepo.record({
      actorId: user.id, actorRole: user.role, action: 'USER_LOGIN', entityType: 'user', entityId: user.id, ip: req.ip,
    });

    const firstLogin = !user.onboarding_completed_at;
    ok(res, {
      user: {
        id: user.id, fullName: user.full_name, username: user.username, email: user.email,
        role: user.role, onboardingCompleted: !firstLogin,
      },
      greeting: firstLogin ? `${user.full_name}, selamat datang.` : `${user.full_name}, selamat datang lagi :)`,
      firstLogin,
    });
  } catch (err) { next(err); }
}

async function logout(req, res, next) {
  try {
    await session.destroySession(req, res);
    ok(res, { loggedOut: true });
  } catch (err) { next(err); }
}

async function me(req, res, next) {
  try {
    if (!req.user) return ok(res, { authenticated: false, user: null });
    const profile = await userRepo.getProfile(req.user.id);
    ok(res, {
      authenticated: true,
      user: {
        id: req.user.id,
        fullName: profile.full_name,
        username: profile.username,
        email: profile.email,
        role: profile.role,
        onboardingCompleted: !!profile.onboarding_completed_at,
        emailVerified: !!profile.email_verified_at,
        profile: {
          avatarUrl: profile.avatar_url,
          currency: profile.currency,
          timezone: profile.timezone,
          notifyEmail: profile.notify_email,
          notifyPush: profile.notify_push,
          monthlyIncome: Number(profile.monthly_income || 0),
        },
      },
    });
  } catch (err) { next(err); }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    const user = await userRepo.findByEmail(email);
    // Selalu jawab sukses generik agar tidak membocorkan keberadaan akun.
    if (user) {
      const token = randomToken(32);
      await db.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '1 hour')`,
        [user.id, sha256(token)]
      );
      await auditRepo.record({ actorId: user.id, action: 'PASSWORD_RESET_REQUESTED', entityType: 'user', entityId: user.id, ip: req.ip });
      // Tanpa layanan email: tautan reset ditampilkan hanya pada mode pengembangan.
      const data = { message: 'Jika email terdaftar, tautan atur ulang kata sandi telah dibuat.' };
      if (!env.IS_PROD) {
        data.devResetUrl = `/reset-password?token=${token}`;
      }
      return ok(res, data);
    }
    ok(res, { message: 'Jika email terdaftar, tautan atur ulang kata sandi telah dibuat.' });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    const strength = validatePasswordStrength(password);
    if (!strength.ok) throw badRequest(strength.message);
    const r = await db.query(
      `SELECT * FROM password_reset_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [sha256(token)]
    );
    const row = r.rows[0];
    if (!row) throw badRequest('Tautan atur ulang tidak valid atau sudah kedaluwarsa.');
    const passwordHash = await hashPassword(password);
    await db.withTransaction(async (client) => {
      await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [row.id]);
      await userRepo.updatePassword(row.user_id, passwordHash, client);
      await client.query('UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1', [row.user_id]);
      await auditRepo.record({ actorId: row.user_id, action: 'PASSWORD_RESET_COMPLETED', entityType: 'user', entityId: row.user_id, ip: req.ip }, client);
    });
    ok(res, { message: 'Kata sandi berhasil diperbarui. Silakan masuk kembali.' });
  } catch (err) { next(err); }
}

async function verifyEmail(req, res, next) {
  try {
    const { token } = req.body;
    const r = await db.query(
      `SELECT * FROM email_verification_tokens
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [sha256(token)]
    );
    const row = r.rows[0];
    if (!row) throw badRequest('Tautan verifikasi tidak valid atau sudah kedaluwarsa.');
    await db.withTransaction(async (client) => {
      await client.query('UPDATE email_verification_tokens SET used_at = now() WHERE id = $1', [row.id]);
      await client.query(
        'UPDATE users SET email_verified_at = now(), updated_at = now() WHERE id = $1 AND email_verified_at IS NULL',
        [row.user_id]
      );
      await auditRepo.record({
        actorId: row.user_id, action: 'EMAIL_VERIFIED', entityType: 'user', entityId: row.user_id, ip: req.ip,
      }, client);
    });
    ok(res, { verified: true, message: 'Email berhasil diverifikasi.' });
  } catch (err) { next(err); }
}

async function resendVerification(req, res, next) {
  try {
    const { email } = req.body;
    const user = await userRepo.findByEmail(email);
    if (user && !user.email_verified_at) {
      const token = randomToken(32);
      await db.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + interval '24 hours')`,
        [user.id, sha256(token)]
      );
      const data = { message: 'Tautan verifikasi baru telah dibuat bila email terdaftar & belum diverifikasi.' };
      if (!env.IS_PROD) data.devVerifyUrl = `/verify-account?token=${token}`;
      return ok(res, data);
    }
    ok(res, { message: 'Tautan verifikasi baru telah dibuat bila email terdaftar & belum diverifikasi.' });
  } catch (err) { next(err); }
}

module.exports = { register, login, logout, me, forgotPassword, resetPassword, verifyEmail, resendVerification };
