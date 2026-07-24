import { useState, useEffect, useCallback } from 'react';
import adminApi from '../services/adminApi';
import DataTable from '../components/DataTable';
import StatCard from '../components/StatCard';
import { DollarSign, TrendingUp, CreditCard, XCircle, Loader2, MoreVertical } from 'lucide-react';

const statusColors = {
  active: 'bg-emerald-100 text-emerald-700',
  trialing: 'bg-amber-100 text-amber-700',
  trial: 'bg-amber-100 text-amber-700',
  past_due: 'bg-orange-100 text-orange-700',
  canceled: 'bg-red-100 text-red-700',
  unpaid: 'bg-rose-100 text-rose-700',
};

export default function SubscriptionsPage() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMenu, setActionMenu] = useState(null);
  const [actionLoading, setActionLoading] = useState('');

  const fetchSubscriptions = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError('');
      const res = await adminApi.get('/subscriptions', { params: { page, limit: 20 } });
      setRows(res.data.subscriptions || res.data.data || []);
      setMeta({
        page: res.data.page || res.data.meta?.page || 1,
        totalPages: res.data.totalPages || res.data.meta?.totalPages || 1,
        total: res.data.total || res.data.meta?.total || 0,
      });
      if (res.data.metrics) setMetrics(res.data.metrics);
    } catch (err) {
      setError('Erro ao carregar assinaturas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptions(1);
  }, [fetchSubscriptions]);

  const handleExtendTrial = async (sub) => {
    if (!confirm(`Estender trial para ${sub.storeName || sub.storeId}?`)) return;
    try {
      setActionLoading(sub.storeId || sub.id);
      await adminApi.post(`/subscriptions/${sub.storeId}/extend-trial`, { days: 7 });
      await fetchSubscriptions(meta.page);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao estender trial.');
    } finally {
      setActionLoading('');
      setActionMenu(null);
    }
  };

  const handleCancel = async (sub) => {
    if (!confirm(`Cancelar assinatura de ${sub.storeName || sub.storeId}?`)) return;
    try {
      setActionLoading(sub.storeId || sub.id);
      await adminApi.post(`/subscriptions/${sub.storeId}/cancel`);
      await fetchSubscriptions(meta.page);
    } catch (err) {
      alert(err.response?.data?.error || 'Erro ao cancelar.');
    } finally {
      setActionLoading('');
      setActionMenu(null);
    }
  };

  const formatCurrency = (v) =>
    v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00';

  const columns = [
    { key: 'storeName', label: 'Loja', render: (v, row) => v || row.storeId || '—' },
    {
      key: 'planKey',
      label: 'Plano',
      render: (v) => <span className="px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full text-xs font-medium">{v || '—'}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (v) => <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[v] || 'bg-gray-100 text-gray-600'}`}>{v}</span>,
    },
    { key: 'billingInterval', label: 'Intervalo', render: (v) => v || '—' },
    {
      key: 'currentPeriodEnd',
      label: 'Fim Periodo',
      render: (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '—',
    },
    {
      key: 'stripeSubscriptionId',
      label: 'Stripe ID',
      render: (v) => v ? <span className="text-xs font-mono text-gray-500">{v.slice(0, 20)}...</span> : '—',
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => {
        const key = row.storeId || row.id;
        return (
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setActionMenu(actionMenu === key ? null : key); }}
              className="p-1.5 rounded-lg hover:bg-gray-100"
            >
              {actionLoading === key ? <Loader2 size={16} className="animate-spin" /> : <MoreVertical size={16} />}
            </button>
            {actionMenu === key && (
              <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1 w-44">
                <button
                  onClick={() => handleExtendTrial(row)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-amber-600"
                >
                  Estender Trial
                </button>
                <button
                  onClick={() => handleCancel(row)}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-red-600"
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Assinaturas</h1>
        <p className="text-gray-500 text-sm mt-1">Gerenciamento de assinaturas</p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="MRR" value={formatCurrency(metrics.mrr)} icon={DollarSign} iconColor="text-green-500" borderColor="border-green-500" />
        <StatCard title="ARR" value={formatCurrency(metrics.arr)} icon={TrendingUp} iconColor="text-blue-500" borderColor="border-blue-500" />
        <StatCard title="Ativas" value={metrics.active ?? 0} icon={CreditCard} iconColor="text-emerald-500" borderColor="border-emerald-500" />
        <StatCard title="Canceladas" value={metrics.canceled ?? 0} icon={XCircle} iconColor="text-red-500" borderColor="border-red-500" />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        meta={meta}
        onPageChange={(p) => fetchSubscriptions(p)}
        loading={loading}
        emptyText="Nenhuma assinatura encontrada."
      />
    </div>
  );
}
