const axios = require('axios');
const prisma = require('../lib/prisma');

// ─── exchangerate-api.com — taxas de câmbio ───────────────────────────────
// Banco como cache (mesmo princípio do AdminConfig.stripe_mode): a taxa fica
// guardada em ExchangeRate com um TTL; só bate na API externa quando o cache
// expira. Se a API falhar, usa o cache expirado em vez de quebrar a exibição
// de preço na vitrine.

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function isConfigured() {
  const key = process.env.EXCHANGERATE_API_KEY || '';
  return key.length > 0 && !key.includes('CHANGE_ME');
}

const ExchangeRateService = {
  /**
   * Retorna a taxa base->quote. Nunca lança: em falha total (sem chave, sem
   * cache, API fora do ar) retorna null, e o chamador mantém o preço original.
   */
  async getRate(base, quote) {
    if (base === quote) return 1;

    const cached = await prisma.exchangeRate.findUnique({
      where: { baseCurrency_quoteCurrency: { baseCurrency: base, quoteCurrency: quote } },
    });

    const isFresh = cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS;
    if (isFresh) return cached.rate;

    if (!isConfigured()) return cached ? cached.rate : null;

    try {
      const response = await axios.get(
        `https://v6.exchangerate-api.com/v6/${process.env.EXCHANGERATE_API_KEY}/pair/${base}/${quote}`,
        { timeout: 10000 }
      );
      const rate = response.data?.conversion_rate;
      if (typeof rate !== 'number') return cached ? cached.rate : null;

      await prisma.exchangeRate.upsert({
        where: { baseCurrency_quoteCurrency: { baseCurrency: base, quoteCurrency: quote } },
        update: { rate, fetchedAt: new Date() },
        create: { baseCurrency: base, quoteCurrency: quote, rate },
      });

      return rate;
    } catch (err) {
      // API fora do ar: usa cache existente (mesmo expirado) em vez de quebrar.
      return cached ? cached.rate : null;
    }
  },

  isConfigured,
};

module.exports = { ExchangeRateService };
