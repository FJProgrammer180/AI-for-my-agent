'use strict';
const db = require('../config/db');

async function create(userId, d, client = db) {
  const r = await client.query(
    `INSERT INTO installments
       (user_id, name, principal, down_payment, interest_rate, tenor_months, start_date, due_day, method)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [userId, d.name, d.principal, d.downPayment || 0, d.interestRate || 0,
     d.tenorMonths, d.startDate, d.dueDay || 1, d.method || 'FLAT']
  );
  return r.rows[0];
}

async function insertSchedule(installmentId, userId, rows, client = db) {
  for (const row of rows) {
    await client.query(
      `INSERT INTO installment_payments
         (installment_id, user_id, period_no, due_date, amount_due, principal_part, interest_part)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [installmentId, userId, row.periodNo, row.dueDate, row.amountDue, row.principalPart, row.interestPart]
    );
  }
}

async function listByUser(userId) {
  const r = await db.query(
    `SELECT i.*,
       (SELECT COALESCE(sum(amount_paid),0) FROM installment_payments p
         WHERE p.installment_id = i.id AND p.status = 'PAID') AS total_paid,
       (SELECT min(due_date) FROM installment_payments p
         WHERE p.installment_id = i.id AND p.status <> 'PAID') AS next_due_date,
       (SELECT amount_due FROM installment_payments p
         WHERE p.installment_id = i.id ORDER BY period_no ASC LIMIT 1) AS first_amount_due,
       (SELECT count(*)::int FROM installment_payments p
         WHERE p.installment_id = i.id AND p.status = 'PAID') AS paid_periods
     FROM installments i WHERE i.user_id = $1 ORDER BY i.created_at DESC`,
    [userId]
  );
  return r.rows;
}

async function findOwned(id, userId) {
  const r = await db.query('SELECT * FROM installments WHERE id = $1 AND user_id = $2', [id, userId]);
  return r.rows[0] || null;
}

async function schedule(id, userId) {
  const r = await db.query(
    `SELECT * FROM installment_payments WHERE installment_id = $1 AND user_id = $2
     ORDER BY period_no ASC`,
    [id, userId]
  );
  return r.rows;
}

async function totals(userId) {
  const r = await db.query(
    `SELECT COALESCE(sum(p.amount_due),0)::text AS outstanding
     FROM installment_payments p
     JOIN installments i ON i.id = p.installment_id
     WHERE i.user_id = $1 AND i.status = 'ACTIVE' AND p.status <> 'PAID'`,
    [userId]
  );
  return Number(r.rows[0].outstanding);
}

module.exports = { create, insertSchedule, listByUser, findOwned, schedule, totals };
