import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { Box, Text, Title, Select, Toggle, Button, Tag } from '@nimbus-ds/components';
import worldTopo from 'world-atlas/countries-110m.json';
import { NUMERIC_TO_ALPHA2 } from '../lib/countryNumericCodes.js';

const COLOR_UNSUPPORTED = '#e5e7eb';
const COLOR_AVAILABLE = '#93c5fd';
const COLOR_AVAILABLE_HOVER = '#60a5fa';
const COLOR_ENABLED = '#16a34a';
const COLOR_ENABLED_HOVER = '#15803d';
const COLOR_SELECTED_STROKE = '#111827';

export default function CountryMapSelector({
  countries,
  languages,
  currencies,
  rules,
  defaults,
  onAddRule,
  onUpdateRule,
  onDeleteRule,
}) {
  const { t } = useTranslation();

  const [selectedCode, setSelectedCode] = useState(null);
  const [hoveredName, setHoveredName] = useState(null);
  const [panelEnabled, setPanelEnabled] = useState(false);
  const [panelLanguage, setPanelLanguage] = useState('');
  const [panelCurrency, setPanelCurrency] = useState('');
  const [saving, setSaving] = useState(false);

  const supportedByCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  const ruleByCountry = useMemo(() => new Map(rules.map((r) => [r.country, r])), [rules]);

  const existingRule = selectedCode ? ruleByCountry.get(selectedCode) : null;
  const selectedCountry = selectedCode ? supportedByCode.get(selectedCode) : null;

  const openCountry = (code) => {
    const rule = ruleByCountry.get(code);
    setSelectedCode(code);
    if (rule) {
      setPanelEnabled(true);
      setPanelLanguage(rule.language);
      setPanelCurrency(rule.currency);
    } else {
      const def = defaults?.[code];
      setPanelEnabled(false);
      setPanelLanguage(def?.language || '');
      setPanelCurrency(def?.currency || '');
    }
  };

  const closePanel = () => setSelectedCode(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (panelEnabled) {
        if (!panelLanguage || !panelCurrency) return;
        if (existingRule) {
          await onUpdateRule(existingRule.id, panelLanguage, panelCurrency);
        } else {
          await onAddRule(selectedCode, panelLanguage, panelCurrency);
        }
      } else if (existingRule) {
        await onDeleteRule(existingRule.id);
      }
      closePanel();
    } finally {
      setSaving(false);
    }
  };

  const fillFor = (code) => {
    if (!code || !supportedByCode.has(code)) return { normal: COLOR_UNSUPPORTED, hover: COLOR_UNSUPPORTED };
    if (ruleByCountry.has(code)) return { normal: COLOR_ENABLED, hover: COLOR_ENABLED_HOVER };
    return { normal: COLOR_AVAILABLE, hover: COLOR_AVAILABLE_HOVER };
  };

  return (
    <Box display="flex" gap="4" flexWrap="wrap">
      <Box display="flex" flexDirection="column" gap="2" flex="1" minWidth="320px">
        <Box style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <ComposableMap projectionConfig={{ scale: 140 }} width={800} height={420} style={{ width: '100%', height: 'auto' }}>
            <Geographies geography={worldTopo}>
              {({ geographies }) =>
                geographies.map((geo) => {
                  const alpha2 = NUMERIC_TO_ALPHA2[Number(geo.id)] || null;
                  const isSupported = alpha2 && supportedByCode.has(alpha2);
                  const { normal, hover } = fillFor(alpha2);
                  const isSelected = alpha2 && alpha2 === selectedCode;
                  return (
                    <Geography
                      key={geo.rsmKey}
                      geo={geo}
                      onClick={() => isSupported && openCountry(alpha2)}
                      onMouseEnter={() => setHoveredName(alpha2 ? supportedByCode.get(alpha2)?.label || geo.properties.name : geo.properties.name)}
                      onMouseLeave={() => setHoveredName(null)}
                      style={{
                        default: {
                          fill: normal,
                          stroke: isSelected ? COLOR_SELECTED_STROKE : '#ffffff',
                          strokeWidth: isSelected ? 1.5 : 0.5,
                          outline: 'none',
                          cursor: isSupported ? 'pointer' : 'default',
                        },
                        hover: {
                          fill: isSupported ? hover : normal,
                          stroke: isSelected ? COLOR_SELECTED_STROKE : '#ffffff',
                          strokeWidth: isSelected ? 1.5 : 0.5,
                          outline: 'none',
                          cursor: isSupported ? 'pointer' : 'default',
                        },
                        pressed: {
                          fill: isSupported ? hover : normal,
                          outline: 'none',
                        },
                      }}
                    />
                  );
                })
              }
            </Geographies>
          </ComposableMap>
        </Box>

        <Box display="flex" gap="4" flexWrap="wrap" alignItems="center">
          <Box display="flex" gap="1" alignItems="center">
            <Box style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: COLOR_ENABLED }} />
            <Text fontSize="caption">{t('translations.mapLegendEnabled')}</Text>
          </Box>
          <Box display="flex" gap="1" alignItems="center">
            <Box style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: COLOR_AVAILABLE }} />
            <Text fontSize="caption">{t('translations.mapLegendAvailable')}</Text>
          </Box>
          <Box display="flex" gap="1" alignItems="center">
            <Box style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: COLOR_UNSUPPORTED }} />
            <Text fontSize="caption">{t('translations.mapLegendUnsupported')}</Text>
          </Box>
        </Box>

        {hoveredName && (
          <Text fontSize="caption" color="neutral-textLow">
            {hoveredName}
          </Text>
        )}
      </Box>

      <Box
        display="flex"
        flexDirection="column"
        gap="3"
        minWidth="280px"
        flex="1"
        style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}
      >
        {!selectedCode ? (
          <Text color="neutral-textLow">{t('translations.mapSelectHint')}</Text>
        ) : (
          <>
            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Title as="h4">{selectedCountry?.label || selectedCode}</Title>
              {existingRule && <Tag appearance="success">{t('translations.mapEnabledTag')}</Tag>}
            </Box>

            <Toggle
              name="map-country-enabled"
              label={panelEnabled ? t('translations.mapEnableOn') : t('translations.mapEnableOff')}
              active={panelEnabled}
              checked={panelEnabled}
              onChange={() => setPanelEnabled((prev) => !prev)}
            />

            {panelEnabled && (
              <Box display="flex" flexDirection="column" gap="3">
                <Box display="flex" flexDirection="column" gap="1">
                  <Text>{t('translations.language')}</Text>
                  <Select name="mapLanguage" value={panelLanguage} onChange={(e) => setPanelLanguage(e.target.value)}>
                    <Select.Option value="" label={t('translations.selectLanguage')}>
                      {t('translations.selectLanguage')}
                    </Select.Option>
                    {languages.map((lang) => (
                      <Select.Option key={lang.code} value={lang.code} label={lang.label}>
                        {lang.label}
                      </Select.Option>
                    ))}
                  </Select>
                </Box>
                <Box display="flex" flexDirection="column" gap="1">
                  <Text>{t('translations.currency')}</Text>
                  <Select name="mapCurrency" value={panelCurrency} onChange={(e) => setPanelCurrency(e.target.value)}>
                    <Select.Option value="" label={t('translations.selectCurrency')}>
                      {t('translations.selectCurrency')}
                    </Select.Option>
                    {currencies.map((cur) => (
                      <Select.Option key={cur.code} value={cur.code} label={cur.label}>
                        {cur.label}
                      </Select.Option>
                    ))}
                  </Select>
                </Box>
              </Box>
            )}

            <Box display="flex" gap="2">
              <Button
                appearance="primary"
                onClick={handleSave}
                disabled={saving || (panelEnabled && (!panelLanguage || !panelCurrency))}
              >
                {saving ? t('common.loading') : t('common.save')}
              </Button>
              <Button appearance="neutral" onClick={closePanel} disabled={saving}>
                {t('common.cancel')}
              </Button>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}
