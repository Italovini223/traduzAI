import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Button, Text, Title, Alert, Select, Toggle, Tabs, Tag, Skeleton } from '@nimbus-ds/components';
import api from '../services/api.js';
import CountryMapSelector from '../components/CountryMapSelector.jsx';
import TranslationOverrides from '../components/TranslationOverrides.jsx';
import BannerOverrides from '../components/BannerOverrides.jsx';
import CountryGlossary from '../components/CountryGlossary.jsx';
import SeoPreview from '../components/SeoPreview.jsx';

const PICKER_PREVIEW_POSITION = {
  'bottom-left': { bottom: '10px', left: '10px' },
  'bottom-right': { bottom: '10px', right: '10px' },
  'top-left': { top: '10px', left: '10px' },
  'top-right': { top: '10px', right: '10px' },
};

export default function Settings() {
  const { t } = useTranslation();

  const [options, setOptions] = useState({ countries: [], languages: [], currencies: [], defaults: {} });
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [config, setConfig] = useState({
    enabled: false,
    sourceLanguage: 'pt-BR',
    baseCurrency: 'BRL',
    pickerPosition: 'bottom-left',
    pickerColor: '#1a73e8',
  });
  const [savedConfig, setSavedConfig] = useState(config);
  const [rules, setRules] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [bannerOverrides, setBannerOverrides] = useState([]);
  const [glossaryTerms, setGlossaryTerms] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingOverrides, setLoadingOverrides] = useState(true);
  const [loadingBannerOverrides, setLoadingBannerOverrides] = useState(true);
  const [loadingGlossary, setLoadingGlossary] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [savingAppearance, setSavingAppearance] = useState(false);
  const [editModeCountry, setEditModeCountry] = useState('');
  const [openingEditMode, setOpeningEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [overridePrefill, setOverridePrefill] = useState(null);

  const handleCorrectSeoField = (sourceText, targetLang, currentTranslation) => {
    setOverridePrefill({ key: Date.now(), sourceText, targetLang, overrideText: currentTranslation });
  };

  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    loadOptions();
    loadConfig();
    loadOverrides();
    loadBannerOverrides();
    loadGlossary();
  }, []);

  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(() => setSuccessMsg(null), 2500);
    return () => clearTimeout(timer);
  }, [successMsg]);

  useEffect(() => {
    if (!editModeCountry && rules.length > 0) setEditModeCountry(rules[0].country);
  }, [rules, editModeCountry]);

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
      const loadedConfig = res.data?.config || {
        enabled: false,
        sourceLanguage: 'pt-BR',
        baseCurrency: 'BRL',
        pickerPosition: 'bottom-left',
        pickerColor: '#1a73e8',
      };
      setConfig(loadedConfig);
      setSavedConfig(loadedConfig);
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
      setSavedConfig(res.data.config);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSavingToggle(false);
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
      setSavedConfig(res.data.config);
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

  const handleSaveAppearance = async () => {
    setSavingAppearance(true);
    setError(null);
    try {
      const res = await api.put('/api/translations/config', {
        pickerPosition: config.pickerPosition,
        pickerColor: config.pickerColor,
      });
      setConfig(res.data.config);
      setSavedConfig(res.data.config);
      setSuccessMsg(t('translations.appearanceSaved'));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSavingAppearance(false);
    }
  };

  const handleOpenEditMode = async () => {
    setOpeningEditMode(true);
    setError(null);
    try {
      const res = await api.post('/api/translations/edit-session');
      const country = editModeCountry || rules[0]?.country;
      const url = country ? `${res.data.editUrl}&country=${encodeURIComponent(country)}` : res.data.editUrl;
      window.open(url, '_blank');
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setOpeningEditMode(false);
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

  const loadGlossary = async () => {
    setLoadingGlossary(true);
    try {
      const res = await api.get('/api/translations/glossary');
      setGlossaryTerms(res.data?.terms || []);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoadingGlossary(false);
    }
  };

  const handleAddGlossaryTerm = async (glossaryCountry, findText, replaceText) => {
    setError(null);
    try {
      const res = await api.post('/api/translations/glossary', { country: glossaryCountry, findText, replaceText });
      setGlossaryTerms((prev) => [res.data.term, ...prev.filter((t) => t.id !== res.data.term.id)]);
      setSuccessMsg(t('translations.glossarySaved'));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleUpdateGlossaryTerm = async (id, replaceText) => {
    setError(null);
    try {
      const res = await api.put(`/api/translations/glossary/${id}`, { replaceText });
      setGlossaryTerms((prev) => prev.map((t) => (t.id === id ? res.data.term : t)));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleDeleteGlossaryTerm = async (id) => {
    setError(null);
    try {
      await api.delete(`/api/translations/glossary/${id}`);
      setGlossaryTerms((prev) => prev.filter((t) => t.id !== id));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const initialLoading = loadingOptions || loadingConfig || loadingOverrides || loadingBannerOverrides || loadingGlossary;
  const isSourceDirty = config.sourceLanguage !== savedConfig.sourceLanguage || config.baseCurrency !== savedConfig.baseCurrency;
  const isAppearanceDirty = config.pickerPosition !== savedConfig.pickerPosition || config.pickerColor !== savedConfig.pickerColor;

  if (initialLoading) {
    return (
      <Box display="flex" flexDirection="column" gap="4" maxWidth="880px" marginX="auto" width="100%">
        <Skeleton width="240px" height="32px" borderRadius="4px" />
        <Skeleton width="100%" height="96px" borderRadius="8px" />
        <Skeleton width="100%" height="40px" borderRadius="8px" />
        <Skeleton width="100%" height="220px" borderRadius="8px" />
      </Box>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap="4" maxWidth="880px" marginX="auto" width="100%">
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
          <Box display="flex" flexDirection="column" gap="3">
            <Toggle
              name="translation-enabled"
              label={config.enabled ? t('translations.enabledOn') : t('translations.enabledOff')}
              active={config.enabled}
              checked={config.enabled}
              disabled={savingToggle}
              onChange={handleToggleEnabled}
            />
          </Box>
        </Card.Body>
      </Card>

      <Tabs selected={activeTab} onTabSelect={setActiveTab}>
        <Tabs.Item label={t('translations.tabGeneral')}>
          <Box display="flex" flexDirection="column" gap="4" paddingTop="4">
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
                        onChange={(e) => setConfig((prev) => ({ ...prev, baseCurrency: e.target.value }))}
                      >
                        {options.currencies.map((cur) => (
                          <Select.Option key={cur.code} value={cur.code} label={cur.label}>
                            {cur.label}
                          </Select.Option>
                        ))}
                      </Select>
                    </Box>
                    <Box display="flex" alignItems="flex-end" gap="2">
                      <Button appearance="primary" onClick={handleSaveSource} disabled={savingSource}>
                        {savingSource ? t('common.loading') : t('common.save')}
                      </Button>
                      {isSourceDirty && <Tag appearance="warning">{t('common.unsavedChanges')}</Tag>}
                    </Box>
                  </Box>
                </Box>
              </Card.Body>
            </Card>
          </Box>
        </Tabs.Item>

        <Tabs.Item label={t('translations.tabCountry')}>
          <Box display="flex" flexDirection="column" gap="4" paddingTop="4">
            <Card>
              <Card.Header>
                <Title as="h3">{t('translations.rulesTitle')}</Title>
              </Card.Header>
              <Card.Body>
                <Box display="flex" flexDirection="column" gap="3">
                  <Text color="neutral-textLow">{t('translations.rulesDescription')}</Text>

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
                </Box>
              </Card.Body>
            </Card>

            <Card>
              <Card.Header>
                <Title as="h3">{t('translations.appearanceTitle')}</Title>
              </Card.Header>
              <Card.Body>
                <Box display="flex" flexDirection="column" gap="3">
                  <Text color="neutral-textLow">{t('translations.appearanceDescription')}</Text>
                  <Box display="flex" gap="3" flexWrap="wrap">
                    <Box display="flex" flexDirection="column" gap="1" minWidth="200px">
                      <Text>{t('translations.pickerPosition')}</Text>
                      <Select
                        name="pickerPosition"
                        value={config.pickerPosition}
                        onChange={(e) => setConfig((prev) => ({ ...prev, pickerPosition: e.target.value }))}
                      >
                        <Select.Option value="bottom-left" label={t('translations.positionBottomLeft')}>
                          {t('translations.positionBottomLeft')}
                        </Select.Option>
                        <Select.Option value="bottom-right" label={t('translations.positionBottomRight')}>
                          {t('translations.positionBottomRight')}
                        </Select.Option>
                        <Select.Option value="top-left" label={t('translations.positionTopLeft')}>
                          {t('translations.positionTopLeft')}
                        </Select.Option>
                        <Select.Option value="top-right" label={t('translations.positionTopRight')}>
                          {t('translations.positionTopRight')}
                        </Select.Option>
                      </Select>
                    </Box>
                    <Box display="flex" flexDirection="column" gap="1">
                      <Text>{t('translations.pickerColor')}</Text>
                      <input
                        type="color"
                        value={config.pickerColor}
                        onChange={(e) => setConfig((prev) => ({ ...prev, pickerColor: e.target.value }))}
                        style={{ width: '48px', height: '36px', padding: 0, border: '1px solid #ddd', borderRadius: '4px' }}
                      />
                    </Box>
                    <Box display="flex" alignItems="flex-end" gap="2">
                      <Button appearance="primary" onClick={handleSaveAppearance} disabled={savingAppearance}>
                        {savingAppearance ? t('common.loading') : t('common.save')}
                      </Button>
                      {isAppearanceDirty && <Tag appearance="warning">{t('common.unsavedChanges')}</Tag>}
                    </Box>
                  </Box>

                  <Box display="flex" flexDirection="column" gap="1">
                    <Text fontSize="caption" color="neutral-textLow">{t('translations.previewTitle')}</Text>
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: '320px',
                        height: '160px',
                        backgroundColor: '#f4f5f7',
                        border: '1px solid #ddd',
                        borderRadius: '8px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          position: 'absolute',
                          ...PICKER_PREVIEW_POSITION[config.pickerPosition],
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          backgroundColor: config.pickerColor,
                          boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                        }}
                      >
                        <span style={{ color: '#fff', fontSize: '11px', fontWeight: 'bold' }}>{t('translations.previewButtonLabel')}</span>
                      </div>
                    </div>
                  </Box>
                </Box>
              </Card.Body>
            </Card>
          </Box>
        </Tabs.Item>

        <Tabs.Item label={t('translations.tabTextFixes')}>
          <Box display="flex" flexDirection="column" gap="4" paddingTop="4">
            <Card>
              <Card.Header>
                <Title as="h3">{t('translations.seoPreviewTitle')}</Title>
              </Card.Header>
              <Card.Body>
                <Box display="flex" flexDirection="column" gap="3">
                  <Text color="neutral-textLow">{t('translations.seoPreviewDescription')}</Text>
                  <SeoPreview
                    languages={options.languages}
                    countries={options.countries}
                    onCorrect={handleCorrectSeoField}
                  />
                </Box>
              </Card.Body>
            </Card>

            <Card>
              <Card.Header>
                <Title as="h3">{t('translations.editModeTitle')}</Title>
              </Card.Header>
              <Card.Body>
                <Box display="flex" flexDirection="column" gap="3">
                  <Text color="neutral-textLow">{t('translations.editModeDescription')}</Text>
                  <Box display="flex" gap="3" flexWrap="wrap" alignItems="flex-end">
                    <Box display="flex" flexDirection="column" gap="1" minWidth="180px">
                      <Text>{t('translations.editModeCountry')}</Text>
                      <Select
                        name="editModeCountry"
                        value={editModeCountry}
                        disabled={rules.length === 0}
                        onChange={(e) => setEditModeCountry(e.target.value)}
                      >
                        {rules.map((r) => (
                          <Select.Option key={r.country} value={r.country} label={r.country}>
                            {r.country}
                          </Select.Option>
                        ))}
                      </Select>
                    </Box>
                    <Button appearance="neutral" onClick={handleOpenEditMode} disabled={openingEditMode || rules.length === 0}>
                      {openingEditMode ? t('common.loading') : t('translations.openEditMode')}
                    </Button>
                  </Box>
                  {rules.length === 0 && (
                    <Text fontSize="caption" color="neutral-textLow">{t('translations.editModeNoRules')}</Text>
                  )}
                </Box>
              </Card.Body>
            </Card>

            <Card>
              <Card.Header>
                <Box display="flex" alignItems="center" gap="2">
                  <Title as="h3">{t('translations.glossaryTitle')}</Title>
                  <Tag appearance="primary">{t('translations.glossaryBadge')}</Tag>
                </Box>
              </Card.Header>
              <Card.Body>
                <Box display="flex" flexDirection="column" gap="3">
                  <Text color="neutral-textLow">{t('translations.glossaryDescription')}</Text>

                  <CountryGlossary
                    terms={glossaryTerms}
                    countries={rules.map((r) => ({
                      code: r.country,
                      name: options.countries.find((c) => c.code === r.country)?.label || r.country,
                    }))}
                    onAdd={handleAddGlossaryTerm}
                    onUpdate={handleUpdateGlossaryTerm}
                    onDelete={handleDeleteGlossaryTerm}
                  />
                </Box>
              </Card.Body>
            </Card>

            <Card>
              <Card.Header>
                <Box display="flex" alignItems="center" gap="2">
                  <Title as="h3">{t('translations.overridesTitle')}</Title>
                  <Tag appearance="neutral">{t('translations.overridesBadge')}</Tag>
                </Box>
              </Card.Header>
              <Card.Body>
                <Box display="flex" flexDirection="column" gap="3">
                  <Text color="neutral-textLow">{t('translations.overridesDescription')}</Text>

                  <TranslationOverrides
                    overrides={overrides}
                    languages={options.languages}
                    onAdd={handleAddOverride}
                    onUpdate={handleUpdateOverride}
                    onDelete={handleDeleteOverride}
                    prefill={overridePrefill}
                  />
                </Box>
              </Card.Body>
            </Card>
          </Box>
        </Tabs.Item>

        <Tabs.Item label={t('translations.tabBanners')}>
          <Box display="flex" flexDirection="column" gap="4" paddingTop="4">
            <Card>
              <Card.Header>
                <Title as="h3">{t('translations.bannerOverridesTitle')}</Title>
              </Card.Header>
              <Card.Body>
                <Box display="flex" flexDirection="column" gap="3">
                  <Text color="neutral-textLow">{t('translations.bannerOverridesDescription')}</Text>

                  <BannerOverrides
                    overrides={bannerOverrides}
                    languages={options.languages}
                    onDetect={handleDetectBanners}
                    onAdd={handleAddBannerOverride}
                    onDelete={handleDeleteBannerOverride}
                  />
                </Box>
              </Card.Body>
            </Card>
          </Box>
        </Tabs.Item>
      </Tabs>
    </Box>
  );
}
