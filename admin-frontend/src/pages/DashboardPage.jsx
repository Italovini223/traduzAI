import { useState, useEffect } from 'react';
import adminApi from '../services/adminApi';
import StatCard from '../components/StatCard';
import { Store, CreditCard, Clock, AlertTriangle, DollarSign, TrendingUp, Loader2 } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';

const fmt = (v) =>
  v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00';

const goalPct = (value, goal) =>
  goal > 0 ? Math.round((value / goal) * 100) : null;

export default function DashboardPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const res = await adminApi.get('/customers/dashboard');
      setData(res.data);
    } catch {
      setError('Erro ao carregar dashboard.');
    } finally {
      setLoading(false);
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
    return <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>;
  }

  const stats = data?.stats || {};
  const goals = data?.goals || {};
  const prev = data?.prevPeriod || {};
  const margin = data?.margin || {};
  const monthlyInstalls = data?.monthlyInstalls || [];
  const subscriptionDist = data?.subscriptionDistribution || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Visao geral do sistema</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          title="Total Lojas"
          value={stats.totalStores ?? 0}
          subtitle="Todas as lojas cadastradas"
          icon={Store}
          iconColor="text-blue-500"
          borderColor="border-blue-500"
          trend={prev.storesTrend}
          goalPct={goalPct(stats.totalStores, goals.goal_stores)}
          goalLabel={goals.goal_stores > 0 ? `Meta: ${goals.goal_stores}` : null}
        />
        <StatCard
          title="Assinaturas Ativas"
          value={stats.activeSubscriptions ?? 0}
          subtitle="Planos pagos ativos"
          icon={CreditCard}
          iconColor="text-emerald-500"
          borderColor="border-emerald-500"
          trend={prev.subsTrend}
          goalPct={goalPct(stats.activeSubscriptions, goals.goal_subs)}
          goalLabel={goals.goal_subs > 0 ? `Meta: ${goals.goal_subs}` : null}
        />
        <StatCard
          title="Em Trial"
          value={stats.trialStores ?? 0}
          subtitle="Periodo de teste"
          icon={Clock}
          iconColor="text-amber-500"
          borderColor="border-amber-500"
          goalPct={goalPct(stats.trialStores, goals.goal_trial)}
          goalLabel={goals.goal_trial > 0 ? `Meta: ${goals.goal_trial}` : null}
        />
        <StatCard
          title="Expiradas"
          value={stats.expiredStores ?? 0}
          subtitle="Assinaturas vencidas"
          icon={AlertTriangle}
          iconColor="text-red-500"
          borderColor="border-red-500"
        />
        <StatCard
          title="MRR"
          value={fmt(stats.mrr)}
          subtitle="Receita mensal recorrente"
          icon={DollarSign}
          iconColor="text-green-500"
          borderColor="border-green-500"
          trend={prev.mrrTrend}
          goalPct={goalPct(stats.mrr, goals.goal_mrr)}
          goalLabel={goals.goal_mrr > 0 ? `Meta: ${fmt(goals.goal_mrr)}` : null}
        />
        <StatCard
          title="Margem"
          value={fmt(margin.net)}
          subtitle={
            margin.pct != null
              ? `${margin.pct}% de margem`
              : margin.serverCost > 0
              ? 'Sem receita ainda'
              : 'Configure o custo'
          }
          icon={TrendingUp}
          iconColor={margin.net >= 0 ? 'text-violet-500' : 'text-red-500'}
          borderColor={margin.net >= 0 ? 'border-violet-500' : 'border-red-500'}
          trend={prev.mrrTrend}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Instalacoes Mensais</h3>
          {monthlyInstalls.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyInstalls}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="installs" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 4 }} name="Instalacoes" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-400">Sem dados disponiveis</div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Distribuicao de Assinaturas</h3>
          {subscriptionDist.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={subscriptionDist}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="plan" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="count" fill="#8b5cf6" name="Assinaturas" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-400">Sem dados disponiveis</div>
          )}
        </div>
      </div>
    </div>
  );
}
