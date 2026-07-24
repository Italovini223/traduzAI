const prisma = require('../../lib/prisma');
const { stripe } = require('../../config/stripe');
const { AppError } = require('../../lib/errors');

const intervalMap = {
  monthly:  { interval: 'month', interval_count: 1 },
  semestral: { interval: 'month', interval_count: 6 },
  annual:   { interval: 'year',  interval_count: 1 },
};

/**
 * Localiza o produto Stripe do plano pela metadata admin_plan_id.
 * Fallback: busca por plan_key + app_id (para planos migrados ou re-criados no banco).
 * Se não encontrar, cria um novo produto.
 */
async function findOrCreateStripeProduct(plan, appName, appSlug) {
  const productName = `${appName} - ${plan.name.charAt(0).toUpperCase() + plan.name.slice(1)}`;
  const metadata = {
    plan_key:      plan.name,
    admin_plan_id: String(plan.id),
    app_id:        plan.appId,
    app_name:      appName,
    app_slug:      appSlug,
  };

  // 1. Busca pelo ID do plano no banco (mais confiável)
  const byId = await stripe.products.search({
    query: `metadata['admin_plan_id']:'${plan.id}'`,
  });
  if (byId.data.length > 0) {
    const product = byId.data[0];
    await stripe.products.update(product.id, { name: productName, metadata });
    return product;
  }

  // 2. Fallback: busca pelo plan_key + app_id (planos que perderam o ID no banco)
  const byKey = await stripe.products.search({
    query: `metadata['plan_key']:'${plan.name}' AND metadata['app_id']:'${plan.appId}'`,
  });
  if (byKey.data.length > 0) {
    const product = byKey.data[0];
    await stripe.products.update(product.id, { name: productName, metadata });
    return product;
  }

  // 3. Cria novo produto
  return stripe.products.create({ name: productName, metadata });
}

/**
 * Para um produto Stripe e um intervalo, localiza o preço ativo que bate com
 * o valor esperado. Se não existir, arquiva preços antigos do mesmo intervalo
 * e cria um novo.
 */
async function findOrCreateStripePrice(product, intervalKey, amount, plan, appSlug) {
  const config = intervalMap[intervalKey];
  const expectedAmount = Math.round(amount * 100); // centavos

  // Lista todos os preços ativos do produto
  const activePrices = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });

  // Procura preço ativo com mesmo intervalo e mesmo valor
  const matching = activePrices.data.find(
    (p) =>
      p.unit_amount === expectedAmount &&
      p.recurring?.interval === config.interval &&
      p.recurring?.interval_count === config.interval_count &&
      p.currency === 'brl'
  );
  if (matching) return matching;

  // Arquiva preços do mesmo intervalo que não batem (valor diferente)
  const stale = activePrices.data.filter(
    (p) =>
      p.recurring?.interval === config.interval &&
      p.recurring?.interval_count === config.interval_count
  );
  for (const p of stale) {
    await stripe.prices.update(p.id, { active: false });
  }

  // Cria novo preço
  return stripe.prices.create({
    product: product.id,
    unit_amount: expectedAmount,
    currency: 'brl',
    recurring: { interval: config.interval, interval_count: config.interval_count },
    metadata: {
      plan_key:        plan.name,
      admin_plan_id:   String(plan.id),
      app_id:          plan.appId,
      app_slug:        appSlug,
      billing_interval: intervalKey,
    },
  });
}

const adminPlanService = {
  /** List all plans for an app. */
  async list(appId) {
    return prisma.adminPlan.findMany({
      where: { appId },
      orderBy: { sortOrder: 'asc' },
    });
  },

  /** Create a new plan. */
  async create(data) {
    return prisma.adminPlan.create({ data });
  },

  /** Update an existing plan. */
  async update(id, data) {
    const plan = await prisma.adminPlan.findUnique({ where: { id } });
    if (!plan) throw new AppError('Plano nao encontrado.', 404, 'PLAN_NOT_FOUND');
    return prisma.adminPlan.update({ where: { id }, data });
  },

  /** Deactivate a plan (soft delete) + arquiva produto e preços no Stripe. */
  async deactivate(id) {
    const plan = await prisma.adminPlan.findUnique({ where: { id } });
    if (!plan) throw new AppError('Plano nao encontrado.', 404, 'PLAN_NOT_FOUND');

    // Arquiva o produto e todos os preços ativos no Stripe (não-bloqueante)
    await this.archiveInStripe(plan).catch((err) =>
      console.warn(`[deactivate] Stripe archive falhou para plano ${plan.name}:`, err.message)
    );

    return prisma.adminPlan.update({ where: { id }, data: { isActive: false } });
  },

  /**
   * Arquiva o produto Stripe do plano e todos os seus preços ativos.
   * Chamado ao desativar um plano para evitar novas assinaturas via Stripe.
   * Não lança erro se o produto não existir ou se o Stripe não estiver configurado.
   */
  async archiveInStripe(plan) {
    // Busca o produto Stripe pelo ID do plano no banco
    let product = null;
    try {
      const byId = await stripe.products.search({
        query: `metadata['admin_plan_id']:'${plan.id}'`,
      });
      if (byId.data.length > 0) {
        product = byId.data[0];
      } else {
        // Fallback: busca por plan_key + app_id
        const byKey = await stripe.products.search({
          query: `metadata['plan_key']:'${plan.name}' AND metadata['app_id']:'${plan.appId}'`,
        });
        if (byKey.data.length > 0) product = byKey.data[0];
      }
    } catch {
      return; // Stripe não configurado — ignora silenciosamente
    }

    if (!product) return; // Produto não existe no Stripe — nada a fazer

    // Arquiva todos os preços ativos do produto
    const activePrices = await stripe.prices.list({
      product: product.id,
      active: true,
      limit: 100,
    });
    for (const price of activePrices.data) {
      await stripe.prices.update(price.id, { active: false });
    }

    // Arquiva o produto
    await stripe.products.update(product.id, { active: false });

    console.log(`[archiveInStripe] Produto ${product.id} e ${activePrices.data.length} preço(s) arquivados para plano "${plan.name}".`);
  },

  /**
   * Sincroniza o plano com o Stripe:
   * - Busca ou cria o produto no Stripe (por metadata)
   * - Para cada intervalo com preço > 0, busca ou cria o preço correto
   * - Arquiva preços desatualizados
   * - Salva os stripePriceIds no banco
   */
  async syncToStripe(id) {
    const plan = await prisma.adminPlan.findUnique({ where: { id } });
    if (!plan) throw new AppError('Plano nao encontrado.', 404, 'PLAN_NOT_FOUND');

    const prices  = plan.price || {};
    const appName = process.env.APP_NAME || 'MeuApp';
    const appSlug = process.env.APP_SLUG || plan.appId;

    const product = await findOrCreateStripeProduct(plan, appName, appSlug);

    const stripePriceIds = {};

    for (const intervalKey of Object.keys(intervalMap)) {
      const amount = prices[intervalKey];
      if (!amount || amount <= 0) continue;

      const stripePrice = await findOrCreateStripePrice(product, intervalKey, amount, plan, appSlug);
      stripePriceIds[intervalKey] = stripePrice.id;
    }

    return prisma.adminPlan.update({ where: { id }, data: { stripePriceIds } });
  },

  /**
   * Remove o plano do banco e arquiva produto/preços no Stripe.
   * Não é possível remover um produto Stripe que tenha assinaturas ativas —
   * nesses casos o produto é apenas arquivado (active: false) e os preços também.
   */
  async deletePlan(id) {
    const plan = await prisma.adminPlan.findUnique({ where: { id } });
    if (!plan) throw new AppError('Plano nao encontrado.', 404, 'PLAN_NOT_FOUND');

    // Arquiva produto e preços no Stripe antes de remover do banco (não-bloqueante)
    await this.archiveInStripe(plan).catch((err) =>
      console.warn(`[deletePlan] Stripe archive falhou para plano ${plan.name}:`, err.message)
    );

    // Remove do banco (hard delete)
    await prisma.adminPlan.delete({ where: { id } });

    console.log(`[deletePlan] Plano "${plan.name}" (id: ${id}) removido do banco.`);
    return { deleted: true, name: plan.name };
  },

  /**
   * Verifica os IDs do Stripe para um plano específico (chamada individual).
   */
  async verifyStripeIds(id) {
    const plan = await prisma.adminPlan.findUnique({ where: { id } });
    if (!plan) throw new AppError('Plano nao encontrado.', 404, 'PLAN_NOT_FOUND');

    const stripePriceIds = plan.stripePriceIds || {};
    const results = {};

    for (const [interval, priceId] of Object.entries(stripePriceIds)) {
      if (!priceId) {
        results[interval] = { valid: false, reason: 'No price ID configured' };
        continue;
      }
      try {
        const price = await stripe.prices.retrieve(priceId);
        results[interval] = {
          valid: price.active,
          priceId,
          amount: price.unit_amount / 100,
          currency: price.currency,
          active: price.active,
        };
      } catch (err) {
        results[interval] = { valid: false, priceId, reason: err.message };
      }
    }

    return { plan: plan.name, results };
  },
};

module.exports = adminPlanService;
