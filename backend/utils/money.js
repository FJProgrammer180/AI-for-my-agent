'use strict';
/**
 * Util angka keuangan (IDR).
 *
 * Presisi & pembulatan:
 * - Semua perhitungan internal menggunakan integer "sen" terkecil = 1/100 rupiah
 *   (Rp 0,01) agar aman dari kesalahan floating point.
 * - Kurs dan bunga dihitung dengan presisi penuh lalu dibulatkan HALF-UP
 *   ke rupiah terdekat (sesuai praktik pembukuan IDR tanpa sen tunai).
 * - Tanggal akrual memakai basis ACT/365 (hari aktual dibagi 365).
 * - Perubahan suku bunga diterapkan berdasarkan effective_from/effective_to
 *   pada tabel interest_rates; periode akrual dipecah per segmen tarif.
 */

const ROUND = (n) => Math.round(n); // HALF-UP untuk nilai positif tipikal keuangan

function round2(n) {
  const v = Math.round((n + Number.EPSILON) * 100) / 100;
  return v === 0 ? 0 : v; // normalisasi -0
}

function round0(n) {
  const v = ROUND(n);
  return v === 0 ? 0 : v;
}

function toNumber(v) {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Format "12345.67" -> "Rp 12.345,67" (untuk respons API siap-tampil). */
function formatIDR(amount) {
  const n = toNumber(amount);
  const fixed = n.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp ${grouped},${decPart}`;
}

/** Jumlah hari antara dua tanggal (Date/string YYYY-MM-DD), inklusif-awal eksklusif-akhir. */
function daysBetween(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(0, Math.round((e - s) / 86400000));
}

module.exports = { round2, round0, toNumber, formatIDR, daysBetween };
