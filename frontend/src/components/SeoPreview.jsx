import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Text, Button, Spinner, Alert } from '@nimbus-ds/components';
import api from '../services/api.js';

export default function SeoPreview({ languages, countries, onCorrect }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/api/translations/seo-preview');
        if (!cancelled) setData(res.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const languageLabel = (code) => languages.find((l) => l.code === code)?.label || code;
  const countryLabel = (code) => countries.find((c) => c.code === code)?.label || code;

  if (loading) return <Spinner />;
  if (error) return <Alert appearance="danger"><Text>{error}</Text></Alert>;
  if (!data?.previews?.length) {
    return <Text color="neutral-textLow">{t('translations.seoPreviewEmpty')}</Text>;
  }

  return (
    <Box display="flex" flexDirection="column" gap="3">
      {data.previews.map((p) => (
        <Box
          key={p.country}
          display="flex"
          flexDirection="column"
          gap="2"
          padding="3"
          style={{ border: '1px solid #e5e7eb', borderRadius: '8px' }}
        >
          <Text fontWeight="bold" fontSize="caption" color="neutral-textLow">
            {countryLabel(p.country)} — {languageLabel(p.language)}
          </Text>

          {p.title && (
            <Box display="flex" gap="2" alignItems="flex-start" flexWrap="wrap">
              <Text style={{ color: '#1a0dab', fontSize: '16px', flex: 1, minWidth: '200px' }}>{p.title}</Text>
              <Button
                appearance="neutral"
                size="small"
                onClick={() => onCorrect(data.source.title, p.language, p.title)}
              >
                {t('translations.seoPreviewFix')}
              </Button>
            </Box>
          )}

          {p.metaDescription && (
            <Box display="flex" gap="2" alignItems="flex-start" flexWrap="wrap">
              <Text fontSize="caption" color="neutral-textLow" style={{ flex: 1, minWidth: '200px' }}>
                {p.metaDescription}
              </Text>
              <Button
                appearance="neutral"
                size="small"
                onClick={() => onCorrect(data.source.metaDescription, p.language, p.metaDescription)}
              >
                {t('translations.seoPreviewFix')}
              </Button>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
