require('dotenv').config();

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const { AppError } = require('./lib/errors');
const { TEMPLATE_VERSION, TEMPLATE_REPO } = require('./lib/version');
const { globalLimiter, storefrontLimiter } = require('./middleware/rateLimiter');
const { requireAuth } = require('./middleware/auth');
const { adminAuth } = require('./admin/middleware/adminAuth');

const app = express();
const PORT = parseInt(process.env.PORT) || 3001;

// ─── Trust proxy (Railway/Vercel/ALB ficam na frente).
// Sem isto, req.ip = IP do proxy → os rate limiters por IP viram globais e os
// audit logs gravam o IP do proxy. O valor 1 confia no primeiro hop.
app.set('trust proxy', 1);

// ─── Security headers
app.use(helmet());

// ─── CORS
const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.ADMIN_FRONTEND_URL,
].filter(Boolean);

app.use((req, res, next) => {
  // /storefront/* é chamado pelo widget publico a partir do dominio da
  // vitrine (qualquer loja instalada, dominio desconhecido de antemao) — sem
  // credenciais, entao CORS aberto e seguro. Nao usa o allowlist abaixo.
  if (req.path.startsWith('/storefront')) {
    return cors()(req, res, next);
  }
  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })(req, res, next);
});

// ─── Webhook Stripe: raw body, ANTES do express.json e SEM o rate limit global
// (eventos do Stripe são verificados por assinatura e não devem ser throttled).
const webhookRouter = require('./routes/webhook');
app.use('/webhook', express.raw({ type: 'application/json' }), webhookRouter);

// ─── Rate limiter (global) — aplicado após o webhook Stripe
app.use(globalLimiter);

// ─── Body parsing (após o webhook). O `verify` captura o raw body, usado para
// validar o HMAC dos webhooks da Nuvemshop (/webhooks/*).
app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));

// ─── Widget publico da vitrine (public/widget.js). Servido dinamicamente
// (nao estatico) para injetar a URL real do backend no lugar do placeholder
// __API_ORIGIN__ — necessario pois a Nuvemshop serve o arquivo pelo proprio
// CDN (apps-scripts.tiendanube.com), entao a origem do <script src> no
// navegador nao e a nossa. Nao precisa de CORS (carregado via <script src>).
const fs = require('fs');
let widgetJsCache = null;
app.get('/widget.js', (req, res) => {
  if (!widgetJsCache) {
    const raw = fs.readFileSync(path.join(__dirname, '../public/widget.js'), 'utf8');
    widgetJsCache = raw.replaceAll('__API_ORIGIN__', process.env.BACKEND_URL || '');
  }
  res.type('application/javascript').send(widgetJsCache);
});
app.use(express.static(path.join(__dirname, '../public')));

// ─── Health check
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    app: process.env.APP_NAME || 'NuvemProApp',
    env: process.env.NODE_ENV || 'development',
    templateVersion: TEMPLATE_VERSION,
    templateRepo: TEMPLATE_REPO,
    backendUrl: process.env.BACKEND_URL || null,
    timestamp: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════
// APP ROUTES (tenant-facing)
// ═══════════════════════════════════════════

const authRouter = require('./routes/auth');
const billingRouter = require('./routes/billing');
const termsRouter = require('./routes/terms');
const profileRouter = require('./routes/profile');
const supportRouter = require('./routes/support');
const nuvemshopWebhooksRouter = require('./routes/nuvemshopWebhooks');
const translationsRouter = require('./routes/translations');
const analyticsRouter = require('./routes/analytics');
const storefrontRouter = require('./routes/storefront');

app.use('/auth', authRouter);
app.use('/api/billing', billingRouter);
app.use('/api/terms', termsRouter);
app.use('/api/profile', profileRouter);
app.use('/api/support', supportRouter);
app.use('/api/translations', translationsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/webhooks', nuvemshopWebhooksRouter);

// ─── Storefront (widget publico) — chamado por compradores anonimos em
// qualquer dominio de vitrine Nuvemshop; CORS aberto tratado no middleware
// global de CORS acima (path /storefront).
app.use('/storefront', storefrontLimiter, storefrontRouter);

// ═══════════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════════

const adminAuthRouter = require('./admin/routes/adminAuth');
const adminPlansRouter = require('./admin/routes/adminPlans');
const adminCustomersRouter = require('./admin/routes/adminCustomers');
const adminSubscriptionsRouter = require('./admin/routes/adminSubscriptions');
const adminCouponsRouter = require('./admin/routes/adminCoupons');
const adminCommissionsRouter = require('./admin/routes/adminCommissions');
const adminTermsRouter = require('./admin/routes/adminTerms');
const adminFaqRouter = require('./admin/routes/adminFaq');
const adminLogsRouter = require('./admin/routes/adminLogs');
const adminSecurityRouter = require('./admin/routes/adminSecurity');
const adminConfigRouter = require('./admin/routes/adminConfig');
const adminTemplateRouter = require('./admin/routes/adminTemplate');
const adminSupportRouter = require('./admin/routes/adminSupport');

// Admin health (no auth)
app.get('/admin-api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'admin-api',
    templateVersion: TEMPLATE_VERSION,
    templateRepo: TEMPLATE_REPO,
    timestamp: new Date().toISOString(),
  });
});

// Admin auth routes (login does not require adminAuth)
app.use('/admin-api/auth', adminAuthRouter);

// All other admin routes require adminAuth
app.use('/admin-api/plans', adminAuth, adminPlansRouter);
app.use('/admin-api/customers', adminAuth, adminCustomersRouter);
app.use('/admin-api/subscriptions', adminAuth, adminSubscriptionsRouter);
app.use('/admin-api/coupons', adminAuth, adminCouponsRouter);
app.use('/admin-api/commissions', adminAuth, adminCommissionsRouter);
app.use('/admin-api/terms', adminAuth, adminTermsRouter);
app.use('/admin-api/faq', adminAuth, adminFaqRouter);
app.use('/admin-api/logs', adminAuth, adminLogsRouter);
app.use('/admin-api/security', adminAuth, adminSecurityRouter);
app.use('/admin-api/config', adminAuth, adminConfigRouter);
app.use('/admin-api/template', adminAuth, adminTemplateRouter);
app.use('/admin-api/support', adminAuth, adminSupportRouter);

// ═══════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Rota nao encontrada.',
    code: 'NOT_FOUND',
    path: req.originalUrl,
  });
});

// Global error handler
app.use((err, req, res, _next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: err.message,
      code: err.code,
      status: err.status,
    });
  }

  // Prisma known errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      error: 'Registro duplicado.',
      code: 'DUPLICATE_ENTRY',
      status: 409,
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      error: 'Registro nao encontrado.',
      code: 'NOT_FOUND',
      status: 404,
    });
  }

  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'Origem nao permitida.',
      code: 'CORS_ERROR',
      status: 403,
    });
  }

  console.error('Unhandled error:', err);

  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor.'
      : err.message,
    code: 'INTERNAL_ERROR',
    status: 500,
  });
});

// ─── Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

module.exports = app;
