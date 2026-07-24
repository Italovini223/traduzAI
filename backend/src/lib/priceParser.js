// Detecção e conversão de preços em texto livre via regex.
//
// Não há API padrão da Nuvemshop para identificar "qual elemento é preço" em
// temas arbitrários — por isso a extração é heurística, baseada em padrões
// monetários comuns (símbolo/código de moeda + número).
//
// IMPORTANTE: esta é a implementação de referência (testada via
// backend/src/__tests__). O widget público (backend/public/widget.js) roda
// direto no navegador do comprador, sem bundler/require — por isso ele
// mantém uma cópia funcionalmente idêntica desta lógica. Qualquer mudança
// aqui deve ser replicada lá.

const CURRENCY_SYMBOLS = {
  'R$': 'BRL',
  'US$': 'USD',
  'U$S': 'USD',
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₩': 'KRW',
  '₹': 'INR',
  '₺': 'TRY',
};

// Casa símbolo/código de moeda seguido (ou precedido) de um número no
// formato pt-BR/es (1.234,56) ou en-US (1,234.56).
const PRICE_REGEX = new RegExp(
  '(' + Object.keys(CURRENCY_SYMBOLS).map(escapeRegExp).join('|') + ')' +
  '\\s?' +
  '(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{1,2})?)',
  'g'
);

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converte um número formatado (pt-BR "1.234,56" ou en-US "1,234.56") para float.
 */
function parseLocalizedNumber(raw) {
  const hasComma = raw.includes(',');
  const hasDot = raw.includes('.');

  if (hasComma && hasDot) {
    // O último separador é o decimal; o outro é milhar.
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    return parseFloat(
      raw.split(thousandSep).join('').replace(decimalSep, '.')
    );
  }

  if (hasComma) {
    // Só vírgula: assume decimal pt-BR se tiver 1-2 dígitos depois, senão milhar.
    const parts = raw.split(',');
    if (parts[parts.length - 1].length <= 2) {
      return parseFloat(raw.replace(',', '.'));
    }
    return parseFloat(raw.split(',').join(''));
  }

  if (hasDot) {
    const parts = raw.split('.');
    if (parts[parts.length - 1].length <= 2) {
      return parseFloat(raw);
    }
    return parseFloat(raw.split('.').join(''));
  }

  return parseFloat(raw);
}

/**
 * Encontra todas as ocorrências de preço em um texto.
 * Retorna [{ fullMatch, symbol, currency, amount, index }]
 */
function findPriceMatches(text) {
  const matches = [];
  let m;
  PRICE_REGEX.lastIndex = 0;
  while ((m = PRICE_REGEX.exec(text)) !== null) {
    const [fullMatch, symbol, rawAmount] = m;
    const amount = parseLocalizedNumber(rawAmount);
    if (Number.isNaN(amount)) continue;
    matches.push({
      fullMatch,
      symbol,
      currency: CURRENCY_SYMBOLS[symbol],
      amount,
      index: m.index,
    });
  }
  return matches;
}

/**
 * Formata um valor numérico como moeda usando Intl.NumberFormat.
 */
function formatPrice(amount, currencyCode, locale = 'en-US') {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(amount);
  } catch {
    return `${currencyCode} ${amount.toFixed(2)}`;
  }
}

/**
 * Substitui todas as ocorrências de preço em um texto pelo valor convertido
 * na moeda de destino, usando a taxa de câmbio fornecida (targetAmount = amount * rate).
 */
function replacePricesInText(text, rate, targetCurrencyCode, locale = 'en-US') {
  const matches = findPriceMatches(text);
  if (matches.length === 0) return text;

  let result = '';
  let lastIndex = 0;
  for (const match of matches) {
    result += text.slice(lastIndex, match.index);
    const converted = match.amount * rate;
    result += formatPrice(converted, targetCurrencyCode, locale);
    lastIndex = match.index + match.fullMatch.length;
  }
  result += text.slice(lastIndex);
  return result;
}

module.exports = {
  CURRENCY_SYMBOLS,
  findPriceMatches,
  parseLocalizedNumber,
  formatPrice,
  replacePricesInText,
};
