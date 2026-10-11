/* FINOVA — komponen UI bersama: toast, modal, format, skeleton. */
(function () {
  'use strict';

  const fmtIDR = (n) => {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
    const num = Number(n);
    const sign = num < 0 ? '- ' : '';
    const fixed = Math.abs(num).toFixed(2);
    const parts = fixed.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}Rp ${parts[0]},${parts[1]}`;
  };

  const fmtNum = (n, digits = 0) => {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('id-ID', { maximumFractionDigits: digits, minimumFractionDigits: digits });
  };

  const fmtDate = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
  };

  const fmtDateTime = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    return d.toLocaleString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
    });
  };

  const CATEGORY_LABELS = {
    FOOD: 'Makanan', TRANSPORT: 'Transportasi', EDUCATION: 'Pendidikan',
    SHOPPING: 'Belanja', BILLS: 'Tagihan', SALARY: 'Gaji', SAVINGS: 'Tabungan',
    INTEREST: 'Bunga', INSTALLMENTS: 'Cicilan', TRANSFERS: 'Transfer', OTHER: 'Lainnya',
  };

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ---------- Toast ----------
  function toast(message, type = 'info', ms = 3600) {
    let root = document.getElementById('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      document.body.appendChild(root);
    }
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'success' ? ' toast-success' : type === 'error' ? ' toast-error' : '');
    el.setAttribute('role', 'status');
    el.textContent = message;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(30px)';
      setTimeout(() => el.remove(), 320);
    }, ms);
  }

  // ---------- Modal ----------
  function openModal({ title, subtitle, bodyHtml, actions = [], wide = false }) {
    closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    if (wide) modal.style.width = 'min(720px, 100%)';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      ${subtitle ? `<p class="modal-sub">${escapeHtml(subtitle)}</p>` : ''}
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-actions"></div>`;
    const actionsEl = modal.querySelector('.modal-actions');
    for (const a of actions) {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (a.className || '');
      btn.textContent = a.label;
      btn.type = 'button';
      btn.addEventListener('click', () => a.onClick && a.onClick(modal, btn));
      actionsEl.appendChild(btn);
    }
    backdrop.appendChild(modal);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    document.addEventListener('keydown', escClose);
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('open'));
    const first = modal.querySelector('input, select, textarea, button');
    if (first) setTimeout(() => first.focus(), 60);
    return modal;
  }
  function escClose(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() {
    const b = document.getElementById('modal-backdrop');
    if (b) { b.classList.remove('open'); setTimeout(() => b.remove(), 180); }
    document.removeEventListener('keydown', escClose);
  }

  function confirmModal({ title, message, confirmLabel = 'Ya, lanjutkan', danger = false }) {
    return new Promise((resolve) => {
      openModal({
        title,
        bodyHtml: `<p class="text-dim">${escapeHtml(message)}</p>`,
        actions: [
          { label: 'Batal', className: 'btn-ghost', onClick: () => { closeModal(); resolve(false); } },
          { label: confirmLabel, className: danger ? 'btn-danger' : 'btn-primary', onClick: () => { closeModal(); resolve(true); } },
        ],
      });
    });
  }

  // ---------- Skeleton ----------
  const skeletonCards = (n = 4) =>
    Array.from({ length: n }, () => '<div class="card"><div class="skeleton" style="width:40%"></div><div class="skeleton" style="width:75%;height:26px;margin-top:12px"></div><div class="skeleton" style="width:60%;margin-top:10px"></div></div>').join('');

  function emptyState(icon, title, message) {
    return `<div class="empty-state"><div class="empty-icon">${icon}</div><h4>${escapeHtml(title)}</h4><p>${escapeHtml(message)}</p></div>`;
  }

  /** Tombol dengan status loading anti-dobel-submit. */
  function setBusy(btn, busy, busyLabel = 'Memproses…') {
    if (!btn) return;
    if (busy) {
      btn.dataset.label = btn.textContent;
      btn.textContent = busyLabel;
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
      btn.disabled = false;
    }
  }

  window.ui = {
    fmtIDR, fmtNum, fmtDate, fmtDateTime, CATEGORY_LABELS,
    escapeHtml, toast, openModal, closeModal, confirmModal,
    skeletonCards, emptyState, setBusy,
  };
})();
