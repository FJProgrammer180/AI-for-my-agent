/* FINOVA — klien API terpadu (Fetch API). */
(function () {
  'use strict';

  function readCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function request(method, url, body) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const csrf = readCookie('finova_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        credentials: 'same-origin',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error('Koneksi ke server terputus. Periksa jaringanmu.');
    }
    let data = null;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error && data.error.message) || 'Terjadi kendala. Coba lagi.');
      err.code = data && data.error && data.error.code;
      err.status = res.status;
      err.details = data && data.error && data.error.details;
      throw err;
    }
    return data ? data.data : null;
  }

  window.api = {
    get: (url) => request('GET', url),
    post: (url, body) => request('POST', url, body ?? {}),
    put: (url, body) => request('PUT', url, body ?? {}),
    patch: (url, body) => request('PATCH', url, body ?? {}),
    del: (url) => request('DELETE', url),
    idempotencyKey() {
      return 'fk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    },
  };
})();
