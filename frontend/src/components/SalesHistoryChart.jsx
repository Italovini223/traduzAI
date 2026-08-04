import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Text } from '@nimbus-ds/components';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';

const PRESET_DAYS = [7, 30, 90];

function toDateInputValue(date) {
  return date.toISOString().slice(0, 10);
}

// Grafico de historico (vendas + faturamento por dia) com filtro de periodo —
// presets rapidos (7/30/90 dias) ou range customizado via <input type="date">.
export default function SalesHistoryChart({ timeseries, from, to, onRangeChange, formatValue }) {
  const { t } = useTranslation();

  const applyPreset = (days) => {
    const newTo = new Date();
    const newFrom = new Date();
    newFrom.setDate(newFrom.getDate() - days);
    onRangeChange(newFrom, newTo);
  };

  const handleCustomFrom = (e) => {
    const value = e.target.value;
    if (!value) return;
    onRangeChange(new Date(value), to);
  };

  const handleCustomTo = (e) => {
    const value = e.target.value;
    if (!value) return;
    onRangeChange(from, new Date(value));
  };

  return (
    <Box display="flex" flexDirection="column" gap="3">
      <Box display="flex" gap="2" flexWrap="wrap" alignItems="center">
        {PRESET_DAYS.map((days) => (
          <Button key={days} appearance="neutral" onClick={() => applyPreset(days)}>
            {t('dashboard.salesHistory.lastDays', { days })}
          </Button>
        ))}
        <Box display="flex" gap="1" alignItems="center">
          <Text fontSize="caption">{t('dashboard.salesHistory.from')}</Text>
          <input type="date" value={toDateInputValue(from)} onChange={handleCustomFrom} max={toDateInputValue(to)} />
          <Text fontSize="caption">{t('dashboard.salesHistory.to')}</Text>
          <input type="date" value={toDateInputValue(to)} onChange={handleCustomTo} min={toDateInputValue(from)} max={toDateInputValue(new Date())} />
        </Box>
      </Box>

      {timeseries.length === 0 ? (
        <Text color="neutral-textDisabled">{t('dashboard.salesHistory.empty')}</Text>
      ) : (
        <Box style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={timeseries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" allowDecimals={false} />
              <YAxis yAxisId="right" orientation="right" tickFormatter={formatValue} />
              <Tooltip formatter={(value, name) => (name === t('dashboard.salesHistory.revenue') ? formatValue(value) : value)} />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="salesCount"
                name={t('dashboard.salesHistory.sales')}
                stroke="#1d4ed8"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="revenue"
                name={t('dashboard.salesHistory.revenue')}
                stroke="#16a34a"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Box>
  );
}
