const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  findPriceMatches,
  parseLocalizedNumber,
  replacePricesInText,
} = require('../lib/priceParser');

test('parseLocalizedNumber handles pt-BR format (dot thousands, comma decimal)', () => {
  assert.equal(parseLocalizedNumber('1.234,56'), 1234.56);
  assert.equal(parseLocalizedNumber('19,90'), 19.9);
});

test('parseLocalizedNumber handles en-US format (comma thousands, dot decimal)', () => {
  assert.equal(parseLocalizedNumber('1,234.56'), 1234.56);
  assert.equal(parseLocalizedNumber('19.90'), 19.9);
});

test('findPriceMatches detects BRL, USD and EUR patterns in free text', () => {
  const text = 'De R$ 199,90 por R$ 149,90! Also available for US$ 29.99 or €19,99.';
  const matches = findPriceMatches(text);

  assert.equal(matches.length, 4);
  assert.equal(matches[0].amount, 199.9);
  assert.equal(matches[0].currency, 'BRL');
  assert.equal(matches[1].amount, 149.9);
  assert.equal(matches[2].amount, 29.99);
  assert.equal(matches[2].currency, 'USD');
  assert.equal(matches[3].amount, 19.99);
  assert.equal(matches[3].currency, 'EUR');
});

test('findPriceMatches returns nothing for text without prices', () => {
  assert.deepEqual(findPriceMatches('Frete grátis para todo o Brasil'), []);
});

test('replacePricesInText converts detected prices using the given rate', () => {
  const text = 'Por apenas R$ 100,00 hoje!';
  const result = replacePricesInText(text, 0.2, 'USD', 'en-US');

  assert.match(result, /\$20\.00/);
  assert.match(result, /^Por apenas/);
  assert.match(result, /hoje!$/);
});

test('replacePricesInText leaves text unchanged when no price is found', () => {
  const text = 'Sem preços aqui';
  assert.equal(replacePricesInText(text, 0.2, 'USD'), text);
});

test('findPriceMatches detects symbol AFTER the number (DeepL repositions it in some target languages)', () => {
  const matches = findPriceMatches('179,90 R$');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].amount, 179.9);
  assert.equal(matches[0].currency, 'BRL');
});

test('replacePricesInText converts prices with the symbol positioned after the number', () => {
  const result = replacePricesInText('179,90 R$', 293.5019, 'ARS', 'en-US');
  assert.doesNotMatch(result, /179,90/);
  assert.match(result, /52,800\.99/);
});
