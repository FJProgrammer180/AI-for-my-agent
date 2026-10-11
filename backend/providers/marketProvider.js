'use strict';
/**
 * Provider data pasar saham.
 * - "snapshot" (default, gratis): data historis contoh lokal, berlabel jelas.
 * - "live": Twelve Data (membutuhkan TWELVEDATA_API_KEY) — data resmi berlisensi.
 * Semua kuotasi ditandai delayed/live secara jujur.
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const logger = require('../utils/logger');

function mode() {
  return env.MARKET_PROVIDER === 'live' && env.TWELVEDATA_API_KEY ? 'LIVE' : 'SNAPSHOT';
}

function loadSnapshot() {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(env.MARKET_SNAPSHOT_PATH), 'utf8'));
  } catch (err) {
    logger.error('Snapshot pasar tidak dapat dibaca', { error: err.message });
    return null;
  }
}

async function httpGet(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/** Ambil aset dari sumber aktif. */
async function fetchAssets() {
  if (mode() === 'LIVE') {
    // Untuk mode live, daftar simbol IDX tetap di-seed dari snapshot;
    // harga & candle diperbarui dari API resmi.
    const snap = loadSnapshot();
    return snap ? snap.assets.map((a) => ({
      symbol: a.symbol, name: a.name, exchange: a.exchange,
      assetType: a.assetType, currency: a.currency, sector: a.sector,
    })) : [];
  }
  const snap = loadSnapshot();
  return snap ? snap.assets.map((a) => ({
    symbol: a.symbol, name: a.name, exchange: a.exchange,
    assetType: a.assetType, currency: a.currency, sector: a.sector,
  })) : [];
}

async function fetchQuote(symbol) {
  if (mode() === 'LIVE') {
    try {
      const d = await httpGet(
        `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${env.TWELVEDATA_API_KEY}`
      );
      if (d && d.close) {
        return {
          symbol,
          price: Number(d.close), open: Number(d.open), high: Number(d.high),
          low: Number(d.low), prevClose: Number(d.previous_close), volume: Number(d.volume) || null,
          quotedAt: d.datetime ? new Date(d.datetime).toISOString() : new Date().toISOString(),
          isDelayed: true, // Twelve Data gratis = delayed 15 menit
          source: 'TWELVEDATA',
        };
      }
      logger.warn('Kuotasi live tidak valid', { symbol });
    } catch (err) {
      logger.error('Gagal mengambil kuotasi live', { symbol, error: err.message });
    }
    return null;
  }
  const snap = loadSnapshot();
  const a = snap && snap.assets.find((x) => x.symbol === symbol);
  return a ? { symbol, ...a.quote } : null;
}

async function fetchCandles(symbol) {
  if (mode() === 'LIVE') {
    try {
      const d = await httpGet(
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=260&apikey=${env.TWELVEDATA_API_KEY}`
      );
      if (d && Array.isArray(d.values)) {
        return d.values.reverse().map((v) => ({
          ts: new Date(v.datetime + 'T00:00:00Z').toISOString(),
          open: Number(v.open), high: Number(v.high), low: Number(v.low),
          close: Number(v.close), volume: Number(v.volume) || null,
        }));
      }
    } catch (err) {
      logger.error('Gagal mengambil histori live', { symbol, error: err.message });
    }
    return [];
  }
  const snap = loadSnapshot();
  const a = snap && snap.assets.find((x) => x.symbol === symbol);
  return a ? a.candles : [];
}

module.exports = { mode, fetchAssets, fetchQuote, fetchCandles };
