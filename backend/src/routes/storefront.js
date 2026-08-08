const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { DeepLService } = require('../config/deepl');
const { ExchangeRateService } = require('../config/exchangeRate');
const { GeoIPService } = require('../config/geoip');
const { VisionService } = require('../config/vision');
const { isValidLanguage, isValidCountry, SUPPORTED_COUNTRIES, COUNTRY_DEFAULTS } = require('../lib/localeOptions');
const { upsertTranslationOverride } = require('../lib/translationOverrides');
const { translateTexts, sha256 } = require('../lib/translateText');

const router = express.Router();

// Rotas PUBLICAS — chamadas pelo widget (public/widget.js) rodando no
// navegador de compradores anonimos na vitrine. Sem requireAuth: a loja e
// identificada pelo nuvemshopId enviado como parametro, nao por sessao.

const MAX_TEXTS_PER_REQUEST = 200;

const COUNTRY_LABELS = SUPPORTED_COUNTRIES.reduce((acc, c) => {
  acc[c.code] = c.label;
  return acc;
}, {});

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

    res.json({
      countries,
      home,
      pickerPosition: config.pickerPosition,
      pickerColor: config.pickerColor,
    });
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
    // GeoIPService: geoip-lite local primeiro, cai pra API externa (ipapi.co)
    // só quando a base local não reconhece o IP — nenhum dos dois resolve IP
    // privado/local (ex: dev em localhost), por isso o override abaixo existe
    // pra permitir testar o fluxo manualmente.
    const country = req.query.country
      ? String(req.query.country).toUpperCase()
      : await GeoIPService.lookupCountry(req.ip);

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
      country,
      sourceLanguage: config.sourceLanguage,
      targetLanguage: rule.language,
      baseCurrency: config.baseCurrency,
      targetCurrency: rule.currency,
      rate,
      translateImages: config.translateImages,
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
    const { store: nuvemshopId, texts, sourceLang, targetLang, country } = req.body;

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
    if (country !== undefined && country !== null && !isValidCountry(country)) {
      throw new AppError('Pais invalido.', 400, 'INVALID_COUNTRY');
    }

    const store = await prisma.store.findUnique({ where: { nuvemshopId: String(nuvemshopId) } });
    if (!store) {
      throw new AppError('Loja nao encontrada.', 404, 'STORE_NOT_FOUND');
    }

    // Pipeline completo (correção manual > cache > DeepL > glossário de
    // país) mora em lib/translateText.js — reaproveitado também pelo preview
    // de SEO no admin (routes/translations.js).
    const finalTranslations = await translateTexts({
      storeId: store.id,
      texts,
      sourceLang,
      targetLang,
      country,
    });

    res.json({ translations: finalTranslations });
  } catch (err) {
    next(err);
  }
});

const MAX_IMAGES_PER_REQUEST = 15;

/**
 * POST /storefront/translate-image
 * body: { store, imageUrls: [...], sourceLang, targetLang }
 * Detecta texto embutido em imagem (OCR via Google Vision) + traduz, com
 * cache (ImageTextCache) — so chama a API externa pra imagem/idioma que
 * ainda nao foi processado (inclusive "sem texto encontrado" fica em cache,
 * pra nao reprocessar foto de produto sem texto a cada load de pagina).
 * Feature opt-in: so roda se translateImages estiver habilitado na loja.
 */
router.post('/translate-image', async (req, res, next) => {
  try {
    const { store: nuvemshopId, imageUrls, sourceLang, targetLang } = req.body;

    if (!nuvemshopId) {
      throw new AppError('Parametro store obrigatorio.', 400, 'MISSING_STORE');
    }
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      throw new AppError('imageUrls deve ser um array nao vazio.', 400, 'INVALID_IMAGE_URLS');
    }
    if (imageUrls.length > MAX_IMAGES_PER_REQUEST) {
      throw new AppError(`Maximo de ${MAX_IMAGES_PER_REQUEST} imagens por requisicao.`, 400, 'TOO_MANY_IMAGES');
    }
    if (!isValidLanguage(targetLang)) {
      throw new AppError('targetLang invalido.', 400, 'INVALID_LANGUAGE');
    }

    const store = await prisma.store.findUnique({
      where: { nuvemshopId: String(nuvemshopId) },
      include: { translationConfig: true },
    });

    if (!store || !store.translationConfig?.enabled) {
      return res.json({ images: {} });
    }

    const safeUrls = imageUrls.map((u) => String(u).slice(0, 2000));
    const hashes = safeUrls.map(sha256);

    // Banner personalizado (upload manual do lojista) tem prioridade e não
    // depende do toggle de tradução automática — sem custo de Vision, é uma
    // imagem de verdade em vez de overlay de canvas em cima da original.
    const bannerOverrides = await prisma.storeBannerOverride.findMany({
      where: { storeId: store.id, originalImageHash: { in: hashes }, targetLang },
    });
    const bannerMap = new Map(bannerOverrides.map((b) => [b.originalImageHash, b.replacementImage]));

    const images = {};
    const pendingUrls = [];
    const pendingHashes = [];
    safeUrls.forEach((url, i) => {
      const hash = hashes[i];
      if (bannerMap.has(hash)) {
        images[url] = { blocks: [], replacementImage: bannerMap.get(hash) };
      } else {
        pendingUrls.push(url);
        pendingHashes.push(hash);
      }
    });

    if (!store.translationConfig?.translateImages || pendingUrls.length === 0) {
      return res.json({ images });
    }

    const cached = await prisma.imageTextCache.findMany({
      where: { imageUrlHash: { in: pendingHashes }, targetLang },
    });
    const cacheMap = new Map(cached.map((c) => [c.imageUrlHash, c.blocks]));

    const toProcess = [];
    pendingUrls.forEach((url, i) => {
      const hash = pendingHashes[i];
      if (cacheMap.has(hash)) {
        images[url] = { blocks: cacheMap.get(hash) };
      } else {
        toProcess.push({ url, hash });
      }
    });

    for (const { url, hash } of toProcess) {
      // detectTextBlocks lanca em erro real (rede/API) — so cacheia quando
      // a chamada teve SUCESSO (inclusive "sem texto encontrado", que e um
      // resultado valido). Erro transitorio nunca deve virar cache
      // permanente de "sem texto" — ja aconteceu de verdade, ver vision.js.
      let detected;
      try {
        detected = await VisionService.detectTextBlocks(url);
      } catch (err) {
        console.error('[storefront] detectTextBlocks falhou pra', url, '-', err.message);
        images[url] = { blocks: [] };
        continue;
      }

      let blocksWithTranslation = [];
      if (detected.length > 0) {
        const texts = detected.map((b) => b.text);
        const translations = await DeepLService.translateBatch(texts, targetLang, sourceLang);
        blocksWithTranslation = detected.map((b, i) => ({ ...b, translatedText: translations[i] || b.text }));
      }

      images[url] = { blocks: blocksWithTranslation };

      try {
        await prisma.imageTextCache.upsert({
          where: { imageUrlHash_targetLang: { imageUrlHash: hash, targetLang } },
          update: { blocks: blocksWithTranslation },
          create: { imageUrlHash: hash, targetLang, blocks: blocksWithTranslation },
        });
      } catch { /* cache best-effort — nao impede a resposta */ }
    }

    res.json({ images });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /storefront/edit-override
 * body: { store, editToken, sourceText, targetLang, overrideText }
 * Único endpoint PÚBLICO que escreve em StoreTranslationOverride — usado
 * pelo "modo de edição" da vitrine (clicar num texto traduzido e corrigir
 * ali mesmo, ver widget.js). Sem requireAuth (a vitrine não tem o JWT do
 * admin, domínio diferente), mas NUNCA aceita sem editToken válido: token
 * é assinado pelo backend em POST /api/translations/edit-session (rota
 * autenticada), expira em 30min e é escopado (scope: 'translate-edit') —
 * sem isso, qualquer visitante da loja poderia poluir a tradução alheia.
 */
router.post('/edit-override', async (req, res, next) => {
  try {
    const { store: nuvemshopId, editToken, sourceText, targetLang, overrideText } = req.body;

    if (!nuvemshopId) {
      throw new AppError('Parametro store obrigatorio.', 400, 'MISSING_STORE');
    }
    if (!editToken) {
      throw new AppError('Token de edicao obrigatorio.', 401, 'MISSING_EDIT_TOKEN');
    }

    let decoded;
    try {
      decoded = jwt.verify(editToken, process.env.JWT_SECRET);
    } catch {
      throw new AppError('Token de edicao invalido ou expirado.', 401, 'INVALID_EDIT_TOKEN');
    }
    if (decoded.scope !== 'translate-edit') {
      throw new AppError('Token de edicao invalido.', 401, 'INVALID_EDIT_TOKEN');
    }

    const store = await prisma.store.findUnique({ where: { nuvemshopId: String(nuvemshopId) } });
    if (!store || store.id !== decoded.storeId) {
      throw new AppError('Loja nao encontrada.', 404, 'STORE_NOT_FOUND');
    }

    if (typeof sourceText !== 'string' || !sourceText.trim()) {
      throw new AppError('Texto original obrigatorio.', 400, 'MISSING_SOURCE_TEXT');
    }
    if (typeof overrideText !== 'string' || !overrideText.trim()) {
      throw new AppError('Traducao corrigida obrigatoria.', 400, 'MISSING_OVERRIDE_TEXT');
    }
    if (!isValidLanguage(targetLang)) {
      throw new AppError('targetLang invalido.', 400, 'INVALID_LANGUAGE');
    }

    const override = await upsertTranslationOverride({ storeId: store.id, sourceText, targetLang, overrideText });
    res.status(201).json({ override });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
