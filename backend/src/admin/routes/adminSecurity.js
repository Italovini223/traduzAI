const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { parsePagination, paginatedResponse } = require('../../lib/paginate');
const { requireRole } = require('../middleware/requireRole');
const adminLogService = require('../services/adminLogService');

const router = express.Router();

/**
 * GET /admin-api/security/admins — List admin users
 */
router.get('/admins', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [admins, total] = await Promise.all([
      prisma.adminUser.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          lastLogin: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.adminUser.count(),
    ]);

    res.json(paginatedResponse(admins, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/security/admins — Create a new admin user
 */
router.post('/admins', requireRole('proprietario'), async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      throw new AppError('name, email e password sao obrigatorios.', 400, 'MISSING_FIELDS');
    }

    if (password.length < 12) {
      throw new AppError('Senha deve ter no minimo 12 caracteres.', 400, 'WEAK_PASSWORD');
    }

    const validRoles = ['suporte', 'gerente', 'proprietario'];
    const adminRole = role && validRoles.includes(role) ? role : 'suporte';

    const existing = await prisma.adminUser.findUnique({ where: { email } });
    if (existing) {
      throw new AppError('Email ja cadastrado.', 409, 'EMAIL_EXISTS');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await prisma.adminUser.create({
      data: {
        name,
        email,
        passwordHash,
        role: adminRole,
        isActive: true,
      },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'create_admin',
      entity: 'admin_user',
      entityId: admin.id,
      details: { name, email, role: adminRole },
      ipAddress: req.ip,
    });

    res.status(201).json({
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/security/admins/:id/deactivate — Deactivate an admin
 */
router.post('/admins/:id/deactivate', requireRole('proprietario'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);

    if (id === req.admin.id) {
      throw new AppError('Voce nao pode desativar sua propria conta.', 400, 'CANNOT_DEACTIVATE_SELF');
    }

    const admin = await prisma.adminUser.findUnique({ where: { id } });
    if (!admin) {
      throw new AppError('Admin nao encontrado.', 404, 'ADMIN_NOT_FOUND');
    }

    await prisma.adminUser.update({
      where: { id },
      data: { isActive: false },
    });

    // Invalidate all sessions
    await prisma.adminSession.updateMany({
      where: { adminId: id },
      data: { isActive: false },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'deactivate_admin',
      entity: 'admin_user',
      entityId: id,
      details: { name: admin.name, email: admin.email },
      ipAddress: req.ip,
      severity: 'warning',
    });

    res.json({ message: 'Admin desativado com sucesso.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
