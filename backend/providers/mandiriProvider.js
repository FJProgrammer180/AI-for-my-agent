'use strict';
/**
 * Provider integrasi Bank Mandiri (Open Banking / SNAP BI).
 *
 * Dua mode:
 * 1. "live"  : kredensial resmi (MANDIRI_CLIENT_ID/SECRET/BASE_URL) tersedia.
 *              Alur koneksi memakai OAuth2 client/consent flow resmi — FINOVA
 *              TIDAK PERNAH meminta password internet banking, PIN ATM, atau OTP.
 * 2. "snapshot" (default, gratis): membaca snapshot lokal yang tersegel
 *              (mandiri-demo.json) — akun demo yang diberi label jelas "Demo",
 *              dipakai agar modul Rekening tetap dapat dinavigasi tanpa
 *              mengarang koneksi bank sungguhan.
 *
 * Kemampuan (capabilities) dilaporkan secara jujur ke UI. Operasi finansial
 * (transfer, pembayaran) hanya aktif pada mode live dengan scope yang sesuai.
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const logger = require('../utils/logger');

const PROVIDER = 'MANDIRI';

function isLiveConfigured() {
  return !!(env.MANDIRI_CLIENT_ID && env.MANDIRI_CLIENT_SECRET && env.MANDIRI_BASE_URL);
}

function loadSnapshot() {
  try {
    const p = path.resolve(env.MANDIRI_SNAPSHOT_PATH);
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    logger.error('Snapshot Mandiri tidak dapat dibaca', { error: err.message });
    return null;
  }
}

function capabilities() {
  if (isLiveConfigured()) {
    // Diaktifkan hanya bila kredensial resmi tersedia. Scope detail mengikuti
    // persetujuan consent dari bank.
    return ['ACCOUNTS', 'BALANCES', 'TRANSACTIONS'];
  }
  return ['ACCOUNTS', 'BALANCES', 'TRANSACTIONS']; // snapshot demo — read-only, berlabel Demo
}

function mode() {
  return isLiveConfigured() ? 'LIVE' : 'SNAPSHOT';
}

/**
 * Memulai alur koneksi.
 * Live: mengembalikan URL otorisasi resmi (pengguna menyetujui di sisi bank).
 * Snapshot: mengembalikan consent demo internal.
 */
async function beginConnection(user) {
  if (isLiveConfigured()) {
    const state = `${user.id}:${Date.now()}`;
    const url = new URL('/oauth/authorize', env.MANDIRI_BASE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', env.MANDIRI_CLIENT_ID);
    url.searchParams.set('redirect_uri', `${env.PUBLIC_URL}/api/banks/callback`);
    url.searchParams.set('scope', 'accounts.read balances.read transactions.read');
    url.searchParams.set('state', state);
    return { kind: 'REDIRECT', url: url.toString(), state };
  }
  const snapshot = loadSnapshot();
  if (!snapshot) {
    return { kind: 'ERROR', message: 'Layanan koneksi rekening sedang tidak tersedia.' };
  }
  return {
    kind: 'CONSENT_DEMO',
    message: 'Mode demo: FINOVA akan menghubungkan akun contoh berlabel "Demo" agar kamu bisa menjelajahi fitur Rekening. Bukan rekening asli.',
    accountsPreview: snapshot.accounts.map((a) => ({ maskedNumber: a.maskedNumber, accountType: a.accountType })),
  };
}

/**
 * Menyelesaikan koneksi setelah pengguna menyetujui consent.
 * Mengembalikan data koneksi + akun untuk disimpan (token dienkripsi).
 */
async function completeConnection(user) {
  if (isLiveConfigured()) {
    // Implementasi pertukaran code->token dilakukan pada callback OAuth.
    // Placeholder ini tidak akan dipanggil tanpa code yang sah.
    throw new Error('Gunakan alur callback OAuth resmi untuk mode live.');
  }
  const snapshot = loadSnapshot();
  if (!snapshot) throw new Error('Snapshot tidak tersedia.');
  return {
    provider: PROVIDER,
    externalId: 'snapshot-mandiri',
    consentId: `demo-consent-${user.id}`,
    capabilities: capabilities(),
    accounts: snapshot.accounts,
    transactions: snapshot.transactions,
    tokenExpiresAt: null,
    accessToken: null,
    refreshToken: null,
  };
}

async function fetchTransactions(accountExternalId) {
  const snapshot = loadSnapshot();
  if (!snapshot) return [];
  return (snapshot.transactions && snapshot.transactions[accountExternalId]) || [];
}

module.exports = { PROVIDER, mode, capabilities, isLiveConfigured, beginConnection, completeConnection, fetchTransactions };
