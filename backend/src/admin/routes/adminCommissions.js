const express = require('express');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { parsePagination, paginatedResponse } = require('../../lib/paginate');
const { requireRole } = require('../middleware/requireRole');
const adminLogService = require('../services/adminLogService');

const router = express.Router();

/**
 * GET /admin-api/commissions/summary — Commission summary
 */
router.get('/summary', async (req, res, next) => {
  try {
    const [pending, approved, paid] = await Promise.all([
      prisma.adminCommission.aggregate({
        where: { status: 'pending' },
        _sum: { commissionAmount: true },
        _count: true,
      }),
      prisma.adminCommission.aggregate({
        where: { status: 'approved' },
        _sum: { commissionAmount: true },
        _count: true,
      }),
      prisma.adminCommission.aggregate({
        where: { status: 'paid' },
        _sum: { commissionAmount: true },
        _count: true,
      }),
    ]);

    res.json({
      summary: {
        pending: {
          count: pending._count,
          total: Math.round((pending._sum.commissionAmount || 0) * 100) / 100,
        },
        approved: {
          count: approved._count,
          total: Math.round((approved._sum.commissionAmount || 0) * 100) / 100,
        },
        paid: {
          count: paid._count,
          total: Math.round((paid._sum.commissionAmount || 0) * 100) / 100,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/commissions — List commissions with pagination
 * Query: ?status=pending|approved|paid&partnerId=xxx&page=1&limit=20
 */
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { status, partnerId } = req.query;

    const where = {};
    if (status) where.status = status;
    if (partnerId) where.partnerId = partnerId;

    const [commissions, total] = await Promise.all([
      prisma.adminCommission.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.adminCommission.count({ where }),
    ]);

    res.json(paginatedResponse(commissions, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/commissions/:id/approve — Approve a commission
 */
router.post('/:id/approve', requireRole('gerente'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    const commission = await prisma.adminCommission.findUnique({ where: { id } });
    if (!commission) {
      throw new AppError('Comissao nao encontrada.', 404, 'COMMISSION_NOT_FOUND');
    }

    if (commission.status !== 'pending') {
      throw new AppError('Apenas comissoes pendentes podem ser aprovadas.', 400, 'INVALID_STATUS');
    }

    const updated = await prisma.adminCommission.update({
      where: { id },
      data: { status: 'approved' },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'approve_commission',
      entity: 'admin_commission',
      entityId: id,
      details: { partnerId: commission.partnerId, amount: commission.commissionAmount },
      ipAddress: req.ip,
    });

    res.json({ commission: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/commissions/:id/mark-paid — Mark commission as paid
 */
router.post('/:id/mark-paid', requireRole('proprietario'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    const commission = await prisma.adminCommission.findUnique({ where: { id } });
    if (!commission) {
      throw new AppError('Comissao nao encontrada.', 404, 'COMMISSION_NOT_FOUND');
    }

    if (commission.status !== 'approved') {
      throw new AppError('Apenas comissoes aprovadas podem ser marcadas como pagas.', 400, 'INVALID_STATUS');
    }

    const updated = await prisma.adminCommission.update({
      where: { id },
      data: { status: 'paid' },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'mark_commission_paid',
      entity: 'admin_commission',
      entityId: id,
      details: { partnerId: commission.partnerId, amount: commission.commissionAmount },
      ipAddress: req.ip,
    });

    res.json({ commission: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
