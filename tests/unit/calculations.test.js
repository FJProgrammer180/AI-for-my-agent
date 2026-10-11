'use strict';
/**
 * Tes unit murni (tanpa database): perhitungan bunga, jadwal cicilan, util uang.
 * Jalankan: node --test tests/unit
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { buildSchedule } = require('../../backend/services/installmentService');
const interest = require('../../backend/services/interestService');
const money = require('../../backend/utils/money');

test('uang: pembulatan 2 desimal HALF-UP', () => {
  assert.equal(money.round2(1234.565), 1234.57);
  assert.equal(money.round2(0.005), 0.01);
  assert.equal(money.round2(-0.004), 0);
});

test('uang: format IDR memakai titik ribuan & koma desimal', () => {
  assert.equal(money.formatIDR(7500000), 'Rp 7.500.000,00');
  assert.equal(money.formatIDR(12345.6), 'Rp 12.345,60');
  assert.equal(money.formatIDR(0), 'Rp 0,00');
});

test('bunga: SIMPLE_DAILY memakai basis ACT/365', () => {
  // 10.000.000 × 6%/thn × 30/365 = 49.315,07 → 49.315
  assert.equal(interest.calculate('SIMPLE_DAILY', 10_000_000, 6, 30), 49315);
});

test('bunga: COMPOUND menghasilkan nilai ≥ simple untuk periode panjang', () => {
  const simple = interest.calculate('SIMPLE_DAILY', 10_000_000, 12, 365);
  const comp = interest.calculate('COMPOUND', 10_000_000, 12, 365);
  assert.equal(simple, 1_200_000);
  assert.ok(comp > simple, `${comp} harus > ${simple}`);
});

test('bunga: periode nol hari menghasilkan nol', () => {
  assert.equal(interest.calculate('SIMPLE_DAILY', 5_000_000, 10, 0), 0);
});

test('cicilan FLAT: angsuran = pokok/tenor + pokok×rate/12, jumlah pokok = pinjaman', () => {
  const { loan, rows } = buildSchedule({
    principal: 12_000_000, downPayment: 0, interestRate: 12, tenorMonths: 12,
    startDate: '2026-01-05', dueDay: 5, method: 'FLAT',
  });
  assert.equal(loan, 12_000_000);
  assert.equal(rows.length, 12);
  assert.equal(rows[0].principalPart, 1_000_000);
  assert.equal(rows[0].interestPart, 120_000);
  assert.equal(rows[0].amountDue, 1_120_000);
  const totalPrincipal = rows.reduce((s, r) => s + r.principalPart, 0);
  assert.equal(totalPrincipal, 12_000_000, 'total pokok harus persis sebesar pinjaman');
  assert.equal(rows[0].dueDate, '2026-02-05');
});

test('cicilan ANNUITY: angsuran tetap & pokok terkoreksi di periode akhir', () => {
  const { rows } = buildSchedule({
    principal: 20_000_000, downPayment: 5_000_000, interestRate: 9, tenorMonths: 24,
    startDate: '2026-01-10', dueDay: 10, method: 'ANNUITY',
  });
  assert.equal(rows.length, 24);
  // Anuitas: angsuran ke-1..n-1 identik; periode terakhir menyerap sisa pembulatan
  const regular = rows.slice(0, -1).map((r) => r.amountDue);
  assert.equal(Math.max(...regular) - Math.min(...regular), 0, 'angsuran reguler harus identik');
  assert.ok(Math.abs(rows[23].amountDue - regular[0]) <= 5, 'deviasi periode akhir harus kecil (pembulatan)');
  const principalSum = rows.reduce((s, r) => s + r.principalPart, 0);
  assert.equal(principalSum, 15_000_000);
});

test('cicilan EFFECTIVE: bunga menurun mengikuti sisa pokok', () => {
  const { rows } = buildSchedule({
    principal: 10_000_000, downPayment: 0, interestRate: 12, tenorMonths: 10,
    startDate: '2026-01-01', dueDay: 1, method: 'EFFECTIVE',
  });
  assert.ok(rows[0].interestPart > rows[rows.length - 1].interestPart);
  assert.equal(rows.reduce((s, r) => s + r.principalPart, 0), 10_000_000);
});

test('cicilan: uang muka mengurangi pokok pinjaman', () => {
  const { loan, rows } = buildSchedule({
    principal: 10_000_000, downPayment: 2_500_000, interestRate: 0, tenorMonths: 3,
    startDate: '2026-01-01', dueDay: 1, method: 'FLAT',
  });
  assert.equal(loan, 7_500_000);
  assert.equal(rows[0].amountDue, 2_500_000);
  assert.equal(rows[0].interestPart, 0);
});

test('cicilan: uang muka ≥ pokok ditolak', () => {
  assert.throws(() => buildSchedule({
    principal: 1_000_000, downPayment: 1_000_000, interestRate: 0, tenorMonths: 6,
    startDate: '2026-01-01', dueDay: 1, method: 'FLAT',
  }), /lebih besar dari uang muka/);
});

test('validasi: skema penolakan password lemah & email tidak valid', () => {
  const { registerSchema } = require('../../backend/validators/schemas');
  const bad = registerSchema.safeParse({
    fullName: 'A', username: 'x!', email: 'bukan-email',
    password: 'lemah', confirmPassword: 'lemah2', acceptTerms: false,
  });
  assert.equal(bad.success, false);
  const good = registerSchema.safeParse({
    fullName: 'Budi Santoso', username: 'budi_s', email: 'budi@contoh.id',
    password: 'Rahasia123', confirmPassword: 'Rahasia123', acceptTerms: true,
  });
  assert.equal(good.success, true);
});

test('validasi: nominal non-positif ditolak', () => {
  const { movementSchema } = require('../../backend/validators/schemas');
  assert.equal(movementSchema.safeParse({ amount: 0 }).success, false);
  assert.equal(movementSchema.safeParse({ amount: -5 }).success, false);
  assert.equal(movementSchema.safeParse({ amount: 250000 }).success, true);
});
