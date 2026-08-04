const axios = require('axios');

const NUVEMSHOP_AUTH_URL = 'https://www.tiendanube.com/apps/authorize/token';
const NUVEMSHOP_API_BASE = 'https://api.tiendanube.com/v1';

/**
 * Exchange authorization code for access token via Nuvemshop OAuth.
 */
async function exchangeCodeForToken(code) {
  const response = await axios.post(NUVEMSHOP_AUTH_URL, {
    client_id: process.env.NUVEMSHOP_CLIENT_ID,
    client_secret: process.env.NUVEMSHOP_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
  });

  return {
    accessToken: response.data.access_token,
    userId: String(response.data.user_id),
    tokenType: response.data.token_type,
  };
}

/**
 * Create an authenticated Nuvemshop API client for a specific store.
 * Uses "Authentication" header as required by Nuvemshop API.
 */
function createNuvemshopClient(storeNuvemshopId, accessToken) {
  const client = axios.create({
    baseURL: `${NUVEMSHOP_API_BASE}/${storeNuvemshopId}`,
    headers: {
      'Authentication': `bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'User-Agent': `${process.env.APP_NAME || 'NuvemProApp'} (${process.env.APP_EMAIL || 'contato@app.com'})`,
    },
    timeout: 15000,
  });

  return client;
}

/**
 * Fetch store info from Nuvemshop API.
 */
async function fetchStoreInfo(storeNuvemshopId, accessToken) {
  const client = createNuvemshopClient(storeNuvemshopId, accessToken);
  const response = await client.get('/store');
  return response.data;
}

/**
 * Garante que a loja tenha uma subscription do webhook order/paid (fonte do
 * mapa/gráfico de vendas por país no Dashboard) — cria só se ainda não
 * existir, pra não duplicar subscription a cada reinstalação.
 */
async function ensureOrderPaidWebhook(storeNuvemshopId, accessToken, webhookUrl) {
  const client = createNuvemshopClient(storeNuvemshopId, accessToken);
  const { data: existing } = await client.get('/webhooks');
  const alreadyRegistered = Array.isArray(existing) && existing.some((w) => w.event === 'order/paid' && w.url === webhookUrl);
  if (alreadyRegistered) return;

  await client.post('/webhooks', { event: 'order/paid', url: webhookUrl });
}

module.exports = {
  exchangeCodeForToken,
  createNuvemshopClient,
  fetchStoreInfo,
  ensureOrderPaidWebhook,
  NUVEMSHOP_AUTH_URL,
  NUVEMSHOP_API_BASE,
};
