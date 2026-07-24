'use strict';

const BASE = process.env.TEST_URL || 'http://localhost:3001';

let _adminToken = null;

/**
 * Faz login como admin e cacheia o token para o processo.
 * Reutilizado por todos os arquivos de teste.
 */
async function getAdminToken() {
  if (_adminToken) return _adminToken;

  const res = await fetch(`${BASE}/admin-api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: process.env.ADMIN_SEED_EMAIL || 'admin@testapp.com',
      password: process.env.ADMIN_SEED_PASSWORD || 'TestPassword123!',
    }),
  });

  if (!res.ok) {
    throw new Error(`Admin login failed: ${res.status} ${await res.text()}`);
  }

  const body = await res.json();
  _adminToken = body.token;
  return _adminToken;
}

module.exports = { BASE, getAdminToken };
