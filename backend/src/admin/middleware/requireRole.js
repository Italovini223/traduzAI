const { AppError } = require('../../lib/errors');

/**
 * Role hierarchy: proprietario > gerente > suporte
 */
const ROLE_LEVELS = {
  proprietario: 3,
  gerente: 2,
  suporte: 1,
};

/**
 * Middleware factory that requires a minimum role level.
 * Usage: requireRole('gerente') — allows gerente and proprietario
 */
function requireRole(minimumRole) {
  const requiredLevel = ROLE_LEVELS[minimumRole];

  if (requiredLevel === undefined) {
    throw new Error(`Invalid role: ${minimumRole}`);
  }

  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ error: 'Nao autenticado.', code: 'ADMIN_UNAUTHORIZED' });
    }

    const adminLevel = ROLE_LEVELS[req.admin.role] || 0;

    if (adminLevel < requiredLevel) {
      return res.status(403).json({
        error: `Permissao insuficiente. Requer: ${minimumRole}.`,
        code: 'INSUFFICIENT_ROLE',
      });
    }

    next();
  };
}

module.exports = { requireRole, ROLE_LEVELS };
