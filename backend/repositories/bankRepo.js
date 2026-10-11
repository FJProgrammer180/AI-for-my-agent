'use strict';
const db = require('../config/db');

async function getConnection(userId, provider = 'MANDIRI') {
  const r = await db.query(
    'SELECT * FROM bank_connections WHERE user_id = $1 AND provider = $2',
    [userId, provider]
  );
  return r.rows[0] || null;
}

async function upsertConnection(userId, provider, fields, client = db) {
  const r = await client.query(
    `INSERT INTO bank_connections (user_id, provider, state, external_id, consent_id,
        access_token_enc, refresh_token_enc, token_expires_at, capabilities, last_sync_at, state_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (user_id, provider) DO UPDATE SET
        state = EXCLUDED.state,
        external_id = EXCLUDED.external_id,
        consent_id = EXCLUDED.consent_id,
        access_token_enc = COALESCE(EXCLUDED.access_token_enc, bank_connections.access_token_enc),
        refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, bank_connections.refresh_token_enc),
        token_expires_at = EXCLUDED.token_expires_at,
        capabilities = EXCLUDED.capabilities,
        last_sync_at = EXCLUDED.last_sync_at,
        state_message = EXCLUDED.state_message,
        updated_at = now()
     RETURNING *`,
    [userId, provider, fields.state, fields.externalId || null, fields.consentId || null,
     fields.accessTokenEnc || null, fields.refreshTokenEnc || null, fields.tokenExpiresAt || null,
     JSON.stringify(fields.capabilities || []), fields.lastSyncAt || null, fields.stateMessage || null]
  );
  return r.rows[0];
}

async function listConnections(userId) {
  const r = await db.query(
    `SELECT id, user_id, provider, state, external_id, consent_id, capabilities,
            last_sync_at, state_message, created_at, updated_at
     FROM bank_connections WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return r.rows;
}

async function findConnectionOwned(id, userId) {
  const r = await db.query(
    'SELECT * FROM bank_connections WHERE id = $1 AND user_id = $2',
    [id, userId]
  );
  return r.rows[0] || null;
}

async function deleteConnection(id, userId) {
  await db.query('DELETE FROM bank_connections WHERE id = $1 AND user_id = $2', [id, userId]);
}

async function upsertAccount(connectionId, userId, acc, client = db) {
  const r = await client.query(
    `INSERT INTO bank_accounts
       (connection_id, user_id, external_id, masked_number, holder_name, account_type, currency,
        balance, available_balance, balance_updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (connection_id, external_id) DO UPDATE SET
        masked_number = EXCLUDED.masked_number,
        holder_name = EXCLUDED.holder_name,
        account_type = EXCLUDED.account_type,
        balance = EXCLUDED.balance,
        available_balance = EXCLUDED.available_balance,
        balance_updated_at = EXCLUDED.balance_updated_at
     RETURNING *`,
    [connectionId, userId, acc.externalId, acc.maskedNumber, acc.holderName || null,
     acc.accountType || null, acc.currency || 'IDR', acc.balance ?? null,
     acc.availableBalance ?? null, acc.balanceUpdatedAt || new Date().toISOString()]
  );
  return r.rows[0];
}

async function listAccounts(userId) {
  const r = await db.query(
    `SELECT a.*, c.provider, c.state AS connection_state
     FROM bank_accounts a JOIN bank_connections c ON c.id = a.connection_id
     WHERE a.user_id = $1 ORDER BY a.created_at`,
    [userId]
  );
  return r.rows;
}

async function findAccountOwned(id, userId) {
  const r = await db.query('SELECT * FROM bank_accounts WHERE id = $1 AND user_id = $2', [id, userId]);
  return r.rows[0] || null;
}

async function totalBalance(userId) {
  const r = await db.query(
    `SELECT COALESCE(sum(a.balance),0)::text AS total
     FROM bank_accounts a JOIN bank_connections c ON c.id = a.connection_id
     WHERE a.user_id = $1 AND c.state = 'CONNECTED'`,
    [userId]
  );
  return Number(r.rows[0].total);
}

async function addBeneficiary(userId, d) {
  const r = await db.query(
    `INSERT INTO beneficiaries (user_id, bank_code, account_number, account_name, alias)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [userId, d.bankCode, d.accountNumber, d.accountName, d.alias || null]
  );
  return r.rows[0];
}

async function listBeneficiaries(userId) {
  const r = await db.query('SELECT * FROM beneficiaries WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
  return r.rows;
}

async function deleteBeneficiary(id, userId) {
  const r = await db.query('DELETE FROM beneficiaries WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
  return r.rows[0] || null;
}

async function createTransfer(userId, d, client = db) {
  const r = await client.query(
    `INSERT INTO transfer_requests
       (user_id, connection_id, source_account_id, beneficiary_id, amount, currency, note, status, provider_ref, failure_reason, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [userId, d.connectionId || null, d.sourceAccountId || null, d.beneficiaryId || null,
     d.amount, d.currency || 'IDR', d.note || null, d.status, d.providerRef || null,
     d.failureReason || null, d.idempotencyKey || null]
  );
  return r.rows[0];
}

async function listTransfers(userId, limit = 25) {
  const r = await db.query(
    `SELECT t.*, b.account_name AS beneficiary_name, b.account_number AS beneficiary_number
     FROM transfer_requests t LEFT JOIN beneficiaries b ON b.id = t.beneficiary_id
     WHERE t.user_id = $1 ORDER BY t.created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return r.rows;
}

module.exports = {
  getConnection, upsertConnection, listConnections, findConnectionOwned, deleteConnection,
  upsertAccount, listAccounts, findAccountOwned, totalBalance,
  addBeneficiary, listBeneficiaries, deleteBeneficiary,
  createTransfer, listTransfers,
};
