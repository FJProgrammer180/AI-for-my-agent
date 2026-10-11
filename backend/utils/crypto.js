'use strict';
const crypto = require('crypto');
const env = require('../config/env');

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Kunci enkripsi simetris diturunkan dari SESSION_SECRET (hanya di server). */
function deriveKey() {
  return crypto.scryptSync(env.SESSION_SECRET, 'finova-token-encryption', 32);
}

function encryptSecret(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

function decryptSecret(payload) {
  try {
    const raw = Buffer.from(payload, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch (_) {
    return null;
  }
}

module.exports = { randomToken, sha256, encryptSecret, decryptSecret };
