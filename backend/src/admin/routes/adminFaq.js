const express = require('express');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { parsePagination, paginatedResponse } = require('../../lib/paginate');
const { requireRole } = require('../middleware/requireRole');
const adminLogService = require('../services/adminLogService');

const router = express.Router();

// Normaliza o idioma da FAQ para o conjunto suportado (pt | es), default pt.
const normLocale = (l) => (l === 'es' ? 'es' : 'pt');

/**
 * GET /admin-api/faq — List FAQs with optional category filter
 * Query: ?category=geral&page=1&limit=20
 */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { category, locale } = req.query;

    const where = {};
    if (category) where.category = category;
    if (locale) where.locale = normLocale(locale);

    const [faqs, total] = await Promise.all([
      prisma.adminFaq.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.adminFaq.count({ where }),
    ]);

    res.json(paginatedResponse(faqs, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/faq — Create a FAQ entry
 */
router.post('/', requireRole('suporte'), async (req, res, next) => {
  try {
    const { category, locale, question, answer, videoUrl, isPublished, sortOrder } = req.body;

    if (!question || !answer) {
      throw new AppError('question e answer sao obrigatorios.', 400, 'MISSING_FIELDS');
    }

    const faq = await prisma.adminFaq.create({
      data: {
        category: category || 'geral',
        locale: normLocale(locale),
        question,
        answer,
        videoUrl: videoUrl || null,
        isPublished: isPublished !== undefined ? isPublished : true,
        sortOrder: sortOrder || 0,
      },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'create_faq',
      entity: 'admin_faq',
      entityId: faq.id,
      details: { question },
      ipAddress: req.ip,
    });

    res.status(201).json({ faq });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /admin-api/faq/:id — Update a FAQ entry
 */
router.put('/:id', requireRole('suporte'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { category, locale, question, answer, videoUrl, isPublished, sortOrder } = req.body;

    const existing = await prisma.adminFaq.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('FAQ nao encontrada.', 404, 'FAQ_NOT_FOUND');
    }

    const data = {};
    if (category !== undefined) data.category = category;
    if (locale !== undefined) data.locale = normLocale(locale);
    if (question !== undefined) data.question = question;
    if (answer !== undefined) data.answer = answer;
    if (videoUrl !== undefined) data.videoUrl = videoUrl;
    if (isPublished !== undefined) data.isPublished = isPublished;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;

    const faq = await prisma.adminFaq.update({ where: { id }, data });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'update_faq',
      entity: 'admin_faq',
      entityId: id,
      details: data,
      ipAddress: req.ip,
    });

    res.json({ faq });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /admin-api/faq/:id — Delete a FAQ entry
 */
router.delete('/:id', requireRole('gerente'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    const existing = await prisma.adminFaq.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('FAQ nao encontrada.', 404, 'FAQ_NOT_FOUND');
    }

    await prisma.adminFaq.delete({ where: { id } });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'delete_faq',
      entity: 'admin_faq',
      entityId: id,
      details: { question: existing.question },
      ipAddress: req.ip,
    });

    res.json({ message: 'FAQ removida com sucesso.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
