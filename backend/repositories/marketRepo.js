'use strict';
const db = require('../config/db');

async function searchAssets(q, limit = 20) {
  const r = await db.query(
    `SELECT a.*, q.price, q.prev_close, q.quoted_at, q.is_delayed
     FROM market_assets a
     LEFT JOIN market_quotes q ON q.symbol = a.symbol
     WHERE a.symbol ILIKE $1 OR a.name ILIKE $1
     ORDER BY a.symbol LIMIT $2`,
    [`%${q || ''}%`, limit]
  );
  return r.rows;
}

async function getAsset(symbol) {
  const r = await db.query('SELECT * FROM market_assets WHERE symbol = $1', [symbol]);
  return r.rows[0] || null;
}

async function upsertAsset(a, client = db) {
  await client.query(
    `INSERT INTO market_assets (symbol, name, exchange, asset_type, currency, sector)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (symbol) DO UPDATE SET
       name = EXCLUDED.name, exchange = EXCLUDED.exchange, sector = EXCLUDED.sector`,
    [a.symbol, a.name, a.exchange || null, a.assetType || 'STOCK', a.currency || 'IDR', a.sector || null]
  );
}

async function upsertQuote(q, client = db) {
  await client.query(
    `INSERT INTO market_quotes (symbol, price, open, high, low, prev_close, volume, quoted_at, is_delayed, source, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())
     ON CONFLICT (symbol) DO UPDATE SET
       price = EXCLUDED.price, open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
       prev_close = EXCLUDED.prev_close, volume = EXCLUDED.volume, quoted_at = EXCLUDED.quoted_at,
       is_delayed = EXCLUDED.is_delayed, source = EXCLUDED.source, updated_at = now()`,
    [q.symbol, q.price, q.open, q.high, q.low, q.prevClose, q.volume, q.quotedAt, q.isDelayed, q.source || 'SNAPSHOT']
  );
}

async function getQuote(symbol) {
  const r = await db.query('SELECT * FROM market_quotes WHERE symbol = $1', [symbol]);
  return r.rows[0] || null;
}

async function insertCandles(symbol, interval, candles, client = db) {
  for (const c of candles) {
    await client.query(
      `INSERT INTO market_candles (symbol, ts, interval, open, high, low, close, volume)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (symbol, interval, ts) DO UPDATE SET
         open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
         close = EXCLUDED.close, volume = EXCLUDED.volume`,
      [symbol, c.ts, interval, c.open, c.high, c.low, c.close, c.volume ?? null]
    );
  }
}

async function getCandles(symbol, interval = '1D', limit = 365) {
  const r = await db.query(
    `SELECT ts, open, high, low, close, volume FROM market_candles
     WHERE symbol = $1 AND interval = $2 ORDER BY ts DESC LIMIT $3`,
    [symbol, interval, limit]
  );
  return r.rows.reverse();
}

async function listWatchlists(userId) {
  const r = await db.query(
    `SELECT w.*,
       COALESCE(json_agg(json_build_object('symbol', wi.symbol, 'added_at', wi.added_at,
             'name', a.name, 'price', q.price, 'prev_close', q.prev_close, 'quoted_at', q.quoted_at)
             ORDER BY wi.added_at) FILTER (WHERE wi.symbol IS NOT NULL), '[]') AS items
     FROM watchlists w
     LEFT JOIN watchlist_items wi ON wi.watchlist_id = w.id
     LEFT JOIN market_assets a ON a.symbol = wi.symbol
     LEFT JOIN market_quotes q ON q.symbol = wi.symbol
     WHERE w.user_id = $1
     GROUP BY w.id ORDER BY w.created_at`,
    [userId]
  );
  return r.rows;
}

async function createWatchlist(userId, name) {
  const r = await db.query(
    'INSERT INTO watchlists (user_id, name) VALUES ($1,$2) RETURNING *',
    [userId, name]
  );
  return r.rows[0];
}

async function findWatchlistOwned(id, userId) {
  const r = await db.query('SELECT * FROM watchlists WHERE id = $1 AND user_id = $2', [id, userId]);
  return r.rows[0] || null;
}

async function deleteWatchlist(id, userId) {
  const r = await db.query('DELETE FROM watchlists WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  return r.rows[0] || null;
}

async function addItem(watchlistId, symbol) {
  await db.query(
    'INSERT INTO watchlist_items (watchlist_id, symbol) VALUES ($1,$2) ON CONFLICT DO NOTHING',
    [watchlistId, symbol]
  );
}

async function removeItem(watchlistId, symbol) {
  await db.query('DELETE FROM watchlist_items WHERE watchlist_id = $1 AND symbol = $2', [watchlistId, symbol]);
}

async function listAlerts(userId) {
  const r = await db.query(
    `SELECT a.*, m.name AS asset_name FROM price_alerts a
     LEFT JOIN market_assets m ON m.symbol = a.symbol
     WHERE a.user_id = $1 ORDER BY a.created_at DESC`,
    [userId]
  );
  return r.rows;
}

async function createAlert(userId, d) {
  const r = await db.query(
    `INSERT INTO price_alerts (user_id, symbol, direction, target_price)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [userId, d.symbol, d.direction, d.targetPrice]
  );
  return r.rows[0];
}

async function findAlertOwned(id, userId) {
  const r = await db.query('SELECT * FROM price_alerts WHERE id = $1 AND user_id = $2', [id, userId]);
  return r.rows[0] || null;
}

async function deleteAlert(id, userId) {
  const r = await db.query('DELETE FROM price_alerts WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  return r.rows[0] || null;
}

async function setAlertEnabled(id, userId, enabled) {
  const r = await db.query(
    'UPDATE price_alerts SET enabled = $3 WHERE id = $1 AND user_id = $2 RETURNING *',
    [id, userId, enabled]
  );
  return r.rows[0] || null;
}

/** Ambil semua alert aktif yang terpicu oleh harga terbaru. */
async function pendingTriggeredAlerts() {
  const r = await db.query(
    `SELECT a.*, q.price AS current_price FROM price_alerts a
     JOIN market_quotes q ON q.symbol = a.symbol
     WHERE a.enabled AND a.triggered_at IS NULL
       AND ((a.direction = 'ABOVE' AND q.price >= a.target_price)
         OR (a.direction = 'BELOW' AND q.price <= a.target_price))`
  );
  return r.rows;
}

async function markAlertTriggered(id, price, client = db) {
  await client.query(
    'UPDATE price_alerts SET triggered_at = now(), trigger_price = $2 WHERE id = $1',
    [id, price]
  );
}

module.exports = {
  searchAssets, getAsset, upsertAsset, upsertQuote, getQuote,
  insertCandles, getCandles,
  listWatchlists, createWatchlist, findWatchlistOwned, deleteWatchlist, addItem, removeItem,
  listAlerts, createAlert, findAlertOwned, deleteAlert, setAlertEnabled,
  pendingTriggeredAlerts, markAlertTriggered,
};
