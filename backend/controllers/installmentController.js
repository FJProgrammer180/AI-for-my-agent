'use strict';
const installmentRepo = require('../repositories/installmentRepo');
const installmentService = require('../services/installmentService');
const auditRepo = require('../repositories/auditRepo');
const { ok, notFound } = require('../utils/respond');

async function list(req, res, next) {
  try {
    const rows = await installmentRepo.listByUser(req.user.id);
    ok(res, {
      installments: rows.map((r) => ({
        ...r,
        principal: Number(r.principal),
        down_payment: Number(r.down_payment),
        interest_rate: Number(r.interest_rate),
        total_paid: Number(r.total_paid),
      })),
    });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const result = await installmentService.createInstallment(req.user.id, req.body);
    await auditRepo.record({
      actorId: req.user.id, actorRole: req.user.role, action: 'INSTALLMENT_CREATED',
      entityType: 'installment', entityId: result.id,
      detail: { name: result.name, method: result.method }, ip: req.ip,
    });
    ok(res, { installment: result }, 201);
  } catch (err) { next(err); }
}

async function detail(req, res, next) {
  try {
    const inst = await installmentRepo.findOwned(req.params.id, req.user.id);
    if (!inst) throw notFound('Cicilan tidak ditemukan.');
    const summary = await installmentService.summarize(req.user.id, inst);
    ok(res, { installment: inst, ...summary });
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const inst = await installmentRepo.findOwned(req.params.id, req.user.id);
    if (!inst) throw notFound('Cicilan tidak ditemukan.');
    const db = require('../config/db');
    const r = await db.query(
      `UPDATE installments SET name = COALESCE($3, name), due_day = COALESCE($4, due_day), updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id, req.body.name ?? null, req.body.dueDay ?? null]
    );
    ok(res, { installment: r.rows[0] });
  } catch (err) { next(err); }
}

async function pay(req, res, next) {
  try {
    const { periodNo, amount, idempotencyKey } = req.body;
    const result = await installmentService.recordPayment(req.user.id, req.params.id, periodNo, amount, idempotencyKey);
    ok(res, result);
  } catch (err) { next(err); }
}

async function schedule(req, res, next) {
  try {
    const inst = await installmentRepo.findOwned(req.params.id, req.user.id);
    if (!inst) throw notFound('Cicilan tidak ditemukan.');
    const rows = await installmentRepo.schedule(inst.id, req.user.id);
    ok(res, { schedule: rows });
  } catch (err) { next(err); }
}

async function archive(req, res, next) {
  try {
    const db = require('../config/db');
    const r = await db.query(
      `UPDATE installments SET status = 'ARCHIVED', updated_at = now()
       WHERE id = $1 AND user_id = $2 RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!r.rows[0]) throw notFound('Cicilan tidak ditemukan.');
    ok(res, { archived: true });
  } catch (err) { next(err); }
}

module.exports = { list, create, detail, update, pay, schedule, archive };
