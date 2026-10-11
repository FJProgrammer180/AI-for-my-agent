'use strict';
/**
 * Saluran realtime FINOVA (WebSocket).
 *
 * Prinsip: kanal ini hanya menyampaikan data yang ASLI — notifikasi yang sudah
 * tersimpan di database dan kuotasi pasar hasil penyedia data. Tidak pernah
 * dipakai untuk mengarang peristiwa atau harga.
 *
 * Autentikasi: klien harus memiliki cookie sesi yang sah (diverifikasi di server).
 */
const WebSocket = require('ws');
const db = require('../config/db');
const { sha256 } = require('../utils/crypto');
const env = require('../config/env');
const logger = require('../utils/logger');

const clients = new Set(); // { ws, userId }

function parseCookie(header, name) {
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

async function authenticate(req) {
  const token = parseCookie(req.headers.cookie, 'finova_session');
  if (!token) return null;
  const r = await db.query(
    `SELECT u.id, u.role FROM user_sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.status = 'ACTIVE'`,
    [sha256(token)]
  );
  return r.rows[0] || null;
}

const HINT_TTL_MS = 1500; // penanda "baru saja di-commit"

function send(ws, type, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify({ type, payload, at: new Date().toISOString() })); } catch (_) { /* diamkan */ }
}

/**
 * Sinyal "ada perubahan notifikasi" untuk satu pengguna.
 * Dipanggil setelah COMMIT transaksi sehingga never notifies about rolled-back work.
 */
const pending = new Map(); // userId -> timeout

function flushHint(userId) {
  pending.delete(userId);
  let n = 0;
  for (const c of clients) {
    if (c.userId === userId) { send(c.ws, 'notifications:changed', { userId }); n++; }
  }
  return n;
}

function notifyUser(userId) {
  if (pending.has(userId)) return 0; // gabung isyarat dalam jendela singkat
  const t = setTimeout(() => flushHint(userId), HINT_TTL_MS);
  t.unref?.();
  pending.set(userId, t);
  return 1;
}

/** Siarkan pembaruan kuotasi ke pelanggan simbol terkait. */
function broadcastQuotes(quotes) {
  for (const c of clients) send(c.ws, 'quotes', quotes);
}

function attach(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    let user = null;
    try { user = await authenticate(req); } catch (err) {
      logger.error('Autentikasi websocket gagal', { error: err.message });
    }
    if (!user) {
      send(ws, 'error', { code: 'UNAUTHORIZED', message: 'Sesi tidak valid. Muat ulang halaman.' });
      ws.close(1008, 'unauthorized');
      return;
    }
    const entry = { ws, userId: user.id, subs: new Set() };
    clients.add(entry);
    send(ws, 'ready', { userId: user.id });

    ws.on('message', async (buf) => {
      let msg;
      try { msg = JSON.parse(buf.toString('utf8')); } catch (_) { return; }
      if (msg.type === 'subscribe' && Array.isArray(msg.symbols)) {
        msg.symbols.slice(0, 40).forEach((s) => entry.subs.add(String(s).toUpperCase()));
        send(ws, 'subscribed', { symbols: [...entry.subs] });
      } else if (msg.type === 'ping') {
        send(ws, 'pong', {});
      }
    });

    ws.on('close', () => clients.delete(entry));
    ws.on('error', () => clients.delete(entry));
  });

  // heartbeat sederhana untuk membuang koneksi mati
  const timer = setInterval(() => {
    for (const c of clients) {
      if (c.ws.readyState !== WebSocket.OPEN) { clients.delete(c); continue; }
      try { c.ws.ping(); } catch (_) { clients.delete(c); }
    }
  }, 30000);
  timer.unref?.();

  const handle = {
    wss,
    notifyUser,
    broadcastQuotes,
    clientCount: () => clients.size,
    close() {
      clearInterval(timer);
      for (const c of clients) { try { c.ws.terminate(); } catch (_) { /* diamkan */ } }
      clients.clear();
      for (const c of wss.clients) { try { c.terminate(); } catch (_) { /* diamkan */ } }
      wss.close();
      clearInterval(timer);
    },
  };
  module.exports.handle = handle; // agar modul lain (mis. repositori notifikasi) dapat menyiarkan
  return handle;
}

module.exports = { attach, handle: null };
