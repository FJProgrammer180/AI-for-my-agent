'use strict';
const db = require('../config/db');
const repo = require('../repositories/installmentRepo');
const notificationRepo = require('../repositories/notificationRepo');
const { round0 } = require('../utils/money');
const { badRequest, notFound } = require('../utils/respond');

/**
 * Layanan cicilan.
 * Metode perhitungan:
 * - FLAT      : bunga dihitung dari pokok awal, angsuran sama setiap bulan.
 * - ANNUITY   : angsuran tetap, porsi bunga menurun (rumus anuitas).
 * - EFFECTIVE : porsi pokok tetap, bunga dari sisa pokok (angsuran menurun).
 */

function addMonths(dateStr, months, dueDay) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const m = d.getUTCMonth() + months;
  const y = d.getUTCFullYear() + Math.floor(m / 12);
  const month = ((m % 12) + 12) % 12;
  const day = Math.min(dueDay, 28);
  return `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function buildSchedule({ principal, downPayment, interestRate, tenorMonths, startDate, dueDay, method }) {
  const loan = Number(principal) - Number(downPayment || 0);
  if (loan <= 0) throw badRequest('Pokok pinjaman harus lebih besar dari uang muka.');
  const n = Number(tenorMonths);
  const annual = Number(interestRate || 0) / 100;
  const monthlyRate = annual / 12;
  const rows = [];

  if (method === 'FLAT') {
    const principalPart = round0(loan / n);
    const interestPart = round0(loan * monthlyRate);
    for (let i = 1; i <= n; i++) {
      const isLast = i === n;
      const pPart = isLast ? loan - principalPart * (n - 1) : principalPart;
      rows.push({
        periodNo: i,
        dueDate: addMonths(startDate, i, dueDay),
        amountDue: pPart + interestPart,
        principalPart: pPart,
        interestPart,
      });
    }
  } else if (method === 'ANNUITY') {
    let payment;
    if (monthlyRate === 0) payment = round0(loan / n);
    else payment = round0(loan * monthlyRate / (1 - Math.pow(1 + monthlyRate, -n)));
    let remaining = loan;
    for (let i = 1; i <= n; i++) {
      const interestPart = round0(remaining * monthlyRate);
      let principalPart = payment - interestPart;
      if (i === n) principalPart = remaining; // koreksi pembulatan di periode akhir
      remaining -= principalPart;
      rows.push({
        periodNo: i,
        dueDate: addMonths(startDate, i, dueDay),
        amountDue: principalPart + interestPart,
        principalPart,
        interestPart,
      });
    }
  } else { // EFFECTIVE
    const principalPart = round0(loan / n);
    let remaining = loan;
    for (let i = 1; i <= n; i++) {
      const interestPart = round0(remaining * monthlyRate);
      const pPart = i === n ? remaining : principalPart;
      rows.push({
        periodNo: i,
        dueDate: addMonths(startDate, i, dueDay),
        amountDue: pPart + interestPart,
        principalPart: pPart,
        interestPart,
      });
      remaining -= pPart;
    }
  }
  return { loan, rows };
}

async function createInstallment(userId, data) {
  const { loan, rows } = buildSchedule(data);
  return db.withTransaction(async (client) => {
    const inst = await repo.create(userId, data, client);
    await repo.insertSchedule(inst.id, userId, rows, client);
    return { ...inst, loan_amount: loan, schedule: rows };
  });
}

async function recordPayment(userId, installmentId, periodNo, amountPaid, idempotencyKey) {
  return db.withTransaction(async (client) => {
    const inst = await client.query(
      'SELECT * FROM installments WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [installmentId, userId]
    );
    if (!inst.rows[0]) throw notFound('Cicilan tidak ditemukan.');
    const pay = await client.query(
      `SELECT * FROM installment_payments
       WHERE installment_id = $1 AND period_no = $2 FOR UPDATE`,
      [installmentId, periodNo]
    );
    const row = pay.rows[0];
    if (!row) throw notFound('Jadwal pembayaran tidak ditemukan.');
    if (row.status === 'PAID') {
      return { alreadyPaid: true, payment: row };
    }
    if (idempotencyKey) {
      const dup = await client.query(
        'SELECT * FROM installment_payments WHERE installment_id = $1 AND idempotency_key = $2',
        [installmentId, idempotencyKey]
      );
      if (dup.rows[0] && dup.rows[0].status === 'PAID') return { alreadyPaid: true, payment: dup.rows[0] };
    }
    const amount = amountPaid != null ? Number(amountPaid) : Number(row.amount_due);
    if (!(amount > 0)) throw badRequest('Jumlah pembayaran tidak valid.');
    const updated = await client.query(
      `UPDATE installment_payments
       SET status = 'PAID', amount_paid = $3, paid_at = now(), recorded_via = 'MANUAL', idempotency_key = COALESCE($4, idempotency_key)
       WHERE id = $1 AND installment_id = $2 RETURNING *`,
      [row.id, installmentId, amount, idempotencyKey || null]
    );
    // Selesaikan rencana bila semua periode lunas
    const remaining = await client.query(
      `SELECT count(*)::int AS n FROM installment_payments
       WHERE installment_id = $1 AND status <> 'PAID'`,
      [installmentId]
    );
    if (remaining.rows[0].n === 0) {
      await client.query(
        `UPDATE installments SET status = 'COMPLETED', updated_at = now() WHERE id = $1`,
        [installmentId]
      );
      await notificationRepo.create(userId, {
        type: 'INSTALLMENT',
        title: 'Cicilan lunas 🎉',
        body: `Cicilan "${inst.rows[0].name}" telah lunas seluruhnya.`,
      }, client);
    } else {
      await notificationRepo.create(userId, {
        type: 'PAYMENT',
        title: 'Pembayaran cicilan tercatat',
        body: `Pembayaran periode ke-${periodNo} untuk "${inst.rows[0].name}" tercatat (catatan manual, bukan konfirmasi bank).`,
      }, client);
    }
    return { alreadyPaid: false, payment: updated.rows[0] };
  });
}

async function summarize(userId, installment) {
  const rows = await repo.schedule(installment.id, userId);
  const paid = rows.filter((r) => r.status === 'PAID');
  const unpaid = rows.filter((r) => r.status !== 'PAID');
  const totalPaid = paid.reduce((s, r) => s + Number(r.amount_paid || 0), 0);
  const remainingPrincipal = unpaid.reduce((s, r) => s + Number(r.principal_part), 0);
  const remainingInterest = unpaid.reduce((s, r) => s + Number(r.interest_part), 0);
  const nextDue = unpaid.length ? unpaid[0].due_date : null;
  return {
    schedule: rows,
    totalPaid,
    remainingPrincipal,
    remainingInterest,
    nextDueDate: nextDue,
    progress: rows.length ? Math.round((paid.length / rows.length) * 1000) / 10 : 0,
  };
}

module.exports = { buildSchedule, addMonths, createInstallment, recordPayment, summarize };
