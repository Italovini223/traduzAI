const express = require('express');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

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

    const orders = await prisma.orderRecord.findMany({
      where: { storeId: req.store.id, paidAt: { gte: from, lte: to } },
      select: { country: true, amount: true, paidAt: true },
    });

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

    res.json({
      from: from.toISOString(),
      to: to.toISOString(),
      totals: {
        salesCount: orders.length,
        revenue: orders.reduce((sum, order) => sum + order.amount, 0),
      },
      byCountry,
      timeseries,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
