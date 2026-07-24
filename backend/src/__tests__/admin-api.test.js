'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const { BASE, getAdminToken } = require('./helpers');

let token;

before(async () => {
  token = await getAdminToken();
});

// ─── Admin Auth ──────────────────────────────────────────────────────────────

describe('Admin Auth', () => {
  it('POST /admin-api/auth/login com credenciais válidas → 200 + token', async () => {
    const res = await fetch(`${BASE}/admin-api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.ADMIN_SEED_EMAIL || 'admin@testapp.com',
        password: process.env.ADMIN_SEED_PASSWORD || 'TestPassword123!',
      }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.token, 'Deve retornar token');
    assert.strictEqual(typeof body.token, 'string');
  });

  it('POST /admin-api/auth/login com senha errada → 401', async () => {
    const res = await fetch(`${BASE}/admin-api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@testapp.com', password: 'wrongpassword' }),
    });
    assert.strictEqual(res.status, 401);
  });
});

// ─── Admin Plans ─────────────────────────────────────────────────────────────

describe('Admin Plans — Contrato da API', () => {
  it('GET /admin-api/plans → 200 com lista de planos', async () => {
    const res = await fetch(`${BASE}/admin-api/plans`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    // /admin-api/plans retorna { plans: [...] } — não é paginado
    assert.ok(Array.isArray(body.plans), 'plans deve ser array');
  });

  it('GET /admin-api/plans → features são arrays de strings (NUNCA objetos)', async () => {
    const res = await fetch(`${BASE}/admin-api/plans`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    for (const plan of body.plans) {
      if (plan.features != null) {
        assert.ok(
          Array.isArray(plan.features),
          `Plano "${plan.name}": features deve ser array, recebeu ${typeof plan.features}`
        );
        for (const feature of plan.features) {
          assert.strictEqual(
            typeof feature,
            'string',
            `Plano "${plan.name}": cada feature deve ser string, recebeu ${typeof feature}`
          );
        }
      }
    }
  });

  it('GET /admin-api/plans → isFree não é retornado como campo Prisma direto', async () => {
    const res = await fetch(`${BASE}/admin-api/plans`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Se retornar 500, significa que isFree foi usado como campo Prisma (erro)
    assert.notStrictEqual(res.status, 500, 'isFree não pode ser campo Prisma — causa 500');
  });
});

// ─── Admin Config ─────────────────────────────────────────────────────────────

describe('Admin Config — Contrato da API', () => {
  it('GET /admin-api/config → 200 com raw array', async () => {
    const res = await fetch(`${BASE}/admin-api/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.raw), 'deve ter raw como array');
  });

  it('GET /admin-api/config → tem chaves de trial (trial_mode, trial_days)', async () => {
    const res = await fetch(`${BASE}/admin-api/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    const keys = (body.raw || []).map((c) => c.key);
    assert.ok(keys.includes('trial_mode'), 'Deve ter trial_mode');
    assert.ok(keys.includes('trial_days'), 'Deve ter trial_days');
  });

  it('GET /admin-api/config → tem chaves de metas (goal_stores, server_cost)', async () => {
    const res = await fetch(`${BASE}/admin-api/config`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    const keys = (body.raw || []).map((c) => c.key);
    assert.ok(keys.includes('goal_stores'), 'Deve ter goal_stores');
    assert.ok(keys.includes('server_cost'), 'Deve ter server_cost');
  });
});

// ─── Admin Dashboard ─────────────────────────────────────────────────────────

describe('Admin Dashboard — Contrato da API', () => {
  it('GET /admin-api/customers/dashboard → 200 com todos os campos esperados', async () => {
    const res = await fetch(`${BASE}/admin-api/customers/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();

    // stats
    assert.ok(body.stats, 'Deve ter stats');
    assert.ok('totalStores' in body.stats, 'stats.totalStores');
    assert.ok('activeSubscriptions' in body.stats, 'stats.activeSubscriptions');
    assert.ok('trialStores' in body.stats, 'stats.trialStores');
    assert.ok('expiredStores' in body.stats, 'stats.expiredStores');
    assert.ok('mrr' in body.stats, 'stats.mrr');

    // goals
    assert.ok(body.goals !== undefined, 'Deve ter goals');

    // prevPeriod
    assert.ok(body.prevPeriod !== undefined, 'Deve ter prevPeriod');
    assert.ok('storesTrend' in body.prevPeriod, 'prevPeriod.storesTrend');
    assert.ok('subsTrend' in body.prevPeriod, 'prevPeriod.subsTrend');
    assert.ok('mrrTrend' in body.prevPeriod, 'prevPeriod.mrrTrend');

    // margin
    assert.ok(body.margin !== undefined, 'Deve ter margin');
    assert.ok('net' in body.margin, 'margin.net');

    // charts
    assert.ok(Array.isArray(body.monthlyInstalls), 'monthlyInstalls deve ser array');
    assert.ok(Array.isArray(body.subscriptionDistribution), 'subscriptionDistribution deve ser array');
    assert.strictEqual(body.monthlyInstalls.length, 6, 'monthlyInstalls deve ter 6 meses');
  });
});

// ─── Admin Subscriptions ─────────────────────────────────────────────────────

describe('Admin Subscriptions — Contrato da API', () => {
  it('GET /admin-api/subscriptions → 200 com data, meta e metrics', async () => {
    const res = await fetch(`${BASE}/admin-api/subscriptions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();

    assert.ok(Array.isArray(body.data), 'data deve ser array');
    assert.ok(body.meta, 'deve ter meta');
    assert.ok(body.metrics, 'deve ter metrics');
    assert.ok('mrr' in body.metrics, 'metrics.mrr');
    assert.ok('arr' in body.metrics, 'metrics.arr');
    assert.ok('active' in body.metrics, 'metrics.active');
    assert.ok('canceled' in body.metrics, 'metrics.canceled');
  });

  it('GET /admin-api/subscriptions → cada item tem storeName flat (não aninhado)', async () => {
    const res = await fetch(`${BASE}/admin-api/subscriptions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await res.json();
    for (const sub of body.data) {
      assert.ok(
        'storeName' in sub,
        `Subscription ${sub.id}: deve ter storeName flat`
      );
      assert.ok(
        !('store' in sub),
        `Subscription ${sub.id}: não deve ter store aninhado`
      );
    }
  });
});

// ─── Admin Customers ─────────────────────────────────────────────────────────

describe('Admin Customers — Contrato da API', () => {
  it('GET /admin-api/customers → 200 com paginação e status computado', async () => {
    const res = await fetch(`${BASE}/admin-api/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data), 'data deve ser array');
    assert.ok(body.meta, 'deve ter meta');
    for (const store of body.data) {
      assert.ok('status' in store, `Store ${store.id}: deve ter status computado`);
      assert.ok('planKey' in store, `Store ${store.id}: deve ter planKey`);
      const validStatuses = ['active', 'trial', 'expired', 'canceled', 'no_plan', 'past_due'];
      assert.ok(
        validStatuses.includes(store.status),
        `Store ${store.id}: status "${store.status}" deve ser um dos: ${validStatuses.join(', ')}`
      );
    }
  });

  it('GET /admin-api/customers/:id → 200 com store (não customer)', async () => {
    // Primeiro pega um ID válido
    const listRes = await fetch(`${BASE}/admin-api/customers`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listBody = await listRes.json();
    if (listBody.data.length === 0) {
      // Sem clientes — teste de shape não aplicável
      return;
    }
    const id = listBody.data[0].id;
    const res = await fetch(`${BASE}/admin-api/customers/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(body.store, 'Deve retornar { store, invoices } — não { customer }');
    assert.ok(Array.isArray(body.invoices), 'Deve ter invoices array');
  });
});
