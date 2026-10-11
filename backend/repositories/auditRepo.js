'use strict';
const db = require('../config/db');

async function record({ actorId = null, actorRole = null, action, entityType = null, entityId = null, detail = null, ip = null }, client = db) {
  await client.query(
    `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, detail, ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actorId, actorRole, action, entityType, entityId, detail ? JSON.stringify(detail) : null, ip]
  );
}

async function list({ limit = 50, offset = 0 }) {
  const r = await db.query(
    `SELECT a.*, u.email AS actor_email
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return r.rows;
}

module.exports = { record, list };
