import { useState, useEffect } from 'react';
import adminApi from '../services/adminApi';

let _cache = null; // singleton — busca apenas uma vez por sessão

/**
 * Busca a versão do template via backend (/admin-api/template/version).
 * A comparação com o GitHub Releases é feita no servidor (autenticada com
 * GITHUB_TOKEN), então funciona mesmo com o repositório privado.
 *
 * Retorna: { current, latest, repo, loading, outdated, releaseUrl }
 */
export function useTemplateVersion() {
  const [state, setState] = useState(
    _cache || { current: null, latest: null, repo: null, loading: true, outdated: false, releaseUrl: null }
  );

  useEffect(() => {
    if (_cache) return;

    async function load() {
      try {
        const res = await adminApi.get('/template/version');
        const d = res.data || {};
        _cache = {
          current: d.current || null,
          latest: d.latest || null,
          repo: d.repo || null,
          outdated: !!d.outdated,
          releaseUrl: d.releaseUrl || null,
          loading: false,
        };
        setState(_cache);
      } catch {
        const result = { current: null, latest: null, repo: null, loading: false, outdated: false, releaseUrl: null };
        _cache = result;
        setState(result);
      }
    }

    load();
  }, []);

  return state;
}
