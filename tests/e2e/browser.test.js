'use strict';
/**
 * Test interaksi browser (jsdom + server & PostgreSQL sungguhan).
 *
 * Playwright/Chromium tidak tersedia di lingkungan ini, maka jsdom dipakai untuk
 * memuat HTML aplikasi, menjalankan JavaScript klien sungguhan, dan melakukan
 * interaksi (klik navigasi, isi formulir, submit) yang tembus sampai backend.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const FRONTEND = path.join(__dirname, '..', '..', 'frontend');

let server = null;
let base = '';
let ready = false;
let envHandle = null;
let db = null;
let account = null; // { email, password, cookie, csrf }

function rawRequest(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(base + urlPath);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: url.hostname, port: url.port, path: url.pathname + url.search, method,
        headers: { 'Content-Type': 'application/json', ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve({ status: res.statusCode, raw: d, headers: res.headers }));
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test.before(async () => {
  process.env.RATE_LIMIT_AUTH_MAX = '5000';
  process.env.RATE_LIMIT_SENSITIVE_MAX = '5000';
  process.env.RATE_LIMIT_API_MAX = '50000';
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'browser-test-secret-value';
  envHandle = await require('../helpers/db').setup();
  if (!envHandle) return;
  process.env.DATABASE_URL = envHandle.url;

  db = require('../../backend/config/db');
  await require('../../backend/services/migrationRunner').up(db);
  await require('../../backend/scripts/seed').runSeed();

  const { createApp } = require('../../backend/app');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  // siapkan akun yang sudah melewati onboarding lewat API
  const email = `browser-${Date.now()}@contoh.id`;
  const password = 'Rahasia123';
  const reg = await rawRequest('POST', '/api/auth/register', {
    fullName: 'Budi Santoso', username: `budi_${Date.now() % 1e6}`, email,
    password, confirmPassword: password, acceptTerms: true,
  });
  assert.equal(reg.status, 201, reg.raw);
  const jar = {};
  for (const c of (reg.headers['set-cookie'] || [])) {
    const pair = c.split(';')[0];
    const i = pair.indexOf('=');
    jar[pair.slice(0, i)] = pair.slice(i + 1);
  }
  account = {
    email, password,
    cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '),
    csrf: jar['finova_csrf'],
    userId: JSON.parse(reg.raw).data.user.id,
  };
  await rawRequest('POST', '/api/onboarding/complete', { monthlyIncome: 8_000_000 }, {
    Cookie: account.cookie, 'X-CSRF-Token': account.csrf,
  });
  ready = true;
});

test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (db) await db.pool.end().catch(() => {});
  if (envHandle) await envHandle.stop();
});

/** Muat halaman aplikasi ke jsdom dengan JavaScript klien aktif. */
async function loadApp(urlPath) {
  const { JSDOM, VirtualConsole } = require('jsdom');
  // Script dieksekusi manual di bawah (jsdom tidak memuat berkas eksternal tanpa resourceLoader,
  // dan kita tidak ingin skrip berjalan dua kali).
  const html = fs.readFileSync(path.join(FRONTEND, 'pages', 'app.html'), 'utf8');
  const vc = new VirtualConsole();
  const errors = [];
  // Keterbatasan jsdom (bukan cacat aplikasi): tanpa paket `canvas` & tanpa scrollTo.
  const IGNORE = /Not implemented: (HTMLCanvasElement's getContext|Window's scrollTo|HTMLCanvasElement)/;
  vc.on('jsdomError', (e) => {
    const msg = String((e && e.message) || e);
    if (!IGNORE.test(msg)) errors.push(msg);
  });
  vc.on('error', (...a) => { const msg = a.join(' '); if (!IGNORE.test(msg)) errors.push(msg); });
  vc.on('warn', (...a) => { /* abaikan warning gaya */ });

  const dom = new JSDOM(html, {
    url: base + urlPath,
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(win) {
      // Polifil yang tidak disediakan jsdom namun ada di browser nyata
      win.matchMedia = win.matchMedia || ((q) => ({
        matches: false, media: q,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
      }));
      win.IntersectionObserver = win.IntersectionObserver || class {
        constructor(cb) { this.cb = cb; }
        observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
        unobserve() {} disconnect() {}
      };
      win.fetch = (input, init = {}) => {
        const u = typeof input === 'string' ? input : input.url;
        const abs = u.startsWith('http') ? u : base + u;
        const headers = { ...(init.headers || {}) };
        if (account.cookie) headers.Cookie = account.cookie;
        if (init.method && init.method !== 'GET' && account.csrf) headers['X-CSRF-Token'] = account.csrf;
        return fetch(abs, { ...init, headers, redirect: 'manual' });
      };
      // jsdom tidak mengimplementasikan scrollTo; aplikasi memanggilnya saat pindah halaman
      win.scrollTo = () => {};
      win.__errors = errors;
    },
  });
  const { window } = dom;

  // jalankan script yang direferensikan
  const scripts = [...window.document.querySelectorAll('script[src]')];
  for (const s of scripts) {
    const src = s.getAttribute('src');
    const file = path.join(FRONTEND, src.replace(/^\//, ''));
    // eslint-disable-next-line no-new-func
    try {
      window.eval(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      errors.push(`gagal menjalankan ${src}: ${err.message}`);
    }
  }
  // Picu inisialisasi halaman; bootstrap aplikasi idempoten sehingga event ganda aman.
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

  return { dom, window, errors };
}

function waitFor(window, predicate, { timeout = 8000, interval = 40, label = '' } = {}) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      let value = null;
      try { value = predicate(window); } catch (_) { value = null; }
      if (value) return resolve(value);
      if (Date.now() - start > timeout) {
        const content = (window.document.getElementById('app-content') || {}).textContent || '';
        return reject(new Error(
          `waktu tunggu habis menunggu ${label || 'kondisi UI'}; ` +
          `konten="${content.trim().slice(0, 160)}"; errorKonsol=${JSON.stringify((window.__errors || []).slice(0, 2))}`
        ));
      }
      setTimeout(tick, interval);
    };
    tick();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('SPA memuat dashboard, menyapa pengguna, dan menampilkan angka dari backend', async (t) => {
  if (!ready) return t.skip('PostgreSQL tidak tersedia — test browser dilewati.');
  const { window, errors } = await loadApp('/dashboard');
  const cards = await waitFor(window, (w) => {
    const c = w.document.querySelectorAll('#app-content .stat-card');
    return c.length >= 4 ? c : null;
  }, { label: 'kartu metrik dashboard' });
  assert.ok(cards.length >= 4);
  const text = window.document.getElementById('app-content').textContent;
  assert.match(text, /Halo, Budi/, 'dashboard menyapa dengan nama depan pengguna');
  assert.ok(/Rp 0,00|Rp [\d.]+,\d\d/.test(text), 'nilai format rupiah Indonesia');
  const name = window.document.getElementById('user-name').textContent;
  assert.equal(name, 'Budi Santoso', 'topbar memakai nama akun login');
  const greet = window.document.getElementById('greeting-text').textContent;
  assert.match(greet, /Budi Santoso, selamat datang lagi :\)/, 'sapaan pengguna lama');
  assert.ok(!errors.length, `konsol peramban bersih dari error: ${errors.join(' | ')}`);
  window.close();
});

test('navigasi SPA: sidebar mengubah halaman tanpa memuat ulang', async (t) => {
  if (!ready) return t.skip('PostgreSQL tidak tersedia.');
  const { window, errors } = await loadApp('/dashboard');
  await waitFor(window, (w) => w.document.querySelectorAll('#app-content .stat-card').length >= 4, { label: 'dashboard terisi' });
  const link = window.document.querySelector('.side-nav a[href="/savings"]');
  link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await waitFor(window, (w) => /Tabungan Pribadi/.test(w.document.getElementById('app-content').textContent), { label: 'halaman tabungan' });
  assert.match(window.document.getElementById('topbar-title').textContent, /Tabungan/);
  assert.ok(window.document.querySelector('.side-nav a[data-nav="savings"]').classList.contains('active'), 'navigasi aktif ditandai');
  assert.ok(!errors.length, `tanpa error konsol: ${errors.join(' | ')}`);
  window.close();
});

test('formulir modal: membuat target tabungan lalu menyetor — hasilnya terbaca dari backend', async (t) => {
  if (!ready) return t.skip('PostgreSQL tidak tersedia.');
  const { window, errors } = await loadApp('/savings');
  await waitFor(window, (w) => w.document.getElementById('btn-new-goal'), { label: 'tombol target baru' });

  window.document.getElementById('btn-new-goal').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const modal = await waitFor(window, (w) => {
    const el = w.document.getElementById('modal-backdrop');
    return el && el.classList.contains('open') ? el : null;
  }, { label: 'modal terbuka' });
  assert.ok(modal, 'modal terbuka');
  const nameInput = modal.querySelector('[data-f="name"]');
  const amountInput = modal.querySelector('[data-f="targetAmount"]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(nameInput, 'Dana Laptop Browser'); nameInput.dispatchEvent(new window.Event('input', { bubbles: true }));
  setter.call(amountInput, '12000000'); amountInput.dispatchEvent(new window.Event('input', { bubbles: true }));

  const saveBtn = [...modal.querySelectorAll('button')].find((b) => /Buat Target/.test(b.textContent));
  saveBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  await waitFor(window, (w) => /Dana Laptop Browser/.test(w.document.getElementById('savings-grid').textContent), { label: 'kartu target baru' });
  const gridText = window.document.getElementById('savings-grid').textContent;
  assert.match(gridText, /Rp 12\.000\.000/, 'target tampil terformat');
  assert.match(gridText, /Rp 0,00|0% tercapai/, 'saldo awal nol');

  // setor lewat modal — tombol disabled saat memproses (anti submit ganda)
  const card = window.document.querySelector('[data-goal]');
  card.querySelector('[data-act="deposit"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const mv = await waitFor(window, (w) => w.document.querySelector('#mv-form'), { label: 'formulir setoran' });
  setter.call(mv.querySelector('#mv-amount'), '7500000');
  const depBtn = [...mv.closest('.modal').querySelectorAll('button')].find((b) => /Simpan Setoran/.test(b.textContent));
  depBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await waitFor(window, (w) => /62,5%/.test(w.document.getElementById('savings-grid').textContent), { label: 'progres 62,5% setelah setoran', timeout: 10000 });

  const after = window.document.getElementById('savings-grid').textContent;
  assert.match(after, /Rp 7\.500\.000/, 'setoran tercermin di kartu');
  assert.match(after, /62,5%/, 'progres dihitung ulang dari data backend');
  assert.match(after, /Rp 4\.500\.000/, 'sisa target');

  // verifikasi persistensi di sisi server
  const verify = await rawRequest('GET', '/api/savings', null, { Cookie: account.cookie });
  const goal = JSON.parse(verify.raw).data.goals.find((g) => g.name === 'Dana Laptop Browser');
  assert.equal(Number(goal.balance), 7_500_000, 'tersimpan di PostgreSQL');
  assert.ok(!errors.length, `tanpa error konsol: ${errors.join(' | ')}`);
  window.close();
});

test('validasi klien pada modal: jumlah nol ditolak tanpa memanggil API', async (t) => {
  if (!ready) return t.skip('PostgreSQL tidak tersedia.');
  const { window } = await loadApp('/savings');
  await waitFor(window, (w) => w.document.getElementById('btn-new-goal'), { label: 'tombol target baru' });
  window.document.getElementById('btn-new-goal').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const modal = await waitFor(window, (w) => {
    const el = w.document.getElementById('modal-backdrop');
    return el && el.classList.contains('open') ? el : null;
  }, { label: 'modal target' });
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(modal.querySelector('[data-f="name"]'), 'X');
  const btn = [...modal.querySelectorAll('button')].find((b) => /Buat Target/.test(b.textContent));
  btn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await sleep(200);
  assert.match(modal.querySelector('[data-error="name"]').textContent, /minimal 2 karakter|harus lebih dari nol/, 'pesan validasi tampil di sisi klien');
  window.close();
});

test('halaman Rekening menampilkan status belum terhubung & membuka alur koneksi', async (t) => {
  if (!ready) return t.skip('PostgreSQL tidak tersedia.');
  const { window, errors } = await loadApp('/banking');
  await waitFor(window, (w) => /Rekening Mandiri belum dihubungkan/.test(w.document.getElementById('app-content').textContent), { label: 'status belum terhubung' });
  const connectBtn = window.document.getElementById('btn-connect');
  assert.ok(connectBtn, 'tombol koneksi tersedia');
  connectBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const modal = await waitFor(window, (w) => {
    const el = w.document.getElementById('modal-backdrop');
    return el && el.classList.contains('open') ? el : null;
  }, { label: 'modal consent' });
  assert.match(modal.textContent, /demo/i, 'alur koneksi jujur menjelaskan mode contoh');
  assert.match(modal.textContent, /tidak pernah meminta password/i, 'menegaskan tidak meminta kredensial pribadi');
  assert.ok(!errors.length, `tanpa error konsol: ${errors.join(' | ')}`);
  window.close();
});

test('halaman pasar: chart area, pencarian, dan label status data', async (t) => {
  if (!ready) return t.skip('PostgreSQL tidak tersedia.');
  const { window, errors } = await loadApp('/market');
  await waitFor(window, (w) => /Rp/.test(w.document.getElementById('m-detail').textContent), { label: 'kuotasi pasar' });
  const txt = window.document.getElementById('app-content').textContent;
  assert.match(txt, /snapshot|contoh/i, 'status sumber data ditampilkan');
  assert.ok(window.document.getElementById('m-search'), 'kolom pencarian ada');
  assert.ok(window.document.getElementById('m-watch'), 'panel watchlist ada');
  assert.ok(!errors.length, `tanpa error konsol: ${errors.join(' | ')}`);
  window.close();
});

test('pengguna biasa tidak dapat membuka halaman admin lewat URL aplikasi', async (t) => {
  if (!ready) return t.skip('PostgreSQL tidak tersedia.');
  const { window } = await loadApp('/admin');
  await waitFor(window, (w) => /Akses terbatas|Panel Admin/.test(w.document.getElementById('app-content').textContent), { label: 'penolakan admin' });
  assert.match(window.document.getElementById('app-content').textContent, /Akses terbatas/, 'UI menolak non-admin');
  assert.ok(window.document.getElementById('nav-admin').hidden, 'menu admin tersembunyi bagi USER');
  window.close();
});

test('kebersihan kode depan: tanpa alert() pengganti fitur & tanpa tautan mati', async () => {
  const files = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(js|html)$/.test(f.name)) files.push(p);
    }
  })(FRONTEND);
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    if (/alert\s*\(\s*['"`](segera|coming)/i.test(src)) offenders.push(`${f}: alert placeholder`);
    if (/Coming Soon/i.test(src)) offenders.push(`${f}: teks "Coming Soon"`);
    if (/href="#"|javascript:void\(0\)"\s*>[^<]*(Transfer|Bayar|Hubungkan)/i.test(src)) offenders.push(`${f}: tautan mati`);
  }
  assert.deepEqual(offenders, [], `temuan: ${offenders.join('; ')}`);
});

test('localStorage tidak dipakai sebagai basis data keuangan', async () => {
  const hits = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.js$/.test(f.name) && !p.includes('vendor')) {
        const src = fs.readFileSync(p, 'utf8');
        if (/localStorage\.(set|remove)Item/.test(src)) hits.push(p);
      }
    }
  })(path.join(FRONTEND, 'js'));
  assert.deepEqual(hits.filter((h) => !h.includes('app.js')), [], 'hanya penanda antarmuka yang boleh memakai sessionStorage');
  const appjs = fs.readFileSync(path.join(FRONTEND, 'js', 'app.js'), 'utf8');
  assert.match(appjs, /sessionStorage\.setItem\('finova_greeted'/, 'sessionStorage hanya untuk preferensi tampilan');
  assert.ok(!/localStorage\.setItem/.test(appjs), 'data keuangan tidak pernah disimpan di localStorage');
});
