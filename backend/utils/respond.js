'use strict';
/** Format respons JSON yang konsisten. */

function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

function fail(res, status, code, message, details) {
  const body = { success: false, error: { code, message } };
  if (details) body.error.details = details;
  res.status(status).json(body);
}

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (msg = 'Permintaan tidak valid.', details) =>
  new ApiError(400, 'INVALID_REQUEST', msg, details);
const unauthorized = (msg = 'Sesi tidak valid. Silakan masuk kembali.') =>
  new ApiError(401, 'UNAUTHORIZED', msg);
const forbidden = (msg = 'Kamu tidak memiliki akses ke fitur ini.') =>
  new ApiError(403, 'FORBIDDEN', msg);
const notFound = (msg = 'Data tidak ditemukan.') =>
  new ApiError(404, 'NOT_FOUND', msg);
const conflict = (msg = 'Data sudah ada.') =>
  new ApiError(409, 'CONFLICT', msg);
const tooMany = (msg = 'Terlalu banyak percobaan. Coba lagi beberapa saat.') =>
  new ApiError(429, 'RATE_LIMITED', msg);

module.exports = { ok, fail, ApiError, badRequest, unauthorized, forbidden, notFound, conflict, tooMany };
