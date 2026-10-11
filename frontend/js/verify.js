/* FINOVA — halaman verifikasi akun. */
(function () {
  'use strict';

  function showAlert(msg, type) {
    const el = document.getElementById('form-alert');
    el.textContent = msg;
    el.className = 'form-alert show ' + type;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const tokenFromUrl = new URLSearchParams(location.search).get('token') || '';
    const input = document.getElementById('token');
    if (tokenFromUrl) {
      input.value = tokenFromUrl;
      runVerify(tokenFromUrl);
    }

    async function runVerify(token) {
      const btn = document.getElementById('submit-btn');
      window.ui.setBusy(btn, true, 'Memverifikasi…');
      try {
        const res = await window.api.post('/api/auth/verify-email', { token });
        showAlert(res.message + ' Mengalihkan ke dashboard…', 'success');
        setTimeout(() => { window.location.href = '/dashboard'; }, 1200);
      } catch (err) {
        showAlert(err.message, 'error');
      } finally {
        window.ui.setBusy(btn, false);
      }
    }

    document.getElementById('verify-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) return showAlert('Masukkan kode verifikasi terlebih dahulu.', 'error');
      runVerify(v);
    });

    document.getElementById('btn-resend').addEventListener('click', async (e) => {
      const email = document.getElementById('resend-email').value.trim();
      if (!email) return showAlert('Isi email akunmu untuk mengirim ulang tautan.', 'error');
      window.ui.setBusy(e.currentTarget, true, 'Mengirim…');
      try {
        const res = await window.api.post('/api/auth/resend-verification', { email });
        let msg = res.message;
        if (res.devVerifyUrl) {
          msg += ' (Mode pengembangan: buka tautan verifikasi yang baru dibuat.)';
          window.__devVerifyUrl = res.devVerifyUrl;
          const a = document.createElement('a');
          a.href = res.devVerifyUrl;
          a.className = 'btn btn-accent btn-block';
          a.style.marginTop = '10px';
          a.textContent = 'Buka tautan verifikasi (mode pengembangan)';
          document.getElementById('verify-form').after(a);
        }
        showAlert(msg, 'success');
      } catch (err) {
        showAlert(err.message, 'error');
      } finally {
        window.ui.setBusy(e.currentTarget, false);
      }
    });
  });
})();
