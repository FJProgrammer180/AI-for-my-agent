'use strict';
const db = require('../config/db');
const { randomUUID } = require('crypto');

/**
 * Ledger internal FINOVA.
 * Konvensi: jumlah debit (+) dan kredit (-) harus berjumlah nol per transaksi.
 */

async function ensureAccount(userId, code, name, type, client = db) {
  const r = await client.query(
    `INSERT INTO ledger_accounts (user_id, code, name, type)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id, code) DO UPDATE SET name = EXCLUDED.name
     RETURNING *`,
    [userId, code, name, type]
  );
  return r.rows[0];
}

async function getAccount(userId, code, client = db) {
  const r = await client.query(
    'SELECT * FROM ledger_accounts WHERE user_id IS NOT DISTINCT FROM $1 AND code = $2',
    [userId, code]
  );
  return r.rows[0] || null;
}

/**
 * Catat transaksi ledger seimbang.
 * entries: [{ accountId, amount }] — total amount HARUS 0.
 */
async function recordTransaction(userId, description, entries, reference = null, client = db) {
  const total = entries.reduce((s, e) => s + Number(e.amount), 0);
  if (Math.abs(total) > 0.004) {
    throw new Error(`Ledger tidak seimbang (total=${total}).`);
  }
  const ref = reference || `FIN-${randomUUID()}`;
  const tx = await client.query(
    'INSERT INTO ledger_transactions (reference, user_id, description) VALUES ($1,$2,$3) RETURNING *',
    [ref, userId, description]
  );
  for (const e of entries) {
    await client.query(
      'INSERT INTO ledger_entries (transaction_id, account_id, amount) VALUES ($1,$2,$3)',
      [tx.rows[0].id, e.accountId, e.amount]
    );
  }
  return tx.rows[0];
}

async function balance(userId, code) {
  const acc = await getAccount(userId, code);
  if (!acc) return 0;
  const r = await db.query(
    `SELECT COALESCE(sum(e.amount),0)::text AS balance
     FROM ledger_entries e
     JOIN ledger_transactions t ON t.id = e.transaction_id
     WHERE e.account_id = $1`,
    [acc.id]
  );
  return Number(r.rows[0].balance);
}

async function userAccounts(userId) {
  const r = await db.query(
    `SELECT a.*, COALESCE((SELECT sum(e.amount) FROM ledger_entries e
        JOIN ledger_transactions t ON t.id = e.transaction_id
        WHERE e.account_id = a.id),0)::text AS balance
     FROM ledger_accounts a WHERE a.user_id = $1 ORDER BY a.code`,
    [userId]
  );
  return r.rows;
}

module.exports = { ensureAccount, getAccount, recordTransaction, balance, userAccounts };
