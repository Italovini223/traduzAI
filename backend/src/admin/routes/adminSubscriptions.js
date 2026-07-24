const express = require('express');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { parsePagination, paginatedResponse } = require('../../lib/paginate');
const { requireRole } = require('../middleware/requireRole');
const { StripeService } = require('../../config/stripe');
const adminLogService = require('../services/adminLogService');

const router = express.Router();

/**
 * GET /admin-api/subscriptions/metrics — Subscription metrics
 */
router.get('/metrics', async (req, res, next) => {
  try {
    const [total, active, canceled, pastDue, trialing] = await Promise.all([
      prisma.subscription.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.subscription.count({ where: { status: 'canceled' } }),
      prisma.subscription.count({ where: { status: 'past_due' } }),
      prisma.subscription.count({ where: { status: 'trialing' } }),
    ]);

    // MRR calculation from active subscriptions with invoices
    const recentInvoices = await prisma.invoice.findMany({
      where: { status: 'paid' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const totalRevenue = recentInvoices.reduce((sum, inv) => sum + inv.amountPaid, 0);

    res.json({
      metrics: {
        total,
        active,
        canceled,
        pastDue,
        trialing,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/subscriptions — List subscriptions with pagination
 * Query: ?status=active|canceled|past_due&page=1&limit=20
 */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status } = req.query;

    const where = {};
    if (status) where.status = status;

    const [subscriptions, total, activeSubs, canceledCount, plans] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          store: { select: { id: true, name: true, domain: true, email: true, nuvemshopId: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.subscription.count({ where }),
      prisma.subscription.findMany({
        where: { status: { in: ['active', 'trialing'] } },
        select: { planKey: true, billingInterval: true },
      }),
      prisma.subscription.count({ where: { status: 'canceled' } }),
      prisma.adminPlan.findMany({ select: { name: true, price: true } }),
    ]);

    // MRR/ARR
    const planPriceMap = {};
    plans.forEach((p) => { planPriceMap[p.name] = p.price; });
    let mrr = 0;
    for (const sub of activeSubs) {
      const price = planPriceMap[sub.planKey];
      if (price && typeof price === 'object') {
        if (sub.billingInterval === 'monthly') mrr += price.monthly || 0;
        else if (sub.billingInterval === 'semestral') mrr += (price.semestral || 0) / 6;
        else if (sub.billingInterval === 'annual') mrr += (price.annual || 0) / 12;
      }
    }
    mrr = Math.round(mrr * 100) / 100;
    const arr = Math.round(mrr * 12 * 100) / 100;

    // Flatten storeName
    const data = subscriptions.map(({ store, ...s }) => ({
      ...s,
      storeName: store?.name || `Loja #${s.storeId}`,
    }));

    const response = paginatedResponse(data, total, { page, limit });
    response.metrics = { mrr, arr, active: activeSubs.length, canceled: canceledCount };

    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/subscriptions/:storeId/cancel — Cancel a subscription
 */
router.post('/:storeId/cancel', requireRole('gerente'), async (req, res, next) => {
  try {
    const storeId = parseInt(req.params.storeId);

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new AppError('Loja nao encontrada.', 404, 'STORE_NOT_FOUND');
    }

    if (store.stripeCustomerId) {
      await StripeService.cancelAllActiveSubscriptions(store.stripeCustomerId);
    }

    await prisma.subscription.update({
      where: { storeId },
      data: { cancelAtPeriodEnd: true },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'cancel_subscription',
      entity: 'subscription',
      entityId: storeId,
      details: { storeName: store.name },
      ipAddress: req.ip,
      severity: 'warning',
    });

    res.json({ message: 'Assinatura cancelada.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/subscriptions/:storeId/extend-trial — Extend trial
 */
router.post('/:storeId/extend-trial', requireRole('gerente'), async (req, res, next) => {
  try {
    const storeId = parseInt(req.params.storeId);
    const { days } = req.body;

    if (!days || days < 1 || days > 90) {
      throw new AppError('Informe dias entre 1 e 90.', 400, 'INVALID_DAYS');
    }

    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new AppError('Loja nao encontrada.', 404, 'STORE_NOT_FOUND');
    }

    const baseDate = store.trialEndsAt && store.trialEndsAt > new Date()
      ? store.trialEndsAt
      : new Date();

    const newTrialEnd = new Date(baseDate);
    newTrialEnd.setDate(newTrialEnd.getDate() + days);

    await prisma.store.update({
      where: { id: storeId },
      data: { trialEndsAt: newTrialEnd },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'extend_trial',
      entity: 'store',
      entityId: storeId,
      details: { days, newTrialEnd },
      ipAddress: req.ip,
    });

    res.json({ trialEndsAt: newTrialEnd });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
