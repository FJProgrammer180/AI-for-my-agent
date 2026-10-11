'use strict';
const { badRequest } = require('../utils/respond');

/**
 * Validasi body request dengan skema Zod.
 * Mengembalikan 400 dengan pesan Indonesia.
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body || {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(badRequest(details[0].message || 'Permintaan tidak valid.', details));
    }
    req.body = result.data;
    next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query || {});
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        field: i.path.join('.'),
        message: i.message,
      }));
      return next(badRequest(details[0].message || 'Parameter tidak valid.', details));
    }
    req.query = result.data;
    next();
  };
}

module.exports = { validateBody, validateQuery };
