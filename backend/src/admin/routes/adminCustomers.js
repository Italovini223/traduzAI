const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { parsePagination, paginatedResponse } = require('../../lib/paginate');
const { requireRole } = require('../middleware/requireRole');
const adminLogService = require('../services/adminLogService');
const { StripeService } = require('../../config/stripe');

const router = express.Router();

/**
 * GET /admin-api/customers/dashboard — Dashboard metrics
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const sixtyDaysAgo = new Date(now);
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const [
      totalStores,
      activeSubscriptions,
      trialStores,
      expiredStores,
      activeSubs,
      storesCurr,
      storesPrev,
      subsCurr,
      subsPrev,
      invCurr,
      invPrev,
      goalConfigs,
    ] = await Promise.all([
      prisma.store.count(),
      prisma.subscription.count({ where: { status: { in: ['active', 'trialing'] } } }),
      prisma.store.count({
        where: {
          OR: [
            { trialEndsAt: { gt: now } },
            { subscription: { is: { status: 'trialing' } } },
          ],
        },
      }),
      prisma.store.count({
        where: {
          trialEndsAt: { not: null, lte: now },
          subscription: { is: null },
        },
      }),
      prisma.subscription.findMany({
        where: { status: { in: ['active', 'trialing'] } },
        select: { planKey: true, billingInterval: true },
      }),
      // Period comparison — new stores
      prisma.store.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.store.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
      // Period comparison — new active subs
      prisma.subscription.count({ where: { status: { in: ['active', 'trialing'] }, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.subscription.count({ where: { status: { in: ['active', 'trialing'] }, createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
      // Period comparison — invoices (MRR proxy)
      prisma.invoice.aggregate({ _sum: { amountPaid: true }, where: { status: 'paid', createdAt: { gte: thirtyDaysAgo } } }),
      prisma.invoice.aggregate({ _sum: { amountPaid: true }, where: { status: 'paid', createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
      // Goals
      prisma.adminConfig.findMany({
        where: { key: { in: ['goal_stores', 'goal_subs', 'goal_trial', 'goal_mrr', 'server_cost'] } },
      }),
    ]);

    // MRR — via planKey x billingInterval x preço do AdminPlan
    const plans = await prisma.adminPlan.findMany({ select: { name: true, price: true } });
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

    // Goals map
    const goalMap = {};
    goalConfigs.forEach((c) => { goalMap[c.key] = parseFloat(c.value) || 0; });
    const serverCost = goalMap['server_cost'] || 0;
    const netMargin = Math.round((mrr - serverCost) * 100) / 100;
    const marginPct = mrr > 0 ? Math.round(((mrr - serverCost) / mrr) * 100) : null;

    // Period trends (% vs mês anterior)
    const trendPct = (curr, prev) => {
      if (!prev && !curr) return 0;
      if (!prev) return 100;
      return Math.round(((curr - prev) / prev) * 100);
    };
    const mrrCurr = invCurr._sum.amountPaid || 0;
    const mrrPrev = invPrev._sum.amountPaid || 0;
    const prevPeriod = {
      storesTrend: trendPct(storesCurr, storesPrev),
      subsTrend: trendPct(subsCurr, subsPrev),
      mrrTrend: trendPct(mrrCurr, mrrPrev),
    };

    // Instalações mensais — últimos 6 meses
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const recentCreated = await prisma.store.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true },
    });
    const monthMap = {};
    recentCreated.forEach((s) => {
      const key = s.createdAt.toISOString().slice(0, 7);
      monthMap[key] = (monthMap[key] || 0) + 1;
    });
    const monthlyInstalls = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      monthlyInstalls.push({ month: label, installs: monthMap[key] || 0 });
    }

    // Distribuição de assinaturas por plano
    const subsByPlan = await prisma.subscription.groupBy({
      by: ['planKey'],
      where: { status: { in: ['active', 'trialing'] } },
      _count: { planKey: true },
    });
    const subscriptionDistribution = subsByPlan
      .filter((s) => s.planKey)
      .map((s) => ({ plan: s.planKey, count: s._count.planKey }));

    res.json({
      stats: { totalStores, activeSubscriptions, trialStores, expiredStores, mrr },
      goals: goalMap,
      prevPeriod,
      margin: { net: netMargin, pct: marginPct, serverCost },
      monthlyInstalls,
      subscriptionDistribution,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/customers — List customers with pagination, tabs, search
 * Query: ?tab=all|active|trial|churned&search=term&page=1&limit=20
 */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    // frontend sends ?status=  (tab key) — accept both param names
    const filter = req.query.status || req.query.tab;
    const { search } = req.query;

    const where = {};

    // Tab filters
    if (filter === 'active') {
      where.subscription = { is: { status: { in: ['active', 'trialing'] } } };
    } else if (filter === 'trial') {
      where.OR = [
        { subscription: { is: { status: 'trialing' } } },
        { trialEndsAt: { gt: new Date() } },
      ];
    } else if (filter === 'expired') {
      where.trialEndsAt = { lte: new Date() };
      where.subscription = { is: null };
    } else if (filter === 'no_plan') {
      where.subscription = { is: null };
    } else if (filter === 'uninstalled') {
      where.uninstalledAt = { not: null };
    }

    // Search
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { domain: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { nuvemshopId: { contains: search } },
      ];
    }

    const [stores, total] = await Promise.all([
      prisma.store.findMany({
        where,
        include: { subscription: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.store.count({ where }),
    ]);

    const now = new Date();

    const data = stores.map((s) => {
      // Compute a flat status for the list
      let status = 'no_plan';
      if (s.subscription) {
        const ss = s.subscription.status;
        if (ss === 'trialing') status = 'trial';
        else if (ss === 'active') status = 'active';
        else if (ss === 'past_due') status = 'past_due';
        else if (ss === 'canceled') status = 'canceled';
        else status = ss;
      } else if (s.trialEndsAt && s.trialEndsAt > now) {
        status = 'trial';
      } else if (s.trialEndsAt && s.trialEndsAt <= now) {
        status = 'expired';
      }

      // App desinstalado tem prioridade no badge da lista
      if (s.uninstalledAt) status = 'uninstalled';

      return {
        id: s.id,
        nuvemshopId: s.nuvemshopId,
        name: s.name,
        domain: s.domain,
        email: s.email,
        planKey: s.subscription?.planKey || s.plan || null,
        status,
        trialEndsAt: s.trialEndsAt,
        uninstalledAt: s.uninstalledAt,
        createdAt: s.createdAt,
        subscription: s.subscription
          ? {
              status: s.subscription.status,
              planKey: s.subscription.planKey,
              billingInterval: s.subscription.billingInterval,
            }
          : null,
      };
    });

    res.json(paginatedResponse(data, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/customers/:id — Customer detail
 */
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const store = await prisma.store.findUnique({
      where: { id },
      include: {
        subscription: true,
        profile: true,
        termsAcceptances: { include: { termsVersion: true } },
      },
    });

    if (!store) {
      throw new AppError('Loja nao encontrada.', 404, 'STORE_NOT_FOUND');
    }

    const invoices = await prisma.invoice.findMany({
      where: { storeId: id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({ store, invoices });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/customers/:id/impersonate — Generate impersonation token
 */
router.post('/:id/impersonate', requireRole('gerente'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const store = await prisma.store.findUnique({ where: { id } });

    if (!store) {
      throw new AppError('Loja nao encontrada.', 404, 'STORE_NOT_FOUND');
    }

    const token = jwt.sign(
      { storeId: store.id, nuvemshopId: store.nuvemshopId, impersonatedBy: req.admin.id },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'impersonate_store',
      entity: 'store',
      entityId: id,
      details: { storeName: store.name },
      ipAddress: req.ip,
      severity: 'warning',
    });

    res.json({ token, expiresIn: '1h' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/customers/:id/extend-trial — Extend trial period
 */
router.post('/:id/extend-trial', requireRole('gerente'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { days } = req.body;

    if (!days || days < 1 || days > 90) {
      throw new AppError('Informe dias entre 1 e 90.', 400, 'INVALID_DAYS');
    }

    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) {
      throw new AppError('Loja nao encontrada.', 404, 'STORE_NOT_FOUND');
    }

    const baseDate = store.trialEndsAt && store.trialEndsAt > new Date()
      ? store.trialEndsAt
      : new Date();

    const newTrialEnd = new Date(baseDate);
    newTrialEnd.setDate(newTrialEnd.getDate() + days);

    const updated = await prisma.store.update({
      where: { id },
      data: { trialEndsAt: newTrialEnd },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'extend_trial',
      entity: 'store',
      entityId: id,
      details: { days, newTrialEnd },
      ipAddress: req.ip,
    });

    res.json({ trialEndsAt: updated.trialEndsAt });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /admin-api/customers/:id — Remove a loja (tenant) e TODOS os dados
 * relacionados. Destrutivo e irreversível. Apenas proprietário.
 *
 * Estratégia: cancela assinatura ativa no Stripe (best-effort) e, em transação,
 * apaga as tabelas-base que não têm cascade (subscription, storeProfile, invoice,
 * termsAcceptance, adminCommission) e por fim a Store — cujo delete cascateia os
 * models específicos do app que tenham onDelete: Cascade no schema.
 */
router.delete('/:id', requireRole('proprietario'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (!id) throw new AppError('storeId invalido.', 400, 'INVALID_STORE_ID');

    const store = await prisma.store.findUnique({ where: { id } });
    if (!store) throw new AppError('Loja nao encontrada.', 404, 'STORE_NOT_FOUND');

    // Auditoria ANTES de apagar (o storeId deixa de existir depois)
    await adminLogService.log({
      adminId: req.admin.id,
      action: 'delete_store',
      entity: 'store',
      entityId: id,
      details: { name: store.name, nuvemshopId: store.nuvemshopId, plan: store.plan },
      ipAddress: req.ip,
      severity: 'warning',
    });

    // Apaga dados base (FKs sem cascade) e a loja (cascateia models do app com onDelete: Cascade)
    await prisma.$transaction([
      prisma.subscription.deleteMany({ where: { storeId: id } }),
      prisma.storeProfile.deleteMany({ where: { storeId: id } }),
      prisma.invoice.deleteMany({ where: { storeId: id } }),
      prisma.termsAcceptance.deleteMany({ where: { storeId: id } }),
      prisma.adminCommission.deleteMany({ where: { storeId: id } }),
      prisma.store.delete({ where: { id } }),
    ]);

    // Cancela a assinatura no Stripe DEPOIS do commit local (best-effort).
    // Antes do commit, se a transação falhasse, a assinatura ficaria cancelada
    // no Stripe com a loja ainda viva no banco (inconsistência).
    if (store.stripeCustomerId) {
      try {
        await StripeService.cancelAllActiveSubscriptions(store.stripeCustomerId);
      } catch (e) {
        console.warn('[delete_store] falha ao cancelar assinatura no Stripe:', e.message);
      }
    }

    res.json({ deleted: true, storeId: id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
