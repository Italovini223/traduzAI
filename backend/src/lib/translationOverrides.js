const crypto = require('crypto');
const prisma = require('./prisma');

const MAX_OVERRIDE_TEXT_LENGTH = 2000;

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

// Compartilhado entre POST /api/translations/overrides (admin, autenticado)
// e POST /storefront/edit-override (público, gated por editToken de curta
// duração) — mesma validação/upsert nos dois casos, só a autenticação difere.
async function upsertTranslationOverride({ storeId, sourceText, targetLang, overrideText }) {
  const safeSourceText = String(sourceText).trim().slice(0, MAX_OVERRIDE_TEXT_LENGTH);
  const safeOverrideText = String(overrideText).trim().slice(0, MAX_OVERRIDE_TEXT_LENGTH);
  const sourceHash = sha256(safeSourceText);

  return prisma.storeTranslationOverride.upsert({
    where: { storeId_sourceHash_targetLang: { storeId, sourceHash, targetLang } },
    update: { overrideText: safeOverrideText, sourceText: safeSourceText },
    create: { storeId, sourceHash, sourceText: safeSourceText, targetLang, overrideText: safeOverrideText },
  });
}

module.exports = { sha256, upsertTranslationOverride, MAX_OVERRIDE_TEXT_LENGTH };
