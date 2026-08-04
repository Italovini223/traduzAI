import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Text, Title, Spinner, Alert, Select, Button } from '@nimbus-ds/components';
import { useNexo } from '../providers/NexoProvider.jsx';
import api from '../services/api.js';
import SalesMap from '../components/SalesMap.jsx';
import SalesHistoryChart from '../components/SalesHistoryChart.jsx';

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from, to };
}

export default function Dashboard() {
  const { t } = useTranslation();
  const { store } = useNexo();

  const [range, setRange] = useState(defaultRange);
  const [metric, setMetric] = useState('revenue');
  const [sales, setSales] = useState(null);
  const [countryLabels, setCountryLabels] = useState({});
  const [baseCurrency, setBaseCurrency] = useState('BRL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  const loadSales = useCallback(async (from, to) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/analytics/sales', {
        params: { from: from.toISOString(), to: to.toISOString() },
      });
      setSales(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSales(range.from, range.to);
  }, [range, loadSales]);

  useEffect(() => {
    api
      .get('/api/translations/options')
      .then((res) => {
        const map = {};
        (res.data?.countries || []).forEach((c) => {
          map[c.code] = c.label;
        });
        setCountryLabels(map);
      })
      .catch(() => { /* silencioso — mapa cai pro nome do topojson */ });

    api
      .get('/api/translations/config')
      .then((res) => {
        if (res.data?.config?.baseCurrency) setBaseCurrency(res.data.config.baseCurrency);
      })
      .catch(() => { /* silencioso — mantem BRL */ });
  }, []);

  const handleRangeChange = (from, to) => setRange({ from, to });

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    setError(null);
    try {
      const res = await api.post('/api/analytics/sync');
      setSyncMsg(t('dashboard.salesMap.syncDone', { count: res.data?.synced ?? 0 }));
      await loadSales(range.from, range.to);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSyncing(false);
    }
  };

  const formatValue = (value) => {
    try {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: baseCurrency }).format(value || 0);
    } catch {
      return `${baseCurrency} ${(value || 0).toFixed(2)}`;
    }
  };

  return (
    <Box display="flex" flexDirection="column" gap="4">
      <Title as="h2">{t('dashboard.title')}</Title>

      <Card>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="2">
            <Text fontSize="highlight">{t('dashboard.welcome')}</Text>
            {store && (
              <Box display="flex" flexDirection="column" gap="1">
                <Text color="neutral-textLow">
                  {store.name || 'Store'} (ID: {store.id || store.storeId || '---'})
                </Text>
              </Box>
            )}
          </Box>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Box display="flex" justifyContent="space-between" alignItems="center" width="100%">
            <Title as="h3">{t('dashboard.salesMap.title')}</Title>
            <Button appearance="neutral" onClick={handleSync} disabled={syncing}>
              {syncing ? t('common.loading') : t('dashboard.salesMap.syncButton')}
            </Button>
          </Box>
        </Card.Header>
        <Card.Body>
          {error && <Alert appearance="danger">{error}</Alert>}
          {syncMsg && <Alert appearance="success">{syncMsg}</Alert>}
          {loading && !sales ? (
            <Spinner />
          ) : sales && (
            <Box display="flex" flexDirection="column" gap="4">
              <Box display="flex" gap="4" flexWrap="wrap" alignItems="center">
                <Text>
                  {t('dashboard.salesMap.totalSales')}: <strong>{sales.totals.salesCount}</strong>
                </Text>
                <Text>
                  {t('dashboard.salesMap.totalRevenue')}: <strong>{formatValue(sales.totals.revenue)}</strong>
                </Text>
                <Box minWidth="200px">
                  <Select name="mapMetric" value={metric} onChange={(e) => setMetric(e.target.value)}>
                    <Select.Option value="revenue" label={t('dashboard.salesMap.metricRevenue')}>
                      {t('dashboard.salesMap.metricRevenue')}
                    </Select.Option>
                    <Select.Option value="salesCount" label={t('dashboard.salesMap.metricSalesCount')}>
                      {t('dashboard.salesMap.metricSalesCount')}
                    </Select.Option>
                  </Select>
                </Box>
              </Box>

              <SalesMap byCountry={sales.byCountry} metric={metric} formatValue={formatValue} countryLabels={countryLabels} />

              <SalesHistoryChart
                timeseries={sales.timeseries}
                from={range.from}
                to={range.to}
                onRangeChange={handleRangeChange}
                formatValue={formatValue}
              />
            </Box>
          )}
        </Card.Body>
      </Card>
    </Box>
  );
}
