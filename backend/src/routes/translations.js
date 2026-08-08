const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');
const { upsertTranslationOverride } = require('../lib/translationOverrides');
const { translateTexts } = require('../lib/translateText');
const {
  SUPPORTED_COUNTRIES,
  SUPPORTED_LANGUAGES,
  SUPPORTED_CURRENCIES,
  COUNTRY_DEFAULTS,
  isValidRule,
  isValidLanguage,
  isValidCurrency,
  isValidCountry,
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

// Selo de segurança, "powered by", placeholder de lazy-load, imagem de
// PRODUTO do catálogo (path "/products/", nunca é banner de tema) — não são
// candidatos plausíveis a banner e só disputariam espaço com o banner de
// verdade no limite de MAX_BANNER_CANDIDATES (confirmado em teste real
// contra a loja de produção: o catálogo tem muito mais imagens de produto
// que de banner, e elas enchiam a lista antes do banner real aparecer).
const EXCLUDED_PATTERNS = /logo|placeholder|safe-google|loja_segura|selo|badge|favicon|sprite|\/products\//i;

// Cobre as várias convenções de lazy-load usadas por temas Nuvemshop (nem
// todo tema usa "data-src") + srcset/data-srcset, que trazem VÁRIAS
// variantes de resolução na mesma URL (ex.: "a.webp 480w, b.webp 1920w") —
// sem pegar isso, a variante grande (a que de fato é o banner) podia nunca
// aparecer no HTML puro se só a pequena viesse solta em "src".
const IMG_ATTR_REGEX = /(?:src|data-src|data-original|data-lazy-src|data-lazy|srcset|data-srcset)\s*=\s*["']([^"']+)["']/gi;
const DIMENSION_HINT_REGEX = /-(\d{2,5})-(\d{1,5})\.\w+(?:\?.*)?$/;

// srcset/data-srcset trazem "url descriptor, url descriptor, ..." — separa
// por vírgula e pega só a URL de cada entrada (ignora o "480w"/"2x" etc).
// Nunca faz esse split em data: URI — o payload base64 pode ter vírgula
// (ex.: "base64,R0lGO...") e o split cortaria no meio, sobrando um pedaço
// do base64 sem o prefixo "data:" que passaria pelo filtro por engano
// (confirmado em teste real: virou uma URL quebrada na lista).
function urlsFromAttrValue(rawValue) {
  if (rawValue.indexOf('data:') === 0 || rawValue.indexOf(',') === -1) return [rawValue];
  return rawValue
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean);
}

function addCandidate(urls, raw, baseUrl) {
  if (!raw || raw.indexOf('data:') === 0) return;
  if (EXCLUDED_PATTERNS.test(raw)) return;

  let absolute;
  try {
    absolute = new URL(raw, baseUrl).href;
  } catch {
    return;
  }

  const dimMatch = DIMENSION_HINT_REGEX.exec(absolute);
  if (dimMatch && Number(dimMatch[1]) < MIN_BANNER_WIDTH_HINT) return;

  urls.add(absolute);
}

// srcset traz a MESMA imagem em várias resoluções (640/1024/1920...) — sem
// deduplicar, a grade de miniaturas mostra o mesmo banner repetido 3-4x e
// slides realmente diferentes acabam cortados pelo MAX_BANNER_CANDIDATES
// (confirmado em teste real). Agrupa pela URL sem o sufixo "-W-H.ext" e
// mantém só a variante de maior largura de cada grupo.
function dedupeByLargestVariant(urls) {
  const groups = new Map();
  urls.forEach((absolute) => {
    const dimMatch = DIMENSION_HINT_REGEX.exec(absolute);
    const width = dimMatch ? Number(dimMatch[1]) : Infinity; // sem sufixo → única variante, sempre mantém
    const baseKey = absolute.split('?')[0].replace(DIMENSION_HINT_REGEX, '');
    const existing = groups.get(baseKey);
    if (!existing || width > existing.width) groups.set(baseKey, { url: absolute, width });
  });
  return [...groups.values()].map((g) => g.url);
}

function extractBannerCandidates(html, baseUrl) {
  const urls = new Set();

  const tagRegex = /<(?:img|source)\b[^>]*>/gi;
  const tags = html.match(tagRegex) || [];
  tags.forEach((tag) => {
    let match;
    IMG_ATTR_REGEX.lastIndex = 0;
    while ((match = IMG_ATTR_REGEX.exec(tag))) {
      urlsFromAttrValue(match[1]).forEach((raw) => addCandidate(urls, raw, baseUrl));
    }
  });

  // Alguns temas usam banner via CSS (background-image) em vez de <img>.
  const bgRegex = /background(?:-image)?\s*:\s*url\((['"]?)([^'")]+)\1\)/gi;
  let bgMatch;
  while ((bgMatch = bgRegex.exec(html))) {
    addCandidate(urls, bgMatch[2], baseUrl);
  }

  return dedupeByLargestVariant(urls).slice(0, MAX_BANNER_CANDIDATES);
}

// Extrai <title> e meta tags de SEO do HTML público da loja — mesma
// abordagem sem parser de DOM usada em extractBannerCandidates(). Atributos
// de <meta> podem vir em qualquer ordem (name/property antes ou depois de
// content), por isso casa a tag inteira primeiro e só depois procura o
// content dentro dela.
function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? match[1].trim() : '';
}

function extractMetaContent(html, attr, value) {
  const tagRegex = /<meta\b[^>]*>/gi;
  const tags = html.match(tagRegex) || [];
  for (const tag of tags) {
    const attrRegex = new RegExp(`${attr}\\s*=\\s*["']${value}["']`, 'i');
    if (!attrRegex.test(tag)) continue;
    const contentMatch = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (contentMatch) return contentMatch[1].trim();
  }
  return '';
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
      config: config || {
        enabled: false,
        sourceLanguage: 'pt-BR',
        baseCurrency: 'BRL',
        translateImages: false,
        pickerPosition: 'bottom-left',
        pickerColor: '#1a73e8',
      },
      rules,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/translations/config — atualiza enabled/sourceLanguage/baseCurrency.
 */
const VALID_PICKER_POSITIONS = new Set(['bottom-left', 'bottom-right', 'top-left', 'top-right']);
const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

router.put('/config', async (req, res, next) => {
  try {
    const { enabled, sourceLanguage, baseCurrency, translateImages, pickerPosition, pickerColor } = req.body;

    if (sourceLanguage !== undefined && !isValidLanguage(sourceLanguage)) {
      throw new AppError('Idioma de origem invalido.', 400, 'INVALID_LANGUAGE');
    }
    if (baseCurrency !== undefined && !isValidCurrency(baseCurrency)) {
      throw new AppError('Moeda de origem invalida.', 400, 'INVALID_CURRENCY');
    }
    if (pickerPosition !== undefined && !VALID_PICKER_POSITIONS.has(pickerPosition)) {
      throw new AppError('Posicao do seletor invalida.', 400, 'INVALID_PICKER_POSITION');
    }
    if (pickerColor !== undefined && !HEX_COLOR_REGEX.test(pickerColor)) {
      throw new AppError('Cor do seletor invalida (use #rrggbb).', 400, 'INVALID_PICKER_COLOR');
    }

    const data = {};
    if (enabled !== undefined) data.enabled = Boolean(enabled);
    if (sourceLanguage !== undefined) data.sourceLanguage = sourceLanguage;
    if (baseCurrency !== undefined) data.baseCurrency = baseCurrency;
    if (translateImages !== undefined) data.translateImages = Boolean(translateImages);
    if (pickerPosition !== undefined) data.pickerPosition = pickerPosition;
    if (pickerColor !== undefined) data.pickerColor = pickerColor;

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

    const override = await upsertTranslationOverride({ storeId: req.store.id, sourceText, targetLang, overrideText });

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

/**
 * POST /api/translations/edit-session — gera um token de curta duração pra
 * habilitar o "modo de edição" na vitrine (clicar num texto traduzido pra
 * corrigi-lo direto na loja, sem digitar o texto original no admin). O
 * token NÃO é o JWT de sessão do admin — é escopado só pra essa ação e
 * expira rápido, porque a vitrine pública não tem acesso ao JWT real do
 * iframe (domínio diferente) e não dá pra deixar POST /storefront/
 * edit-override aberto sem nenhuma verificação (qualquer visitante
 * poderia poluir a tradução da loja).
 */
router.post('/edit-session', (req, res, next) => {
  try {
    if (!req.store.domain) {
      throw new AppError('Loja sem dominio publico configurado.', 400, 'NO_DOMAIN');
    }

    const editToken = jwt.sign(
      { storeId: req.store.id, scope: 'translate-edit' },
      process.env.JWT_SECRET,
      { expiresIn: '30m' }
    );
    const editUrl = `https://${req.store.domain}/?traduzai_edit=${encodeURIComponent(editToken)}`;

    res.json({ editToken, editUrl });
  } catch (err) {
    next(err);
  }
});

const MAX_GLOSSARY_TEXT_LENGTH = 200;

/**
 * GET /api/translations/glossary — lista os termos de adaptação por país da loja.
 */
router.get('/glossary', async (req, res, next) => {
  try {
    const terms = await prisma.storeCountryGlossaryTerm.findMany({
      where: { storeId: req.store.id },
      orderBy: [{ country: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({ terms });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/translations/glossary — cria/atualiza um termo de adaptação por país.
 * body: { country, findText, replaceText }
 */
router.post('/glossary', async (req, res, next) => {
  try {
    const { country, findText, replaceText } = req.body;

    if (!isValidCountry(country)) {
      throw new AppError('Pais invalido.', 400, 'INVALID_COUNTRY');
    }
    if (typeof findText !== 'string' || !findText.trim()) {
      throw new AppError('Termo a substituir obrigatorio.', 400, 'MISSING_FIND_TEXT');
    }
    if (typeof replaceText !== 'string' || !replaceText.trim()) {
      throw new AppError('Termo substituto obrigatorio.', 400, 'MISSING_REPLACE_TEXT');
    }

    const safeFindText = findText.trim().slice(0, MAX_GLOSSARY_TEXT_LENGTH);
    const safeReplaceText = replaceText.trim().slice(0, MAX_GLOSSARY_TEXT_LENGTH);

    const term = await prisma.storeCountryGlossaryTerm.upsert({
      where: { storeId_country_findText: { storeId: req.store.id, country, findText: safeFindText } },
      update: { replaceText: safeReplaceText },
      create: { storeId: req.store.id, country, findText: safeFindText, replaceText: safeReplaceText },
    });

    res.status(201).json({ term });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/translations/glossary/:id — atualiza o termo substituto.
 */
router.put('/glossary/:id', async (req, res, next) => {
  try {
    const { replaceText } = req.body;

    const term = await prisma.storeCountryGlossaryTerm.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!term || term.storeId !== req.store.id) {
      throw new AppError('Termo nao encontrado.', 404, 'GLOSSARY_TERM_NOT_FOUND');
    }
    if (typeof replaceText !== 'string' || !replaceText.trim()) {
      throw new AppError('Termo substituto obrigatorio.', 400, 'MISSING_REPLACE_TEXT');
    }

    const updated = await prisma.storeCountryGlossaryTerm.update({
      where: { id: term.id },
      data: { replaceText: replaceText.trim().slice(0, MAX_GLOSSARY_TEXT_LENGTH) },
    });
    res.json({ term: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/translations/glossary/:id
 */
router.delete('/glossary/:id', async (req, res, next) => {
  try {
    const term = await prisma.storeCountryGlossaryTerm.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!term || term.storeId !== req.store.id) {
      throw new AppError('Termo nao encontrado.', 404, 'GLOSSARY_TERM_NOT_FOUND');
    }

    await prisma.storeCountryGlossaryTerm.delete({ where: { id: term.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/translations/seo-preview — mostra como titulo/meta description/
 * og:title/og:description da pagina inicial vao aparecer traduzidos pra cada
 * pais configurado. Le o HTML publico da loja (mesma tecnica de
 * detect-banners) e passa pelo MESMO pipeline de traducao da vitrine
 * (lib/translateText.js) — sem custo extra de API pra texto ja visitado por
 * um comprador real, porque cai no TranslationCache.
 */
router.get('/seo-preview', async (req, res, next) => {
  try {
    const store = await prisma.store.findUnique({
      where: { id: req.store.id },
      include: { translationConfig: true, localeRules: true },
    });
    if (!store?.domain) {
      throw new AppError('Loja sem dominio publico configurado.', 400, 'NO_DOMAIN');
    }
    if (!store.translationConfig) {
      return res.json({ source: null, previews: [] });
    }

    const baseUrl = `https://${store.domain}/`;
    const html = await axios
      .get(baseUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (traduzAI SEO preview)' } })
      .then((r) => r.data);

    const source = {
      title: extractTitle(html),
      metaDescription: extractMetaContent(html, 'name', 'description'),
      ogTitle: extractMetaContent(html, 'property', 'og:title'),
      ogDescription: extractMetaContent(html, 'property', 'og:description'),
    };

    const config = store.translationConfig;
    // Mesmo filtro de GET /storefront/rules — regra sem efeito (mesmo
    // idioma E mesma moeda da origem) nao aparece pro visitante, entao nao
    // faz sentido mostrar preview pra ela aqui tambem.
    const rules = store.localeRules.filter(
      (rule) => rule.language !== config.sourceLanguage || rule.currency !== config.baseCurrency
    );

    const fields = ['title', 'metaDescription', 'ogTitle', 'ogDescription'];
    const nonEmptyFields = fields.filter((f) => source[f]);

    const previews = [];
    for (const rule of rules) {
      let translated = [];
      if (nonEmptyFields.length > 0) {
        translated = await translateTexts({
          storeId: store.id,
          texts: nonEmptyFields.map((f) => source[f]),
          sourceLang: config.sourceLanguage,
          targetLang: rule.language,
          country: rule.country,
        });
      }
      const preview = { country: rule.country, language: rule.language };
      nonEmptyFields.forEach((f, i) => { preview[f] = translated[i]; });
      previews.push(preview);
    }

    res.json({ source, previews });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
