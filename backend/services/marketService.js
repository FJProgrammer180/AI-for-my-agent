'use strict';
const db = require('../config/db');
const marketRepo = require('../repositories/marketRepo');
const notificationRepo = require('../repositories/notificationRepo');
const provider = require('../providers/marketProvider');
const logger = require('../utils/logger');

/** Seed/refresh aset, kuotasi, dan candle dari provider ke PostgreSQL. */
async function refreshFromProvider() {
  const assets = await provider.fetchAssets();
  if (!assets.length) return { assets: 0, quotes: 0, candles: 0, latest: [] };
  let quoteCount = 0;
  let candles = 0;
  const latest = [];
  await db.withTransaction(async (client) => {
    for (const a of assets) {
      await marketRepo.upsertAsset(a, client);
      const q = await provider.fetchQuote(a.symbol);
      if (q) {
        await marketRepo.upsertQuote(q, client);
        quoteCount++;
        latest.push({
          symbol: q.symbol, price: Number(q.price), prevClose: Number(q.prevClose ?? q.price),
          quotedAt: q.quotedAt, isDelayed: !!q.isDelayed, source: q.source || 'SNAPSHOT',
        });
      }
      const cs = await provider.fetchCandles(a.symbol);
      if (cs.length) { await marketRepo.insertCandles(a.symbol, '1D', cs, client); candles += cs.length; }
    }
  });
  return { assets: assets.length, quotes: quoteCount, candles, latest };
}

/**
 * Evaluasi alert harga berdasarkan kuotasi yang TERSIMPAN (hasil provider).
 * Tidak pernah memicu alert dari harga karangan.
 */
async function evaluateAlerts() {
  const triggered = await marketRepo.pendingTriggeredAlerts();
  let count = 0;
  for (const a of triggered) {
    await db.withTransaction(async (client) => {
      await marketRepo.markAlertTriggered(a.id, a.current_price, client);
      await notificationRepo.create(a.user_id, {
        type: 'PRICE_ALERT',
        title: `Alert harga ${a.symbol} terpicu`,
        body: `Harga ${a.symbol} kini ${a.direction === 'ABOVE' ? 'di atas' : 'di bawah'} target Rp ${Number(a.target_price).toLocaleString('id-ID')} (harga terakhir tercatat: Rp ${Number(a.current_price).toLocaleString('id-ID')}, data ${a.direction ? 'tertunda' : ''}).`,
      }, client);
    });
    count++;
  }
  if (count) logger.info('Alert harga terpicu', { count });
  return count;
}

module.exports = { refreshFromProvider, evaluateAlerts };
