const Stripe = require('stripe');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');

// ─── Modo Stripe (test | live) ────────────────────────────────────────────────
// As chaves vivem no ambiente (Doppler/.env); o banco guarda apenas o flag
// `stripe_mode` (AdminConfig). O cliente ativo é resolvido dinamicamente e
// reavaliado em segundo plano, então o toggle no admin reflete sem restart.
// Mantemos a API `stripe.xxx` em todo o código via Proxy — zero mudança nos
// call-sites. Fallback para STRIPE_SECRET_KEY (legado) quando a chave do modo
// não estiver configurada.
const STRIPE_MODES = ['test', 'live'];

let activeMode = STRIPE_MODES.includes(process.env.STRIPE_MODE) ? process.env.STRIPE_MODE : 'test';

function keyForMode(mode) {
  if (mode === 'live') return process.env.STRIPE_SECRET_KEY_LIVE || process.env.STRIPE_SECRET_KEY || '';
  return process.env.STRIPE_SECRET_KEY_TEST || process.env.STRIPE_SECRET_KEY || '';
}

function getWebhookSecret(mode = activeMode) {
  if (mode === 'live') return process.env.STRIPE_WEBHOOK_SECRET_LIVE || process.env.STRIPE_WEBHOOK_SECRET || '';
  return process.env.STRIPE_WEBHOOK_SECRET_TEST || process.env.STRIPE_WEBHOOK_SECRET || '';
}

// Status de cada modo (sem expor a chave) — usado pelo banner do admin.
function getStripeKeyStatus() {
  const legacy = String(process.env.STRIPE_SECRET_KEY || '');
  const testKey = process.env.STRIPE_SECRET_KEY_TEST || (legacy.startsWith('sk_test_') || legacy.startsWith('rk_test_') ? legacy : '');
  const liveKey = process.env.STRIPE_SECRET_KEY_LIVE || (legacy.startsWith('sk_live_') || legacy.startsWith('rk_live_') ? legacy : '');
  const ok = (k, prefixes) => typeof k === 'string' && k.length > 20 && !k.includes('CHANGE_ME') && !k.includes('demo') && prefixes.some((p) => k.startsWith(p));
  return {
    test: ok(testKey, ['sk_test_', 'rk_test_']),
    live: ok(liveKey, ['sk_live_', 'rk_live_']),
  };
}

const _clients = {};
function clientForMode(mode) {
  if (!_clients[mode]) {
    // Placeholder evita crash de load quando a chave do modo não está setada;
    // chamadas reais nesse modo falham e são tratadas pelos try/catch existentes.
    _clients[mode] = new Stripe(keyForMode(mode) || 'sk_test_placeholder');
  }
  return _clients[mode];
}

async function refreshStripeMode() {
  try {
    const cfg = await prisma.adminConfig.findUnique({ where: { key: 'stripe_mode' } });
    if (cfg && STRIPE_MODES.includes(cfg.value)) activeMode = cfg.value;
  } catch {
    // mantém o modo atual se o banco estiver indisponível
  }
  return activeMode;
}

function getActiveMode() {
  return activeMode;
}

// Reavalia o modo periodicamente (toggle reflete em ~15s entre instâncias).
const _modeTimer = setInterval(() => { refreshStripeMode(); }, 15000);
if (_modeTimer.unref) _modeTimer.unref();
refreshStripeMode();

// Proxy: resolve para o cliente Stripe do modo ativo no momento da chamada.
const stripe = new Proxy({}, {
  get(_t, prop) {
    const client = clientForMode(activeMode);
    const value = client[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

const StripeService = {
  /**
   * Get or create a Stripe customer for a store.
   */
  async getOrCreateCustomer(store) {
    if (store.stripeCustomerId) {
      try {
        const customer = await stripe.customers.retrieve(store.stripeCustomerId);
        if (!customer.deleted) return customer;
      } catch (err) {
        // Customer not found, create new one
      }
    }

    const customer = await stripe.customers.create({
      email: store.email || undefined,
      name: store.name || undefined,
      metadata: {
        storeId: String(store.id),
        nuvemshopId: store.nuvemshopId,
      },
    });

    await prisma.store.update({
      where: { id: store.id },
      data: { stripeCustomerId: customer.id },
    });

    return customer;
  },

  /**
   * Create a Stripe Checkout Session.
   * Includes plan_key in metadata for webhook processing.
   *
   * @param {object} store
   * @param {string} priceId
   * @param {string} planKey
   * @param {string} billingInterval
   * @param {number|null} trialPeriodDays — quando > 0, aplica trial nativo do Stripe
   *   (trial_mode=paid). Compatível com allow_promotion_codes (sem conflito).
   */
  async createCheckoutSession(store, priceId, planKey, billingInterval, trialPeriodDays = null) {
    const customer = await this.getOrCreateCustomer(store);

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      allow_promotion_codes: true,  // sempre ativo — compatível com trial_period_days
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: {
        store_id: String(store.id),
        plan_key: planKey || '',
        billing_interval: billingInterval || '',
      },
      subscription_data: {
        // trial_period_days: nativo do Stripe — não requer cupom, status fica 'trialing'
        // até o fim do período; compatível com allow_promotion_codes
        ...(trialPeriodDays && trialPeriodDays > 0 ? { trial_period_days: trialPeriodDays } : {}),
        metadata: {
          app_id: process.env.NUVEMSHOP_APP_ID || '',
          app_name: process.env.APP_NAME || '',
          app_slug: process.env.APP_SLUG || '',
          partner_id: store.partnerId || '',
          partner_name: store.partnerName || '',
          store_id: String(store.id),
          plan_key: planKey || '',
          billing_interval: billingInterval || '',
        },
      },
      // Redireciona de volta ao painel Nuvemshop onde o app está embedado.
      // Fallback: FRONTEND_URL (fora do iframe, mas melhor que página em branco).
      success_url: store.domain
        ? `https://${store.domain}/admin/apps/${process.env.NUVEMSHOP_APP_ID}`
        : `${process.env.FRONTEND_URL}/billing?success=true`,
      cancel_url: store.domain
        ? `https://${store.domain}/admin/apps/${process.env.NUVEMSHOP_APP_ID}`
        : `${process.env.FRONTEND_URL}/billing?canceled=true`,
    });

    return session;
  },

  /**
   * Cancel all active subscriptions for a customer.
   */
  async cancelAllActiveSubscriptions(stripeCustomerId) {
    if (!stripeCustomerId) return;

    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'active',
    });

    for (const sub of subscriptions.data) {
      await stripe.subscriptions.update(sub.id, {
        cancel_at_period_end: true,
      });
    }
  },

  /**
   * Create a Stripe Billing Portal session.
   */
  async createPortalSession(store) {
    if (!store.stripeCustomerId) {
      throw new AppError('Nenhum cliente Stripe associado.', 400, 'NO_STRIPE_CUSTOMER');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: store.stripeCustomerId,
      return_url: store.domain
        ? `https://${store.domain}/admin/apps/${process.env.NUVEMSHOP_APP_ID}`
        : `${process.env.FRONTEND_URL}/billing`,
    });

    return session;
  },

  /**
   * Get subscription status and sync with database.
   *
   * Estratégia em 3 fases para garantir que troca de plano com trial seja detectada:
   *
   * Fase 1 — recupera a assinatura armazenada no DB.
   * Fase 2 — se ela NÃO está em 'trialing', consulta o Stripe por assinaturas 'trialing'
   *           do cliente. Uma subscription trialing mais recente significa que o usuário
   *           acabou de assinar um novo plano com período gratuito (trial_period_days);
   *           essa tem prioridade e atualiza o DB.
   * Fase 3 — se a armazenada está 'canceled', busca qualquer subscription 'active' no Stripe.
   *
   * Resultado: plan change + trial checkout refletem imediatamente sem depender de webhook.
   */
  async getSubscriptionStatus(store) {
    const subscription = await prisma.subscription.findUnique({
      where: { storeId: store.id },
    });

    // Sem customer Stripe ou sem subscription armazenada — retorna 'none' do cache
    if (!store.stripeCustomerId) {
      return {
        status: subscription?.status || 'none',
        planKey: subscription?.planKey || null,
        billingInterval: subscription?.billingInterval || null,
        currentPeriodEnd: subscription?.currentPeriodEnd || null,
        cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd || false,
        stripeSubscriptionId: subscription?.stripeSubscriptionId || null,
      };
    }

    if (!subscription?.stripeSubscriptionId) {
      // Sem subscription no DB — verifica se já existe alguma no Stripe
      try {
        const [trialingRes, activeRes] = await Promise.all([
          stripe.subscriptions.list({ customer: store.stripeCustomerId, status: 'trialing', limit: 1 }),
          stripe.subscriptions.list({ customer: store.stripeCustomerId, status: 'active', limit: 1 }),
        ]);
        const found = trialingRes.data[0] || activeRes.data[0];
        if (!found) return { status: 'none', planKey: null, billingInterval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };

        const planKey = found.metadata?.plan_key;
        const billingInterval = found.metadata?.billing_interval;
        if (planKey) await prisma.store.update({ where: { id: store.id }, data: { plan: planKey } });
        const upserted = await prisma.subscription.upsert({
          where: { storeId: store.id },
          update: { stripeSubscriptionId: found.id, status: found.status, planKey, billingInterval, cancelAtPeriodEnd: found.cancel_at_period_end, currentPeriodStart: new Date(found.current_period_start * 1000), currentPeriodEnd: new Date(found.current_period_end * 1000) },
          create: { storeId: store.id, stripeSubscriptionId: found.id, status: found.status, planKey: planKey || 'starter', billingInterval, cancelAtPeriodEnd: found.cancel_at_period_end, currentPeriodStart: new Date(found.current_period_start * 1000), currentPeriodEnd: new Date(found.current_period_end * 1000) },
        });
        return { status: upserted.status, planKey: upserted.planKey, billingInterval: upserted.billingInterval, currentPeriodStart: upserted.currentPeriodStart, currentPeriodEnd: upserted.currentPeriodEnd, cancelAtPeriodEnd: upserted.cancelAtPeriodEnd, stripeSubscriptionId: upserted.stripeSubscriptionId };
      } catch {
        return { status: 'none', planKey: null, billingInterval: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
      }
    }

    // Sync with Stripe
    try {
      // Fase 1: recupera a subscription armazenada
      const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubscriptionId);

      // Fase 2: se não está em trialing, verifica se há uma subscription trialing mais recente
      // (novo plano com trial_period_days após checkout — webhook ainda não processou)
      let bestSub = stripeSub;
      if (stripeSub.status !== 'trialing') {
        const trialingRes = await stripe.subscriptions.list({
          customer: store.stripeCustomerId,
          status: 'trialing',
          limit: 1,
        });
        const newerTrial = trialingRes.data[0];
        // Usa o trial se for uma subscription diferente da armazenada (novo plano)
        if (newerTrial && newerTrial.id !== stripeSub.id) {
          bestSub = newerTrial;
        }
      }

      // Fase 3: se a armazenada está canceled, procura uma active
      if (bestSub.id === stripeSub.id && stripeSub.status === 'canceled') {
        const activeRes = await stripe.subscriptions.list({
          customer: store.stripeCustomerId,
          status: 'active',
          limit: 1,
        });
        if (activeRes.data[0]) bestSub = activeRes.data[0];
      }

      const planKey = bestSub.metadata?.plan_key || subscription.planKey;
      const billingInterval = bestSub.metadata?.billing_interval || subscription.billingInterval;

      // Atualiza store.plan se o melhor plano mudou
      if (planKey && planKey !== store.plan) {
        await prisma.store.update({ where: { id: store.id }, data: { plan: planKey } });
      }

      const updated = await prisma.subscription.update({
        where: { storeId: store.id },
        data: {
          stripeSubscriptionId: bestSub.id,
          status: bestSub.status,
          planKey: planKey || subscription.planKey,
          billingInterval: billingInterval || subscription.billingInterval,
          cancelAtPeriodEnd: bestSub.cancel_at_period_end,
          currentPeriodStart: new Date(bestSub.current_period_start * 1000),
          currentPeriodEnd: new Date(bestSub.current_period_end * 1000),
        },
      });

      return {
        status: updated.status,
        planKey: updated.planKey,
        billingInterval: updated.billingInterval,
        currentPeriodStart: updated.currentPeriodStart,
        currentPeriodEnd: updated.currentPeriodEnd,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        stripeSubscriptionId: updated.stripeSubscriptionId,
      };
    } catch (err) {
      // Return cached data if Stripe is unreachable
      return {
        status: subscription.status,
        planKey: subscription.planKey,
        billingInterval: subscription.billingInterval,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
      };
    }
  },
};

module.exports = {
  stripe,
  StripeService,
  getActiveMode,
  getWebhookSecret,
  getStripeKeyStatus,
  refreshStripeMode,
};
