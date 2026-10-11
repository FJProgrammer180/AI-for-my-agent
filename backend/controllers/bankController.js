'use strict';
const db = require('../config/db');
const bankRepo = require('../repositories/bankRepo');
const transactionRepo = require('../repositories/transactionRepo');
const notificationRepo = require('../repositories/notificationRepo');
const auditRepo = require('../repositories/auditRepo');
const provider = require('../providers/mandiriProvider');
const { encryptSecret } = require('../utils/crypto');
const { ok, notFound, badRequest, ApiError } = require('../utils/respond');

const STATE_MESSAGES = {
  NOT_CONNECTED: 'Rekening Mandiri belum dihubungkan.',
  IN_PROGRESS: 'Proses penghubungan rekening sedang berjalan.',
  CONNECTED: 'Rekening berhasil dihubungkan.',
  EXPIRED: 'Hubungkan kembali rekeningmu untuk melanjutkan.',
  UNAVAILABLE: 'Layanan bank sedang tidak tersedia sementara.',
  ERROR: 'Koneksi rekening sedang mengalami kendala.',
};

function sanitizeConnection(c) {
  if (!c) return null;
  return {
    id: c.id, provider: c.provider, state: c.state,
    stateMessage: STATE_MESSAGES[c.state] || c.state_message,
    capabilities: c.capabilities, lastSyncAt: c.last_sync_at,
    mode: provider.mode(), createdAt: c.created_at,
  };
}

async function connections(req, res, next) {
  try {
    const rows = await bankRepo.listConnections(req.user.id);
    const existing = rows.find((c) => c.provider === provider.PROVIDER);
    ok(res, {
      connection: existing ? sanitizeConnection(existing) : {
        provider: provider.PROVIDER, state: 'NOT_CONNECTED',
        stateMessage: STATE_MESSAGES.NOT_CONNECTED,
        capabilities: [], mode: provider.mode(),
      },
      providerMode: provider.mode(),
    });
  } catch (err) { next(err); }
}

/** Mulai alur koneksi resmi (redirect OAuth) atau consent demo. */
async function connect(req, res, next) {
  try {
    const started = await provider.beginConnection(req.user);
    if (started.kind === 'ERROR') {
      await bankRepo.upsertConnection(req.user.id, provider.PROVIDER, {
        state: 'UNAVAILABLE', stateMessage: started.message, capabilities: [],
      });
      throw new ApiError(503, 'BANK_UNAVAILABLE', 'Layanan koneksi rekening sedang tidak tersedia. Coba lagi nanti.');
    }
    if (started.kind === 'REDIRECT') {
      await bankRepo.upsertConnection(req.user.id, provider.PROVIDER, {
        state: 'IN_PROGRESS', consentId: started.state, capabilities: provider.capabilities(),
      });
      return ok(res, { kind: 'REDIRECT', url: started.url });
    }
    ok(res, { kind: started.kind, message: started.message, accountsPreview: started.accountsPreview });
  } catch (err) { next(err); }
}

/** Selesaikan consent demo (atau dipanggil dari callback OAuth mode live). */
async function confirm(req, res, next) {
  try {
    const data = await provider.completeConnection(req.user);
    const result = await db.withTransaction(async (client) => {
      const conn = await bankRepo.upsertConnection(req.user.id, provider.PROVIDER, {
        state: 'CONNECTED',
        externalId: data.externalId,
        consentId: data.consentId,
        accessTokenEnc: data.accessToken ? encryptSecret(data.accessToken) : null,
        refreshTokenEnc: data.refreshToken ? encryptSecret(data.refreshToken) : null,
        tokenExpiresAt: data.tokenExpiresAt,
        capabilities: data.capabilities,
        lastSyncAt: new Date().toISOString(),
      }, client);
      const accounts = [];
      for (const a of data.accounts) {
        accounts.push(await bankRepo.upsertAccount(conn.id, req.user.id, a, client));
      }
      // Sinkron transaksi awal
      for (const a of accounts) {
        const txs = await provider.fetchTransactions(a.external_id);
        for (const t of txs) {
          await transactionRepo.create(req.user.id, {
            type: t.direction === 'CREDIT' ? 'INCOME' : 'EXPENSE',
            category: t.category || 'OTHER',
            amount: t.amount,
            occurredAt: t.date,
            description: t.description,
            source: 'BANK_SYNC',
            bankAccountId: a.id,
            externalRef: t.externalRef,
          }, client);
        }
      }
      await notificationRepo.create(req.user.id, {
        type: 'BANK',
        title: 'Rekening terhubung',
        body: provider.mode() === 'LIVE'
          ? 'Rekening Mandiri berhasil dihubungkan.'
          : 'Akun demo Mandiri (berlabel "Demo") terhubung. Ini bukan rekening asli.',
      }, client);
      await auditRepo.record({
        actorId: req.user.id, actorRole: req.user.role, action: 'BANK_CONNECTED',
        entityType: 'bank_connection', entityId: conn.id,
        detail: { provider: provider.PROVIDER, mode: provider.mode() }, ip: req.ip,
      }, client);
      return { conn, accounts };
    });
    ok(res, { connection: sanitizeConnection(result.conn), accounts: result.accounts });
  } catch (err) { next(err); }
}

async function accounts(req, res, next) {
  try {
    const rows = await bankRepo.listAccounts(req.user.id);
    ok(res, {
      accounts: rows.map((a) => ({
        id: a.id, provider: a.provider, maskedNumber: a.masked_number,
        holderName: a.holder_name, accountType: a.account_type, currency: a.currency,
        balance: a.balance === null ? null : Number(a.balance),
        availableBalance: a.available_balance === null ? null : Number(a.available_balance),
        balanceUpdatedAt: a.balance_updated_at,
        connectionState: a.connection_state,
        isDemo: a.connection_state === 'CONNECTED' && provider.mode() !== 'LIVE',
      })),
    });
  } catch (err) { next(err); }
}

async function accountDetail(req, res, next) {
  try {
    const a = await bankRepo.findAccountOwned(req.params.id, req.user.id);
    if (!a) throw notFound('Rekening tidak ditemukan.');
    ok(res, {
      account: {
        id: a.id, maskedNumber: a.masked_number, holderName: a.holder_name,
        accountType: a.account_type, currency: a.currency,
        balance: a.balance === null ? null : Number(a.balance),
        availableBalance: a.available_balance === null ? null : Number(a.available_balance),
        balanceUpdatedAt: a.balance_updated_at,
      },
    });
  } catch (err) { next(err); }
}

async function accountTransactions(req, res, next) {
  try {
    const a = await bankRepo.findAccountOwned(req.params.id, req.user.id);
    if (!a) throw notFound('Rekening tidak ditemukan.');
    const r = await transactionRepo.list(req.user.id, {
      limit: parseInt(req.query.limit || '25', 10),
      offset: parseInt(req.query.offset || '0', 10),
    });
    const rows = r.rows.filter((t) => t.bank_account_id === a.id);
    ok(res, { transactions: rows });
  } catch (err) { next(err); }
}

/** Sinkronisasi ulang dari provider. */
async function sync(req, res, next) {
  try {
    const conn = await bankRepo.getConnection(req.user.id, provider.PROVIDER);
    if (!conn || conn.state !== 'CONNECTED') {
      throw badRequest('Rekening belum terhubung. Hubungkan dulu untuk melakukan sinkronisasi.');
    }
    const accounts = await bankRepo.listAccounts(req.user.id);
    let imported = 0;
    await db.withTransaction(async (client) => {
      for (const a of accounts) {
        const txs = await provider.fetchTransactions(a.external_id);
        if (!txs.length) continue;
        // Saring referensi yang sudah ada agar tidak ada statement gagal di tengah transaksi.
        const refs = txs.map((t) => t.externalRef).filter(Boolean);
        const seen = await client.query(
          `SELECT external_ref FROM financial_transactions
           WHERE user_id = $1 AND bank_account_id = $2 AND external_ref = ANY($3::text[])`,
          [req.user.id, a.id, refs]
        );
        const known = new Set(seen.rows.map((r) => r.external_ref));
        for (const t of txs) {
          if (t.externalRef && known.has(t.externalRef)) continue;
          await transactionRepo.create(req.user.id, {
            type: t.direction === 'CREDIT' ? 'INCOME' : 'EXPENSE',
            category: t.category || 'OTHER', amount: t.amount, occurredAt: t.date,
            description: t.description, source: 'BANK_SYNC',
            bankAccountId: a.id, externalRef: t.externalRef,
          }, client);
          imported++;
        }
      }
      await client.query(
        'UPDATE bank_connections SET last_sync_at = now() WHERE id = $1',
        [conn.id]
      );
      await notificationRepo.create(req.user.id, {
        type: 'BANK_SYNC',
        title: 'Sinkronisasi rekening selesai',
        body: imported > 0 ? `${imported} transaksi baru berhasil disinkronkan.` : 'Tidak ada transaksi baru.',
      }, client);
    });
    ok(res, { imported, lastSyncAt: new Date().toISOString() });
  } catch (err) { next(err); }
}

async function disconnect(req, res, next) {
  try {
    const conn = await bankRepo.findConnectionOwned(req.params.id, req.user.id);
    if (!conn) throw notFound('Koneksi tidak ditemukan.');
    await bankRepo.deleteConnection(conn.id, req.user.id);
    await auditRepo.record({
      actorId: req.user.id, actorRole: req.user.role, action: 'BANK_DISCONNECTED',
      entityType: 'bank_connection', entityId: conn.id, ip: req.ip,
    });
    ok(res, { disconnected: true });
  } catch (err) { next(err); }
}

async function listBeneficiaries(req, res, next) {
  try {
    ok(res, { beneficiaries: await bankRepo.listBeneficiaries(req.user.id) });
  } catch (err) { next(err); }
}

async function addBeneficiary(req, res, next) {
  try {
    const b = await bankRepo.addBeneficiary(req.user.id, req.body);
    ok(res, { beneficiary: b }, 201);
  } catch (err) { next(err); }
}

async function removeBeneficiary(req, res, next) {
  try {
    const b = await bankRepo.deleteBeneficiary(req.params.id, req.user.id);
    if (!b) throw notFound('Penerima tidak ditemukan.');
    ok(res, { deleted: true });
  } catch (err) { next(err); }
}

/**
 * Permintaan transfer — hanya diproses bila provider benar-benar mendukungnya.
 * Pada mode snapshot/demo, transfer TIDAK disimulasikan: ditolak dengan jelas.
 */
async function transfer(req, res, next) {
  try {
    const conn = await bankRepo.getConnection(req.user.id, provider.PROVIDER);
    if (!conn || conn.state !== 'CONNECTED') {
      throw badRequest('Rekening belum terhubung. Hubungkan rekening untuk melakukan transfer.');
    }
    const caps = Array.isArray(conn.capabilities) ? conn.capabilities : [];
    if (!caps.includes('TRANSFER')) {
      throw new ApiError(422, 'TRANSFER_UNAVAILABLE',
        'Transfer belum tersedia untuk koneksi ini. Fitur akan aktif setelah izin resmi dari bank diberikan.');
    }
    // Mode live dengan scope TRANSFER: kirim ke API resmi di sini.
    throw new ApiError(503, 'TRANSFER_UNAVAILABLE', 'Layanan transfer sedang tidak tersedia.');
  } catch (err) { next(err); }
}

async function listTransfers(req, res, next) {
  try {
    ok(res, { transfers: await bankRepo.listTransfers(req.user.id) });
  } catch (err) { next(err); }
}

module.exports = {
  connections, connect, confirm, accounts, accountDetail, accountTransactions,
  sync, disconnect, listBeneficiaries, addBeneficiary, removeBeneficiary,
  transfer, listTransfers, STATE_MESSAGES,
};
