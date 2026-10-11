'use strict';
const { z } = require('zod');

const idrAmount = z.number({ invalid_type_error: 'Jumlah harus berupa angka.' })
  .positive('Jumlah harus lebih dari nol.')
  .max(1e13, 'Jumlah terlalu besar.');

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter.').max(120),
  username: z.string().trim().min(3, 'Nama pengguna minimal 3 karakter.').max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Nama pengguna hanya boleh huruf, angka, titik, garis bawah, dan strip.'),
  email: z.string().trim().email('Format email tidak valid.').max(254),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter.').max(128),
  confirmPassword: z.string(),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Kamu harus menyetujui syarat & kebijakan privasi.' }) }),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Konfirmasi kata sandi tidak sama.', path: ['confirmPassword'],
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1, 'Email atau nama pengguna wajib diisi.').max(254),
  password: z.string().min(1, 'Kata sandi wajib diisi.').max(128),
});

const forgotSchema = z.object({
  email: z.string().trim().email('Format email tidak valid.').max(254),
});

const resetSchema = z.object({
  token: z.string().min(10, 'Token tidak valid.'),
  password: z.string().min(8, 'Kata sandi minimal 8 karakter.').max(128),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Konfirmasi kata sandi tidak sama.', path: ['confirmPassword'],
});

const verifyEmailSchema = z.object({
  token: z.string().min(10, 'Token tidak valid.'),
});

const onboardingSchema = z.object({
  monthlyIncome: z.number().min(0).max(1e12).optional(),
  currency: z.string().length(3).optional(),
  timezone: z.string().max(64).optional(),
  goals: z.array(z.object({
    name: z.string().trim().min(2).max(80),
    targetAmount: idrAmount,
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })).max(5).optional(),
});

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  avatarUrl: z.string().max(500).optional().nullable(),
  currency: z.string().length(3).optional(),
  timezone: z.string().max(64).optional(),
  notifyEmail: z.boolean().optional(),
  notifyPush: z.boolean().optional(),
  monthlyIncome: z.number().min(0).max(1e12).optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi.'),
  newPassword: z.string().min(8, 'Kata sandi baru minimal 8 karakter.').max(128),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: 'Konfirmasi kata sandi tidak sama.', path: ['confirmPassword'],
});

const savingsCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nama tabungan minimal 2 karakter.').max(80),
  targetAmount: idrAmount,
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.').optional().nullable(),
  interestRate: z.number().min(0).max(100).optional().nullable(),
  interestMethod: z.enum(['SIMPLE_DAILY', 'MONTHLY', 'COMPOUND']).optional().nullable(),
});

const savingsUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  targetAmount: idrAmount.optional(),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  interestRate: z.number().min(0).max(100).optional().nullable(),
  interestMethod: z.enum(['SIMPLE_DAILY', 'MONTHLY', 'COMPOUND']).optional().nullable(),
});

const movementSchema = z.object({
  amount: idrAmount,
  note: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().max(80).optional(),
});

const installmentCreateSchema = z.object({
  name: z.string().trim().min(2, 'Nama cicilan minimal 2 karakter.').max(80),
  principal: idrAmount,
  downPayment: z.number().min(0).max(1e13).default(0),
  interestRate: z.number().min(0).max(100).default(0),
  tenorMonths: z.number().int().min(1, 'Tenor minimal 1 bulan.').max(360),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal tidak valid.'),
  dueDay: z.number().int().min(1).max(28).default(1),
  method: z.enum(['FLAT', 'ANNUITY', 'EFFECTIVE']).default('FLAT'),
});

const installmentUpdateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  dueDay: z.number().int().min(1).max(28).optional(),
});

const paySchema = z.object({
  periodNo: z.number().int().min(1),
  amount: idrAmount.optional(),
  idempotencyKey: z.string().max(80).optional(),
});

const transactionCreateSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  category: z.enum(['FOOD','TRANSPORT','EDUCATION','SHOPPING','BILLS','SALARY','SAVINGS','INTEREST','INSTALLMENTS','TRANSFERS','OTHER']).default('OTHER'),
  amount: idrAmount,
  occurredAt: z.string().optional().nullable(),
  description: z.string().trim().max(200).optional(),
  idempotencyKey: z.string().max(80).optional(),
});

const beneficiarySchema = z.object({
  bankCode: z.string().trim().min(2).max(20),
  accountNumber: z.string().trim().min(4).max(40).regex(/^[0-9]+$/, 'Nomor rekening hanya boleh angka.'),
  accountName: z.string().trim().min(2).max(120),
  alias: z.string().trim().max(60).optional(),
});

const transferSchema = z.object({
  sourceAccountId: z.string().uuid('Rekening sumber tidak valid.'),
  beneficiaryId: z.string().uuid('Penerima tidak valid.'),
  amount: idrAmount,
  note: z.string().trim().max(140).optional(),
  idempotencyKey: z.string().max(80).optional(),
});

const watchlistSchema = z.object({
  name: z.string().trim().min(1, 'Nama watchlist wajib diisi.').max(60),
});

const watchlistItemSchema = z.object({
  symbol: z.string().trim().min(1).max(20).regex(/^[A-Z0-9.\-]+$/i, 'Simbol tidak valid.'),
});

const alertSchema = z.object({
  symbol: z.string().trim().min(1).max(20).regex(/^[A-Z0-9.\-]+$/i, 'Simbol tidak valid.'),
  direction: z.enum(['ABOVE', 'BELOW']),
  targetPrice: z.number().positive('Harga target harus lebih dari nol.').max(1e12),
});

const adminStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
});

const rateSchema = z.object({
  productCode: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(120),
  rateAnnual: z.number().min(0).max(100),
  method: z.enum(['SIMPLE_DAILY', 'MONTHLY', 'COMPOUND', 'AVERAGE_BALANCE']),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  notes: z.string().max(500).optional(),
});

module.exports = {
  registerSchema, loginSchema, forgotSchema, resetSchema, verifyEmailSchema, onboardingSchema,
  profileSchema, changePasswordSchema,
  savingsCreateSchema, savingsUpdateSchema, movementSchema,
  installmentCreateSchema, installmentUpdateSchema, paySchema,
  transactionCreateSchema, beneficiarySchema, transferSchema,
  watchlistSchema, watchlistItemSchema, alertSchema,
  adminStatusSchema, rateSchema,
};
