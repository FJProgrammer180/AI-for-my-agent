'use strict';
const db = require('../config/db');

async function create(userId, { type, title, body }, client = db) {
  const r = await client.query(
    `INSERT INTO notifications (user_id, type, title, body) VALUES ($1,$2,$3,$4) RETURNING *`,
    [userId, type, title, body]
  );
  const row = r.rows[0];
  // Antarmuka realtime bersifat opsional: kegagalan kirim tidak boleh membatalkan
  // operasi keuangan, dan data tetap tersimpan di database.
  try {
    const ws = require('../websocket');
    // Kirim isyarat, bukan isi: klien mengambil ulang dari API sehingga data yang
    // belum commit (transaksi dibatalkan) tidak pernah tampil sebagai kenyataan.
    if (ws.handle) ws.handle.notifyUser(userId, { id: row.id, type: row.type });
  } catch (_) { /* kanal belum aktif */ }
  return row;
}

async function list(userId, { limit = 25, offset = 0, unreadOnly = false } = {}) {
  const r = await db.query(
    `SELECT * FROM notifications WHERE user_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  const c = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE read_at IS NULL)::int AS unread
     FROM notifications WHERE user_id = $1`,
    [userId]
  );
  return { rows: r.rows, total: c.rows[0].total, unread: c.rows[0].unread };
}

async function markRead(id, userId) {
  const r = await db.query(
    'UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL RETURNING id',
    [id, userId]
  );
  return r.rows[0] || null;
}

async function markAllRead(userId) {
  await db.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
}

module.exports = { create, list, markRead, markAllRead };
