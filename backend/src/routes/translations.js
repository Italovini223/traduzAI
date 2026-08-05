const express = require('express');
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

module.exports = router;
