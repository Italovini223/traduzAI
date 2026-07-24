const express = require('express');
const prisma = require('../lib/prisma');
const { AppError } = require('../lib/errors');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

/**
 * GET /api/profile — Get store profile data
 */
router.get('/', async (req, res, next) => {
  try {
    const profile = await prisma.storeProfile.findUnique({
      where: { storeId: req.store.id },
    });

    res.json({
      profile: profile ? profile.data : {},
      store: {
        id: req.store.id,
        name: req.store.name,
        domain: req.store.domain,
        email: req.store.email,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/profile — Create store profile
 */
router.post('/', async (req, res, next) => {
  try {
    const { data } = req.body;

    if (!data || typeof data !== 'object') {
      throw new AppError('Campo "data" e obrigatorio e deve ser um objeto.', 400, 'INVALID_DATA');
    }

    const existing = await prisma.storeProfile.findUnique({
      where: { storeId: req.store.id },
    });

    if (existing) {
      throw new AppError('Perfil ja existe. Use PUT para atualizar.', 409, 'PROFILE_EXISTS');
    }

    const profile = await prisma.storeProfile.create({
      data: {
        storeId: req.store.id,
        data,
      },
    });

    res.status(201).json({ profile: profile.data });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/profile — Update store profile
 */
router.put('/', async (req, res, next) => {
  try {
    const { data } = req.body;

    if (!data || typeof data !== 'object') {
      throw new AppError('Campo "data" e obrigatorio e deve ser um objeto.', 400, 'INVALID_DATA');
    }

    const profile = await prisma.storeProfile.upsert({
      where: { storeId: req.store.id },
      update: { data },
      create: {
        storeId: req.store.id,
        data,
      },
    });

    res.json({ profile: profile.data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
