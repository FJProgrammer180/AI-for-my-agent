'use strict';
const transactionRepo = require('../repositories/transactionRepo');
const notificationRepo = require('../repositories/notificationRepo');
const { ok, notFound } = require('../utils/respond');
const { formatIDR } = require('../utils/money');

async function list(req, res, next) {
  try {
    const { q, from, to, category, type, source, page = '1', limit = '25' } = req.query;
    const lim = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const r = await transactionRepo.list(req.user.id, {
      q, from, to, category, type, source, limit: lim, offset: (pg - 1) * lim,
    });
    ok(res, {
      transactions: r.rows,
      pagination: { page: pg, limit: lim, total: r.total, pages: Math.ceil(r.total / lim) },
      categories: transactionRepo.CATEGORIES,
    });
  } catch (err) { next(err); }
}

async function detail(req, res, next) {
  try {
    const t = await transactionRepo.findOwned(req.params.id, req.user.id);
    if (!t) throw notFound('Transaksi tidak ditemukan.');
    ok(res, { transaction: t });
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const t = await transactionRepo.create(req.user.id, { ...req.body, source: 'MANUAL' });
    ok(res, { transaction: t }, 201);
  } catch (err) {
    if (err.code === '23505') { // idempotency key duplikat
      return ok(res, { duplicated: true });
    }
    next(err);
  }
}

/** Ekspor CSV transaksi milik pengguna. */
async function exportCsv(req, res, next) {
  try {
    const r = await transactionRepo.list(req.user.id, { limit: 1000, offset: 0 });
    const header = 'tanggal,tipe,kategori,jumlah,mata_uang,sumber,deskripsi\n';
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = r.rows.map((t) => [
      t.occurred_at, t.type, t.category, Number(t.amount), t.currency, t.source, esc(t.description),
    ].join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="finova-transaksi.csv"');
    res.send(header + body);
  } catch (err) { next(err); }
}

module.exports = { list, detail, create, exportCsv };
