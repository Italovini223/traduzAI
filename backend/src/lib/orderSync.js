const prisma = require('./prisma');
const { createNuvemshopClient } = require('../config/nuvemshop');

// Extrai os campos que importam do recurso Order da Nuvemshop. Usado tanto
// pelo webhook (order/paid, 1 pedido por vez) quanto pelo backfill/sync
// (histórico, paginado) — mesma lógica, uma fonte só.
function extractOrderFields(order) {
  const amount = Number(order.total_paid_by_customer);
  if (!Number.isFinite(amount)) return null;
  return {
    country: order.shipping_address?.country || order.billing_address?.country || null,
    amount,
    currency: order.currency || 'BRL',
    paidAt: order.paid_at ? new Date(order.paid_at) : new Date(),
  };
}

/**
 * Upsert de um pedido em OrderRecord. Idempotente por [storeId,
 * nuvemshopOrderId] — reentrega de webhook ou reprocesso do backfill nunca
 * duplica a linha. Retorna true se salvou, false se o pedido não tinha valor
 * numérico válido (não deveria acontecer com payment_status=paid, mas não
 * quebra o fluxo se acontecer).
 */
async function saveOrderRecord(storeId, orderId, order) {
  const fields = extractOrderFields(order);
  if (!fields) return false;

  await prisma.orderRecord.upsert({
    where: { storeId_nuvemshopOrderId: { storeId, nuvemshopOrderId: String(orderId) } },
    update: {},
    create: {
      storeId,
      nuvemshopOrderId: String(orderId),
      country: fields.country,
      amount: fields.amount,
      currency: fields.currency,
      paidAt: fields.paidAt,
    },
  });
  return true;
}

/**
 * Busca um pedido completo pelo id (payload do webhook só traz o id).
 */
async function fetchOrderById(store, orderId) {
  const client = createNuvemshopClient(store.nuvemshopId, store.accessToken);
  const { data } = await client.get(`/orders/${orderId}`);
  return data;
}

const PER_PAGE = 50;
const MAX_PAGES = 200; // trava de seguranca (~10k pedidos) — evita loop infinito

/**
 * Backfill: busca TODOS os pedidos pagos da loja (paginado) e grava em
 * OrderRecord. Necessário porque o webhook order/paid só cobre eventos
 * futuros a partir do registro da subscription — lojas que instalaram o app
 * antes dessa feature existir (ou que tem pedidos manuais marcados como
 * pagos sem passar pelo fluxo de Transaction que dispara o webhook) nunca
 * teriam esses pedidos capturados de outra forma.
 */
async function syncPaidOrders(store) {
  const client = createNuvemshopClient(store.nuvemshopId, store.accessToken);
  let page = 1;
  let synced = 0;

  while (page <= MAX_PAGES) {
    const { data: orders } = await client.get('/orders', {
      params: { payment_status: 'paid', page, per_page: PER_PAGE },
    });
    if (!Array.isArray(orders) || orders.length === 0) break;

    for (const order of orders) {
      const saved = await saveOrderRecord(store.id, order.id, order);
      if (saved) synced += 1;
    }

    if (orders.length < PER_PAGE) break;
    page += 1;
  }

  return synced;
}

module.exports = { saveOrderRecord, fetchOrderById, syncPaidOrders };
