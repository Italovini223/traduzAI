import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Button, Text, Title, Input, Select, Alert } from '@nimbus-ds/components';
import api from '../services/api.js';

const TOTAL_STEPS = 3;

export default function Onboarding({ onComplete }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    niche: '',
    audience: '',
    tone: 'professional',
    frequency: 'weekly',
    articleLength: 'medium',
    keywords: '',
    extras: '',
  });

  const update = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFinish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/profile', form);
      if (onComplete) onComplete();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderStep1 = () => (
    <Box display="flex" flexDirection="column" gap="4">
      <Title as="h4">{t('onboarding.steps.s1')}</Title>
      <Box display="flex" flexDirection="column" gap="1">
        <Text>{t('onboarding.fields.niche')}</Text>
        <Input
          name="niche"
          placeholder={t('onboarding.fields.nichePlaceholder')}
          value={form.niche}
          onChange={(e) => update('niche', e.target.value)}
        />
      </Box>
      <Box display="flex" flexDirection="column" gap="1">
        <Text>{t('onboarding.fields.audience')}</Text>
        <Input
          name="audience"
          placeholder={t('onboarding.fields.audiencePlaceholder')}
          value={form.audience}
          onChange={(e) => update('audience', e.target.value)}
        />
      </Box>
    </Box>
  );

  const renderStep2 = () => (
    <Box display="flex" flexDirection="column" gap="4">
      <Title as="h4">{t('onboarding.steps.s2')}</Title>
      <Box display="flex" flexDirection="column" gap="1">
        <Text>{t('onboarding.fields.tone')}</Text>
        <Select
          name="tone"
          id="tone"
          value={form.tone}
          onChange={(e) => update('tone', e.target.value)}
        >
          {['professional', 'casual', 'friendly', 'formal'].map((opt) => (
            <Select.Option key={opt} value={opt} label={t(`onboarding.fields.toneOptions.${opt}`)}>
              {t(`onboarding.fields.toneOptions.${opt}`)}
            </Select.Option>
          ))}
        </Select>
      </Box>
      <Box display="flex" flexDirection="column" gap="1">
        <Text>{t('onboarding.fields.frequency')}</Text>
        <Select
          name="frequency"
          id="frequency"
          value={form.frequency}
          onChange={(e) => update('frequency', e.target.value)}
        >
          {['daily', 'weekly', 'biweekly', 'monthly'].map((opt) => (
            <Select.Option key={opt} value={opt} label={t(`onboarding.fields.frequencyOptions.${opt}`)}>
              {t(`onboarding.fields.frequencyOptions.${opt}`)}
            </Select.Option>
          ))}
        </Select>
      </Box>
      <Box display="flex" flexDirection="column" gap="1">
        <Text>{t('onboarding.fields.articleLength')}</Text>
        <Select
          name="articleLength"
          id="articleLength"
          value={form.articleLength}
          onChange={(e) => update('articleLength', e.target.value)}
        >
          {['short', 'medium', 'long'].map((opt) => (
            <Select.Option key={opt} value={opt} label={t(`onboarding.fields.articleLengthOptions.${opt}`)}>
              {t(`onboarding.fields.articleLengthOptions.${opt}`)}
            </Select.Option>
          ))}
        </Select>
      </Box>
    </Box>
  );

  const renderStep3 = () => (
    <Box display="flex" flexDirection="column" gap="4">
      <Title as="h4">{t('onboarding.steps.s3')}</Title>
      <Box display="flex" flexDirection="column" gap="1">
        <Text>{t('onboarding.fields.keywords')}</Text>
        <Input
          name="keywords"
          placeholder={t('onboarding.fields.keywordsPlaceholder')}
          value={form.keywords}
          onChange={(e) => update('keywords', e.target.value)}
        />
      </Box>
      <Box display="flex" flexDirection="column" gap="1">
        <Text>{t('onboarding.fields.extras')}</Text>
        <Input
          name="extras"
          placeholder={t('onboarding.fields.extrasPlaceholder')}
          value={form.extras}
          onChange={(e) => update('extras', e.target.value)}
        />
      </Box>
    </Box>
  );

  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      padding="4"
    >
      <Box maxWidth="560px" width="100%">
        <Card>
          <Card.Header>
            <Title as="h2">{t('onboarding.title')}</Title>
            <Text color="neutral-textLow">
              {step} / {TOTAL_STEPS}
            </Text>
          </Card.Header>
          <Card.Body>
            <Box display="flex" flexDirection="column" gap="4">
              {step === 1 && renderStep1()}
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}

              {error && (
                <Alert appearance="danger">
                  <Text>{error}</Text>
                </Alert>
              )}

              <Box display="flex" justifyContent="space-between" gap="2">
                {step > 1 ? (
                  <Button appearance="neutral" onClick={() => setStep(step - 1)}>
                    {t('onboarding.back')}
                  </Button>
                ) : (
                  <Box />
                )}

                {step < TOTAL_STEPS ? (
                  <Button appearance="primary" onClick={() => setStep(step + 1)}>
                    {t('onboarding.next')}
                  </Button>
                ) : (
                  <Button
                    appearance="primary"
                    onClick={handleFinish}
                    disabled={submitting}
                  >
                    {submitting ? t('common.loading') : t('onboarding.finish')}
                  </Button>
                )}
              </Box>
            </Box>
          </Card.Body>
        </Card>
      </Box>
    </Box>
  );
}
