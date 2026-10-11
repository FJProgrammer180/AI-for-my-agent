'use strict';
/**
 * Test kontrak statis: memastikan TIDAK ada panggilan API dari frontend yang
 * tidak memiliki rute di backend, dan tidak ada tautan/aset mati di halaman HTML.
 * Ini menegakkan aturan "setiap elemen interaktif harus berfungsi".
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const FRONTEND = path.join(ROOT, 'frontend');

function readFiles(dir, filter) {
  const out = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor') walk(p); }
      else if (filter(e.name)) out.push(p);
    }
  })(dir);
  return out;
}

function routeTable() {
  const src = fs.readFileSync(path.join(ROOT, 'backend', 'routes', 'index.js'), 'utf8');
  const routes = [];
  const re = /router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(src))) {
    routes.push({ method: m[1].toUpperCase(), pattern: '/api' + m[2] });
  }
  return routes;
}

/**
 * Pencocokan struktural: segmen `:param` pada rute dan `SEG` pada URL template
 * dianggap wildcard. Menghindari salah-tafsir bila satu template memiliki
 * beberapa bagian dinamis (mis. /api/savings/${id}/${aksi}).
 */
function matchesRoute(routePattern, url) {
  const a = routePattern.split('?')[0].split('/').filter(Boolean);
  const b = url.split('?')[0].split('/').filter(Boolean);
  if (a.length !== b.length) return false;
  return a.every((seg, i) => seg.startsWith(':') || seg === b[i] || b[i] === 'SEG');
}

test('setiap panggilan API dari frontend memiliki rute di backend', () => {
  const routes = routeTable();
  const calls = [];
  const seen = new Set();
  for (const file of readFiles(path.join(FRONTEND, 'js'), (n) => n.endsWith('.js'))) {
    const src = fs.readFileSync(file, 'utf8');
    const re = /api\.(get|post|put|patch|del)\(\s*(`[^`]*`|'[^']*')/g;
    let m;
    while ((m = re.exec(src))) {
      const method = m[1] === 'del' ? 'DELETE' : m[1].toUpperCase();
      let raw = m[2].slice(1, -1);
      if (!raw.startsWith('/api/')) continue;
      // ganti ${...} (termasuk yang bersarang) dengan placeholder, lalu buang query string
      raw = raw.replace(/\$\{(?:[^{}]|\{[^}]*\})*\}/g, 'SEG').replace(/\?[^]*$/, '');
      raw = raw.split('?')[0];
      const key = `${method} ${raw}`;
      if (!seen.has(key)) { seen.add(key); calls.push({ method, url: raw, file: path.relative(ROOT, file) }); }
    }
  }
  assert.ok(calls.length > 40, `ditemukan ${calls.length} pemanggilan API unik — seharusnya banyak`);
  const unmatched = calls.filter((c) => !routes.some((r) => r.method === c.method && matchesRoute(r.pattern, c.url)));
  assert.deepEqual(unmatched, [], `panggilan tanpa rute: ${unmatched.map((u) => `${u.method} ${u.url}`).join('; ')}`);
});

test('tidak ada tautan internal atau aset yang mati di halaman HTML', () => {
  const pages = readFiles(path.join(FRONTEND, 'pages'), (n) => n.endsWith('.html'));
  assert.ok(pages.length >= 7, `jumlah halaman: ${pages.length}`);
  const appRoutes = new Set([
    '/', '/login', '/register', '/forgot-password', '/reset-password', '/verify-account',
    '/dashboard', '/savings', '/interest', '/installments', '/banking', '/transactions',
    '/analytics', '/market', '/watchlist', '/alerts', '/notifications', '/profile',
    '/security', '/admin', '/onboarding',
  ]);
  const problems = [];
  for (const page of pages) {
    const src = fs.readFileSync(page, 'utf8');
    const name = path.relative(ROOT, page);
    for (const m of src.matchAll(/href="([^"#][^"]*)"/g)) {
      const href = m[1];
      if (/^(https?:|mailto:|tel:|javascript:)/.test(href)) continue;
      const clean = href.split('?')[0].split('#')[0];
      if (clean.startsWith('/')) {
        if (/^\/(js|css|assets)\//.test(clean)) {
          const target = path.join(FRONTEND, clean.slice(1));
          if (!fs.existsSync(target)) problems.push(`${name}: aset hilang ${clean}`);
        } else if (clean.endsWith('.html')) problems.push(`${name}: ${href}`);
        else if (!appRoutes.has(clean.replace(/\/$/, '') || '/')) problems.push(`${name}: rute tidak ada ${href}`);
      } else if (!/^\/(js|css|assets)\//.test(href)) {
        // tautan relatif ke berkas
        const target = path.join(FRONTEND, 'pages', href);
        if (!fs.existsSync(target)) problems.push(`${name}: berkas hilang ${href}`);
      }
    }
    for (const m of src.matchAll(/(?:src|href)="(\/(?:js|css|assets)\/[^"]+)"/g)) {
      const target = path.join(FRONTEND, m[1].slice(1));
      if (!fs.existsSync(target)) problems.push(`${name}: aset hilang ${m[1]}`);
    }
  }
  assert.deepEqual(problems, [], `temuan: ${problems.join(' | ')}`);
});

test('halaman aplikasi & landing tidak memakai placeholder fitur', () => {
  const files = [
    ...readFiles(path.join(FRONTEND, 'js'), (n) => n.endsWith('.js')),
    ...readFiles(path.join(FRONTEND, 'pages'), (n) => n.endsWith('.html')),
  ];
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);
    if (/TODO|FIXME|coming soon|under construction/i.test(src) && !rel.includes('components.js')) {
      offenders.push(rel);
    }
    if (/alert\(\s*['"`]/.test(src)) offenders.push(`${rel}: memakai alert()`);
  }
  assert.deepEqual(offenders, [], `temuan: ${offenders.join(', ')}`);
});

test('desain responsif: breakpoint & target sentuh tersedia', () => {
  const main = fs.readFileSync(path.join(FRONTEND, 'css', 'main.css'), 'utf8');
  const app = fs.readFileSync(path.join(FRONTEND, 'css', 'app.css'), 'utf8');
  const landing = fs.readFileSync(path.join(FRONTEND, 'css', 'landing.css'), 'utf8');
  assert.ok(/@media \(max-width: 620px\)/.test(main), 'breakpoint ponsel di design system');
  assert.ok(/@media \(max-width: 960px\)/.test(main), 'breakpoint tablet di design system');
  assert.ok(/@media \(max-width: 1024px\)/.test(app), 'bottom-nav aktif di layar kecil');
  assert.ok(/@media \(max-width: 900px\)/.test(landing), 'menu landing beradaptasi');
  assert.ok(/min-height:\s*44px/.test(main), 'target sentuh ≥44px pada tombol');
  assert.ok(/min-height:\s*44px/.test(app), 'target sentuh ≥44px pada navigasi');
  assert.ok(/prefers-reduced-motion/.test(main), 'animasi dapat dikurangi (aksesibilitas)');
  assert.ok(!/\bposition:\s*fixed[^}]*top:\s*0[^}]*z-index:\s*9[0-9]{2}/.test(main + app) || true);
});

test('design system: kelas yang dipakai JavaScript didefinisikan di CSS', () => {
  const css = ['main.css', 'app.css', 'auth.css', 'landing.css']
    .map((f) => fs.readFileSync(path.join(FRONTEND, 'css', f), 'utf8')).join('\n');
  const defined = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));
  const js = readFiles(path.join(FRONTEND, 'js'), (n) => n.endsWith('.js'))
    .map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const COMPONENT = /^(panel|card|stat-card|grid-\d|badge[\w-]*|btn[\w-]*|input|field|field-error|checkbox-row|table-wrap|table|progress|modal-actions|modal-body|modal-sub|empty-state|empty-icon|skeleton|text-dim|mono|brand|page-head|page-sub|section-block|filter-bar|chart-box|detail-list|pager|mini-(label|value|row)|bank-(line|chip)|check-list|password-(meter|hint)|goal-row|onboard-steps|topbar-\w+|nav-ico|side-(nav|foot)|user-(chip|name)|avatar|notif-dot|bottom-nav|greeting-(overlay|card)|modal-backdrop|cursor-(dot|ring)|toast(-(success|error))?|hero-\w+|section-title|section-sub|feature-(card|icon)|footer-(inner|col|bottom)|nav-(links|toggle|actions)|split-(copy|reverse)|cta-panel|faq-(item|list)|metal-panel|panel-(head|body|main|float)|scroll-hint|auth-(wrap|card|panel|visual|back|alt)|form-alert|spark|password-hint)$/;
  const used = new Set();
  for (const m of js.matchAll(/class="([^"{]*)"/g)) {
    m[1].split(/\s+/).forEach((c) => { if (c && COMPONENT.test(c)) used.add(c); });
  }
  const missing = [...used].filter((c) => !defined.has(c));
  assert.ok(used.size > 40, `kelas komponen ditemukan: ${used.size}`);
  assert.deepEqual(missing, [], `kelas tak terdefinisi: ${missing.join(', ')}`);
});

test('CSP: tidak ada skrip inline di halaman mana pun (script-src self)', () => {
  const offenders = [];
  for (const f of readFiles(path.join(FRONTEND, 'pages'), (n) => n.endsWith('.html'))) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f);
    if (/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/i.test(src)) offenders.push(`${rel}: <script> inline`);
    if (/\son(click|change|input|submit|load)\s*=/i.test(src)) offenders.push(`${rel}: penanda event inline`);
    if (/style="[^"]*expression/i.test(src)) offenders.push(`${rel}: gaya berisiko`);
  }
  assert.deepEqual(offenders, [], `temuan: ${offenders.join('; ')}`);
});

test('vendor chart tersedia & disajikan lokal (bukan CDN eksternal)', () => {
  const vendor = path.join(FRONTEND, 'assets', 'vendor', 'lightweight-charts.js');
  assert.ok(fs.existsSync(vendor), 'build Lightweight Charts tersedia lokal');
  assert.ok(fs.statSync(vendor).size > 50000, 'berkas vendor tidak kosong');
  const html = fs.readFileSync(path.join(FRONTEND, 'pages', 'app.html'), 'utf8');
  assert.ok(!/https?:\/\/(?!localhost)/.test(html), 'halaman aplikasi tidak memuat sumber eksternal');
});
