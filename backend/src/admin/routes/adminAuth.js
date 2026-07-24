const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { adminAuth } = require('../middleware/adminAuth');
const { adminLoginLimiter } = require('../../middleware/rateLimiter');
const adminLogService = require('../services/adminLogService');

const router = express.Router();

/**
 * POST /admin-api/auth/login — Admin login
 */
router.post('/login', adminLoginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email e senha sao obrigatorios.', 400, 'MISSING_CREDENTIALS');
    }

    const admin = await prisma.adminUser.findUnique({ where: { email } });
    if (!admin || !admin.isActive) {
      throw new AppError('Credenciais invalidas.', 401, 'INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      await adminLogService.log({
        adminId: admin.id,
        action: 'login_failed',
        entity: 'admin_user',
        entityId: admin.id,
        ipAddress: req.ip,
        severity: 'warning',
      });
      throw new AppError('Credenciais invalidas.', 401, 'INVALID_CREDENTIALS');
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 12);

    const token = jwt.sign(
      { adminId: admin.id, role: admin.role },
      process.env.ADMIN_JWT_SECRET,
      { expiresIn: '12h' }
    );

    await prisma.adminSession.create({
      data: {
        adminId: admin.id,
        token,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        isActive: true,
        expiresAt,
      },
    });

    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() },
    });

    await adminLogService.log({
      adminId: admin.id,
      action: 'login_success',
      entity: 'admin_user',
      entityId: admin.id,
      ipAddress: req.ip,
    });

    res.json({
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/auth/me — Get current admin info
 */
router.get('/me', adminAuth, async (req, res) => {
  res.json({
    admin: {
      id: req.admin.id,
      name: req.admin.name,
      email: req.admin.email,
      role: req.admin.role,
      lastLogin: req.admin.lastLogin,
    },
  });
});

/**
 * POST /admin-api/auth/logout — Logout (invalidate session)
 */
router.post('/logout', adminAuth, async (req, res, next) => {
  try {
    await prisma.adminSession.updateMany({
      where: { adminId: req.admin.id, token: req.adminToken },
      data: { isActive: false },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'logout',
      entity: 'admin_user',
      entityId: req.admin.id,
      ipAddress: req.ip,
    });

    res.json({ message: 'Logout realizado com sucesso.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /admin-api/auth/change-password — Change admin password
 */
router.post('/change-password', adminAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new AppError('Senha atual e nova senha sao obrigatorias.', 400, 'MISSING_PASSWORDS');
    }

    if (newPassword.length < 12) {
      throw new AppError('Nova senha deve ter no minimo 12 caracteres.', 400, 'WEAK_PASSWORD');
    }

    const valid = await bcrypt.compare(currentPassword, req.admin.passwordHash);
    if (!valid) {
      throw new AppError('Senha atual incorreta.', 401, 'WRONG_PASSWORD');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.adminUser.update({
      where: { id: req.admin.id },
      data: { passwordHash },
    });

    // Invalidate all other sessions
    await prisma.adminSession.updateMany({
      where: {
        adminId: req.admin.id,
        token: { not: req.adminToken },
      },
      data: { isActive: false },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'change_password',
      entity: 'admin_user',
      entityId: req.admin.id,
      ipAddress: req.ip,
    });

    res.json({ message: 'Senha alterada com sucesso.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
