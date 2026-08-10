const axios = require('axios');
const geoipLite = require('geoip-lite');
const prisma = require('../lib/prisma');

// ─── Resolucao de pais por IP: ipapi.co (API, prioridade) + geoip-lite (local,
// reserva) ───────────────────────────────────────────────────────────────
// geoip-lite usa uma base MaxMind GeoLite2 gratuita empacotada no proprio
// pacote — instantanea (sem rede), mas nao atualiza sozinha e ja confirmado
// em teste real que ACERTA UM PAIS ERRADO com confianca pra faixas de IP
// realocadas (ex.: bloco da Scaleway com sub-alocacao em Amsterdam que a base
// local ainda marca como Paris) — nao da pra usar "geoip-lite so falha
// silenciosamente" como sinal de quando cair pro fallback, porque ele nao
// falha, ele erra. Por isso a API vai PRIMEIRO (mais precisa, confirmado
// contra o mesmo IP que o geoip-lite errou) e o geoip-lite so entra se a API
// falhar de verdade (rede fora do ar, timeout, rate limit).
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

    const cached = await prisma.ipGeoCache.findUnique({ where: { ip } });
    if (cached) {
      const ttl = cached.country ? POSITIVE_TTL_MS : NEGATIVE_TTL_MS;
      if (Date.now() - cached.fetchedAt.getTime() < ttl) return cached.country;
    }

    let country = null;
    try {
      // Timeout curto de proposito: se a API travar, cair pro geoip-lite
      // instantaneo rapido importa mais pra latencia percebida do visitante
      // do que esperar o maximo por uma resposta mais precisa que talvez nao
      // venha (a maioria das respostas reais chega bem abaixo disso).
      const response = await axios.get(`https://ipapi.co/${ip}/json/`, {
        timeout: 1200,
        headers: { 'User-Agent': 'traduzAI-geoip/1.0' },
      });
      const code = response.data?.country_code;
      if (typeof code === 'string' && code.length === 2) country = code.toUpperCase();
    } catch (err) {
      console.error('[geoip] ipapi.co falhou para', ip, '- usando geoip-lite como reserva:', err.message);
      const local = geoipLite.lookup(ip);
      if (local?.country) country = local.country;
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
