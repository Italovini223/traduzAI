const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const {
  SUPPORTED_COUNTRIES,
  SUPPORTED_LANGUAGES,
  SUPPORTED_CURRENCIES,
  COUNTRY_DEFAULTS,
  isValidRule,
  isValidLanguage,
  isValidCurrency,
} = require('../lib/localeOptions');

const router = express.Router();

const MAX_OVERRIDE_TEXT_LENGTH = 2000;
const MAX_BANNER_CANDIDATES = 24;

// Mesmo cálculo de hash usado em POST /storefront/translate — precisa bater
// exatamente pra o lookup do override funcionar na vitrine.
function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Extrai candidatos a banner do HTML público da loja — sem parser de DOM
// (evita nova dependência): regex acha cada tag <img ...> e dentro dela o
// src/data-src. Filtra pelo sufixo de dimensão que o CDN da Nuvemshop
// embute no nome do arquivo (ex.: "...-1920-1920.webp", "...-320-0.webp")
// pra priorizar imagem grande (banner) sobre thumbnail de produto/ícone —
// quando a URL não tem esse sufixo, inclui do mesmo jeito (o lojista
// escolhe visualmente pela miniatura, então falso positivo é inofensivo).
const MIN_BANNER_WIDTH_HINT = 600;

// Selo de segurança, "powered by", placeholder de lazy-load — não são
// candidatos plausíveis a banner, aparecem em quase todo tema Nuvemshop e só
// gerariam ruído na grade de miniaturas (confirmado em teste real contra a
// loja de produção: apareceram junto do banner de verdade).
const EXCLUDED_PATTERNS = /logo|placeholder|safe-google|loja_segura|selo|badge|favicon|sprite/i;

function extractBannerCandidates(html, baseUrl) {
  const urls = new Set();
  const imgTagRegex = /<img\b[^>]*>/gi;
  const attrRegex = /(?:src|data-src)\s*=\s*["']([^"']+)["']/i;
  const dimensionHintRegex = /-(\d{2,5})-(\d{1,5})\.\w+(?:\?.*)?$/;

  const imgTags = html.match(imgTagRegex) || [];
  imgTags.forEach((tag) => {
    const match = attrRegex.exec(tag);
    if (!match) return;
    const raw = match[1];
    if (!raw || raw.indexOf('data:') === 0) return;
    if (EXCLUDED_PATTERNS.test(raw)) return;

    let absolute;
    try {
      absolute = new URL(raw, baseUrl).href;
    } catch {
      return;
    }

    const dimMatch = dimensionHintRegex.exec(absolute);
    if (dimMatch && Number(dimMatch[1]) < MIN_BANNER_WIDTH_HINT) return;

    urls.add(absolute);
  });

  return [...urls].slice(0, MAX_BANNER_CANDIDATES);
}

// Todas as rotas de tradução exigem loja logada (configuração feita pelo lojista).
router.use(requireAuth);

/**
 * GET /api/translations/options — listas suportadas para os dropdowns do frontend.
 */
router.get('/options', (req, res) => {
  res.json({
    countries: SUPPORTED_COUNTRIES,
    languages: SUPPORTED_LANGUAGES.map(({ code, label }) => ({ code, label })),
    currencies: SUPPORTED_CURRENCIES,
    defaults: COUNTRY_DEFAULTS,
  });
});

/**
 * GET /api/translations/config — config + regras da loja logada.
 */
router.get('/config', async (req, res, next) => {
  try {
    const [config, rules] = await Promise.all([
      prisma.storeTranslationConfig.findUnique({ where: { storeId: req.store.id } }),
      prisma.storeLocaleRule.findMany({ where: { storeId: req.store.id }, orderBy: { country: 'asc' } }),
    ]);

    res.json({
      config: config || { enabled: false, sourceLanguage: 'pt-BR', baseCurrency: 'BRL', translateImages: false },
      rules,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/translations/config — atualiza enabled/sourceLanguage/baseCurrency.
 */
router.put('/config', async (req, res, next) => {
  try {
    const { enabled, sourceLanguage, baseCurrency, translateImages } = req.body;

    if (sourceLanguage !== undefined && !isValidLanguage(sourceLanguage)) {
      throw new AppError('Idioma de origem invalido.', 400, 'INVALID_LANGUAGE');
    }
    if (baseCurrency !== undefined && !isValidCurrency(baseCurrency)) {
      throw new AppError('Moeda de origem invalida.', 400, 'INVALID_CURRENCY');
    }

    const data = {};
    if (enabled !== undefined) data.enabled = Boolean(enabled);
    if (sourceLanguage !== undefined) data.sourceLanguage = sourceLanguage;
    if (baseCurrency !== undefined) data.baseCurrency = baseCurrency;
    if (translateImages !== undefined) data.translateImages = Boolean(translateImages);

    const config = await prisma.storeTranslationConfig.upsert({
      where: { storeId: req.store.id },
      update: data,
      create: { storeId: req.store.id, ...data },
    });

    res.json({ config });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/translations/rules — cria uma regra pais->idioma/moeda.
 */
router.post('/rules', async (req, res, next) => {
  try {
    const { country, language, currency } = req.body;

    if (!isValidRule({ country, language, currency })) {
      throw new AppError('Pais, idioma ou moeda invalidos.', 400, 'INVALID_RULE');
    }

    const existing = await prisma.storeLocaleRule.findUnique({
      where: { storeId_country: { storeId: req.store.id, country } },
    });
    if (existing) {
      throw new AppError('Ja existe uma regra para este pais.', 409, 'RULE_EXISTS');
    }

    const rule = await prisma.storeLocaleRule.create({
      data: { storeId: req.store.id, country, language, currency },
    });

    res.status(201).json({ rule });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/translations/rules/:id — atualiza idioma/moeda de uma regra.
 */
router.put('/rules/:id', async (req, res, next) => {
  try {
    const { language, currency } = req.body;

    const rule = await prisma.storeLocaleRule.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!rule || rule.storeId !== req.store.id) {
      throw new AppError('Regra nao encontrada.', 404, 'RULE_NOT_FOUND');
    }

    if (language !== undefined && !isValidLanguage(language)) {
      throw new AppError('Idioma invalido.', 400, 'INVALID_LANGUAGE');
    }
    if (currency !== undefined && !isValidCurrency(currency)) {
      throw new AppError('Moeda invalida.', 400, 'INVALID_CURRENCY');
    }

    const data = {};
    if (language !== undefined) data.language = language;
    if (currency !== undefined) data.currency = currency;

    const updated = await prisma.storeLocaleRule.update({ where: { id: rule.id }, data });
    res.json({ rule: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/translations/rules/:id
 */
router.delete('/rules/:id', async (req, res, next) => {
  try {
    const rule = await prisma.storeLocaleRule.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!rule || rule.storeId !== req.store.id) {
      throw new AppError('Regra nao encontrada.', 404, 'RULE_NOT_FOUND');
    }

    await prisma.storeLocaleRule.delete({ where: { id: rule.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/translations/overrides — lista as correções manuais da loja logada.
 */
router.get('/overrides', async (req, res, next) => {
  try {
    const overrides = await prisma.storeTranslationOverride.findMany({
      where: { storeId: req.store.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ overrides });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/translations/overrides — cria uma correção manual.
 * body: { sourceText, targetLang, overrideText }
 */
router.post('/overrides', async (req, res, next) => {
  try {
    const { sourceText, targetLang, overrideText } = req.body;

    if (typeof sourceText !== 'string' || !sourceText.trim()) {
      throw new AppError('Texto original obrigatorio.', 400, 'MISSING_SOURCE_TEXT');
    }
    if (typeof overrideText !== 'string' || !overrideText.trim()) {
      throw new AppError('Traducao corrigida obrigatoria.', 400, 'MISSING_OVERRIDE_TEXT');
    }
    if (!isValidLanguage(targetLang)) {
      throw new AppError('Idioma de destino invalido.', 400, 'INVALID_LANGUAGE');
    }

    const safeSourceText = sourceText.trim().slice(0, MAX_OVERRIDE_TEXT_LENGTH);
    const safeOverrideText = overrideText.trim().slice(0, MAX_OVERRIDE_TEXT_LENGTH);
    const sourceHash = sha256(safeSourceText);

    const override = await prisma.storeTranslationOverride.upsert({
      where: { storeId_sourceHash_targetLang: { storeId: req.store.id, sourceHash, targetLang } },
      update: { overrideText: safeOverrideText, sourceText: safeSourceText },
      create: { storeId: req.store.id, sourceHash, sourceText: safeSourceText, targetLang, overrideText: safeOverrideText },
    });

    res.status(201).json({ override });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/translations/overrides/:id — atualiza o texto corrigido.
 */
router.put('/overrides/:id', async (req, res, next) => {
  try {
    const { overrideText } = req.body;

    const override = await prisma.storeTranslationOverride.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!override || override.storeId !== req.store.id) {
      throw new AppError('Correcao nao encontrada.', 404, 'OVERRIDE_NOT_FOUND');
    }
    if (typeof overrideText !== 'string' || !overrideText.trim()) {
      throw new AppError('Traducao corrigida obrigatoria.', 400, 'MISSING_OVERRIDE_TEXT');
    }

    const updated = await prisma.storeTranslationOverride.update({
      where: { id: override.id },
      data: { overrideText: overrideText.trim().slice(0, MAX_OVERRIDE_TEXT_LENGTH) },
    });
    res.json({ override: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/translations/overrides/:id
 */
router.delete('/overrides/:id', async (req, res, next) => {
  try {
    const override = await prisma.storeTranslationOverride.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!override || override.storeId !== req.store.id) {
      throw new AppError('Correcao nao encontrada.', 404, 'OVERRIDE_NOT_FOUND');
    }

    await prisma.storeTranslationOverride.delete({ where: { id: override.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/translations/detect-banners — varre a página pública da loja e
 * lista imagens candidatas a banner (sem depender da API da Nuvemshop, que
 * não expõe imagens de tema/carrossel).
 */
router.get('/detect-banners', async (req, res, next) => {
  try {
    const store = await prisma.store.findUnique({ where: { id: req.store.id } });
    if (!store?.domain) {
      throw new AppError('Loja sem dominio publico configurado.', 400, 'NO_DOMAIN');
    }

    const baseUrl = `https://${store.domain}/`;
    const html = await axios
      .get(baseUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (traduzAI banner detector)' } })
      .then((r) => r.data);

    const images = extractBannerCandidates(html, baseUrl);
    res.json({ images });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/translations/banner-overrides — lista os banners personalizados da loja.
 */
router.get('/banner-overrides', async (req, res, next) => {
  try {
    const overrides = await prisma.storeBannerOverride.findMany({
      where: { storeId: req.store.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ overrides });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/translations/banner-overrides — cria/atualiza um banner personalizado.
 * body: { originalImageUrl, targetLang, replacementImage } — replacementImage
 * é um data: URL base64 (lojista faz upload, frontend converte via FileReader).
 */
router.post('/banner-overrides', async (req, res, next) => {
  try {
    const { originalImageUrl, targetLang, replacementImage } = req.body;

    if (typeof originalImageUrl !== 'string' || !originalImageUrl.trim()) {
      throw new AppError('Banner original obrigatorio.', 400, 'MISSING_ORIGINAL_IMAGE');
    }
    if (!isValidLanguage(targetLang)) {
      throw new AppError('Idioma de destino invalido.', 400, 'INVALID_LANGUAGE');
    }
    if (typeof replacementImage !== 'string' || replacementImage.indexOf('data:image/') !== 0) {
      throw new AppError('Imagem substituta invalida.', 400, 'INVALID_REPLACEMENT_IMAGE');
    }

    const safeOriginalUrl = originalImageUrl.trim().slice(0, 2000);
    const originalImageHash = sha256(safeOriginalUrl);

    const override = await prisma.storeBannerOverride.upsert({
      where: { storeId_originalImageHash_targetLang: { storeId: req.store.id, originalImageHash, targetLang } },
      update: { replacementImage, originalImageUrl: safeOriginalUrl },
      create: { storeId: req.store.id, originalImageHash, originalImageUrl: safeOriginalUrl, targetLang, replacementImage },
    });

    res.status(201).json({ override });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/translations/banner-overrides/:id
 */
router.delete('/banner-overrides/:id', async (req, res, next) => {
  try {
    const override = await prisma.storeBannerOverride.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!override || override.storeId !== req.store.id) {
      throw new AppError('Banner personalizado nao encontrado.', 404, 'BANNER_OVERRIDE_NOT_FOUND');
    }

    await prisma.storeBannerOverride.delete({ where: { id: override.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
