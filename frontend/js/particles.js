/* FINOVA — latar partikel kanvas ringan. */
(function () {
  'use strict';

  function init() {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return;
    if (canvas.dataset.initialized === '1') return; // hindari dua loop animasi
    canvas.dataset.initialized = '1';
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return; // lingkungan tanpa canvas (mis. pengujian headless)
    let w, h, particles, raf = null;
    const pointer = { x: -9999, y: -9999 };
    const DPR = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      w = canvas.width = Math.floor(innerWidth * DPR);
      h = canvas.height = Math.floor(innerHeight * DPR);
      canvas.style.width = innerWidth + 'px';
      canvas.style.height = innerHeight + 'px';
      const density = innerWidth < 640 ? 14000 : 9000; // lebih sedikit di perangkat kecil
      const count = Math.min(160, Math.floor((innerWidth * innerHeight) / density));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        z: 0.3 + Math.random() * 0.7,           // kedalaman
        vx: (Math.random() - 0.5) * 0.12 * DPR,
        vy: (Math.random() - 0.5) * 0.12 * DPR,
        r: (0.6 + Math.random() * 1.4) * DPR,
      }));
    }

    function step() {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        // daya tarik lembut ke pointer
        const dx = pointer.x * DPR - p.x;
        const dy = pointer.y * DPR - p.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < 260 * 260 * DPR && dist2 > 40) {
          p.vx += (dx / Math.sqrt(dist2)) * 0.006 * p.z;
          p.vy += (dy / Math.sqrt(dist2)) * 0.006 * p.z;
        }
        p.vx *= 0.995; p.vy *= 0.995;
        p.x += p.vx * p.z; p.y += p.vy * p.z;
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.z, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(244,245,246,${0.05 + p.z * 0.16})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(step);
    }

    function start() { if (!raf) raf = requestAnimationFrame(step); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

    resize();
    start();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
