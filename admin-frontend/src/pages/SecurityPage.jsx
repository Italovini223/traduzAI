import { useState, useEffect } from 'react';
import adminApi from '../services/adminApi';
import { Shield, Plus, X, Loader2, UserX, User } from 'lucide-react';

const roleColors = {
  super_admin: 'bg-red-100 text-red-700',
  admin: 'bg-blue-100 text-blue-700',
  support: 'bg-emerald-100 text-emerald-700',
  viewer: 'bg-gray-100 text-gray-600',
};

const roleLabels = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  support: 'Suporte',
  viewer: 'Visualizador',
};

const permissionMatrix = {
  super_admin: ['customers', 'plans', 'subscriptions', 'coupons', 'commissions', 'terms', 'faq', 'logs', 'security', 'settings'],
  admin: ['customers', 'plans', 'subscriptions', 'coupons', 'commissions', 'terms', 'faq', 'logs', 'settings'],
  support: ['customers', 'subscriptions', 'faq', 'logs'],
  viewer: ['customers', 'logs'],
};

const permLabels = {
  customers: 'Lojas',
  plans: 'Planos',
  subscriptions: 'Assinaturas',
  coupons: 'Cupons',
  commissions: 'Comissoes',
  terms: 'Termos',
  faq: 'FAQ',
  logs: 'Logs',
  security: 'Seguranca',
  settings: 'Config',
};

export default function SecurityPage() {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deactivating, setDeactivating] = useState('');

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await adminApi.get('/security/admins');
      setAdmins(res.data.data || []);
    } catch {
      setError('Erro ao carregar administradores.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (formData) => {
    try {
      await adminApi.post('/security/admins', formData);
      setShowForm(false);
      await fetchAdmins();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao criar admin.');
    }
  };

  const handleDeactivate = async (admin) => {
    if (!confirm(`Desativar ${admin.name || admin.email}?`)) return;
    const id = admin.id || admin._id;
    try {
      setDeactivating(id);
      await adminApi.post(`/security/admins/${id}/deactivate`);
      await fetchAdmins();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao desativar.');
    } finally {
      setDeactivating('');
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
          <h1 className="text-2xl font-bold text-gray-900">Seguranca</h1>
          <p className="text-gray-500 text-sm mt-1">Gerenciamento de administradores e permissoes</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus size={18} /> Novo Admin
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Admin List */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {admins.map((admin) => {
          const id = admin.id || admin._id;
          const isActive = admin.isActive !== false;
          return (
            <div
              key={id}
              className={`bg-white rounded-xl shadow-sm p-5 border-l-4 ${
                isActive ? 'border-indigo-500' : 'border-gray-300 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${isActive ? 'bg-indigo-50' : 'bg-gray-50'}`}>
                    <User size={18} className={isActive ? 'text-indigo-500' : 'text-gray-400'} />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{admin.name || '—'}</p>
                    <p className="text-sm text-gray-500">{admin.email}</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${roleColors[admin.role] || 'bg-gray-100 text-gray-600'}`}>
                  {roleLabels[admin.role] || admin.role}
                </span>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span className={`text-xs font-medium ${isActive ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {isActive ? 'Ativo' : 'Desativado'}
                </span>
                {isActive && (
                  <button
                    onClick={() => handleDeactivate(admin)}
                    disabled={deactivating === id}
                    className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    {deactivating === id ? <Loader2 size={12} className="animate-spin" /> : <UserX size={12} />}
                    Desativar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Permission Matrix */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Shield size={20} className="text-indigo-500" />
          Matriz de Permissoes
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Recurso</th>
                {Object.keys(roleLabels).map((role) => (
                  <th key={role} className="text-center px-3 py-2 font-semibold text-gray-600">
                    {roleLabels[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(permLabels).map(([perm, label]) => (
                <tr key={perm} className="border-b border-gray-100">
                  <td className="px-3 py-2 text-gray-700">{label}</td>
                  {Object.keys(roleLabels).map((role) => (
                    <td key={role} className="text-center px-3 py-2">
                      {permissionMatrix[role]?.includes(perm) ? (
                        <span className="inline-block w-5 h-5 bg-emerald-100 text-emerald-600 rounded-full leading-5 text-xs font-bold">&#10003;</span>
                      ) : (
                        <span className="inline-block w-5 h-5 bg-gray-100 text-gray-400 rounded-full leading-5 text-xs">&#10005;</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <AdminForm onSave={handleCreate} onClose={() => setShowForm(false)} />
      )}
    </div>
  );
}

function AdminForm({ onSave, onClose }) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'admin',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password.length < 8) {
      alert('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">Novo Administrador</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
              minLength={8}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Funcao</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="super_admin">Super Admin</option>
              <option value="admin">Admin</option>
              <option value="support">Suporte</option>
              <option value="viewer">Visualizador</option>
            </select>
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
              Criar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
