/* ============================================================
   FINOVA — kernel aplikasi SPA + seluruh halaman pengguna
   ============================================================ */
(function () {
  'use strict';

  const state = {
    user: null,
    route: null,
    marketSymbolsCache: {},
  };

  const MISSING_EL = {
    innerHTML: '', textContent: '', hidden: true, value: '', checked: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    style: {}, dataset: {},
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {}, focus() {}, blur() {},
    insertAdjacentHTML() {}, appendChild() {}, remove() {}, after() {}, closest: () => null,
    setAttribute() {}, getAttribute: () => null,
  };
  Object.defineProperty(MISSING_EL, 'innerHTML', { set() {}, get() { return ''; } });
  Object.defineProperty(MISSING_EL, 'textContent', { set() {}, get() { return ''; } });

  /** Selector yang aman terhadap balapan rute: mengembalikan elemen dummy bila tidak ada. */
  const $ = (sel) => document.querySelector(sel) || (String(sel).startsWith('#') ? MISSING_EL : null);
  const esc = window.ui.escapeHtml;

  const TITLES = {
    dashboard: 'Dashboard', savings: 'Tabungan', interest: 'Bunga & Estimasi',
    installments: 'Cicilan', banking: 'Rekening', transactions: 'Transaksi',
    analytics: 'Analitik', market: 'Pasar', watchlist: 'Watchlist',
    alerts: 'Alert Harga', notifications: 'Notifikasi', profile: 'Profil',
    security: 'Keamanan', admin: 'Panel Admin', onboarding: 'Perkenalan',
  };

  // ---------- Router ----------
  function routeName() {
    const p = location.pathname.replace(/\/+$/, '').replace(/^\//, '');
    return p || 'dashboard';
  }

  function navigate(path, push = true) {
    if (push) history.pushState({}, '', path);
    render();
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-link]');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    if (href === '/notifications' && a.id === 'notif-btn') { /* tetap SPA */ }
    navigate(href);
    document.getElementById('sidebar')?.classList.remove('open');
  });
  window.addEventListener('popstate', () => render());

  function setActiveNav(name) {
    document.querySelectorAll('[data-nav]').forEach((el) => {
      el.classList.toggle('active', el.dataset.nav === name);
    });
    document.getElementById('topbar-title').textContent = TITLES[name] || 'FINOVA';
  }

  // ---------- Bootstrapping ----------
  let booted = false;
  async function bootstrap() {
    if (booted) return; // idempoten: event load dapat terkirim lebih dari sekali
    booted = true;
    let me;
    try {
      me = await window.api.get('/api/auth/me');
    } catch (err) {
      window.ui.toast('Tidak dapat menghubungi server.', 'error');
      return;
    }
    if (!me || !me.authenticated) {
      window.location.href = '/login';
      return;
    }
    state.user = me.user;
    if (!me.user.onboardingCompleted) {
      navigate('/onboarding', false);
      return;
    }
    // Sapaan saat pertama membuka aplikasi (sekali per muat halaman)
    if (sessionStorage.getItem('finova_greeted') !== '1') {
      sessionStorage.setItem('finova_greeted', '1');
      showGreeting(`${me.user.fullName}, selamat datang lagi :)`);
    }
    if (me.user.role === 'ADMIN') $('#nav-admin').hidden = false;
    const initials = me.user.fullName.split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
    $('#user-avatar').textContent = initials;
    $('#user-name').textContent = me.user.fullName;
    refreshNotifBadge();
    listenRealtime();
    render();
  }

  /** Berlangganan isyarat realtime: data diambil ulang dari API (bukan dari sinyal). */
  function listenRealtime() {
    window.addEventListener('finova:notifications-changed', () => refreshNotifBadge());
    window.addEventListener('finova:quotes', (e) => {
      if (state.route === 'market' || state.route === 'watchlist') {
        window.dispatchEvent(new CustomEvent('finova:refresh-market'));
      }
    });
  }

  function showGreeting(text) {
    const ov = $('#greeting-overlay');
    $('#greeting-text').textContent = text;
    ov.hidden = false;
    requestAnimationFrame(() => ov.classList.add('show'));
    setTimeout(() => {
      ov.classList.remove('show');
      setTimeout(() => { ov.hidden = true; }, 450);
    }, 1900);
  }

  async function refreshNotifBadge() {
    try {
      const d = await window.api.get('/api/notifications?limit=1');
      const dot = $('#notif-dot');
      if (dot) dot.hidden = !d.unread;
    } catch (_) { /* diamkan */ }
  }

  // ---------- Render ----------
  const pages = {}; // diisi modul halaman di bawah

  let renderToken = 0;
  async function render() {
    const name = routeName();
    const token = ++renderToken;
    state.route = name;
    setActiveNav(name);
    const root = $('#app-content');
    const stale = () => token !== renderToken;
    root.innerHTML = `<div class="grid grid-3" style="margin-top:10px">${window.ui.skeletonCards(3)}</div>`;
    const fn = pages[name] || pages.notfound;
    try {
      await fn(root);
    } catch (err) {
      if (stale()) return; // pengguna sudah pindah halaman — abaikan
      if (err.status === 401) { window.location.href = '/login'; return; }
      root.innerHTML = `<div class="panel"><h3>Terjadi kendala</h3>
        <p class="text-dim" style="margin-top:8px">${esc(err.message)}</p></div>`;
    }
    if (!stale() && window.scrollTo) window.scrollTo({ top: 0 });
  }

  pages.notfound = async (root) => {
    root.innerHTML = `<div class="panel" style="text-align:center;padding:60px">
      <h2>Halaman tidak ditemukan</h2>
      <p class="text-dim" style="margin:10px 0 22px">Tautan yang kamu buka tidak tersedia di aplikasi FINOVA.</p>
      <a href="/dashboard" data-link class="btn btn-primary">Ke Dashboard</a></div>`;
  };

  // ---------- Helper umum ----------
  function pageHead(title, sub, actionsHtml = '') {
    return `<div class="page-head"><div><h2>${esc(title)}</h2>
      ${sub ? `<div class="page-sub">${esc(sub)}</div>` : ''}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">${actionsHtml}</div></div>`;
  }

  async function guarded(btn, fn, busyLabel) {
    window.ui.setBusy(btn, true, busyLabel);
    try { return await fn(); }
    finally { window.ui.setBusy(btn, false); }
  }

  /* ================= ONBOARDING ================= */
  pages.onboarding = async (root) => {
    const u = state.user;
    let step = 0;
    const draft = { monthlyIncome: 0, goals: [] };

    function renderStep() {
      const stepsHtml = `<div class="onboard-steps">${[0, 1, 2].map((i) => `<span class="${i <= step ? 'done' : ''}"></span>`).join('')}</div>`;
      if (step === 0) {
        root.innerHTML = `<div class="panel" style="max-width:640px;margin:30px auto">
          ${stepsHtml}
          <h2>${esc(u.fullName)}, selamat datang.</h2>
          <p class="text-dim" style="margin:10px 0 26px">Mari siapkan FINOVA dalam tiga langkah singkat. Semua bisa kamu ubah kapan pun.</p>
          <div class="field">
            <label for="ob-income">Pendapatan rata-rata per bulan (opsional)</label>
            <input class="input" id="ob-income" type="number" min="0" step="50000" placeholder="Contoh: 8500000" value="${draft.monthlyIncome || ''}">
          </div>
          <div class="modal-actions" style="justify-content:flex-end">
            <button class="btn btn-primary" id="ob-next">Lanjut →</button>
          </div>
        </div>`;
        $('#ob-next').addEventListener('click', () => {
          draft.monthlyIncome = Number($('#ob-income').value || 0);
          step = 1; renderStep();
        });
      } else if (step === 1) {
        root.innerHTML = `<div class="panel" style="max-width:720px;margin:30px auto">
          ${stepsHtml}
          <h2>Target Tabungan</h2>
          <p class="text-dim" style="margin:10px 0 20px">Tetapkan sampai 3 target awal. Kamu dapat menambah, menyunting, atau mengarsipkannya nanti.</p>
          <div id="ob-goals"></div>
          <button class="btn btn-sm" id="ob-add-goal" style="margin-bottom:18px">+ Tambah target</button>
          <div class="modal-actions" style="justify-content:space-between">
            <button class="btn btn-ghost" id="ob-back">← Kembali</button>
            <button class="btn btn-primary" id="ob-next">Lanjut →</button>
          </div>
        </div>`;
        const goalsEl = $('#ob-goals');
        function addGoalRow() {
          if (goalsEl.children.length >= 3) return window.ui.toast('Maksimal 3 target awal.', 'error');
          const row = document.createElement('div');
          row.className = 'goal-row';
          row.innerHTML = `<div class="goal-inputs">
            <input class="input" placeholder="Nama target (mis. Dana Laptop)" data-f="name" maxlength="80">
            <input class="input" type="number" min="1" placeholder="Target Rp" data-f="targetAmount">
            <input class="input" type="date" data-f="targetDate" title="Tenggat (opsional)">
            <button class="btn btn-sm btn-ghost" title="Hapus" data-act="remove">✕</button>
          </div>`;
          row.querySelector('[data-act="remove"]').addEventListener('click', () => row.remove());
          goalsEl.appendChild(row);
        }
        addGoalRow();
        $('#ob-add-goal').addEventListener('click', addGoalRow);
        $('#ob-back').addEventListener('click', () => { step = 0; renderStep(); });
        $('#ob-next').addEventListener('click', () => {
          draft.goals = [...goalsEl.querySelectorAll('.goal-row')].map((r) => ({
            name: r.querySelector('[data-f="name"]').value.trim(),
            targetAmount: Number(r.querySelector('[data-f="targetAmount"]').value || 0),
            targetDate: r.querySelector('[data-f="targetDate"]').value || undefined,
          })).filter((g) => g.name && g.targetAmount > 0);
          step = 2; renderStep();
        });
      } else {
        root.innerHTML = `<div class="panel" style="max-width:640px;margin:30px auto">
          ${stepsHtml}
          <h2>Preferensi Tabungan</h2>
          <p class="text-dim" style="margin:10px 0 20px">Zona waktu dan mata uang untuk tampilan. Kamu juga dapat melewati langkah ini.</p>
          <div class="grid grid-2">
            <div class="field">
              <label for="ob-tz">Zona waktu</label>
              <select class="input" id="ob-tz">
                <option value="Asia/Jakarta" selected>Asia/Jakarta (WIB)</option>
                <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
              </select>
            </div>
            <div class="field">
              <label for="ob-cur">Mata uang</label>
              <select class="input" id="ob-cur">
                <option value="IDR" selected>IDR — Rupiah</option>
              </select>
            </div>
          </div>
          <div class="modal-actions" style="justify-content:space-between">
            <button class="btn btn-ghost" id="ob-back">← Kembali</button>
            <button class="btn btn-primary" id="ob-finish">Selesai &amp; Masuk Dashboard</button>
          </div>
        </div>`;
        $('#ob-back').addEventListener('click', () => { step = 1; renderStep(); });
        $('#ob-finish').addEventListener('click', async (e) => {
          await guarded(e.currentTarget, async () => {
            await window.api.post('/api/onboarding/complete', {
              monthlyIncome: draft.monthlyIncome,
              timezone: $('#ob-tz').value,
              currency: $('#ob-cur').value,
              goals: draft.goals,
            });
            showGreeting(`${state.user.fullName}, selamat datang.`);
            navigate('/dashboard');
          }, 'Menyimpan…');
        });
      }
    }
    renderStep();
  };

  /* ================= DASHBOARD ================= */
  pages.dashboard = async (root) => {
    const d = await window.api.get('/api/dashboard');
    const m = d.metrics;

    const verifyBanner = state.user.emailVerified ? '' : `
      <div class="panel section-block" style="padding:14px 18px;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;border-color:rgba(251,191,36,0.35)">
        <div><strong style="font-size:14px">Email kamu belum diverifikasi</strong>
        <div class="text-dim" style="font-size:13px">Verifikasi untuk mengamankan akun dan memulihkannya lebih mudah.</div></div>
        <a href="/verify-account" data-link class="btn btn-sm btn-accent">Verifikasi sekarang</a>
      </div>`;

    root.innerHTML = `
      ${verifyBanner}
      ${pageHead(`Halo, ${state.user.fullName.split(' ')[0]}`, 'Ringkasan keuangan dari data tersimpanmu.')}
      <div class="grid grid-4 section-block">
        <div class="card stat-card"><div class="stat-label">Kekayaan Bersih</div>
          <div class="stat-value">${esc(window.ui.fmtIDR(m.netWorth))}</div>
          <div class="stat-note">Aset − liabilitas</div></div>
        <div class="card stat-card"><div class="stat-label">Tabungan Internal</div>
          <div class="stat-value">${esc(window.ui.fmtIDR(m.savingsTotal))}</div>
          <div class="stat-note">${esc(m.savingsNote)}</div></div>
        <div class="card stat-card"><div class="stat-label">Saldo Rekening</div>
          <div class="stat-value">${esc(window.ui.fmtIDR(m.bankBalanceTotal))}</div>
          <div class="stat-note">${esc(m.bankNote)}</div></div>
        <div class="card stat-card"><div class="stat-label">Cicilan Berjalan</div>
          <div class="stat-value">${esc(window.ui.fmtIDR(m.installmentOutstanding))}</div>
          <div class="stat-note">Sisa pokok + bunga</div></div>
      </div>

      <div class="grid grid-2 section-block">
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:14px">Arus Kas 6 Bulan</h3>
          <div class="chart-box" style="height:240px"><canvas id="cf-canvas" style="width:100%;height:100%"></canvas></div>
          <div style="display:flex;gap:18px;margin-top:10px;font-size:12.5px;color:var(--text-2)">
            <span><i style="display:inline-block;width:10px;height:10px;background:#7DD3E8;border-radius:2px;margin-right:6px"></i>Pemasukan</span>
            <span><i style="display:inline-block;width:10px;height:10px;background:#5c646c;border-radius:2px;margin-right:6px"></i>Pengeluaran</span>
          </div>
        </div>
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:14px">Bulan Ini</h3>
          <dl class="detail-list">
            <dt>Pemasukan</dt><dd class="mono">${esc(window.ui.fmtIDR(m.monthlyIncome))}</dd>
            <dt>Pengeluaran</dt><dd class="mono">${esc(window.ui.fmtIDR(m.monthlyExpense))}</dd>
            <dt>Selisih</dt><dd class="mono" style="color:${m.monthlyIncome - m.monthlyExpense >= 0 ? 'var(--success)' : 'var(--danger)'}">${esc(window.ui.fmtIDR(m.monthlyIncome - m.monthlyExpense))}</dd>
            <dt>Bunga tercatat</dt><dd class="mono">${esc(window.ui.fmtIDR(m.interestAccruedTotal))}</dd>
            <dt>Total aset</dt><dd class="mono">${esc(window.ui.fmtIDR(m.totalAssets))}</dd>
            <dt>Total liabilitas</dt><dd class="mono">${esc(window.ui.fmtIDR(m.totalLiabilities))}</dd>
          </dl>
          <p class="text-dim" style="font-size:12px;margin-top:14px">${esc(m.interestNote)}</p>
        </div>
      </div>

      <div class="card section-block">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="font-size:15px">Aktivitas Terbaru</h3>
          <a href="/transactions" data-link class="btn btn-sm btn-ghost">Lihat semua →</a>
        </div>
        ${d.recentTransactions.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Tanggal</th><th>Deskripsi</th><th>Kategori</th><th>Sumber</th><th style="text-align:right">Jumlah</th></tr></thead>
          <tbody>${d.recentTransactions.map((t) => `<tr>
            <td class="text-dim">${esc(window.ui.fmtDate(t.occurred_at))}</td>
            <td>${esc(t.description || '—')}</td>
            <td><span class="badge">${esc(window.ui.CATEGORY_LABELS[t.category] || t.category)}</span></td>
            <td>${t.source === 'BANK_SYNC' ? '<span class="badge badge-accent">Bank</span>' : '<span class="badge">Manual</span>'}</td>
            <td class="mono" style="text-align:right;color:${t.type === 'INCOME' ? 'var(--success)' : 'var(--text)'}">${t.type === 'INCOME' ? '+' : '−'} ${esc(window.ui.fmtIDR(t.amount))}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : window.ui.emptyState('◔', 'Belum ada aktivitas', 'Catat transaksi pertamamu dari halaman Transaksi.')}
      </div>`;

    requestAnimationFrame(() => {
      const cv = $('#cf-canvas');
      if (cv) window.charts.cashflowBars(cv, d.monthlyCashflow);
    });
  };

  /* ================= TABUNGAN ================= */
  pages.savings = async (root) => {
    async function paint() {
      const d = await window.api.get('/api/savings?includeArchived=true');
      const goals = d.goals;
      $('#savings-grid').innerHTML = goals.length ? goals.map((g) => {
        const pct = Math.min(100, g.progress);
        return `<div class="card" data-goal="${g.id}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div><h3 style="font-size:16px">${esc(g.name)}</h3>
            <div class="text-dim" style="font-size:12.5px">${g.target_date ? 'Tenggat ' + esc(window.ui.fmtDate(g.target_date)) : 'Tanpa tenggat'}</div></div>
            <span class="badge ${g.status === 'ACTIVE' ? 'badge-accent' : g.status === 'COMPLETED' ? 'badge-success' : ''}">${g.status === 'ACTIVE' ? 'Aktif' : g.status === 'COMPLETED' ? 'Tercapai' : 'Arsip'}</span>
          </div>
          <div class="mono" style="font-size:23px;font-weight:800;margin:14px 0 4px">${esc(window.ui.fmtIDR(g.balance))}</div>
          <div class="text-dim" style="font-size:13px">Target ${esc(window.ui.fmtIDR(g.target_amount))} · Sisa ${esc(window.ui.fmtIDR(g.remaining))}</div>
          <div class="progress" style="margin:12px 0"><span style="width:${pct}%"></span></div>
          <div style="display:flex;justify-content:space-between;font-size:13px" class="text-dim">
            <span>${String(pct).replace('.', ',')}% tercapai</span>
            ${g.interest_rate ? `<span>estimasi ${esc(String(g.interest_rate))}%/thn</span>` : ''}
          </div>
          <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-sm btn-primary" data-act="deposit">Setor</button>
            <button class="btn btn-sm" data-act="withdraw">Tarik</button>
            <button class="btn btn-sm btn-ghost" data-act="history">Histori</button>
            <button class="btn btn-sm btn-ghost" data-act="edit">Sunting</button>
            ${g.status === 'ACTIVE' ? '<button class="btn btn-sm btn-ghost" data-act="archive">Arsipkan</button>' : ''}
          </div>
        </div>`;
      }).join('') : window.ui.emptyState('◍', 'Belum ada tabungan', 'Buat target pertamamu — misalnya "Dana Laptop" atau "Dana Darurat".');
      bindCards();
    }

    function bindCards() {
      document.querySelectorAll('[data-goal]').forEach((card) => {
        card.addEventListener('click', (e) => {
          const btn = e.target.closest('button[data-act]');
          if (!btn) return;
          const id = card.dataset.goal;
          const name = card.querySelector('h3').textContent;
          const act = btn.dataset.act;
          if (act === 'deposit' || act === 'withdraw') movementModal(id, name, act);
          if (act === 'history') historyModal(id);
          if (act === 'edit') editModal(id);
          if (act === 'archive') archiveGoal(id, name);
        });
      });
    }

    function movementModal(goalId, goalName, kind) {
      const isDep = kind === 'deposit';
      const modal = window.ui.openModal({
        title: isDep ? `Setor ke "${goalName}"` : `Tarik dari "${goalName}"`,
        subtitle: isDep ? 'Catatan setoran internal — bukan transfer bank.' : 'Penarikan tidak boleh membuat saldo negatif.',
        bodyHtml: `<form id="mv-form">
          <div class="field"><label for="mv-amount">Jumlah (Rp)</label>
            <input class="input" id="mv-amount" type="number" min="1" step="1000" required>
            <div class="field-error" data-error="amount"></div></div>
          <div class="field"><label for="mv-note">Catatan (opsional)</label>
            <input class="input" id="mv-note" maxlength="200" placeholder="Contoh: setor gaji sebagian"></div>
        </form>`,
        actions: [
          { label: 'Batal', className: 'btn-ghost', onClick: () => window.ui.closeModal() },
          { label: isDep ? 'Simpan Setoran' : 'Simpan Penarikan', className: 'btn-primary', onClick: async (m, btn) => {
              const errEl = m.querySelector('[data-error="amount"]');
              const amount = Number(m.querySelector('#mv-amount').value || 0);
              if (!(amount > 0)) { errEl.textContent = 'Jumlah harus lebih dari nol.'; return; }
              await guarded(btn, async () => {
                try {
                  const res = await window.api.post(`/api/savings/${goalId}/${isDep ? 'deposit' : 'withdraw'}`, {
                    amount,
                    note: m.querySelector('#mv-note').value.trim() || undefined,
                    idempotencyKey: window.api.idempotencyKey(),
                  });
                  window.ui.closeModal();
                  window.ui.toast(res.duplicated ? 'Transaksi sudah pernah dicatat (terdeteksi).' : 'Saldo berhasil diperbarui.', 'success');
                  paint();
                } catch (err) { errEl.textContent = err.message; }
              }, 'Menyimpan…');
            } },
        ],
      });
      setTimeout(() => modal.querySelector('#mv-amount')?.focus(), 80);
    }

    async function historyModal(goalId) {
      const d = await window.api.get(`/api/savings/${goalId}`);
      window.ui.openModal({
        title: `Histori — ${d.goal.name}`,
        wide: true,
        bodyHtml: d.history.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Waktu</th><th>Jenis</th><th style="text-align:right">Jumlah</th><th style="text-align:right">Saldo</th><th>Catatan</th></tr></thead>
          <tbody>${d.history.map((h) => `<tr>
            <td class="text-dim">${esc(window.ui.fmtDateTime(h.created_at))}</td>
            <td><span class="badge ${h.type === 'DEPOSIT' ? 'badge-success' : h.type === 'INTEREST' ? 'badge-accent' : 'badge-warning'}">${h.type === 'DEPOSIT' ? 'Setoran' : h.type === 'WITHDRAWAL' ? 'Penarikan' : 'Bunga'}</span></td>
            <td class="mono" style="text-align:right">${esc(window.ui.fmtIDR(h.amount))}</td>
            <td class="mono" style="text-align:right">${esc(window.ui.fmtIDR(h.balance_after))}</td>
            <td class="text-dim">${esc(h.note || '—')}</td></tr>`).join('')}</tbody></table></div>`
          : window.ui.emptyState('▤', 'Belum ada mutasi', 'Setoran atau penarikan pertama belum dicatat.'),
        actions: [{ label: 'Tutup', onClick: () => window.ui.closeModal() }],
      });
    }

    function editModal(goalId) {
      window.api.get(`/api/savings/${goalId}`).then(({ goal }) => {
        const modal = window.ui.openModal({
          title: 'Sunting Target',
          bodyHtml: `<form onsubmit="return false">
            <div class="field"><label>Nama</label><input class="input" data-f="name" value="${esc(goal.name)}" maxlength="80"></div>
            <div class="grid grid-2">
              <div class="field"><label>Target (Rp)</label><input class="input" data-f="targetAmount" type="number" min="1" value="${Number(goal.target_amount)}"></div>
              <div class="field"><label>Tenggat</label><input class="input" data-f="targetDate" type="date" value="${goal.target_date ? String(goal.target_date).slice(0, 10) : ''}"></div>
            </div>
            <div class="grid grid-2">
              <div class="field"><label>Asumsi bunga %/thn (opsional)</label><input class="input" data-f="interestRate" type="number" min="0" max="100" step="0.01" value="${goal.interest_rate ?? ''}"></div>
              <div class="field"><label>Metode</label><select class="input" data-f="interestMethod">
                <option value="">Tanpa estimasi</option>
                <option value="SIMPLE_DAILY" ${goal.interest_method === 'SIMPLE_DAILY' ? 'selected' : ''}>Sederhana harian</option>
                <option value="MONTHLY" ${goal.interest_method === 'MONTHLY' ? 'selected' : ''}>Bulanan</option>
                <option value="COMPOUND" ${goal.interest_method === 'COMPOUND' ? 'selected' : ''}>Majemuk</option>
              </select></div>
            </div>
            <p class="text-dim" style="font-size:12px">Asumsi bunga hanya untuk estimasi perencanaan — bukan bunga bank yang dijamin.</p>
          </form>`,
          actions: [
            { label: 'Batal', className: 'btn-ghost', onClick: () => window.ui.closeModal() },
            { label: 'Simpan', className: 'btn-primary', onClick: async (m, btn) => {
                await guarded(btn, async () => {
                  const body = {
                    name: m.querySelector('[data-f="name"]').value.trim(),
                    targetAmount: Number(m.querySelector('[data-f="targetAmount"]').value),
                    targetDate: m.querySelector('[data-f="targetDate"]').value || null,
                    interestRate: m.querySelector('[data-f="interestRate"]').value === '' ? null : Number(m.querySelector('[data-f="interestRate"]').value),
                    interestMethod: m.querySelector('[data-f="interestMethod"]').value || null,
                  };
                  try {
                    await window.api.put(`/api/savings/${goalId}`, body);
                    window.ui.closeModal(); window.ui.toast('Perubahan tersimpan.', 'success'); paint();
                  } catch (err) { window.ui.toast(err.message, 'error'); }
                }, 'Menyimpan…');
              } },
          ],
        });
      });
    }

    async function archiveGoal(id, name) {
      if (!await window.ui.confirmModal({ title: 'Arsipkan target?', message: `"${name}" akan disembunyikan dari daftar aktif. Histori tetap tersimpan.`, confirmLabel: 'Arsipkan', danger: true })) return;
      await window.api.del(`/api/savings/${id}`);
      window.ui.toast('Target diarsipkan.', 'success');
      paint();
    }

    root.innerHTML = `
      ${pageHead('Tabungan Pribadi', 'Setiap setoran & penarikan tersimpan permanen di database dengan penjurnal saldo yang konsisten.',
        '<button class="btn btn-primary" id="btn-new-goal">+ Target Baru</button>')}
      <div class="grid grid-2" id="savings-grid"></div>`;

    bindNewGoalButton();
    await paint();

    function bindNewGoalButton() {
      const modal = window.ui.openModal({
        title: 'Target Tabungan Baru',
        bodyHtml: `<form onsubmit="return false">
          <div class="field"><label>Nama target</label><input class="input" data-f="name" maxlength="80" placeholder="Dana Laptop"><div class="field-error" data-error="name"></div></div>
          <div class="grid grid-2">
            <div class="field"><label>Target (Rp)</label><input class="input" data-f="targetAmount" type="number" min="1" step="1000" placeholder="12000000"></div>
            <div class="field"><label>Tenggat (opsional)</label><input class="input" data-f="targetDate" type="date"></div>
          </div>
          <div class="grid grid-2">
            <div class="field"><label>Asumsi bunga %/thn</label><input class="input" data-f="interestRate" type="number" min="0" max="100" step="0.01"></div>
            <div class="field"><label>Metode estimasi</label><select class="input" data-f="interestMethod">
              <option value="">Tanpa estimasi</option><option value="SIMPLE_DAILY">Sederhana harian</option>
              <option value="MONTHLY">Bulanan</option><option value="COMPOUND">Majemuk</option></select></div>
          </div>
        </form>`,
        actions: [
          { label: 'Batal', className: 'btn-ghost', onClick: () => window.ui.closeModal() },
          { label: 'Buat Target', className: 'btn-primary', onClick: async (m, btn) => {
              await guarded(btn, async () => {
                const errEl = m.querySelector('[data-error="name"]');
                errEl.textContent = '';
                const body = {
                  name: m.querySelector('[data-f="name"]').value.trim(),
                  targetAmount: Number(m.querySelector('[data-f="targetAmount"]').value || 0),
                  targetDate: m.querySelector('[data-f="targetDate"]').value || undefined,
                  interestRate: m.querySelector('[data-f="interestRate"]').value === '' ? undefined : Number(m.querySelector('[data-f="interestRate"]').value),
                  interestMethod: m.querySelector('[data-f="interestMethod"]').value || undefined,
                };
                if (body.name.length < 2) { errEl.textContent = 'Nama minimal 2 karakter.'; return; }
                if (!(body.targetAmount > 0)) { errEl.textContent = 'Target harus lebih dari nol.'; return; }
                try {
                  await window.api.post('/api/savings', body);
                  window.ui.closeModal(); window.ui.toast('Target tabungan dibuat.', 'success'); paint();
                } catch (err) { errEl.textContent = err.message; }
              }, 'Membuat…');
            } },
        ],
      });
      setTimeout(() => modal.querySelector('[data-f="name"]')?.focus(), 80);
    }
  }

  /* ================= BUNGA ================= */
  pages.interest = async (root) => {
    const [hist, rates, goals] = await Promise.all([
      window.api.get('/api/interest/history'),
      window.api.get('/api/interest/rates').catch(() => ({ rates: [] })),
      window.api.get('/api/savings'),
    ]);
    const configured = goals.goals.filter((g) => g.interest_rate && g.interest_method);

    root.innerHTML = `
      ${pageHead('Bunga & Estimasi', 'Semua perhitungan dijalankan di backend dengan basis ACT/365 dan pembulatan HALF-UP ke rupiah terdekat.')}
      <div class="panel section-block" style="border-color:rgba(251,191,36,0.3)">
        <div style="display:flex;gap:12px"><span style="font-size:20px">⚠</span>
        <div><strong>Penting untuk dipahami</strong>
        <p class="text-dim" style="margin-top:6px">Tabungan internal FINOVA <b>tidak</b> otomatis menghasilkan bunga bank. Nilai di bawah adalah <b>estimasi perencanaan</b> dari asumsi tarif yang kamu tetapkan sendiri. Bunga dari rekening bank hanya ditampilkan bila benar-benar dikirim oleh bank yang terhubung.</p></div></div>
      </div>

      <div class="grid grid-2 section-block">
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:14px">Simulasi Cepat</h3>
          <div class="grid grid-2">
            <div class="field"><label>Saldo (Rp)</label><input class="input" id="in-bal" type="number" min="0" step="1000" value="7500000"></div>
            <div class="field"><label>Tarif %/tahun</label><input class="input" id="in-rate" type="number" min="0" max="100" step="0.01" value="3"></div>
          </div>
          <div class="grid grid-2">
            <div class="field"><label>Periode (hari)</label><input class="input" id="in-days" type="number" min="1" max="3650" value="30"></div>
            <div class="field"><label>Metode</label><select class="input" id="in-method">
              <option value="SIMPLE_DAILY">Sederhana harian</option><option value="MONTHLY">Bulanan</option>
              <option value="COMPOUND">Majemuk harian</option><option value="AVERAGE_BALANCE">Rata-rata saldo</option>
            </select></div>
          </div>
          <div class="progress" style="display:none"></div>
          <div class="panel" style="margin-top:6px;background:var(--panel-2);padding:16px">
            <div class="mini-label">Estimasi bunga</div>
            <div class="mono" id="sim-result" style="font-size:24px;font-weight:800">—</div>
            <div class="text-dim" id="sim-formula" style="font-size:12.5px;margin-top:6px"></div>
          </div>
        </div>
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:14px">Proyeksi dari Target Aktif</h3>
          ${configured.length ? configured.map((g) => `<div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border-soft)">
            <div><div style="font-weight:600">${esc(g.name)}</div>
            <div class="text-dim" style="font-size:12.5px">${esc(String(g.interest_rate))}%/thn · ${esc(methodLabel(g.interest_method))} · saldo ${esc(window.ui.fmtIDR(g.balance))}</div></div>
            <div style="text-align:right"><div class="mono" data-proj="${g.id}">…</div>
            <div class="text-dim" style="font-size:12px">per 30 hari</div></div>
          </div>`).join('') : '<p class="text-dim">Belum ada target dengan asumsi bunga. Tambahkan melalui halaman Tabungan → Sunting.</p>'}
        </div>
      </div>

      <div class="card section-block">
        <h3 style="font-size:15px;margin-bottom:14px">Histori Akrual</h3>
        ${hist.history.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Periode</th><th>Sumber</th><th>Metode</th><th style="text-align:right">Saldo dasar</th><th style="text-align:right">Bunga</th><th>Sifat</th></tr></thead>
          <tbody>${hist.history.map((h) => `<tr>
            <td class="text-dim">${esc(window.ui.fmtDate(h.period_start))} → ${esc(window.ui.fmtDate(h.period_end))}</td>
            <td>${esc(h.goal_name || '—')}</td>
            <td>${esc(methodLabel(h.method))}</td>
            <td class="mono" style="text-align:right">${esc(window.ui.fmtIDR(h.base_amount))}</td>
            <td class="mono" style="text-align:right;color:var(--success)">+${esc(window.ui.fmtIDR(h.interest_amount))}</td>
            <td>${h.is_estimate ? '<span class="badge badge-warning">Estimasi</span>' : '<span class="badge badge-success">Terverifikasi</span>'}</td>
          </tr>`).join('')}</tbody></table></div>`
        : window.ui.emptyState('％', 'Belum ada akrual', 'Akrual tercatat setelah kamu menyetel asumsi bunga pada target tabungan.')}
      </div>

      <div class="card">
        <h3 style="font-size:15px;margin-bottom:14px">Tarif Terkonfigurasi (Admin)</h3>
        ${rates.rates.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>Produk</th><th>Nama</th><th style="text-align:right">Tarif</th><th>Metode</th><th>Berlaku sejak</th></tr></thead>
          <tbody>${rates.rates.map((r) => `<tr>
            <td class="mono">${esc(r.product_code)}</td><td>${esc(r.name)}</td>
            <td class="mono" style="text-align:right">${esc(String(r.rate_annual))}%</td>
            <td>${esc(methodLabel(r.method))}</td><td class="text-dim">${esc(window.ui.fmtDate(r.effective_from))}</td>
          </tr>`).join('')}</tbody></table></div>` : '<p class="text-dim">Belum ada tarif terdaftar. FINOVA tidak mengarang tarif resmi bank manapun.</p>'}
      </div>`;

    function methodLabel(m) {
      return { SIMPLE_DAILY: 'Sederhana harian', MONTHLY: 'Bulanan', COMPOUND: 'Majemuk', AVERAGE_BALANCE: 'Rata-rata saldo' }[m] || m || '—';
    }

    function simulate() {
      const bal = Number($('#in-bal').value || 0);
      const rate = Number($('#in-rate').value || 0);
      const days = Number($('#in-days').value || 0);
      const method = $('#in-method').value;
      const r = rate / 100, d = Math.max(0, days);
      let est = 0, formula = '';
      if (method === 'SIMPLE_DAILY' || method === 'AVERAGE_BALANCE') {
        est = bal * r * d / 365;
        formula = `${window.ui.fmtIDR(bal)} × ${rate}% × ${d}/365`;
      } else if (method === 'MONTHLY') {
        est = bal * r * d / 365;
        formula = `Proporsional ${d} hari terhadap tarif tahunan ${rate}%`;
      } else {
        est = bal * (Math.pow(1 + r / 365, d) - 1);
        formula = `${window.ui.fmtIDR(bal)} × ((1 + ${rate}%/365)^${d} − 1)`;
      }
      $('#sim-result').textContent = window.ui.fmtIDR(Math.round(est));
      $('#sim-formula').textContent = 'Rumus: ' + formula + ' — hasil dibulatkan ke rupiah terdekat (HALF-UP).';
    }
    root.querySelectorAll('#in-bal,#in-rate,#in-days,#in-method').forEach((el) => el.addEventListener('input', simulate));
    simulate();

    for (const g of configured) {
      try {
        const p = await window.api.get(`/api/savings/${g.id}/interest?days=30`);
        const el = document.querySelector(`[data-proj="${g.id}"]`);
        if (el) el.textContent = '+' + window.ui.fmtIDR(p.estimate);
      } catch (_) { /* diamkan */ }
    }
  };

  /* ================= CICILAN ================= */
  pages.installments = async (root) => {
    async function paint() {
      const d = await window.api.get('/api/installments');
      $('#inst-list').innerHTML = d.installments.length ? d.installments.map((i) => `
        <div class="card" data-inst="${i.id}" style="cursor:pointer" tabindex="0" role="button" aria-label="Buka detail ${esc(i.name)}">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
            <h3 style="font-size:16px">${esc(i.name)}</h3>
            <span class="badge ${i.status === 'ACTIVE' ? 'badge-accent' : i.status === 'COMPLETED' ? 'badge-success' : ''}">${i.status === 'ACTIVE' ? 'Berjalan' : i.status === 'COMPLETED' ? 'Lunas' : 'Arsip'}</span>
          </div>
          <div class="mono" style="font-size:21px;font-weight:800;margin-top:12px">${esc(window.ui.fmtIDR(i.first_amount_due || 0))}<span class="text-dim" style="font-size:13px;font-weight:500"> /bulan</span></div>
          <div class="grid grid-2" style="margin-top:10px;gap:8px;font-size:13px">
            <div class="text-dim">Pokok</div><div class="mono" style="text-align:right">${esc(window.ui.fmtIDR(i.principal))}</div>
            <div class="text-dim">Tenor</div><div class="mono" style="text-align:right">${i.tenor_months} bln · ${esc(i.method)}</div>
            <div class="text-dim">Terbayar</div><div class="mono" style="text-align:right">${esc(window.ui.fmtIDR(i.total_paid))}</div>
            <div class="text-dim">Jatuh tempo</div><div class="mono" style="text-align:right">${esc(window.ui.fmtDate(i.next_due_date))}</div>
          </div>
        </div>`).join('') : window.ui.emptyState('▤', 'Belum ada cicilan', 'Tambahkan rencana cicilan untuk memantau angsuran dan jatuh tempo.');
      document.querySelectorAll('[data-inst]').forEach((el) => {
        const open = () => detailModal(el.dataset.inst);
        el.addEventListener('click', open);
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      });
    }

    async function detailModal(id) {
      const d = await window.api.get(`/api/installments/${id}`);
      const i = d.installment;
      const rows = d.schedule.map((s) => `<tr>
        <td class="text-dim">${s.period_no}</td>
        <td class="text-dim">${esc(window.ui.fmtDate(s.due_date))}</td>
        <td class="mono" style="text-align:right">${esc(window.ui.fmtIDR(s.amount_due))}</td>
        <td class="mono" style="text-align:right;color:var(--text-2)">${esc(window.ui.fmtIDR(s.principal_part))}</td>
        <td class="mono" style="text-align:right;color:var(--text-2)">${esc(window.ui.fmtIDR(s.interest_part))}</td>
        <td>${s.status === 'PAID'
          ? `<span class="badge badge-success">Lunas</span> <span class="text-dim" style="font-size:11.5px">${s.recorded_via === 'BANK_CONFIRMED' ? 'terkonfirmasi bank' : 'catatan manual'}</span>`
          : `<button class="btn btn-sm" data-pay="${s.period_no}">Bayar</button>`}</td>
      </tr>`).join('');

      const modal = window.ui.openModal({
        title: i.name, wide: true,
        subtitle: `Metode ${esc(i.method)} · ${i.tenor_months} bulan · bunga ${esc(String(i.interest_rate))}%/tahun`,
        bodyHtml: `
          <div class="grid grid-3" style="margin-bottom:18px">
            <div class="card" style="padding:14px"><div class="mini-label">Terbayar</div><div class="mono" style="font-size:16px;margin-top:4px">${esc(window.ui.fmtIDR(d.totalPaid))}</div></div>
            <div class="card" style="padding:14px"><div class="mini-label">Sisa pokok</div><div class="mono" style="font-size:16px;margin-top:4px">${esc(window.ui.fmtIDR(d.remainingPrincipal))}</div></div>
            <div class="card" style="padding:14px"><div class="mini-label">Sisa bunga</div><div class="mono" style="font-size:16px;margin-top:4px">${esc(window.ui.fmtIDR(d.remainingInterest))}</div></div>
          </div>
          <div class="progress" style="margin-bottom:6px"><span style="width:${d.progress}%"></span></div>
          <div class="text-dim" style="font-size:12.5px;margin-bottom:16px">${String(d.progress).replace('.', ',')}% lunas · jatuh tempo berikutnya ${esc(window.ui.fmtDate(d.nextDueDate))}</div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>#</th><th>Tanggal</th><th style="text-align:right">Angsuran</th><th style="text-align:right">Pokok</th><th style="text-align:right">Bunga</th><th>Status</th></tr></thead>
            <tbody>${rows}</tbody></table></div>
          <p class="text-dim" style="font-size:12px;margin-top:12px">Pembayaran yang kamu catat di FINOVA adalah <b>catatan manual</b>, bukan konfirmasi bank.</p>`,
        actions: [
          { label: 'Arsipkan', className: 'btn-ghost', onClick: async (m, btn) => {
              if (!await window.ui.confirmModal({ title: 'Arsipkan cicilan?', message: 'Cicilan akan disembunyikan dari daftar aktif.', confirmLabel: 'Arsipkan', danger: true })) return;
              await window.api.del(`/api/installments/${id}`);
              window.ui.closeModal(); window.ui.toast('Cicilan diarsipkan.', 'success'); paint();
            } },
          { label: 'Tutup', onClick: () => window.ui.closeModal() },
        ],
      });
      modal.addEventListener('click', async (e) => {
        const btn = e.target.closest('button[data-pay]');
        if (!btn) return;
        const periodNo = Number(btn.dataset.pay);
        await guarded(btn, async () => {
          try {
            const res = await window.api.post(`/api/installments/${id}/pay`, { periodNo, idempotencyKey: window.api.idempotencyKey() });
            window.ui.closeModal();
            window.ui.toast(res.alreadyPaid ? 'Periode ini sudah lunas.' : 'Pembayaran dicatat.', 'success');
            paint();
          } catch (err) { window.ui.toast(err.message, 'error'); }
        }, 'Mencatat…');
      });
    }

    root.innerHTML = `
      ${pageHead('Cicilan', 'Jadwal angsuran dihitung otomatis — kamu cukup mencatat pembayarannya.',
        '<button class="btn btn-primary" id="btn-new-inst">+ Tambah Cicilan</button>')}
      <div class="grid grid-2" id="inst-list"></div>`;
    $('#btn-new-inst').addEventListener('click', () => {
      const today = new Date().toISOString().slice(0, 10);
      const modal = window.ui.openModal({
        title: 'Tambah Cicilan',
        bodyHtml: `<form onsubmit="return false">
          <div class="field"><label>Nama</label><input class="input" data-f="name" maxlength="80" placeholder="Cicilan Laptop"></div>
          <div class="grid grid-2">
            <div class="field"><label>Pokok (Rp)</label><input class="input" data-f="principal" type="number" min="1" step="1000"></div>
            <div class="field"><label>Uang muka (Rp)</label><input class="input" data-f="downPayment" type="number" min="0" step="1000" value="0"></div>
          </div>
          <div class="grid grid-2">
            <div class="field"><label>Bunga %/tahun</label><input class="input" data-f="interestRate" type="number" min="0" max="100" step="0.01" value="0"></div>
            <div class="field"><label>Tenor (bulan)</label><input class="input" data-f="tenorMonths" type="number" min="1" max="360" value="12"></div>
          </div>
          <div class="grid grid-2">
            <div class="field"><label>Mulai</label><input class="input" data-f="startDate" type="date" value="${today}"></div>
            <div class="field"><label>Tanggal jatuh tempo</label><select class="input" data-f="dueDay">${Array.from({ length: 28 }, (_, k) => `<option value="${k + 1}">${k + 1}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label>Metode perhitungan</label><select class="input" data-f="method">
            <option value="FLAT">Flat — bunga dari pokok awal</option>
            <option value="ANNUITY">Anuitas — angsuran tetap</option>
            <option value="EFFECTIVE">Efektif — bunga dari sisa pokok</option>
          </select>
          <div class="field-error" data-error="form"></div></div>
          <div id="preview-box" class="panel" style="background:var(--panel-2);padding:14px;font-size:13px;display:none"></div>
        </form>`,
        actions: [
          { label: 'Batal', className: 'btn-ghost', onClick: () => window.ui.closeModal() },
          { label: 'Pratinjau Jadwal', onClick: () => preview(false) },
          { label: 'Simpan Cicilan', className: 'btn-primary', onClick: async (m, btn) => {
              await guarded(btn, async () => {
                const body = readForm(m);
                const errEl = m.querySelector('[data-error="form"]');
                if (body.name.length < 2) { errEl.textContent = 'Nama minimal 2 karakter.'; return; }
                try {
                  await window.api.post('/api/installments', body);
                  window.ui.closeModal(); window.ui.toast('Cicilan dibuat beserta jadwalnya.', 'success'); paint();
                } catch (err) { errEl.textContent = err.message; }
              }, 'Menyimpan…');
            } },
        ],
      });

      function readForm(m) {
        const get = (f) => m.querySelector(`[data-f="${f}"]`);
        return {
          name: get('name').value.trim(),
          principal: Number(get('principal').value || 0),
          downPayment: Number(get('downPayment').value || 0),
          interestRate: Number(get('interestRate').value || 0),
          tenorMonths: Number(get('tenorMonths').value || 0),
          startDate: get('startDate').value,
          dueDay: Number(get('dueDay').value),
          method: get('method').value,
        };
      }
      function preview() {
        const b = readForm(modal);
        const box = modal.querySelector('#preview-box');
        const loan = b.principal - b.downPayment;
        if (!(loan > 0) || !(b.tenorMonths > 0) || !b.startDate) {
          box.style.display = 'block';
          box.innerHTML = '<span class="text-dim">Isi pokok, uang muka, tenor, dan tanggal mulai untuk melihat pratinjau.</span>';
          return;
        }
        const monthlyRate = b.interestRate / 100 / 12;
        let first, total;
        if (b.method === 'ANNUITY' && monthlyRate > 0) {
          first = loan * monthlyRate / (1 - Math.pow(1 + monthlyRate, -b.tenorMonths));
          total = first * b.tenorMonths;
        } else if (b.method === 'FLAT') {
          first = loan / b.tenorMonths + loan * monthlyRate;
          total = first * b.tenorMonths;
        } else {
          first = loan / b.tenorMonths + loan * monthlyRate;
          total = loan + (loan * (b.tenorMonths + 1) / b.tenorMonths * monthlyRate * b.tenorMonths / 2);
        }
        box.style.display = 'block';
        box.innerHTML = `<div class="mini-label">Pratinjau</div>
          <div style="margin-top:8px">Angsuran pertama ± <b class="mono">${esc(window.ui.fmtIDR(Math.round(first)))}</b></div>
          <div>Total dibayar ± <b class="mono">${esc(window.ui.fmtIDR(Math.round(total)))}</b> · total bunga ± <b class="mono">${esc(window.ui.fmtIDR(Math.round(total - loan)))}</b></div>
          <div class="text-dim" style="margin-top:6px;font-size:12px">Perhitungan final dilakukan server dan dapat berbeda ±Rp1 karena pembulatan per periode.</div>`;
      }
      modal.querySelectorAll('input,select').forEach((el) => el.addEventListener('change', () => preview()));
    });

    await paint();
  };

  /** Tulis innerHTML hanya bila elemen masih berada di DOM (aman terhadap balapan rute). */
  function setHtml(idOrEl, html) {
    const el = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
    if (!el || !el.isConnected) return false;
    el.innerHTML = html;
    return true;
  }

  window.finovaApp = { state, pages, render, navigate, refreshNotifBadge, pageHead, guarded, esc, showGreeting, setHtml, currentRoute: () => state.route };
  document.addEventListener('DOMContentLoaded', bootstrap);
})();
