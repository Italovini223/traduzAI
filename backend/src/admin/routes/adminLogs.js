const express = require('express');
const prisma = require('../../lib/prisma');
const { parsePagination, paginatedResponse } = require('../../lib/paginate');

const router = express.Router();

/**
 * GET /admin-api/logs/activity — Activity logs (info severity)
 * Query: ?tab=all|auth|mutations|system&page=1&limit=20
 */
router.get('/activity', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { tab, adminId, entity } = req.query;

    const where = { severity: 'info' };

    // Tab filters
    if (tab === 'auth') {
      where.action = { in: ['login_success', 'logout', 'change_password'] };
    } else if (tab === 'mutations') {
      where.action = {
        in: [
          'create_plan', 'update_plan', 'deactivate_plan', 'sync_plan_to_stripe',
          'create_coupon', 'deactivate_coupon',
          'create_terms', 'update_terms', 'publish_terms',
          'create_faq', 'update_faq', 'delete_faq',
          'create_admin', 'deactivate_admin',
          'approve_commission', 'mark_commission_paid',
          'extend_trial', 'cancel_subscription',
          'update_config',
        ],
      };
    } else if (tab === 'system') {
      where.action = { in: ['impersonate_store', 'update_config', 'sync_plan_to_stripe'] };
    }

    if (adminId) where.adminId = parseInt(adminId);
    if (entity) where.entity = entity;

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.adminLog.count({ where }),
    ]);

    res.json(paginatedResponse(logs, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/logs/errors — Error and warning logs
 * Query: ?tab=all|errors|warnings|security&page=1&limit=20
 */
router.get('/errors', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { tab } = req.query;

    const where = {};

    if (tab === 'errors') {
      where.severity = 'error';
    } else if (tab === 'warnings') {
      where.severity = 'warning';
    } else if (tab === 'security') {
      where.OR = [
        { severity: 'warning', action: { in: ['login_failed', 'impersonate_store'] } },
        { severity: 'error' },
      ];
    } else {
      // All non-info logs
      where.severity = { in: ['warning', 'error'] };
    }

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.adminLog.count({ where }),
    ]);

    res.json(paginatedResponse(logs, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/logs/usage — API usage logs (store activity)
 * Query: ?page=1&limit=25
 */
router.get('/usage', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        where: {
          action: { in: ['api_request', 'billing_checkout', 'billing_cancel', 'billing_sync', 'terms_accept'] },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          createdAt: true,
          ipAddress: true,
          severity: true,
          details: true,
        },
      }),
      prisma.adminLog.count({
        where: {
          action: { in: ['api_request', 'billing_checkout', 'billing_cancel', 'billing_sync', 'terms_accept'] },
        },
      }),
    ]);

    const mapped = logs.map((l) => ({
      id: l.id,
      timestamp: l.createdAt,
      storeId: l.details?.storeId || null,
      endpoint: l.details?.endpoint || l.action,
      method: l.details?.method || null,
      responseTime: l.details?.responseTime || null,
      statusCode: l.details?.statusCode || null,
      requestCount: l.details?.requestCount || null,
      severity: l.severity,
    }));

    res.json(paginatedResponse(mapped, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /admin-api/logs/abuse — Abuse and rate-limit logs
 * Query: ?page=1&limit=25
 */
router.get('/abuse', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);

    const [logs, total] = await Promise.all([
      prisma.adminLog.findMany({
        where: {
          severity: { in: ['warning', 'error'] },
          action: {
            in: [
              'login_failed', 'rate_limit_exceeded', 'unauthorized_access',
              'impersonate_store', 'suspicious_activity',
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.adminLog.count({
        where: {
          severity: { in: ['warning', 'error'] },
          action: {
            in: [
              'login_failed', 'rate_limit_exceeded', 'unauthorized_access',
              'impersonate_store', 'suspicious_activity',
            ],
          },
        },
      }),
    ]);

    const mapped = logs.map((l) => ({
      id: l.id,
      timestamp: l.createdAt,
      severity: l.severity,
      type: l.action,
      storeId: l.details?.storeId || null,
      ip: l.ipAddress,
      description: l.details?.message || l.action,
      blocked: l.severity === 'error',
    }));

    res.json(paginatedResponse(mapped, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
