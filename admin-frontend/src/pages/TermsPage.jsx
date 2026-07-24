import { useState, useEffect } from 'react';
import adminApi from '../services/adminApi';
import { Plus, X, Loader2, FileText, CheckCircle, Clock, Pencil, Eye } from 'lucide-react';
import RichTextEditor from '../components/RichTextEditor';

export default function TermsPage() {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTerm, setEditingTerm] = useState(null);
  const [previewTerm, setPreviewTerm] = useState(null);
  const [publishLoading, setPublishLoading] = useState('');

  useEffect(() => {
    fetchTerms();
  }, []);

  const fetchTerms = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await adminApi.get('/terms');
      setVersions(res.data.data || []);
    } catch {
      setError('Erro ao carregar termos.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (formData) => {
    try {
      if (editingTerm) {
        await adminApi.put(`/terms/${editingTerm.id || editingTerm._id}`, formData);
      } else {
        await adminApi.post('/terms', formData);
      }
      setShowForm(false);
      setEditingTerm(null);
      await fetchTerms();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao salvar termos.');
    }
  };

  const handlePublish = async (term) => {
    if (!confirm(`Publicar versao ${term.version}? Isto tornara esta versao ativa.`)) return;
    const id = term.id || term._id;
    try {
      setPublishLoading(id);
      await adminApi.post(`/terms/${id}/publish`);
      await fetchTerms();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao publicar.');
    } finally {
      setPublishLoading('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Termos de Uso</h1>
          <p className="text-gray-500 text-sm mt-1">Gerenciamento de versoes dos termos</p>
        </div>
        <button
          onClick={() => { setEditingTerm(null); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus size={18} /> Nova Versao
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="space-y-4">
        {versions.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            Nenhuma versao de termos cadastrada.
          </div>
        ) : (
          versions.map((term) => {
            const id = term.id || term._id;
            return (
              <div
                key={id}
                className={`bg-white rounded-xl shadow-sm border-l-4 p-6 ${
                  term.isPublished ? 'border-emerald-500' : 'border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className={`p-2.5 rounded-lg ${term.isPublished ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                      <FileText size={20} className={term.isPublished ? 'text-emerald-500' : 'text-gray-400'} />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">{term.title || `Versao ${term.version}`}</h3>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-mono">
                          v{term.version}
                        </span>
                        {term.isPublished && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                            <CheckCircle size={12} /> Ativa
                          </span>
                        )}
                      </div>
                      {term.publishedAt && (
                        <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                          <Clock size={14} />
                          Publicado em {new Date(term.publishedAt).toLocaleDateString('pt-BR')}
                        </p>
                      )}
                      {term.content && (
                        <p className="text-sm text-gray-600 mt-2 line-clamp-2">{term.content.substring(0, 200)}...</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewTerm(term)}
                      title="Visualizar"
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      onClick={() => { setEditingTerm(term); setShowForm(true); }}
                      title="Editar"
                      className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                    >
                      <Pencil size={16} />
                    </button>
                    {!term.isPublished && (
                      <button
                        onClick={() => handlePublish(term)}
                        disabled={publishLoading === id}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        {publishLoading === id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        Publicar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {showForm && (
        <TermForm
          term={editingTerm}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingTerm(null); }}
        />
      )}

      {previewTerm && (
        <TermPreview term={previewTerm} onClose={() => setPreviewTerm(null)} />
      )}
    </div>
  );
}

function TermPreview({ term, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{term.title || `Versao ${term.version}`}</h2>
            <span className="text-xs text-gray-500 font-mono">v{term.version}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={20} /></button>
        </div>
        <div className="p-6 overflow-y-auto terms-preview">
          <div dangerouslySetInnerHTML={{ __html: term.content || '<p>(sem conteudo)</p>' }} />
        </div>
        <style>{`
          .terms-preview p { margin: 0 0 0.75em; line-height: 1.6; color: #374151; }
          .terms-preview h2 { font-size: 1.25rem; font-weight: 700; margin: 1em 0 0.4em; color: #111827; }
          .terms-preview h3 { font-size: 1.1rem; font-weight: 600; margin: 0.8em 0 0.3em; color: #111827; }
          .terms-preview ul { list-style: disc; padding-left: 1.5em; margin: 0 0 0.75em; }
          .terms-preview ol { list-style: decimal; padding-left: 1.5em; margin: 0 0 0.75em; }
          .terms-preview a { color: #2563eb; text-decoration: underline; }
        `}</style>
      </div>
    </div>
  );
}

function TermForm({ term, onSave, onClose }) {
  const [form, setForm] = useState({
    version: term?.version || '',
    title: term?.title || '',
    content: term?.content || '',
  });
  const [saving, setSaving] = useState(false);
  const [contentError, setContentError] = useState('');

  const isContentEmpty = (html) => !html || html.replace(/<[^>]*>/g, '').trim() === '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isContentEmpty(form.content)) {
      setContentError('Preencha o conteudo dos termos.');
      return;
    }
    setContentError('');
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">{term ? 'Editar Termos' : 'Nova Versao'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Versao</label>
              <input
                value={form.version}
                onChange={(e) => setForm({ ...form, version: e.target.value })}
                placeholder="1.0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titulo</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Termos de Uso v1.0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Conteudo</label>
            <RichTextEditor
              value={form.content}
              onChange={(html) => { setForm({ ...form, content: html }); if (contentError) setContentError(''); }}
            />
            {contentError && <p className="text-red-600 text-xs mt-1">{contentError}</p>}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Salvar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
