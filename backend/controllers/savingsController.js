'use strict';
const savingsRepo = require('../repositories/savingsRepo');
const savingsService = require('../services/savingsService');
const interestService = require('../services/interestService');
const auditRepo = require('../repositories/auditRepo');
const { ok, notFound } = require('../utils/respond');

async function list(req, res, next) {
  try {
    const goals = await savingsRepo.listByUser(req.user.id, { includeArchived: req.query.includeArchived === 'true' });
    ok(res, { goals: goals.map(savingsService.goalView) });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const goal = await savingsRepo.create(req.user.id, req.body);
    await auditRepo.record({
      actorId: req.user.id, actorRole: req.user.role, action: 'SAVINGS_CREATED',
      entityType: 'savings_goal', entityId: goal.id, detail: { name: goal.name }, ip: req.ip,
    });
    ok(res, { goal: savingsService.goalView(goal) }, 201);
  } catch (err) { next(err); }
}

async function detail(req, res, next) {
  try {
    const goal = await savingsRepo.findOwned(req.params.id, req.user.id);
    if (!goal) throw notFound('Target tabungan tidak ditemukan.');
    const history = await savingsRepo.history(goal.id, req.user.id, {
      limit: parseInt(req.query.limit || '50', 10),
      offset: parseInt(req.query.offset || '0', 10),
    });
    ok(res, { goal: savingsService.goalView(goal), history });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const goal = await savingsRepo.update(req.params.id, req.user.id, req.body);
    if (!goal) throw notFound('Target tabungan tidak ditemukan.');
    ok(res, { goal: savingsService.goalView(goal) });
  } catch (err) { next(err); }
}

async function archive(req, res, next) {
  try {
    const goal = await savingsRepo.setStatus(req.params.id, req.user.id, 'ARCHIVED');
    if (!goal) throw notFound('Target tabungan tidak ditemukan.');
    ok(res, { archived: true });
  } catch (err) { next(err); }
}

async function deposit(req, res, next) {
  try {
    const { amount, note, idempotencyKey } = req.body;
    const result = await savingsService.applyMovement(req.user.id, req.params.id, 'DEPOSIT', amount, note, idempotencyKey);
    ok(res, { ...result, goal: result.goal ? savingsService.goalView(result.goal) : null });
  } catch (err) { next(err); }
}

async function withdraw(req, res, next) {
  try {
    const { amount, note, idempotencyKey } = req.body;
    const result = await savingsService.applyMovement(req.user.id, req.params.id, 'WITHDRAWAL', amount, note, idempotencyKey);
    ok(res, { ...result, goal: result.goal ? savingsService.goalView(result.goal) : null });
  } catch (err) { next(err); }
}

async function interest(req, res, next) {
  try {
    const goal = await savingsRepo.findOwned(req.params.id, req.user.id);
    if (!goal) throw notFound('Target tabungan tidak ditemukan.');
    const days = Math.min(365, Math.max(1, parseInt(req.query.days || '30', 10)));
    const estimate = interestService.estimate({
      method: goal.interest_method,
      balance: Number(goal.balance),
      annualRatePct: goal.interest_rate,
      days,
    });
    ok(res, {
      estimate,
      periodDays: days,
      method: goal.interest_method,
      rateAnnual: goal.interest_rate ? Number(goal.interest_rate) : null,
      isEstimate: true,
      note: 'Estimasi perencanaan berdasarkan asumsi tarif yang kamu tetapkan — bukan bunga bank.',
    });
  } catch (err) { next(err); }
}

module.exports = { list, create, detail, update, archive, deposit, withdraw, interest };
