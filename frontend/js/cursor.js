/* FINOVA — kursor kustom (desktop pointer saja). */
(function () {
  'use strict';

  function init() {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (document.body.hasAttribute('data-cursor-ready')) return;
    document.body.setAttribute('data-cursor-ready', '1');
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const dot = document.createElement('div');
    const ring = document.createElement('div');
    dot.className = 'cursor-dot';
    ring.className = 'cursor-ring';
    document.body.appendChild(dot);
    document.body.appendChild(ring);
    document.body.classList.add('custom-cursor');

    const target = { x: innerWidth / 2, y: innerHeight / 2 };
    const pos = { x: target.x, y: target.y };
    let raf = null;

    function loop() {
      pos.x += (target.x - pos.x) * 0.18;
      pos.y += (target.y - pos.y) * 0.18;
      dot.style.transform = `translate(${target.x}px, ${target.y}px) translate(-50%,-50%)`;
      ring.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%,-50%)`;
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener('pointermove', (e) => {
      target.x = e.clientX; target.y = e.clientY;
      const interactive = e.target.closest('a, button, .btn, input, select, textarea, [data-cursor="hover"]');
      ring.classList.toggle('is-hover', !!interactive);
    }, { passive: true });

    window.addEventListener('pointerdown', () => {
      ring.classList.remove('is-click');
      void ring.offsetWidth;
      ring.classList.add('is-click');
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(raf); raf = null; }
      else if (!raf) raf = requestAnimationFrame(loop);
    });

    raf = requestAnimationFrame(loop);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
