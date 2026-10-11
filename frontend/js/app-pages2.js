/* ============================================================
   FINOVA — modul halaman lanjutan (rekening, transaksi, analitik,
   pasar, watchlist, alert, notifikasi, profil, keamanan, admin)
   ============================================================ */
(function () {
  'use strict';

  const app = window.finovaApp;
  const { pages, state, pageHead, guarded, esc } = app;
  const fmtIDR = window.ui.fmtIDR;

  /* ================= REKENING (BANKING) ================= */
  const CAP_LABEL = {
    ACCOUNTS: 'Informasi rekening', BALANCES: 'Saldo', TRANSACTIONS: 'Mutasi',
    TRANSFER: 'Transfer', BILL_PAYMENT: 'Pembayaran tagihan', TOPUP: 'Isi ulang',
  };
  const capLabel = (cap) => CAP_LABEL[cap] || cap;

  function maskAcct(n) {
    const s = String(n || '');
    return s.length <= 4 ? s : '•'.repeat(Math.max(0, s.length - 4)) + s.slice(-4);
  }

  /* ================= REKENING (BANKING) ================= */
  pages.banking = async (root) => {
    async function paint() {
      const conn = await window.api.get('/api/banks/connections');
      const c = conn.connection;
      const stateBadge = {
        NOT_CONNECTED: '<span class="badge">Belum terhubung</span>',
        IN_PROGRESS: '<span class="badge badge-warning">Menunggu persetujuan</span>',
        CONNECTED: '<span class="badge badge-success">Terhubung</span>',
        EXPIRED: '<span class="badge badge-warning">Perlu sambung ulang</span>',
        UNAVAILABLE: '<span class="badge badge-danger">Sementara tidak tersedia</span>',
        ERROR: '<span class="badge badge-danger">Gangguan koneksi</span>',
      }[c.state] || `<span class="badge">${esc(c.state)}</span>`;

      const isLive = conn.providerMode === 'LIVE';
      const canConnect = c.state === 'NOT_CONNECTED' || c.state === 'EXPIRED' || c.state === 'ERROR';

      root.innerHTML = `
        ${pageHead('Rekening', 'FINOVA adalah aplikasi independen — bukan aplikasi resmi Bank Mandiri. Koneksi memakai alur otorisasi resmi yang didukung.')}
        <div class="card section-block" id="conn-card">
          <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start">
            <div style="display:flex;gap:14px;align-items:center">
              <div class="bank-chip" style="width:52px;height:52px;font-size:13px">MDR</div>
              <div>
                <h3 style="font-size:17px">Bank Mandiri</h3>
                <div class="text-dim" style="font-size:13.5px;margin-top:3px">${esc(c.stateMessage)}</div>
                ${c.lastSyncAt ? `<div class="text-dim" style="font-size:12px;margin-top:3px">Sinkron terakhir ${esc(window.ui.fmtDateTime(c.lastSyncAt))}</div>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              ${stateBadge}
              ${c.state === 'CONNECTED' ? `
                <button class="btn btn-sm" id="btn-sync">↻ Sinkronkan</button>
                <button class="btn btn-sm btn-ghost" id="btn-disconnect">Putuskan</button>` : ''}
              ${canConnect ? `<button class="btn btn-sm btn-primary" id="btn-connect">Hubungkan Rekening</button>` : ''}
            </div>
          </div>
          <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
            ${(c.capabilities || []).map((cap) => `<span class="badge ${cap === 'TRANSFER' ? '' : 'badge-accent'}">${esc(capLabel(cap))}</span>`).join('')}
            ${isLive ? '' : '<span class="badge badge-warning">Mode contoh (demo)</span>'}
          </div>
        </div>

        <div class="card section-block" id="accounts-block"></div>
        <div class="grid grid-2">
          <div class="card" id="benef-block"></div>
          <div class="card" id="transfer-block"></div>
        </div>`;

      const btnConnect = document.getElementById('btn-connect');
      if (btnConnect) btnConnect.addEventListener('click', async (e) => {
        await guarded(e.currentTarget, async () => {
          const r = await window.api.post('/api/banks/connect');
          if (r.kind === 'REDIRECT') {
            window.location.href = r.url;
            return;
          }
          consentModal(r);
        }, 'Menyiapkan…');
      });

      function consentModal(r) {
        const modal = window.ui.openModal({
          title: 'Persetujuan Penghubungan Rekening',
          bodyHtml: `<p class="text-dim" style="margin-bottom:16px">${esc(r.message)}</p>
            ${(r.accountsPreview || []).map((a) => `<div class="bank-line"><span class="bank-chip">MDR</span>
              <div><div style="font-weight:600">${esc(a.accountType)}</div>
              <div class="text-dim mono" style="font-size:12.5px">${esc(a.maskedNumber)}</div></div></div>`).join('')}
            <p class="text-dim" style="font-size:12.5px;margin-top:14px">FINOVA tidak pernah meminta password internet banking, PIN ATM, atau OTP kamu.</p>`,
          actions: [
            { label: 'Batal', className: 'btn-ghost', onClick: () => window.ui.closeModal() },
            { label: 'Setuju & Hubungkan', className: 'btn-primary', onClick: async (m, btn) => {
                await guarded(btn, async () => {
                  try {
                    await window.api.post('/api/banks/connect/confirm');
                    window.ui.closeModal();
                    window.ui.toast('Rekening demo berhasil ditautkan. Ini bukan rekening asli.', 'success', 5200);
                    paint();
                  } catch (err) { window.ui.toast(err.message, 'error'); }
                }, 'Menghubungkan…');
              } },
          ],
        });
      }

      const btnSync = document.getElementById('btn-sync');
      if (btnSync) btnSync.addEventListener('click', async (e) => {
        await guarded(e.currentTarget, async () => {
          try {
            const r = await window.api.post('/api/banks/sync');
            window.ui.toast(r.imported > 0 ? `${r.imported} transaksi baru disinkronkan.` : 'Tidak ada transaksi baru.', 'success');
            paint();
          } catch (err) { window.ui.toast(err.message, 'error'); }
        }, 'Sinkron…');
      });

      const btnDisc = document.getElementById('btn-disconnect');
      if (btnDisc) btnDisc.addEventListener('click', async () => {
        if (!await window.ui.confirmModal({ title: 'Putuskan koneksi?', message: 'Kamu perlu menautkan ulang untuk melihat saldo dan mutasi.', confirmLabel: 'Putuskan', danger: true })) return;
        try {
          const conns = await window.api.get('/api/banks/connections');
          const id = conns.connection.id;
          await window.api.del(`/api/banks/connections/${id}`);
          window.ui.toast('Koneksi diputuskan.', 'success');
          paint();
        } catch (err) { window.ui.toast(err.message, 'error'); }
      });

      // ---- Rekening & saldo ----
      const accBlock = document.getElementById('accounts-block');
      try {
        const a = await window.api.get('/api/banks/accounts');
        accBlock.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="font-size:15px">Rekening & Saldo</h3>
            <a href="/transactions" data-link class="btn btn-sm btn-ghost">Mutasi lengkap →</a>
          </div>
          ${a.accounts.length ? `<div class="grid grid-2">${a.accounts.map((acc) => `
            <div class="card" style="background:var(--panel-2);cursor:pointer" tabindex="0" role="button" data-acc="${acc.id}">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div class="text-dim" style="font-size:12.5px">${esc(acc.accountType || 'Rekening')} ${acc.isDemo ? '<span class="badge badge-warning" style="font-size:10px">Demo</span>' : ''}</div>
                <span class="badge badge-success">Tersinkron</span>
              </div>
              <div class="mono" style="margin:8px 0;color:var(--text-2);font-size:13.5px">${esc(acc.maskedNumber)}</div>
              <div class="mono" style="font-size:22px;font-weight:800">${acc.balance === null ? '—' : esc(fmtIDR(acc.balance))}</div>
              ${acc.availableBalance !== null ? `<div class="text-dim" style="font-size:12.5px;margin-top:4px">Tersedia ${esc(fmtIDR(acc.availableBalance))}</div>` : ''}
              ${acc.holderName ? `<div class="text-dim" style="font-size:12.5px;margin-top:8px">Atas nama ${esc(acc.holderName)}</div>` : ''}
              <div class="text-dim" style="font-size:11.5px;margin-top:10px">Saldo per ${esc(window.ui.fmtDateTime(acc.balanceUpdatedAt))}</div>
            </div>`).join('')}</div>`
          : `<div class="empty-state"><div class="empty-icon">▣</div><h4>Belum ada rekening</h4><p>Hubungkan rekening di panel atas untuk melihat saldo dan mutasi.</p></div>`}`;
        accBlock.querySelectorAll('[data-acc]').forEach((el) => {
          const open = () => accountDetailModal(el.dataset.acc);
          el.addEventListener('click', open);
          el.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
        });
      } catch (err) {
        accBlock.innerHTML = `<p class="text-dim">Informasi rekening tidak dapat dimuat saat ini.</p>`;
      }

      async function accountDetailModal(id) {
        const [d, t] = await Promise.all([
          window.api.get(`/api/banks/accounts/${id}`),
          window.api.get(`/api/banks/accounts/${id}/transactions?limit=15`).catch(() => ({ transactions: [] })),
        ]);
        window.ui.openModal({
          title: d.account.accountType || 'Rekening',
          wide: true,
          subtitle: `${d.account.maskedNumber} · ${esc(d.account.holderName || '')}`,
          bodyHtml: `
            <div class="grid grid-2" style="margin-bottom:16px">
              <div class="card" style="padding:14px"><div class="mini-label">Saldo</div><div class="mono" style="font-size:18px;margin-top:4px">${esc(fmtIDR(d.account.balance))}</div></div>
              <div class="card" style="padding:14px"><div class="mini-label">Tersedia</div><div class="mono" style="font-size:18px;margin-top:4px">${esc(fmtIDR(d.account.availableBalance))}</div></div>
            </div>
            ${t.transactions.length ? `<div class="table-wrap"><table class="table">
              <thead><tr><th>Tanggal</th><th>Keterangan</th><th style="text-align:right">Jumlah</th></tr></thead>
              <tbody>${t.transactions.map((x) => `<tr>
                <td class="text-dim">${esc(window.ui.fmtDate(x.occurred_at))}</td><td>${esc(x.description || '—')}</td>
                <td class="mono" style="text-align:right;color:${x.type === 'INCOME' ? 'var(--success)' : 'var(--text)'}">${x.type === 'INCOME' ? '+' : '−'} ${esc(fmtIDR(x.amount))}</td></tr>`).join('')}</tbody>
            </table></div>` : '<p class="text-dim">Belum ada mutasi tersinkron untuk rekening ini.</p>'}`,
          actions: [{ label: 'Tutup', onClick: () => window.ui.closeModal() }],
        });
      }

      // ---- Penerima transfer ----
      const benBlock = document.getElementById('benef-block');
      async function paintBenef() {
        let list = [];
        try { list = (await window.api.get('/api/banks/beneficiaries')).beneficiaries; } catch (_) { /* diamkan */ }
        benBlock.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 style="font-size:15px">Penerima Transfer</h3>
            <button class="btn btn-sm" id="btn-add-benef">+ Tambah</button>
          </div>
          ${list.length ? list.map((b) => `<div class="bank-line">
            <span class="bank-chip" style="width:38px;height:38px;font-size:10px">${esc(b.bank_code.slice(0, 5))}</span>
            <div><div style="font-weight:600">${esc(b.alias || b.account_name)}</div>
            <div class="text-dim mono" style="font-size:12px">${esc(maskAcct(b.account_number))} · ${esc(b.account_name)}</div></div>
            <button class="btn btn-sm btn-ghost" data-del-benef="${b.id}" title="Hapus">✕</button></div>`).join('')
          : '<p class="text-dim" style="font-size:13.5px">Belum ada penerima tersimpan. Tambahkan untuk transfer lebih cepat.</p>'}`;
        benBlock.querySelector('#btn-add-benef').addEventListener('click', () => {
          const modal = window.ui.openModal({
            title: 'Tambah Penerima',
            bodyHtml: `<form onsubmit="return false">
              <div class="grid grid-2">
                <div class="field"><label>Kode bank</label><input class="input" data-f="bankCode" value="008" maxlength="20" placeholder="008 = Mandiri"></div>
                <div class="field"><label>Alias</label><input class="input" data-f="alias" maxlength="60" placeholder="Ibu"></div>
              </div>
              <div class="field"><label>Nomor rekening</label><input class="input" data-f="accountNumber" inputmode="numeric" maxlength="40" placeholder="142000000000"></div>
              <div class="field"><label>Atas nama</label><input class="input" data-f="accountName" maxlength="120"><div class="field-error" data-error="form"></div></div>
            </form>`,
            actions: [
              { label: 'Batal', className: 'btn-ghost', onClick: () => window.ui.closeModal() },
              { label: 'Simpan', className: 'btn-primary', onClick: async (m, btn) => {
                  await guarded(btn, async () => {
                    const g = (f) => m.querySelector(`[data-f="${f}"]`).value.trim();
                    const errEl = m.querySelector('[data-error="form"]');
                    errEl.textContent = '';
                    if (!/^[0-9]{4,40}$/.test(g('accountNumber')) || !g('accountName')) {
                      errEl.textContent = 'Nomor rekening (minimal 4 digit) dan nama wajib diisi dengan benar.'; return;
                    }
                    try {
                      await window.api.post('/api/banks/beneficiaries', {
                        bankCode: g('bankCode') || '008', accountNumber: g('accountNumber'),
                        accountName: g('accountName'), alias: g('alias') || undefined,
                      });
                      window.ui.closeModal(); window.ui.toast('Penerima ditambahkan.', 'success'); paintBenef();
                    } catch (err) { errEl.textContent = err.message; }
                  }, 'Menyimpan…');
                } },
            ],
          });
        });
        benBlock.querySelectorAll('[data-del-benef]').forEach((el) => el.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!await window.ui.confirmModal({ title: 'Hapus penerima?', message: 'Penerima ini akan dihapus dari daftar.', confirmLabel: 'Hapus', danger: true })) return;
          try { await window.api.del(`/api/banks/beneficiaries/${el.dataset.delBenef}`); window.ui.toast('Penerima dihapus.', 'success'); paintBenef(); }
          catch (err) { window.ui.toast(err.message, 'error'); }
        }));
      }
      await paintBenef();

      // ---- Antarmuka transfer ----
      const trBlock = document.getElementById('transfer-block');
      function paintTransfer(available) {
        const transferEnabled = (c.capabilities || []).includes('TRANSFER') && c.state === 'CONNECTED' && isLive;
        trBlock.innerHTML = `
          <h3 style="font-size:15px;margin-bottom:12px">Transfer</h3>
          ${c.state !== 'CONNECTED'
            ? `<p class="text-dim" style="font-size:13.5px">Hubungkan rekening untuk membuka fitur transfer.</p>`
            : `<div class="field"><label>Dari rekening</label><select class="input" id="tr-from">${(available || []).map((a) => `<option value="${a.id}">${esc(a.accountType || 'Rekening')} ${esc(a.maskedNumber)}</option>`).join('')}</select></div>
               <div class="field"><label>Ke penerima</label><select class="input" id="tr-to"><option value="">— pilih penerima —</option></select></div>
               <div class="field"><label>Jumlah (Rp)</label><input class="input" id="tr-amount" type="number" min="1" step="1000"></div>
               <div class="field"><label>Catatan (opsional)</label><input class="input" id="tr-note" maxlength="140"></div>
               <div class="field-error" id="tr-error" style="min-height:1.2em"></div>
               ${transferEnabled
                 ? '<button class="btn btn-primary btn-block" id="tr-send">Kirim Transfer</button>'
                 : `<div class="panel" style="background:var(--panel-2);padding:14px">
                      <strong style="font-size:13.5px">Transfer belum dapat dilakukan</strong>
                      <p class="text-dim" style="font-size:12.5px;margin-top:6px">${esc(c.mode === 'LIVE' ? 'Izin transfer belum diberikan oleh bank untuk koneksi ini.' : 'Koneksi saat ini adalah koneksi contoh. FINOVA tidak mensimulasikan perpindahan dana sungguhan.')}</p>
                      <p class="text-dim" style="font-size:12.5px;margin-top:6px">Fitur aktif otomatis begitu penyedia mengizinkan operasi transfer.</p>
                    </div>`}`}
          ${transferEnabled ? '' : `<div class="filter-bar" style="margin-top:14px"></div>`}
          <div style="margin-top:14px"><a href="javascript:void(0)" id="tr-history">Riwayat transfer →</a></div>`;

        const histLink = document.getElementById('tr-history');
        if (histLink) histLink.addEventListener('click', async () => {
          try {
            const r = await window.api.get('/api/banks/transfers');
            window.ui.openModal({
              title: 'Riwayat Transfer', wide: true,
              bodyHtml: r.transfers.length ? `<div class="table-wrap"><table class="table">
                <thead><tr><th>Waktu</th><th>Penerima</th><th style="text-align:right">Jumlah</th><th>Status</th></tr></thead>
                <tbody>${r.transfers.map((t) => `<tr><td class="text-dim">${esc(window.ui.fmtDateTime(t.created_at))}</td>
                  <td>${esc(t.beneficiary_name || '—')}</td><td class="mono" style="text-align:right">${esc(fmtIDR(t.amount))}</td>
                  <td><span class="badge ${t.status === 'CONFIRMED' ? 'badge-success' : 'badge-warning'}">${esc(t.status)}</span></td></tr>`).join('')}</tbody></table></div>`
                : '<p class="text-dim">Belum ada permintaan transfer tercatat.</p>',
              actions: [{ label: 'Tutup', onClick: () => window.ui.closeModal() }],
            });
          } catch (err) { window.ui.toast(err.message, 'error'); }
        });

        const sendBtn = document.getElementById('tr-send');
        if (sendBtn) sendBtn.addEventListener('click', async (e) => {
          const errEl = document.getElementById('tr-error');
          const beneficiaryId = document.getElementById('tr-to').value;
          const amount = Number(document.getElementById('tr-amount').value || 0);
          if (!beneficiaryId) { errEl.textContent = 'Pilih penerima lebih dulu.'; return; }
          if (!(amount > 0)) { errEl.textContent = 'Jumlah harus lebih dari nol.'; return; }
          errEl.textContent = '';
          await guarded(e.currentTarget, async () => {
            try {
              await window.api.post('/api/banks/transfer', {
                sourceAccountId: document.getElementById('tr-from').value,
                beneficiaryId, amount,
                note: document.getElementById('tr-note').value.trim() || undefined,
                idempotencyKey: window.api.idempotencyKey(),
              });
              window.ui.toast('Transfer dikirim ke bank.', 'success');
            } catch (err) { errEl.textContent = err.message; }
          }, 'Mengirim…');
        });

        window.api.get('/api/banks/beneficiaries').then((b) => {
          const sel = document.getElementById('tr-to');
          if (!sel) return;
          sel.innerHTML = '<option value="">— pilih penerima —</option>' + b.beneficiaries.map((x) =>
            `<option value="${x.id}">${esc(x.alias || x.account_name)} · ${esc(maskAcct(x.account_number))}</option>`).join('');
        }).catch(() => {});
      }
      let accounts = [];
      try { accounts = (await window.api.get('/api/banks/accounts')).accounts; } catch (_) { /* diamkan */ }
      paintTransfer(accounts);
    }

    await paint();
  };

  /* ================= TRANSAKSI ================= */
  pages.transactions = async (root) => {
    const filters = { q: '', from: '', to: '', category: '', type: '', page: 1 };

    root.innerHTML = `
      ${pageHead('Transaksi', 'Pencatatan manual & mutasi tersinkron — keduanya selalu diberi penanda sumber.',
        `<button class="btn" id="btn-export">Ekspor CSV</button><button class="btn btn-primary" id="btn-new-tx">+ Catat Transaksi</button>`)}
      <div class="card">
        <div class="filter-bar">
          <input class="input" type="search" id="f-q" placeholder="Cari keterangan…" value="${esc(filters.q)}">
          <select class="input" id="f-type"><option value="">Semua jenis</option><option value="INCOME">Pemasukan</option><option value="EXPENSE">Pengeluaran</option></select>
          <select class="input" id="f-cat"><option value="">Semua kategori</option>
            ${Object.entries(window.ui.CATEGORY_LABELS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select>
          <input class="input" type="date" id="f-from" title="Dari tanggal">
          <input class="input" type="date" id="f-to" title="Sampai tanggal">
          <button class="btn" id="f-apply">Terapkan</button>
        </div>
        <div id="tx-list"></div>
      </div>`;

    async function paint() {
      const qs = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k === 'page' ? 'page' : k, v); });
      const d = await window.api.get('/api/transactions?' + qs.toString());
      const list = document.getElementById('tx-list');
      if (!d.transactions.length) {
        list.innerHTML = window.ui.emptyState('⇄', 'Tidak ada transaksi', filters.q || filters.category ? 'Coba ubah filtermu.' : 'Catat transaksi pertamamu dengan tombol di kanan atas.');
        return;
      }
      list.innerHTML = `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Tanggal</th><th>Deskripsi</th><th>Kategori</th><th>Sumber</th><th style="text-align:right">Jumlah</th></tr></thead>
          <tbody>${d.transactions.map((t) => `<tr data-tx="${t.id}" style="cursor:pointer">
            <td class="text-dim" style="white-space:nowrap">${esc(window.ui.fmtDate(t.occurred_at))}</td>
            <td>${esc(t.description || '—')}</td>
            <td><span class="badge">${esc(window.ui.CATEGORY_LABELS[t.category] || t.category)}</span></td>
            <td>${t.source === 'BANK_SYNC' ? '<span class="badge badge-accent">Bank</span>' : '<span class="badge">Manual</span>'}</td>
            <td class="mono" style="text-align:right;white-space:nowrap;color:${t.type === 'INCOME' ? 'var(--success)' : 'var(--text)'}">${t.type === 'INCOME' ? '+' : '−'} ${esc(fmtIDR(t.amount))}</td>
          </tr>`).join('')}</tbody>
        </table></div>
        <div class="pager">
          <span>Halaman ${d.pagination.page} dari ${Math.max(1, d.pagination.pages)} · ${d.pagination.total} transaksi</span>
          <button class="btn btn-sm" id="pg-prev" ${d.pagination.page <= 1 ? 'disabled' : ''}>← Sebelumnya</button>
          <button class="btn btn-sm" id="pg-next" ${d.pagination.page >= d.pagination.pages ? 'disabled' : ''}>Berikutnya →</button>
        </div>`;

      document.getElementById('pg-prev').addEventListener('click', () => { filters.page--; paint(); });
      document.getElementById('pg-next').addEventListener('click', () => { filters.page++; paint(); });
      list.querySelectorAll('[data-tx]').forEach((tr) => tr.addEventListener('click', () => detailTr(tr.dataset.tx)));
    }

    async function detailTr(id) {
      try {
        const { transaction: t } = await window.api.get(`/api/transactions/${id}`);
        window.ui.openModal({
          title: t.description || 'Detail transaksi',
          subtitle: `${t.type === 'INCOME' ? 'Pemasukan' : t.type === 'EXPENSE' ? 'Pengeluaran' : 'Transfer'} · ${esc(window.ui.CATEGORY_LABELS[t.category] || t.category)}`,
          bodyHtml: `<dl class="detail-list">
            <dt>Jumlah</dt><dd class="mono">${esc(fmtIDR(t.amount))} ${esc(t.currency)}</dd>
            <dt>Terjadi pada</dt><dd>${esc(window.ui.fmtDateTime(t.occurred_at))}</dd>
            <dt>Sumber</dt><dd>${t.source === 'BANK_SYNC' ? 'Mutasi bank tersinkron (terverifikasi)' : 'Catatan manual kamu'}</dd>
            <dt>Dicatat</dt><dd class="text-dim">${esc(window.ui.fmtDateTime(t.created_at))}</dd>
            ${t.external_ref ? `<dt>Referensi</dt><dd class="mono">${esc(t.external_ref)}</dd>` : ''}
          </dl>`,
          actions: [{ label: 'Tutup', onClick: () => window.ui.closeModal() }],
        });
      } catch (err) { window.ui.toast(err.message, 'error'); }
    }

    document.getElementById('f-apply').addEventListener('click', () => {
      filters.q = document.getElementById('f-q').value.trim();
      filters.type = document.getElementById('f-type').value;
      filters.category = document.getElementById('f-cat').value;
      filters.from = document.getElementById('f-from').value || '';
      filters.to = document.getElementById('f-to').value || '';
      filters.page = 1;
      paint();
    });
    ['f-q', 'f-type', 'f-cat', 'f-from', 'f-to'].forEach((idv) => {
      const el = document.getElementById(idv);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('f-apply').click(); } });
      if (el.tagName === 'SELECT') el.addEventListener('change', () => document.getElementById('f-apply').click());
    });

    document.getElementById('btn-export').addEventListener('click', () => {
      window.location.href = '/api/transactions/export/csv';
    });

    document.getElementById('btn-new-tx').addEventListener('click', () => {
      const modal = window.ui.openModal({
        title: 'Catat Transaksi',
        bodyHtml: `<form onsubmit="return false">
          <div class="grid grid-2">
            <div class="field"><label>Jenis</label><select class="input" data-f="type">
              <option value="EXPENSE">Pengeluaran</option><option value="INCOME">Pemasukan</option></select></div>
            <div class="field"><label>Kategori</label><select class="input" data-f="category">
              ${Object.entries(window.ui.CATEGORY_LABELS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
          </div>
          <div class="grid grid-2">
            <div class="field"><label>Jumlah (Rp)</label><input class="input" data-f="amount" type="number" min="1" step="100"></div>
            <div class="field"><label>Tanggal</label><input class="input" data-f="occurredAt" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
          </div>
          <div class="field"><label>Deskripsi</label><input class="input" data-f="description" maxlength="200" placeholder="Mis. makan siang"></div>
          <div class="field-error" data-error="form"></div>
        </form>`,
        actions: [
          { label: 'Batal', className: 'btn-ghost', onClick: () => window.ui.closeModal() },
          { label: 'Simpan', className: 'btn-primary', onClick: async (m, btn) => {
              await guarded(btn, async () => {
                const g = (f) => m.querySelector(`[data-f="${f}"]`);
                const errEl = m.querySelector('[data-error="form"]');
                errEl.textContent = '';
                const amount = Number(g('amount').value || 0);
                if (!(amount > 0)) { errEl.textContent = 'Jumlah harus lebih dari nol.'; return; }
                try {
                  await window.api.post('/api/transactions', {
                    type: g('type').value,
                    category: g('category').value,
                    amount,
                    occurredAt: g('occurredAt').value ? new Date(g('occurredAt').value + 'T12:00:00').toISOString() : undefined,
                    description: g('description').value.trim() || undefined,
                    idempotencyKey: window.api.idempotencyKey(),
                  });
                  window.ui.closeModal(); window.ui.toast('Transaksi tersimpan.', 'success'); paint();
                } catch (err) { errEl.textContent = err.message; }
              }, 'Menyimpan…');
            } },
        ],
      });
      setTimeout(() => modal.querySelector('[data-f="amount"]')?.focus(), 80);
    });

    await paint();
  };

  /* ================= ANALITIK ================= */
  pages.analytics = async (root) => {
    const d = await window.api.get('/api/analytics');
    const hasCashflow = d.monthlyCashflow.length > 0;
    const hasCat = d.spendingByCategory.length > 0;

    root.innerHTML = `
      ${pageHead('Analitik', 'Semua grafik dihitung dari catatan tersimpan. Tidak ada data yang dikarang.')}
      <div class="grid grid-3 section-block">
        <div class="card stat-card"><div class="stat-label">Kekayaan Bersih</div><div class="stat-value">${esc(fmtIDR(d.netWorth))}</div></div>
        <div class="card stat-card"><div class="stat-label">Tabungan</div><div class="stat-value">${esc(fmtIDR(d.assetDistribution.savings))}</div></div>
        <div class="card stat-card"><div class="stat-label">Rekening</div><div class="stat-value">${esc(fmtIDR(d.assetDistribution.bank))}</div></div>
      </div>

      <div class="grid grid-2 section-block">
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:12px">Arus Kas Bulanan</h3>
          ${hasCashflow ? `
            <div style="height:240px"><canvas id="an-cf" style="width:100%;height:100%"></canvas></div>
            <div class="table-wrap" style="margin-top:12px"><table class="table" style="min-width:0">
              <thead><tr><th>Bulan</th><th style="text-align:right">Masuk</th><th style="text-align:right">Keluar</th><th style="text-align:right">Net</th></tr></thead>
              <tbody>${d.monthlyCashflow.map((m) => `<tr><td>${esc(m.month)}</td>
                <td class="mono" style="text-align:right">${esc(fmtIDR(m.income))}</td>
                <td class="mono" style="text-align:right">${esc(fmtIDR(m.expense))}</td>
                <td class="mono" style="text-align:right;color:${m.net >= 0 ? 'var(--success)' : 'var(--danger)'}">${esc(fmtIDR(m.net))}</td></tr>`).join('')}</tbody>
            </table></div>`
          : window.ui.emptyState('▥', 'Belum ada data arus kas', 'Catat pemasukan & pengeluaran di halaman Transaksi untuk melihat grafik ini.')}
        </div>
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:12px">Pengeluaran per Kategori</h3>
          ${hasCat ? `
            <div style="height:240px;position:relative"><canvas id="an-donut" style="width:100%;height:100%"></canvas></div>
            <div style="margin-top:14px">${d.spendingByCategory.map((c, i) => `
              <div style="display:flex;justify-content:space-between;font-size:13px;padding:7px 0;border-bottom:1px solid var(--border-soft)">
                <span><i style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:8px;background:${['#7DD3E8','#C9CED4','#8f979f','#5c646c','#4ADE80','#FBBF24','#F87171','#a78bfa'][i % 8]}"></i>${esc(window.ui.CATEGORY_LABELS[c.category] || c.category)} <span class="text-dim">(${c.count})</span></span>
                <span class="mono">${esc(fmtIDR(c.total))}</span></div>`).join('')}</div>`
          : window.ui.emptyState('◍', 'Belum ada pengeluaran', 'Setelah kamu mencatat pengeluaran, distribusinya akan muncul di sini.')}
        </div>
      </div>

      <div class="grid grid-2 section-block">
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:14px">Progres Tabungan</h3>
          ${d.savingsProgress.length ? d.savingsProgress.map((g) => `
            <div style="margin-bottom:14px">
              <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:6px">
                <span>${esc(g.name)}</span><span class="mono text-dim">${esc(fmtIDR(g.balance))} / ${esc(fmtIDR(g.target))}</span></div>
              <div class="progress"><span style="width:${Math.min(100, g.progress)}%"></span></div>
            </div>`).join('') : '<p class="text-dim">Belum ada target tabungan.</p>'}
        </div>
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:14px">Kewajiban Cicilan</h3>
          ${d.installmentObligations.length ? d.installmentObligations.map((i) => `
            <div class="bank-line" style="padding:11px 0">
              <div style="flex:1"><div style="font-weight:600;font-size:14px">${esc(i.name)}</div>
                <div class="text-dim" style="font-size:12.5px">Terbayar ${esc(fmtIDR(i.totalPaid))} dari ${esc(fmtIDR(i.principal))} pokok</div></div>
              <span class="badge badge-warning">${esc(window.ui.fmtDate(i.nextDueDate))}</span>
            </div>`).join('') : '<p class="text-dim">Tidak ada cicilan aktif.</p>'}
        </div>
      </div>

      <div class="card">
        <h3 style="font-size:15px;margin-bottom:14px">Distribusi Aset</h3>
        <div style="display:flex;height:26px;border-radius:99px;overflow:hidden;background:var(--panel-2)">
          ${(() => {
            const s = d.assetDistribution.savings, b = d.assetDistribution.bank, t = s + b;
            if (!t) return '<div style="flex:1;background:#1d2125"></div>';
            return `<div style="flex:${Math.max(0.02, s / t)};background:linear-gradient(90deg,#7DD3E8,#5bb2c8)"></div>
                    <div style="flex:${Math.max(0.02, b / t)};background:linear-gradient(90deg,#8f979f,#5c646c)"></div>`;
          })()}
        </div>
        <div style="display:flex;gap:20px;margin-top:12px;font-size:13px" class="text-dim">
          <span><i style="display:inline-block;width:9px;height:9px;background:#7DD3E8;border-radius:2px;margin-right:6px"></i>Tabungan internal ${esc(fmtIDR(d.assetDistribution.savings))}</span>
          <span><i style="display:inline-block;width:9px;height:9px;background:#8f979f;border-radius:2px;margin-right:6px"></i>Rekening tersinkron ${esc(fmtIDR(d.assetDistribution.bank))}</span>
        </div>
      </div>`;

    requestAnimationFrame(() => {
      const cf = document.getElementById('an-cf');
      if (cf && hasCashflow) window.charts.cashflowBars(cf, d.monthlyCashflow);
      const dn = document.getElementById('an-donut');
      if (dn && hasCat) window.charts.donut(dn, d.spendingByCategory);
    });
  };

  /* ================= PASAR ================= */
  pages.market = async (root) => {
    let status = { provider: 'SNAPSHOT', live: false, delayedNotice: '' };
    try { status = await window.api.get('/api/market/status'); } catch (_) { /* diamkan */ }

    root.innerHTML = `
      ${pageHead('Pasar Saham', 'Data ditampilkan apa adanya beserta status keterkiniannya — tidak pernah diklaim live bila bukan.')}
      <div class="panel section-block" style="padding:14px 18px;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:center">
        <div style="display:flex;align-items:center;gap:10px;font-size:13px">
          <span class="badge ${status.live ? 'badge-success' : 'badge-warning'}">${status.live ? 'Penyedia data resmi' : 'Snapshot lokal'}</span>
          <span class="text-dim">${esc(status.delayedNotice)}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="input" id="m-search" placeholder="Cari simbol / emiten…" style="min-width:210px" autocomplete="off">
          <button class="btn btn-sm" id="m-refresh">↻ Segarkan</button>
        </div>
      </div>
      <div class="grid" style="grid-template-columns:1fr 340px;gap:16px;align-items:start" id="m-layout">
        <div class="card" id="m-detail"></div>
        <div class="card" id="m-watch"></div>
      </div>`;

      let chart = null;
      let mode = 'candles';

      async function quickRefresh() {
        const btn = document.getElementById('m-refresh');
        await guarded(btn, async () => {
          try {
            await window.api.get('/api/market/status');
            window.ui.toast('Data disegarkan dari penyedia.', 'success');
            if (current) loadSymbol(current);
            paintWatch();
          } catch (err) { window.ui.toast(err.message, 'error'); }
        }, 'Menyegarkan…');
      }
      document.getElementById('m-refresh').addEventListener('click', quickRefresh);

      let current = null;

      async function loadSymbol(symbol) {
        current = symbol;
        const box = document.getElementById('m-detail');
        box.innerHTML = '<div class="skeleton" style="height:300px"></div>';
        let q, h;
        try {
          [q, h] = await Promise.all([
            window.api.get(`/api/market/quotes/${encodeURIComponent(symbol)}`),
            window.api.get(`/api/market/history/${encodeURIComponent(symbol)}?limit=180`),
          ]);
        } catch (err) {
          box.innerHTML = `<h3>${esc(symbol)}</h3><p class="text-dim" style="margin-top:10px">${esc(err.message)}</p>`;
          return;
        }
        if (!q.quote) {
          box.innerHTML = `<h3>${esc(q.asset.name)}</h3><p class="text-dim" style="margin-top:10px">Kuotasi untuk instrumen ini belum tersedia. Kami tidak menampilkan harga perkiraan sebagai harga aktual.</p>`;
          return;
        }
        const up = q.quote.change >= 0;
        const rows = h.candles;
        box.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start">
            <div>
              <div style="display:flex;align-items:center;gap:10px">
                <h3 style="font-size:18px">${esc(q.asset.symbol)}</h3>
                <span class="badge">${esc(q.asset.exchange || '—')}</span>
              </div>
              <div class="text-dim" style="font-size:13.5px;margin-top:2px">${esc(q.asset.name)} · ${esc(q.asset.sector || '—')}</div>
            </div>
            <div style="text-align:right">
              <div class="mono" style="font-size:26px;font-weight:800">${esc(fmtIDR(q.quote.price).replace('Rp ', ''))}<span class="text-dim" style="font-size:13px"> ${esc(q.asset.currency)}</span></div>
              <div class="mono ${up ? 'up' : 'down'}" style="font-size:14px;color:${up ? 'var(--success)' : 'var(--danger)'}">
                ${up ? '▲' : '▼'} ${esc(fmtIDR(Math.abs(q.quote.change)))} (${up ? '+' : '−'}${Math.abs(q.quote.changePct).toFixed(2).replace('.', ',')}%)</div>
            </div>
          </div>
          <div class="grid grid-4" style="margin:16px 0;gap:10px">
            ${[['Pembukaan', q.quote.open], ['Tertinggi', q.quote.high], ['Terendah', q.quote.low], ['Penutupan lalu', q.quote.prevClose]]
              .map(([l, v]) => `<div style="background:var(--panel-2);border:1px solid var(--border-soft);border-radius:10px;padding:10px 12px">
                <div class="mini-label">${l}</div><div class="mono" style="font-size:14px;margin-top:3px">${esc(fmtIDR(v))}</div></div>`).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:10px">
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm ${mode === 'candles' ? 'btn-accent' : ''}" data-mode="candles">Candlestick</button>
              <button class="btn btn-sm ${mode === 'line' ? 'btn-accent' : ''}" data-mode="line">Garis</button>
            </div>
            <div style="display:flex;gap:6px">
              ${[30, 90, 180].map((n) => `<button class="btn btn-sm" data-range="${n}">${n}H</button>`).join('')}
            </div>
          </div>
          <div class="chart-box" id="m-chart" style="height:360px"></div>
          <div style="display:flex;justify-content:space-between;margin-top:12px;font-size:12.5px;flex-wrap:wrap;gap:10px">
            <span class="text-dim">Volume: <span class="mono">${q.quote.volume === null ? '—' : window.ui.fmtNum(q.quote.volume)}</span></span>
            <span class="text-dim">Harga per ${esc(window.ui.fmtDateTime(q.quote.quotedAt))} · ${q.quote.isDelayed ? 'kuotasi tertunda' : 'kuotasi langsung'} · sumber ${esc(q.quote.source)}</span>
          </div>
          <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-sm" id="m-add-watch">★ Tambah ke Watchlist</button>
            <button class="btn btn-sm btn-accent" id="m-add-alert">♪ Buat Alert Harga</button>
          </div>`;

        drawChart(rows);
        box.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
          mode = b.dataset.mode; loadSymbol(symbol);
        }));
        box.querySelectorAll('[data-range]').forEach((b) => b.addEventListener('click', async () => {
          const hh = await window.api.get(`/api/market/history/${encodeURIComponent(symbol)}?limit=${b.dataset.range}`);
          drawChart(hh.candles);
        }));
        document.getElementById('m-add-watch').addEventListener('click', async () => {
          try {
            const w = await window.api.get('/api/watchlists');
            if (!w.watchlists.length) await window.api.post('/api/watchlists', { name: 'Utama' });
            const w2 = await window.api.get('/api/watchlists');
            await window.api.post(`/api/watchlists/${w2.watchlists[0].id}/items`, { symbol: q.asset.symbol });
            window.ui.toast('Ditambahkan ke watchlist.', 'success');
            paintWatch();
          } catch (err) { window.ui.toast(err.message, 'error'); }
        });
        document.getElementById('m-add-alert').addEventListener('click', () => alertModal(q.asset.symbol, q.quote.price));

        function drawChart(candles) {
          const el = document.getElementById('m-chart');
          el.innerHTML = '';
          if (chart) { try { chart.remove(); } catch (_) { /* diamkan */ } chart = null; }
          if (!window.LightweightCharts || !candles.length) {
            el.innerHTML = window.ui.emptyState('⌁', 'Grafik tidak tersedia', 'Belum ada data historis untuk instrumen ini.');
            return;
          }
          chart = window.charts.createChart(el, { autoSize: true });
          if (!chart) {
            el.innerHTML = '<p class="text-dim" style="padding:16px">Grafik tidak dapat dirender di perangkat ini. Data historis tetap tersedia lewat tabel dan API.</p>';
            return;
          }
          if (mode === 'candles') window.charts.addCandles(chart, candles);
          else window.charts.addLine(chart, candles);
        }
      }

      async function alertModal(symbol, lastPrice) {
        const modal = window.ui.openModal({
          title: `Alert Harga — ${esc(symbol)}`,
          subtitle: `Harga tercatat terakhir: ${esc(fmtIDR(lastPrice))}`,
          bodyHtml: `<form onsubmit="return false">
            <div class="field"><label>Arah</label><select class="input" data-f="direction">
              <option value="ABOVE">Tercapai bila harga di atas target</option>
              <option value="BELOW">Tercapai bila harga di bawah target</option></select></div>
            <div class="field"><label>Harga target (Rp)</label><input class="input" data-f="targetPrice" type="number" min="1" step="1" value="${Math.round((lastPrice || 0) * 1.02)}"></div>
            <p class="text-dim" style="font-size:12.5px">Alert dievaluasi otomatis dari pembaruan harga yang masuk dari penyedia data (tiap 5 menit) — tidak pernah dari harga karangan.</p>
            <div class="field-error" data-error="form"></div>
          </form>`,
          actions: [
            { label: 'Batal', className: 'btn-ghost', onClick: () => window.ui.closeModal() },
            { label: 'Simpan Alert', className: 'btn-primary', onClick: async (m, btn) => {
                await guarded(btn, async () => {
                  const g = (f) => m.querySelector(`[data-f="${f}"]`).value;
                  const errEl = m.querySelector('[data-error="form"]');
                  errEl.textContent = '';
                  try {
                    await window.api.post('/api/alerts', { symbol, direction: g('direction'), targetPrice: Number(g('targetPrice')) });
                    window.ui.closeModal(); window.ui.toast('Alert disimpan.', 'success');
                  } catch (err) { errEl.textContent = err.message; }
                }, 'Menyimpan…');
              } },
          ],
        });
      }

      async function paintWatch() {
        const el = document.getElementById('m-watch');
        try {
          const w = await window.api.get('/api/watchlists');
          const items = w.watchlists.flatMap((x) => (x.items || []).map((i) => ({ ...i, wl: x.id, wlName: x.name })));
          el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <h3 style="font-size:15px">Watchlist</h3>
              <a href="/watchlist" data-link class="btn btn-sm btn-ghost">Kelola →</a></div>
            ${items.length ? items.map((i) => {
              const up = i.price !== null && i.prev_close !== null ? Number(i.price) >= Number(i.prev_close) : null;
              return `<div class="bank-line" data-sym="${esc(i.symbol)}" style="cursor:pointer;padding:10px 0">
                <div style="flex:1"><div style="font-weight:700;font-size:13.5px">${esc(i.symbol)}</div>
                <div class="text-dim" style="font-size:11.5px">${esc(i.wlName)}</div></div>
                <div style="text-align:right"><div class="mono" style="font-size:13.5px">${i.price === null ? '—' : window.ui.fmtNum(i.price)}</div>
                <div class="mono" style="font-size:11.5px;color:${up === null ? 'var(--text-2)' : up ? 'var(--success)' : 'var(--danger)'}">${up === null ? '—' : (up ? '+' : '−') + (100 * (Math.abs(Number(i.price) - Number(i.prev_close)) / (Number(i.prev_close) || 1))).toFixed(2).replace('.', ',') + '%'}</div></div>
              </div>`;
            }).join('') : '<p class="text-dim" style="font-size:13px">Belum ada instrumen. Tambahkan lewat tombol ★ di grafik.</p>'}`;
          el.querySelectorAll('[data-sym]').forEach((row) => row.addEventListener('click', () => loadSymbol(row.dataset.sym)));
        } catch (err) {
          el.innerHTML = `<h3 style="font-size:15px;margin-bottom:10px">Watchlist</h3><p class="text-dim" style="font-size:13px">Watchlist tidak dapat dimuat saat ini.</p>`;
        }
      }

      // daftar instrumen default
      async function loadList() {
        const d = await window.api.get('/api/market/assets');
        state.marketSymbolsCache = {};
        d.assets.forEach((a) => { state.marketSymbolsCache[a.symbol] = a; });
        if (!current && d.assets.length) loadSymbol(d.assets[0].symbol);
        paintWatch();
      }

      const search = document.getElementById('m-search');
      let searchTimer = null;
      search.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
          const q = search.value.trim();
          if (q.length < 1) return;
          try {
            const d = await window.api.get('/api/market/assets?q=' + encodeURIComponent(q));
            if (d.assets.length) loadSymbol(d.assets[0].symbol);
            else window.ui.toast('Instrumen tidak ditemukan di sumber data saat ini.', 'error');
          } catch (err) { window.ui.toast(err.message, 'error'); }
        }, 350);
      });
      search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); loadSymbol(search.value.trim().toUpperCase()); } });

      await loadList();

      // diperbarui oleh sinyal realtime → ambil ulang dari API (sumber kebenaran)
      const onRefresh = () => { if (current) loadSymbol(current); paintWatch(); };
      window.addEventListener('finova:refresh-market', onRefresh);
  };

  /* ================= WATCHLIST ================= */
  pages.watchlist = async (root) => {
    root.innerHTML = `
      ${pageHead('Watchlist', 'Susun beberapa daftar pemantauan sesuai strategi yang kamu pakai.',
        '<button class="btn btn-primary" id="btn-new-wl">+ Watchlist Baru</button>')}
      <div id="wl-list" class="grid grid-2"></div>`;

    async function paint() {
      const d = await window.api.get('/api/watchlists');
      const el = document.getElementById('wl-list');
      el.innerHTML = d.watchlists.length ? d.watchlists.map((w) => `
        <div class="card" data-wl="${w.id}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 style="font-size:16px">${esc(w.name)}</h3>
            <div style="display:flex;gap:6px">
              <button class="btn btn-sm" data-add="${w.id}">+ Tambah</button>
              <button class="btn btn-sm btn-ghost" data-del="${w.id}" title="Hapus watchlist">✕</button>
            </div>
          </div>
          ${w.items.length ? w.items.map((i) => {
            const up = i.price !== null && i.prev_close ? Number(i.price) >= Number(i.prev_close) : null;
            return `<div class="bank-line" style="padding:10px 0">
              <div style="flex:1"><div style="font-weight:700;font-size:14px">${esc(i.symbol)}</div>
              <div class="text-dim" style="font-size:12px">${esc(i.name || '')}</div></div>
              <div style="text-align:right">
                <div class="mono">${i.price === null ? '—' : esc(fmtIDR(i.price))}</div>
                <div class="mono" style="font-size:12px;color:${up === null ? 'var(--text-2)' : up ? 'var(--success)' : 'var(--danger)'}">${up === null ? 'kuotasi belum tersedia' : (up ? '▲ ' : '▼ ') + (100 * (Math.abs(Number(i.price) - Number(i.prev_close)) / (Number(i.prev_close) || 1))).toFixed(2).replace('.', ',') + '%'}</div>
                <div class="text-dim" style="font-size:11px">${i.quoted_at ? 'per ' + esc(window.ui.fmtDateTime(i.quoted_at)) : ''}</div>
              </div>
              <button class="btn btn-sm btn-ghost" data-rm="${w.id}|${esc(i.symbol)}" title="Hapus item">✕</button>
            </div>`;
          }).join('') : '<p class="text-dim" style="font-size:13.5px">Belum ada instrumen di daftar ini.</p>'}
        </div>`).join('') : window.ui.emptyState('★', 'Belum ada watchlist', 'Buat watchlist pertama untuk mulai memantau beberapa instrumen sekaligus.');

      el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!await window.ui.confirmModal({ title: 'Hapus watchlist?', message: 'Daftar ini akan dihapus beserta isinya.', confirmLabel: 'Hapus', danger: true })) return;
        await window.api.del(`/api/watchlists/${b.dataset.del}`);
        window.ui.toast('Watchlist dihapus.', 'success'); paint();
      }));
      el.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
        const modal = window.ui.openModal({
          title: 'Tambah Instrumen',
          bodyHtml: `<form onsubmit="return false">
            <div class="field"><label>Simbol (mis. BBCA.JK)</label><input class="input" data-f="symbol" placeholder="BBCA.JK" style="text-transform:uppercase">
            <div class="field-error" data-error="form"></div></div>
            <p class="text-dim" style="font-size:12.5px">Instrumen yang tersedia tergantung sumber data yang terkonfigurasi. Kamu bisa melihat daftar yang tersedia dari halaman Pasar.</p></form>`,
          actions: [
            { label: 'Batal', className: 'btn-ghost', onClick: () => window.ui.closeModal() },
            { label: 'Tambah', className: 'btn-primary', onClick: async (m, btn) => {
                await guarded(btn, async () => {
                  const errEl = m.querySelector('[data-error="form"]');
                  errEl.textContent = '';
                  const symbol = m.querySelector('[data-f="symbol"]').value.trim().toUpperCase();
                  if (!symbol) { errEl.textContent = 'Simbol wajib diisi.'; return; }
                  try {
                    await window.api.post(`/api/watchlists/${b.dataset.add}/items`, { symbol });
                    window.ui.closeModal(); window.ui.toast('Instrumen ditambahkan.', 'success'); paint();
                  } catch (err) { errEl.textContent = err.message; }
                }, 'Menambahkan…');
              } },
          ],
        });
      }));
      el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
        const [wid, sym] = b.dataset.rm.split('|');
        try { await window.api.del(`/api/watchlists/${wid}/items/${encodeURIComponent(sym)}`); paint(); }
        catch (err) { window.ui.toast(err.message, 'error'); }
      }));
    }
    document.getElementById('btn-new-wl').addEventListener('click', () => {
      const modal = window.ui.openModal({
        title: 'Watchlist Baru',
        bodyHtml: `<div class="field"><label>Nama</label><input class="input" data-f="name" maxlength="60" placeholder="Blue chips"><div class="field-error" data-error="form"></div></div>`,
        actions: [
          { label: 'Batal', className: 'btn-ghost', onClick: () => window.ui.closeModal() },
          { label: 'Simpan', className: 'btn-primary', onClick: async (m, btn) => {
              await guarded(btn, async () => {
                const name = m.querySelector('[data-f="name"]').value.trim();
                const errEl = m.querySelector('[data-error="form"]');
                if (!name) { errEl.textContent = 'Nama wajib diisi.'; return; }
                try {
                  await window.api.post('/api/watchlists', { name });
                  window.ui.closeModal(); window.ui.toast('Watchlist dibuat.', 'success'); paint();
                } catch (err) { errEl.textContent = err.message; }
              }, 'Menyimpan…');
            } },
        ],
      });
    });

    await paint();
  };

  /* ================= ALERT ================= */
  pages.alerts = async (root) => {
    root.innerHTML = `
      ${pageHead('Alert Harga', 'Alert dievaluasi dari pembaruan harga yang benar-benar masuk dari penyedia data.',
        '<button class="btn btn-primary" id="btn-new-alert">+ Alert Baru</button>')}
      <div class="card" id="alerts-box"></div>`;

    async function paint() {
      const d = await window.api.get('/api/alerts');
      document.getElementById('alerts-box').innerHTML = d.alerts.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Instrumen</th><th>Kondisi</th><th style="text-align:right">Target</th><th>Status</th><th style="text-align:right">Aksi</th></tr></thead>
          <tbody>${d.alerts.map((a) => `<tr>
            <td><div style="font-weight:700">${esc(a.symbol)}</div><div class="text-dim" style="font-size:12px">${esc(a.asset_name || '')}</div></td>
            <td>${a.direction === 'ABOVE' ? '▲ di atas' : '▼ di bawah'}</td>
            <td class="mono" style="text-align:right">${esc(fmtIDR(a.target_price))}</td>
            <td>${a.triggered_at
              ? `<span class="badge badge-success">Terpicu ${esc(window.ui.fmtDate(a.triggered_at))}</span><div class="text-dim" style="font-size:11.5px">pada ${esc(fmtIDR(a.trigger_price))}</div>`
              : a.enabled ? '<span class="badge badge-accent">Menunggu</span>' : '<span class="badge">Nonaktif</span>'}</td>
            <td style="text-align:right;white-space:nowrap">
              ${a.triggered_at ? '' : `<button class="btn btn-sm" data-toggle="${a.id}" data-enabled="${!a.enabled}">${a.enabled ? 'Nonaktifkan' : 'Aktifkan'}</button>`}
              <button class="btn btn-sm btn-ghost" data-del="${a.id}">Hapus</button></td>
          </tr>`).join('')}</tbody></table></div>`
        : window.ui.emptyState('♪', 'Belum ada alert', 'Buat alert untuk diberi tahu saat harga menyentuh targetmu.');

      document.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
        try {
          await window.api.patch(`/api/alerts/${b.dataset.toggle}`, { enabled: b.dataset.enabled === 'true' });
          paint();
        } catch (err) { window.ui.toast(err.message, 'error'); }
      }));
      document.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!await window.ui.confirmModal({ title: 'Hapus alert?', message: 'Alert ini akan dihapus permanen.', confirmLabel: 'Hapus', danger: true })) return;
        try { await window.api.del(`/api/alerts/${b.dataset.del}`); window.ui.toast('Alert dihapus.', 'success'); paint(); }
        catch (err) { window.ui.toast(err.message, 'error'); }
      }));
    }
    document.getElementById('btn-new-alert').addEventListener('click', async () => {
      let options = [];
      try { options = (await window.api.get('/api/market/assets')).assets; } catch (_) { /* diamkan */ }
      const modal = window.ui.openModal({
        title: 'Alert Harga Baru',
        bodyHtml: `<form onsubmit="return false">
          <div class="field"><label>Instrumen</label>
            <select class="input" data-f="symbol">${options.map((a) => `<option value="${esc(a.symbol)}">${esc(a.symbol)} — ${esc(a.name)}</option>`).join('') || '<option value="">(belum ada instrumen tersedia)</option>'}</select></div>
          <div class="grid grid-2">
            <div class="field"><label>Kondisi</label><select class="input" data-f="direction">
              <option value="ABOVE">Harga di atas target</option><option value="BELOW">Harga di bawah target</option></select></div>
            <div class="field"><label>Target (Rp)</label><input class="input" data-f="targetPrice" type="number" min="1"></div>
          </div>
          <div class="field-error" data-error="form"></div></form>`,
        actions: [
          { label: 'Batal', className: 'btn-ghost', onClick: () => window.ui.closeModal() },
          { label: 'Simpan', className: 'btn-primary', onClick: async (m, btn) => {
              await guarded(btn, async () => {
                const g = (f) => m.querySelector(`[data-f="${f}"]`);
                const errEl = m.querySelector('[data-error="form"]');
                errEl.textContent = '';
                const target = Number(g('targetPrice').value || 0);
                if (!(target > 0)) { errEl.textContent = 'Target harus lebih dari nol.'; return; }
                try {
                  await window.api.post('/api/alerts', { symbol: g('symbol').value, direction: g('direction').value, targetPrice: target });
                  window.ui.closeModal(); window.ui.toast('Alert dibuat.', 'success'); paint();
                } catch (err) { errEl.textContent = err.message; }
              }, 'Menyimpan…');
            } },
        ],
      });
    });

    await paint();
  };

  /* ================= NOTIFIKASI ================= */
  pages.notifications = async (root) => {
    let page = 1;
    root.innerHTML = `
      ${pageHead('Notifikasi', 'Progres tabungan, jatuh tempo cicilan, keamanan, dan alert harga.',
        '<button class="btn" id="btn-read-all">Tandai semua terbaca</button>')}
      <div class="card" id="notif-list"></div>`;

    const TYPE_LABEL = {
      SAVINGS: 'Tabungan', INSTALLMENT: 'Cicilan', PAYMENT: 'Pembayaran',
      BANK: 'Perbankan', BANK_SYNC: 'Sinkronisasi', SECURITY: 'Keamanan',
      PRICE_ALERT: 'Alert Harga', SYSTEM: 'Sistem',
    };

    async function paint() {
      const d = await window.api.get(`/api/notifications?limit=25&page=${page}`);
      const el = document.getElementById('notif-list');
      el.innerHTML = d.notifications.length ? d.notifications.map((n) => `
        <div class="bank-line" data-notif="${n.id}" style="align-items:flex-start;cursor:${n.read_at ? 'default' : 'pointer'}">
          <span class="bank-chip" style="width:38px;height:38px;font-size:14px;${n.read_at ? 'opacity:.5' : ''}">${n.read_at ? '·' : '●'}</span>
          <div>
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <strong style="font-size:14.5px;${n.read_at ? 'color:var(--text-2);font-weight:600' : ''}">${esc(n.title)}</strong>
              <span class="badge">${esc(TYPE_LABEL[n.type] || n.type)}</span>
            </div>
            <p class="text-dim" style="font-size:13.5px;margin-top:4px">${esc(n.body)}</p>
            <div class="text-dim" style="font-size:11.5px;margin-top:5px">${esc(window.ui.fmtDateTime(n.created_at))}</div>
          </div>
        </div>`).join('') : window.ui.emptyState('◔', 'Belum ada notifikasi', 'Kami akan memberi tahu kamu saat ada progres tabungan, jatuh tempo, atau alert harga.');

      if (d.pagination.pages > 1) {
        el.insertAdjacentHTML('beforeend', `<div class="pager">
          <span>Halaman ${page} dari ${d.pagination.pages}</span>
          <button class="btn btn-sm" id="n-prev" ${page <= 1 ? 'disabled' : ''}>←</button>
          <button class="btn btn-sm" id="n-next" ${page >= d.pagination.pages ? 'disabled' : ''}>→</button></div>`);
        document.getElementById('n-prev')?.addEventListener('click', () => { page--; paint(); });
        document.getElementById('n-next')?.addEventListener('click', () => { page++; paint(); });
      }

      el.querySelectorAll('[data-notif]').forEach((row) => row.addEventListener('click', async () => {
        const n = d.notifications.find((x) => x.id === row.dataset.notif);
        if (n.read_at) return;
        try {
          await window.api.post(`/api/notifications/${n.id}/read`);
          app.refreshNotifBadge();
          paint();
        } catch (err) { window.ui.toast(err.message, 'error'); }
      }));
    }
    document.getElementById('btn-read-all').addEventListener('click', async (e) => {
      await guarded(e.currentTarget, async () => {
        try { await window.api.post('/api/notifications/read-all'); window.ui.toast('Semua ditandai terbaca.', 'success'); app.refreshNotifBadge(); paint(); }
        catch (err) { window.ui.toast(err.message, 'error'); }
      }, 'Memproses…');
    });

    await paint();
  };

  /* ================= PROFIL ================= */
  pages.profile = async (root) => {
    const d = await window.api.get('/api/profile');
    const u = d.user, p = d.profile;
    root.innerHTML = `
      ${pageHead('Profil', 'Identitas & preferensi tampilan aplikasi.')}
      <div class="grid grid-2" style="align-items:start">
        <div class="card">
          <div style="display:flex;gap:16px;align-items:center;margin-bottom:22px">
            <span class="avatar" style="width:62px;height:62px;font-size:22px">${esc(u.fullName.split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase())}</span>
            <div><h3 style="font-size:18px">${esc(u.fullName)}</h3>
              <div class="text-dim" style="font-size:13.5px">@${esc(u.username)} · ${esc(u.email)}</div></div>
          </div>
          <form id="pf-form">
            <div class="field"><label>Nama lengkap</label><input class="input" data-f="fullName" value="${esc(u.fullName)}" maxlength="120"></div>
            <div class="grid grid-2">
              <div class="field"><label>Mata uang</label><select class="input" data-f="currency"><option value="IDR" ${p.currency === 'IDR' ? 'selected' : ''}>IDR</option></select></div>
              <div class="field"><label>Zona waktu</label><select class="input" data-f="timezone">
                ${['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'].map((tz) => `<option value="${tz}" ${p.timezone === tz ? 'selected' : ''}>${tz}</option>`).join('')}</select></div>
            </div>
            <div class="field"><label>Pendapatan rata-rata / bulan (Rp)</label><input class="input" data-f="monthlyIncome" type="number" min="0" step="50000" value="${p.monthlyIncome || ''}"></div>
            <div class="field"><label>URL avatar (opsional)</label><input class="input" data-f="avatarUrl" value="${esc(p.avatarUrl || '')}" maxlength="500" placeholder="https://…"></div>
            <div class="checkbox-row" style="margin-bottom:10px"><input type="checkbox" id="pf-ne" ${p.notifyEmail ? 'checked' : ''}><label for="pf-ne" style="margin:0">Notifikasi lewat email</label></div>
            <div class="checkbox-row" style="margin-bottom:18px"><input type="checkbox" id="pf-np" ${p.notifyPush ? 'checked' : ''}><label for="pf-np" style="margin:0">Notifikasi dalam aplikasi</label></div>
            <div class="field-error" data-error="form"></div>
            <button class="btn btn-primary" id="pf-save" type="submit">Simpan Perubahan</button>
          </form>
        </div>
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:14px">Informasi Akun</h3>
          <dl class="detail-list">
            <dt>Nama pengguna</dt><dd>@${esc(u.username)}</dd>
            <dt>Email</dt><dd>${esc(u.email)}</dd>
            <dt>Peran</dt><dd>${u.role === 'ADMIN' ? '<span class="badge badge-accent">Administrator</span>' : '<span class="badge">Pengguna</span>'}</dd>
            <dt>Status</dt><dd><span class="badge badge-success">${esc(u.status)}</span></dd>
            <dt>Terdaftar</dt><dd>${esc(window.ui.fmtDate(u.createdAt))}</dd>
            <dt>Masuk terakhir</dt><dd>${esc(window.ui.fmtDateTime(u.lastLoginAt))}</dd>
          </dl>
          <p class="text-dim" style="font-size:12.5px;margin-top:18px">Perubahan sensitif (kata sandi, sesi, koneksi bank) dikelola di halaman Keamanan.</p>
          <a href="/security" data-link class="btn btn-sm" style="margin-top:12px">Ke Keamanan →</a>
        </div>
      </div>`;

    document.getElementById('pf-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const g = (f) => document.querySelector(`[data-f="${f}"]`);
      const errEl = document.querySelector('[data-error="form"]');
      errEl.textContent = '';
      await guarded(document.getElementById('pf-save'), async () => {
        try {
          await window.api.put('/api/profile', {
            fullName: g('fullName').value.trim(),
            currency: g('currency').value,
            timezone: g('timezone').value,
            monthlyIncome: Number(g('monthlyIncome').value || 0),
            avatarUrl: g('avatarUrl').value.trim() || null,
            notifyEmail: document.getElementById('pf-ne').checked,
            notifyPush: document.getElementById('pf-np').checked,
          });
          window.ui.toast('Profil diperbarui.', 'success');
          state.user.fullName = g('fullName').value.trim();
          document.getElementById('user-name').textContent = state.user.fullName;
        } catch (err) { errEl.textContent = err.message; }
      }, 'Menyimpan…');
    });
  };

  /* ================= KEAMANAN ================= */
  pages.security = async (root) => {
    root.innerHTML = `
      ${pageHead('Keamanan', 'Kendalikan sesi aktif, kata sandi, otorisasi bank, dan status akun.')}
      <div class="grid grid-2" style="align-items:start">
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:14px">Ubah Kata Sandi</h3>
          <form id="sec-pw">
            <div class="field"><label>Kata sandi saat ini</label><input class="input" data-f="currentPassword" type="password" autocomplete="current-password"></div>
            <div class="field"><label>Kata sandi baru</label><input class="input" data-f="newPassword" type="password" autocomplete="new-password" maxlength="128">
              <div class="password-hint text-dim" style="font-size:12px;margin-top:6px">Minimal 8 karakter, mengandung huruf besar, huruf kecil, dan angka.</div></div>
            <div class="field"><label>Ulangi kata sandi baru</label><input class="input" data-f="confirmPassword" type="password" autocomplete="new-password"></div>
            <div class="field-error" data-error="pw"></div>
            <button class="btn btn-primary" id="sec-pw-btn">Perbarui Kata Sandi</button>
          </form>
        </div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
            <h3 style="font-size:15px">Sesi Aktif</h3>
            <button class="btn btn-sm btn-danger" id="sec-logout-all">Keluarkan semua</button>
          </div>
          <div id="sec-sessions"></div>
        </div>
        <div class="card">
          <h3 style="font-size:15px;margin-bottom:14px">Otorisasi Perbankan</h3>
          <div id="sec-bank"></div>
        </div>
        <div class="card" style="border-color:rgba(248,113,113,0.28)">
          <h3 style="font-size:15px;margin-bottom:8px;color:var(--danger)">Zona Berbahaya</h3>
          <p class="text-dim" style="font-size:13.5px;margin-bottom:16px">Menghapus akun menonaktifkan aksesmu serta mencabut seluruh sesi dan otorisasi bank. Data ditandai untuk penghapusan sesuai kebijakan retensi.</p>
          <button class="btn btn-danger" id="sec-delete">Ajukan Penghapusan Akun</button>
        </div>
      </div>`;

    async function paintSessions() {
      const d = await window.api.get('/api/profile/sessions');
      document.getElementById('sec-sessions').innerHTML = d.sessions.map((s) => `
        <div class="bank-line" style="padding:12px 0">
          <span class="bank-chip" style="width:36px;height:36px;font-size:14px">${s.current ? '◈' : '◌'}</span>
          <div><div style="font-size:13.5px;font-weight:600">${s.current ? 'Sesi ini' : 'Sesi lain'}</div>
            <div class="text-dim" style="font-size:12px">${esc((s.userAgent || 'Perangkat tidak dikenal').slice(0, 60))}</div>
            <div class="text-dim" style="font-size:11.5px">Aktif terakhir ${esc(window.ui.fmtDateTime(s.lastSeenAt))}</div></div>
          ${s.current ? '' : `<button class="btn btn-sm btn-ghost" data-rev="${s.id}">Cabut</button>`}
        </div>`).join('') || '<p class="text-dim" style="font-size:13px">Tidak ada sesi aktif.</p>';
      document.querySelectorAll('[data-rev]').forEach((b) => b.addEventListener('click', async () => {
        try { await window.api.del(`/api/profile/sessions/${b.dataset.rev}`); window.ui.toast('Sesi dicabut.', 'success'); paintSessions(); }
        catch (err) { window.ui.toast(err.message, 'error'); }
      }));
    }
    async function paintBankAuth() {
      const el = document.getElementById('sec-bank');
      try {
        const d = await window.api.get('/api/banks/connections');
        const c = d.connection;
        el.innerHTML = `
          <div class="bank-line" style="padding:0;border:none">
            <span class="bank-chip">MDR</span>
            <div><div style="font-weight:600">Bank Mandiri</div>
            <div class="text-dim" style="font-size:12.5px">${esc(c.stateMessage)}</div></div>
            ${c.state === 'CONNECTED' ? `<button class="btn btn-sm btn-ghost" id="sec-revoke">Cabut</button>` : ''}
          </div>`;
        document.getElementById('sec-revoke')?.addEventListener('click', async () => {
          if (!await window.ui.confirmModal({ title: 'Cabut otorisasi bank?', message: 'FINOVA tidak akan lagi dapat mengambil saldo maupun mutasi rekening ini.', confirmLabel: 'Cabut otorisasi', danger: true })) return;
          try {
            await window.api.del(`/api/banks/connections/${c.id}`);
            window.ui.toast('Otorisasi dicabut.', 'success'); paintBankAuth();
          } catch (err) { window.ui.toast(err.message, 'error'); }
        });
      } catch (err) {
        el.innerHTML = '<p class="text-dim" style="font-size:13px">Status koneksi bank tidak dapat dimuat saat ini.</p>';
      }
    }
    document.getElementById('sec-pw-btn').addEventListener('click', async (e) => {
      e.preventDefault();
      const g = (f) => document.querySelector(`#sec-pw [data-f="${f}"]`);
      const errEl = document.querySelector('[data-error="pw"]');
      errEl.textContent = '';
      if (g('newPassword').value !== g('confirmPassword').value) { errEl.textContent = 'Konfirmasi kata sandi tidak sama.'; return; }
      await guarded(e.currentTarget, async () => {
        try {
          await window.api.post('/api/profile/change-password', {
            currentPassword: g('currentPassword').value, newPassword: g('newPassword').value, confirmPassword: g('confirmPassword').value,
          });
          [g('currentPassword'), g('newPassword'), g('confirmPassword')].forEach((x) => { x.value = ''; });
          window.ui.toast('Kata sandi diperbarui. Sesi lain telah dicabut.', 'success', 4500);
          paintSessions();
        } catch (err) { errEl.textContent = err.message; }
      }, 'Memperbarui…');
    });

    document.getElementById('sec-logout-all').addEventListener('click', async (e) => {
      if (!await window.ui.confirmModal({ title: 'Keluarkan semua sesi?', message: 'Kamu akan keluar dari perangkat ini juga.', confirmLabel: 'Keluarkan semua', danger: true })) return;
      try { await window.api.post('/api/profile/logout-all'); window.location.href = '/login'; }
      catch (err) { window.ui.toast(err.message, 'error'); }
    });

    document.getElementById('sec-delete').addEventListener('click', async () => {
      const modal = window.ui.openModal({
        title: 'Konfirmasi penghapusan akun',
        bodyHtml: `<p class="text-dim" style="margin-bottom:14px">Masukkan kata sandimu untuk mengonfirmasi. Tindakan ini tidak dapat dibatalkan dari aplikasi.</p>
          <div class="field"><input class="input" data-f="password" type="password" autocomplete="current-password" placeholder="Kata sandi"></div>
          <div class="field-error" data-error="del"></div>`,
        actions: [
          { label: 'Batal', className: 'btn-ghost', onClick: () => window.ui.closeModal() },
          { label: 'Hapus Akun', className: 'btn-danger', onClick: async (m, btn) => {
              await guarded(btn, async () => {
                const errEl = m.querySelector('[data-error="del"]');
                try {
                  await window.api.post('/api/profile/delete-account', { password: m.querySelector('[data-f="password"]').value });
                  window.ui.closeModal(); window.location.href = '/login';
                } catch (err) { errEl.textContent = err.message; }
              }, 'Memproses…');
            } },
        ],
      });
    });

    await paintSessions();
    await paintBankAuth();
  };

  /* ================= ADMIN ================= */
  pages.admin = async (root) => {
    if (state.user.role !== 'ADMIN') {
      root.innerHTML = `<div class="panel" style="text-align:center;padding:56px">
        <h2>Akses terbatas</h2><p class="text-dim" style="margin-top:8px">Panel admin hanya tersedia untuk akun administrator.</p></div>`;
      return;
    }
    let tab = 'overview';
    root.innerHTML = `
      ${pageHead('Panel Admin', 'Monitoring sistem, pengguna, produk, dan audit trail.')}
      <div class="filter-bar">
        ${[['overview', 'Ringkasan'], ['users', 'Pengguna'], ['products', 'Produk & Tarif'], ['integrations', 'Integrasi'], ['audit', 'Audit Log'], ['health', 'Kesehatan Sistem']]
          .map(([k, l]) => `<button class="btn btn-sm ${tab === k ? 'btn-accent' : ''}" data-tab="${k}">${l}</button>`).join('')}
      </div>
      <div id="admin-body"></div>`;

    root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      tab = b.dataset.tab;
      root.querySelectorAll('[data-tab]').forEach((x) => x.classList.toggle('btn-accent', x.dataset.tab === tab));
      paintTab();
    }));

    async function paintTab() {
      const el = document.getElementById('admin-body');
      el.innerHTML = `<div class="grid grid-3">${window.ui.skeletonCards(3)}</div>`;
      try {
        if (tab === 'overview') {
          const d = await window.api.get('/api/admin/dashboard');
          el.innerHTML = `
            <div class="grid grid-4 section-block">
              <div class="card stat-card"><div class="stat-label">Total Pengguna</div><div class="stat-value">${window.ui.fmtNum(d.users.total)}</div><div class="stat-note">${d.users.active} aktif · ${d.users.admins} admin</div></div>
              <div class="card stat-card"><div class="stat-label">Sesi Aktif</div><div class="stat-value">${window.ui.fmtNum(d.activeSessions)}</div></div>
              <div class="card stat-card"><div class="stat-label">Alert Menunggu</div><div class="stat-value">${window.ui.fmtNum(d.pendingAlerts)}</div></div>
              <div class="card stat-card"><div class="stat-label">Koneksi Bank</div><div class="stat-value">${window.ui.fmtNum(d.bankConnections.reduce((s, r) => s + r.n, 0))}</div></div>
            </div>
            <div class="grid grid-2">
              <div class="card"><h3 style="font-size:15px;margin-bottom:12px">Status Koneksi Bank</h3>
                ${d.bankConnections.length ? d.bankConnections.map((r) => `<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border-soft)">
                  <span>${esc(r.state)}</span><span class="mono">${r.n}</span></div>`).join('') : '<p class="text-dim" style="font-size:13px">Belum ada koneksi bank terdaftar.</p>'}</div>
              <div class="card"><h3 style="font-size:15px;margin-bottom:12px">Penyedia Data</h3>
                <dl class="detail-list">
                  <dt>Open Banking</dt><dd><span class="badge ${d.providers.mandiri === 'LIVE' ? 'badge-success' : 'badge-warning'}">${esc(d.providers.mandiri)}</span></dd>
                  <dt>Data Pasar</dt><dd><span class="badge ${d.providers.market === 'LIVE' ? 'badge-success' : 'badge-warning'}">${esc(d.providers.market)}</span></dd>
                </dl>
                <button class="btn btn-sm" id="adm-refresh-market" style="margin-top:14px">↻ Segarkan data pasar</button>
              </div>
            </div>`;
          document.getElementById('adm-refresh-market')?.addEventListener('click', async (e) => {
            await guarded(e.currentTarget, async () => {
              try {
                const r = await window.api.post('/api/admin/market/refresh');
                window.ui.toast(`${r.refreshed.assets} aset disegarkan · ${r.alertsTriggered} alert terpicu.`, 'success', 4500);
              } catch (err) { window.ui.toast(err.message, 'error'); }
            }, 'Menyegarkan…');
          });
        } else if (tab === 'users') {
          const d = await window.api.get('/api/admin/users?limit=50');
          el.innerHTML = `<div class="card"><div class="filter-bar"><input class="input" id="adm-uq" placeholder="Cari email / nama…"><button class="btn btn-sm" id="adm-uses">Cari</button></div>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Nama</th><th>Email</th><th>Peran</th><th>Status</th><th>Terdaftar</th><th>Aksi</th></tr></thead>
              <tbody>${d.users.map((u) => `<tr>
                <td><div style="font-weight:600">${esc(u.full_name)}</div><div class="text-dim" style="font-size:12px">@${esc(u.username)}</div></td>
                <td>${esc(u.email)}</td>
                <td>${u.role === 'ADMIN' ? '<span class="badge badge-accent">Admin</span>' : '<span class="badge">User</span>'}</td>
                <td><span class="badge ${u.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}">${esc(u.status)}</span></td>
                <td class="text-dim">${esc(window.ui.fmtDate(u.created_at))}</td>
                <td>${u.role === 'ADMIN' ? '' : `<button class="btn btn-sm" data-user-status="${u.id}" data-next="${u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE'}">${u.status === 'ACTIVE' ? 'Bekukan' : 'Aktifkan'}</button>`}</td>
              </tr>`).join('')}</tbody></table></div>
            <div class="pager"><span>Total ${window.ui.fmtNum(d.total)} pengguna</span></div></div>`;
          const search = () => window.api.get('/api/admin/users?limit=50&q=' + encodeURIComponent(document.getElementById('adm-uq').value)).then(() => {});
          document.getElementById('adm-uses').addEventListener('click', search);
          document.getElementById('adm-uq').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
          el.querySelectorAll('[data-user-status]').forEach((b) => b.addEventListener('click', async () => {
            const next = b.dataset.next;
            if (!await window.ui.confirmModal({ title: next === 'SUSPENDED' ? 'Bekukan akun?' : 'Aktifkan akun?', message: 'Perubahan langsung berlaku pada login berikutnya.', confirmLabel: 'Ya' })) return;
            try {
              await window.api.patch(`/api/admin/users/${b.dataset.userStatus}/status`, { status: next });
              window.ui.toast('Status pengguna diperbarui.', 'success'); paintTab();
            } catch (err) { window.ui.toast(err.message, 'error'); }
          }));
        } else if (tab === 'products') {
          const d = await window.api.get('/api/admin/interest-rates');
          el.innerHTML = `
            <div class="card section-block">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                <h3 style="font-size:15px">Konfigurasi Tarif Bunga</h3>
                <button class="btn btn-sm btn-primary" id="adm-new-rate">+ Tarif Baru</button>
              </div>
              <p class="text-dim" style="font-size:13px;margin-bottom:14px">Tarif di bawah adalah konfigurasi produk internal FINOVA. Tarif resmi bank tidak boleh dikarang — hanya ditampilkan bila berasal dari data bank terverifikasi.</p>
              ${d.rates.length ? `<div class="table-wrap"><table class="table">
                <thead><tr><th>Produk</th><th>Nama</th><th style="text-align:right">Tarif</th><th>Metode</th><th>Berlaku</th><th>Catatan</th></tr></thead>
                <tbody>${d.rates.map((r) => `<tr>
                  <td class="mono">${esc(r.product_code)}</td><td>${esc(r.name)}</td>
                  <td class="mono" style="text-align:right">${esc(String(r.rate_annual))}%</td>
                  <td>${esc(r.method)}</td>
                  <td class="text-dim">${esc(window.ui.fmtDate(r.effective_from))}${r.effective_to ? ' → ' + esc(window.ui.fmtDate(r.effective_to)) : ''}</td>
                  <td class="text-dim" style="max-width:240px">${esc(r.notes || '—')}</td></tr>`).join('')}</tbody></table></div>`
              : '<p class="text-dim">Belum ada tarif terdaftar.</p>'}
            </div>
            <div class="card"><h3 style="font-size:15px;margin-bottom:12px">Produk Tabungan Internal</h3>
              <p class="text-dim" style="font-size:13.5px">Pengguna dapat membuat target tabungan dengan asumsi bunga sendiri. Nilai ini selalu ditandai sebagai <b>estimasi perencanaan</b> dan tidak dianggap sebagai bunga yang dijamin.</p></div>`;
          document.getElementById('adm-new-rate').addEventListener('click', () => {
            const modal = window.ui.openModal({
              title: 'Tarif Bunga Baru',
              bodyHtml: `<form onsubmit="return false">
                <div class="grid grid-2">
                  <div class="field"><label>Kode produk</label><input class="input" data-f="productCode" value="SAVINGS_GOAL_PLAN"></div>
                  <div class="field"><label>Tarif %/tahun</label><input class="input" data-f="rateAnnual" type="number" min="0" max="100" step="0.01" value="3"></div>
                </div>
                <div class="field"><label>Nama</label><input class="input" data-f="name" placeholder="Tarif contoh tabungan"></div>
                <div class="grid grid-2">
                  <div class="field"><label>Metode</label><select class="input" data-f="method">
                    <option value="SIMPLE_DAILY">Sederhana harian</option><option value="MONTHLY">Bulanan</option>
                    <option value="COMPOUND">Majemuk</option><option value="AVERAGE_BALANCE">Rata-rata saldo</option></select></div>
                  <div class="field"><label>Berlaku sejak</label><input class="input" data-f="effectiveFrom" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
                </div>
                <div class="field"><label>Catatan</label><input class="input" data-f="notes" maxlength="500"></div>
                <div class="field-error" data-error="form"></div></form>`,
              actions: [
                { label: 'Batal', className: 'btn-ghost', onClick: () => window.ui.closeModal() },
                { label: 'Simpan', className: 'btn-primary', onClick: async (m, btn) => {
                    await guarded(btn, async () => {
                      const g = (f) => m.querySelector(`[data-f="${f}"]`).value;
                      const errEl = m.querySelector('[data-error="form"]');
                      errEl.textContent = '';
                      try {
                        await window.api.post('/api/admin/interest-rates', {
                          productCode: g('productCode'), name: g('name'),
                          rateAnnual: Number(g('rateAnnual')), method: g('method'),
                          effectiveFrom: g('effectiveFrom'), notes: g('notes') || undefined,
                        });
                        window.ui.closeModal(); window.ui.toast('Tarif disimpan.', 'success'); paintTab();
                      } catch (err) { errEl.textContent = err.message; }
                    }, 'Menyimpan…');
                  } },
              ],
            });
          });
        } else if (tab === 'integrations') {
          const [health] = await Promise.all([window.api.get('/api/admin/system-health')]);
          el.innerHTML = `
            <div class="grid grid-2">
              <div class="card"><h3 style="font-size:15px;margin-bottom:12px">Koneksi Bank (Open Banking)</h3>
                <dl class="detail-list">
                  <dt>Mode</dt><dd><span class="badge ${health.providers.mandiri.mode === 'LIVE' ? 'badge-success' : 'badge-warning'}">${esc(health.providers.mandiri.mode)}</span></dd>
                  <dt>Kredensial resmi</dt><dd>${health.providers.mandiri.liveConfigured ? '<span class="badge badge-success">Terkonfigurasi</span>' : '<span class="badge">Belum ada</span>'}</dd>
                </dl>
                ${health.providers.mandiri.liveConfigured ? '' : `
                <p class="text-dim" style="font-size:13px;margin-top:12px">Untuk mengaktifkan koneksi resmi, siapkan pada sisi server: kredensial klien yang disetujui, URL basis kanal, registrasi aplikasi, serta persetujuan Bank Indonesia / asosiasi. FINOVA tidak dapat memakai scraping atau kredensial pribadi.</p>`}
              </div>
              <div class="card"><h3 style="font-size:15px;margin-bottom:12px">Penyedia Data Pasar</h3>
                <dl class="detail-list">
                  <dt>Mode</dt><dd><span class="badge ${health.providers.market.mode === 'LIVE' ? 'badge-success' : 'badge-warning'}">${esc(health.providers.market.mode)}</span></dd>
                </dl>
                <p class="text-dim" style="font-size:13px;margin-top:12px">${health.providers.market.mode === 'LIVE'
                  ? 'Kuotasi diambil dari penyedia resmi. Status keterlambatan mengikuti lisensi penyedia.'
                  : 'Menggunakan snapshot historis lokal berlabel "contoh". Tambahkan kunci API penyedia data resmi untuk kuotasi tertunda/live.'}</p>
              </div>
            </div>`;
        } else if (tab === 'audit') {
          const d = await window.api.get('/api/admin/audit-logs?limit=100');
          el.innerHTML = `<div class="card"><h3 style="font-size:15px;margin-bottom:12px">Audit Log (hanya-tambah)</h3>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Entitas</th><th>Detail</th></tr></thead>
              <tbody>${d.logs.map((l) => `<tr>
                <td class="text-dim" style="white-space:nowrap">${esc(window.ui.fmtDateTime(l.created_at))}</td>
                <td>${esc(l.actor_email || 'sistem')}</td>
                <td class="mono" style="font-size:12px">${esc(l.action)}</td>
                <td class="text-dim">${esc(l.entity_type || '—')}</td>
                <td class="text-dim" style="max-width:260px;font-size:12px">${esc(l.detail ? JSON.stringify(l.detail) : '—')}</td></tr>`).join('')}</tbody>
            </table></div></div>`;
        } else {
          const d = await window.api.get('/api/admin/system-health');
          el.innerHTML = `<div class="grid grid-2">
            <div class="card"><h3 style="font-size:15px;margin-bottom:12px">Kesehatan Sistem</h3>
              <dl class="detail-list">
                <dt>Database</dt><dd>${d.database.ok ? '<span class="badge badge-success">Sehat</span>' : '<span class="badge badge-danger">Bermasalah</span>'}</dd>
                <dt>Waktu server</dt><dd class="mono">${esc(window.ui.fmtDateTime(d.database.time))}</dd>
                <dt>Node.js</dt><dd class="mono">${esc(d.node)}</dd>
                <dt>Uptime</dt><dd>${Math.floor(d.uptimeSeconds / 60)} menit ${d.uptimeSeconds % 60} detik</dd>
              </dl></div>
            <div class="card"><h3 style="font-size:15px;margin-bottom:12px">Pemantauan Error API</h3>
              <p class="text-dim" style="font-size:13.5px">Log server terstruktur tersedia bagi operator. Kesalahan teknis tidak pernah ditampilkan di layar pengguna biasa — pengguna selalu menerima pesan singkat berbahasa Indonesia.</p>
            </div></div>`;
        }
      } catch (err) {
        el.innerHTML = `<div class="panel"><p class="text-dim">${esc(err.message)}</p></div>`;
      }
    }
    await paintTab();
  };
})();
