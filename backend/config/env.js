'use strict';
/**
 * Konfigurasi terpusat FINOVA. Semua nilai sensitif dibaca dari environment.
 */
const path = require('path');
const fs = require('fs');

// Muat .env sederhana (tanpa dependency tambahan)
const envPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  PUBLIC_URL: process.env.PUBLIC_URL || 'http://localhost:3000',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/finova',
  DATABASE_SSL: process.env.DATABASE_SSL === 'true',
  SESSION_SECRET: process.env.SESSION_SECRET || 'finova-dev-secret-do-not-use-in-prod',
  SESSION_TTL_HOURS: parseInt(process.env.SESSION_TTL_HOURS || '168', 10),
  COOKIE_SECURE: process.env.COOKIE_SECURE === 'true',
  MANDIRI_CLIENT_ID: process.env.MANDIRI_CLIENT_ID || '',
  MANDIRI_CLIENT_SECRET: process.env.MANDIRI_CLIENT_SECRET || '',
  MANDIRI_BASE_URL: process.env.MANDIRI_BASE_URL || '',
  MANDIRI_SNAPSHOT_PATH: process.env.MANDIRI_SNAPSHOT_PATH ||
    path.join(__dirname, '..', 'providers', 'snapshots', 'mandiri-demo.json'),
  MARKET_PROVIDER: process.env.MARKET_PROVIDER || 'snapshot',
  MARKET_SNAPSHOT_PATH: process.env.MARKET_SNAPSHOT_PATH ||
    path.join(__dirname, '..', 'providers', 'snapshots', 'market-snapshot.json'),
  TWELVEDATA_API_KEY: process.env.TWELVEDATA_API_KEY || '',
  DATABASE_POOL_MAX: Math.max(1, parseInt(process.env.DATABASE_POOL_MAX || '10', 10)),
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  RATE_LIMIT_AUTH_MAX: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '20', 10),
  RATE_LIMIT_SENSITIVE_MAX: parseInt(process.env.RATE_LIMIT_SENSITIVE_MAX || '10', 10),
  RATE_LIMIT_API_MAX: parseInt(process.env.RATE_LIMIT_API_MAX || '600', 10),
  IS_PROD: (process.env.NODE_ENV || 'development') === 'production',
};

if (env.IS_PROD && env.SESSION_SECRET.includes('dev-secret')) {
  throw new Error('SESSION_SECRET harus diatur dengan nilai acak yang kuat di production.');
}

module.exports = env;
