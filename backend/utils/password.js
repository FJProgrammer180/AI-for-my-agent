'use strict';
const argon2 = require('argon2');
const { z } = require('zod');

const passwordSchema = z.string()
  .min(8, 'Kata sandi minimal 8 karakter.')
  .max(128, 'Kata sandi maksimal 128 karakter.')
  .regex(/[a-z]/, 'Kata sandi harus mengandung huruf kecil.')
  .regex(/[A-Z]/, 'Kata sandi harus mengandung huruf besar.')
  .regex(/[0-9]/, 'Kata sandi harus mengandung angka.');

async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch (_) {
    return false;
  }
}

function validatePasswordStrength(password) {
  const r = passwordSchema.safeParse(password);
  if (r.success) return { ok: true };
  return { ok: false, message: r.error.issues[0].message };
}

module.exports = { hashPassword, verifyPassword, validatePasswordStrength, passwordSchema };
