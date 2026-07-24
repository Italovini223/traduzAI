const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');

async function adminAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new AppError('Token de admin nao fornecido.', 401, 'ADMIN_UNAUTHORIZED');
    }

    const token = header.slice(7);
    let payload;
    try {
      payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    } catch (err) {
      throw new AppError('Token de admin invalido ou expirado.', 401, 'ADMIN_INVALID_TOKEN');
    }

    // Verify session is still active
    const session = await prisma.adminSession.findFirst({
      where: {
        adminId: payload.adminId,
        token,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      include: { admin: true },
    });

    if (!session) {
      throw new AppError('Sessao expirada ou invalida.', 401, 'ADMIN_SESSION_EXPIRED');
    }

    if (!session.admin.isActive) {
      throw new AppError('Conta de admin desativada.', 403, 'ADMIN_DEACTIVATED');
    }

    req.admin = session.admin;
    req.adminId = session.admin.id;
    req.adminToken = token;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    return res.status(500).json({ error: 'Erro interno de autenticacao admin.', code: 'ADMIN_AUTH_ERROR' });
  }
}

module.exports = { adminAuth };
