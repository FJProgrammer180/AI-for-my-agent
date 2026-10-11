'use strict';
const savingsRepo = require('../repositories/savingsRepo');
const installmentRepo = require('../repositories/installmentRepo');
const bankRepo = require('../repositories/bankRepo');
const transactionRepo = require('../repositories/transactionRepo');
const interestService = require('../services/interestService');
const notificationRepo = require('../repositories/notificationRepo');
const userRepo = require('../repositories/userRepo');
const { ok } = require('../utils/respond');

/**
 * Ringkasan dashboard. Seluruh total dihitung dari data tersimpan.
 * Aset & liabilitas dipisah dengan jelas; saldo bank tidak dicampur ke tabungan internal.
 */
async function dashboard(req, res, next) {
  try {
    const userId = req.user.id;
    const [savingsTotal, bankTotal, installmentOutstanding, interestTotal, monthly, recent, notifs, profile] =
      await Promise.all([
        savingsRepo.totalBalance(userId),
        bankRepo.totalBalance(userId),
        installmentRepo.totals(userId),
        interestService.totalAccrued(userId),
        transactionRepo.monthlySummary(userId, 6),
        transactionRepo.list(userId, { limit: 8, offset: 0 }),
        notificationRepo.list(userId, { limit: 5 }),
        userRepo.getProfile(userId),
      ]);

    const now = new Date();
    const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const current = monthly.find((m) => m.month === thisMonth);

    const totalAssets = savingsTotal + bankTotal;
    const totalLiabilities = installmentOutstanding;

    ok(res, {
      metrics: {
        savingsTotal,
        savingsNote: 'Catatan tabungan internal FINOVA (bukan saldo bank).',
        bankBalanceTotal: bankTotal,
        bankNote: 'Saldo dari rekening terhubung (tersinkronisasi).',
        interestAccruedTotal: interestTotal,
        interestNote: 'Estimasi akrual bunga internal berdasarkan asumsi yang kamu tetapkan.',
        installmentOutstanding,
        totalAssets,
        totalLiabilities,
        netWorth: totalAssets - totalLiabilities,
        monthlyIncome: current ? Number(current.income) : Number(profile.monthly_income || 0),
        monthlyExpense: current ? Number(current.expense) : 0,
      },
      monthlyCashflow: monthly.map((m) => ({
        month: m.month, income: Number(m.income), expense: Number(m.expense),
      })),
      recentTransactions: recent.rows,
      notifications: notifs.rows,
      unreadNotifications: notifs.unread,
    });
  } catch (err) { next(err); }
}

module.exports = { dashboard };
