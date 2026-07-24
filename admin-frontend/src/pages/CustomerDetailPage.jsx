import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import adminApi from '../services/adminApi';
import { ArrowLeft, Store, CreditCard, Calendar, Mail, Globe, User, Clock, Loader2, Trash2, AlertTriangle, X } from 'lucide-react';

const CONFIRM_WORD = 'DELETAR';

const statusColors = {
  active: 'bg-emerald-100 text-emerald-700',
  trialing: 'bg-amber-100 text-amber-700',
  trial: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
  canceled: 'bg-gray-100 text-gray-600',
  past_due: 'bg-red-100 text-red-700',
  no_plan: 'bg-slate-100 text-slate-600',
  uninstalled: 'bg-red-100 text-red-700',
};

const statusLabel = {
  active: 'Ativo',
  trialing: 'Trial',
  trial: 'Trial',
  expired: 'Expirado',
  canceled: 'Cancelado',
  past_due: 'Inadimplente',
  no_plan: 'Sem Plano',
  uninstalled: 'Desinstalado',
};

function computeStatus(customer) {
  if (customer?.uninstalledAt) return 'uninstalled';
  const sub = customer?.subscription;
  if (sub) {
    if (sub.status === 'trialing') return 'trial';
    if (sub.status === 'active') return 'active';
    if (sub.status === 'past_due') return 'past_due';
    if (sub.status === 'canceled') return 'canceled';
    return sub.status;
  }
  const now = new Date();
  if (customer?.trialEndsAt && new Date(customer.trialEndsAt) > now) return 'trial';
  if (customer?.trialEndsAt && new Date(customer.trialEndsAt) <= now) return 'expired';
  return 'no_plan';
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    fetchCustomer();
  }, [id]);

  const fetchCustomer = async () => {
    try {
      setLoading(true);
      const res = await adminApi.get(`/customers/${id}`);
      setCustomer(res.data.store || res.data.customer || res.data);
    } catch (err) {
      setError('Erro ao carregar detalhes do cliente.');
    } finally {
      setLoading(false);
    }
  };

  const handleExtendTrial = async () => {
    if (!confirm('Estender trial por mais 7 dias?')) return;
    try {
      setActionLoading('extend');
      await adminApi.post(`/customers/${id}/extend-trial`, { days: 7 });
      await fetchCustomer();
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao estender trial.');
    } finally {
      setActionLoading('');
    }
  };

  const handleImpersonate = async () => {
    if (!confirm('Acessar como proprietario desta loja?')) return;
    try {
      setActionLoading('impersonate');
      const res = await adminApi.post(`/customers/${id}/impersonate`);
      const url = res.data.url || res.data.redirectUrl;
      if (url) {
        window.open(url, '_blank');
      } else {
        alert('URL de impersonacao nao disponivel.');
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao impersonar.');
    } finally {
      setActionLoading('');
    }
  };

  const handleDelete = async () => {
    try {
      setActionLoading('delete');
      await adminApi.delete(`/customers/${id}`);
      navigate('/customers');
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao remover a loja.');
      setActionLoading('');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/customers')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <ArrowLeft size={18} /> Voltar
        </button>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>
      </div>
    );
  }

  if (!customer) return null;

  const sub = customer.subscription || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/customers')}
            className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{customer.name || customer.storeName || 'Loja'}</h1>
            <p className="text-gray-500 text-sm mt-0.5">{customer.email}</p>
          </div>
        </div>
        {(() => {
          const st = computeStatus(customer);
          return (
            <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${statusColors[st] || 'bg-gray-100 text-gray-600'}`}>
              {statusLabel[st] || st}
            </span>
          );
        })()}
      </div>

      {/* Alerta de app desinstalado */}
      {customer.uninstalledAt && (() => {
        const days = Math.floor((Date.now() - new Date(customer.uninstalledAt).getTime()) / 86400000);
        const over30 = days >= 30;
        return (
          <div className={`rounded-xl border p-4 flex items-start gap-3 ${over30 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
            <AlertTriangle size={20} className={`mt-0.5 ${over30 ? 'text-red-600' : 'text-amber-600'}`} />
            <div className="text-sm">
              <p className={`font-semibold ${over30 ? 'text-red-800' : 'text-amber-800'}`}>
                App desinstalado em {new Date(customer.uninstalledAt).toLocaleDateString('pt-BR')} (ha {days} {days === 1 ? 'dia' : 'dias'})
              </p>
              <p className={over30 ? 'text-red-700' : 'text-amber-700'}>
                {over30
                  ? 'Desinstalado ha mais de 30 dias. Considere remover a loja e limpar os dados na Zona de perigo abaixo.'
                  : 'A loja desinstalou o app. Se reinstalar, este aviso some automaticamente.'}
              </p>
            </div>
          </div>
        );
      })()}

      {/* Store Info */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Informacoes da Loja</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow icon={Store} label="Nome" value={customer.name || customer.storeName} />
          <InfoRow icon={Mail} label="Email" value={customer.email} />
          <InfoRow icon={Globe} label="Dominio" value={customer.domain || customer.storeUrl} />
          <InfoRow icon={User} label="Nuvemshop ID" value={customer.nuvemshopId || customer.storeId} />
          <InfoRow icon={Calendar} label="Cadastro" value={customer.createdAt ? new Date(customer.createdAt).toLocaleDateString('pt-BR') : '—'} />
          <InfoRow icon={Clock} label="Ultimo acesso" value={customer.lastLogin ? new Date(customer.lastLogin).toLocaleString('pt-BR') : '—'} />
        </div>
      </div>

      {/* Subscription Info */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Assinatura</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow icon={CreditCard} label="Plano" value={sub.planKey || customer.planKey || '—'} />
          <InfoRow icon={Calendar} label="Intervalo" value={sub.billingInterval || '—'} />
          <InfoRow icon={Clock} label="Inicio" value={sub.currentPeriodStart ? new Date(sub.currentPeriodStart).toLocaleDateString('pt-BR') : '—'} />
          <InfoRow icon={Clock} label="Fim do periodo" value={sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString('pt-BR') : '—'} />
          <InfoRow icon={CreditCard} label="Stripe Sub ID" value={sub.stripeSubscriptionId || '—'} />
          <InfoRow icon={Calendar} label="Trial ate" value={sub.trialEnd ? new Date(sub.trialEnd).toLocaleDateString('pt-BR') : '—'} />
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Acoes</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExtendTrial}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 transition-colors text-sm font-medium flex items-center gap-2"
          >
            {actionLoading === 'extend' && <Loader2 size={16} className="animate-spin" />}
            Estender Trial (+7 dias)
          </button>
          <button
            onClick={handleImpersonate}
            disabled={!!actionLoading}
            className="px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors text-sm font-medium flex items-center gap-2"
          >
            {actionLoading === 'impersonate' && <Loader2 size={16} className="animate-spin" />}
            Acessar como Proprietario
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-red-200">
        <h3 className="text-lg font-semibold text-red-700 mb-1 flex items-center gap-2">
          <AlertTriangle size={18} /> Zona de perigo
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Remove permanentemente a loja e todos os dados relacionados (assinatura, faturas, perfil e conteudos do app). Esta acao e irreversivel.
        </p>
        <button
          onClick={() => setShowDelete(true)}
          disabled={!!actionLoading}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm font-medium flex items-center gap-2"
        >
          <Trash2 size={16} /> Remover loja (apagar dados)
        </button>
      </div>

      {showDelete && (
        <DeleteStoreModal
          storeName={customer.name || customer.storeName || `Loja #${id}`}
          loading={actionLoading === 'delete'}
          onConfirm={handleDelete}
          onClose={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}

function DeleteStoreModal({ storeName, loading, onConfirm, onClose }) {
  const [text, setText] = useState('');
  const armed = text.trim() === CONFIRM_WORD;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-bold text-red-700 flex items-center gap-2">
            <AlertTriangle size={20} /> Remover loja
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={20} /></button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700">
            Voce esta prestes a apagar <span className="font-semibold">{storeName}</span> e{' '}
            <span className="font-semibold">todos os dados relacionados</span> no banco. Esta acao{' '}
            <span className="font-semibold text-red-700">nao pode ser desfeita</span>.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Digite <span className="font-mono font-bold">{CONFIRM_WORD}</span> para confirmar
            </label>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              autoFocus
              placeholder={CONFIRM_WORD}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-red-400 focus:ring-1 focus:ring-red-400 outline-none"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={onConfirm}
              disabled={!armed || loading}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              <Trash2 size={16} /> Apagar dados do tenant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Icon size={16} className="text-gray-400 flex-shrink-0" />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value || '—'}</p>
      </div>
    </div>
  );
}
