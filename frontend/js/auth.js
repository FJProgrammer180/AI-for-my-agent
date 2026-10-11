/* FINOVA — logika halaman autentikasi. */
(function () {
  'use strict';

  function showAlert(msg, type = 'error') {
    const el = document.getElementById('form-alert');
    if (!el) return;
    el.textContent = msg;
    el.className = 'form-alert show ' + type;
  }

  function clearErrors() {
    document.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
    showAlert('', 'error');
    const el = document.getElementById('form-alert');
    if (el) el.classList.remove('show');
  }

  function showFieldErrors(details) {
    if (!Array.isArray(details)) return;
    for (const d of details) {
      const el = document.querySelector(`[data-error="${d.field}"]`);
      if (el) el.textContent = d.message;
    }
  }

  function meter(password) {
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;
    return score; // 0..5
  }

  function bindMeter(input, bar) {
    if (!input || !bar) return;
    input.addEventListener('input', () => {
      const s = meter(input.value);
      const pct = [0, 25, 45, 65, 85, 100][s];
      const colors = ['#33383D', '#F87171', '#FBBF24', '#FBBF24', '#4ADE80', '#4ADE80'];
      bar.style.width = pct + '%';
      bar.style.background = colors[s];
    });
  }

  function formData(form) {
    const d = {};
    new FormData(form).forEach((v, k) => { d[k] = typeof v === 'string' ? v.trim() : v; });
    return d;
  }

  function initRegister() {
    bindMeter(document.getElementById('password'), document.getElementById('meter-bar'));
    const form = document.getElementById('register-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const btn = document.getElementById('submit-btn');
      const d = formData(form);
      // Diambil lewat id (bukan akses bernama pada <form>) agar konsisten di semua peramban
      const terms = document.getElementById('acceptTerms');
      d.acceptTerms = !!(terms && terms.checked);
      // validasi klien ringan (server tetap otoritatif)
      if (!d.fullName || !d.username || !d.email || !d.password) return showAlert('Semua kolom wajib diisi.');
      if (d.password !== d.confirmPassword) return showAlert('Konfirmasi kata sandi tidak sama.');
      if (!d.acceptTerms) return showAlert('Kamu harus menyetujui syarat & kebijakan privasi.');
      window.ui.setBusy(btn, true, 'Mendaftarkan…');
      try {
        const res = await window.api.post('/api/auth/register', d);
        if (res.devVerifyUrl) {
          // Tanpa layanan email terkonfigurasi, tautan verifikasi ditampilkan
          // langsung agar alurnya dapat dipakai — bukan sekadar pesan sukses.
          showAlert('Pendaftaran berhasil. Verifikasi emailmu untuk mengaktifkan penuh akun ini.', 'success');
          form.style.display = 'none';
          const box = document.createElement('div');
          box.innerHTML = `
            <a class="btn btn-primary btn-block" href="${res.devVerifyUrl}">Verifikasi Email Sekarang</a>
            <button class="btn btn-block" type="button" id="skip-verify" style="margin-top:10px">Nanti, lanjut ke penerapan awal</button>
            <p class="text-dim" style="font-size:12.5px;margin-top:12px">Pada deployment produksi, tautan ini dikirim ke emailmu; FINOVA tidak menampilkannya di layar.</p>`;
          form.after(box);
          box.querySelector('#skip-verify').addEventListener('click', () => { window.location.href = '/onboarding'; });
          setTimeout(() => { window.location.href = '/onboarding'; }, 12000);
        } else {
          showAlert('Pendaftaran berhasil! Mengalihkan…', 'success');
          setTimeout(() => { window.location.href = '/onboarding'; }, 700);
        }
      } catch (err) {
        showFieldErrors(err.details);
        showAlert(err.message);
      } finally {
        window.ui.setBusy(btn, false);
      }
    });
  };

  function initLogin() {
    const form = document.getElementById('login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const btn = document.getElementById('submit-btn');
      const d = formData(form);
      if (!d.identifier || !d.password) return showAlert('Email/nama pengguna dan kata sandi wajib diisi.');
      window.ui.setBusy(btn, true, 'Memeriksa…');
      try {
        const res = await window.api.post('/api/auth/login', d);
        window.ui.toast(res.greeting, 'success', 4200);
        setTimeout(() => {
          window.location.href = res.firstLogin ? '/onboarding' : '/dashboard';
        }, 650);
      } catch (err) {
        showAlert(err.message);
      } finally {
        window.ui.setBusy(btn, false);
      }
    });
  };

  function initForgot() {
    const form = document.getElementById('forgot-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const btn = document.getElementById('submit-btn');
      const d = formData(form);
      if (!d.email) return showAlert('Email wajib diisi.');
      window.ui.setBusy(btn, true, 'Mengirim…');
      try {
        const res = await window.api.post('/api/auth/forgot-password', d);
        showAlert(res.message, 'success');
        // Mode pengembangan: tampilkan tautan langsung (tanpa layanan email).
        if (res.devResetUrl) {
          const a = document.createElement('a');
          a.href = res.devResetUrl;
          a.textContent = 'Buka tautan atur ulang (mode pengembangan)';
          a.className = 'btn btn-accent btn-block';
          a.style.marginTop = '14px';
          form.after(a);
        }
      } catch (err) {
        showAlert(err.message);
      } finally {
        window.ui.setBusy(btn, false);
      }
    });
  };

  function initReset() {
    bindMeter(document.getElementById('password'), document.getElementById('meter-bar'));
    const token = new URLSearchParams(location.search).get('token') || '';
    const form = document.getElementById('reset-form');
    if (!token) showAlert('Tautan tidak lengkap. Minta tautan baru dari halaman lupa kata sandi.');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();
      const btn = document.getElementById('submit-btn');
      const d = formData(form);
      d.token = token;
      if (d.password !== d.confirmPassword) return showAlert('Konfirmasi kata sandi tidak sama.');
      window.ui.setBusy(btn, true, 'Menyimpan…');
      try {
        const res = await window.api.post('/api/auth/reset-password', d);
        showAlert(res.message, 'success');
        setTimeout(() => { window.location.href = '/login'; }, 1200);
      } catch (err) {
        showAlert(err.message);
      } finally {
        window.ui.setBusy(btn, false);
      }
    });
  };

  // Inisialisasi otomatis — halaman tidak memakai <script> inline karena CSP
  // membatasi script-src ke 'self'.
  function autostart() {
    if (document.getElementById('register-form')) return initRegister();
    if (document.getElementById('login-form')) return initLogin();
    if (document.getElementById('forgot-form')) return initForgot();
    if (document.getElementById('reset-form')) return initReset();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autostart);
  } else {
    autostart();
  }

  window.authPages = { initRegister, initLogin, initForgot, initReset };
})();
