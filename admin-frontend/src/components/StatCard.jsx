import { TrendingUp, TrendingDown } from 'lucide-react';

export default function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-blue-500',
  borderColor = 'border-blue-500',
  trend,       // number: % change vs prev period (null = hidden)
  goalPct,     // number: 0-100+ % of goal achieved (null = hidden)
  goalLabel,   // string: e.g. "Meta: 100 lojas"
}) {
  return (
    <div className={`bg-white rounded-xl shadow-sm border-l-4 ${borderColor} p-5`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
            {trend != null && (
              <span
                className={`inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                  trend >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                }`}
              >
                {trend >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {trend >= 0 ? '+' : ''}{trend}%
              </span>
            )}
          </div>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`p-2.5 rounded-lg bg-gray-50 ${iconColor} flex-shrink-0`}>
            <Icon size={22} />
          </div>
        )}
      </div>

      {goalPct != null && (
        <div className="mt-3 pt-3 border-t border-gray-50">
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-xs text-gray-400 truncate mr-2">{goalLabel || 'Meta'}</span>
            <span
              className={`text-xs font-semibold flex-shrink-0 ${
                goalPct >= 100 ? 'text-emerald-600' : goalPct >= 70 ? 'text-amber-600' : 'text-red-500'
              }`}
            >
              {Math.min(goalPct, 999)}%
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                goalPct >= 100 ? 'bg-emerald-500' : goalPct >= 70 ? 'bg-amber-400' : 'bg-red-400'
              }`}
              style={{ width: `${Math.min(goalPct, 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
