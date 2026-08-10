const express = require('express');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { ensureOrderPaidWebhook } = require('../config/nuvemshop');
const { syncPaidOrders } = require('../lib/orderSync');
const { findHomeCountry, COUNTRY_LABELS } = require('../lib/localeOptions');

const router = express.Router();
router.use(requireAuth);

/**
 * POST /api/analytics/sync
 * Registra o webhook order/paid (se ainda não existir) e faz backfill dos
 * pedidos já pagos via API — necessário pra lojas que instalaram o app antes
 * dessa feature existir (webhook só cobre eventos futuros) e pra pedidos
 * manuais marcados como pagos sem passar pelo fluxo que dispara o webhook.
 */
router.post('/sync', async (req, res, next) => {
  try {
    const store = req.store;
    if (process.env.BACKEND_URL) {
      try {
        await ensureOrderPaidWebhook(store.nuvemshopId, store.accessToken, `${process.env.BACKEND_URL}/webhooks/order/paid`);
      } catch { /* best-effort — sync de pedidos nao depende do webhook estar ok */ }
    }

    const synced = await syncPaidOrders(store);
    res.json({ synced });
  } catch (err) {
    next(err);
  }
});

function parseDateParam(value, fallback) {
  if (!value) return fallback;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * GET /api/analytics/sales?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Agrega OrderRecord (vendas pagas, gravadas via webhook order/paid) da loja
 * logada por pais (quantidade + faturamento) e por dia (serie historica).
 * Sem parametros, usa os ultimos 30 dias.
 */
router.get('/sales', async (req, res, next) => {
  try {
    const now = new Date();
    const defaultFrom = new Date(now);
    defaultFrom.setDate(defaultFrom.getDate() - 30);

    const from = parseDateParam(req.query.from, defaultFrom);
    const to = parseDateParam(req.query.to, now);
    if (from > to) {
      throw new AppError('Data inicial nao pode ser depois da data final.', 400, 'INVALID_RANGE');
    }

    const [orders, config, rules] = await Promise.all([
      prisma.orderRecord.findMany({
        where: { storeId: req.store.id, paidAt: { gte: from, lte: to } },
        select: { country: true, amount: true, paidAt: true },
      }),
      prisma.storeTranslationConfig.findUnique({ where: { storeId: req.store.id } }),
      prisma.storeLocaleRule.findMany({ where: { storeId: req.store.id } }),
    ]);

    const byCountryMap = new Map();
    const byDayMap = new Map();

    for (const order of orders) {
      const country = order.country || 'UNKNOWN';
      const dayKey = order.paidAt.toISOString().slice(0, 10);

      const countryEntry = byCountryMap.get(country) || { country, salesCount: 0, revenue: 0 };
      countryEntry.salesCount += 1;
      countryEntry.revenue += order.amount;
      byCountryMap.set(country, countryEntry);

      const dayEntry = byDayMap.get(dayKey) || { date: dayKey, salesCount: 0, revenue: 0 };
      dayEntry.salesCount += 1;
      dayEntry.revenue += order.amount;
      byDayMap.set(dayKey, dayEntry);
    }

    const byCountry = Array.from(byCountryMap.values()).sort((a, b) => b.revenue - a.revenue);
    const timeseries = Array.from(byDayMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    // Impacto da traducao: separa o faturamento entre "origem" (pais de onde
    // a loja fala nativamente, heuristica via idioma+moeda — ver
    // findHomeCountry), "traduzido" (pais com regra de idioma/moeda
    // cadastrada em Settings) e "outros" (venda de pais sem regra e que nao e
    // a origem — candidato a nova regra, ver opportunityCountries abaixo).
    // So calcula se a config existir; sem ela nao ha como saber o que e
    // "origem" nem regra pra comparar.
    let translationImpact = null;
    let opportunityCountries = [];

    if (config) {
      const home = findHomeCountry(config.sourceLanguage, config.baseCurrency);
      const ruleCountries = new Set(rules.map((r) => r.country));

      const impact = {
        origin: { salesCount: 0, revenue: 0 },
        translated: { salesCount: 0, revenue: 0 },
        other: { salesCount: 0, revenue: 0 },
      };

      byCountry.forEach((entry) => {
        const bucket = entry.country === home?.code ? 'origin' : ruleCountries.has(entry.country) ? 'translated' : 'other';
        impact[bucket].salesCount += entry.salesCount;
        impact[bucket].revenue += entry.revenue;
      });

      translationImpact = { homeCountry: home?.code || null, ...impact };

      opportunityCountries = byCountry
        .filter((entry) => entry.country !== 'UNKNOWN' && entry.country !== home?.code && !ruleCountries.has(entry.country))
        .map((entry) => ({ ...entry, label: COUNTRY_LABELS[entry.country] || entry.country }))
        .slice(0, 5);
    }

    res.json({
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        salesCount: orders.length,
        revenue: orders.reduce((sum, order) => sum + order.amount, 0),
      },
      byCountry,
      timeseries,
      translationImpact,
      opportunityCountries,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
