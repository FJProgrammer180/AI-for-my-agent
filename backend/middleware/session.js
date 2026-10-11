'use strict';
const db = require('../config/db');
const env = require('../config/env');
const { randomToken, sha256 } = require('../utils/crypto');
const { unauthorized, forbidden } = require('../utils/respond');

const COOKIE_NAME = 'finova_session';
const CSRF_COOKIE = 'finova_csrf';

async function createSession(res, userId, req) {
  const token = randomToken(32);
  const csrf = randomToken(16);
  const ttlMs = env.SESSION_TTL_HOURS * 3600 * 1000;
  await db.query(
    `INSERT INTO user_sessions (token_hash, user_id, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, now() + ($5 || ' hours')::interval)`,
    [sha256(token), userId, (req.headers['user-agent'] || '').slice(0, 300), req.ip, String(env.SESSION_TTL_HOURS)]
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    maxAge: ttlMs,
    path: '/',
  });
  res.cookie(CSRF_COOKIE, csrf, {
    httpOnly: false,
    sameSite: 'lax',
    secure: env.COOKIE_SECURE,
    maxAge: ttlMs,
    path: '/',
  });
  return { token, csrf };
}

async function destroySession(req, res) {
  if (req.sessionId) {
    await db.query('UPDATE user_sessions SET revoked_at = now() WHERE id = $1', [req.sessionId]);
  }
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
}

async function destroyAllSessions(userId, exceptSessionId = null) {
  if (exceptSessionId) {
    await db.query(
      'UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL',
      [userId, exceptSessionId]
    );
  } else {
    await db.query(
      'UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1) out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

/** Middleware: muat sesi (tidak memaksa login). */
async function attachSession(req, res, next) {
  try {
    const cookies = parseCookies(req);
    req.cookies = cookies;
    const token = cookies[COOKIE_NAME];
    if (!token) return next();
    const r = await db.query(
      `SELECT s.id AS session_id, s.user_id, s.expires_at, s.revoked_at,
              u.id, u.full_name, u.username, u.email, u.role, u.status,
              u.onboarding_completed_at, u.email_verified_at
       FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1`,
      [sha256(token)]
    );
    const row = r.rows[0];
    if (!row) return next();
    if (row.revoked_at || new Date(row.expires_at) < new Date() || row.status !== 'ACTIVE') return next();
    req.user = {
      id: row.id,
      fullName: row.full_name,
      username: row.username,
      email: row.email,
      role: row.role,
      onboardingCompleted: !!row.onboarding_completed_at,
      emailVerified: !!row.email_verified_at,
    };
    req.sessionId = row.session_id;
    // Perbarui last_seen secara berkala (maks. 1x / menit)
    await db.query(
      `UPDATE user_sessions SET last_seen_at = now()
       WHERE id = $1 AND last_seen_at < now() - interval '1 minute'`,
      [row.session_id]
    );
    next();
  } catch (err) {
    next(err);
  }
}

/** Middleware: wajib login. */
function requireAuth(req, res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

/** Middleware: wajib ADMIN. */
function requireAdmin(req, res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'ADMIN') return next(forbidden());
  next();
}

/**
 * Proteksi CSRF sederhana (double-submit cookie) untuk request mutasi.
 * Cookie finova_csrf harus dikirim ulang lewat header X-CSRF-Token.
 */
function csrfProtection(req, res, next) {
  const method = req.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return next();
  if (!req.user) return next(); // endpoint publik (login/register) pakai rate limit
  const cookieToken = req.cookies && req.cookies[CSRF_COOKIE];
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || cookieToken !== headerToken) {
    return next(new (require('../utils/respond').ApiError)(403, 'CSRF_FAILED', 'Permintaan tidak dapat diverifikasi. Muat ulang halaman.'));
  }
  next();
}

module.exports = {
  COOKIE_NAME,
  CSRF_COOKIE,
  createSession,
  destroySession,
  destroyAllSessions,
  attachSession,
  requireAuth,
  requireAdmin,
  csrfProtection,
  parseCookies,
};
