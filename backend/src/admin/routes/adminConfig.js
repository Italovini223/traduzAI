const express = require('express');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { requireRole } = require('../middleware/requireRole');
const adminLogService = require('../services/adminLogService');

const router = express.Router();

/**
 * GET /admin-api/config — Get all config values, grouped
 */
router.get('/', async (req, res, next) => {
  try {
    const configs = await prisma.adminConfig.findMany({
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });

    // Group by group field
    const grouped = {};
    for (const config of configs) {
      if (!grouped[config.group]) {
        grouped[config.group] = [];
      }
      grouped[config.group].push({
        id: config.id,
        key: config.key,
        value: config.value,
        label: config.label,
      });
    }

    res.json({ configs: grouped, raw: configs });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /admin-api/config — Batch update config values
 * Body: { updates: [{ key: "...", value: "...", group?: "...", label?: "..." }] }
 */
router.put('/', requireRole('proprietario'), async (req, res, next) => {
  try {
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new AppError('updates deve ser um array com pelo menos um item.', 400, 'INVALID_UPDATES');
    }

    const results = [];

    for (const update of updates) {
      if (!update.key || update.value === undefined) {
        continue;
      }

      const config = await prisma.adminConfig.upsert({
        where: { key: update.key },
        update: {
          value: String(update.value),
          group: update.group || undefined,
          label: update.label || undefined,
        },
        create: {
          key: update.key,
          value: String(update.value),
          group: update.group || 'system',
          label: update.label || null,
        },
      });

      results.push(config);
    }

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'update_config',
      entity: 'admin_config',
      details: { updatedKeys: updates.map((u) => u.key) },
      ipAddress: req.ip,
    });

    res.json({ configs: results });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
