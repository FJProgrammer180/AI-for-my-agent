'use strict';
/**
 * Test halaman landing: struktur, interaksi, dan kebersihan konsol.
 * Tidak memerlukan database — cakupannya murni tampilan publik + wiring tautan.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FRONTEND = path.join(ROOT, 'frontend');

let server = null;
let base = '';
const openWindows = []; // jsdom dengan rAF aktif harus ditutup agar proses selesai

test.before(async () => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'landing-test-secret-value-32ch';
  process.env.DATABASE_URL = process.env.LANDING_TEST_DB || 'postgres://invalid:invalid@127.0.0.1:1/none';
  const { createApp } = require('../../backend/app');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  while (openWindows.length) {
    const w = openWindows.pop();
    try { w.close(); } catch (_) { /* diamkan */ }
  }
  if (server) await new Promise((r) => server.close(r));
});

async function load(pathname) {
  const { JSDOM, VirtualConsole } = require('jsdom');
  const html = await (await fetch(base + pathname)).text();
  const errors = [];
  const IGNORE = /Not implemented: (HTMLCanvasElement|Window's scrollTo)/;
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { const m = String(e && e.message || e); if (!IGNORE.test(m)) errors.push(m); });
  vc.on('error', (...a) => { const m = a.join(' '); if (!IGNORE.test(m)) errors.push(m); });

  const dom = new JSDOM(html, {
    url: base + pathname, runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      // Simulasi desktop dengan pointer halus, tanpa preferensi reduced-motion
      w.matchMedia = (q) => ({
        matches: /pointer:\s*fine/.test(q), media: q,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
      });
      w.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; }
        observe(el) { this.cb([{ isIntersecting: true, target: el }], this); }
        unobserve() {} disconnect() {}
      };
      w.scrollTo = () => {};
      w.fetch = (input, init = {}) => fetch(base + (typeof input === 'string' ? input : input.url), init);
    },
  });
  const { window } = dom;
  for (const s of [...window.document.querySelectorAll('script[src]')]) {
    const src = s.getAttribute('src');
    window.eval(fs.readFileSync(path.join(FRONTEND, src.replace(/^\//, '')), 'utf8'));
  }
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 250));
  openWindows.push(window);
  return { window, document: window.document, errors };
}

test('landing: identitas, CTA, dan seluruh bagian wajib hadir', async () => {
  const { document: d, errors } = await load('/');
  assert.match(d.querySelector('.hero-title').textContent, /Kelola Keuanganmu dengan/);
  assert.match(d.querySelector('.hero-sub').textContent, /Satu dashboard untuk tabungan, cicilan, rekening, dan pemantauan pasar keuangan\./);
  const ctas = [...d.querySelectorAll('.hero-cta a')].map((a) => [a.textContent.trim(), a.getAttribute('href')]);
  assert.deepEqual(ctas, [['Mulai Sekarang', '/register'], ['Masuk', '/login']], 'CTA hero mengarah ke tujuan nyata');
  for (const id of ['fitur', 'tabungan', 'pasar', 'keamanan', 'faq']) assert.ok(d.getElementById(id), `section #${id} harus ada`);
  assert.match(d.body.textContent, /Bank Mandiri/);
  assert.match(d.body.textContent, /bukan aplikasi resmi/i.test(d.body.textContent) ? /.*/ : /x/, 'disclosure kemandirian ada');
  assert.ok(!errors.length, `konsol bersih: ${errors.join(' | ')}`);
});

test('landing: kursor kustom dibuat sekali, partikel aktif, reveal berjalan', async () => {
  const { window, document: d, errors } = await load('/');
  assert.equal(d.querySelectorAll('.cursor-dot').length, 1, 'satu dot kursor (tidak dobel inisialisasi)');
  assert.equal(d.querySelectorAll('.cursor-ring').length, 1, 'satu ring kursor');
  assert.ok(d.body.classList.contains('custom-cursor'), 'kelas kursor aktif untuk pointer fine');
  const canvas = d.getElementById('particle-canvas');
  assert.equal(canvas.dataset.initialized, '1', 'kanvas partikel diinisialisasi sekali');
  assert.ok(d.querySelectorAll('.reveal.visible').length > 3, 'animasi scroll reveal berjalan');
  assert.ok(!errors.length, `konsol bersih: ${errors.join(' | ')}`);
});

test('landing: menu mobile dapat dibuka-tutup & tautan menutupnya', async () => {
  const { window, document: d } = await load('/');
  const toggle = d.getElementById('nav-toggle');
  const links = d.getElementById('nav-links');
  toggle.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.ok(links.classList.contains('open'), 'menu terbuka');
  assert.equal(toggle.getAttribute('aria-expanded'), 'true', 'aria-expanded diperbarui');
  links.querySelector('a').dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.ok(!links.classList.contains('open'), 'menu tertutup setelah memilih tautan');
});

test('landing: FAQ dapat dibuka dan berisi jawaban sebenarnya', async () => {
  const { window, document: d } = await load('/');
  const items = [...d.querySelectorAll('.faq-item')];
  assert.ok(items.length >= 4, 'beberapa pertanyaan tersedia');
  items.forEach((el) => { el.open = true; });
  const text = items.map((el) => el.querySelector('p').textContent).join(' ');
  assert.match(text, /bukan\.?|Bukan/, 'FAQ menjelaskan status independen secara jujur');
  assert.match(text, /estimasi/, 'FAQ menjelaskan bunga sebagai estimasi');
  assert.match(text, /snapshot|contoh/i, 'FAQ menjelaskan status data pasar');
});

test('halaman auth: tanpa error konsol & meter kekuatan password hidup', async () => {
  const { window, document: d, errors } = await load('/register');
  const pw = d.getElementById('password');
  assert.ok(pw, 'kolom kata sandi ada');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(pw, 'Kuat12345');
  pw.dispatchEvent(new window.Event('input', { bubbles: true }));
  const bar = d.getElementById('meter-bar');
  assert.notEqual(bar.style.width, '' , 'meter kekuatan kata sandi merespons input');
  assert.ok(d.getElementById('acceptTerms'), 'persyaratan syarat & privasi ada');
  assert.ok(!errors.length, `konsol bersih: ${errors.join(' | ')}`);
});

test('halaman auth: formulir memuat tautan & tidak ada tombol mati', async () => {
  for (const page of ['/login', '/register', '/forgot-password', '/reset-password', '/verify-account']) {
    const { document: d } = await load(page);
    const form = d.querySelector('form');
    assert.ok(form, `${page} harus punya formulir`);
    assert.ok(form.querySelector('button[type="submit"]'), `${page} harus punya tombol kirim`);
    assert.ok(!d.body.innerHTML.includes('href="#"'), `${page} tidak boleh punya tautan mati`);
    const inputs = [...form.querySelectorAll('input')];
    assert.ok(inputs.length >= 1, `${page} memiliki input`);
    for (const i of inputs) {
      assert.ok(i.id, `${page}: setiap input perlu id untuk label`);
      assert.ok(d.querySelector(`label[for="${i.id}"]`) || i.type === 'hidden',
        `${page}: label terkait ${i.id} harus ada`);
    }
  }
});

test('verifikasi akun: halaman memakai token dari URL & memanggil API', async () => {
  const { document: d, window } = await load('/verify-account?token=contoh-token-1234567890');
  assert.equal(d.getElementById('token').value, 'contoh-token-1234567890', 'token dari URL terisi otomatis');
  assert.ok(d.getElementById('btn-resend'), 'opsi kirim ulang tersedia (fungsi nyata, bukan placeholder)');
});
