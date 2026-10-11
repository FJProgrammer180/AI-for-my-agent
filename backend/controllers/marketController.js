'use strict';
const marketRepo = require('../repositories/marketRepo');
const marketService = require('../services/marketService');
const provider = require('../providers/marketProvider');
const { ok, notFound, conflict } = require('../utils/respond');

async function assets(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const rows = await marketRepo.searchAssets(q, 30);
    ok(res, {
      assets: rows.map((a) => ({
        symbol: a.symbol, name: a.name, exchange: a.exchange, sector: a.sector,
        currency: a.currency,
        price: a.price === null ? null : Number(a.price),
        prevClose: a.prev_close === null ? null : Number(a.prev_close),
        quotedAt: a.quoted_at, isDelayed: a.is_delayed,
      })),
      providerMode: provider.mode(),
    });
  } catch (err) { next(err); }
}

async function quote(req, res, next) {
  try {
    const symbol = String(req.params.symbol || '').toUpperCase();
    const asset = await marketRepo.getAsset(symbol);
    if (!asset) throw notFound('Instrumen tidak ditemukan.');
    const q = await marketRepo.getQuote(symbol);
    if (!q) {
      return ok(res, {
        asset, quote: null,
        message: 'Data pasar untuk instrumen ini belum dapat diambil saat ini.',
      });
    }
    const price = Number(q.price);
    const prev = Number(q.prev_close || q.price);
    ok(res, {
      asset,
      quote: {
        price, open: q.open === null ? null : Number(q.open),
        high: q.high === null ? null : Number(q.high),
        low: q.low === null ? null : Number(q.low),
        prevClose: prev, volume: q.volume === null ? null : Number(q.volume),
        change: price - prev,
        changePct: prev ? ((price - prev) / prev) * 100 : 0,
        quotedAt: q.quoted_at, isDelayed: q.is_delayed, source: q.source,
      },
    });
  } catch (err) { next(err); }
}

async function history(req, res, next) {
  try {
    const symbol = String(req.params.symbol || '').toUpperCase();
    const asset = await marketRepo.getAsset(symbol);
    if (!asset) throw notFound('Instrumen tidak ditemukan.');
    const limit = Math.min(365, Math.max(5, parseInt(req.query.limit || '180', 10)));
    const candles = await marketRepo.getCandles(symbol, '1D', limit);
    ok(res, {
      asset,
      interval: '1D',
      candles: candles.map((c) => ({
        time: c.ts, open: Number(c.open), high: Number(c.high),
        low: Number(c.low), close: Number(c.close),
        volume: c.volume === null ? null : Number(c.volume),
      })),
      isDelayed: true,
      source: provider.mode() === 'LIVE' ? 'TWELVEDATA' : 'SNAPSHOT',
    });
  } catch (err) { next(err); }
}

async function status(req, res, next) {
  try {
    ok(res, {
      provider: provider.mode(),
      live: provider.mode() === 'LIVE',
      delayedNotice: provider.mode() === 'LIVE'
        ? 'Kuotasi dapat tertunda sesuai lisensi penyedia data.'
        : 'Menampilkan data contoh (snapshot historis lokal) — bukan harga pasar live.',
    });
  } catch (err) { next(err); }
}

// ---- Watchlists ----
async function listWatchlists(req, res, next) {
  try {
    ok(res, { watchlists: await marketRepo.listWatchlists(req.user.id) });
  } catch (err) { next(err); }
}

async function createWatchlist(req, res, next) {
  try {
    try {
      const w = await marketRepo.createWatchlist(req.user.id, req.body.name);
      ok(res, { watchlist: w }, 201);
    } catch (e) {
      if (e.code === '23505') throw conflict('Nama watchlist sudah dipakai.');
      throw e;
    }
  } catch (err) { next(err); }
}

async function deleteWatchlist(req, res, next) {
  try {
    const w = await marketRepo.deleteWatchlist(req.params.id, req.user.id);
    if (!w) throw notFound('Watchlist tidak ditemukan.');
    ok(res, { deleted: true });
  } catch (err) { next(err); }
}

async function addItem(req, res, next) {
  try {
    const w = await marketRepo.findWatchlistOwned(req.params.id, req.user.id);
    if (!w) throw notFound('Watchlist tidak ditemukan.');
    const symbol = req.body.symbol.toUpperCase();
    const asset = await marketRepo.getAsset(symbol);
    if (!asset) throw notFound('Instrumen tidak tersedia di sumber data saat ini.');
    await marketRepo.addItem(w.id, symbol);
    ok(res, { added: true });
  } catch (err) { next(err); }
}

async function removeItem(req, res, next) {
  try {
    const w = await marketRepo.findWatchlistOwned(req.params.id, req.user.id);
    if (!w) throw notFound('Watchlist tidak ditemukan.');
    await marketRepo.removeItem(w.id, String(req.params.symbol).toUpperCase());
    ok(res, { removed: true });
  } catch (err) { next(err); }
}

// ---- Alerts ----
async function listAlerts(req, res, next) {
  try {
    ok(res, { alerts: await marketRepo.listAlerts(req.user.id) });
  } catch (err) { next(err); }
}

async function createAlert(req, res, next) {
  try {
    const symbol = req.body.symbol.toUpperCase();
    const asset = await marketRepo.getAsset(symbol);
    if (!asset) throw notFound('Instrumen tidak tersedia di sumber data saat ini.');
    const a = await marketRepo.createAlert(req.user.id, {
      symbol, direction: req.body.direction, targetPrice: req.body.targetPrice,
    });
    ok(res, { alert: a }, 201);
  } catch (err) { next(err); }
}

async function deleteAlert(req, res, next) {
  try {
    const a = await marketRepo.deleteAlert(req.params.id, req.user.id);
    if (!a) throw notFound('Alert tidak ditemukan.');
    ok(res, { deleted: true });
  } catch (err) { next(err); }
}

async function toggleAlert(req, res, next) {
  try {
    const a = await marketRepo.setAlertEnabled(req.params.id, req.user.id, !!req.body.enabled);
    if (!a) throw notFound('Alert tidak ditemukan.');
    ok(res, { alert: a });
  } catch (err) { next(err); }
}

/** Dipanggil worker/internal untuk menyegarkan data & mengevaluasi alert. */
async function refresh(req, res, next) {
  try {
    const r = await marketService.refreshFromProvider();
    const triggered = await marketService.evaluateAlerts();
    ok(res, { refreshed: r, alertsTriggered: triggered });
  } catch (err) { next(err); }
}

module.exports = {
  assets, quote, history, status,
  listWatchlists, createWatchlist, deleteWatchlist, addItem, removeItem,
  listAlerts, createAlert, deleteAlert, toggleAlert, refresh,
};
