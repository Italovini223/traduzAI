import { useState, useEffect, useCallback } from 'react';
import adminApi from '../services/adminApi';
import DataTable from '../components/DataTable';
import { Activity, AlertCircle, BarChart3, ShieldAlert } from 'lucide-react';

const TABS = [
  { key: 'activity', label: 'Atividade', icon: Activity, color: 'text-blue-500' },
  { key: 'errors', label: 'Erros', icon: AlertCircle, color: 'text-red-500' },
  { key: 'usage', label: 'Uso', icon: BarChart3, color: 'text-emerald-500' },
  { key: 'abuse', label: 'Abuso', icon: ShieldAlert, color: 'text-amber-500' },
];

const severityColors = {
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  critical: 'bg-rose-100 text-rose-800',
  low: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
};

const tabColumns = {
  activity: [
    {
      key: 'timestamp',
      label: 'Data/Hora',
      render: (v) => v ? new Date(v).toLocaleString('pt-BR') : '—',
    },
    { key: 'action', label: 'Acao' },
    { key: 'adminEmail', label: 'Admin', render: (v) => v || '—' },
    { key: 'targetType', label: 'Tipo Alvo', render: (v) => v || '—' },
    { key: 'targetId', label: 'ID Alvo', render: (v) => v ? <span className="font-mono text-xs">{v}</span> : '—' },
    { key: 'ip', label: 'IP', render: (v) => v ? <span className="font-mono text-xs">{v}</span> : '—' },
    {
      key: 'severity',
      label: 'Nivel',
      render: (v) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityColors[v] || 'bg-gray-100 text-gray-600'}`}>
          {v || 'info'}
        </span>
      ),
    },
  ],
  errors: [
    {
      key: 'timestamp',
      label: 'Data/Hora',
      render: (v) => v ? new Date(v).toLocaleString('pt-BR') : '—',
    },
    {
      key: 'severity',
      label: 'Severidade',
      render: (v) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityColors[v] || 'bg-red-100 text-red-700'}`}>
          {v || 'error'}
        </span>
      ),
    },
    { key: 'message', label: 'Mensagem', render: (v) => <span className="text-sm max-w-xs truncate block">{v || '—'}</span> },
    { key: 'source', label: 'Origem', render: (v) => v || '—' },
    { key: 'storeId', label: 'Loja', render: (v) => v || '—' },
    { key: 'stack', label: 'Stack', render: (v) => v ? <span className="font-mono text-xs text-gray-500 max-w-xs truncate block">{v.substring(0, 60)}...</span> : '—' },
  ],
  usage: [
    {
      key: 'timestamp',
      label: 'Data/Hora',
      render: (v) => v ? new Date(v).toLocaleString('pt-BR') : '—',
    },
    { key: 'storeId', label: 'Loja', render: (v) => v || '—' },
    { key: 'endpoint', label: 'Endpoint', render: (v) => v ? <span className="font-mono text-xs">{v}</span> : '—' },
    { key: 'method', label: 'Metodo', render: (v) => v ? <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">{v}</span> : '—' },
    { key: 'responseTime', label: 'Tempo (ms)', render: (v) => v != null ? `${v}ms` : '—' },
    { key: 'statusCode', label: 'Status', render: (v) => {
      if (!v) return '—';
      const color = v >= 500 ? 'text-red-600' : v >= 400 ? 'text-amber-600' : 'text-emerald-600';
      return <span className={`font-mono text-xs font-bold ${color}`}>{v}</span>;
    }},
    { key: 'requestCount', label: 'Requisicoes', render: (v) => v ?? '—' },
  ],
  abuse: [
    {
      key: 'timestamp',
      label: 'Data/Hora',
      render: (v) => v ? new Date(v).toLocaleString('pt-BR') : '—',
    },
    {
      key: 'severity',
      label: 'Nivel',
      render: (v) => (
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityColors[v] || 'bg-amber-100 text-amber-700'}`}>
          {v || 'medium'}
        </span>
      ),
    },
    { key: 'type', label: 'Tipo', render: (v) => v || '—' },
    { key: 'storeId', label: 'Loja', render: (v) => v || '—' },
    { key: 'ip', label: 'IP', render: (v) => v ? <span className="font-mono text-xs">{v}</span> : '—' },
    { key: 'description', label: 'Descricao', render: (v) => <span className="text-sm max-w-xs truncate block">{v || '—'}</span> },
    { key: 'blocked', label: 'Bloqueado', render: (v) => v ? <span className="text-red-600 font-medium text-xs">Sim</span> : <span className="text-gray-400 text-xs">Nao</span> },
  ],
};

export default function LogsPage() {
  const [tab, setTab] = useState('activity');
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async (page = 1) => {
    try {
      setLoading(true);
      setError('');
      const res = await adminApi.get(`/logs/${tab}`, { params: { page, limit: 25 } });
      setRows(res.data.logs || res.data.data || []);
      setMeta({
        page: res.data.page || res.data.meta?.page || 1,
        totalPages: res.data.totalPages || res.data.meta?.totalPages || 1,
        total: res.data.total || res.data.meta?.total || 0,
      });
    } catch {
      setError(`Erro ao carregar logs de ${tab}.`);
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Logs</h1>
        <p className="text-gray-500 text-sm mt-1">Monitoramento e auditoria do sistema</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                tab === t.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={16} className={tab === t.key ? 'text-white' : 'text-gray-400'} />
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <DataTable
        columns={tabColumns[tab] || []}
        rows={rows}
        meta={meta}
        onPageChange={(p) => fetchLogs(p)}
        loading={loading}
        emptyText="Nenhum log encontrado."
      />
    </div>
  );
}
