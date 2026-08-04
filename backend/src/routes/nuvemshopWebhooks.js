const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { createNuvemshopClient } = require('../config/nuvemshop');

const router = express.Router();

/**
 * Valida o HMAC do webhook (header x-linkedstore-hmac-sha256 = HMAC-SHA256 do raw
 * body com o client_secret). Tolerante a encoding (hex ou base64) e timing-safe.
 * Retorna: true = confere | false = header presente mas NÃO confere | null = não
 * dá para verificar (sem secret/header/raw body — ex.: chamada manual/dev).
 */
function checkHmac(req) {
  const secret = process.env.NUVEMSHOP_CLIENT_SECRET;
  const header = req.headers['x-linkedstore-hmac-sha256'];
  if (!secret || !header || !req.rawBody) return null;
  const hex = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  const b64 = crypto.createHmac('sha256', secret).update(req.rawBody).digest('base64');
  const safeEq = (a, b) => {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
  };
  return safeEq(header, hex) || safeEq(header, b64);
}

/**
 * Webhooks da Nuvemshop. Configurados no Partner Portal apontando para estas URLs.
 * Body: { store_id, event } (JSON). Responder 200 é obrigatório para a homologação.
 *
 * HMAC (header x-linkedstore-hmac-sha256) é hardening futuro — exige raw body nesta
 * rota. Por ora processamos sem verificação estrita: as ações são não-destrutivas
 * (apenas sinalizam a desinstalação; a exclusão de dados é manual no admin).
 */

// Marca a data de desinstalação na loja. Idempotente: não sobrescreve data anterior.
async function markUninstalled(storeId) {
  if (!storeId) return;
  try {
    await prisma.store.updateMany({
      where: { nuvemshopId: String(storeId), uninstalledAt: null },
      data: { uninstalledAt: new Date() },
    });
  } catch (err) {
    console.error('[nuvemshop-webhook] markUninstalled falhou:', err.message);
  }
}

/**
 * POST /webhooks/app/uninstalled — a loja desinstalou o app.
 */
router.post('/app/uninstalled', async (req, res) => {
  if (checkHmac(req) === false) {
    console.warn('[nuvemshop] app/uninstalled com HMAC invalido — ignorado');
    return res.status(401).json({ error: 'Invalid HMAC.' });
  }
  const storeId = req.body?.store_id;
  console.log(`[nuvemshop] app/uninstalled store_id=${storeId}`);
  await markUninstalled(storeId);
  res.status(200).json({ success: true });
});

/**
 * POST /webhooks/store/redact — LGPD: solicitação de exclusão ~48h após desinstalação.
 * Também marca a desinstalação (rede de segurança caso app/uninstalled não chegue).
 */
router.post('/store/redact', async (req, res) => {
  // LGPD exige sempre 200 (homologação) — em HMAC inválido apenas logamos e
  // NÃO marcamos a desinstalação, evitando poluição por requisição forjada.
  const hmac = checkHmac(req);
  const storeId = req.body?.store_id;
  console.log(`[nuvemshop][LGPD] store/redact store_id=${storeId} hmac=${hmac}`);
  if (hmac !== false) await markUninstalled(storeId);
  res.status(200).json({ success: true });
});

/**
 * POST /webhooks/customers/redact — LGPD (não armazenamos PII de clientes da loja).
 */
router.post('/customers/redact', (req, res) => {
  console.log(`[nuvemshop][LGPD] customers/redact store_id=${req.body?.store_id}`);
  res.status(200).json({ success: true });
});

/**
 * POST /webhooks/customers/data_request — LGPD (não armazenamos PII de clientes da loja).
 */
router.post('/customers/data_request', (req, res) => {
  console.log(`[nuvemshop][LGPD] customers/data_request store_id=${req.body?.store_id}`);
  res.status(200).json({ success: true, data: [] });
});

/**
 * Busca o pedido completo (o payload do webhook só traz store_id/event/id) e
 * grava em OrderRecord — fonte do mapa/gráfico de vendas por país no
 * Dashboard. Best-effort: nunca lança, roda fire-and-forget após o 200.
 */
async function recordPaidOrder(nuvemshopStoreId, orderId) {
  if (!nuvemshopStoreId || !orderId) return;
  try {
    const store = await prisma.store.findUnique({ where: { nuvemshopId: String(nuvemshopStoreId) } });
    if (!store || !store.accessToken) return;

    const client = createNuvemshopClient(store.nuvemshopId, store.accessToken);
    const { data: order } = await client.get(`/orders/${orderId}`);

    const amount = Number(order.total_paid_by_customer);
    if (!Number.isFinite(amount)) return;

    const country = order.shipping_address?.country || order.billing_address?.country || null;

    await prisma.orderRecord.upsert({
      where: { storeId_nuvemshopOrderId: { storeId: store.id, nuvemshopOrderId: String(orderId) } },
      update: {},
      create: {
        storeId: store.id,
        nuvemshopOrderId: String(orderId),
        country,
        amount,
        currency: order.currency || store.translationConfig?.baseCurrency || 'BRL',
        paidAt: order.paid_at ? new Date(order.paid_at) : new Date(),
      },
    });
  } catch (err) {
    console.error('[nuvemshop-webhook] recordPaidOrder falhou:', err.message);
  }
}

/**
 * POST /webhooks/order/paid — pedido pago, fonte do mapa/gráfico de vendas
 * por país no Dashboard. Sempre responde 200 rápido (exigido pela Nuvemshop);
 * a busca do pedido completo + grava roda depois, fire-and-forget.
 */
router.post('/order/paid', (req, res) => {
  if (checkHmac(req) === false) {
    console.warn('[nuvemshop] order/paid com HMAC invalido — ignorado');
    return res.status(401).json({ error: 'Invalid HMAC.' });
  }
  recordPaidOrder(req.body?.store_id, req.body?.id);
  res.status(200).json({ success: true });
});

module.exports = router;
