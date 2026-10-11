'use strict';
const db = require('../config/db');

const CATEGORIES = ['FOOD','TRANSPORT','EDUCATION','SHOPPING','BILLS','SALARY','SAVINGS','INTEREST','INSTALLMENTS','TRANSFERS','OTHER'];

async function create(userId, d, client = db) {
  const r = await client.query(
    `INSERT INTO financial_transactions
       (user_id, type, category, amount, currency, occurred_at, description, source, bank_account_id, external_ref, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6::timestamptz, now()),$7,$8,$9,$10,$11) RETURNING *`,
    [userId, d.type, d.category || 'OTHER', d.amount, d.currency || 'IDR', d.occurredAt || null,
     d.description || null, d.source || 'MANUAL', d.bankAccountId || null, d.externalRef || null,
     d.idempotencyKey || null]
  );
  return r.rows[0];
}

async function list(userId, { q, from, to, category, type, source, limit = 25, offset = 0 }) {
  const conds = ['user_id = $1'];
  const params = [userId];
  if (q) { params.push(`%${q}%`); conds.push(`(description ILIKE $${params.length})`); }
  if (from) { params.push(from); conds.push(`occurred_at >= $${params.length}::timestamptz`); }
  if (to) { params.push(to); conds.push(`occurred_at <= $${params.length}::timestamptz`); }
  if (category) { params.push(category); conds.push(`category = $${params.length}`); }
  if (type) { params.push(type); conds.push(`type = $${params.length}`); }
  if (source) { params.push(source); conds.push(`source = $${params.length}`); }
  params.push(limit, offset);
  const where = 'WHERE ' + conds.join(' AND ');
  const r = await db.query(
    `SELECT * FROM financial_transactions ${where}
     ORDER BY occurred_at DESC, created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const c = await db.query(
    `SELECT count(*)::int AS n FROM financial_transactions ${where.replace(`LIMIT $${params.length - 1} OFFSET $${params.length}`, '')}`,
    params.slice(0, params.length - 2)
  );
  return { rows: r.rows, total: c.rows[0].n };
}

async function findOwned(id, userId) {
  const r = await db.query('SELECT * FROM financial_transactions WHERE id = $1 AND user_id = $2', [id, userId]);
  return r.rows[0] || null;
}

async function monthlySummary(userId, months = 6) {
  const r = await db.query(
    `SELECT to_char(date_trunc('month', occurred_at), 'YYYY-MM') AS month,
            sum(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END)::text AS income,
            sum(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END)::text AS expense
     FROM financial_transactions
     WHERE user_id = $1 AND occurred_at >= date_trunc('month', now()) - ($2 || ' months')::interval
     GROUP BY 1 ORDER BY 1`,
    [userId, String(months - 1)]
  );
  return r.rows;
}

async function categorySummary(userId, { from, to } = {}) {
  const params = [userId];
  let extra = '';
  if (from) { params.push(from); extra += ` AND occurred_at >= $${params.length}::timestamptz`; }
  if (to) { params.push(to); extra += ` AND occurred_at <= $${params.length}::timestamptz`; }
  const r = await db.query(
    `SELECT category, sum(amount)::text AS total, count(*)::int AS count
     FROM financial_transactions
     WHERE user_id = $1 AND type = 'EXPENSE' ${extra}
     GROUP BY category ORDER BY sum(amount) DESC`,
    params
  );
  return r.rows;
}

module.exports = { CATEGORIES, create, list, findOwned, monthlySummary, categorySummary };
