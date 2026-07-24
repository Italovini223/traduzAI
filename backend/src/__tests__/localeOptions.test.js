const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidCountry,
  isValidLanguage,
  isValidCurrency,
  isValidRule,
  getDeeplTarget,
} = require('../lib/localeOptions');

test('isValidCountry accepts known codes and rejects unknown/garbage', () => {
  assert.equal(isValidCountry('US'), true);
  assert.equal(isValidCountry('BR'), true);
  assert.equal(isValidCountry('XX'), false);
  assert.equal(isValidCountry(''), false);
  assert.equal(isValidCountry(undefined), false);
});

test('isValidLanguage accepts known internal codes', () => {
  assert.equal(isValidLanguage('en'), true);
  assert.equal(isValidLanguage('pt-BR'), true);
  assert.equal(isValidLanguage('klingon'), false);
});

test('isValidCurrency accepts known ISO codes', () => {
  assert.equal(isValidCurrency('USD'), true);
  assert.equal(isValidCurrency('BRL'), true);
  assert.equal(isValidCurrency('ZZZ'), false);
});

test('isValidRule requires all three fields valid', () => {
  assert.equal(isValidRule({ country: 'US', language: 'en', currency: 'USD' }), true);
  assert.equal(isValidRule({ country: 'US', language: 'en', currency: 'ZZZ' }), false);
  assert.equal(isValidRule({ country: 'XX', language: 'en', currency: 'USD' }), false);
  assert.equal(isValidRule({}), false);
});

test('getDeeplTarget maps internal codes to DeepL target codes', () => {
  assert.equal(getDeeplTarget('en'), 'EN-US');
  assert.equal(getDeeplTarget('pt-BR'), 'PT-BR');
  assert.equal(getDeeplTarget('unknown'), null);
});
