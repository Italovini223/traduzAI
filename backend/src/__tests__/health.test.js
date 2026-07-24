const { describe, it } = require('node:test');
const assert = require('node:assert');

describe('Smoke Tests', () => {
  const BASE = process.env.TEST_URL || 'http://localhost:3001';

  it('GET /health returns 200', async () => {
    const res = await fetch(`${BASE}/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
  });

  it('GET /admin-api/health returns 200', async () => {
    const res = await fetch(`${BASE}/admin-api/health`);
    assert.strictEqual(res.status, 200);
  });

  it('Protected routes return 401 without token', async () => {
    const res = await fetch(`${BASE}/api/billing/status`);
    assert.strictEqual(res.status, 401);
  });

  it('Admin routes return 401 without token', async () => {
    const res = await fetch(`${BASE}/admin-api/plans`);
    assert.strictEqual(res.status, 401);
  });

  it('Webhook returns 400 without signature', async () => {
    const res = await fetch(`${BASE}/webhook`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    assert.strictEqual(res.status, 400);
  });
});
