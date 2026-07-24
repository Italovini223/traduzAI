const express = require('express');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { parsePagination, paginatedResponse } = require('../../lib/paginate');
const { requireRole } = require('../middleware/requireRole');
const adminLogService = require('../services/adminLogService');

const router = express.Router();

/**
 * GET /admin-api/terms — List all terms versions with pagination
 */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [terms, total] = await Promise.all([
      prisma.termsVersion.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { _count: { select: { acceptances: true } } },
      }),
      prisma.termsVersion.count(),
    ]);

    res.json(paginatedResponse(terms, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/terms — Create a new terms version (draft)
 */
router.post('/', requireRole('gerente'), async (req, res, next) => {
  try {
    const { version, title, content } = req.body;

    if (!version || !title || !content) {
      throw new AppError('version, title e content sao obrigatorios.', 400, 'MISSING_FIELDS');
    }

    const terms = await prisma.termsVersion.create({
      data: {
        version,
        title,
        content,
        isPublished: false,
      },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'create_terms',
      entity: 'terms_version',
      entityId: terms.id,
      details: { version, title },
      ipAddress: req.ip,
    });

    res.status(201).json({ terms });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /admin-api/terms/:id — Update a terms version (only if not published)
 */
router.put('/:id', requireRole('gerente'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { version, title, content } = req.body;

    const existing = await prisma.termsVersion.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Versao nao encontrada.', 404, 'TERMS_NOT_FOUND');
    }

    if (existing.isPublished) {
      throw new AppError('Nao e possivel editar termos ja publicados.', 400, 'TERMS_ALREADY_PUBLISHED');
    }

    const data = {};
    if (version !== undefined) data.version = version;
    if (title !== undefined) data.title = title;
    if (content !== undefined) data.content = content;

    const terms = await prisma.termsVersion.update({ where: { id }, data });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'update_terms',
      entity: 'terms_version',
      entityId: id,
      details: data,
      ipAddress: req.ip,
    });

    res.json({ terms });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/terms/:id/publish — Publish a terms version
 */
router.post('/:id/publish', requireRole('proprietario'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.termsVersion.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Versao nao encontrada.', 404, 'TERMS_NOT_FOUND');
    }

    if (existing.isPublished) {
      throw new AppError('Termos ja estao publicados.', 400, 'ALREADY_PUBLISHED');
    }

    const terms = await prisma.termsVersion.update({
      where: { id },
      data: {
        isPublished: true,
        publishedAt: new Date(),
      },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'publish_terms',
      entity: 'terms_version',
      entityId: id,
      details: { version: terms.version },
      ipAddress: req.ip,
    });

    res.json({ terms });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
