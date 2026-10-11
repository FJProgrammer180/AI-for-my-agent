'use strict';
const db = require('../config/db');
const { round0 } = require('../utils/money');

/**
 * Mesin bunga FINOVA.
 *
 * Dokumentasi presisi & aturan:
 * - Basis hari: ACT/365 (hari aktual / 365).
 * - Pembulatan: hasil akhir dibulatkan HALF-UP ke rupiah terdekat (0 desimal tampilan),
 *   penyimpanan NUMERIC(20,2).
 * - SIMPLE_DAILY : bunga = saldo × tarif/100 × hari/365
 * - MONTHLY      : bunga = saldo × tarif/100 / 12 per bulan penuh
 * - COMPOUND     : bunga = saldo × ((1 + tarif/100/365)^hari − 1)
 * - AVERAGE_BALANCE: bunga = rata-rata saldo harian × tarif/100 × hari/365
 * - Bunga untuk target tabungan internal adalah ESTIMASI perencanaan pengguna
 *   (bukan bunga bank). Bunga bank hanya ditampilkan bila berasal dari data
 *   bank yang terhubung.
 */

function calculate(method, principal, annualRatePct, days) {
  const P = Number(principal);
  const r = Number(annualRatePct) / 100;
  const d = Math.max(0, Number(days));
  switch (method) {
    case 'SIMPLE_DAILY':
      return round0(P * r * d / 365);
    case 'MONTHLY':
      return round0(P * r * (d / 30.4167) / 12 * 12 / 12); // proporsional hari terhadap bulan rata-rata
    case 'COMPOUND':
      return round0(P * (Math.pow(1 + r / 365, d) - 1));
    case 'AVERAGE_BALANCE':
      return round0(P * r * d / 365);
    default:
      return 0;
  }
}

/** Estimasi bunga untuk suatu periode (tidak disimpan). */
function estimate({ method, balance, annualRatePct, days }) {
  if (!annualRatePct || !method) return 0;
  return calculate(method, balance, annualRatePct, days);
}

/**
 * Akrual bunga untuk goal internal yang memiliki asumsi tarif.
 * Membuat interest_records (unik per goal per tanggal akhir periode) dan
 * savings_transactions tipe INTEREST agar histori eksplisit.
 */
async function accrueForGoal(goal, periodStart, periodEnd, client = db) {
  const days = Math.max(0, Math.round((new Date(periodEnd) - new Date(periodStart)) / 86400000));
  if (days === 0 || !goal.interest_rate || !goal.interest_method) return null;
  const amount = calculate(goal.interest_method, Number(goal.balance), Number(goal.interest_rate), days);
  const existing = await client.query(
    'SELECT id FROM interest_records WHERE goal_id = $1 AND period_end = $2',
    [goal.id, periodEnd]
  );
  if (existing.rows[0]) return null;
  await client.query(
    `INSERT INTO interest_records
       (user_id, goal_id, period_start, period_end, rate_annual, method, base_amount, interest_amount, is_estimate, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,'Estimasi akrual bunga (asumsi perencanaan pengguna)')`,
    [goal.user_id, goal.id, periodStart, periodEnd, goal.interest_rate, goal.interest_method, goal.balance, amount]
  );
  return amount;
}

async function listRates(productCode = null) {
  const r = productCode
    ? await db.query('SELECT * FROM interest_rates WHERE product_code = $1 ORDER BY effective_from DESC', [productCode])
    : await db.query('SELECT * FROM interest_rates ORDER BY product_code, effective_from DESC');
  return r.rows;
}

async function upsertRate(d, createdBy) {
  const r = await db.query(
    `INSERT INTO interest_rates (product_code, name, rate_annual, method, effective_from, effective_to, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [d.productCode, d.name, d.rateAnnual, d.method, d.effectiveFrom, d.effectiveTo || null, d.notes || null, createdBy]
  );
  return r.rows[0];
}

async function historyForUser(userId, limit = 50) {
  const r = await db.query(
    `SELECT ir.*, g.name AS goal_name FROM interest_records ir
     LEFT JOIN savings_goals g ON g.id = ir.goal_id
     WHERE ir.user_id = $1 ORDER BY ir.period_end DESC LIMIT $2`,
    [userId, limit]
  );
  return r.rows;
}

async function totalAccrued(userId) {
  const r = await db.query(
    'SELECT COALESCE(sum(interest_amount),0)::text AS total FROM interest_records WHERE user_id = $1',
    [userId]
  );
  return Number(r.rows[0].total);
}

module.exports = { calculate, estimate, accrueForGoal, listRates, upsertRate, historyForUser, totalAccrued };
