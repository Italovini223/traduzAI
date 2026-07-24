'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { BASE } = require('./helpers');

/**
 * Contrato: rotas protegidas DEVEM retornar 401 sem token.
 * Qualquer rota que passe (retorne != 401) expõe dados sem auth.
 */
describe('Auth Guards — App routes (JWT Nuvemshop)', () => {
  const routes = [
    ['GET',  '/api/billing/status'],
    ['GET',  '/api/billing/plans'],
    ['POST', '/api/billing/checkout'],
    ['POST', '/api/billing/sync'],
    ['GET',  '/api/billing/invoices'],
    ['GET',  '/api/profile'],
    ['GET',  '/api/terms/status'],
  ];

  for (const [method, path] of routes) {
    it(`${method} ${path} → 401 sem token`, async () => {
      const res = await fetch(`${BASE}${path}`, { method });
      assert.strictEqual(res.status, 401, `${method} ${path} deveria ser 401`);

      const body = await res.json();
      assert.ok(body.error, 'Deve ter campo error');
      assert.ok(body.code, 'Deve ter campo code');
    });
  }
});

describe('Auth Guards — Admin routes (JWT Admin)', () => {
  const routes = [
    ['GET', '/admin-api/plans'],
    ['GET', '/admin-api/customers'],
    ['GET', '/admin-api/customers/dashboard'],
    ['GET', '/admin-api/subscriptions'],
    ['GET', '/admin-api/config'],
    ['GET', '/admin-api/coupons'],
    ['GET', '/admin-api/logs'],
  ];

  for (const [method, path] of routes) {
    it(`${method} ${path} → 401 sem token`, async () => {
      const res = await fetch(`${BASE}${path}`, { method });
      assert.strictEqual(res.status, 401, `${method} ${path} deveria ser 401`);

      const body = await res.json();
      assert.ok(body.error, 'Deve ter campo error');
      assert.ok(body.code, 'Deve ter campo code');
    });
  }
});
