const express = require('express');
const crypto = require('crypto');
const geoip = require('geoip-lite');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { DeepLService } = require('../config/deepl');
const { ExchangeRateService } = require('../config/exchangeRate');
const { isValidLanguage, SUPPORTED_COUNTRIES, COUNTRY_DEFAULTS } = require('../lib/localeOptions');

const router = express.Router();

// Rotas PUBLICAS — chamadas pelo widget (public/widget.js) rodando no
// navegador de compradores anonimos na vitrine. Sem requireAuth: a loja e
// identificada pelo nuvemshopId enviado como parametro, nao por sessao.

const MAX_TEXTS_PER_REQUEST = 200;
const MAX_TEXT_LENGTH = 2000;

const COUNTRY_LABELS = SUPPORTED_COUNTRIES.reduce((acc, c) => {
  acc[c.code] = c.label;
  return acc;
}, {});

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Acha um pais cujo idioma+moeda padrao (COUNTRY_DEFAULTS) batam exatamente
 * com o idioma/moeda de origem configurados pelo lojista — usado so pra dar
 * uma bandeira "nativa" ao seletor do widget (best-effort, heuristico: nao
 * ha campo de pais de origem no schema, so idioma+moeda).
 */
function findHomeCountry(sourceLanguage, baseCurrency) {
  const code = Object.keys(COUNTRY_DEFAULTS).find((c) => {
    const d = COUNTRY_DEFAULTS[c];
    return d.language === sourceLanguage && d.currency === baseCurrency;
  });
  if (!code) return null;
  return { code, name: COUNTRY_LABELS[code] || code, language: sourceLanguage, currency: baseCurrency };
}

/**
 * GET /storefront/rules?store={nuvemshopId}
 * Lista os paises com regra de idioma/moeda configurada pelo lojista, para o
 * widget renderizar o seletor manual de bandeiras (fallback do geoip por IP)
 * — mais a bandeira "home" (idioma/moeda de origem da loja), pro comprador
 * voltar facilmente ao conteudo nativo.
 */
router.get('/rules', async (req, res, next) => {
  try {
    const { store: nuvemshopId } = req.query;
    if (!nuvemshopId) {
      throw new AppError('Parametro store obrigatorio.', 400, 'MISSING_STORE');
    }

    const store = await prisma.store.findUnique({
      where: { nuvemshopId: String(nuvemshopId) },
      include: { translationConfig: true, localeRules: true },
    });

    if (!store || !store.translationConfig?.enabled) {
      return res.json({ countries: [], home: null });
    }

    const config = store.translationConfig;
    // Regra sem efeito (mesmo idioma E mesma moeda da origem) fica de fora do
    // seletor — selecioná-la nao mudaria nada (mesma condicao usada em
    // /storefront/config pra retornar active:false) e, quando o pais da regra
    // e o mesmo do "home" calculado abaixo, geraria bandeira duplicada.
    const countries = store.localeRules
      .filter((rule) => rule.language !== config.sourceLanguage || rule.currency !== config.baseCurrency)
      .map((rule) => ({
        code: rule.country,
        name: COUNTRY_LABELS[rule.country] || rule.country,
        language: rule.language,
        currency: rule.currency,
      }));
    const home = findHomeCountry(config.sourceLanguage, config.baseCurrency);

    res.json({ countries, home });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /storefront/config?store={nuvemshopId}
 * Detecta o pais do visitante (geoip por IP) e retorna o idioma/moeda alvo
 * configurados pelo lojista para esse pais, se houver.
 */
router.get('/config', async (req, res, next) => {
  try {
    const { store: nuvemshopId } = req.query;
    if (!nuvemshopId) {
      throw new AppError('Parametro store obrigatorio.', 400, 'MISSING_STORE');
    }

    const store = await prisma.store.findUnique({
      where: { nuvemshopId: String(nuvemshopId) },
      include: { translationConfig: true },
    });

    if (!store || !store.translationConfig?.enabled) {
      return res.json({ active: false });
    }

    const config = store.translationConfig;
    // geoip-lite não resolve IPs locais/privados (ex: dev em localhost) — o
    // override abaixo existe só para permitir testar o fluxo manualmente.
    const geo = geoip.lookup(req.ip);
    const country = req.query.country ? String(req.query.country).toUpperCase() : geo?.country;

    if (!country) {
      return res.json({ active: false });
    }

    const rule = await prisma.storeLocaleRule.findUnique({
      where: { storeId_country: { storeId: store.id, country } },
    });

    if (!rule) {
      return res.json({ active: false });
    }

    const sameLanguage = rule.language === config.sourceLanguage;
    const sameCurrency = rule.currency === config.baseCurrency;
    if (sameLanguage && sameCurrency) {
      return res.json({ active: false });
    }

    const rate = sameCurrency ? 1 : await ExchangeRateService.getRate(config.baseCurrency, rule.currency);

    res.json({
      active: true,
      sourceLanguage: config.sourceLanguage,
      targetLanguage: rule.language,
      baseCurrency: config.baseCurrency,
      targetCurrency: rule.currency,
      rate,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /storefront/translate
 * body: { store, texts: [...], sourceLang, targetLang }
 * Traduz em lote com cache (TranslationCache); so chama o DeepL para os
 * textos que ainda nao estao no cache.
 */
router.post('/translate', async (req, res, next) => {
  try {
    const { store: nuvemshopId, texts, sourceLang, targetLang } = req.body;

    if (!nuvemshopId) {
      throw new AppError('Parametro store obrigatorio.', 400, 'MISSING_STORE');
    }
    if (!Array.isArray(texts) || texts.length === 0) {
      throw new AppError('texts deve ser um array nao vazio.', 400, 'INVALID_TEXTS');
    }
    if (texts.length > MAX_TEXTS_PER_REQUEST) {
      throw new AppError(`Maximo de ${MAX_TEXTS_PER_REQUEST} textos por requisicao.`, 400, 'TOO_MANY_TEXTS');
    }
    if (!isValidLanguage(targetLang)) {
      throw new AppError('targetLang invalido.', 400, 'INVALID_LANGUAGE');
    }

    const store = await prisma.store.findUnique({ where: { nuvemshopId: String(nuvemshopId) } });
    if (!store) {
      throw new AppError('Loja nao encontrada.', 404, 'STORE_NOT_FOUND');
    }

    const safeTexts = texts.map((t) => String(t).slice(0, MAX_TEXT_LENGTH));
    const hashes = safeTexts.map(sha256);

    const cached = await prisma.translationCache.findMany({
      where: { sourceHash: { in: hashes }, sourceLang: sourceLang || '', targetLang },
    });
    const cacheMap = new Map(cached.map((c) => [c.sourceHash, c.translatedText]));

    const missIndexes = [];
    const missTexts = [];
    safeTexts.forEach((text, i) => {
      if (!cacheMap.has(hashes[i])) {
        missIndexes.push(i);
        missTexts.push(text);
      }
    });

    if (missTexts.length > 0) {
      const translated = await DeepLService.translateBatch(missTexts, targetLang, sourceLang);

      const rowsToCache = [];
      missIndexes.forEach((originalIndex, j) => {
        const translatedText = translated[j] ?? safeTexts[originalIndex];
        cacheMap.set(hashes[originalIndex], translatedText);
        rowsToCache.push({
          sourceHash: hashes[originalIndex],
          sourceLang: sourceLang || '',
          targetLang,
          sourceText: safeTexts[originalIndex],
          translatedText,
        });
      });

      if (rowsToCache.length > 0) {
        await prisma.translationCache.createMany({ data: rowsToCache, skipDuplicates: true });
      }
    }

    const translations = safeTexts.map((text, i) => cacheMap.get(hashes[i]) ?? text);
    res.json({ translations });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
