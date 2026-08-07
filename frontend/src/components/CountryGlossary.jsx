import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Input, Select, Text } from '@nimbus-ds/components';

export default function CountryGlossary({ terms, countries, onAdd, onUpdate, onDelete }) {
  const { t } = useTranslation();

  const [country, setCountry] = useState(countries[0]?.code || '');
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  const countryLabel = (code) => countries.find((c) => c.code === code)?.name || code;

  const handleAdd = async () => {
    if (!country || !findText.trim() || !replaceText.trim()) return;
    setSaving(true);
    try {
      await onAdd(country, findText.trim(), replaceText.trim());
      setFindText('');
      setReplaceText('');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (term) => {
    setEditingId(term.id);
    setEditingText(term.replaceText);
  };

  const saveEdit = async (id) => {
    if (!editingText.trim()) return;
    await onUpdate(id, editingText.trim());
    setEditingId(null);
  };

  return (
    <Box display="flex" flexDirection="column" gap="4">
      <Box display="flex" gap="3" flexWrap="wrap" alignItems="flex-end">
        <Box display="flex" flexDirection="column" gap="1" minWidth="160px">
          <Text>{t('translations.glossaryCountry')}</Text>
          <Select name="glossaryCountry" value={country} disabled={countries.length === 0} onChange={(e) => setCountry(e.target.value)}>
            {countries.map((c) => (
              <Select.Option key={c.code} value={c.code} label={c.name}>
                {c.name}
              </Select.Option>
            ))}
          </Select>
        </Box>
        <Box display="flex" flexDirection="column" gap="1" minWidth="180px" flex="1">
          <Text>{t('translations.glossaryFindText')}</Text>
          <Input
            name="glossaryFindText"
            placeholder={t('translations.glossaryFindPlaceholder')}
            value={findText}
            onChange={(e) => setFindText(e.target.value)}
          />
        </Box>
        <Box display="flex" flexDirection="column" gap="1" minWidth="180px" flex="1">
          <Text>{t('translations.glossaryReplaceText')}</Text>
          <Input
            name="glossaryReplaceText"
            placeholder={t('translations.glossaryReplacePlaceholder')}
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
          />
        </Box>
        <Button appearance="primary" onClick={handleAdd} disabled={saving || countries.length === 0}>
          {saving ? t('common.loading') : t('common.save')}
        </Button>
      </Box>

      {countries.length === 0 && (
        <Text color="neutral-textLow">{t('translations.glossaryNoRules')}</Text>
      )}

      {terms.length === 0 ? (
        <Text color="neutral-textLow">{t('translations.noGlossaryTerms')}</Text>
      ) : (
        <Box display="flex" flexDirection="column" gap="2">
          {terms.map((term) => (
            <Box
              key={term.id}
              display="flex"
              gap="3"
              alignItems="center"
              flexWrap="wrap"
              padding="2"
              borderBottom="1px solid"
              borderColor="neutral-surfaceHighlight"
            >
              <Box minWidth="70px">
                <Text color="neutral-textLow">{countryLabel(term.country)}</Text>
              </Box>
              <Box minWidth="120px">
                <Text fontWeight="bold">{term.findText}</Text>
              </Box>
              <Text>→</Text>

              {editingId === term.id ? (
                <>
                  <Box flex="1" minWidth="140px">
                    <Input name={`editGlossary-${term.id}`} value={editingText} onChange={(e) => setEditingText(e.target.value)} />
                  </Box>
                  <Button appearance="primary" onClick={() => saveEdit(term.id)}>
                    {t('common.save')}
                  </Button>
                  <Button appearance="neutral" onClick={() => setEditingId(null)}>
                    {t('common.cancel')}
                  </Button>
                </>
              ) : (
                <>
                  <Box flex="1" minWidth="140px">
                    <Text>{term.replaceText}</Text>
                  </Box>
                  <Button appearance="neutral" onClick={() => startEdit(term)}>
                    {t('translations.edit')}
                  </Button>
                  <Button appearance="danger" onClick={() => onDelete(term.id)}>
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
