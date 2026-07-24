import { useState, useEffect, useCallback } from 'react';
import adminApi from '../services/adminApi';
import DataTable from '../components/DataTable';
import StatCard from '../components/StatCard';
import { DollarSign, CheckCircle, Clock, Loader2 } from 'lucide-react';

const statusColors = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
};

export default function CommissionsPage() {
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  const fetchCommissions = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError('');
      const res = await adminApi.get('/commissions', { params: { page, limit: 20 } });
      setRows(res.data.commissions || res.data.data || []);
      setMeta({
        page: res.data.page || res.data.meta?.page || 1,
        totalPages: res.data.totalPages || res.data.meta?.totalPages || 1,
        total: res.data.total || res.data.meta?.total || 0,
      });
      if (res.data.summary) setSummary(res.data.summary);
    } catch {
      setError('Erro ao carregar comissoes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCommissions(1);
  }, [fetchCommissions]);

  const handleAction = async (commission, action) => {
    const id = commission.id || commission._id;
    const label = action === 'approve' ? 'aprovar' : 'marcar como paga';
    if (!confirm(`Deseja ${label} esta comissao?`)) return;
    try {
      setActionLoading(id);
      await adminApi.post(`/commissions/${id}/${action}`);
      await fetchCommissions(meta.page);
    } catch (err) {
      alert(err.response?.data?.error || `Erro ao ${label} comissao.`);
    } finally {
      setActionLoading('');
    }
  };

  const formatCurrency = (v) =>
    v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00';

  const columns = [
    { key: 'partnerId', label: 'Parceiro', render: (v) => v || '—' },
    { key: 'storeId', label: 'Loja', render: (v) => v || '—' },
    {
      key: 'amount',
      label: 'Valor Venda',
      render: (v) => formatCurrency(v),
    },
    {
      key: 'commissionRate',
      label: 'Taxa',
      render: (v) => v != null ? `${v}%` : '—',
    },
    {
      key: 'commissionAmount',
      label: 'Comissao',
      render: (v) => <span className="font-semibold text-green-600">{formatCurrency(v)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      render: (v) => (
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[v] || 'bg-gray-100 text-gray-600'}`}>
          {v}
        </span>
      ),
    },
    {
      key: 'createdAt',
      label: 'Data',
      render: (v) => v ? new Date(v).toLocaleDateString('pt-BR') : '—',
    },
    {
      key: 'actions',
      label: '',
      render: (_, row) => {
        const id = row.id || row._id;
        const isLoading = actionLoading === id;
        return (
          <div className="flex items-center gap-2">
            {row.status === 'pending' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleAction(row, 'approve'); }}
                disabled={isLoading}
                className="px-3 py-1 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
              >
                {isLoading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                Aprovar
              </button>
            )}
            {row.status === 'approved' && (
              <button
                onClick={(e) => { e.stopPropagation(); handleAction(row, 'mark-paid'); }}
                disabled={isLoading}
                className="px-3 py-1 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
              >
                {isLoading ? <Loader2 size={12} className="animate-spin" /> : <DollarSign size={12} />}
                Pagar
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Comissoes</h1>
        <p className="text-gray-500 text-sm mt-1">Gerenciamento de comissoes de parceiros</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          title="Total Pendente"
          value={formatCurrency(summary.totalPending)}
          icon={Clock}
          iconColor="text-amber-500"
          borderColor="border-amber-500"
        />
        <StatCard
          title="Total Pago"
          value={formatCurrency(summary.totalPaid)}
          icon={DollarSign}
          iconColor="text-green-500"
          borderColor="border-green-500"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <DataTable
        columns={columns}
        rows={rows}
        meta={meta}
        onPageChange={(p) => fetchCommissions(p)}
        loading={loading}
        emptyText="Nenhuma comissao encontrada."
      />
    </div>
  );
}
