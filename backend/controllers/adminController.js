'use strict';
const db = require('../config/db');
const userRepo = require('../repositories/userRepo');
const auditRepo = require('../repositories/auditRepo');
const interestService = require('../services/interestService');
const mandiri = require('../providers/mandiriProvider');
const market = require('../providers/marketProvider');
const { ok, notFound } = require('../utils/respond');

async function dashboard(req, res, next) {
  try {
    const [users, sessions, connections, alerts] = await Promise.all([
      db.query(`SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
                  count(*) FILTER (WHERE role = 'ADMIN')::int AS admins FROM users`),
      db.query(`SELECT count(*)::int AS n FROM user_sessions WHERE revoked_at IS NULL AND expires_at > now()`),
      db.query(`SELECT state, count(*)::int AS n FROM bank_connections GROUP BY state`),
      db.query(`SELECT count(*)::int AS n FROM price_alerts WHERE enabled AND triggered_at IS NULL`),
    ]);
    ok(res, {
      users: users.rows[0],
      activeSessions: sessions.rows[0].n,
      bankConnections: connections.rows,
      pendingAlerts: alerts.rows[0].n,
      providers: { mandiri: mandiri.mode(), market: market.mode() },
    });
  } catch (err) { next(err); }
}

async function users(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const r = await userRepo.listUsers({ limit, offset: (page - 1) * limit, q: req.query.q || null });
    ok(res, { users: r.rows, total: r.total, page, limit });
  } catch (err) { next(err); }
}

async function setUserStatus(req, res, next) {
  try {
    const target = await userRepo.findById(req.params.id);
    if (!target) throw notFound('Pengguna tidak ditemukan.');
    await userRepo.setStatus(req.params.id, req.body.status);
    await auditRepo.record({
      actorId: req.user.id, actorRole: req.user.role, action: 'ADMIN_USER_STATUS_CHANGED',
      entityType: 'user', entityId: req.params.id,
      detail: { status: req.body.status }, ip: req.ip,
    });
    ok(res, { updated: true });
  } catch (err) { next(err); }
}

async function systemHealth(req, res, next) {
  try {
    let dbOk = true;
    let dbNow = null;
    try { dbNow = await db.health(); } catch (_) { dbOk = false; }
    ok(res, {
      database: { ok: dbOk, time: dbNow },
      providers: {
        mandiri: { mode: mandiri.mode(), liveConfigured: mandiri.isLiveConfigured() },
        market: { mode: market.mode() },
      },
      uptimeSeconds: Math.round(process.uptime()),
      node: process.version,
    });
  } catch (err) { next(err); }
}

async function auditLogs(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const rows = await auditRepo.list({ limit, offset: (page - 1) * limit });
    ok(res, { logs: rows, page, limit });
  } catch (err) { next(err); }
}

async function listRates(req, res, next) {
  try {
    ok(res, { rates: await interestService.listRates(req.query.productCode || null) });
  } catch (err) { next(err); }
}

async function createRate(req, res, next) {
  try {
    const rate = await interestService.upsertRate(req.body, req.user.id);
    await auditRepo.record({
      actorId: req.user.id, actorRole: req.user.role, action: 'ADMIN_RATE_CREATED',
      entityType: 'interest_rate', entityId: rate.id,
      detail: { productCode: rate.product_code, rateAnnual: rate.rate_annual }, ip: req.ip,
    });
    ok(res, { rate }, 201);
  } catch (err) { next(err); }
}

module.exports = { dashboard, users, setUserStatus, systemHealth, auditLogs, listRates, createRate };
