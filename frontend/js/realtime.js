/* ============================================================
   FINOVA — klien realtime.
   Koneksi WebSocket hanya memberi "sinyal" bahwa data berubah;
   nilai aktual selalu diambil ulang dari API (sumber kebenaran tunggal).
   Bila WebSocket tidak tersedia, aplikasi tetap berfungsi normal.
   ============================================================ */
(function () {
  'use strict';

  let ws = null;
  let retry = 0;
  let closed = false;

  function url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  function connect() {
    if (closed || typeof WebSocket === 'undefined') return;
    try { ws = new WebSocket(url()); } catch (_) { return scheduleRetry(); }

    ws.onopen = () => { retry = 0; };
    ws.onmessage = (ev) => {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }
      if (!msg || !msg.type) return;
      if (msg.type === 'notifications:changed' || msg.type === 'notification') {
        window.dispatchEvent(new CustomEvent('finova:notifications-changed', { detail: msg.payload || null }));
      } else if (msg.type === 'quotes') {
        window.dispatchEvent(new CustomEvent('finova:quotes', { detail: msg.payload || [] }));
      }
    };
    ws.onclose = () => scheduleRetry();
    ws.onerror = () => { try { ws.close(); } catch (_) { /* diamkan */ } };
  }

  function scheduleRetry() {
    if (closed) return;
    retry = Math.min(retry + 1, 6);
    setTimeout(connect, 2000 * retry); // mundur bertahap, maksimal ~12 detik
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (!ws || ws.readyState === WebSocket.CLOSED) { retry = 0; connect(); }
  });

  connect();
})();
