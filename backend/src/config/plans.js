/**
 * Dynamic PLAN_MAP built from environment variables.
 * Price IDs are populated after admin sync with Stripe.
 */
function buildPlanMap() {
  return {
    growth: {
      monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY || null,
      semestral: process.env.STRIPE_PRICE_GROWTH_SEMESTRAL || null,
      annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL || null,
    },
    scale: {
      monthly: process.env.STRIPE_PRICE_SCALE_MONTHLY || null,
      semestral: process.env.STRIPE_PRICE_SCALE_SEMESTRAL || null,
      annual: process.env.STRIPE_PRICE_SCALE_ANNUAL || null,
    },
  };
}

/**
 * Get price ID for a specific plan and billing interval.
 */
function getPriceId(planKey, billingInterval) {
  const map = buildPlanMap();
  const plan = map[planKey];
  if (!plan) return null;
  return plan[billingInterval] || null;
}

/**
 * Validate that a plan key and interval combination exists.
 */
function isValidPlan(planKey, billingInterval) {
  const priceId = getPriceId(planKey, billingInterval);
  return priceId !== null && priceId !== '';
}

/**
 * Get all available plans with their intervals.
 */
function getAvailablePlans() {
  const map = buildPlanMap();
  const plans = [];

  for (const [planKey, intervals] of Object.entries(map)) {
    const availableIntervals = [];
    for (const [interval, priceId] of Object.entries(intervals)) {
      if (priceId) {
        availableIntervals.push(interval);
      }
    }
    plans.push({
      key: planKey,
      intervals: availableIntervals,
      configured: availableIntervals.length > 0,
    });
  }

  return plans;
}

module.exports = { buildPlanMap, getPriceId, isValidPlan, getAvailablePlans };
