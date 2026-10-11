'use strict';
const logger = require('../utils/logger');
const { fail, ApiError } = require('../utils/respond');

function notFoundHandler(req, res, next) {
  if (req.path.startsWith('/api/')) {
    return fail(res, 404, 'NOT_FOUND', 'Data tidak ditemukan.');
  }
  next();
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return fail(res, err.status, err.code, err.message, err.details);
  }
  if (err && err.type === 'entity.too.large') {
    return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Ukuran permintaan terlalu besar.');
  }
  if (err && (err.code === 'LIMIT_FILE_SIZE')) {
    return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Ukuran berkas terlalu besar.');
  }
  logger.error('Kesalahan server tak terduga', {
    path: req.path,
    method: req.method,
    error: err.message,
    stack: err.stack,
  });
  fail(res, 500, 'INTERNAL_ERROR', 'Terjadi kendala pada server. Silakan coba lagi.');
}

module.exports = { notFoundHandler, errorHandler };
