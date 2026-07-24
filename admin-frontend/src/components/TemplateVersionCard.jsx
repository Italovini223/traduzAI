import { useState } from 'react';
import { GitBranch, CheckCircle, AlertTriangle, RefreshCw, ExternalLink, Loader2 } from 'lucide-react';
import { useTemplateVersion } from '../hooks/useTemplateVersion';

/**
 * TemplateVersionCard — exibido na SettingsPage.
 * Mostra versão instalada vs. mais recente (GitHub Releases) com links para changelog.
 */
export default function TemplateVersionCard() {
  const { current, latest, repo, loading, outdated } = useTemplateVersion();
  const [checking, setChecking] = useState(false);

  const changelogUrl = repo ? `https://github.com/${repo}/blob/main/CHANGELOG.md` : null;
  const releasesUrl  = repo ? `https://github.com/${repo}/releases` : null;

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <GitBranch size={18} className="text-violet-500" />
        Template NuvemPro
      </h3>

      {loading ? (
        <div className="flex items-center gap-3 text-gray-400 text-sm py-2">
          <Loader2 size={16} className="animate-spin" />
          Verificando versão...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">Versão instalada</p>
              <p className="text-xs text-gray-400 font-mono mt-0.5">{repo || '—'}</p>
            </div>
            <span className="font-mono text-sm font-semibold text-gray-800 bg-gray-100 px-3 py-1 rounded-full">
              v{current || '—'}
            </span>
          </div>

          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <div>
              <p className="text-sm font-medium text-gray-700">Versão mais recente</p>
              <p className="text-xs text-gray-400 mt-0.5">Via GitHub Releases</p>
            </div>
            {latest ? (
              <span className="font-mono text-sm font-semibold text-gray-800 bg-gray-100 px-3 py-1 rounded-full">
                v{latest}
              </span>
            ) : (
              <span className="text-xs text-gray-400">Não disponível</span>
            )}
          </div>

          <div className="flex items-center justify-between">
            {outdated ? (
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" />
                <span className="text-sm font-medium text-amber-700">
                  Atualização disponível: v{latest}
                </span>
              </div>
            ) : latest ? (
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-500" />
                <span className="text-sm font-medium text-emerald-700">Template atualizado</span>
              </div>
            ) : (
              <span className="text-sm text-gray-400">Status desconhecido</span>
            )}

            <button
              onClick={() => { /* cache já está preenchido, só recarrega a página */ window.location.reload(); }}
              disabled={checking}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              title="Verificar novamente"
            >
              <RefreshCw size={13} className={checking ? 'animate-spin' : ''} />
              Verificar
            </button>
          </div>

          {(changelogUrl || releasesUrl) && (
            <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
              {changelogUrl && (
                <a href={changelogUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-violet-600 hover:text-violet-800 transition-colors">
                  <ExternalLink size={12} /> Ver CHANGELOG
                </a>
              )}
              {releasesUrl && (
                <a href={releasesUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 transition-colors">
                  <ExternalLink size={12} /> Releases no GitHub
                </a>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
