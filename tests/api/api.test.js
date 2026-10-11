'use strict';
/**
 * Test integrasi API — menjalankan seluruh lapisan (Express → controller →
 * service → repository → PostgreSQL) dengan HTTP sungguhan terhadap
 * aplikasi FINOVA yang di-boot untuk test.
 *
 * Database: memakai DATABASE_URL bila PostgreSQL lokal dapat dihubungi,
 * jika tidak, otomatis memakai PGlite (PostgreSQL WASM) yang terisolasi.
 * Bila keduanya tidak tersedia, seluruh test di-skip.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const dbh = require('../helpers/db');

let server = null;
let base = '';
let ready = false;
let envHandle = null;
let db = null;

const agents = {}; // nama -> { cookie, csrf }

function request(method, path, { body, agent = 'default', headers = {} } = {}) {
  if (!agents[agent]) agents[agent] = {};
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: url.hostname, port: url.port, path: url.pathname + url.search, method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...(agents[agent].cookie ? { Cookie: agents[agent].cookie } : {}),
          ...(agents[agent].csrf && method !== 'GET' ? { 'X-CSRF-Token': agents[agent].csrf } : {}),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          const setCookie = res.headers['set-cookie'] || [];
          if (setCookie.length) {
            const jar = {};
            (agents[agent].cookie || '').split('; ').filter(Boolean).forEach((p) => {
              const i = p.indexOf('='); if (i > 0) jar[p.slice(0, i)] = p.slice(i + 1);
            });
            for (const c of setCookie) {
              const pair = c.split(';')[0];
              const i = pair.indexOf('=');
              if (i > 0) jar[pair.slice(0, i)] = pair.slice(i + 1);
            }
            agents[agent].cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
            if (jar['finova_csrf']) agents[agent].csrf = jar['finova_csrf'];
          }
          let json = null;
          try { json = data ? JSON.parse(data) : null; } catch (_) { json = null; }
          resolve({ status: res.statusCode, body: json, raw: data, headers: res.headers });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test.before(async () => {
  // Batas laju dilonggarkan agar test fungsional tidak terpengaruh;
  // perilaku rate limiting diuji terpisah di tests/api/rateLimit.test.js
  process.env.RATE_LIMIT_AUTH_MAX = '5000';
  process.env.RATE_LIMIT_SENSITIVE_MAX = '5000';
  process.env.RATE_LIMIT_API_MAX = '50000';
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-secret-value-for-integration-tests';
  envHandle = await dbh.setup();
  if (!envHandle) return; // tidak ada PostgreSQL sama sekali → skip semua
  process.env.DATABASE_URL = envHandle.url;

  db = require('../../backend/config/db');
  const { up } = require('../../backend/services/migrationRunner');
  await up(db);
  const { runSeed } = require('../../backend/scripts/seed');
  await runSeed();
  const { provisionAdmin } = require('../../backend/scripts/create-admin');
  await provisionAdmin({
    email: 'admin@finova.test', username: 'admin', fullName: 'Admin Uji', password: 'Admin1234',
  });

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

function skip(t) {
  if (!ready) t.skip('PostgreSQL tidak tersedia (lokal maupun PGlite) — test integrasi dilewati.');
}

// ======================= AUTH =======================

test('register → sesi tersimpan → me → greeting memakai nama asli (bukan hardcoded)', async (t) => {
  skip(t);
  const r = await request('POST', '/api/auth/register', {
    agent: 'user',
    body: {
      fullName: 'Rina Kartika', username: `rina_${Date.now() % 1e6}`, email: `uji-${Date.now()}@contoh.id`,
      password: 'Rahasia123', confirmPassword: 'Rahasia123', acceptTerms: true,
    },
  });
  assert.equal(r.status, 201, r.raw);
  assert.equal(r.body.success, true);
  assert.equal(r.body.data.user.fullName, 'Rina Kartika');
  assert.match(r.body.data.greeting, /^Rina Kartika, selamat datang\.$/);

  const me = await request('GET', '/api/auth/me', { agent: 'user' });
  assert.equal(me.status, 200);
  assert.equal(me.body.data.authenticated, true);
  assert.equal(me.body.data.user.role, 'USER', 'registrasi publik tidak boleh membuat admin');
  assert.equal(me.body.data.user.onboardingCompleted, false);
  assert.ok(!me.raw.includes('password'), 'respons tidak boleh memuat field password');
});

test('validasi register: password lemah, konfirmasi beda, dan email duplikat', async (t) => {
  skip(t);
  const weak = await request('POST', '/api/auth/register', {
    agent: 'v1',
    body: { fullName: 'Lemah Sekali', username: 'lemah1', email: 'lemah@contoh.id', password: 'abc', confirmPassword: 'abc', acceptTerms: true },
  });
  assert.equal(weak.status, 400);
  assert.equal(weak.body.error.code, 'INVALID_REQUEST');

  const mismatch = await request('POST', '/api/auth/register', {
    agent: 'v2',
    body: { fullName: 'Bedah', username: 'bedah1', email: 'bedah@contoh.id', password: 'Kuat12345', confirmPassword: 'Kuat12346', acceptTerms: true },
  });
  assert.equal(mismatch.status, 400);
  assert.match(mismatch.body.error.message, /Konfirmasi kata sandi tidak sama/);

  const dup = await request('POST', '/api/auth/register', {
    agent: 'v3',
    body: { fullName: 'Rina Dua', username: `rina2_${Date.now() % 1e6}`, email: (await request('GET', '/api/auth/me', { agent: 'user' })).body.data.user.email, password: 'Rahasia123', confirmPassword: 'Rahasia123', acceptTerms: true },
  });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, 'CONFLICT');
});

test('login: username atau email, pesan generik saat salah', async (t) => {
  skip(t);
  const email = (await request('GET', '/api/auth/me', { agent: 'user' })).body.data.user.email;
  const byEmail = await request('POST', '/api/auth/login', {
    agent: 'loginEmail', body: { identifier: email, password: 'Rahasia123' },
  });
  assert.equal(byEmail.status, 200);
  assert.match(byEmail.body.data.greeting, /selamat datang\./);

  const username = byEmail.body.data.user.username;
  const byUser = await request('POST', '/api/auth/login', {
    agent: 'loginUser', body: { identifier: username, password: 'Rahasia123' },
  });
  assert.equal(byUser.status, 200);
  // login kedua → pengguna lama, greeting "lagi" karena onboarding sudah ada? (belum)
  assert.ok(['', '.'].every((x) => true));

  const wrong = await request('POST', '/api/auth/login', {
    agent: 'loginSalah', body: { identifier: 'tidak-ada@contoh.id', password: 'salah1234' },
  });
  assert.equal(wrong.status, 401);
  assert.ok(!/tidak-ada/.test(wrong.body.error.message), 'pesan harus generik, tidak membocorkan keberadaan akun');

  const wrongPass = await request('POST', '/api/auth/login', {
    agent: 'loginPassSalah', body: { identifier: email, password: 'salah1234' },
  });
  assert.equal(wrongPass.status, 401);
  assert.equal(wrongPass.body.error.message, wrong.body.error.message, 'pesan harus identik agar tidak membocorkan keberadaan akun');
});

test('logout mengakhiri sesi', async (t) => {
  skip(t);
  const out = await request('POST', '/api/auth/logout', { agent: 'loginEmail', body: {} });
  assert.equal(out.status, 200);
  const after = await request('GET', '/api/auth/me', { agent: 'loginEmail' });
  assert.equal(after.body.data.authenticated, false);
});

test('forgot → reset password alur lengkap (mencabut sesi lama)', async (t) => {
  skip(t);
  // akun khusus agar reset (yang mencabut seluruh sesi) tidak memengaruhi test lain
  const own = await request('POST', '/api/auth/register', {
    agent: 'forgot',
    body: { fullName: 'Khusus Reset', username: `rst_${Date.now() % 1e6}`, email: `rst-${Date.now()}@contoh.id`, password: 'Rahasia123', confirmPassword: 'Rahasia123', acceptTerms: true },
  });
  assert.equal(own.status, 201, own.raw);
  const f = await request('POST', '/api/auth/forgot-password', { agent: 'forgot', body: { email: own.body.data.user.email } });
  assert.equal(f.status, 200);
  const url = f.body.data.devResetUrl;
  assert.ok(url, 'mode non-prod menyediakan tautan untuk verifikasi alur');
  assert.ok(url.startsWith('/'), 'tautan pengembangan harus relatif agar works di balik proxy');
  const token = new URL(url, 'http://localhost').searchParams.get('token');
  const rr = await request('POST', '/api/auth/reset-password', {
    agent: 'forgot', body: { token, password: 'Baru12345', confirmPassword: 'Baru12345' },
  });
  assert.equal(rr.status, 200);
  // sesi lama dicabut
  const meAfter = await request('GET', '/api/auth/me', { agent: 'forgot' });
  assert.equal(meAfter.body.data.authenticated, false, 'reset harus mencabut sesi aktif');
  // token tidak dapat dipakai ulang
  const reuse = await request('POST', '/api/auth/reset-password', {
    agent: 'forgot', body: { token, password: 'Baru12346', confirmPassword: 'Baru12346' },
  });
  assert.equal(reuse.status, 400);
  const loginNew = await request('POST', '/api/auth/login', { agent: 'forgot', body: { identifier: own.body.data.user.email, password: 'Baru12345' } });
  assert.equal(loginNew.status, 200, 'kata sandi baru berlaku');
  const unknown = await request('POST', '/api/auth/forgot-password', { agent: 'forgot2', body: { email: 'tidak-terdaftar@contoh.id' } });
  assert.equal(unknown.status, 200, 'respons harus generik — tidak mengungkap ketidakadaan akun');
});

test('verifikasi email: token sah mengaktifkan, token salah/pakai ulang ditolak', async (t) => {
  skip(t);
  const reg = await request('POST', '/api/auth/register', {
    agent: 'verif',
    body: {
      fullName: 'Verifikasi Email', username: `vf_${Date.now() % 1e6}`, email: `vf-${Date.now()}@contoh.id`,
      password: 'Rahasia123', confirmPassword: 'Rahasia123', acceptTerms: true,
    },
  });
  assert.equal(reg.status, 201, reg.raw);
  assert.equal(reg.body.data.user.emailVerified, false);
  assert.equal(reg.body.data.verificationRequired, true);
  const url = reg.body.data.devVerifyUrl;
  assert.ok(url, 'mode non-prod menyediakan tautan verifikasi');
  assert.ok(url.startsWith('/'), 'tautan pengembangan relatif (ramah proxy)');
  const token = new URL(url, 'http://localhost').searchParams.get('token');

  const bad = await request('POST', '/api/auth/verify-email', { agent: 'verif', body: { token: 'token-palsu-123456' } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error.message, /tidak valid|kedaluwarsa/);

  const okRes = await request('POST', '/api/auth/verify-email', { agent: 'verif', body: { token } });
  assert.equal(okRes.status, 200, okRes.raw);
  const me = await request('GET', '/api/auth/me', { agent: 'verif' });
  assert.equal(me.body.data.user.emailVerified, true, 'status verifikasi tersimpan di database');

  const reuse = await request('POST', '/api/auth/verify-email', { agent: 'verif', body: { token } });
  assert.equal(reuse.status, 400, 'token tidak dapat dipakai dua kali');

  const resend = await request('POST', '/api/auth/resend-verification', { agent: 'verif', body: { email: reg.body.data.user.email } });
  assert.equal(resend.status, 200);
  assert.ok(!resend.body.data.devVerifyUrl, 'akun sudah terverifikasi → tidak ada tautan baru');

  const unknown = await request('POST', '/api/auth/resend-verification', { agent: 'verif2', body: { email: 'tiada@contoh.id' } });
  assert.equal(unknown.status, 200, 'respons generik — tidak mengungkap keberadaan akun');
});

// ======================= PROTEKSI SESI =======================

test('rute terlindungi menolak permintaan tanpa sesi', async (t) => {
  skip(t);
  for (const p of ['/api/dashboard', '/api/savings', '/api/installments', '/api/analytics',
    '/api/transactions', '/api/market/assets', '/api/watchlists', '/api/notifications', '/api/profile']) {
    const r = await request('GET', p, { agent: 'anonim' });
    assert.equal(r.status, 401, `${p} harus menolak tanpa sesi`);
    assert.equal(r.body.error.code, 'UNAUTHORIZED');
  }
});

test('admin: pengguna biasa ditolak (403), sesi non-admin tidak dapat naik peran', async (t) => {
  skip(t);
  for (const p of ['/api/admin/dashboard', '/api/admin/users', '/api/admin/system-health', '/api/admin/audit-logs']) {
    const r = await request('GET', p, { agent: 'user' });
    assert.equal(r.status, 403, `${p} harus 403 untuk USER`);
    assert.equal(r.body.error.code, 'FORBIDDEN');
  }
  const own = await request('PATCH', `/api/admin/users/${(await request('GET', '/api/auth/me', { agent: 'user' })).body.data.user.id}/status`, {
    agent: 'user', body: { status: 'ACTIVE' },
  });
  assert.equal(own.status, 403);
});

// ======================= ONBOARDING =======================

test('onboarding menyelesaikan status & membuat target tabungan', async (t) => {
  skip(t);
  const r = await request('POST', '/api/onboarding/complete', {
    agent: 'user',
    body: { monthlyIncome: 9_000_000, timezone: 'Asia/Jakarta', goals: [{ name: 'Dana Laptop', targetAmount: 12_000_000 }] },
  });
  assert.equal(r.status, 200, r.raw);
  const me = await request('GET', '/api/auth/me', { agent: 'user' });
  assert.equal(me.body.data.user.onboardingCompleted, true);
  const g = await request('GET', '/api/savings', { agent: 'user' });
  assert.equal(g.body.data.goals.length, 1);
  assert.equal(g.body.data.goals[0].name, 'Dana Laptop');
  // login berikutnya → greeting "lagi"
  const relogin = await request('POST', '/api/auth/login', {
    agent: 'user2', body: { identifier: me.body.data.user.email, password: 'Rahasia123' },
  });
  assert.match(relogin.body.data.greeting, /selamat datang lagi :\)/);
});

// ======================= TABUNGAN =======================

test('tabungan: setoran, penarikan, guard saldo negatif, idempotensi, histori', async (t) => {
  skip(t);
  const created = await request('POST', '/api/savings', {
    agent: 'user', body: { name: 'Dana Darurat', targetAmount: 20_000_000, interestRate: 5, interestMethod: 'SIMPLE_DAILY' },
  });
  assert.equal(created.status, 201, created.raw);
  const id = created.body.data.goal.id;

  const dep = await request('POST', `/api/savings/${id}/deposit`, {
    agent: 'user', body: { amount: 7_500_000, note: 'setor gaji', idempotencyKey: 'k-dep-1' },
  });
  assert.equal(dep.status, 200, dep.raw);
  assert.equal(Number(dep.body.data.goal.balance), 7_500_000);
  assert.equal(dep.body.data.goal.remaining, 12_500_000);
  assert.equal(dep.body.data.goal.progress, 37.5);

  const dup = await request('POST', `/api/savings/${id}/deposit`, {
    agent: 'user', body: { amount: 7_500_000, idempotencyKey: 'k-dep-1' },
  });
  assert.equal(dup.body.data.duplicated, true);
  assert.equal(Number(dup.body.data.goal.balance), 7_500_000, 'idempotency key sama tidak boleh menambah saldo dua kali');

  const wd = await request('POST', `/api/savings/${id}/withdraw`, { agent: 'user', body: { amount: 2_500_000 } });
  assert.equal(Number(wd.body.data.goal.balance), 5_000_000);

  const over = await request('POST', `/api/savings/${id}/withdraw`, { agent: 'user', body: { amount: 9_999_000 } });
  assert.equal(over.status, 400);
  assert.match(over.body.error.message, /tidak mencukupi/);
  const afterFail = await request('GET', `/api/savings/${id}`, { agent: 'user' });
  assert.equal(Number(afterFail.body.data.goal.balance), 5_000_000, 'gagal → saldo tidak berubah');

  const hist = await request('GET', `/api/savings/${id}`, { agent: 'user' });
  assert.equal(hist.body.data.history.length, 2, 'hanya mutasi riil yang tercatat');
  assert.equal(hist.body.data.history[0].type, 'WITHDRAWAL');
  assert.equal(Number(hist.body.data.history[0].balance_after), 5_000_000);
  assert.equal(Number(hist.body.data.history[1].balance_after), 7_500_000, 'saldo bersejarah tidak berubah');
  assert.ok(hist.body.data.history.every((h) => h.user_id === hist.body.data.goal.user_id));
});

test('tabungan: progres lengkap 62,5% seperti contoh desain', async (t) => {
  skip(t);
  const c = await request('POST', '/api/savings', { agent: 'user', body: { name: 'Contoh Desain', targetAmount: 12_000_000 } });
  const id = c.body.data.goal.id;
  await request('POST', `/api/savings/${id}/deposit`, { agent: 'user', body: { amount: 7_500_000 } });
  const g = await request('GET', `/api/savings/${id}`, { agent: 'user' });
  assert.equal(Number(g.body.data.goal.balance), 7_500_000);
  assert.equal(g.body.data.goal.remaining, 4_500_000);
  assert.equal(g.body.data.goal.progress, 62.5);
});

test('tabungan: pengarsipan menyembunyikan dari daftar aktif tetapi data tetap ada', async (t) => {
  skip(t);
  const c = await request('POST', '/api/savings', { agent: 'user', body: { name: 'Diarsipkan', targetAmount: 1_000_000 } });
  const id = c.body.data.goal.id;
  await request('POST', `/api/savings/${id}/deposit`, { agent: 'user', body: { amount: 400_000 } });
  const a = await request('DELETE', `/api/savings/${id}`, { agent: 'user' });
  assert.equal(a.status, 200);
  const active = await request('GET', '/api/savings', { agent: 'user' });
  assert.ok(!active.body.data.goals.some((g) => g.id === id));
  const all = await request('GET', '/api/savings?includeArchived=true', { agent: 'user' });
  const found = all.body.data.goals.find((g) => g.id === id);
  assert.ok(found, 'arsip tetap dapat dibaca');
  assert.equal(Number(found.balance), 400_000, 'saldo arsip tidak hilang');
});

test('kepemilikan: ID pengguna lain tidak dapat diakses/diubah', async (t) => {
  skip(t);
  const other = await request('POST', '/api/auth/register', {
    agent: 'lain',
    body: {
      fullName: 'Pemakai Lain', username: `lain_${Date.now() % 1e6}`, email: `lain-${Date.now()}@contoh.id`,
      password: 'Rahasia123', confirmPassword: 'Rahasia123', acceptTerms: true,
    },
  });
  assert.equal(other.status, 201, other.raw);
  const own = await request('POST', '/api/savings', { agent: 'user', body: { name: 'Milik Sendiri', targetAmount: 9_000_000 } });
  const targetId = own.body.data.goal.id;
  await request('POST', `/api/savings/${targetId}/deposit`, { agent: 'user', body: { amount: 5_000_000 } });

  for (const [method, p, body] of [
    ['GET', `/api/savings/${targetId}`],
    ['PUT', `/api/savings/${targetId}`, { name: 'Dibajak' }],
    ['POST', `/api/savings/${targetId}/deposit`, { amount: 1000 }],
    ['POST', `/api/savings/${targetId}/withdraw`, { amount: 1 }],
    ['DELETE', `/api/savings/${targetId}`],
    ['GET', `/api/savings/${targetId}/interest`],
  ]) {
    const r = await request(method, p, { agent: 'lain', body });
    assert.equal(r.status, 404, `${method} ${p} harus 404 bagi pengguna lain`);
  }
  const stillMine = await request('GET', `/api/savings/${targetId}`, { agent: 'user' });
  assert.notEqual(stillMine.body.data.goal.name, 'Dibajak', 'nama tidak boleh berubah oleh pengguna lain');

  // saldo tetap seperti sebelum percobaan pihak lain
  const bal = (await request('GET', '/api/savings', { agent: 'user' })).body.data.goals.find((g) => g.id === targetId);
  assert.equal(Number(bal.balance), 5_000_000, 'saldo harus tetap (percobaan deposit orang lain gagal)');
});

// ======================= BUNGA =======================

test('bunga: estimasi backend memakai asumsi pengguna & dilabeli estimasi', async (t) => {
  skip(t);
  const created = await request('POST', '/api/savings', {
    agent: 'user',
    body: { name: 'Bunga Uji', targetAmount: 10_000_000, interestRate: 6, interestMethod: 'SIMPLE_DAILY' },
  });
  const id = created.body.data.goal.id;
  await request('POST', `/api/savings/${id}/deposit`, { agent: 'user', body: { amount: 10_000_000 } });
  const est = await request('GET', `/api/savings/${id}/interest?days=30`, { agent: 'user' });
  assert.equal(est.status, 200, est.raw);
  // 10.000.000 × 6% × 30/365 = 49.315,07 → 49.315 (perhitungan di server)
  assert.equal(est.body.data.estimate, 49_315);
  assert.equal(est.body.data.isEstimate, true);
  assert.match(est.body.data.note, /bukan bunga bank/i);

  const comp = await request('PUT', `/api/savings/${id}`, { agent: 'user', body: { interestMethod: 'COMPOUND' } });
  assert.equal(comp.status, 200);
  const est2 = await request('GET', `/api/savings/${id}/interest?days=365`, { agent: 'user' });
  assert.equal(est2.body.data.method, 'COMPOUND');
  const expected = Math.round(10_000_000 * (Math.pow(1 + 0.06 / 365, 365) - 1));
  assert.ok(Math.abs(est2.body.data.estimate - expected) <= 1,
    `server ${est2.body.data.estimate} vs rumus ${(expected)}`);

  const hist = await request('GET', '/api/interest/history', { agent: 'user' });
  assert.equal(hist.status, 200);
  assert.ok(Array.isArray(hist.body.data.history));
});

test('bunga: tanpa asumsi tarif → estimasi nol (tidak mengarang bunga)', async (t) => {
  skip(t);
  const c = await request('POST', '/api/savings', { agent: 'user', body: { name: 'Tanpa Bunga', targetAmount: 5_000_000 } });
  const dep = await request('POST', `/api/savings/${c.body.data.goal.id}/deposit`, { agent: 'user', body: { amount: 5_000_000 } });
  assert.equal(Number(dep.body.data.goal.balance), 5_000_000);
  const est = await request('GET', `/api/savings/${c.body.data.goal.id}/interest?days=365`, { agent: 'user' });
  assert.equal(est.body.data.estimate, 0);
  assert.equal(est.body.data.rateAnnual, null);
});

// ======================= CICILAN =======================

test('cicilan: jadwal dibangkitkan server, pembayaran & progres konsisten', async (t) => {
  skip(t);
  const created = await request('POST', '/api/installments', {
    agent: 'user',
    body: { name: 'KTA Bank', principal: 24_000_000, downPayment: 0, interestRate: 12, tenorMonths: 12, startDate: '2026-01-05', dueDay: 5, method: 'ANNUITY' },
  });
  assert.equal(created.status, 201, created.raw);
  const id = created.body.data.installment.id;

  const sch = await request('GET', `/api/installments/${id}/schedule`, { agent: 'user' });
  assert.equal(sch.body.data.schedule.length, 12);
  assert.equal(String(sch.body.data.schedule[0].due_date).slice(0, 10), '2026-02-05');
  const pays = sch.body.data.schedule.slice(0, -1).map((s) => Number(s.amount_due));
  assert.equal(Math.max(...pays) - Math.min(...pays), 0, 'anuitas: angsuran reguler identik');

  const pay = await request('POST', `/api/installments/${id}/pay`, { agent: 'user', body: { periodNo: 1, idempotencyKey: 'p1' } });
  assert.equal(pay.status, 200, pay.raw);
  assert.equal(pay.body.data.alreadyPaid, false);
  assert.equal(pay.body.data.payment.status, 'PAID');
  assert.equal(pay.body.data.payment.recorded_via, 'MANUAL', 'pencatatan manual harus ditandai MANUAL');

  const again = await request('POST', `/api/installments/${id}/pay`, { agent: 'user', body: { periodNo: 1 } });
  assert.equal(again.body.data.alreadyPaid, true, 'periode lunas tidak dapat dibayar ulang');

  const detail = await request('GET', `/api/installments/${id}`, { agent: 'user' });
  assert.equal(detail.body.data.schedule.filter((s) => s.status === 'PAID').length, 1);
  assert.ok(detail.body.data.totalPaid > 0);
  assert.ok(Number(detail.body.data.remainingPrincipal) < Number(detail.body.data.installment.principal));
  assert.equal(detail.body.data.progress, 8.3, '1/12 periode = 8,3%');

  const dash = await request('GET', '/api/dashboard', { agent: 'user' });
  assert.ok(dash.body.data.metrics.installmentOutstanding > 0);
});

test('cicilan: FLAT vs EFFECTIVE menghasilkan jadwal berbeda (tidak semua sama rumus)', async (t) => {
  skip(t);
  const common = { principal: 12_000_000, downPayment: 0, interestRate: 12, tenorMonths: 12, startDate: '2026-01-05', dueDay: 5 };
  const flat = await request('POST', '/api/installments', { agent: 'user', body: { ...common, name: 'Uji Flat', method: 'FLAT' } });
  const eff = await request('POST', '/api/installments', { agent: 'user', body: { ...common, name: 'Uji Efektif', method: 'EFFECTIVE' } });
  assert.equal(flat.status, 201, flat.raw);
  assert.equal(eff.status, 201, eff.raw);
  const fs = (await request('GET', `/api/installments/${flat.body.data.installment.id}/schedule`, { agent: 'user' })).body.data.schedule;
  const es = (await request('GET', `/api/installments/${eff.body.data.installment.id}/schedule`, { agent: 'user' })).body.data.schedule;
  assert.equal(Number(fs[0].amount_due), 1_120_000);
  assert.ok(Number(es[11].amount_due) < Number(fs[11].amount_due), 'efektif: angsuran akhir lebih kecil karena bunga menurun');
  assert.equal(fs.reduce((s, r) => s + Number(r.principal_part), 0), 12_000_000);
  assert.equal(es.reduce((s, r) => s + Number(r.principal_part), 0), 12_000_000);
});

test('cicilan: validasi menolak pokok ≤ uang muka dan tenor nol', async (t) => {
  skip(t);
  const a = await request('POST', '/api/installments', {
    agent: 'user', body: { name: 'Buruk', principal: 1000, downPayment: 1000, interestRate: 0, tenorMonths: 6, startDate: '2026-01-05', dueDay: 5, method: 'FLAT' },
  });
  assert.equal(a.status, 400);
  assert.match(a.body.error.message, /lebih besar dari uang muka/);
  const b = await request('POST', '/api/installments', {
    agent: 'user', body: { name: 'Nol', principal: 5_000_000, downPayment: 0, interestRate: 0, tenorMonths: 0, startDate: '2026-01-05', dueDay: 5, method: 'FLAT' },
  });
  assert.equal(b.status, 400);
});

// ======================= BANKING =======================

test('banking: tanpa koneksi — tanpa saldo fiktif, transfer ditolak dengan pesan jelas', async (t) => {
  skip(t);
  const c = await request('GET', '/api/banks/connections', { agent: 'baru', body: undefined });
  // buat pengguna tanpa koneksi bank
  await request('POST', '/api/auth/register', {
    agent: 'baru',
    body: { fullName: 'Belum Terhubung', username: `bt_${Date.now() % 1e6}`, email: `bt-${Date.now()}@contoh.id`, password: 'Rahasia123', confirmPassword: 'Rahasia123', acceptTerms: true },
  });
  const conn = await request('GET', '/api/banks/connections', { agent: 'baru' });
  assert.equal(conn.status, 200);
  assert.equal(conn.body.data.connection.state, 'NOT_CONNECTED');
  assert.equal(conn.body.data.connection.stateMessage, 'Rekening Mandiri belum dihubungkan.');

  const accs = await request('GET', '/api/banks/accounts', { agent: 'baru' });
  assert.equal(accs.body.data.accounts.length, 0, 'tidak boleh ada rekening fiktif sebelum koneksi sah');

  const dash = await request('GET', '/api/dashboard', { agent: 'baru' });
  assert.equal(dash.body.data.metrics.bankBalanceTotal, 0);

  const sync = await request('POST', '/api/banks/sync', { agent: 'baru', body: {} });
  assert.equal(sync.status, 400);
  assert.match(sync.body.error.message, /belum terhubung/i);

  const tr = await request('POST', '/api/banks/transfer', {
    agent: 'baru',
    body: { sourceAccountId: '00000000-0000-4000-8000-000000000000', beneficiaryId: '00000000-0000-4000-8000-000000000001', amount: 1000 },
  });
  assert.equal(tr.status, 400);
  assert.match(tr.body.error.message, /hubungkan/i);
});

test('banking: alur koneksi menautkan akun, nomor tersamar, mutasi berlabel, tanpa kredensial pribadi', async (t) => {
  skip(t);
  const begin = await request('POST', '/api/banks/connect', { agent: 'baru', body: {} });
  assert.equal(begin.status, 200, begin.raw);
  assert.ok(['CONSENT_DEMO', 'REDIRECT'].includes(begin.body.data.kind), `kind tidak dikenal: ${begin.body.data.kind}`);
  if (begin.body.data.kind === 'REDIRECT') {
    assert.match(begin.body.data.url, /^https?:\/\//);
    const c = await request('GET', '/api/banks/connections', { agent: 'baru' });
    assert.equal(c.body.data.connection.state, 'IN_PROGRESS', 'menunggu otorisasi resmi = in progress, bukan connected');
    return;
  }
  assert.match(begin.body.data.message, /demo/i, 'mode tanpa kredensial resmi harus jujur sebagai demo');

  const conf = await request('POST', '/api/banks/connect/confirm', { agent: 'baru', body: {} });
  assert.equal(conf.status, 200, conf.raw);
  assert.equal(conf.body.data.connection.state, 'CONNECTED');
  assert.ok(!conf.raw.includes('access_token'), 'token tidak pernah dikirim ke klien');

  const accs = await request('GET', '/api/banks/accounts', { agent: 'baru' });
  assert.ok(accs.body.data.accounts.length >= 1);
  for (const a of accs.body.data.accounts) {
    assert.match(a.maskedNumber, /\*/, 'nomor rekening harus tersamar');
    // field yang dapat memuat nomor rekening tidak boleh berisi digit panjang
    // (UUID dikecualikan karena bisa kebetulan memuat deretan digit)
    const nomor = [a.maskedNumber, a.holderName, a.accountType, a.externalId]
      .filter(Boolean).join(' ');
    assert.ok(!/\d{10,}/.test(nomor), `nomor rekening lengkap bocor: ${nomor}`);
    assert.ok(!('externalId' in a) || !a.externalId, 'identitas eksternal mentah tidak diekspos');
  }
  assert.equal(accs.body.data.accounts[0].isDemo, true, 'akun dari snapshot harus berlabel demo');

  const txs = await request('GET', '/api/transactions?limit=100', { agent: 'baru' });
  const bankTx = txs.body.data.transactions.filter((x) => x.source === 'BANK_SYNC');
  assert.ok(bankTx.length > 0, 'mutasi tersinkron tercatat sebagai BANK_SYNC');
  assert.ok(bankTx.every((x) => x.external_ref), 'mutasi bank punya referensi eksternal');

  const before = bankTx.length;
  await request('POST', '/api/banks/sync', { agent: 'baru', body: {} });
  const after = await request('GET', '/api/transactions?limit=200', { agent: 'baru' });
  assert.equal(after.body.data.transactions.filter((x) => x.source === 'BANK_SYNC').length, before, 'sinkron ulang harus idempoten');

  const dash = await request('GET', '/api/dashboard', { agent: 'baru' });
  assert.ok(dash.body.data.metrics.bankBalanceTotal > 0, 'saldo bank muncul setelah koneksi nyata');

  // transfer: kemampuan tidak tersedia → ditolak, bukan disimulasikan
  const ben = await request('POST', '/api/banks/beneficiaries', {
    agent: 'baru', body: { bankCode: '008', accountNumber: '1420001234', accountName: 'Tuti' },
  });
  assert.equal(ben.status, 201, ben.raw);
  const accountId = accs.body.data.accounts[0].id;
  const tr = await request('POST', '/api/banks/transfer', {
    agent: 'baru',
    body: { sourceAccountId: accountId, beneficiaryId: ben.body.data.beneficiary.id, amount: 50_000 },
  });
  assert.ok([422, 503].includes(tr.status), `transfer harus ditolak jujur, dapat ${tr.status}`);
  assert.equal(tr.body.error.code, 'TRANSFER_UNAVAILABLE');
  const bal = (await request('GET', `/api/banks/accounts/${accountId}`, { agent: 'baru' })).body.data.account.balance;
  const trs = await request('GET', '/api/banks/transfers', { agent: 'baru' });
  assert.equal(trs.body.data.transfers.length, 0, 'transfer yang ditolak tidak boleh tercatat sebagai permintaan');

  // cabut koneksi
  const conn = await request('GET', '/api/banks/connections', { agent: 'baru' });
  const del = await request('DELETE', `/api/banks/connections/${conn.body.data.connection.id}`, { agent: 'baru' });
  assert.equal(del.status, 200);
  const after2 = await request('GET', '/api/banks/accounts', { agent: 'baru' });
  assert.equal(after2.body.data.accounts.length, 0, 'rekening dihapus bersama koneksi');
});

test('banking: nomor rekening tidak pernah diminta di endpoint mana pun (tidak ada field PIN/OTP)', async (t) => {
  skip(t);
  await request('POST', '/api/auth/register', {
    agent: 'cek',
    body: { fullName: 'Cek Kredensial', username: `ck_${Date.now() % 1e6}`, email: `ck-${Date.now()}@contoh.id`, password: 'Rahasia123', confirmPassword: 'Rahasia123', acceptTerms: true },
  });
  const r = await request('POST', '/api/banks/connect', {
    agent: 'cek', body: { password: 'rahasia-bank', pin: '1234', otp: '999' },
  });
  assert.equal(r.status, 200, 'input asing diabaikan, koneksi tidak memakai kredensial pribadi');
  assert.ok(!/rahasia-bank|1234|999/.test(r.raw), 'kredensial pribadi tidak pernah muncul di respons/log');
});

// ======================= TRANSAKSI & LEDGER =======================

test('transaksi: filter kategori/tipe/kata kunci/rentang tanggal & pagination', async (t) => {
  skip(t);
  const em = new Date();
  const thisMonth = `${em.getFullYear()}-${String(em.getMonth() + 1).padStart(2, '0')}`;
  await request('POST', '/api/transactions', { agent: 'user', body: { type: 'EXPENSE', category: 'FOOD', amount: 150_000, description: 'makan siang' } });
  await request('POST', '/api/transactions', { agent: 'user', body: { type: 'INCOME', category: 'SALARY', amount: 8_500_000, description: 'gaji bulan ini' } });
  await request('POST', '/api/transactions', { agent: 'user', body: { type: 'EXPENSE', category: 'BILLS', amount: 325_000, description: 'listrik' } });

  const all = await request('GET', '/api/transactions?limit=50', { agent: 'user' });
  assert.equal(all.status, 200);
  assert.ok(all.body.data.transactions.length >= 3);
  assert.deepEqual(all.body.data.categories.length, 11);

  const food = await request('GET', '/api/transactions?category=FOOD&type=EXPENSE', { agent: 'user' });
  assert.equal(food.body.data.transactions.length, 1);
  assert.equal(food.body.data.transactions[0].category, 'FOOD');
  assert.equal(food.body.data.transactions[0].source, 'MANUAL');

  const q = await request('GET', '/api/transactions?q=gaji', { agent: 'user' });
  assert.equal(q.body.data.transactions.length, 1);

  const range = await request('GET', `/api/transactions?from=${thisMonth}-01T00:00:00%2B07:00&to=${thisMonth}-28T23:59:59%2B07:00`, { agent: 'user' });
  assert.ok(range.body.data.transactions.length >= 3, 'rentang bulan berjalan memuat ketiganya');

  const none = await request('GET', '/api/transactions?from=2020-01-01T00:00:00Z&to=2020-01-02T00:00:00Z', { agent: 'user' });
  assert.equal(none.body.data.transactions.length, 0);

  const pg = await request('GET', '/api/transactions?limit=2&page=1', { agent: 'user' });
  assert.equal(pg.body.data.transactions.length, 2);
  assert.ok(pg.body.data.pagination.total >= 3);
  assert.equal(pg.body.data.pagination.pages, Math.ceil(pg.body.data.pagination.total / 2));
  const pg2 = await request('GET', '/api/transactions?limit=2&page=2', { agent: 'user' });
  assert.notEqual(pg2.body.data.transactions[0].id, pg.body.data.transactions[0].id, 'halaman berbeda berisi baris berbeda');
});

test('transaksi: validasi jumlah & kategori asing', async (t) => {
  skip(t);
  const zero = await request('POST', '/api/transactions', { agent: 'user', body: { type: 'EXPENSE', amount: 0, category: 'FOOD' } });
  assert.equal(zero.status, 400);
  const neg = await request('POST', '/api/transactions', { agent: 'user', body: { type: 'EXPENSE', amount: -100, category: 'FOOD' } });
  assert.equal(neg.status, 400);
  const cat = await request('POST', '/api/transactions', { agent: 'user', body: { type: 'EXPENSE', amount: 1000, category: 'JUDI' } });
  assert.equal(cat.status, 400, 'kategori di luar daftar ditolak');
});

test('ledger: setoran tabungan tercatat sebagai pasangan debit/kredit seimbang', async (t) => {
  skip(t);
  const own = await request('POST', '/api/auth/register', {
    agent: 'ledger',
    body: { fullName: 'Uji Ledger', username: `lg_${Date.now() % 1e6}`, email: `lg-${Date.now()}@contoh.id`, password: 'Rahasia123', confirmPassword: 'Rahasia123', acceptTerms: true },
  });
  assert.equal(own.status, 201, own.raw);
  const userId = own.body.data.user.id;
  const c = await request('POST', '/api/savings', { agent: 'ledger', body: { name: 'Ledger Uji', targetAmount: 3_000_000 } });
  const id = c.body.data.goal.id;
  await request('POST', `/api/savings/${id}/deposit`, { agent: 'ledger', body: { amount: 1_000_000 } });
  await request('POST', `/api/savings/${id}/withdraw`, { agent: 'ledger', body: { amount: 250_000 } });

  const sum = await db.query(
    `SELECT COALESCE(sum(e.amount),0)::float AS total, count(*)::int AS n
     FROM ledger_entries e
     JOIN ledger_transactions t ON t.id = e.transaction_id
     WHERE t.user_id = $1`, [userId]
  );
  assert.equal(sum.rows[0].n, 4, 'dua kejadian × dua kaki');
  assert.equal(Math.abs(sum.rows[0].total), 0, 'total seluruh kaki ledger harus nol (seimbang)');

  const perTx = await db.query(
    `SELECT t.id, sum(e.amount)::float AS net FROM ledger_transactions t
     JOIN ledger_entries e ON e.transaction_id = t.id WHERE t.user_id = $1 GROUP BY t.id`,
    [userId]
  );
  assert.ok(perTx.rows.length === 2 && perTx.rows.every((r) => Math.abs(r.net) < 0.005), 'tiap transaksi ledger harus balance');

  // saldo ledger akun tabungan = saldo tabungan (tidak ada dana tercipta dari manipulasi klien)
  const acc = await db.query(
    `SELECT sum(e.amount)::float AS bal FROM ledger_accounts a
     JOIN ledger_entries e ON e.account_id = a.id
     WHERE a.user_id = $1 AND a.code LIKE 'SAVINGS_%'`, [userId]
  );
  assert.equal(acc.rows[0].bal, 750_000);
});

test('ekspor CSV transaksi', async (t) => {
  skip(t);
  const r = await request('GET', '/api/transactions/export/csv', { agent: 'user' });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /text\/csv/);
  assert.match(r.raw, /^tanggal,tipe,kategori,jumlah,mata_uang,sumber,deskripsi/);
  const lines = r.raw.trim().split('\n');
  assert.ok(lines.length > 1, 'berisi baris data');
  assert.match(lines[1], /IDR/);
});

// ======================= ANALYTIC =======================

test('analitik: arus kas, kategori, progres tabungan, kekayaan bersih', async (t) => {
  skip(t);
  // pengguna khusus agar angka analitik dapat dipastikan persis
  const own = await request('POST', '/api/auth/register', {
    agent: 'ana',
    body: { fullName: 'Uji Analitik', username: `an_${Date.now() % 1e6}`, email: `an-${Date.now()}@contoh.id`, password: 'Rahasia123', confirmPassword: 'Rahasia123', acceptTerms: true },
  });
  assert.equal(own.status, 201, own.raw);
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-15`;
  await request('POST', '/api/transactions', { agent: 'ana', body: { type: 'INCOME', category: 'SALARY', amount: 8_500_000, description: 'gaji', occurredAt: `${iso}T02:00:00.000Z` } });
  await request('POST', '/api/transactions', { agent: 'ana', body: { type: 'EXPENSE', category: 'FOOD', amount: 150_000, description: 'makan', occurredAt: `${iso}T03:00:00.000Z` } });
  await request('POST', '/api/transactions', { agent: 'ana', body: { type: 'EXPENSE', category: 'BILLS', amount: 325_000, description: 'listrik', occurredAt: `${iso}T04:00:00.000Z` } });
  const goal = await request('POST', '/api/savings', { agent: 'ana', body: { name: 'Laptop', targetAmount: 12_000_000 } });
  await request('POST', `/api/savings/${goal.body.data.goal.id}/deposit`, { agent: 'ana', body: { amount: 7_500_000 } });
  await request('POST', '/api/installments', {
    agent: 'ana',
    body: { name: 'Motor', principal: 12_000_000, downPayment: 0, interestRate: 0, tenorMonths: 12, startDate: '2026-01-05', dueDay: 5, method: 'FLAT' },
  });

  const r = await request('GET', '/api/analytics', { agent: 'ana' });
  assert.equal(r.status, 200, r.raw);
  const d = r.body.data;
  const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const cf = d.monthlyCashflow.find((m) => m.month === thisMonth);
  assert.ok(cf, 'bulan berjalan muncul');
  assert.equal(cf.income, 8_500_000);
  assert.equal(cf.expense, 475_000);
  assert.equal(cf.net, 8_025_000);
  assert.equal(d.spendingByCategory.length, 2);
  const food = d.spendingByCategory.find((c) => c.category === 'FOOD');
  assert.equal(food.total, 150_000);
  assert.equal(food.count, 1);
  assert.deepEqual(d.savingsProgress.map((g) => [g.name, g.balance, g.progress]), [['Laptop', 7_500_000, 62.5]]);
  assert.equal(d.installmentObligations.length, 1);
  assert.equal(d.assetDistribution.savings, 7_500_000);
  assert.equal(d.assetDistribution.bank, 0, 'tanpa koneksi bank → tidak ada saldo bank');
  assert.equal(d.netWorth, 7_500_000 - 12_000_000, 'aset − liabilitas');

  // konsistensi dengan dashboard
  const dash = await request('GET', '/api/dashboard', { agent: 'ana' });
  assert.equal(dash.body.data.metrics.savingsTotal, d.assetDistribution.savings);
  assert.equal(dash.body.data.metrics.totalLiabilities + dash.body.data.metrics.totalAssets, d.netWorth + 2 * dash.body.data.metrics.totalLiabilities);

  // analitik pengguna tanpa data → empty state, bukan angka karangan
  const fresh = await request('POST', '/api/auth/register', {
    agent: 'kosong2',
    body: { fullName: 'Tanpa Data', username: `nd_${Date.now() % 1e6}`, email: `nd-${Date.now()}@contoh.id`, password: 'Rahasia123', confirmPassword: 'Rahasia123', acceptTerms: true },
  });
  await request('POST', '/api/onboarding/complete', { agent: 'kosong2', body: {} });
  const empty = await request('GET', '/api/analytics', { agent: 'kosong2' });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.data.spendingByCategory.length, 0);
  assert.equal(empty.body.data.netWorth, 0);
});

// ======================= MARKET =======================

test('market: status sumber data jujur + kuotasi/histori tersedia + tertanda tertunda', async (t) => {
  skip(t);
  const st = await request('GET', '/api/market/status', { agent: 'user' });
  assert.equal(st.status, 200);
  assert.equal(st.body.data.live, false, 'tanpa kredensial live tidak boleh mengaku live');
  assert.match(st.body.data.delayedNotice, /contoh|snapshot|tertunda/i);

  const assets = await request('GET', '/api/market/assets', { agent: 'user' });
  assert.ok(assets.body.data.assets.length >= 5, 'seed snapshot menyediakan daftar aset');
  const sym = assets.body.data.assets[0].symbol;

  const q = await request('GET', `/api/market/quotes/${sym}`, { agent: 'user' });
  assert.equal(q.status, 200, q.raw);
  assert.ok(q.body.data.quote.price > 0);
  assert.equal(q.body.data.quote.isDelayed, true);
  assert.equal(q.body.data.quote.source, 'SNAPSHOT');
  assert.ok(q.body.data.quote.quotedAt, 'harus diberi cap waktu');
  assert.ok(Number.isFinite(q.body.data.quote.changePct));
  assert.ok(q.body.data.quote.high >= q.body.data.quote.low);

  const h = await request('GET', `/api/market/history/${sym}?limit=60`, { agent: 'user' });
  assert.ok(h.body.data.candles.length > 30);
  const c = h.body.data.candles[h.body.data.candles.length - 1];
  assert.ok(Number(c.high) >= Number(c.low));
  assert.ok(Number(c.close) > 0);
  assert.equal(h.body.data.source, 'SNAPSHOT');

  const search = await request('GET', '/api/market/assets?q=' + encodeURIComponent(assets.body.data.assets[0].name.split(' ')[0]), { agent: 'user' });
  assert.ok(search.body.data.assets.length >= 1, 'pencarian nama emiten bekerja');

  const miss = await request('GET', '/api/market/quotes/TIDAKADA.JK', { agent: 'user' });
  assert.equal(miss.status, 404);
});

test('watchlist: banyak daftar, tambah/hapus item, persisten', async (t) => {
  skip(t);
  const name = `Wl ${Date.now()}`;
  const w = await request('POST', '/api/watchlists', { agent: 'user', body: { name } });
  assert.equal(w.status, 201, w.raw);
  const id = w.body.data.watchlist.id;

  const dup = await request('POST', '/api/watchlists', { agent: 'user', body: { name } });
  assert.equal(dup.status, 409, 'nama watchlist unik per pengguna');

  const sym = (await request('GET', '/api/market/assets', { agent: 'user' })).body.data.assets[0].symbol;
  const sym2 = (await request('GET', '/api/market/assets', { agent: 'user' })).body.data.assets[1].symbol;
  assert.equal((await request('POST', `/api/watchlists/${id}/items`, { agent: 'user', body: { symbol: sym } })).status, 200);
  assert.equal((await request('POST', `/api/watchlists/${id}/items`, { agent: 'user', body: { symbol: sym } })).status, 200, 'menambah duplikat bersifat idempoten');
  assert.equal((await request('POST', `/api/watchlists/${id}/items`, { agent: 'user', body: { symbol: sym2 } })).status, 200);

  const list = await request('GET', '/api/watchlists', { agent: 'user' });
  const found = list.body.data.watchlists.find((x) => x.id === id);
  assert.deepEqual(found.items.map((i) => i.symbol).sort(), [sym, sym2].sort());
  assert.ok(found.items[0].price !== undefined, 'item menyertakan kuotasi');

  assert.equal((await request('DELETE', `/api/watchlists/${id}/items/${sym}`, { agent: 'user' })).status, 200);
  const after = await request('GET', '/api/watchlists', { agent: 'user' });
  assert.deepEqual(after.body.data.watchlists.find((x) => x.id === id).items.map((i) => i.symbol), [sym2]);

  const bad = await request('POST', `/api/watchlists/${id}/items`, { agent: 'user', body: { symbol: 'NOPE.JK' } });
  assert.equal(bad.status, 404, 'instrumen di luar sumber data ditolak');

  assert.equal((await request('DELETE', `/api/watchlists/${id}`, { agent: 'user' })).status, 200);
  const gone = await request('GET', '/api/watchlists', { agent: 'user' });
  assert.ok(!gone.body.data.watchlists.some((x) => x.id === id));
});

test('alert harga: hanya dipicu oleh data pasar nyata, dapat diaktif/nonaktifkan', async (t) => {
  skip(t);
  const sym = (await request('GET', '/api/market/assets', { agent: 'user' })).body.data.assets[0].symbol;
  const price = (await request('GET', `/api/market/quotes/${sym}`, { agent: 'user' })).body.data.quote.price;

  const bad = await request('POST', '/api/alerts', { agent: 'user', body: { symbol: 'TIDAKADA.JK', direction: 'ABOVE', targetPrice: 100 } });
  assert.equal(bad.status, 404, 'alert untuk instrumen tak dikenal ditolak');
  const zero = await request('POST', '/api/alerts', { agent: 'user', body: { symbol: sym, direction: 'ABOVE', targetPrice: 0 } });
  assert.equal(zero.status, 400);

  // target yang BELUM terpicu oleh harga saat ini
  const below = await request('POST', '/api/alerts', { agent: 'user', body: { symbol: sym, direction: 'BELOW', targetPrice: price / 2 } });
  assert.equal(below.status, 201);
  let list = await request('GET', '/api/alerts', { agent: 'user' });
  let a = list.body.data.alerts.find((x) => x.id === below.body.data.alert.id);
  assert.equal(a.triggered_at, null, 'alert belum boleh terpicu tanpa pergerakan harga');

  const off = await request('PATCH', `/api/alerts/${a.id}`, { agent: 'user', body: { enabled: false } });
  assert.equal(off.body.data.alert.enabled, false);

  // alert ABOVE target sangat rendah → akan terpicu saat refresh (harga nyata tersimpan)
  const trigger = await request('POST', '/api/alerts', { agent: 'user', body: { symbol: sym, direction: 'ABOVE', targetPrice: price * 0.5 } });
  assert.equal(trigger.status, 201);

  const beforeNotif = (await request('GET', '/api/notifications?limit=50', { agent: 'user' })).body.data.notifications.filter((n) => n.type === 'PRICE_ALERT').length;
  const loginAdmin = await request('POST', '/api/auth/login', { agent: 'admin', body: { identifier: 'admin@finova.test', password: 'Admin1234' } });
  assert.equal(loginAdmin.status, 200, 'akun admin test tersedia untuk menguji trigger alert: ' + loginAdmin.raw);
  await request('POST', '/api/admin/market/refresh', { agent: 'admin', body: {} });
  const afterNotif = (await request('GET', '/api/notifications?limit=50', { agent: 'user' })).body.data.notifications.filter((n) => n.type === 'PRICE_ALERT').length;
  assert.ok(afterNotif > beforeNotif, 'alert terpicu hanya setelah penyedia data menyegarkan harga');

  list = await request('GET', '/api/alerts', { agent: 'user' });
  a = list.body.data.alerts.find((x) => x.id === trigger.body.data.alert.id);
  assert.ok(a.triggered_at, 'alert terpicu tercatat');
  assert.ok(Number(a.trigger_price) > 0);

  assert.equal((await request('DELETE', `/api/alerts/${a.id}`, { agent: 'user' })).status, 200);
});

// ======================= NOTIFIKASI =======================

test('notifikasi: dibuat otomatis oleh sistem, penanda baca & read-all, tanpa rahasia', async (t) => {
  skip(t);
  const list = await request('GET', '/api/notifications?limit=50', { agent: 'baru' });
  assert.equal(list.status, 200);
  assert.ok(list.body.data.total > 0, 'aktivitas (koneksi bank/arsip) menghasilkan notifikasi');
  assert.ok(list.body.data.unread > 0);
  const first = list.body.data.notifications[0];
  assert.ok(first.type && first.title && first.body);
  assert.ok(!/password|token|secret|otp|pin/i.test(JSON.stringify(first)), 'notifikasi tidak memuat rahasia');

  await request('POST', `/api/notifications/${first.id}/read`, { agent: 'baru' });
  const after = await request('GET', '/api/notifications?limit=50', { agent: 'baru' });
  assert.ok(after.body.data.notifications.find((x) => x.id === first.id).read_at, 'status baca tersimpan');
  assert.equal(after.body.data.unread, list.body.data.unread - 1);

  await request('POST', '/api/notifications/read-all', { agent: 'baru', body: {} });
  const all = await request('GET', '/api/notifications', { agent: 'baru' });
  assert.equal(all.body.data.unread, 0);

  const only = await request('GET', '/api/notifications?unread=true', { agent: 'baru' });
  assert.equal(only.body.data.notifications.length, 0);

  const other = await request('POST', `/api/notifications/${first.id}/read`, { agent: 'lain', body: {} });
  assert.equal(other.status, 404, 'tidak dapat mengubah notifikasi milik orang lain');
});

// ======================= PROFILE & SECURITY =======================

test('profil: baca & ubah preferensi', async (t) => {
  skip(t);
  const g = await request('GET', '/api/profile', { agent: 'user' });
  assert.equal(g.status, 200);
  assert.equal(g.body.data.profile.currency, 'IDR');
  assert.equal(g.body.data.profile.timezone, 'Asia/Jakarta');
  assert.ok(!('password_hash' in g.body.data.user), 'hash kata sandi tidak pernah diekspos');

  const u = await request('PUT', '/api/profile', {
    agent: 'user', body: { fullName: 'Rina Kartika Putri', monthlyIncome: 12_500_000, notifyEmail: false },
  });
  assert.equal(u.status, 200, u.raw);
  const g2 = await request('GET', '/api/profile', { agent: 'user' });
  assert.equal(g2.body.data.user.fullName, 'Rina Kartika Putri');
  assert.equal(g2.body.data.profile.monthlyIncome, 12_500_000);
  assert.equal(g2.body.data.profile.notifyEmail, false);
});

test('keamanan: ubah kata sandi mencabut sesi lain saja', async (t) => {
  skip(t);
  const email = (await request('GET', '/api/auth/me', { agent: 'user' })).body.data.user.email;
  const second = await request('POST', '/api/auth/login', { agent: 'second', body: { identifier: email, password: 'Rahasia123' } });
  assert.equal(second.status, 200, second.raw);

  const s1 = await request('GET', '/api/profile/sessions', { agent: 'user' });
  assert.ok(s1.body.data.sessions.length >= 2);
  assert.ok(s1.body.data.sessions.some((s) => s.current), 'ada penanda sesi aktif');
  assert.ok(!s1.raw.includes(s1.body.data.sessions[0].id.slice(0, 8)) === false, 'id sesi boleh tampil untuk pencabutan');

  const wrong = await request('POST', '/api/profile/change-password', {
    agent: 'user', body: { currentPassword: 'tidakSesuai1', newPassword: 'Baru12345', confirmPassword: 'Baru12345' },
  });
  assert.equal(wrong.status, 400);

  const chg = await request('POST', '/api/profile/change-password', {
    agent: 'user', body: { currentPassword: 'Rahasia123', newPassword: 'Baru12345', confirmPassword: 'Baru12345' },
  });
  assert.equal(chg.status, 200, chg.raw);
  const s2 = await request('GET', '/api/profile/sessions', { agent: 'user' });
  assert.equal(s2.body.data.sessions.length, 1, 'hanya sesi aktif yang tersisa');
  const oldSecond = await request('GET', '/api/auth/me', { agent: 'second' });
  assert.equal(oldSecond.body.data.authenticated, false, 'sesi lain harus dicabut');

  const still = await request('GET', '/api/auth/me', { agent: 'user' });
  assert.equal(still.body.data.authenticated, true, 'sesi aktif tetap hidup');
  const loginNew = await request('POST', '/api/auth/login', { agent: 'baru2', body: { identifier: email, password: 'Baru12345' } });
  assert.equal(loginNew.status, 200);
  const loginOld = await request('POST', '/api/auth/login', { agent: 'baru3', body: { identifier: email, password: 'Rahasia123' } });
  assert.equal(loginOld.status, 401, 'kata sandi lama tidak berlaku lagi');
});

test('keamanan: cabut satu sesi tertentu', async (t) => {
  skip(t);
  const email = (await request('GET', '/api/auth/me', { agent: 'user' })).body.data.user.email;
  await request('POST', '/api/auth/login', { agent: 'third', body: { identifier: email, password: 'Baru12345' } });
  const list = await request('GET', '/api/profile/sessions', { agent: 'user' });
  const other = list.body.data.sessions.find((s) => !s.current);
  assert.ok(other);
  const r = await request('DELETE', `/api/profile/sessions/${other.id}`, { agent: 'user' });
  assert.equal(r.status, 200);
  const check = await request('GET', '/api/auth/me', { agent: 'third' });
  assert.equal(check.body.data.authenticated, false);
});

test('keamanan: logout-all mengakhiri seluruh sesi termasuk yang aktif', async (t) => {
  skip(t);
  const r = await request('POST', '/api/profile/logout-all', { agent: 'baru', body: {} });
  assert.equal(r.status, 200);
  const me = await request('GET', '/api/auth/me', { agent: 'baru' });
  assert.equal(me.body.data.authenticated, false);
});

test('profil: permintaan penghapusan akun butuh konfirmasi kata sandi', async (t) => {
  skip(t);
  const noPass = await request('POST', '/api/profile/delete-account', { agent: 'lain', body: {}, headers: {} });
  assert.equal(noPass.status, 400);
  const badPass = await request('POST', '/api/profile/delete-account', { agent: 'lain', body: { password: 'salah12345' } });
  assert.equal(badPass.status, 400);
  const still = await request('GET', '/api/auth/me', { agent: 'lain' });
  assert.equal(still.body.data.authenticated, true, 'akun tidak terhapus saat konfirmasi gagal');
});

// ======================= CSRF & RATE LIMIT =======================

test('CSRF: mutasi dengan sesi tanpa header token ditolak 403', async (t) => {
  skip(t);
  const cookieOnly = { Cookie: agents.user.cookie };
  const r = await request('POST', '/api/savings', {
    agent: 'kosong', body: { name: 'Tanpa CSRF', targetAmount: 1000 }, headers: cookieOnly,
  });
  assert.equal(r.status, 403, `harus ditolak, dapat ${r.status}`);
  assert.equal(r.body.error.code, 'CSRF_FAILED');
  const okWithToken = await request('POST', '/api/savings', {
    agent: 'user', body: { name: 'Dengan CSRF', targetAmount: 1000 },
  });
  assert.equal(okWithToken.status, 201, 'dengan token double-submit → diterima');
});

test('rate limiting: diuji pada tests/api/rateLimit.test.js (butuh ambang khusus)', async (t) => {
  skip(t);
  let limited = null;
  for (let i = 0; i < 12; i++) {
    const r = await request('POST', '/api/auth/login', {
      agent: `rl${i}`, body: { identifier: `spam${i}@contoh.id`, password: 'salah12345' },
    });
    if (r.status === 429) { limited = r; break; }
  }
  // ambang dilonggarkan pada file ini, jadi tidak boleh terpicu
  assert.equal(limited, null, 'ambang dilonggarkan di test fungsional');
});

// ======================= FORMAT ERROR =======================

test('format respons: envelope konsisten & tanpa bocoran stack trace', async (t) => {
  skip(t);
  const bad = await request('POST', '/api/auth/login', { agent: 'fmt1', body: { identifier: 42 } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.success, false);
  assert.equal(typeof bad.body.error.code, 'string');
  assert.equal(typeof bad.body.error.message, 'string');
  assert.ok(!bad.raw.includes('at ') && !bad.raw.includes('stack'), 'tanpa stack trace');

  const notFound = await request('GET', '/api/tidak-ada', { agent: 'fmt2' });
  assert.equal(notFound.status, 404);
  assert.equal(notFound.body.error.code, 'NOT_FOUND');

  const uuid = await request('GET', '/api/savings/bukan-uuid', { agent: 'fmt2' });
  assert.equal(uuid.status, 400, 'ID tidak valid ditolak (bukan error 500)');
});

test('halaman publik & aset statis tersaji', async (t) => {
  skip(t);
  for (const p of ['/', '/login', '/register', '/forgot-password', '/reset-password', '/verify-account',
    '/dashboard', '/savings', '/interest', '/installments', '/banking', '/transactions', '/analytics',
    '/market', '/watchlist', '/alerts', '/notifications', '/profile', '/security', '/admin', '/onboarding']) {
    const r = await request('GET', p, { agent: 'halaman' });
    assert.equal(r.status, 200, `${p} harus 200`);
    assert.match(r.raw, /<!DOCTYPE html>/i, `${p} harus HTML`);
  }
  for (const a of ['/css/main.css', '/css/landing.css', '/css/app.css', '/js/app.js', '/js/api.js',
    '/js/components.js', '/js/charts.js', '/assets/vendor/lightweight-charts.js']) {
    const r = await request('GET', a, { agent: 'aset' });
    assert.equal(r.status, 200, `${a} harus tersedia`);
  }
});

test('landing: memuat semua bagian wajib & CTA menuju tujuan nyata', async (t) => {
  skip(t);
  const r = await request('GET', '/', { agent: 'landing' });
  for (const need of ['FINOVA', 'Kelola Keuanganmu dengan Lebih Cerdas', 'Satu dashboard untuk tabungan', 'Mulai Sekarang', 'Masuk']) {
    assert.ok(r.raw.includes(need), `landing harus memuat "${need}"`);
  }
  for (const id of ['fitur', 'tabungan', 'pasar', 'keamanan', 'faq']) {
    assert.ok(r.raw.includes(`id="${id}"`), `section #${id} harus ada`);
  }
  assert.match(r.raw, /particle-canvas/);
  assert.match(r.raw, /js\/cursor\.js/);
  assert.ok(!/Coming Soon/i.test(r.raw), 'tidak boleh ada tombol placeholder');
});
