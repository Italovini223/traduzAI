const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { exchangeCodeForToken, fetchStoreInfo } = require('../config/nuvemshop');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

/**
 * GET /auth/callback — Nuvemshop OAuth callback
 */
router.get('/callback', authLimiter, async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) {
      throw new AppError('Codigo de autorizacao nao fornecido.', 400, 'MISSING_CODE');
    }

    // Exchange code for token
    const { accessToken, userId } = await exchangeCodeForToken(code);

    // Fetch store info from Nuvemshop
    let storeInfo;
    try {
      storeInfo = await fetchStoreInfo(userId, accessToken);
    } catch (err) {
      storeInfo = {};
    }

    // Lê configuração de trial do AdminConfig (fallback para TRIAL_DAYS do .env)
    let trialDays = parseInt(process.env.TRIAL_DAYS) || 7;
    try {
      const trialConfigs = await prisma.adminConfig.findMany({
        where: { key: { in: ['trial_mode', 'trial_days'] } },
      });
      const cfgMap = {};
      for (const c of trialConfigs) cfgMap[c.key] = c.value;
      if (cfgMap['trial_days']) trialDays = parseInt(cfgMap['trial_days']) || trialDays;
    } catch { /* usa fallback */ }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

    const store = await prisma.store.upsert({
      where: { nuvemshopId: userId },
      update: {
        accessToken,
        name: storeInfo.name?.pt || storeInfo.name?.es || storeInfo.name?.en || undefined,
        domain: storeInfo.original_domain || storeInfo.domain || undefined,
        email: storeInfo.email || undefined,
        uninstalledAt: null, // reinstalação limpa o marcador de desinstalação
      },
      create: {
        nuvemshopId: userId,
        accessToken,
        name: storeInfo.name?.pt || storeInfo.name?.es || storeInfo.name?.en || null,
        domain: storeInfo.original_domain || storeInfo.domain || null,
        email: storeInfo.email || null,
        plan: 'starter',
        trialEndsAt,
      },
    });

    // Ensure subscription record exists
    await prisma.subscription.upsert({
      where: { storeId: store.id },
      update: {},
      create: { storeId: store.id, status: 'none' },
    });

    // Script de traducao/conversao de moeda e auto-instalado pela Nuvemshop
    // (cadastrado no Partners Portal) — nao precisa de associacao manual por
    // loja. So garante que a config de traducao exista com a moeda padrao.
    await prisma.storeTranslationConfig.upsert({
      where: { storeId: store.id },
      update: {},
      create: {
        storeId: store.id,
        baseCurrency: storeInfo.currency || storeInfo.main_currency || 'BRL',
      },
    });

    // Generate JWT (kept for session use if needed)
    const token = jwt.sign(
      { storeId: store.id, nuvemshopId: store.nuvemshopId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Redirect to the app inside the store's Nuvemshop admin panel
    // Pattern: https://{store_domain}/admin/apps/{APP_ID}/
    // APP_ID = NUVEMSHOP_CLIENT_ID (e.g. 28692)
    // store_domain = original_domain from store info (e.g. postaidemo.lojavirtualnuvem.com.br)
    const appId = process.env.NUVEMSHOP_CLIENT_ID;
    const storeDomain = storeInfo.original_domain || storeInfo.domain;

    let redirectTarget;
    if (storeDomain && appId) {
      redirectTarget = `https://${storeDomain}/admin/apps/${appId}/`;
    } else {
      // Fallback: frontend callback page with token
      redirectTarget = `${process.env.FRONTEND_URL}/auth/callback?token=${token}`;
    }

    res.redirect(redirectTarget);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /auth/verify-token — Verify JWT and return store info
 */
router.get('/verify-token', requireAuth, async (req, res) => {
  const store = req.store;
  res.json({
    store: {
      id: store.id,
      nuvemshopId: store.nuvemshopId,
      name: store.name,
      domain: store.domain,
      email: store.email,
      plan: store.plan,
      trialEndsAt: store.trialEndsAt,
    },
    subscription: store.subscription
      ? {
          status: store.subscription.status,
          planKey: store.subscription.planKey,
          billingInterval: store.subscription.billingInterval,
          currentPeriodEnd: store.subscription.currentPeriodEnd,
          cancelAtPeriodEnd: store.subscription.cancelAtPeriodEnd,
        }
      : null,
  });
});

/**
 * POST /auth/dev-token — Generate a dev token for testing (dev only)
 */
router.post('/dev-token', async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('Rota disponivel apenas em desenvolvimento.', 403, 'DEV_ONLY');
    }

    const { storeId, nuvemshopId } = req.body;

    let store;
    if (storeId) {
      store = await prisma.store.findUnique({ where: { id: parseInt(storeId) } });
    } else if (nuvemshopId) {
      store = await prisma.store.findUnique({ where: { nuvemshopId: String(nuvemshopId) } });
    }

    if (!store) {
      // Create a dev store
      let devTrialDays = parseInt(process.env.TRIAL_DAYS) || 7;
      try {
        const tc = await prisma.adminConfig.findFirst({ where: { key: 'trial_days' } });
        if (tc?.value) devTrialDays = parseInt(tc.value) || devTrialDays;
      } catch { /* usa fallback */ }
      const trialDays = devTrialDays;
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + trialDays);

      store = await prisma.store.create({
        data: {
          nuvemshopId: nuvemshopId || `dev-${Date.now()}`,
          name: 'Dev Store',
          plan: 'starter',
          trialEndsAt,
        },
      });

      await prisma.subscription.create({
        data: { storeId: store.id, status: 'none' },
      });
    }

    const token = jwt.sign(
      { storeId: store.id, nuvemshopId: store.nuvemshopId },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, store: { id: store.id, nuvemshopId: store.nuvemshopId, name: store.name } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
