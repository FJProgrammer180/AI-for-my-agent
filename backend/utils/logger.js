'use strict';
/**
 * Logger terstruktur sederhana (JSON per baris).
 * Tidak pernah mencetak field sensitif.
 */
const SENSITIVE_KEYS = new Set([
  'password', 'password_hash', 'passwordHash', 'token', 'access_token',
  'refresh_token', 'otp', 'pin', 'secret', 'authorization', 'cookie',
  'token_hash', 'accessTokenEnc', 'refreshTokenEnc',
]);

function sanitize(value, depth = 0) {
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[redacted]' : sanitize(v, depth + 1);
    }
    return out;
  }
  return value;
}

function log(level, message, meta) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta ? { meta: sanitize(meta) } : {}),
  };
  const line = JSON.stringify(entry);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

/** Ringkas error menjadi string yang selalu informatif (beberapa error driver punya message kosong). */
function describe(err) {
  if (!err) return 'Unknown error';
  const code = err.code || err.sqlState || '';
  const msg = err.message && err.message.trim() ? err.message : String(err);
  return code ? `${code}: ${msg}` : msg;
}

module.exports = {
  describe,
  info: (msg, meta) => log('info', msg, meta),
  warn: (msg, meta) => log('warn', msg, meta),
  error: (msg, meta) => log('error', msg, meta),
};
