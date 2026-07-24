const express = require('express');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { checkoutLimiter } = require('../middleware/rateLimiter');
const { StripeService, stripe } = require('../config/stripe');
const adminPlanService = require('../admin/services/adminPlanService');
const { normalizeTrialMode, normalizeTrialDays } = require('../lib/trial');

const router = express.Router();

// All billing routes require auth
router.use(requireAuth);

/**
 * Lê a configuração de trial do AdminConfig.
 * Retorna { trialMode, trialDays, trialCoupon } com defaults seguros.
 *
 * trialMode: 'none' | 'free' | 'paid'
 *   - none: sem trial; usuário precisa assinar para acessar
 *   - free: X dias grátis sem cartão; banner de contagem regressiva no app
 *   - paid: usuário assina mas recebe X dias grátis via cupom Stripe automático
 */
async function getTrialConfig() {
  try {
    const configs = await prisma.adminConfig.findMany({
      where: { key: { in: ['trial_mode', 'trial_days', 'trial_coupon'] } },
    });
    const map = {};
    for (const c of configs) map[c.key] = c.value;
    return {
      trialMode: normalizeTrialMode(map['trial_mode']),
      trialDays: normalizeTrialDays(map['trial_days']),
      trialCoupon: map['trial_coupon'] || '',
    };
  } catch {
    return { trialMode: 'none', trialDays: 7, trialCoupon: '' };
  }
}

/**
 * POST /api/billing/checkout — Create Stripe Checkout Session
 * Usa stripePriceIds do banco (preenchido ao sincronizar com Stripe no admin).
 */
router.post('/checkout', checkoutLimiter, async (req, res, next) => {
  try {
    const { planKey, billingInterval } = req.body;

    if (!planKey || !billingInterval) {
      throw new AppError('planKey e billingInterval sao obrigatorios.', 400, 'MISSING_FIELDS');
    }

    const appSlug = process.env.APP_SLUG || 'meuapp';
    const plan = await prisma.adminPlan.findFirst({
      where: { appId: appSlug, name: planKey, isActive: true },
    });

    if (!plan) {
      throw new AppError('Plano nao encontrado.', 400, 'PLAN_NOT_FOUND');
    }

    let stripePriceIds = plan.stripePriceIds || {};
    let priceId = stripePriceIds[billingInterval];

    // Se o priceId não está no banco, tenta sincronizar com o Stripe antes de falhar
    if (!priceId) {
      try {
        const synced = await adminPlanService.syncToStripe(plan.id);
        stripePriceIds = synced.stripePriceIds || {};
        priceId = stripePriceIds[billingInterval];
      } catch {
        // Stripe não configurado ou sem produto — deixa cair no erro abaixo
      }
    }

    if (!priceId) {
      throw new AppError(
        'Preco nao configurado para este plano. Sincronize o plano com o Stripe no painel admin.',
        400,
        'PRICE_NOT_CONFIGURED'
      );
    }

    // trial_mode=paid: usa trial_period_days nativo do Stripe (não requer cupom)
    // Compatível com allow_promotion_codes — o cliente pode ainda digitar um cupom extra
    const { trialMode, trialDays } = await getTrialConfig();
    const trialPeriodDays = trialMode === 'paid' && trialDays > 0 ? trialDays : null;

    const session = await StripeService.createCheckoutSession(
      req.store,
      priceId,
      planKey,
      billingInterval,
      trialPeriodDays
    );

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/billing/sync — Sincroniza plano consultando o Stripe diretamente.
 * Usado como fallback quando o webhook falha (ex: secret não configurado).
 */
router.post('/sync', async (req, res, next) => {
  try {
    const { stripe } = require('../config/stripe');
    const store = req.store;

    if (!store.stripeCustomerId) {
      return res.json({ plan: store.plan, synced: false, reason: 'no_customer' });
    }

    // Busca assinaturas 'trialing' E 'active' no Stripe.
    // IMPORTANTE: trial_period_days cria subscription com status='trialing', não 'active'.
    // O sync antigo buscava apenas 'active' e perdia novas assinaturas com trial.
    const [trialingRes, activeRes] = await Promise.all([
      stripe.subscriptions.list({
        customer: store.stripeCustomerId,
        status: 'trialing',
        limit: 5,
        expand: ['data.items.data.price'],
      }),
      stripe.subscriptions.list({
        customer: store.stripeCustomerId,
        status: 'active',
        limit: 5,
        expand: ['data.items.data.price'],
      }),
    ]);

    // Prioridade: trialing (novo plano com trial) > active sem cancel > active com cancel
    const allSubs = [
      ...trialingRes.data,
      ...activeRes.data.filter((s) => !s.cancel_at_period_end),
      ...activeRes.data.filter((s) => s.cancel_at_period_end),
    ];

    if (allSubs.length === 0) {
      return res.json({ plan: store.plan, synced: false, reason: 'no_active_subscription' });
    }

    // Usa a assinatura de maior prioridade (trialing ou active mais recente)
    const sub = allSubs[0];
    const planKey = sub.metadata?.plan_key;
    const billingInterval = sub.metadata?.billing_interval;

    if (!planKey) {
      return res.json({ plan: store.plan, synced: false, reason: 'no_plan_metadata' });
    }

    // Atualiza store e subscription no banco
    await prisma.store.update({
      where: { id: store.id },
      data: { plan: planKey },
    });

    await prisma.subscription.upsert({
      where: { storeId: store.id },
      update: {
        stripeSubscriptionId: sub.id,
        status: sub.status,   // preserva 'trialing' — subActive inclui trialing
        planKey,
        billingInterval,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
      },
      create: {
        storeId: store.id,
        stripeSubscriptionId: sub.id,
        status: sub.status,
        planKey,
        billingInterval,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        currentPeriodStart: new Date(sub.current_period_start * 1000),
        currentPeriodEnd: new Date(sub.current_period_end * 1000),
      },
    });

    console.log(`Sync manual: store ${store.id} → plano ${planKey} (${sub.status})`);
    res.json({ plan: planKey, synced: true, status: sub.status });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/billing/status — Get current subscription status
 *
 * hasAccess = true quando:
 *   - Plano do store é free (price=0)
 *   - Assinatura ativa ou em trial no Stripe (subActive)
 *   - trial_mode=free E trialEndsAt ainda não expirou
 *
 * Retorna também: trialMode, trialDaysLeft
 * hasAccess = false → App.jsx exibe BillingPage locked (gate de assinatura)
 */
router.get('/status', async (req, res, next) => {
  try {
    const appSlug = process.env.APP_SLUG || 'meuapp';
    const status = await StripeService.getSubscriptionStatus(req.store);

    // Assinatura ativa no Stripe (inclui status 'trialing' do cupom paid)
    const subActive = ['active', 'trialing'].includes(status.status);

    // Lê configuração de trial do banco
    const { trialMode, trialDays } = await getTrialConfig();

    // Trial gratuito (sem cartão) — só aplica quando trial_mode=free
    const now = new Date();
    const trialEndsAt = req.store.trialEndsAt ? new Date(req.store.trialEndsAt) : null;
    const trialActive = trialMode === 'free' && !!trialEndsAt && trialEndsAt > now;
    const trialDaysLeft = trialActive
      ? Math.max(0, Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24)))
      : 0;

    // Verifica se o plano atual do store é free no banco.
    // ATENÇÃO: isFree NÃO é campo do schema Prisma — é calculado a partir do JSON price.
    // Nunca usar select: { isFree: true } — lança erro Prisma.
    let isFreePlan = false;
    if (req.store.plan) {
      const plan = await prisma.adminPlan.findFirst({
        where: { appId: appSlug, name: req.store.plan, isActive: true },
        select: { price: true },
      });
      if (plan?.price && typeof plan.price === 'object') {
        const priceValues = Object.values(plan.price);
        isFreePlan = priceValues.length > 0 && priceValues.every((v) => !v || v === 0);
      }
    }

    // hasAccess: plano free ou assinatura ativa ou (trial_mode=free e dentro do prazo)
    const hasAccess = isFreePlan || subActive || (trialMode === 'free' && trialActive);

    res.json({
      plan: req.store.plan,
      trialEndsAt: req.store.trialEndsAt,
      trialMode,
      trialDays,
      trialDaysLeft,
      hasAccess,
      subscription: status,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/billing/portal — Create Stripe Billing Portal session
 */
router.post('/portal', async (req, res, next) => {
  try {
    const session = await StripeService.createPortalSession(req.store);
    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/billing/cancel — Cancel subscription at period end
 */
router.post('/cancel', async (req, res, next) => {
  try {
    if (!req.store.stripeCustomerId) {
      throw new AppError('Nenhuma assinatura ativa.', 400, 'NO_SUBSCRIPTION');
    }

    await StripeService.cancelAllActiveSubscriptions(req.store.stripeCustomerId);

    await prisma.subscription.update({
      where: { storeId: req.store.id },
      data: { cancelAtPeriodEnd: true },
    });

    res.json({ message: 'Assinatura sera cancelada ao fim do periodo.' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/billing/plans — List available plans
 * Usa dados do banco: stripePriceIds para intervals/configured, price para valores.
 */
router.get('/plans', async (req, res, next) => {
  try {
    const appSlug = process.env.APP_SLUG || 'meuapp';

    const dbPlans = await prisma.adminPlan.findMany({
      where: { appId: appSlug, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    // Auto-heal: para planos pagos sem stripePriceIds, busca no Stripe e salva no banco
    for (const plan of dbPlans) {
      const hasPriceIds = Object.values(plan.stripePriceIds || {}).some(Boolean);
      const hasPrices = Object.values(plan.price || {}).some((v) => v > 0);
      if (hasPrices && !hasPriceIds) {
        try {
          const synced = await adminPlanService.syncToStripe(plan.id);
          plan.stripePriceIds = synced.stripePriceIds;
        } catch {
          // Stripe não configurado ou plano sem produto — segue sem sync
        }
      }
    }

    const plans = dbPlans.map((plan) => {
      // Intervalos configurados = aqueles que têm priceId no Stripe
      const stripePriceIds = plan.stripePriceIds || {};
      const configuredIntervals = Object.entries(stripePriceIds)
        .filter(([, priceId]) => priceId && priceId.length > 0)
        .map(([interval]) => interval);

      const prices = plan.price || {};
      const isFree = Object.values(prices).every((v) => !v || v === 0);

      // Normaliza features para array de strings legíveis:
      // - Array de strings: usa diretamente (formato correto)
      // - Objeto JSON: converte entradas, filtra valores false/null
      let features = [];
      if (Array.isArray(plan.features)) {
        features = plan.features.map(String).filter(Boolean);
      } else if (plan.features && typeof plan.features === 'object') {
        features = Object.entries(plan.features)
          .filter(([, v]) => v !== false && v !== null && v !== undefined && v !== '')
          .map(([k, v]) => (v === true ? k : String(v)))
          .filter(Boolean);
      }

      return {
        key: plan.name,
        features,
        price: prices,
        intervals: configuredIntervals,
        configured: isFree || configuredIntervals.length > 0,
        isFree,
      };
    });

    // Inclui configuração de trial para o frontend exibir badges nos planos
    const { trialMode, trialDays } = await getTrialConfig();

    res.json({ plans, trialMode, trialDays });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/billing/invoices — List store invoices
 *
 * Sempre sincroniza com o Stripe antes de retornar (upsert idempotente).
 * Garante que novas faturas apareçam mesmo sem o webhook configurado ou após
 * troca de plano, cancelamento e resubscrição.
 */
router.get('/invoices', async (req, res, next) => {
  try {
    // Sync com Stripe sempre que há stripeCustomerId
    if (req.store.stripeCustomerId) {
      try {
        const stripeInvoices = await stripe.invoices.list({
          customer: req.store.stripeCustomerId,
          limit: 50,
        });

        for (const inv of stripeInvoices.data) {
          const amountPaid = (inv.amount_paid || 0) / 100;
          if (amountPaid <= 0) continue; // ignora faturas de R$ 0 (ex: trial)

          await prisma.invoice.upsert({
            where: { stripeInvoiceId: inv.id },
            update: {
              amountPaid,
              status: inv.status,
              invoiceUrl: inv.hosted_invoice_url || null,
              invoicePdf: inv.invoice_pdf || null,
            },
            create: {
              storeId: req.store.id,
              stripeInvoiceId: inv.id,
              amountPaid,
              currency: inv.currency || 'brl',
              status: inv.status,
              invoiceUrl: inv.hosted_invoice_url || null,
              invoicePdf: inv.invoice_pdf || null,
              periodStart: inv.period_start ? new Date(inv.period_start * 1000) : null,
              periodEnd: inv.period_end ? new Date(inv.period_end * 1000) : null,
            },
          });
        }
      } catch (err) {
        // Stripe não configurado ou erro — segue retornando o que tiver no banco
        console.warn('[invoices] Sync Stripe falhou:', err.message);
      }
    }

    // Retorna do banco (já atualizado pelo sync acima)
    const invoices = await prisma.invoice.findMany({
      where: { storeId: req.store.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ invoices });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/billing/partner — Retorna parceiro atualmente associado à loja.
 */
router.get('/partner', async (req, res, next) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.store.id },
      select: { partnerId: true, partnerName: true },
    });
    res.json({
      partnerId: store?.partnerId || null,
      partnerName: store?.partnerName || null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/billing/partner — Valida parceiro via Partners API, salva no Store
 * e atualiza os metadados da subscription ativa no Stripe.
 *
 * Body: { partnerId: "E5DCHV87" }
 * Response: { partnerId, partnerName }
 */
router.post('/partner', async (req, res, next) => {
  try {
    const { partnerId } = req.body;

    if (!partnerId || typeof partnerId !== 'string' || partnerId.trim().length < 4) {
      throw new AppError('Código do parceiro inválido.', 400, 'INVALID_PARTNER_ID');
    }

    const PARTNERS_API_KEY = process.env.PARTNERS_API_KEY;
    if (!PARTNERS_API_KEY) {
      throw new AppError('Integração de parceiros não configurada.', 503, 'PARTNERS_NOT_CONFIGURED');
    }

    // Valida parceiro via API externa
    let partnerRes;
    try {
      partnerRes = await fetch(
        `https://partners.nuvempro.com/api/v1/partners/${encodeURIComponent(partnerId.trim())}`,
        { headers: { 'x-api-key': PARTNERS_API_KEY } }
      );
    } catch {
      throw new AppError('Erro ao conectar à API de parceiros.', 502, 'PARTNERS_API_UNREACHABLE');
    }

    if (partnerRes.status === 404) {
      throw new AppError('Parceiro não encontrado.', 404, 'PARTNER_NOT_FOUND');
    }
    if (partnerRes.status === 403) {
      throw new AppError('Este parceiro está suspenso.', 403, 'PARTNER_SUSPENDED');
    }
    if (partnerRes.status === 401) {
      throw new AppError('Integração de parceiros não autorizada.', 503, 'PARTNERS_UNAUTHORIZED');
    }
    if (!partnerRes.ok) {
      throw new AppError('Erro ao validar parceiro.', 502, 'PARTNERS_API_ERROR');
    }

    const partner = await partnerRes.json();

    // Salva partnerId + partnerName no Store (tenant)
    await prisma.store.update({
      where: { id: req.store.id },
      data: { partnerId: partner.partnerId, partnerName: partner.name },
    });

    // Atualiza metadados da subscription ativa no Stripe (best-effort — não falha a request)
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { storeId: req.store.id },
        select: { stripeSubscriptionId: true, status: true },
      });
      if (
        subscription?.stripeSubscriptionId &&
        ['active', 'trialing'].includes(subscription.status)
      ) {
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          metadata: {
            partner_id: partner.partnerId,
            partner_name: partner.name,
          },
        });
      }
    } catch {
      // Non-critical: metadados do Stripe não impedem o save local
    }

    res.json({ partnerId: partner.partnerId, partnerName: partner.name });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
