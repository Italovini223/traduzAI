const crypto = require('crypto');
const prisma = require('./prisma');
const { DeepLService } = require('../config/deepl');

const MAX_TEXT_LENGTH = 2000;

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Adaptação de dialeto/tom por PAÍS — ver routes/storefront.js (mesma lógica,
// movida pra cá pra ser reaproveitada também pelo preview de SEO).
function applyGlossary(text, terms) {
  return terms.reduce((result, term) => {
    const pattern = new RegExp(`\\b${escapeRegExp(term.findText)}\\b`, 'gi');
    return result.replace(pattern, (match) => {
      const isCapitalized = match[0] !== match[0].toLowerCase() && match[0] === match[0].toUpperCase();
      if (!isCapitalized) return term.replaceText;
      return term.replaceText.charAt(0).toUpperCase() + term.replaceText.slice(1);
    });
  }, text);
}

// Mesmo pipeline usado por POST /storefront/translate: correção manual >
// cache > DeepL (só para os que não bateram em nada acima), depois glossário
// de país por último. Extraído pra lib pra ser chamado tanto pela vitrine
// quanto pelo preview de SEO no admin (mesmo resultado, sem duplicar lógica).
async function translateTexts({ storeId, texts, sourceLang, targetLang, country }) {
  const safeTexts = texts.map((t) => String(t).trim().slice(0, MAX_TEXT_LENGTH));
  const hashes = safeTexts.map(sha256);

  const overrides = await prisma.storeTranslationOverride.findMany({
    where: { storeId, sourceHash: { in: hashes }, targetLang },
  });
  const overrideMap = new Map(overrides.map((o) => [o.sourceHash, o.overrideText]));

  const cached = await prisma.translationCache.findMany({
    where: { sourceHash: { in: hashes }, sourceLang: sourceLang || '', targetLang },
  });
  const cacheMap = new Map(cached.map((c) => [c.sourceHash, c.translatedText]));

  const missIndexes = [];
  const missTexts = [];
  safeTexts.forEach((text, i) => {
    if (!overrideMap.has(hashes[i]) && !cacheMap.has(hashes[i])) {
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

  const translations = safeTexts.map((text, i) => overrideMap.get(hashes[i]) ?? cacheMap.get(hashes[i]) ?? text);

  let finalTranslations = translations;
  if (country) {
    const glossaryTerms = await prisma.storeCountryGlossaryTerm.findMany({ where: { storeId, country } });
    if (glossaryTerms.length > 0) {
      finalTranslations = translations.map((t) => applyGlossary(t, glossaryTerms));
    }
  }

  return finalTranslations;
}

module.exports = { translateTexts, sha256 };
