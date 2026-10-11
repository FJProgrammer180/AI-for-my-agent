/* FINOVA — interaksi halaman landing. */
(function () {
  'use strict';

  let ready = false;
  document.addEventListener('DOMContentLoaded', () => {
    if (ready) return; // idempoten terhadap event ganda
    ready = true;
    // Menu mobile
    const toggle = document.getElementById('nav-toggle');
    const links = document.getElementById('nav-links');
    if (toggle && links) {
      toggle.addEventListener('click', () => {
        const open = links.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      });
      links.addEventListener('click', (e) => {
        if (e.target.tagName === 'A') links.classList.remove('open');
      });
    }

    // Reveal saat scroll
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) { en.target.classList.add('visible'); io.unobserve(en.target); }
      }
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

    // Jika sudah login, tombol "Masuk" mengarah ke dashboard
    window.api.get('/api/auth/me').then((d) => {
      if (d && d.authenticated) {
        document.querySelectorAll('a[href="/login"]').forEach((a) => {
          a.href = '/dashboard';
          a.textContent = 'Buka Dashboard';
        });
      }
    }).catch(() => {});
  });
})();
