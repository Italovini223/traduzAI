// Listas canônicas de países, idiomas e moedas suportados pelo traduzAI.
// Fonte única de verdade — usada tanto para validar regras (translations.js)
// quanto exposta via GET /api/translations/options para os dropdowns do frontend.

const SUPPORTED_COUNTRIES = [
  { code: 'AR', label: 'Argentina' },
  { code: 'BO', label: 'Bolívia' },
  { code: 'BR', label: 'Brasil' },
  { code: 'CL', label: 'Chile' },
  { code: 'CO', label: 'Colômbia' },
  { code: 'CR', label: 'Costa Rica' },
  { code: 'CU', label: 'Cuba' },
  { code: 'DO', label: 'República Dominicana' },
  { code: 'EC', label: 'Equador' },
  { code: 'SV', label: 'El Salvador' },
  { code: 'GT', label: 'Guatemala' },
  { code: 'HN', label: 'Honduras' },
  { code: 'MX', label: 'México' },
  { code: 'NI', label: 'Nicarágua' },
  { code: 'PA', label: 'Panamá' },
  { code: 'PY', label: 'Paraguai' },
  { code: 'PE', label: 'Peru' },
  { code: 'PR', label: 'Porto Rico' },
  { code: 'UY', label: 'Uruguai' },
  { code: 'VE', label: 'Venezuela' },
  { code: 'US', label: 'Estados Unidos' },
  { code: 'CA', label: 'Canadá' },
  { code: 'PT', label: 'Portugal' },
  { code: 'ES', label: 'Espanha' },
  { code: 'FR', label: 'França' },
  { code: 'DE', label: 'Alemanha' },
  { code: 'IT', label: 'Itália' },
  { code: 'GB', label: 'Reino Unido' },
  { code: 'IE', label: 'Irlanda' },
  { code: 'NL', label: 'Países Baixos' },
  { code: 'BE', label: 'Bélgica' },
  { code: 'LU', label: 'Luxemburgo' },
  { code: 'CH', label: 'Suíça' },
  { code: 'AT', label: 'Áustria' },
  { code: 'SE', label: 'Suécia' },
  { code: 'NO', label: 'Noruega' },
  { code: 'DK', label: 'Dinamarca' },
  { code: 'FI', label: 'Finlândia' },
  { code: 'PL', label: 'Polônia' },
  { code: 'CZ', label: 'Tchéquia' },
  { code: 'HU', label: 'Hungria' },
  { code: 'RO', label: 'Romênia' },
  { code: 'GR', label: 'Grécia' },
  { code: 'RU', label: 'Rússia' },
  { code: 'UA', label: 'Ucrânia' },
  { code: 'CN', label: 'China' },
  { code: 'JP', label: 'Japão' },
  { code: 'KR', label: 'Coreia do Sul' },
  { code: 'IN', label: 'Índia' },
  { code: 'AU', label: 'Austrália' },
  { code: 'NZ', label: 'Nova Zelândia' },
  { code: 'ZA', label: 'África do Sul' },
  { code: 'IL', label: 'Israel' },
  { code: 'AE', label: 'Emirados Árabes Unidos' },
  { code: 'SA', label: 'Arábia Saudita' },
  { code: 'TR', label: 'Turquia' },
];

// code: identificador interno usado nas regras (StoreLocaleRule.language).
// deeplTarget: código de destino esperado pela API do DeepL.
const SUPPORTED_LANGUAGES = [
  { code: 'pt-BR', label: 'Português (Brasil)', deeplTarget: 'PT-BR' },
  { code: 'pt-PT', label: 'Português (Portugal)', deeplTarget: 'PT-PT' },
  { code: 'en', label: 'Inglês', deeplTarget: 'EN-US' },
  { code: 'es', label: 'Espanhol', deeplTarget: 'ES' },
  { code: 'fr', label: 'Francês', deeplTarget: 'FR' },
  { code: 'de', label: 'Alemão', deeplTarget: 'DE' },
  { code: 'it', label: 'Italiano', deeplTarget: 'IT' },
  { code: 'nl', label: 'Holandês', deeplTarget: 'NL' },
  { code: 'pl', label: 'Polonês', deeplTarget: 'PL' },
  { code: 'ru', label: 'Russo', deeplTarget: 'RU' },
  { code: 'ja', label: 'Japonês', deeplTarget: 'JA' },
  { code: 'zh', label: 'Chinês', deeplTarget: 'ZH' },
  { code: 'ko', label: 'Coreano', deeplTarget: 'KO' },
  { code: 'tr', label: 'Turco', deeplTarget: 'TR' },
];

const SUPPORTED_CURRENCIES = [
  { code: 'BRL', label: 'Real brasileiro' },
  { code: 'ARS', label: 'Peso argentino' },
  { code: 'BOB', label: 'Boliviano da Bolívia' },
  { code: 'CLP', label: 'Peso chileno' },
  { code: 'COP', label: 'Peso colombiano' },
  { code: 'CRC', label: 'Colón costarriquenho' },
  { code: 'CUP', label: 'Peso cubano' },
  { code: 'DOP', label: 'Peso dominicano' },
  { code: 'USD', label: 'Dólar americano' },
  { code: 'GTQ', label: 'Quetzal guatemalteco' },
  { code: 'HNL', label: 'Lempira hondurenha' },
  { code: 'MXN', label: 'Peso mexicano' },
  { code: 'NIO', label: 'Córdoba nicaraguense' },
  { code: 'PAB', label: 'Balboa panamenho' },
  { code: 'PYG', label: 'Guarani paraguaio' },
  { code: 'PEN', label: 'Novo sol peruano' },
  { code: 'UYU', label: 'Peso uruguaio' },
  { code: 'VES', label: 'Bolívar venezuelano' },
  { code: 'CAD', label: 'Dólar canadense' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'Libra esterlina' },
  { code: 'CHF', label: 'Franco suíço' },
  { code: 'SEK', label: 'Coroa sueca' },
  { code: 'NOK', label: 'Coroa norueguesa' },
  { code: 'DKK', label: 'Coroa dinamarquesa' },
  { code: 'PLN', label: 'Zloty polonês' },
  { code: 'CZK', label: 'Coroa tcheca' },
  { code: 'HUF', label: 'Florim húngaro' },
  { code: 'RON', label: 'Leu romeno' },
  { code: 'RUB', label: 'Rublo russo' },
  { code: 'UAH', label: 'Hryvnia ucraniano' },
  { code: 'CNY', label: 'Yuan chinês' },
  { code: 'JPY', label: 'Iene japonês' },
  { code: 'KRW', label: 'Won sul-coreano' },
  { code: 'INR', label: 'Rupia indiana' },
  { code: 'AUD', label: 'Dólar australiano' },
  { code: 'NZD', label: 'Dólar neozelandês' },
  { code: 'ZAR', label: 'Rand sul-africano' },
  { code: 'ILS', label: 'Novo shekel israelense' },
  { code: 'AED', label: 'Dirham dos Emirados Árabes Unidos' },
  { code: 'SAR', label: 'Riyal saudita' },
  { code: 'TRY', label: 'Lira turca' },
];

// Idioma e moeda oficiais/mais usados de cada pais — usado para pre-preencher
// o formulario ao selecionar um pais no mapa (usuario pode trocar antes de salvar).
// Paises sem idioma exato na lista SUPPORTED_LANGUAGES caem em 'en' como fallback pratico.
const COUNTRY_DEFAULTS = {
  AR: { language: 'es', currency: 'ARS' },
  BO: { language: 'es', currency: 'BOB' },
  BR: { language: 'pt-BR', currency: 'BRL' },
  CL: { language: 'es', currency: 'CLP' },
  CO: { language: 'es', currency: 'COP' },
  CR: { language: 'es', currency: 'CRC' },
  CU: { language: 'es', currency: 'CUP' },
  DO: { language: 'es', currency: 'DOP' },
  EC: { language: 'es', currency: 'USD' },
  SV: { language: 'es', currency: 'USD' },
  GT: { language: 'es', currency: 'GTQ' },
  HN: { language: 'es', currency: 'HNL' },
  MX: { language: 'es', currency: 'MXN' },
  NI: { language: 'es', currency: 'NIO' },
  PA: { language: 'es', currency: 'PAB' },
  PY: { language: 'es', currency: 'PYG' },
  PE: { language: 'es', currency: 'PEN' },
  PR: { language: 'es', currency: 'USD' },
  UY: { language: 'es', currency: 'UYU' },
  VE: { language: 'es', currency: 'VES' },
  US: { language: 'en', currency: 'USD' },
  CA: { language: 'en', currency: 'CAD' },
  PT: { language: 'pt-PT', currency: 'EUR' },
  ES: { language: 'es', currency: 'EUR' },
  FR: { language: 'fr', currency: 'EUR' },
  DE: { language: 'de', currency: 'EUR' },
  IT: { language: 'it', currency: 'EUR' },
  GB: { language: 'en', currency: 'GBP' },
  IE: { language: 'en', currency: 'EUR' },
  NL: { language: 'nl', currency: 'EUR' },
  BE: { language: 'nl', currency: 'EUR' },
  LU: { language: 'fr', currency: 'EUR' },
  CH: { language: 'de', currency: 'CHF' },
  AT: { language: 'de', currency: 'EUR' },
  SE: { language: 'en', currency: 'SEK' },
  NO: { language: 'en', currency: 'NOK' },
  DK: { language: 'en', currency: 'DKK' },
  FI: { language: 'en', currency: 'EUR' },
  PL: { language: 'pl', currency: 'PLN' },
  CZ: { language: 'en', currency: 'CZK' },
  HU: { language: 'en', currency: 'HUF' },
  RO: { language: 'en', currency: 'RON' },
  GR: { language: 'en', currency: 'EUR' },
  RU: { language: 'ru', currency: 'RUB' },
  UA: { language: 'en', currency: 'UAH' },
  CN: { language: 'zh', currency: 'CNY' },
  JP: { language: 'ja', currency: 'JPY' },
  KR: { language: 'ko', currency: 'KRW' },
  IN: { language: 'en', currency: 'INR' },
  AU: { language: 'en', currency: 'AUD' },
  NZ: { language: 'en', currency: 'NZD' },
  ZA: { language: 'en', currency: 'ZAR' },
  IL: { language: 'en', currency: 'ILS' },
  AE: { language: 'en', currency: 'AED' },
  SA: { language: 'en', currency: 'SAR' },
  TR: { language: 'tr', currency: 'TRY' },
};

const COUNTRY_CODES = new Set(SUPPORTED_COUNTRIES.map((c) => c.code));
const LANGUAGE_CODES = new Set(SUPPORTED_LANGUAGES.map((l) => l.code));
const CURRENCY_CODES = new Set(SUPPORTED_CURRENCIES.map((c) => c.code));

function isValidCountry(code) {
  return typeof code === 'string' && COUNTRY_CODES.has(code);
}

function isValidLanguage(code) {
  return typeof code === 'string' && LANGUAGE_CODES.has(code);
}

function isValidCurrency(code) {
  return typeof code === 'string' && CURRENCY_CODES.has(code);
}

function isValidRule({ country, language, currency }) {
  return isValidCountry(country) && isValidLanguage(language) && isValidCurrency(currency);
}

function getDeeplTarget(languageCode) {
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === languageCode);
  return lang ? lang.deeplTarget : null;
}

function getCountryDefaults(countryCode) {
  return COUNTRY_DEFAULTS[countryCode] || null;
}

const COUNTRY_LABELS = SUPPORTED_COUNTRIES.reduce((acc, c) => {
  acc[c.code] = c.label;
  return acc;
}, {});

/**
 * Acha um pais cujo idioma+moeda padrao (COUNTRY_DEFAULTS) batam exatamente
 * com o idioma/moeda de origem configurados pelo lojista — usado pra dar uma
 * bandeira "nativa" ao seletor do widget e pra identificar o pais de origem
 * nas metricas do painel (best-effort, heuristico: nao ha campo de pais de
 * origem no schema, so idioma+moeda).
 */
function findHomeCountry(sourceLanguage, baseCurrency) {
  const code = Object.keys(COUNTRY_DEFAULTS).find((c) => {
    const d = COUNTRY_DEFAULTS[c];
    return d.language === sourceLanguage && d.currency === baseCurrency;
  });
  if (!code) return null;
  return { code, name: COUNTRY_LABELS[code] || code, language: sourceLanguage, currency: baseCurrency };
}

module.exports = {
  SUPPORTED_COUNTRIES,
  SUPPORTED_LANGUAGES,
  SUPPORTED_CURRENCIES,
  COUNTRY_DEFAULTS,
  COUNTRY_LABELS,
  isValidCountry,
  isValidLanguage,
  isValidCurrency,
  isValidRule,
  getDeeplTarget,
  getCountryDefaults,
  findHomeCountry,
};
