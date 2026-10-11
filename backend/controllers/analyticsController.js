'use strict';
const transactionRepo = require('../repositories/transactionRepo');
const savingsRepo = require('../repositories/savingsRepo');
const installmentRepo = require('../repositories/installmentRepo');
const bankRepo = require('../repositories/bankRepo');
const interestService = require('../services/interestService');
const { ok } = require('../utils/respond');

async function analytics(req, res, next) {
  try {
    const userId = req.user.id;
    const [monthly, categories, goals, installments, savingsTotal, bankTotal, outstanding, interestHistory] =
      await Promise.all([
        transactionRepo.monthlySummary(userId, 12),
        transactionRepo.categorySummary(userId, {}),
        savingsRepo.listByUser(userId, { includeArchived: false }),
        installmentRepo.listByUser(userId),
        savingsRepo.totalBalance(userId),
        bankRepo.totalBalance(userId),
        installmentRepo.totals(userId),
        interestService.historyForUser(userId, 12),
      ]);

    ok(res, {
      monthlyCashflow: monthly.map((m) => ({
        month: m.month, income: Number(m.income), expense: Number(m.expense),
        net: Number(m.income) - Number(m.expense),
      })),
      spendingByCategory: categories.map((c) => ({
        category: c.category, total: Number(c.total), count: c.count,
      })),
      savingsProgress: goals.map((g) => ({
        id: g.id, name: g.name, balance: Number(g.balance), target: Number(g.target_amount),
        progress: Number(g.target_amount) > 0
          ? Math.round((Number(g.balance) / Number(g.target_amount)) * 1000) / 10 : 0,
      })),
      installmentObligations: installments
        .filter((i) => i.status === 'ACTIVE')
        .map((i) => ({
          id: i.id, name: i.name, totalPaid: Number(i.total_paid),
          principal: Number(i.principal), nextDueDate: i.next_due_date,
        })),
      interestHistory: interestHistory.map((h) => ({
        periodEnd: h.period_end, amount: Number(h.interest_amount),
        method: h.method, goalName: h.goal_name, isEstimate: h.is_estimate,
      })),
      assetDistribution: {
        savings: savingsTotal, bank: bankTotal,
      },
      netWorth: (savingsTotal + bankTotal) - outstanding,
    });
  } catch (err) { next(err); }
}

module.exports = { analytics };
