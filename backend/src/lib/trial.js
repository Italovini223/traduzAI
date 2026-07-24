'use strict';

/**
 * Modos de trial válidos.
 *   - none: sem trial; usuário precisa assinar para acessar
 *   - free: X dias grátis sem cartão; banner de contagem regressiva no app
 *   - paid: usuário assina mas recebe X dias grátis via trial_period_days do Stripe
 */
const TRIAL_MODES = ['none', 'free', 'paid'];

/**
 * Normaliza o valor de trial_mode lido do AdminConfig.
 * Qualquer valor fora do enum (typo no admin, string vazia, null) vira 'none' —
 * default seguro que evita quebra silenciosa da lógica de trial/billing.
 */
function normalizeTrialMode(value) {
  return TRIAL_MODES.includes(value) ? value : 'none';
}

/**
 * Normaliza trial_days: inteiro positivo, com fallback. Limita a um teto de 365
 * para evitar valores absurdos vindos de config corrompida.
 */
function normalizeTrialDays(value, fallback = 7) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, 365);
}

module.exports = { TRIAL_MODES, normalizeTrialMode, normalizeTrialDays };
