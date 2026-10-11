'use strict';
const db = require('../config/db');
const savingsRepo = require('../repositories/savingsRepo');
const ledgerRepo = require('../repositories/ledgerRepo');
const notificationRepo = require('../repositories/notificationRepo');
const { badRequest, notFound } = require('../utils/respond');

/**
 * Layanan tabungan internal.
 * Setiap perubahan saldo:
 * 1. Validasi + verifikasi kepemilikan
 * 2. Transaksi DB + kunci baris (FOR UPDATE)
 * 3. Update saldo dengan guard saldo >= 0
 * 4. Catat savings_transactions (immutable)
 * 5. Catat pasangan debit/kredit ledger seimbang
 * 6. Commit
 */

async function applyMovement(userId, goalId, type, amount, note, idempotencyKey) {
  if (!(amount > 0)) throw badRequest('Jumlah harus lebih dari nol.');
  return db.withTransaction(async (client) => {
    if (idempotencyKey) {
      const dup = await client.query(
        'SELECT * FROM savings_transactions WHERE goal_id = $1 AND idempotency_key = $2',
        [goalId, idempotencyKey]
      );
      if (dup.rows[0]) {
        const goal = await savingsRepo.findOwned(goalId, userId, client);
        return { duplicated: true, transaction: dup.rows[0], goal };
      }
    }
    const g = await client.query(
      'SELECT * FROM savings_goals WHERE id = $1 AND user_id = $2 FOR UPDATE',
      [goalId, userId]
    );
    const goal = g.rows[0];
    if (!goal) throw notFound('Target tabungan tidak ditemukan.');
    if (goal.status !== 'ACTIVE') throw badRequest('Target tabungan sudah tidak aktif.');

    let newBalance;
    if (type === 'DEPOSIT') {
      newBalance = Number(goal.balance) + Number(amount);
    } else {
      newBalance = Number(goal.balance) - Number(amount);
      if (newBalance < 0) throw badRequest('Saldo tabungan tidak mencukupi untuk penarikan ini.');
    }

    const upd = await client.query(
      `UPDATE savings_goals SET balance = $3, updated_at = now(),
         status = CASE WHEN $3 >= target_amount THEN 'COMPLETED' ELSE status END
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [goalId, userId, newBalance]
    );

    const tx = await client.query(
      `INSERT INTO savings_transactions (goal_id, user_id, type, amount, balance_after, note, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [goalId, userId, type, amount, newBalance, note || null, idempotencyKey || null]
    );

    // Ledger seimbang: akun "CASH_INTERNAL" (ASET) ↔ akun "SAVINGS:<goal>" (ASET earmarked)
    const cash = await ledgerRepo.ensureAccount(userId, 'CASH_INTERNAL', 'Kas Internal (catatan manual)', 'ASSET', client);
    const savingsAcc = await ledgerRepo.ensureAccount(
      userId, `SAVINGS_${goalId.slice(0, 8)}`, `Tabungan: ${goal.name}`, 'ASSET', client
    );
    const signed = type === 'DEPOSIT' ? Number(amount) : -Number(amount);
    await ledgerRepo.recordTransaction(userId,
      `${type === 'DEPOSIT' ? 'Setoran' : 'Penarikan'} tabungan "${goal.name}"`,
      [
        { accountId: savingsAcc.id, amount: signed },
        { accountId: cash.id, amount: -signed },
      ], null, client);

    if (upd.rows[0].status === 'COMPLETED' && goal.status !== 'COMPLETED') {
      await notificationRepo.create(userId, {
        type: 'SAVINGS',
        title: 'Target tabungan tercapai 🎉',
        body: `Selamat! Target "${goal.name}" telah tercapai.`,
      }, client);
    }

    return { duplicated: false, transaction: tx.rows[0], goal: upd.rows[0] };
  });
}

function goalView(goal) {
  const target = Number(goal.target_amount);
  const balance = Number(goal.balance);
  const remaining = Math.max(0, target - balance);
  const progress = target > 0 ? Math.round((balance / target) * 1000) / 10 : 0;
  return { ...goal, remaining, progress };
}

module.exports = { applyMovement, goalView };
