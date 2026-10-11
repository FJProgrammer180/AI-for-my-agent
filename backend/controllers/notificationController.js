'use strict';
const notificationRepo = require('../repositories/notificationRepo');
const { ok, notFound } = require('../utils/respond');

async function list(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const r = await notificationRepo.list(req.user.id, {
      limit, offset: (page - 1) * limit, unreadOnly: req.query.unread === 'true',
    });
    ok(res, {
      notifications: r.rows, total: r.total, unread: r.unread,
      pagination: { page, limit, pages: Math.ceil(r.total / limit) },
    });
  } catch (err) { next(err); }
}

async function markRead(req, res, next) {
  try {
    const n = await notificationRepo.markRead(req.params.id, req.user.id);
    if (!n) throw notFound('Notifikasi tidak ditemukan.');
    ok(res, { read: true });
  } catch (err) { next(err); }
}

async function markAllRead(req, res, next) {
  try {
    await notificationRepo.markAllRead(req.user.id);
    ok(res, { allRead: true });
  } catch (err) { next(err); }
}

module.exports = { list, markRead, markAllRead };
