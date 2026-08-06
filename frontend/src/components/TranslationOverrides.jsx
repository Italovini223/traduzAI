import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Input, Select, Text } from '@nimbus-ds/components';

export default function TranslationOverrides({ overrides, languages, onAdd, onUpdate, onDelete }) {
  const { t } = useTranslation();

  const [sourceText, setSourceText] = useState('');
  const [targetLang, setTargetLang] = useState(languages[0]?.code || '');
  const [overrideText, setOverrideText] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  const languageLabel = (code) => languages.find((l) => l.code === code)?.label || code;

  const handleAdd = async () => {
    if (!sourceText.trim() || !overrideText.trim() || !targetLang) return;
    setSaving(true);
    try {
      await onAdd(sourceText.trim(), targetLang, overrideText.trim());
      setSourceText('');
      setOverrideText('');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (o) => {
    setEditingId(o.id);
    setEditingText(o.overrideText);
  };

  const saveEdit = async (id) => {
    if (!editingText.trim()) return;
    await onUpdate(id, editingText.trim());
    setEditingId(null);
  };

  return (
    <Box display="flex" flexDirection="column" gap="4">
      <Box display="flex" gap="3" flexWrap="wrap" alignItems="flex-end">
        <Box display="flex" flexDirection="column" gap="1" minWidth="220px" flex="1">
          <Text>{t('translations.overrideSourceText')}</Text>
          <Input
            name="overrideSourceText"
            placeholder={t('translations.overrideSourcePlaceholder')}
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
          />
        </Box>
        <Box display="flex" flexDirection="column" gap="1" minWidth="180px">
          <Text>{t('translations.overrideTargetLang')}</Text>
          <Select
            name="overrideTargetLang"
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
          >
            {languages.map((lang) => (
              <Select.Option key={lang.code} value={lang.code} label={lang.label}>
                {lang.label}
              </Select.Option>
            ))}
          </Select>
        </Box>
        <Box display="flex" flexDirection="column" gap="1" minWidth="220px" flex="1">
          <Text>{t('translations.overrideCorrectedText')}</Text>
          <Input
            name="overrideCorrectedText"
            placeholder={t('translations.overrideCorrectedPlaceholder')}
            value={overrideText}
            onChange={(e) => setOverrideText(e.target.value)}
          />
        </Box>
        <Button appearance="primary" onClick={handleAdd} disabled={saving}>
          {saving ? t('common.loading') : t('common.save')}
        </Button>
      </Box>

      {overrides.length === 0 ? (
        <Text color="neutral-textLow">{t('translations.noOverrides')}</Text>
      ) : (
        <Box display="flex" flexDirection="column" gap="2">
          {overrides.map((o) => (
            <Box
              key={o.id}
              display="flex"
              gap="3"
              alignItems="center"
              flexWrap="wrap"
              padding="2"
              borderBottom="1px solid"
              borderColor="neutral-surfaceHighlight"
            >
              <Box flex="1" minWidth="160px">
                <Text fontWeight="bold">{o.sourceText}</Text>
              </Box>
              <Box minWidth="80px">
                <Text color="neutral-textLow">{languageLabel(o.targetLang)}</Text>
              </Box>

              {editingId === o.id ? (
                <>
                  <Box flex="1" minWidth="160px">
                    <Input
                      name={`editOverride-${o.id}`}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                    />
                  </Box>
                  <Button appearance="primary" onClick={() => saveEdit(o.id)}>
                    {t('common.save')}
                  </Button>
                  <Button appearance="neutral" onClick={() => setEditingId(null)}>
                    {t('common.cancel')}
                  </Button>
                </>
              ) : (
                <>
                  <Box flex="1" minWidth="160px">
                    <Text>{o.overrideText}</Text>
                  </Box>
                  <Button appearance="neutral" onClick={() => startEdit(o)}>
                    {t('translations.edit')}
                  </Button>
                  <Button appearance="danger" onClick={() => onDelete(o.id)}>
                    {t('translations.removeOverride')}
                  </Button>
                </>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
