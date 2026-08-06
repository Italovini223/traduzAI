import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Button, Text, Title, Alert, Spinner, Select, Toggle } from '@nimbus-ds/components';
import api from '../services/api.js';
import CountryMapSelector from '../components/CountryMapSelector.jsx';
import TranslationOverrides from '../components/TranslationOverrides.jsx';
import BannerOverrides from '../components/BannerOverrides.jsx';

export default function Settings() {
  const { t } = useTranslation();

  const [options, setOptions] = useState({ countries: [], languages: [], currencies: [], defaults: {} });
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [config, setConfig] = useState({ enabled: false, sourceLanguage: 'pt-BR', baseCurrency: 'BRL', translateImages: false });
  const [rules, setRules] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [bannerOverrides, setBannerOverrides] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingOverrides, setLoadingOverrides] = useState(true);
  const [loadingBannerOverrides, setLoadingBannerOverrides] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [savingImages, setSavingImages] = useState(false);

  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    loadOptions();
    loadConfig();
    loadOverrides();
    loadBannerOverrides();
  }, []);

  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 2500);
    return () => clearTimeout(timer);
  }, [successMsg]);

  const loadOptions = async () => {
    setLoadingOptions(true);
    try {
      const res = await api.get('/api/translations/options');
      setOptions({
        countries: res.data?.countries || [],
        languages: res.data?.languages || [],
        currencies: res.data?.currencies || [],
        defaults: res.data?.defaults || {},
      });
    } catch {
      // Silencioso — dropdowns ficam vazios, usuário pode recarregar a página
    } finally {
      setLoadingOptions(false);
    }
  };

  const loadConfig = async () => {
    setLoadingConfig(true);
    try {
      const res = await api.get('/api/translations/config');
      setConfig(res.data?.config || { enabled: false, sourceLanguage: 'pt-BR', baseCurrency: 'BRL', translateImages: false });
      setRules(res.data?.rules || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoadingConfig(false);
    }
  };

  const handleToggleEnabled = async () => {
    setSavingToggle(true);
    setError(null);
    try {
      const res = await api.put('/api/translations/config', { enabled: !config.enabled });
      setConfig(res.data.config);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSavingToggle(false);
    }
  };

  const handleToggleImages = async () => {
    setSavingImages(true);
    setError(null);
    try {
      const res = await api.put('/api/translations/config', { translateImages: !config.translateImages });
      setConfig(res.data.config);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSavingImages(false);
    }
  };

  const handleSaveSource = async () => {
    setSavingSource(true);
    setError(null);
    try {
      const res = await api.put('/api/translations/config', {
        sourceLanguage: config.sourceLanguage,
        baseCurrency: config.baseCurrency,
      });
      setConfig(res.data.config);
      setSuccessMsg(t('translations.savedSource'));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSavingSource(false);
    }
  };

  const handleAddRule = async (country, language, currency) => {
    setError(null);
    try {
      const res = await api.post('/api/translations/rules', { country, language, currency });
      setRules((prev) => [...prev, res.data.rule].sort((a, b) => a.country.localeCompare(b.country)));
      setSuccessMsg(t('translations.ruleAdded'));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleUpdateRule = async (id, language, currency) => {
    setError(null);
    try {
      const res = await api.put(`/api/translations/rules/${id}`, { language, currency });
      setRules((prev) => prev.map((r) => (r.id === id ? res.data.rule : r)));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleDeleteRule = async (id) => {
    setError(null);
    try {
      await api.delete(`/api/translations/rules/${id}`);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const loadOverrides = async () => {
    setLoadingOverrides(true);
    try {
      const res = await api.get('/api/translations/overrides');
      setOverrides(res.data?.overrides || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoadingOverrides(false);
    }
  };

  const handleAddOverride = async (sourceText, targetLang, overrideText) => {
    setError(null);
    try {
      const res = await api.post('/api/translations/overrides', { sourceText, targetLang, overrideText });
      setOverrides((prev) => [res.data.override, ...prev.filter((o) => o.id !== res.data.override.id)]);
      setSuccessMsg(t('translations.overrideSaved'));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleUpdateOverride = async (id, overrideText) => {
    setError(null);
    try {
      const res = await api.put(`/api/translations/overrides/${id}`, { overrideText });
      setOverrides((prev) => prev.map((o) => (o.id === id ? res.data.override : o)));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleDeleteOverride = async (id) => {
    setError(null);
    try {
      await api.delete(`/api/translations/overrides/${id}`);
      setOverrides((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const loadBannerOverrides = async () => {
    setLoadingBannerOverrides(true);
    try {
      const res = await api.get('/api/translations/banner-overrides');
      setBannerOverrides(res.data?.overrides || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoadingBannerOverrides(false);
    }
  };

  const handleDetectBanners = async () => {
    const res = await api.get('/api/translations/detect-banners');
    return res.data?.images || [];
  };

  const handleAddBannerOverride = async (originalImageUrl, targetLang, replacementImage) => {
    setError(null);
    try {
      const res = await api.post('/api/translations/banner-overrides', { originalImageUrl, targetLang, replacementImage });
      setBannerOverrides((prev) => [res.data.override, ...prev.filter((o) => o.id !== res.data.override.id)]);
      setSuccessMsg(t('translations.overrideSaved'));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleDeleteBannerOverride = async (id) => {
    setError(null);
    try {
      await api.delete(`/api/translations/banner-overrides/${id}`);
      setBannerOverrides((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  return (
    <Box display="flex" flexDirection="column" gap="4">
      <Title as="h2">{t('translations.title')}</Title>

      {successMsg && (
        <Alert appearance="success">
          <Text>{successMsg}</Text>
        </Alert>
      )}
      {error && (
        <Alert appearance="danger">
          <Text>{error}</Text>
        </Alert>
      )}

      <Card>
        <Card.Header>
          <Title as="h3">{t('translations.enableTitle')}</Title>
        </Card.Header>
        <Card.Body>
          {loadingConfig ? (
            <Spinner />
          ) : (
            <Box display="flex" flexDirection="column" gap="3">
              <Toggle
                name="translation-enabled"
                label={config.enabled ? t('translations.enabledOn') : t('translations.enabledOff')}
                active={config.enabled}
                checked={config.enabled}
                disabled={savingToggle}
                onChange={handleToggleEnabled}
              />

              <Box display="flex" flexDirection="column" gap="1">
                <Toggle
                  name="translate-images"
                  label={config.translateImages ? t('translations.imagesOn') : t('translations.imagesOff')}
                  active={config.translateImages}
                  checked={config.translateImages}
                  disabled={savingImages}
                  onChange={handleToggleImages}
                />
                <Text fontSize="caption" color="neutral-textLow">{t('translations.imagesHint')}</Text>
              </Box>
            </Box>
          )}
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('translations.sourceTitle')}</Title>
        </Card.Header>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="3">
            <Text color="neutral-textLow">{t('translations.sourceDescription')}</Text>
            <Box display="flex" gap="3" flexWrap="wrap">
              <Box display="flex" flexDirection="column" gap="1" minWidth="200px">
                <Text>{t('translations.sourceLanguage')}</Text>
                <Select
                  name="sourceLanguage"
                  value={config.sourceLanguage}
                  disabled={loadingOptions}
                  onChange={(e) => setConfig((prev) => ({ ...prev, sourceLanguage: e.target.value }))}
                >
                  {options.languages.map((lang) => (
                    <Select.Option key={lang.code} value={lang.code} label={lang.label}>
                      {lang.label}
                    </Select.Option>
                  ))}
                </Select>
              </Box>
              <Box display="flex" flexDirection="column" gap="1" minWidth="200px">
                <Text>{t('translations.baseCurrency')}</Text>
                <Select
                  name="baseCurrency"
                  value={config.baseCurrency}
                  disabled={loadingOptions}
                  onChange={(e) => setConfig((prev) => ({ ...prev, baseCurrency: e.target.value }))}
                >
                  {options.currencies.map((cur) => (
                    <Select.Option key={cur.code} value={cur.code} label={cur.label}>
                      {cur.label}
                    </Select.Option>
                  ))}
                </Select>
              </Box>
              <Box display="flex" alignItems="flex-end">
                <Button appearance="primary" onClick={handleSaveSource} disabled={savingSource}>
                  {savingSource ? t('common.loading') : t('common.save')}
                </Button>
              </Box>
            </Box>
          </Box>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('translations.rulesTitle')}</Title>
        </Card.Header>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="3">
            <Text color="neutral-textLow">{t('translations.rulesDescription')}</Text>

            {loadingConfig || loadingOptions ? (
              <Spinner />
            ) : (
              <CountryMapSelector
                countries={options.countries}
                languages={options.languages}
                currencies={options.currencies}
                rules={rules}
                defaults={options.defaults}
                onAddRule={handleAddRule}
                onUpdateRule={handleUpdateRule}
                onDeleteRule={handleDeleteRule}
              />
            )}
          </Box>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('translations.overridesTitle')}</Title>
        </Card.Header>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="3">
            <Text color="neutral-textLow">{t('translations.overridesDescription')}</Text>

            {loadingOverrides || loadingOptions ? (
              <Spinner />
            ) : (
              <TranslationOverrides
                overrides={overrides}
                languages={options.languages}
                onAdd={handleAddOverride}
                onUpdate={handleUpdateOverride}
                onDelete={handleDeleteOverride}
              />
            )}
          </Box>
        </Card.Body>
      </Card>

      <Card>
        <Card.Header>
          <Title as="h3">{t('translations.bannerOverridesTitle')}</Title>
        </Card.Header>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="3">
            <Text color="neutral-textLow">{t('translations.bannerOverridesDescription')}</Text>

            {loadingBannerOverrides || loadingOptions ? (
              <Spinner />
            ) : (
              <BannerOverrides
                overrides={bannerOverrides}
                languages={options.languages}
                onDetect={handleDetectBanners}
                onAdd={handleAddBannerOverride}
                onDelete={handleDeleteBannerOverride}
              />
            )}
          </Box>
        </Card.Body>
      </Card>
    </Box>
  );
}
