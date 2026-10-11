'use strict';
/**
 * Membangkitkan snapshot pasar (IDX) deterministik ~260 hari kerja.
 * Data ini adalah data contoh yang jelas berlabel "SNAPSHOT" — BUKAN harga live.
 * Dengan MARKET_PROVIDER=live + TWELVEDATA_API_KEY, aplikasi memakai data resmi.
 */
const fs = require('fs');
const path = require('path');

const ASSETS = [
  { symbol: 'BBCA.JK', name: 'Bank Central Asia Tbk', sector: 'Keuangan', base: 10250, vol: 0.011 },
  { symbol: 'BBRI.JK', name: 'Bank Rakyat Indonesia (Persero) Tbk', sector: 'Keuangan', base: 4650, vol: 0.015 },
  { symbol: 'BMRI.JK', name: 'Bank Mandiri (Persero) Tbk', sector: 'Keuangan', base: 7200, vol: 0.014 },
  { symbol: 'TLKM.JK', name: 'Telkom Indonesia (Persero) Tbk', sector: 'Telekomunikasi', base: 3350, vol: 0.013 },
  { symbol: 'ASII.JK', name: 'Astra International Tbk', sector: 'Konglomerasi', base: 5350, vol: 0.012 },
  { symbol: 'GOTO.JK', name: 'GoTo Gojek Tokopedia Tbk', sector: 'Teknologi', base: 78, vol: 0.032 },
  { symbol: 'ANTM.JK', name: 'Aneka Tambang Tbk', sector: 'Pertambangan', base: 1720, vol: 0.021 },
  { symbol: 'UNVR.JK', name: 'Unilever Indonesia Tbk', sector: 'Konsumen', base: 2480, vol: 0.014 },
  { symbol: 'ICBP.JK', name: 'Indofood CBP Sukses Makmur Tbk', sector: 'Konsumen', base: 11400, vol: 0.011 },
  { symbol: 'ADRO.JK', name: 'Adaro Energy Indonesia Tbk', sector: 'Energi', base: 2960, vol: 0.019 },
];

// PRNG deterministik (mulberry32)
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromString(s) {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const DAYS = 260;
const end = new Date('2026-10-09T16:00:00+07:00'); // hari bursa terakhir snapshot

function buildAsset(a) {
  const rnd = mulberry32(seedFromString(a.symbol));
  const candles = [];
  let close = a.base * (0.8 + rnd() * 0.2);
  let t = new Date(end);
  let made = 0;
  const dates = [];
  while (made < DAYS) {
    if (t.getUTCDay() !== 0 && t.getUTCDay() !== 6) { dates.unshift(new Date(t)); made++; }
    t = new Date(t.getTime() - 86400000);
  }
  let prev = close;
  for (const d of dates) {
    const drift = (rnd() - 0.48) * 2 * a.vol;
    const open = prev * (1 + (rnd() - 0.5) * a.vol * 0.6);
    close = Math.max(a.base * 0.4, prev * (1 + drift));
    const high = Math.max(open, close) * (1 + rnd() * a.vol * 0.5);
    const low = Math.min(open, close) * (1 - rnd() * a.vol * 0.5);
    const volume = Math.round((5e6 + rnd() * 4e7));
    candles.push({
      ts: d.toISOString(),
      open: Math.round(open), high: Math.round(high),
      low: Math.round(low), close: Math.round(close), volume,
    });
    prev = close;
  }
  const last = candles[candles.length - 1];
  const before = candles[candles.length - 2];
  return {
    symbol: a.symbol,
    name: a.name,
    exchange: 'IDX',
    assetType: 'STOCK',
    currency: 'IDR',
    sector: a.sector,
    quote: {
      price: last.close, open: last.open, high: last.high, low: last.low,
      prevClose: before.close, volume: last.volume,
      quotedAt: last.ts, isDelayed: true, source: 'SNAPSHOT',
    },
    candles,
  };
}

const out = {
  generatedAt: end.toISOString(),
  disclaimer: 'Data contoh (snapshot lokal), bukan harga pasar live.',
  assets: ASSETS.map(buildAsset),
};

const dest = path.join(__dirname, '..', 'providers', 'snapshots', 'market-snapshot.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`Snapshot pasar dibuat: ${dest} (${out.assets.length} aset × ${DAYS} hari)`);
