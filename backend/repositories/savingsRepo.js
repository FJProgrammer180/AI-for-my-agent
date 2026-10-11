'use strict';
const db = require('../config/db');

async function create(userId, data, client = db) {
  const r = await client.query(
    `INSERT INTO savings_goals
       (user_id, name, target_amount, currency, target_date, interest_rate, interest_method)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [userId, data.name, data.targetAmount, data.currency || 'IDR', data.targetDate || null,
     data.interestRate ?? null, data.interestMethod || null]
  );
  return r.rows[0];
}

async function listByUser(userId, { includeArchived = false } = {}) {
  const r = await db.query(
    `SELECT * FROM savings_goals WHERE user_id = $1
     ${includeArchived ? '' : "AND status <> 'ARCHIVED'"}
     ORDER BY created_at DESC`,
    [userId]
  );
  return r.rows;
}

async function findById(id) {
  const r = await db.query('SELECT * FROM savings_goals WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function findOwned(id, userId, client = db) {
  const r = await client.query('SELECT * FROM savings_goals WHERE id = $1 AND user_id = $2', [id, userId]);
  return r.rows[0] || null;
}

async function update(id, userId, data) {
  const r = await db.query(
    `UPDATE savings_goals SET
       name = COALESCE($3, name),
       target_amount = COALESCE($4, target_amount),
       target_date = COALESCE($5, target_date),
       interest_rate = COALESCE($6, interest_rate),
       interest_method = COALESCE($7, interest_method),
       updated_at = now()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [id, userId, data.name ?? null, data.targetAmount ?? null,
     data.targetDate ?? null, data.interestRate ?? null, data.interestMethod ?? null]
  );
  return r.rows[0] || null;
}

async function setStatus(id, userId, status) {
  const r = await db.query(
    'UPDATE savings_goals SET status = $3, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId, status]
  );
  return r.rows[0] || null;
}

async function history(goalId, userId, { limit = 50, offset = 0 } = {}) {
  const r = await db.query(
    `SELECT * FROM savings_transactions WHERE goal_id = $1 AND user_id = $2
     ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
    [goalId, userId, limit, offset]
  );
  return r.rows;
}

async function totalBalance(userId) {
  const r = await db.query(
    `SELECT COALESCE(sum(balance),0)::text AS total FROM savings_goals
     WHERE user_id = $1 AND status <> 'ARCHIVED'`,
    [userId]
  );
  return Number(r.rows[0].total);
}

module.exports = { create, listByUser, findById, findOwned, update, setStatus, history, totalBalance };
