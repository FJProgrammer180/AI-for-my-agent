'use strict';
/**
 * Test latar belakang: pekerja akrual bunga, siklus pasar, dan kanal realtime
 * (WebSocket) — semuanya diuji terhadap PostgreSQL nyata.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

let server = null, wsHandle = null, base = '', ready = false, envHandle = null, db = null;
const jar = {};

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const payload = body ? JSON.stringify(body) : null;
    const h = { 'Content-Type': 'application/json', ...headers };
    if (jar.cookie) h.Cookie = jar.cookie;
    if (jar.csrf && method !== 'GET') h['X-CSRF-Token'] = jar.csrf;
    if (payload) h['Content-Length'] = Buffer.byteLength(payload);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method, headers: h },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          for (const c of res.headers['set-cookie'] || []) {
            const pair = c.split(';')[0]; const i = pair.indexOf('=');
            const map = {};
            (jar.cookie || '').split('; ').filter(Boolean).forEach((p) => { const k = p.indexOf('='); map[p.slice(0, k)] = p.slice(k + 1); });
            map[pair.slice(0, i)] = pair.slice(i + 1);
            jar.cookie = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
            if (map.finova_csrf) jar.csrf = map.finova_csrf;
          }
          let json = null; try { json = JSON.parse(d); } catch (_) { /* html */ }
          resolve({ status: res.statusCode, body: json, raw: d, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test.before(async () => {
  process.env.RATE_LIMIT_API_MAX = '50000';
  process.env.RATE_LIMIT_AUTH_MAX = '5000';
  process.env.RATE_LIMIT_SENSITIVE_MAX = '5000';
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'system-test-secret-value-32chars';
  envHandle = await require('../helpers/db').setup();
  if (!envHandle) return;
  process.env.DATABASE_URL = envHandle.url;
  db = require('../../backend/config/db');
  await require('../../backend/services/migrationRunner').up(db);
  await require('../../backend/scripts/seed').runSeed();

  const { createApp } = require('../../backend/app');
  const websocket = require('../../backend/websocket');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  wsHandle = websocket.attach(server);
  base = `http://127.0.0.1:${server.address().port}`;

  const reg = await request('POST', '/api/auth/register', {
    fullName: 'Sistem Uji', username: `sys_${Date.now() % 1e6}`, email: `sys-${Date.now()}@contoh.id`,
    password: 'Rahasia123', confirmPassword: 'Rahasia123', acceptTerms: true,
  });
  assert.equal(reg.status, 201, reg.raw);
  await request('POST', '/api/onboarding/complete', {});
  ready = true;
});

test.after(async () => {
  try { wsHandle?.close(); } catch (_) { /* diamkan */ }
  if (server) await new Promise((r) => server.close(r));
  if (db) await db.pool.end().catch(() => {});
  if (envHandle) await envHandle.stop();
});

const skip = (t) => { if (!ready) t.skip('PostgreSQL tidak tersedia — test sistem dilewati.'); };

test('pekerja pasar: menyegarkan data dari penyedia & mengembalikan ringkasan nyata', async (t) => {
  skip(t);
  const jobs = require('../../backend/workers/scheduledJobs');
  const r = await jobs.runMarketCycle();
  assert.equal(r.ok, true, r.error);
  assert.ok(r.assets > 0, 'aset snapshot tersedia');
  assert.ok(r.quotes > 0, 'kuotasi tersimpan');
  assert.ok(r.candles > 0, 'candle historis tersimpan');

  // harga yang sama harus terbaca lewat API (bukan angka acak per permintaan)
  const assets = (await request('GET', '/api/market/assets')).body.data.assets;
  const sym = assets[0].symbol;
  const q1 = (await request('GET', `/api/market/quotes/${sym}`)).body.data.quote;
  const q2 = (await request('GET', `/api/market/quotes/${sym}`)).body.data.quote;
  assert.equal(q1.price, q2.price, 'kuotasi stabil & berasal dari basis data');
  assert.equal(q1.isDelayed, true);
});

test('pekerja bunga: mencatat akrual sebagai estimasi & idempoten per tanggal', async (t) => {
  skip(t);
  const goal = (await request('POST', '/api/savings', {
    name: 'Akrual Pekerja', targetAmount: 10_000_000, interestRate: 6, interestMethod: 'SIMPLE_DAILY',
  })).body.data.goal;
  await request('POST', `/api/savings/${goal.id}/deposit`, { amount: 10_000_000 });

  // Mundurkan tanggal pembuatan 3 hari agar ada periode yang jatuh tempo terakru.
  await db.query('UPDATE savings_goals SET created_at = now() - interval \'3 days\' WHERE id = $1', [goal.id]);

  const jobs = require('../../backend/workers/scheduledJobs');
  const first = await jobs.runInterestCycle();
  assert.equal(first.ok, true, first.error);
  assert.ok(first.accrued >= 1, 'akrual tercatat untuk target dengan asumsi tarif');

  const hist = (await request('GET', '/api/interest/history')).body.data.history;
  const rec = hist.find((h) => h.goal_name === 'Akrual Pekerja');
  assert.ok(rec, 'riwayat bunga menampilkan record akrual');
  assert.equal(rec.is_estimate, true, 'selalu diberi label estimasi');
  assert.ok(Number(rec.interest_amount) >= 0);
  assert.equal(Number(rec.rate_annual), 6);

  const before = hist.length;
  await jobs.runInterestCycle();
  const after = (await request('GET', '/api/interest/history')).body.data.history.length;
  assert.equal(after, before, 'akrual untuk tanggal yang sama tidak boleh tercatat dua kali');
});

test('websocket: menolak koneksi tanpa sesi & mengirim isyarat setelah perubahan', async (t) => {
  skip(t);
  const WebSocket = require('ws');
  const wsBase = base.replace('http://', 'ws://');

  // 1) tanpa cookie → ditolak
  const anon = await new Promise((resolve) => {
    const s = new WebSocket(wsBase + '/ws');
    s.on('close', (code) => resolve(code));
    s.on('error', () => resolve('error'));
    setTimeout(() => resolve('timeout'), 2500);
  });
  assert.equal(anon, 1008, 'koneksi tanpa sesi harus ditutup (policy violation)');

  // 2) dengan cookie sesi → menerima sinyal setelah setoran tabungan
  const messages = [];
  const sock = new WebSocket(wsBase + '/ws', { headers: { Cookie: jar.cookie } });
  await new Promise((resolve, reject) => {
    sock.on('open', resolve);
    sock.on('error', reject);
    setTimeout(() => reject(new Error('websocket tidak terbuka')), 3000);
  });
  sock.on('message', (buf) => messages.push(JSON.parse(buf.toString('utf8'))));
  await new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      if (messages.some((m) => m.type === 'ready')) return resolve();
      if (Date.now() - t0 > 4000) return reject(new Error('pesan ready tidak diterima'));
      setTimeout(tick, 50);
    };
    tick();
  });

  // Setoran yang mencapai target → sistem membuat notifikasi → isyarat dikirim
  const goal = (await request('POST', '/api/savings', { name: 'Sinyal Realtime', targetAmount: 2_000_000 })).body.data.goal;
  await request('POST', `/api/savings/${goal.id}/deposit`, { amount: 2_000_000 });
  await new Promise((r) => setTimeout(r, 2200)); // jendela penggabungan isyarat 1,5 dtk
  sock.close();

  const hint = messages.find((m) => m.type === 'notifications:changed');
  assert.ok(hint, `sinyal perubahan dikirim (pesan: ${messages.map((m) => m.type).join(',')})`);
  assert.equal(hint.payload.userId, (await request('GET', '/api/auth/me')).body.data.user.id);
  // isyarat hanya memberi tahu; isi notifikasi diambil dari API
  const notif = (await request('GET', '/api/notifications?limit=5')).body.data.notifications;
  assert.ok(notif.length > 0, 'data nyata tetap berasal dari database');
});

test('websocket: tidak pernah menerima angka keuangan dari kanal realtime', async (t) => {
  skip(t);
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', '..', 'backend', 'websocket', 'index.js'), 'utf8'
  );
  assert.ok(!/balance|amount/.test(src), 'kanal realtime tidak mengirim saldo/jumlah — hanya isyarat');
});

test('migrasi: status & rollback memerlukan konfirmasi eksplisit', async (t) => {
  skip(t);
  const runner = require('../../backend/services/migrationRunner');
  const st = await runner.status(db);
  assert.ok(st.length >= 1 && st.every((s) => s.applied), 'semua migrasi tercatat diterapkan');

  await assert.rejects(() => runner.down(db), /konfirmasi eksplisit/, 'down tanpa --force harus ditolak');
});

test('log server tidak membocorkan rahasia', async (t) => {
  skip(t);
  const logger = require('../../backend/utils/logger');
  const chunks = [];
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (c) => { chunks.push(String(c)); return true; };
  try {
    logger.info('uji', { password: 'Rahasia123', token: 'abc', email: 'a@b.co', nested: { access_token: 'xyz' } });
  } finally {
    process.stdout.write = write;
  }
  const out = chunks.join('');
  assert.ok(!/Rahasia123/.test(out), 'kata sandi tidak pernah ditulis ke log');
  assert.ok(!/"token":"abc"/.test(out), 'token tidak pernah ditulis ke log');
  assert.ok(!/xyz/.test(out), 'access_token bersarang diredam');
  assert.match(out, /"email":"a@b.co"/, 'field non-sensitif tetap tercatat');
});
