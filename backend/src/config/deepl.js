const axios = require('axios');
const { getDeeplTarget } = require('../lib/localeOptions');

// ─── DeepL — tradução de texto ────────────────────────────────────────────
// Segue o mesmo espírito do StripeService (config/stripe.js): nunca quebra
// a experiência do comprador se a API terceira falhar ou a chave não
// estiver configurada — nesses casos, retorna os textos originais.

const DEEPL_BATCH_SIZE = 50; // limite da API DeepL por requisição

function apiBaseUrl() {
  const key = process.env.DEEPL_API_KEY || '';
  return key.endsWith(':fx') ? 'https://api-free.deepl.com/v2' : 'https://api.deepl.com/v2';
}

function isConfigured() {
  const key = process.env.DEEPL_API_KEY || '';
  return key.length > 0 && !key.includes('CHANGE_ME');
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const DeepLService = {
  /**
   * Traduz um lote de textos. Em qualquer falha (chave ausente, API fora do
   * ar, idioma não suportado), retorna os textos originais sem tradução —
   * nunca lança, para não derrubar o widget da vitrine.
   */
  async translateBatch(texts, targetLanguageCode, sourceLanguageCode) {
    if (!Array.isArray(texts) || texts.length === 0) return [];

    const targetLang = getDeeplTarget(targetLanguageCode);
    if (!isConfigured() || !targetLang) return texts;

    const sourceLang = sourceLanguageCode ? getDeeplTarget(sourceLanguageCode)?.split('-')[0] : undefined;

    try {
      const batches = chunk(texts, DEEPL_BATCH_SIZE);
      const results = [];
      for (const batch of batches) {
        const response = await axios.post(
          `${apiBaseUrl()}/translate`,
          {
            text: batch,
            target_lang: targetLang,
            ...(sourceLang ? { source_lang: sourceLang } : {}),
          },
          {
            headers: {
              Authorization: `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          }
        );
        results.push(...response.data.translations.map((t) => t.text));
      }
      return results;
    } catch (err) {
      return texts;
    }
  },

  isConfigured,
};

module.exports = { DeepLService };
