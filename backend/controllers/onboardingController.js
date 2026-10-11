'use strict';
const db = require('../config/db');
const userRepo = require('../repositories/userRepo');
const savingsRepo = require('../repositories/savingsRepo');
const auditRepo = require('../repositories/auditRepo');
const { ok } = require('../utils/respond');

async function complete(req, res, next) {
  try {
    const { monthlyIncome, currency, timezone, goals } = req.body;
    await db.withTransaction(async (client) => {
      await userRepo.updateProfile(req.user.id, {
        monthlyIncome: monthlyIncome ?? 0,
        currency: currency || 'IDR',
        timezone: timezone || 'Asia/Jakarta',
      }, client);
      if (Array.isArray(goals)) {
        for (const g of goals) {
          await savingsRepo.create(req.user.id, {
            name: g.name,
            targetAmount: g.targetAmount,
            targetDate: g.targetDate || null,
          }, client);
        }
      }
      await userRepo.markOnboardingComplete(req.user.id, client);
      await auditRepo.record({
        actorId: req.user.id, actorRole: req.user.role, action: 'ONBOARDING_COMPLETED',
        entityType: 'user', entityId: req.user.id, ip: req.ip,
      }, client);
    });
    ok(res, { onboardingCompleted: true });
  } catch (err) { next(err); }
}

module.exports = { complete };
