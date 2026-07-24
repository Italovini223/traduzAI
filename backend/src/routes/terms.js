const express = require('express');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

/**
 * GET /api/terms/status — Check if store has accepted the latest published terms
 */
router.get('/status', async (req, res, next) => {
  try {
    // Find the latest published terms
    const latestTerms = await prisma.termsVersion.findFirst({
      where: { isPublished: true },
      orderBy: { publishedAt: 'desc' },
    });

    if (!latestTerms) {
      return res.json({ required: false, accepted: true, terms: null });
    }

    // Check if store accepted this version
    const acceptance = await prisma.termsAcceptance.findUnique({
      where: {
        storeId_termsVersionId: {
          storeId: req.store.id,
          termsVersionId: latestTerms.id,
        },
      },
    });

    res.json({
      required: true,
      accepted: !!acceptance,
      terms: {
        id: latestTerms.id,
        version: latestTerms.version,
        title: latestTerms.title,
        content: latestTerms.content,
        publishedAt: latestTerms.publishedAt,
      },
      acceptedAt: acceptance ? acceptance.acceptedAt : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/terms/accept — Accept a specific terms version
 */
router.post('/accept', async (req, res, next) => {
  try {
    const { termsVersionId } = req.body;

    if (!termsVersionId) {
      throw new AppError('termsVersionId e obrigatorio.', 400, 'MISSING_TERMS_VERSION');
    }

    const termsVersion = await prisma.termsVersion.findUnique({
      where: { id: parseInt(termsVersionId) },
    });

    if (!termsVersion) {
      throw new AppError('Versao dos termos nao encontrada.', 404, 'TERMS_NOT_FOUND');
    }

    if (!termsVersion.isPublished) {
      throw new AppError('Esta versao dos termos nao esta publicada.', 400, 'TERMS_NOT_PUBLISHED');
    }

    const acceptance = await prisma.termsAcceptance.upsert({
      where: {
        storeId_termsVersionId: {
          storeId: req.store.id,
          termsVersionId: termsVersion.id,
        },
      },
      update: { acceptedAt: new Date() },
      create: {
        storeId: req.store.id,
        termsVersionId: termsVersion.id,
      },
    });

    res.json({
      accepted: true,
      acceptedAt: acceptance.acceptedAt,
      termsVersion: termsVersion.version,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
