import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../providers/AuthProvider';
import { useTemplateVersion } from '../../hooks/useTemplateVersion';
import adminApi from '../../services/adminApi';
import {
  LayoutDashboard,
  Store,
  CreditCard,
  Receipt,
  Tag,
  DollarSign,
  FileText,
  HelpCircle,
  LifeBuoy,
  Activity,
  Shield,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  AlertTriangle,
} from 'lucide-react';

// Role hierarchy: suporte (1) < gerente (2) < proprietario (3)
const ROLE_LEVEL = { suporte: 1, gerente: 2, proprietario: 3 };

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, color: 'text-blue-400', minRole: 'suporte' },
  { to: '/customers', label: 'Lojas', icon: Store, color: 'text-emerald-400', minRole: 'suporte' },
  { to: '/plans', label: 'Planos', icon: CreditCard, color: 'text-violet-400', minRole: 'gerente' },
  { to: '/subscriptions', label: 'Assinaturas', icon: Receipt, color: 'text-sky-400', minRole: 'suporte' },
  { to: '/coupons', label: 'Cupons', icon: Tag, color: 'text-amber-400', minRole: 'gerente' },
  { to: '/commissions', label: 'Comissoes', icon: DollarSign, color: 'text-green-400', minRole: 'gerente' },
  { to: '/terms', label: 'Termos', icon: FileText, color: 'text-orange-400', minRole: 'gerente' },
  { to: '/faq', label: 'FAQ', icon: HelpCircle, color: 'text-pink-400', minRole: 'suporte' },
  { to: '/support', label: 'Suporte', icon: LifeBuoy, color: 'text-cyan-400', minRole: 'suporte' },
  { to: '/logs', label: 'Logs', icon: Activity, color: 'text-red-400', minRole: 'gerente' },
  { to: '/security', label: 'Seguranca', icon: Shield, color: 'text-indigo-400', minRole: 'proprietario' },
  { to: '/settings', label: 'Configuracoes', icon: Settings, color: 'text-slate-400', minRole: 'proprietario' },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { admin, logout } = useAuth();
  const navigate = useNavigate();
  const { current, outdated, loading: versionLoading } = useTemplateVersion();
  const [openTickets, setOpenTickets] = useState(0);

  useEffect(() => {
    adminApi.get('/support/stats')
      .then((res) => setOpenTickets(res.data?.open || 0))
      .catch(() => {});
  }, []);

  const adminLevel = ROLE_LEVEL[admin?.role] || 0;
  const visibleItems = navItems.filter((item) => adminLevel >= ROLE_LEVEL[item.minRole]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <aside
      className="fixed left-0 top-0 h-screen bg-sidebar text-white flex flex-col sidebar-transition z-50"
      style={{ width: collapsed ? '5rem' : '16rem' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        {!collapsed && (
          <span className="text-lg font-bold tracking-wide">NuvemPro</span>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-sidebar-hover transition-colors ml-auto"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
        {visibleItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-sidebar-active text-white'
                  : 'text-slate-300 hover:bg-sidebar-hover hover:text-white'
              }`
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={20} className={item.color} />
            {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
            {item.to === '/support' && openTickets > 0 && (
              !collapsed ? (
                <span className="ml-auto bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 min-w-[18px] text-center">
                  {openTickets > 99 ? '99+' : openTickets}
                </span>
              ) : (
                <span className="absolute right-1.5 top-1.5 w-2 h-2 bg-red-500 rounded-full" />
              )
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-700 p-3 space-y-1">
        {!collapsed && admin?.email && (
          <p className="text-xs text-slate-400 truncate mb-1 px-1">{admin.email}</p>
        )}

        {/* Template version badge */}
        {!versionLoading && current && (
          <NavLink
            to="/settings"
            title={outdated ? `Atualização disponível!` : `Template v${current}`}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-sidebar-hover transition-colors w-full"
          >
            {outdated ? (
              <AlertTriangle size={15} className="text-amber-400 shrink-0" />
            ) : (
              <GitBranch size={15} className="text-slate-500 shrink-0" />
            )}
            {!collapsed && (
              <span className={`text-xs font-mono ${outdated ? 'text-amber-400' : 'text-slate-500'}`}>
                v{current}{outdated ? ' ⬆' : ''}
              </span>
            )}
          </NavLink>
        )}

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-slate-300 hover:bg-red-600/20 hover:text-red-400 transition-colors"
          title={collapsed ? 'Sair' : undefined}
        >
          <LogOut size={20} />
          {!collapsed && <span className="text-sm font-medium">Sair</span>}
        </button>
      </div>
    </aside>
  );
}
