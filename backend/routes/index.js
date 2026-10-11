'use strict';
const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/session');
const { authLimiter, sensitiveLimiter, apiLimiter } = require('../middleware/rateLimit');
const { validateBody } = require('../middleware/validate');
const { badRequest } = require('../utils/respond');
const s = require('../validators/schemas');

const auth = require('../controllers/authController');
const onboarding = require('../controllers/onboardingController');
const dashboard = require('../controllers/dashboardController');
const savings = require('../controllers/savingsController');
const installments = require('../controllers/installmentController');
const bank = require('../controllers/bankController');
const transactions = require('../controllers/transactionController');
const market = require('../controllers/marketController');
const notifications = require('../controllers/notificationController');
const profile = require('../controllers/profileController');
const analytics = require('../controllers/analyticsController');
const admin = require('../controllers/adminController');

const router = express.Router();
router.use(apiLimiter);

// Validasi format identifier sebelum menyentuh database (menghindari error 500).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param('id', (req, res, next, val) => {
  if (UUID_RE.test(val)) return next();
  next(badRequest('Format identifier tidak valid.'));
});
router.param('symbol', (req, res, next, val) => {
  if (/^[A-Za-z0-9.\-_]{1,20}$/.test(val)) return next();
  next(badRequest('Format simbol tidak valid.'));
});

// ======================= AUTH =======================
router.post('/auth/register', authLimiter, validateBody(s.registerSchema), auth.register);
router.post('/auth/login', authLimiter, validateBody(s.loginSchema), auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', auth.me);
router.post('/auth/forgot-password', sensitiveLimiter, validateBody(s.forgotSchema), auth.forgotPassword);
router.post('/auth/reset-password', sensitiveLimiter, validateBody(s.resetSchema), auth.resetPassword);
router.post('/auth/verify-email', sensitiveLimiter, validateBody(s.verifyEmailSchema), auth.verifyEmail);
router.post('/auth/resend-verification', sensitiveLimiter, validateBody(s.forgotSchema), auth.resendVerification);

// ======================= ONBOARDING =======================
router.post('/onboarding/complete', requireAuth, validateBody(s.onboardingSchema), onboarding.complete);

// ======================= DASHBOARD =======================
router.get('/dashboard', requireAuth, dashboard.dashboard);

// ======================= SAVINGS =======================
router.get('/savings', requireAuth, savings.list);
router.post('/savings', requireAuth, validateBody(s.savingsCreateSchema), savings.create);
router.get('/savings/:id', requireAuth, savings.detail);
router.put('/savings/:id', requireAuth, validateBody(s.savingsUpdateSchema), savings.update);
router.delete('/savings/:id', requireAuth, savings.archive);
router.post('/savings/:id/deposit', requireAuth, validateBody(s.movementSchema), savings.deposit);
router.post('/savings/:id/withdraw', requireAuth, validateBody(s.movementSchema), savings.withdraw);
router.get('/savings/:id/interest', requireAuth, savings.interest);

// ======================= INTEREST =======================
router.get('/interest/rates', requireAuth, async (req, res, next) => {
  try {
    const interestService = require('../services/interestService');
    res.json({ success: true, data: { rates: await interestService.listRates() } });
  } catch (e) { next(e); }
});
router.get('/interest/history', requireAuth, async (req, res, next) => {
  try {
    const interestService = require('../services/interestService');
    res.json({ success: true, data: { history: await interestService.historyForUser(req.user.id) } });
  } catch (e) { next(e); }
});

// ======================= INSTALLMENTS =======================
router.get('/installments', requireAuth, installments.list);
router.post('/installments', requireAuth, validateBody(s.installmentCreateSchema), installments.create);
router.get('/installments/:id', requireAuth, installments.detail);
router.put('/installments/:id', requireAuth, validateBody(s.installmentUpdateSchema), installments.update);
router.delete('/installments/:id', requireAuth, installments.archive);
router.post('/installments/:id/pay', requireAuth, validateBody(s.paySchema), installments.pay);
router.get('/installments/:id/schedule', requireAuth, installments.schedule);

// ======================= BANKING =======================
router.get('/banks/connections', requireAuth, bank.connections);
router.post('/banks/connect', requireAuth, bank.connect);
router.post('/banks/connect/confirm', requireAuth, bank.confirm);
router.get('/banks/accounts', requireAuth, bank.accounts);
router.get('/banks/accounts/:id', requireAuth, bank.accountDetail);
router.get('/banks/accounts/:id/transactions', requireAuth, bank.accountTransactions);
router.post('/banks/sync', requireAuth, bank.sync);
router.delete('/banks/connections/:id', requireAuth, bank.disconnect);
router.get('/banks/beneficiaries', requireAuth, bank.listBeneficiaries);
router.post('/banks/beneficiaries', requireAuth, validateBody(s.beneficiarySchema), bank.addBeneficiary);
router.delete('/banks/beneficiaries/:id', requireAuth, bank.removeBeneficiary);
router.post('/banks/transfer', requireAuth, validateBody(s.transferSchema), bank.transfer);
router.get('/banks/transfers', requireAuth, bank.listTransfers);

// ======================= TRANSACTIONS =======================
router.get('/transactions', requireAuth, transactions.list);
router.post('/transactions', requireAuth, validateBody(s.transactionCreateSchema), transactions.create);
router.get('/transactions/export/csv', requireAuth, transactions.exportCsv);
router.get('/transactions/:id', requireAuth, transactions.detail);

// ======================= ANALYTICS =======================
router.get('/analytics', requireAuth, analytics.analytics);

// ======================= MARKET =======================
router.get('/market/assets', requireAuth, market.assets);
router.get('/market/quotes/:symbol', requireAuth, market.quote);
router.get('/market/history/:symbol', requireAuth, market.history);
router.get('/market/status', requireAuth, market.status);

// ======================= WATCHLISTS =======================
router.get('/watchlists', requireAuth, market.listWatchlists);
router.post('/watchlists', requireAuth, validateBody(s.watchlistSchema), market.createWatchlist);
router.delete('/watchlists/:id', requireAuth, market.deleteWatchlist);
router.post('/watchlists/:id/items', requireAuth, validateBody(s.watchlistItemSchema), market.addItem);
router.delete('/watchlists/:id/items/:symbol', requireAuth, market.removeItem);

// ======================= ALERTS =======================
router.get('/alerts', requireAuth, market.listAlerts);
router.post('/alerts', requireAuth, validateBody(s.alertSchema), market.createAlert);
router.delete('/alerts/:id', requireAuth, market.deleteAlert);
router.patch('/alerts/:id', requireAuth, market.toggleAlert);

// ======================= NOTIFICATIONS =======================
router.get('/notifications', requireAuth, notifications.list);
router.post('/notifications/read-all', requireAuth, notifications.markAllRead);
router.post('/notifications/:id/read', requireAuth, notifications.markRead);

// ======================= PROFILE & SECURITY =======================
router.get('/profile', requireAuth, profile.getProfile);
router.put('/profile', requireAuth, validateBody(s.profileSchema), profile.updateProfile);
router.post('/profile/change-password', requireAuth, validateBody(s.changePasswordSchema), profile.changePassword);
router.get('/profile/sessions', requireAuth, profile.listSessions);
router.post('/profile/logout-all', requireAuth, profile.logoutAll);
router.delete('/profile/sessions/:id', requireAuth, profile.revokeSession);
router.post('/profile/delete-account', requireAuth, profile.deleteAccount);

// ======================= ADMIN =======================
router.get('/admin/dashboard', requireAdmin, admin.dashboard);
router.get('/admin/users', requireAdmin, admin.users);
router.patch('/admin/users/:id/status', requireAdmin, validateBody(s.adminStatusSchema), admin.setUserStatus);
router.get('/admin/system-health', requireAdmin, admin.systemHealth);
router.get('/admin/audit-logs', requireAdmin, admin.auditLogs);
router.get('/admin/interest-rates', requireAdmin, admin.listRates);
router.post('/admin/interest-rates', requireAdmin, validateBody(s.rateSchema), admin.createRate);
router.post('/admin/market/refresh', requireAdmin, market.refresh);

module.exports = router;
