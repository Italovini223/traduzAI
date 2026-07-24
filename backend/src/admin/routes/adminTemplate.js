const express = require('express');
const { TEMPLATE_VERSION, TEMPLATE_REPO } = require('../../lib/version');

const router = express.Router();

// Cache em memória da última consulta ao GitHub (evita rate limit e latência).
let _cache = { at: 0, data: null };
const TTL_MS = 30 * 60 * 1000; // 30 min

// Compara versões semver simples (x.y.z). Retorna true se a > b.
function semverGt(a, b) {
  const toNum = (v) =>
    String(v).split('.').map(Number).reduce((acc, n, i) => acc + (n || 0) * Math.pow(1000, 2 - i), 0);
  return toNum(a) > toNum(b);
}

/**
 * GET /admin-api/template/version
 * Retorna a versão instalada e a mais recente do template no GitHub.
 * A consulta ao GitHub é feita aqui (server-side) com GITHUB_TOKEN, então
 * funciona mesmo com repositório PRIVADO — o token nunca vai ao navegador.
 */
router.get('/version', async (req, res) => {
  const base = {
    current: TEMPLATE_VERSION,
    repo: TEMPLATE_REPO,
    latest: null,
    outdated: false,
    releaseUrl: null,
    checkedAt: null,
  };

  if (_cache.data && Date.now() - _cache.at < TTL_MS) {
    return res.json(_cache.data);
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': process.env.APP_NAME || 'nuvempro-app',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const r = await fetch(`https://api.github.com/repos/${TEMPLATE_REPO}/releases/latest`, { headers });
    if (r.ok) {
      const gh = await r.json();
      const latest = gh.tag_name ? gh.tag_name.replace(/^v/, '') : null;
      base.latest = latest;
      base.releaseUrl = gh.html_url || null;
      base.outdated = !!(latest && semverGt(latest, TEMPLATE_VERSION));
    }
    // 404 (repo privado sem token) / 403 (rate limit): latest fica null, sem erro.
  } catch {
    // GitHub offline — retorna sem latest
  }

  base.checkedAt = new Date().toISOString();
  _cache = { at: Date.now(), data: base };
  res.json(base);
});

module.exports = router;
