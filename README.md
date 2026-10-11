# FINOVA

> **Your Money. Your Future. One Intelligent Dashboard.**
> Kelola keuanganmu dengan lebih cerdas — satu dashboard untuk tabungan, cicilan, rekening, dan pemantauan pasar keuangan.

FINOVA adalah aplikasi web manajemen keuangan pribadi dengan integrasi perbankan, dibangun sebagai satu sistem terhubung: frontend HTML/CSS/JavaScript vanilla, backend Node.js + Express, dan persistence PostgreSQL.

**Catatan identitas:** FINOVA adalah aplikasi independen. FINOVA **bukan** aplikasi resmi Bank Mandiri dan tidak mengklaim demikian.

---

## Daftar isi

1. [Hasil yang benar-benar berfungsi](#hasil-yang-benar-berfungsi)
2. [Prinsip kejujuran data](#prinsip-kejujuran-data)
3. [Teknologi](#teknologi)
4. [Menjalankan aplikasi](#menjalankan-aplikasi)
5. [Mode demo tanpa PostgreSQL](#mode-demo-tanpa-postgresql)
6. [Struktur proyek](#struktur-proyek)
7. [Model data](#model-data)
8. [API](#api)
9. [Aturan perhitungan keuangan](#aturan-perhitungan-keuangan)
10. [Integrasi Bank Mandiri — prasyarat](#integrasi-bank-mandiri--prasyarat)
11. [Penyedia data pasar](#penyedia-data-pasar)
12. [Keamanan](#keamanan)
13. [Pengujian](#pengujian)
14. [Batasan yang tersisa](#batasan-yang-tersisa)

---

## Hasil yang benar-benar berfungsi

| Modul | Status | Keterangan |
|---|---|---|
| Landing page publik | ✅ Berfungsi | Responsif, animasi panel metalik, partikel kanvas, kursor kustom, FAQ, footer |
| Registrasi + verifikasi email | ✅ Berfungsi | Argon2id, validasi Zod, username/email unik, token verifikasi (24 jam, sekali pakai), banner pengingat di dashboard sampai email diverifikasi |
| Login / logout / sesi | ✅ Berfungsi | Cookie `httpOnly` + SameSite, batas waktu sesi, sesi aktif dapat dicabut |
| Lupa & atur ulang kata sandi | ✅ Berfungsi | Token sekali pakai 1 jam; seluruh sesi dicabut setelah reset |
| Onboarding login pertama | ✅ Berfungsi | 3 langkah; status disimpan di PostgreSQL; sapaan `{Nama}, selamat datang.` / `... selamat datang lagi :)` |
| Dashboard | ✅ Berfungsi | Seluruh metrik dihitung backend dari data tersimpan |
| Tabungan pribadi | ✅ Berfungsi | Buat/ubah/arsipkan target, setoran & penarikan, histori, progres, guard saldo negatif, idempotensi |
| Bunga | ✅ Berfungsi | Perhitungan di backend: simple harian, bulanan, majemuk, rata-rata saldo; dilabeli **estimasi** |
| Cicilan | ✅ Berfungsi | Metode FLAT / ANNUITY / EFFECTIVE, jadwal per periode, pencatatan pembayaran, progres, arsip |
| Ledger internal | ✅ Berfungsi | Pasang debit/kredit seimbang untuk setiap mutasi tabungan; diaudit lewat test |
| Transaksi | ✅ Berfungsi | Pencarian, filter kategori/tipe/tanggal, paginasi, detail, ekspor CSV, penanda sumber (manual vs bank) |
| Analitik | ✅ Berfungsi | Arus kas bulanan, pengeluaran per kategori, progres tabungan, kewajiban cicilan, distribusi aset, kekayaan bersih |
| Modul Rekening (Mandiri) | ⚠️ Mode contoh | Alur consent + sinkronisasi akun/mutasi berjalan; mode live memerlukan kredensial resmi (lihat [prasyarat](#integrasi-bank-mandiri--prasyarat)) |
| Transfer & pembayaran tagihan | ⚠️ Dinonaktifkan jujur | Ditolak dengan pesan jelas bila penyedia tidak mengizinkan; tidak ada simulasi keberhasilan |
| Pasar: daftar, kuotasi, candlestick | ✅ Berfungsi | Lightweight Charts (candle/garis, zoom, pan, timeframe), pencarian instrumen |
| Watchlist | ✅ Berfungsi | Banyak daftar, tambah/hapus item, persisten di PostgreSQL |
| Alert harga | ✅ Berfungsi | Atas/bawah, aktif-nonaktif, hanya terpicu oleh harga yang benar-benar masuk dari penyedia data |
| Notifikasi | ✅ Berfungsi | Terisi otomatis oleh peristiwa sistem, status baca, read-all, paginasi |
| Profil & Keamanan | ✅ Berfungsi | Preferensi, ganti kata sandi, daftar/cabut sesi, keluarkan semua, cabut otorisasi bank, permintaan hapus akun |
| Panel Admin | ✅ Berfungsi | Ringkasan, pengguna, tarif bunga, status integrasi, audit log, kesehatan sistem — khusus peran ADMIN |
| WebSocket realtime | ✅ Berfungsi | Isyarat perubahan notifikasi + sinyal kuotasi; klien mengambil ulang data dari API |
| Pekerja terjadwal | ✅ Berfungsi | Penyegaran data pasar + evaluasi alert (5 menit), akrual bunga harian (6 jam) |
| Migrasi & seed | ✅ Berfungsi | `npm run migrate`, `npm run seed`, rollback dengan `--force` |
| Test otomatis | ✅ 82 test lulus | Unit + integrasi API + pekerja & WebSocket + browser (jsdom) + uji kontrak frontend↔backend, semuanya terhadap PostgreSQL nyata |

## Prinsip kejujuran data

Aplikasi ini mengikuti aturan ketat tentang apa yang boleh dan tidak boleh ditampilkan:

- **Tidak ada saldo bank yang dikarang.** Sebelum koneksi sah dibuat, daftar rekening kosong dan dashboard menampilkan Rp 0.
- **Mode contoh diberi label.** Akun yang berasal dari snapshot lokal ditandai `Demo` di UI dan `isDemo: true` di API.
- **Bunga tabungan internal = estimasi.** Selalu diberi label *"Estimasi perencanaan berdasarkan asumsi tarif yang kamu tetapkan — bukan bunga bank"*. Bunga bank hanya ditampilkan bila benar-benar tercatat dari rekening terhubung (mis. mutasi "Bunga tabungan (dikreditkan bank)").
- **Pencatatan manual ≠ konfirmasi bank.** Pembayaran cicilan yang kamu catat diberi `recorded_via: MANUAL` dan dijelaskan sebagai catatan, bukan transaksi terverifikasi.
- **Data pasar diberi status & cap waktu.** Kuotasi ditandai `isDelayed` + `source` + `quotedAt`; selama penyedia live belum dikonfigurasi, UI menyatakan bahwa yang tampil adalah snapshot contoh.
- **Istilah teknis tidak masuk ke layar pengguna.** Kerusakan penerjemah menjadi pesan Indonesia pendek; detail teknis hanya muncul di log server dan panel admin.

## Teknologi

**Frontend:** HTML5, CSS3 (CSS variables, komponen reusable), JavaScript ES6+ vanilla (Fetch API, Canvas API, WebSocket), [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts) untuk grafik finansial.

**Backend:** Node.js 22, Express 4, arsitektur modular route → controller → service → repository, Zod (validasi), `pg` (PostgreSQL), argon2id (hashing), helmet (security headers), express-rate-limit, `ws` (realtime).

**Database:** PostgreSQL 14+ dengan migrasi SQL versi-file, FK, constraint unik, indeks, dan transaksi database.

**Test:** `node:test` bawaan; PostgreSQL nyata dipakai melalui [PGlite](https://pglite.dev) (PostgreSQL 18 yang dikompilasi ke WASM) sehingga test integrasi berjalan tanpa server eksternal.

## Menjalankan aplikasi

Prasyarat: Node.js ≥ 20 dan PostgreSQL yang dapat diakses.

```bash
# 1. Dependensi
npm install

# 2. Konfigurasi
cp .env.example .env
#   lalu sesuaikan DATABASE_URL, SESSION_SECRET, dst.
#   hasilkan secret: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# 3. Database (buat dulu, contoh:)
createdb finova            # atau gunakan docker-compose di bawah

# 4. Skema + data awal
npm run migrate
npm run seed

# 5. Jalankan
npm run dev                # development (restart manual)
npm run start              # production

# 6. Akun admin (provisi aman, tidak lewat registrasi publik)
node backend/scripts/create-admin.js admin@contoh.id admin "Admin FINOVA" "GantiS4ya!"

# Atau semuanya sekaligus lewat Docker
docker compose up -d       # db: postgres:16 + app di port 3000
```

Buka `http://localhost:3000` → **Mulai Sekarang** untuk mendaftar.

### Skrip npm

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Jalankan server (NODE_ENV=development) |
| `npm run start` | Jalankan server (produksi) |
| `npm run demo` | Jalankan dengan PostgreSQL in-process (lihat bawah) |
| `npm run migrate` | Terapkan migrasi yang belum berjalan |
| `npm run seed` | Tarif contoh + aset/histori pasar |
| `npm run migrate:down` | Kosongkan seluruh tabel & versi migrasi (butuh `--force`, sudah tercakup) |
| `npm run admin` | Provisi akun admin: `npm run admin -- <email> <user> "<Nama>" "<pass>"` |
| `npm run market:snapshot` | Bangun ulang snapshot pasar contoh |
| `npm test` | Semua test (unit + API + sistem + browser) |
| `npm run test:unit` / `test:api` / `test:e2e` | Jalankan per kelompok |

## Mode demo tanpa PostgreSQL

Untuk mencoba FINOVA tanpa memasang database:

```bash
npm run demo
```

Perintah ini menjalankan **PostgreSQL asli di dalam proses** (PGlite/WASM), menyimpan datanya di `.finova-demo-db/` (sudah di `.gitignore`, data bertahan antar-restart), menerapkan migrasi, menjalankan seed, lalu menyalakan aplikasi di port 3000.

Ini tetap persistence PostgreSQL sungguhan — bukan `localStorage`. Yang bersifat contoh hanyalah **sumber data eksternal**: akun rekening demo dan snapshot pasar.

## Struktur proyek

```
backend/
  config/        env.js (validasi & baca konfigurasi), db.js (pool + withTransaction)
  routes/        index.js (pemasangan rute + guard + validasi)
  controllers/   auth, onboarding, dashboard, savings, installment, bank,
                 transaction, market, notification, profile, analytics, admin
  services/      savingsService, installmentService, interestService,
                 marketService, migrationRunner
  repositories/  user, savings, installment, bank, transaction, market,
                 notification, ledger, audit
  middleware/    session, validate, rateLimit, error
  validators/    schemas.js (Zod)
  providers/     mandiriProvider.js, marketProvider.js, snapshots/
  workers/       scheduledJobs.js (pasar + akrual bunga)
  websocket/     index.js (kanal realtime, autentikasi via cookie sesi)
  utils/         money, password, crypto, logger, respond
  scripts/       migrate.js, seed.js, create-admin.js, dev-demo.js,
                 generate-market-snapshot.js
database/
  migrations/    001_init.sql
  seeds/         demo_data.sql
frontend/
  pages/         landing, register, login, forgot/reset-password,
                 verify-account, app.html (shell SPA: seluruh halaman aplikasi)
  css/           main.css (design system), landing.css, auth.css, app.css
  js/            api.js, components.js, app.js, app-pages2.js, charts.js,
                 particles.js, cursor.js, realtime.js, auth.js, verify.js, landing.js
  assets/vendor/ lightweight-charts.js (build standalone, disajikan secara lokal)
tests/
  unit/  api/  e2e/  helpers/
```

Struktur `frontend/components/` dari spesifikasi diadaptasi menjadi modul JS (`js/components.js`) berisi pabrik komponen bersama — modal, toast, skeleton, empty state, format — agar tidak ada duplikasi markup.

## Model data

27 tabel, seluruhnya milik pengguna dengan cek kepemilikan di setiap query:

`users`, `user_profiles`, `user_sessions`, `password_reset_tokens`, `email_verification_tokens`, `savings_goals`, `savings_transactions`, `interest_rates`, `interest_records`, `installments`, `installment_payments`, `bank_connections`, `bank_accounts`, `beneficiaries`, `transfer_requests`, `financial_transactions`, `ledger_accounts`, `ledger_transactions`, `ledger_entries`, `watchlists`, `watchlist_items`, `market_assets`, `market_quotes`, `market_candles`, `price_alerts`, `notifications`, `audit_logs`.

Poin penting:

- Nominal memakai `NUMERIC(20,2)`; tarif `NUMERIC(7,4)` — bukan floating point.
- `savings_transactions` bersifat append-only (mutasi) dengan `balance_after` untuk penelusuran.
- Idempotensi: `UNIQUE (goal_id, idempotency_key)`, `UNIQUE (user_id, idempotency_key)` pada transaksi & transfer, `UNIQUE (bank_account_id, external_ref)` untuk mutasi bank.
- `interest_records` unik per `(goal_id, period_end)` → akrual tidak dapat tercatat ganda.
- `audit_logs` hanya-tambah (tidak ada jalur update/delete dari aplikasi).
- Indeks pada jalur panas: `(user_id, occurred_at DESC)`, `(user_id, category, occurred_at DESC)`, `price_alerts(user_id, enabled)`, `notifications(user_id, created_at DESC)`.

## API

Seluruh respons memakai envelope yang sama:

```json
{ "success": true, "data": {} }
{ "success": false, "error": { "code": "INVALID_REQUEST", "message": "Permintaan tidak valid." } }
```

**Auth** — `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`

> Pada mode non-production, respons `register` / `forgot-password` / `resend-verification` menyertakan `devVerifyUrl` / `devResetUrl` berupa **tautan relatif** (`/verify-account?token=…`) sehingga tetap berfungsi di balik proxy; tautan tersebut tidak pernah muncul di production.

**Onboarding** — `POST /api/onboarding/complete`

**Dashboard & analitik** — `GET /api/dashboard`, `GET /api/analytics`

**Tabungan** — `GET|POST /api/savings`, `GET|PUT|DELETE /api/savings/:id`, `POST /api/savings/:id/deposit`, `POST /api/savings/:id/withdraw`, `GET /api/savings/:id/interest`

**Bunga** — `GET /api/interest/rates`, `GET /api/interest/history`

**Cicilan** — `GET|POST /api/installments`, `GET|PUT|DELETE /api/installments/:id`, `POST /api/installments/:id/pay`, `GET /api/installments/:id/schedule`

**Perbankan** — `GET /api/banks/connections`, `POST /api/banks/connect`, `POST /api/banks/connect/confirm`, `GET /api/banks/accounts`, `GET /api/banks/accounts/:id`, `GET /api/banks/accounts/:id/transactions`, `POST /api/banks/sync`, `DELETE /api/banks/connections/:id`, `GET|POST /api/banks/beneficiaries`, `DELETE /api/banks/beneficiaries/:id`, `POST /api/banks/transfer`, `GET /api/banks/transfers`

**Transaksi** — `GET|POST /api/transactions`, `GET /api/transactions/export/csv`, `GET /api/transactions/:id`

**Pasar** — `GET /api/market/assets`, `GET /api/market/quotes/:symbol`, `GET /api/market/history/:symbol`, `GET /api/market/status`

**Watchlist & alert** — `GET|POST /api/watchlists`, `DELETE /api/watchlists/:id`, `POST /api/watchlists/:id/items`, `DELETE /api/watchlists/:id/items/:symbol`, `GET|POST /api/alerts`, `PATCH|DELETE /api/alerts/:id`

**Notifikasi** — `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`

**Profil & keamanan** — `GET|PUT /api/profile`, `POST /api/profile/change-password`, `GET /api/profile/sessions`, `DELETE /api/profile/sessions/:id`, `POST /api/profile/logout-all`, `POST /api/profile/delete-account`

**Admin** — `GET /api/admin/dashboard`, `GET /api/admin/users`, `PATCH /api/admin/users/:id/status`, `GET|POST /api/admin/interest-rates`, `POST /api/admin/market/refresh`, `GET /api/admin/system-health`, `GET /api/admin/audit-logs`

**Realtime** — `WS /ws` (autentikasi lewat cookie sesi; koneksi tanpa sesi ditutup dengan code 1008)

## Aturan perhitungan keuangan

Didokumentasikan dan diuji:

| Aturan | Nilai |
|---|---|
| Presisi penyimpanan | `NUMERIC(20,2)` (rupiah & sen), tarif `NUMERIC(7,4)` |
| Perhitungan internal | integer sen untuk penjumlahan; rasio memakai presisi penuh |
| Pembulatan | HALF-UP ke rupiah terdekat pada hasil akhir; deviasi per periode diserap periode terakhir |
| Basis hari bunga | ACT/365 (hari aktual / 365) |
| Tanggal akrual | per `(goal, period_end)`; idempoten per hari |
| Perubahan tarif | segmen `interest_rates.effective_from`/`effective_to`; tarif aktif dipakai saat perhitungan |
| Bunga sederhana harian | `S × r × d/365` |
| Bunga bulanan | proporsional `S × r × d/365` (bulan rata-rata 30,4167 hari) |
| Bunga majemuk | `S × ((1 + r/365)^d − 1)` |
| Rata-rata saldo | `rata-rata saldo harian × r × d/365` |
| Cicilan FLAT | pokok/tenor + pokok_awal × r/12 |
| Cicilan ANNUITY | `A = P·i/(1−(1+i)^−n)`, bunga dari sisa pokok |
| Cicilan EFFECTIVE | pokok tetap, bunga dari sisa pokok (angsuran menurun) |

Ledger internal: setiap setoran/penarikan tabungan membuat pasangan debit/kredit yang wajib berjumlah nol (ditegakkan di service dan diverifikasi test). Jumlah tidak dapat diciptakan dari sisi klien.

## Integrasi Bank Mandiri — prasyarat

Modul Rekening mengimplementasikan **arsitektur koneksi resmi** (OAuth2 + consent, token disimpan terenkripsi AES-256-GCM di server, pencabutan koneksi, penanganan otorisasi kedaluwarsa), bukan scraping dan bukan pengambilan kredensial pribadi.

Agar koneksi menjadi nyata, sisi server memerlukan:

1. **Pendaftaran aplikasi** pada kanal Open Banking Bank Mandiri (Livin' Open API / penyelaras SNAP BI) dan persetujuan sebagai PJSP/apijaman, atau kerja sama resmi yang setara.
2. **Kredensial klien**: `MANDIRI_CLIENT_ID`, `MANDIRI_CLIENT_SECRET`, `MANDIRI_BASE_URL`, pasangan sertifikat/mTLS dan tanda tangan permintaan (JWS/JWE) sesuai ketentuan kanal.
3. **Redirect URI terdaftar**: `PUBLIC_URL + /api/banks/callback` dengan scope minimum (`accounts.read balances.read transactions.read`, dan `payments.write` hanya bila transfer akan diaktifkan).
4. **Cakupan operasi**: transfer, pembayaran tagihan, dan top-up hanya aktif bila kanal memberikan izin tersebut; jika tidak, UI tetap menampilkan tombol dalam keadaan nonaktif dengan alasan yang jelas.

FINOVA **tidak pernah** meminta atau menyimpan password internet banking, PIN ATM, atau OTP, dan tidak akan pernah memintanya lewat formulir.

Selama kredensial belum ada, `GET /api/banks/connections` melaporkan `providerMode: "SNAPSHOT"` dan seluruh status koneksi diterjemahkan ke pesan Indonesia (`Rekening Mandiri belum dihubungkan.`, `Hubungkan kembali rekeningmu untuk melanjutkan.`, dst.).

## Penyedia data pasar

- `MARKET_PROVIDER=snapshot` (bawaan): 10 saham IDX dengan 260 hari candle hasil pembangkitan deterministik (`npm run market:snapshot`). Ditandai `source: "SNAPSHOT"`, `isDelayed: true`, dan ada disclaimer di UI.
- `MARKET_PROVIDER=live` + `TWELVEDATA_API_KEY`: kuotasi & histori diambil dari Twelve Data (kuotasi IDX pada paket gratis bersifat tertunda; status `isDelayed` mengikuti itu). Hormati lisensi penyedia — simpan hanya untuk penggunaan aplikasi, jangan redistribusi.
- Worker menyegarkan data tiap 5 menit dan mengevaluasi alert **hanya** dari harga yang benar-benar tersimpan; hasil refresh juga disiarkan lewat WebSocket sebagai isyarat.

Bila sumber data gagal, halaman pasar menampilkan "Data pasar untuk instrumen ini belum dapat diambil saat ini." — tidak pernah mengganti harga live dengan angka karangan.

## Keamanan

- Hashing kata sandi Argon2id (memoryCost 19456, timeCost 2) + pemeriksaan kekuatan password.
- Sesi: token acak 256-bit, disimpan sebagai SHA-256 hash, cookie `HttpOnly` + `SameSite=Lax` + `Secure` (bila `COOKIE_SECURE=true`), rotasi & pencabutan (per sesi, semua sesi, saat ganti/reset password, saat hapus akun).
- CSRF: double-submit cookie (`X-CSRF-Token`) untuk semua mutasi berautentikasi.
- Rate limiting terpisah untuk autentikasi, operasi sensitif, dan API umum; pesan 429 berbahasa Indonesia.
- Header keamanan via helmet (CSP tanpa inline script eksternal, `frame-ancestors 'self'`, nosniff, dll.), batas body 256 KB.
- SQL: seluruh kueri berparameter (`$1`, `$2`, …) — tidak ada konkatenasi input.
- Otorisasi: `requireAuth` / `requireAdmin` di server untuk setiap rute; kepemilikan diverifikasi dengan `(id, user_id)` di repository; `router.param` menolak ID non-UUID (400, bukan 500).
- Enkripsi token eksternal (AES-256-GCM) dengan kunci yang diturunkan dari `SESSION_SECRET`; token tidak pernah dikirim ke klien.
- Log terstruktur JSON dengan peredaman field rahasia (`password`, `token`, `access_token`, `otp`, `pin`, `secret`, `authorization`, `cookie`).
- Pesan error generik untuk login (tidak mengungkap keberadaan akun); stack trace tidak pernah sampai ke klien.
- Audit trail hanya-tambah untuk peristiwa autentikasi, keuangan, perbankan, dan admin.
- Notifikasi tidak pernah memuat rahasia, OTP, atau token penyedia.

## Pengujian

```bash
npm test
```

Hasil pada lingkungan pengembangan ini: **82 test, 82 lulus, 0 gagal** (±40 detik), stabil pada 4 pengulangan berturut-turut.

| Kelompok | Jumlah | Isi |
|---|---|---|
| `tests/unit` | 12 | pembulatan & format IDR, 4 metode bunga (ACT/365), 3 metode cicilan + koreksi pembulatan, validasi Zod |
| `tests/api` | 40 | registrasi→sesi→`me`→sapaan bernama; validasi & duplikat; login generik; lupa/reset + pencabutan sesi; verifikasi email; proteksi rute; admin 403 untuk USER; onboarding; tabungan (setor/tarik/guard/idempoten/histori/progres 62,5%); isolasi kepemilikan; bunga berlabel estimasi; cicilan (jadwal, bayar, lunas, FLAT vs EFFECTIVE); perbankan (tanpa koneksi = tanpa saldo; alur consent → akun berlabel Demo → mutasi `BANK_SYNC` → sync idempoten → transfer ditolak jujur; penolakan field password/PIN/OTP); transaksi (filter, paginasi, CSV); ledger (keseimbangan debit/kredit); analitik (angka persis); pasar (status jujur, kuotasi, candle, pencarian); watchlist; alert (hanya terpicu oleh data nyata); notifikasi; profil; keamanan (ganti sandi mencabut sesi lain, cabut sesi, logout-all, hapus akun); CSRF 403; format envelope & tanpa stack trace; seluruh halaman & aset statis |
| `tests/api/rateLimit` | 1 | pembatasan laju login → 429 dengan pesan Indonesia |
| `tests/api/system` | 6 | siklus pekerja pasar, akrual bunga idempoten, WebSocket (tolak tanpa sesi 1008, kirim isyarat), audit rollback `migrate:down` butuh `--force`, redaksi log |
| `tests/e2e/landing` | 7 | Landing di-render dengan JavaScript asli: hero & CTA menuju tujuan, kursor kustom dibuat sekali (tidak dobel inisialisasi), kanvas partikel, reveal scroll, menu mobile, FAQ, halaman auth (meter kata sandi, label↔input, tanpa tautan mati) |
| `tests/e2e/contract` | 7 | Kontrak statis: setiap panggilan API frontend punya rute di backend, tidak ada tautan/aset HTML yang mati, tidak ada `alert()`/placeholder, breakpoint responsif & target sentuh ≥44px, kelas CSS yang dipakai JS benar-benar terdefinisi, tidak ada skrip inline (kompatibel CSP `script-src 'self'`), Lightweight Charts disajikan lokal |
| `tests/e2e/browser` | 9 | SPA dimuat di jsdom dengan backend & DB nyata: sapaan & angka, navigasi sidebar, modal buat target → setoran → progres 62,5% (diperiksa juga di PostgreSQL), validasi form klien, halaman Rekening membuka alur consent, halaman Pasar menampilkan label status data, penolakan admin untuk USER, dan pemeriksaan statis: tanpa `alert()`/“Coming Soon”/tautan mati, tanpa `localStorage` untuk data keuangan |

Test API/browser memakai PostgreSQL nyata: jika `DATABASE_URL` dapat dihubungi, server itu dipakai; jika tidak, helper otomatis menjalankan PGlite (PostgreSQL WASM) di dalam proses sehingga migrasi, constraint, transaksi, dan SQL tetap diuji sungguhan. Bila keduanya tidak tersedia, test integrasi di-*skip* dengan pesan yang jelas.

Playwright/Chromium tidak tersedia di lingkungan ini, sehingga interaksi browser dijalankan dengan jsdom (DOM + eksekusi JavaScript klien asli). Untuk uji visual/responsif tambahan, jalankan `npm run demo` dan buka `http://localhost:3000` — tata letak diuji pada 1920×1080, 1440×900, 1366×768, 1024×768, 820×1180, 430×932, 390×844, 375×812 lewat devtools peramban.

## Batasan yang tersisa

- **Email**: tidak ada layanan SMTP yang terkonfigurasi, jadi tautan verifikasi/reset ditampilkan di UI hanya pada mode non-production (`devVerifyUrl` / `devResetUrl`, berupa path relatif). Di production, siapkan transport email dan aktifkan pengiriman; tanpa itu, tautan tidak dikirim (bukan dikirim palsu).
- **Koneksi bank live**: memerlukan kredensial & persetujuan resmi (lihat prasyarat). Tanpa itu, modul Rekening berjalan pada mode contoh berlabel dan operasi finansial tetap tertutup.
- **Transfer / pembayaran tagihan / top-up**: belum ada kanal berizin, jadi sengaja ditolak dengan penjelasan — tidak disimulasikan berhasil.
- **Data pasar live**: perlu API key penyedia berlisensi; saat ini default-nya snapshot contoh.
- **Akrual bunga**: berjalan per hari melalui pekerja terjadwal (bukan trigger database); restart server akan melanjutkan dari periode terakhir tanpa duplikasi.
- **Rate limiting** memakai penyimpanan in-memory proses (tepat untuk satu instance; gunakan penyimpanan bersama bila men-scala horizontal).

## Lisensi

Lihat berkas `LICENSE`.
