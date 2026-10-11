'use strict';
/**
 * Test terpisah untuk pembatasan laju (rate limiting).
 * Dipisah karena ambang batas dibaca dari environment saat modul dimuat.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

let base = '';
let ready = false;
let server = null;
let envHandle = null;
let db = null;

test.before(async () => {
  process.env.RATE_LIMIT_WINDOW_MS = '600000';
  process.env.RATE_LIMIT_AUTH_MAX = '4';
  process.env.RATE_LIMIT_SENSITIVE_MAX = '4';
  process.env.RATE_LIMIT_API_MAX = '1000';
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-secret-for-ratelimit';

  envHandle = await require('../helpers/db').setup();
  if (!envHandle) return;
  process.env.DATABASE_URL = envHandle.url;

  db = require('../../backend/config/db');
  const { up } = require('../../backend/services/migrationRunner');
  await up(db);
  const { createApp } = require('../../backend/app');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  ready = true;
});

test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (db) await db.pool.end().catch(() => {});
  if (envHandle) await envHandle.stop();
});

function attempt(i) {
  return new Promise((resolve, reject) => {
    const url = new URL(base + '/api/auth/login');
    const payload = JSON.stringify({ identifier: `u${i}@contoh.id`, password: 'salah12345' });
    const req = http.request(
      {
        hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => { d += c; });
        res.on('end', () => {
          let json = null; try { json = JSON.parse(d); } catch (_) { /* kosong */ }
          resolve({ status: res.statusCode, body: json, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

test('rate limiting: percobaan autentikasi berlebihan dibatasi dengan pesan Indonesia', async (t) => {
  if (!ready) return t.skip('PostgreSQL tidak tersedia — test rate limit dilewati.');
  const statuses = [];
  for (let i = 0; i < 8; i++) {
    const r = await attempt(i);
    statuses.push(r.status);
    if (r.status === 429) {
      assert.equal(r.body.success, false);
      assert.equal(r.body.error.code, 'RATE_LIMITED');
      assert.match(r.body.error.message, /Terlalu banyak percobaan/);
      assert.ok(!r.body.error.message.toLowerCase().includes('rate limit'),
        'pesan untuk pengguna harus berbahasa Indonesia, bukan istilah teknis');
      return;
    }
  }
  assert.fail(`dibatasi setelah ${statuses.filter((s) => s === 429).length} dari 8 percobaan (status: ${statuses.join(',')})`);
});
