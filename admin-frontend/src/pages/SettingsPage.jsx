import { useState, useEffect } from 'react';
import adminApi from '../services/adminApi';
import { Save, Loader2, Lock, Eye, EyeOff, Clock, Tag, Target } from 'lucide-react';
import TemplateVersionCard from '../components/TemplateVersionCard';

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);

  // Trial config
  const [trialConfig, setTrialConfig] = useState({ trial_mode: 'none', trial_days: '7', trial_coupon: '' });
  const [trialSaving, setTrialSaving] = useState(false);
  const [trialSuccess, setTrialSuccess] = useState('');
  const [trialError, setTrialError] = useState('');

  // Goals config
  const [goals, setGoals] = useState({ goal_stores: '', goal_subs: '', goal_trial: '', goal_mrr: '', server_cost: '' });
  const [goalsSaving, setGoalsSaving] = useState(false);
  const [goalsSuccess, setGoalsSuccess] = useState('');
  const [goalsError, setGoalsError] = useState('');

  // Change password
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [showPw, setShowPw] = useState({ current: false, new: false, confirm: false });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  useEffect(() => {
    fetchSettings();
    fetchTrialConfig();
    fetchGoals();
  }, []);

  const fetchTrialConfig = async () => {
    try {
      const res = await adminApi.get('/config');
      const raw = res.data?.raw || [];
      const map = {};
      for (const c of raw) map[c.key] = c.value;
      setTrialConfig({
        trial_mode: map['trial_mode'] || 'none',
        trial_days: map['trial_days'] || '7',
        trial_coupon: map['trial_coupon'] || '',
      });
    } catch {
      // silencioso — usa defaults
    }
  };

  const handleSaveTrialConfig = async () => {
    setTrialSaving(true);
    setTrialError('');
    setTrialSuccess('');
    try {
      await adminApi.put('/config', {
        updates: [
          { key: 'trial_mode', value: trialConfig.trial_mode, group: 'trial', label: 'Modo de Trial' },
          { key: 'trial_days', value: String(trialConfig.trial_days), group: 'trial', label: 'Duração do Trial (dias)' },
        ],
      });
      setTrialSuccess('Configurações de trial salvas com sucesso.');
      setTimeout(() => setTrialSuccess(''), 3000);
    } catch (err) {
      setTrialError(err.response?.data?.error || 'Erro ao salvar configurações de trial.');
    } finally {
      setTrialSaving(false);
    }
  };

  const fetchGoals = async () => {
    try {
      const res = await adminApi.get('/config');
      const raw = res.data?.raw || [];
      const map = {};
      for (const c of raw) map[c.key] = c.value;
      setGoals({
        goal_stores: map['goal_stores'] || '',
        goal_subs: map['goal_subs'] || '',
        goal_trial: map['goal_trial'] || '',
        goal_mrr: map['goal_mrr'] || '',
        server_cost: map['server_cost'] || '',
      });
    } catch {
      // silencioso
    }
  };

  const handleSaveGoals = async () => {
    setGoalsSaving(true);
    setGoalsError('');
    setGoalsSuccess('');
    try {
      await adminApi.put('/config', {
        updates: [
          { key: 'goal_stores', value: String(goals.goal_stores), group: 'goals', label: 'Meta de Lojas (total)' },
          { key: 'goal_subs', value: String(goals.goal_subs), group: 'goals', label: 'Meta de Assinaturas Ativas' },
          { key: 'goal_trial', value: String(goals.goal_trial), group: 'goals', label: 'Meta de Em Trial' },
          { key: 'goal_mrr', value: String(goals.goal_mrr), group: 'goals', label: 'Meta de MRR (R$)' },
          { key: 'server_cost', value: String(goals.server_cost), group: 'goals', label: 'Custo de Servidor Mensal (R$)' },
        ],
      });
      setGoalsSuccess('Metas salvas com sucesso.');
      setTimeout(() => setGoalsSuccess(''), 3000);
    } catch (err) {
      setGoalsError(err.response?.data?.error || 'Erro ao salvar metas.');
    } finally {
      setGoalsSaving(false);
    }
  };

  const fetchSettings = async () => {
    // Endpoint /settings não existe — configs são gerenciadas pelas seções dedicadas abaixo
    setLoading(false);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    setPwSuccess('');

    if (pwForm.newPassword.length < 8) {
      setPwError('A nova senha deve ter pelo menos 8 caracteres.');
      return;
    }
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('As senhas nao coincidem.');
      return;
    }

    try {
      setPwLoading(true);
      await adminApi.post('/auth/change-password', {
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      setPwSuccess('Senha alterada com sucesso.');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPwError(err.response?.data?.error || 'Erro ao alterar senha.');
    } finally {
      setPwLoading(false);
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
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuracoes</h1>
        <p className="text-gray-500 text-sm mt-1">Configuracoes do sistema</p>
      </div>

      {/* ─── Metas do Dashboard ─── */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Target size={18} className="text-emerald-500" />
          Metas do Dashboard
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          Defina as metas mensais para os indicadores do dashboard e o custo de servidor para calcular a margem.
        </p>

        {goalsError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-4">{goalsError}</div>
        )}
        {goalsSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg text-sm mb-4">{goalsSuccess}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {[
            { key: 'goal_stores', label: 'Meta de Lojas (total)', placeholder: 'ex: 100', prefix: '' },
            { key: 'goal_subs', label: 'Meta de Assinaturas Ativas', placeholder: 'ex: 50', prefix: '' },
            { key: 'goal_trial', label: 'Meta de Em Trial', placeholder: 'ex: 20', prefix: '' },
            { key: 'goal_mrr', label: 'Meta de MRR', placeholder: 'ex: 5000', prefix: 'R$' },
            { key: 'server_cost', label: 'Custo de Servidor / mês', placeholder: 'ex: 200', prefix: 'R$' },
          ].map(({ key, label, placeholder, prefix }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <div className="relative">
                {prefix && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{prefix}</span>
                )}
                <input
                  type="number"
                  min="0"
                  value={goals[key]}
                  onChange={(e) => setGoals((p) => ({ ...p, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className={`w-full border border-gray-300 rounded-lg text-sm py-2 pr-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none ${prefix ? 'pl-8' : 'pl-3'}`}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-5 text-xs text-amber-700">
          <strong>Como funciona:</strong> O dashboard exibe uma barra de progresso em cada indicador mostrando o % atingido da meta. O <strong>Custo de Servidor</strong> é descontado do MRR para calcular a <strong>Margem</strong> exibida no último card.
        </div>

        <button
          onClick={handleSaveGoals}
          disabled={goalsSaving}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors text-sm font-medium"
        >
          {goalsSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Salvar Metas
        </button>
      </div>

      {/* ─── Trial Period Config ─── */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Clock size={18} className="text-violet-500" />
          Período de Trial
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          Defina como novos clientes experimentam o app antes de pagar.
        </p>

        {trialError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-4">{trialError}</div>
        )}
        {trialSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg text-sm mb-4">{trialSuccess}</div>
        )}

        <div className="space-y-5">
          {/* Modo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Modo de Trial</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  value: 'none',
                  title: 'Desativado',
                  desc: 'Usuário deve assinar imediatamente para acessar o app.',
                  color: 'border-gray-200 hover:border-gray-400',
                  active: 'border-gray-700 bg-gray-50',
                  icon: null,
                },
                {
                  value: 'free',
                  title: 'Trial gratuito',
                  desc: 'X dias grátis sem cartão. Aviso de contagem regressiva no app.',
                  color: 'border-blue-200 hover:border-blue-400',
                  active: 'border-blue-600 bg-blue-50',
                  icon: <Clock size={14} className="text-blue-500" />,
                },
                {
                  value: 'paid',
                  title: 'Trial com assinatura',
                  desc: 'Usuário cadastra cartão mas só é cobrado após X dias. Status "trialing" no Stripe.',
                  color: 'border-violet-200 hover:border-violet-400',
                  active: 'border-violet-600 bg-violet-50',
                  icon: <Tag size={14} className="text-violet-500" />,
                },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTrialConfig((p) => ({ ...p, trial_mode: opt.value }))}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${
                    trialConfig.trial_mode === opt.value ? opt.active : `border-gray-200 ${opt.color}`
                  }`}
                >
                  <div className="flex items-center gap-2 font-semibold text-sm text-gray-800 mb-1">
                    {opt.icon}
                    {opt.title}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Dias — visível para free e paid */}
          {trialConfig.trial_mode !== 'none' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Duração do Trial (dias)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={trialConfig.trial_days}
                onChange={(e) => setTrialConfig((p) => ({ ...p, trial_days: e.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-32 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                {trialConfig.trial_mode === 'free'
                  ? 'Novos clientes terão acesso gratuito por este período sem precisar de cartão.'
                  : 'O cliente cadastra o cartão e fica em status "trialing" no Stripe por este período antes da primeira cobrança. Pode cancelar antes.'}
              </p>
            </div>
          )}

          {/* Info modo paid */}
          {trialConfig.trial_mode === 'paid' && (
            <div className="flex gap-2 bg-violet-50 border border-violet-200 rounded-lg p-3">
              <Tag size={16} className="text-violet-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-violet-700 space-y-1">
                <p>
                  Os planos exibirão a badge <strong>"Assine e ganhe {trialConfig.trial_days} dias grátis"</strong>.
                  O trial é aplicado via <code className="bg-violet-100 px-1 rounded">trial_period_days</code> nativo do Stripe — sem necessidade de cupom.
                </p>
                <p>
                  O campo "Permitir cupons" no checkout continua ativo, então o cliente ainda pode inserir um cupom de desconto manualmente.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSaveTrialConfig}
            disabled={trialSaving}
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            {trialSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Salvar Configuração de Trial
          </button>
        </div>
      </div>

      {/* Template Version */}
      <TemplateVersionCard />

      {/* Change Password */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Lock size={18} className="text-indigo-500" />
          Alterar Senha
        </h3>

        {pwError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm mb-4">{pwError}</div>
        )}
        {pwSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2 rounded-lg text-sm mb-4">{pwSuccess}</div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <PasswordField
            label="Senha Atual"
            value={pwForm.currentPassword}
            onChange={(v) => setPwForm({ ...pwForm, currentPassword: v })}
            show={showPw.current}
            onToggle={() => setShowPw({ ...showPw, current: !showPw.current })}
          />
          <PasswordField
            label="Nova Senha"
            value={pwForm.newPassword}
            onChange={(v) => setPwForm({ ...pwForm, newPassword: v })}
            show={showPw.new}
            onToggle={() => setShowPw({ ...showPw, new: !showPw.new })}
          />
          <PasswordField
            label="Confirmar Nova Senha"
            value={pwForm.confirmPassword}
            onChange={(v) => setPwForm({ ...pwForm, confirmPassword: v })}
            show={showPw.confirm}
            onToggle={() => setShowPw({ ...showPw, confirm: !showPw.confirm })}
          />
          <button
            type="submit"
            disabled={pwLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {pwLoading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            Alterar Senha
          </button>
        </form>
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, show, onToggle }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm pr-10 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  );
}
