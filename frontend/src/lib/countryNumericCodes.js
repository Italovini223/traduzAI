// Mapa alpha-2 (usado nas regras) -> ISO 3166-1 numeric (usado como `id` nas
// geometrias do topojson world-atlas). Cobre os mesmos paises de
// backend/src/lib/localeOptions.js#SUPPORTED_COUNTRIES.
export const COUNTRY_NUMERIC_CODES = {
  AR: 32, BO: 68, BR: 76, CL: 152, CO: 170, CR: 188, CU: 192, DO: 214, EC: 218, SV: 222,
  GT: 320, HN: 340, MX: 484, NI: 558, PA: 591, PY: 600, PE: 604, PR: 630, UY: 858, VE: 862,
  US: 840, CA: 124, PT: 620, ES: 724, FR: 250, DE: 276, IT: 380, GB: 826, IE: 372, NL: 528,
  BE: 56, LU: 442, CH: 756, AT: 40, SE: 752, NO: 578, DK: 208, FI: 246, PL: 616, CZ: 203,
  HU: 348, RO: 642, GR: 300, RU: 643, UA: 804, CN: 156, JP: 392, KR: 410, IN: 356, AU: 36,
  NZ: 554, ZA: 710, IL: 376, AE: 784, SA: 682, TR: 792,
};

export const NUMERIC_TO_ALPHA2 = Object.fromEntries(
  Object.entries(COUNTRY_NUMERIC_CODES).map(([alpha2, numeric]) => [numeric, alpha2])
);
