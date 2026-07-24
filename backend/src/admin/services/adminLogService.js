const prisma = require('../../lib/prisma');

/**
 * Log an admin action.
 * @param {Object} params
 * @param {number} [params.adminId] - ID of the admin performing the action
 * @param {string} params.action - Description of the action
 * @param {string} [params.entity] - Entity type (e.g., 'plan', 'store', 'coupon')
 * @param {string} [params.entityId] - ID of the affected entity
 * @param {Object} [params.details] - Additional details
 * @param {string} [params.ipAddress] - IP address
 * @param {string} [params.severity] - 'info' | 'warning' | 'error'
 */
async function log({ adminId, action, entity, entityId, details, ipAddress, severity = 'info' }) {
  try {
    await prisma.adminLog.create({
      data: {
        adminId: adminId || null,
        action,
        entity: entity || null,
        entityId: entityId ? String(entityId) : null,
        details: details || null,
        ipAddress: ipAddress || null,
        severity,
      },
    });
  } catch (err) {
    console.error('Failed to write admin log:', err.message);
  }
}

module.exports = { log };
