'use strict';
/**
 * Pekerja terjadwal FINOVA.
 * - refresh pasar: mengambil data dari penyedia sah, lalu mengevaluasi alert
 *   dari harga yang benar-benar tercatat (tidak pernah dari harga karangan).
 * - akrual bunga: mencatat estimasi bunga internal untuk target yang memiliki
 *   asumsi tarif (periodik, per hari).
 *
 * Interval dapat dikonfigurasi; bila penyedia data gagal, pekerja mencoba lagi
 * pada giliran berikutnya tanpa menghentikan aplikasi.
 */
const marketService = require('../services/marketService');
const interestService = require('../services/interestService');
const savingsRepo = require('../repositories/savingsRepo');
const db = require('../config/db');
const logger = require('../utils/logger');

let timers = [];

async function runMarketCycle() {
  try {
    const refreshed = await marketService.refreshFromProvider();
    const triggered = await marketService.evaluateAlerts();
    const websocket = require('../websocket');
    if (refreshed.quotes && websocket.handle) websocket.handle.broadcastQuotes(refreshed.latest || []);
    if (refreshed.quotes || triggered) {
      logger.info('Siklus pasar selesai', {
        assets: refreshed.assets, quotes: refreshed.quotes, candles: refreshed.candles, alertsTriggered: triggered,
      });
    }
    return { ok: true, assets: refreshed.assets, quotes: refreshed.quotes, candles: refreshed.candles, alertsTriggered: triggered };
  } catch (err) {
    logger.error('Siklus pasar gagal', { error: logger.describe(err) });
    return { ok: false, error: err.message };
  }
}

/**
 * Akrual bunga harian untuk seluruh target aktif yang punya asumsi tarif.
 * Idempoten per (goal, tanggal) karena interest_records memiliki constraint unik.
 */
async function runInterestCycle() {
  let accrued = 0;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const goals = await db.query(
      `SELECT * FROM savings_goals
       WHERE status IN ('ACTIVE','COMPLETED')
         AND interest_rate IS NOT NULL AND interest_method IS NOT NULL`
    );
    for (const g of goals.rows) {
      const last = await db.query(
        'SELECT max(period_end) AS last FROM interest_records WHERE goal_id = $1',
        [g.id]
      );
      // Periode berikutnya dimulai hari setelah akrual terakhir; bila belum pernah,
      // mulai sejak tanggal target dibuat.
      const base = last.rows[0].last
        ? new Date(new Date(last.rows[0].last).getTime() + 86400000)
        : new Date(g.created_at);
      const start = new Date(Math.min(base.getTime(), new Date(today).getTime()));
      const end = new Date(today);
      if (end < start) continue;
      const amount = await interestService.accrueForGoal(g, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
      if (amount) accrued++;
    }
    if (accrued) logger.info('Akrual bunga tercatat', { jumlah: accrued });
    return { ok: true, accrued };
  } catch (err) {
    logger.error('Siklus bunga gagal', { error: logger.describe(err) });
    return { ok: false, error: err.message };
  }
}

function start({ marketMinutes = 5, interestHours = 6 } = {}) {
  runMarketCycle();
  runInterestCycle();
  const t1 = setInterval(runMarketCycle, Math.max(1, marketMinutes) * 60000);
  const t2 = setInterval(runInterestCycle, Math.max(1, interestHours) * 3600000);
  t1.unref?.(); t2.unref?.();
  timers = [t1, t2];
  return { stop() { timers.forEach(clearInterval); timers = []; } };
}

module.exports = { start, runMarketCycle, runInterestCycle };
