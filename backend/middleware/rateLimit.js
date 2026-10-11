'use strict';
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const jsonHandler = (req, res) => {
  res.status(429).json({
    success: false,
    error: { code: 'RATE_LIMITED', message: 'Terlalu banyak percobaan. Coba lagi beberapa saat.' },
  });
};

const win = env.RATE_LIMIT_WINDOW_MS;

const authLimiter = rateLimit({
  windowMs: win, limit: env.RATE_LIMIT_AUTH_MAX,
  standardHeaders: true, legacyHeaders: false, handler: jsonHandler,
});

const sensitiveLimiter = rateLimit({
  windowMs: win, limit: env.RATE_LIMIT_SENSITIVE_MAX,
  standardHeaders: true, legacyHeaders: false, handler: jsonHandler,
});

const apiLimiter = rateLimit({
  windowMs: win, limit: env.RATE_LIMIT_API_MAX,
  standardHeaders: true, legacyHeaders: false, handler: jsonHandler,
});

module.exports = { authLimiter, sensitiveLimiter, apiLimiter };
