'use strict';
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const env = require('./config/env');
const session = require('./middleware/session');
const { notFoundHandler, errorHandler } = require('./middleware/error');
const apiRoutes = require('./routes');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  app.use(express.json({ limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '256kb' }));

  // CORS: hanya origin aplikasi itu sendiri (same-origin deployment)
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', env.PUBLIC_URL);
    res.setHeader('Vary', 'Origin');
    next();
  });

  app.use(session.attachSession);
  app.use('/api', session.csrfProtection);
  app.use('/api', apiRoutes);

  // Static frontend — tanpa cache pada development agar perubahan CSS/JS langsung terlihat
  const frontendDir = path.join(__dirname, '..', 'frontend');
  app.use(express.static(frontendDir, {
    index: false,
    maxAge: env.IS_PROD ? '1h' : 0,
    etag: true,
  }));

  // Halaman publik
  const page = (file) => (req, res) => res.sendFile(path.join(frontendDir, 'pages', file));
  app.get('/', page('landing.html'));
  app.get('/register', page('register.html'));
  app.get('/login', page('login.html'));
  app.get('/forgot-password', page('forgot-password.html'));
  app.get('/reset-password', page('reset-password.html'));
  app.get('/verify-account', page('verify-account.html'));

  // Halaman aplikasi (shell SPA)
  const appPages = [
    'dashboard', 'savings', 'interest', 'installments', 'banking', 'transactions',
    'analytics', 'market', 'watchlist', 'alerts', 'notifications', 'profile',
    'security', 'onboarding', 'admin',
  ];
  for (const p of appPages) {
    app.get(`/${p}`, (req, res) => res.sendFile(path.join(frontendDir, 'pages', 'app.html')));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
