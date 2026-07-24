import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Button, Text, Title, Tag, Alert, Table, Spinner, Select, Toggle } from '@nimbus-ds/components';
import api from '../services/api.js';

const emptyNewRule = { country: '', language: '', currency: '' };

export default function Settings() {
  const { t } = useTranslation();

  const [options, setOptions] = useState({ countries: [], languages: [], currencies: [] });
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [config, setConfig] = useState({ enabled: false, sourceLanguage: 'pt-BR', baseCurrency: 'BRL', scriptId: null });
  const [rules, setRules] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingToggle, setSavingToggle] = useState(false);
  const [savingSource, setSavingSource] = useState(false);
  const [registeringScript, setRegisteringScript] = useState(false);

  const [newRule, setNewRule] = useState(emptyNewRule);
  const [addingRule, setAddingRule] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editRule, setEditRule] = useState(emptyNewRule);

  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    loadOptions();
    loadConfig();
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
      setConfig(res.data?.config || { enabled: false, sourceLanguage: 'pt-BR', baseCurrency: 'BRL', scriptId: null });
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

  const handleRegisterScript = async () => {
    setRegisteringScript(true);
    setError(null);
    try {
      const res = await api.post('/api/translations/register-script');
      setConfig(res.data.config);
      setSuccessMsg(t('translations.scriptRegistered'));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setRegisteringScript(false);
    }
  };

  const handleAddRule = async () => {
    if (!newRule.country || !newRule.language || !newRule.currency) return;
    setAddingRule(true);
    setError(null);
    try {
      const res = await api.post('/api/translations/rules', newRule);
      setRules((prev) => [...prev, res.data.rule].sort((a, b) => a.country.localeCompare(b.country)));
      setNewRule(emptyNewRule);
      setSuccessMsg(t('translations.ruleAdded'));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setAddingRule(false);
    }
  };

  const startEdit = (rule) => {
    setEditingId(rule.id);
    setEditRule({ country: rule.country, language: rule.language, currency: rule.currency });
  };

  const handleUpdateRule = async (id) => {
    setError(null);
    try {
      const res = await api.put(`/api/translations/rules/${id}`, {
        language: editRule.language,
        currency: editRule.currency,
      });
      setRules((prev) => prev.map((r) => (r.id === id ? res.data.rule : r)));
      setEditingId(null);
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

  const countryLabel = (code) => options.countries.find((c) => c.code === code)?.label || code;
  const languageLabel = (code) => options.languages.find((l) => l.code === code)?.label || code;
  const currencyLabel = (code) => options.currencies.find((c) => c.code === code)?.label || code;

  const usedCountries = new Set(rules.map((r) => r.country));
  const availableCountries = options.countries.filter((c) => !usedCountries.has(c.code));

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

              <Box display="flex" gap="2" alignItems="center" flexWrap="wrap">
                <Tag appearance={config.scriptId ? 'success' : 'warning'}>
                  {config.scriptId ? t('translations.scriptOk') : t('translations.scriptMissing')}
                </Tag>
                <Button appearance="neutral" onClick={handleRegisterScript} disabled={registeringScript}>
                  {registeringScript ? t('common.loading') : t('translations.registerScript')}
                </Button>
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

            {loadingConfig ? (
              <Spinner />
            ) : rules.length === 0 ? (
              <Text color="neutral-textLow">{t('translations.noRules')}</Text>
            ) : (
              <Table>
                <Table.Head>
                  <Table.Row>
                    <Table.Cell as="th">{t('translations.country')}</Table.Cell>
                    <Table.Cell as="th">{t('translations.language')}</Table.Cell>
                    <Table.Cell as="th">{t('translations.currency')}</Table.Cell>
                    <Table.Cell as="th"></Table.Cell>
                  </Table.Row>
                </Table.Head>
                <Table.Body>
                  {rules.map((rule) => (
                    <Table.Row key={rule.id}>
                      <Table.Cell>{countryLabel(rule.country)}</Table.Cell>
                      <Table.Cell>
                        {editingId === rule.id ? (
                          <Select
                            name={`language-${rule.id}`}
                            value={editRule.language}
                            onChange={(e) => setEditRule((prev) => ({ ...prev, language: e.target.value }))}
                          >
                            {options.languages.map((lang) => (
                              <Select.Option key={lang.code} value={lang.code} label={lang.label}>
                                {lang.label}
                              </Select.Option>
                            ))}
                          </Select>
                        ) : (
                          languageLabel(rule.language)
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        {editingId === rule.id ? (
                          <Select
                            name={`currency-${rule.id}`}
                            value={editRule.currency}
                            onChange={(e) => setEditRule((prev) => ({ ...prev, currency: e.target.value }))}
                          >
                            {options.currencies.map((cur) => (
                              <Select.Option key={cur.code} value={cur.code} label={cur.label}>
                                {cur.label}
                              </Select.Option>
                            ))}
                          </Select>
                        ) : (
                          currencyLabel(rule.currency)
                        )}
                      </Table.Cell>
                      <Table.Cell>
                        <Box display="flex" gap="2">
                          {editingId === rule.id ? (
                            <>
                              <Button appearance="primary" onClick={() => handleUpdateRule(rule.id)}>
                                {t('common.save')}
                              </Button>
                              <Button appearance="neutral" onClick={() => setEditingId(null)}>
                                {t('common.cancel')}
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button appearance="neutral" onClick={() => startEdit(rule)}>
                                {t('common.edit')}
                              </Button>
                              <Button appearance="danger" onClick={() => handleDeleteRule(rule.id)}>
                                {t('common.delete')}
                              </Button>
                            </>
                          )}
                        </Box>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            )}

            <Box display="flex" gap="3" flexWrap="wrap" alignItems="flex-end">
              <Box display="flex" flexDirection="column" gap="1" minWidth="180px">
                <Text>{t('translations.country')}</Text>
                <Select
                  name="newRuleCountry"
                  value={newRule.country}
                  disabled={loadingOptions}
                  onChange={(e) => setNewRule((prev) => ({ ...prev, country: e.target.value }))}
                >
                  <Select.Option value="" label={t('translations.selectCountry')}>
                    {t('translations.selectCountry')}
                  </Select.Option>
                  {availableCountries.map((c) => (
                    <Select.Option key={c.code} value={c.code} label={c.label}>
                      {c.label}
                    </Select.Option>
                  ))}
                </Select>
              </Box>
              <Box display="flex" flexDirection="column" gap="1" minWidth="180px">
                <Text>{t('translations.language')}</Text>
                <Select
                  name="newRuleLanguage"
                  value={newRule.language}
                  disabled={loadingOptions}
                  onChange={(e) => setNewRule((prev) => ({ ...prev, language: e.target.value }))}
                >
                  <Select.Option value="" label={t('translations.selectLanguage')}>
                    {t('translations.selectLanguage')}
                  </Select.Option>
                  {options.languages.map((lang) => (
                    <Select.Option key={lang.code} value={lang.code} label={lang.label}>
                      {lang.label}
                    </Select.Option>
                  ))}
                </Select>
              </Box>
              <Box display="flex" flexDirection="column" gap="1" minWidth="180px">
                <Text>{t('translations.currency')}</Text>
                <Select
                  name="newRuleCurrency"
                  value={newRule.currency}
                  disabled={loadingOptions}
                  onChange={(e) => setNewRule((prev) => ({ ...prev, currency: e.target.value }))}
                >
                  <Select.Option value="" label={t('translations.selectCurrency')}>
                    {t('translations.selectCurrency')}
                  </Select.Option>
                  {options.currencies.map((cur) => (
                    <Select.Option key={cur.code} value={cur.code} label={cur.label}>
                      {cur.label}
                    </Select.Option>
                  ))}
                </Select>
              </Box>
              <Button
                appearance="primary"
                onClick={handleAddRule}
                disabled={addingRule || !newRule.country || !newRule.language || !newRule.currency}
              >
                {addingRule ? t('common.loading') : t('translations.addRule')}
              </Button>
            </Box>
          </Box>
        </Card.Body>
      </Card>
    </Box>
  );
}
