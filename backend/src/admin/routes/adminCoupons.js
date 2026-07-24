const express = require('express');
const prisma = require('../../lib/prisma');
const { AppError } = require('../../lib/errors');
const { parsePagination, paginatedResponse } = require('../../lib/paginate');
const { requireRole } = require('../middleware/requireRole');
const adminLogService = require('../services/adminLogService');
const { stripe } = require('../../config/stripe');

const router = express.Router();

// ─── Valid coupon types (unified with frontend) ───────────────────────────────
const VALID_TYPES = ['percent_off', 'amount_off', 'free_period'];

// ─── Helper: collect Stripe product IDs for this app ─────────────────────────
async function getAppStripeProductIds() {
  const appSlug = process.env.APP_SLUG;
  if (!appSlug || !stripe) return [];
  try {
    const products = await stripe.products.search({
      query: `metadata['app_slug']:'${appSlug}'`,
      limit: 100,
    });
    return products.data.filter((p) => p.active).map((p) => p.id);
  } catch {
    return [];
  }
}

// ─── Helper: build Stripe coupon creation params ─────────────────────────────
function buildStripeCouponParams(type, value, maxRedemptions, validUntil, productIds) {
  const params = {
    metadata: {
      app_slug: process.env.APP_SLUG || '',
      source: 'nuvempro_admin',
    },
  };

  if (type === 'percent_off') {
    params.percent_off = parseFloat(value);
    params.duration = 'once';
  } else if (type === 'amount_off') {
    // Stripe requires amount in cents
    params.amount_off = Math.round(parseFloat(value) * 100);
    params.currency = 'brl';
    params.duration = 'once';
  } else if (type === 'free_period') {
    // Map "N days free" → 100% off for N months (rounded up)
    const months = Math.max(1, Math.ceil(parseFloat(value) / 30));
    params.percent_off = 100;
    params.duration = 'repeating';
    params.duration_in_months = months;
  }

  if (maxRedemptions) params.max_redemptions = parseInt(maxRedemptions);
  if (validUntil) params.redeem_by = Math.floor(new Date(validUntil).getTime() / 1000);

  // Restrict coupon to this app's Stripe products only
  if (productIds.length > 0) {
    params.applies_to = { products: productIds };
  }

  return params;
}

// ─── Helper: create/re-create Stripe Coupon + Promotion Code ─────────────────
async function syncCouponToStripe(coupon) {
  const productIds = await getAppStripeProductIds();

  let stripeCoupon;

  // Re-use existing Stripe Coupon if present and valid
  if (coupon.stripeCouponId) {
    try {
      stripeCoupon = await stripe.coupons.retrieve(coupon.stripeCouponId);
    } catch {
      // Deleted from Stripe — recreate
      stripeCoupon = null;
    }
  }

  if (!stripeCoupon) {
    const params = buildStripeCouponParams(
      coupon.type,
      coupon.value,
      coupon.maxRedemptions,
      coupon.validUntil,
      productIds,
    );
    stripeCoupon = await stripe.coupons.create(params);
  }

  // Re-use existing Promotion Code if present and valid
  let stripePromoCode;
  if (coupon.stripePromotionCodeId) {
    try {
      stripePromoCode = await stripe.promotionCodes.retrieve(coupon.stripePromotionCodeId);
    } catch {
      stripePromoCode = null;
    }
  }

  if (!stripePromoCode) {
    // Check if the code already exists as a promotion code in Stripe
    const existing = await stripe.promotionCodes.list({ code: coupon.code, limit: 1 });
    if (existing.data.length > 0) {
      stripePromoCode = existing.data[0];
    } else {
      const promoParams = {
        coupon: stripeCoupon.id,
        code: coupon.code,
        metadata: { app_slug: process.env.APP_SLUG || '' },
      };
      if (coupon.maxRedemptions) promoParams.max_redemptions = coupon.maxRedemptions;
      stripePromoCode = await stripe.promotionCodes.create(promoParams);
    }
  }

  return {
    stripeCouponId: stripeCoupon.id,
    stripePromotionCodeId: stripePromoCode.id,
  };
}

// ─── GET /admin-api/coupons/verify-stripe — verify all coupons in Stripe ─────
// NOTE: must be declared BEFORE /:id routes
router.get('/verify-stripe', requireRole('gerente'), async (req, res, next) => {
  try {
    const coupons = await prisma.adminCoupon.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const results = await Promise.all(
      coupons.map(async (c) => {
        if (!c.stripeCouponId) {
          return { id: c.id, code: c.code, status: 'not_synced' };
        }
        try {
          const sc = await stripe.coupons.retrieve(c.stripeCouponId);
          const promoOk = c.stripePromotionCodeId
            ? await stripe.promotionCodes
                .retrieve(c.stripePromotionCodeId)
                .then(() => true)
                .catch(() => false)
            : false;
          return {
            id: c.id,
            code: c.code,
            status: sc.valid ? 'synced' : 'expired',
            stripeCouponId: sc.id,
            stripePromotionCodeId: c.stripePromotionCodeId,
            promoCodeActive: promoOk,
          };
        } catch {
          return {
            id: c.id,
            code: c.code,
            status: 'missing',
            stripeCouponId: c.stripeCouponId,
          };
        }
      }),
    );

    res.json({ results });
  } catch (err) {
    next(err);
  }
});

// ─── GET /admin-api/coupons — list with pagination ───────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const { active } = req.query;

    const where = {};
    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;

    const [coupons, total] = await Promise.all([
      prisma.adminCoupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.adminCoupon.count({ where }),
    ]);

    res.json(paginatedResponse(coupons, total, { page, limit }));
  } catch (err) {
    next(err);
  }
});

// ─── POST /admin-api/coupons — create coupon + auto-sync to Stripe ───────────
router.post('/', requireRole('gerente'), async (req, res, next) => {
  try {
    const { code, type, value, maxRedemptions, validUntil } = req.body;

    if (!code || !type || value === undefined) {
      throw new AppError('code, type e value sao obrigatorios.', 400, 'MISSING_FIELDS');
    }
    if (!VALID_TYPES.includes(type)) {
      throw new AppError(
        `type deve ser: ${VALID_TYPES.join(', ')}.`,
        400,
        'INVALID_TYPE',
      );
    }

    const upperCode = code.toUpperCase();
    const existing = await prisma.adminCoupon.findUnique({ where: { code: upperCode } });
    if (existing) {
      throw new AppError('Codigo de cupom ja existe.', 409, 'COUPON_EXISTS');
    }

    // Create in DB first
    let coupon = await prisma.adminCoupon.create({
      data: {
        code: upperCode,
        type,
        value: parseFloat(value),
        maxRedemptions: maxRedemptions ? parseInt(maxRedemptions) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
      },
    });

    // Auto-sync to Stripe (non-blocking on error)
    let stripeError = null;
    try {
      const { stripeCouponId, stripePromotionCodeId } = await syncCouponToStripe(coupon);
      coupon = await prisma.adminCoupon.update({
        where: { id: coupon.id },
        data: { stripeCouponId, stripePromotionCodeId },
      });
    } catch (err) {
      stripeError = err.message;
    }

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'create_coupon',
      entity: 'admin_coupon',
      entityId: coupon.id,
      details: { code: coupon.code, type, value, stripeError },
      ipAddress: req.ip,
    });

    res.status(201).json({ coupon, stripeError });
  } catch (err) {
    next(err);
  }
});

// ─── POST /admin-api/coupons/:id/sync-stripe — sync existing coupon ──────────
router.post('/:id/sync-stripe', requireRole('gerente'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const coupon = await prisma.adminCoupon.findUnique({ where: { id } });
    if (!coupon) throw new AppError('Cupom nao encontrado.', 404, 'COUPON_NOT_FOUND');

    const { stripeCouponId, stripePromotionCodeId } = await syncCouponToStripe(coupon);

    const updated = await prisma.adminCoupon.update({
      where: { id },
      data: { stripeCouponId, stripePromotionCodeId },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'sync_coupon_stripe',
      entity: 'admin_coupon',
      entityId: id,
      details: { code: coupon.code, stripeCouponId, stripePromotionCodeId },
      ipAddress: req.ip,
    });

    res.json({ coupon: updated });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /admin-api/coupons/:id — toggle isActive ──────────────────────────
router.patch('/:id', requireRole('gerente'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const { isActive } = req.body;

    const coupon = await prisma.adminCoupon.findUnique({ where: { id } });
    if (!coupon) throw new AppError('Cupom nao encontrado.', 404, 'COUPON_NOT_FOUND');

    // If deactivating and has a Stripe promo code, deactivate it too
    if (isActive === false && coupon.stripePromotionCodeId) {
      try {
        await stripe.promotionCodes.update(coupon.stripePromotionCodeId, { active: false });
      } catch {
        // Ignore Stripe errors — DB update proceeds regardless
      }
    }

    const updated = await prisma.adminCoupon.update({
      where: { id },
      data: { isActive: Boolean(isActive) },
    });

    res.json({ coupon: updated });
  } catch (err) {
    next(err);
  }
});

// ─── POST /admin-api/coupons/:id/deactivate — deactivate coupon ──────────────
router.post('/:id/deactivate', requireRole('gerente'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    const coupon = await prisma.adminCoupon.findUnique({ where: { id } });
    if (!coupon) throw new AppError('Cupom nao encontrado.', 404, 'COUPON_NOT_FOUND');

    // Deactivate Stripe promotion code if present
    if (coupon.stripePromotionCodeId) {
      try {
        await stripe.promotionCodes.update(coupon.stripePromotionCodeId, { active: false });
      } catch {
        // Ignore Stripe errors
      }
    }

    const updated = await prisma.adminCoupon.update({
      where: { id },
      data: { isActive: false },
    });

    await adminLogService.log({
      adminId: req.admin.id,
      action: 'deactivate_coupon',
      entity: 'admin_coupon',
      entityId: id,
      details: { code: coupon.code },
      ipAddress: req.ip,
    });

    res.json({ coupon: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
