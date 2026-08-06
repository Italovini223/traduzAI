import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Button, Select, Text, Alert } from '@nimbus-ds/components';

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4MB — margem segura sob o limite de 10mb do backend

const thumbStyle = {
  objectFit: 'cover',
  cursor: 'pointer',
  borderRadius: '4px',
  border: '2px solid transparent',
  display: 'block',
};

export default function BannerOverrides({ overrides, languages, onDetect, onAdd, onDelete }) {
  const { t } = useTranslation();

  const [candidates, setCandidates] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState(null);

  const [selectedOriginal, setSelectedOriginal] = useState(null);
  const [targetLang, setTargetLang] = useState(languages[0]?.code || '');
  const [replacementImage, setReplacementImage] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [saving, setSaving] = useState(false);

  const languageLabel = (code) => languages.find((l) => l.code === code)?.label || code;

  const handleDetect = async () => {
    setDetecting(true);
    setDetectError(null);
    try {
      const images = await onDetect();
      setCandidates(images);
    } catch (err) {
      setDetectError(err.response?.data?.error || err.message);
    } finally {
      setDetecting(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileError(null);
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(t('translations.bannerFileTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setReplacementImage(reader.result);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!selectedOriginal || !targetLang || !replacementImage) return;
    setSaving(true);
    try {
      await onAdd(selectedOriginal, targetLang, replacementImage);
      setSelectedOriginal(null);
      setReplacementImage(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box display="flex" flexDirection="column" gap="4">
      <Box display="flex" flexDirection="column" gap="2">
        <Button appearance="neutral" onClick={handleDetect} disabled={detecting}>
          {detecting ? t('common.loading') : t('translations.detectBanners')}
        </Button>
        {detectError && (
          <Alert appearance="danger">
            <Text>{detectError}</Text>
          </Alert>
        )}

        {candidates && candidates.length === 0 && (
          <Text color="neutral-textLow">{t('translations.noBannersDetected')}</Text>
        )}

        {candidates && candidates.length > 0 && (
          <Box display="flex" gap="2" flexWrap="wrap">
            {candidates.map((url) => (
              <img
                key={url}
                src={url}
                alt=""
                onClick={() => setSelectedOriginal(url)}
                width="100"
                height="70"
                style={{
                  ...thumbStyle,
                  borderColor: selectedOriginal === url ? '#1a73e8' : 'transparent',
                }}
              />
            ))}
          </Box>
        )}
      </Box>

      {selectedOriginal && (
        <Box display="flex" flexDirection="column" gap="3" padding="3" backgroundColor="neutral-surface" borderRadius="4">
          <Text fontWeight="bold">{t('translations.selectedBanner')}</Text>
          <img src={selectedOriginal} alt="" width="200" style={{ objectFit: 'cover', borderRadius: '4px', display: 'block' }} />

          <Box display="flex" gap="3" flexWrap="wrap" alignItems="flex-end">
            <Box display="flex" flexDirection="column" gap="1" minWidth="180px">
              <Text>{t('translations.overrideTargetLang')}</Text>
              <Select name="bannerTargetLang" value={targetLang} onChange={(e) => setTargetLang(e.target.value)}>
                {languages.map((lang) => (
                  <Select.Option key={lang.code} value={lang.code} label={lang.label}>
                    {lang.label}
                  </Select.Option>
                ))}
              </Select>
            </Box>

            <Box display="flex" flexDirection="column" gap="1">
              <Text>{t('translations.replacementImage')}</Text>
              <input type="file" accept="image/*" onChange={handleFileChange} />
            </Box>

            <Button appearance="primary" onClick={handleSave} disabled={saving || !replacementImage}>
              {saving ? t('common.loading') : t('common.save')}
            </Button>
          </Box>
          {fileError && (
            <Alert appearance="danger">
              <Text>{fileError}</Text>
            </Alert>
          )}
          {replacementImage && (
            <img src={replacementImage} alt="" width="200" style={{ objectFit: 'cover', borderRadius: '4px', display: 'block' }} />
          )}
        </Box>
      )}

      {overrides.length === 0 ? (
        <Text color="neutral-textLow">{t('translations.noBannerOverrides')}</Text>
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
              <img src={o.originalImageUrl} alt="" width="70" height="50" style={{ objectFit: 'cover', borderRadius: '4px', display: 'block' }} />
              <Text>→</Text>
              <img src={o.replacementImage} alt="" width="70" height="50" style={{ objectFit: 'cover', borderRadius: '4px', display: 'block' }} />
              <Text color="neutral-textLow">{languageLabel(o.targetLang)}</Text>
              <Box flex="1" />
              <Button appearance="danger" onClick={() => onDelete(o.id)}>
                {t('translations.removeOverride')}
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
