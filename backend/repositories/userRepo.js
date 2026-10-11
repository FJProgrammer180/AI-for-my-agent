'use strict';
const db = require('../config/db');

async function create({ fullName, username, email, passwordHash }, client = db) {
  const r = await client.query(
    `INSERT INTO users (full_name, username, email, password_hash)
     VALUES ($1,$2,$3,$4) RETURNING id, full_name, username, email, role, status, created_at`,
    [fullName, username, email, passwordHash]
  );
  await client.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [r.rows[0].id]);
  return r.rows[0];
}

async function findByEmail(email) {
  const r = await db.query('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
  return r.rows[0] || null;
}

async function findByUsername(username) {
  const r = await db.query('SELECT * FROM users WHERE lower(username) = lower($1)', [username]);
  return r.rows[0] || null;
}

async function findById(id) {
  const r = await db.query('SELECT * FROM users WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function getProfile(userId) {
  const r = await db.query(
    `SELECT u.id, u.full_name, u.username, u.email, u.role, u.status,
            u.email_verified_at, u.onboarding_completed_at, u.last_login_at, u.created_at,
            p.avatar_url, p.currency, p.timezone, p.notify_email, p.notify_push, p.monthly_income
     FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [userId]
  );
  return r.rows[0] || null;
}

async function updateProfile(userId, { fullName, avatarUrl, currency, timezone, notifyEmail, notifyPush, monthlyIncome }, client = db) {
  await client.query(
    `UPDATE users SET full_name = COALESCE($2, full_name), updated_at = now() WHERE id = $1`,
    [userId, fullName || null]
  );
  const r = await client.query(
    `UPDATE user_profiles SET
       avatar_url = COALESCE($2, avatar_url),
       currency = COALESCE($3, currency),
       timezone = COALESCE($4, timezone),
       notify_email = COALESCE($5, notify_email),
       notify_push = COALESCE($6, notify_push),
       monthly_income = COALESCE($7, monthly_income),
       updated_at = now()
     WHERE user_id = $1 RETURNING *`,
    [userId, avatarUrl ?? null, currency ?? null, timezone ?? null, notifyEmail ?? null, notifyPush ?? null, monthlyIncome ?? null]
  );
  return r.rows[0];
}

async function markOnboardingComplete(userId, client = db) {
  await client.query('UPDATE users SET onboarding_completed_at = now(), updated_at = now() WHERE id = $1', [userId]);
}

async function updatePassword(userId, passwordHash, client = db) {
  await client.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [userId, passwordHash]);
}

async function touchLastLogin(userId) {
  await db.query('UPDATE users SET last_login_at = now() WHERE id = $1', [userId]);
}

async function listUsers({ limit = 50, offset = 0, q = null }) {
  const params = [];
  let where = '';
  if (q) {
    params.push(`%${q}%`);
    where = `WHERE u.email ILIKE $1 OR u.full_name ILIKE $1 OR u.username ILIKE $1`;
  }
  params.push(limit, offset);
  const r = await db.query(
    `SELECT u.id, u.full_name, u.username, u.email, u.role, u.status, u.created_at, u.last_login_at,
            u.onboarding_completed_at
     FROM users u ${where} ORDER BY u.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const c = await db.query(`SELECT count(*)::int AS n FROM users u ${where}`, q ? [params[0]] : []);
  return { rows: r.rows, total: c.rows[0].n };
}

async function setStatus(userId, status, client = db) {
  await client.query('UPDATE users SET status = $2, updated_at = now() WHERE id = $1', [userId, status]);
}

async function setRole(userId, role, client = db) {
  await client.query('UPDATE users SET role = $2, updated_at = now() WHERE id = $1', [userId, role]);
}

module.exports = {
  create, findByEmail, findByUsername, findById, getProfile, updateProfile,
  markOnboardingComplete, updatePassword, touchLastLogin, listUsers, setStatus, setRole,
};
