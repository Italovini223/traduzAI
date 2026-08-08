const axios = require('axios');
const geoipLite = require('geoip-lite');
const prisma = require('../lib/prisma');

// ─── Resolucao de pais por IP: geoip-lite (local) + ipapi.co (fallback) ───
// geoip-lite usa uma base MaxMind GeoLite2 gratuita empacotada no proprio
// pacote — instantaneo (sem rede), mas nao atualiza sozinha e tem buracos de
// cobertura reais (IPs de VPN e faixas mais novas costumam faltar, confirmado
// em teste real). So cai na API externa quando a base local nao reconhece o
// IP, response cacheada no banco pra nao repetir a chamada externa pro mesmo
// IP (residencial/mobile costuma reaparecer bastante entre visitas).
const POSITIVE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias — IP->pais muda raramente
const NEGATIVE_TTL_MS = 60 * 60 * 1000; // 1h — nao trava um IP em "sem pais" por falha transitoria da API

const GeoIPService = {
  /**
   * Retorna o codigo de pais (ex: "US") pro IP informado, ou null se nao foi
   * possivel resolver por nenhuma das duas fontes. Nunca lanca — falha aqui
   * so significa "sem deteccao automatica pra esse visitante", nunca deve
   * quebrar a vitrine.
   */
  async lookupCountry(ip) {
    if (!ip) return null;

    const local = geoipLite.lookup(ip);
    if (local?.country) return local.country;

    const cached = await prisma.ipGeoCache.findUnique({ where: { ip } });
    if (cached) {
      const ttl = cached.country ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
      if (Date.now() - cached.fetchedAt.getTime() < ttl) return cached.country;
    }

    let country = null;
    try {
      const response = await axios.get(`https://ipapi.co/${ip}/json/`, {
        timeout: 3000,
        headers: { 'User-Agent': 'traduzAI-geoip/1.0' },
      });
      const code = response.data?.country_code;
      if (typeof code === 'string' && code.length === 2) country = code.toUpperCase();
    } catch (err) {
      console.error('[geoip] ipapi.co falhou para', ip, '-', err.message);
    }

    try {
      await prisma.ipGeoCache.upsert({
        where: { ip },
        update: { country, fetchedAt: new Date() },
        create: { ip, country },
      });
    } catch { /* cache best-effort — nao impede a resposta */ }

    return country;
  },
};

module.exports = { GeoIPService };
