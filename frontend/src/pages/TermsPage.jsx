import React, { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Button, Text, Title, Alert } from '@nimbus-ds/components';
import DOMPurify from 'dompurify';
import api from '../services/api.js';

/**
 * TermsPage — exibe os termos de uso e solicita aceite antes de liberar o app.
 *
 * Props:
 *   termsData   — objeto retornado por GET /api/terms/status: { id, version, title, content, publishedAt }
 *   onAccepted  — callback chamado após aceite bem-sucedido
 *   viewOnly    — se true, oculta o botão de aceite (ex: visualização nas configurações)
 */
export default function TermsPage({ termsData, onAccepted, viewOnly = false }) {
  const { t } = useTranslation();
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 20;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
    if (atBottom) {
      setScrolledToBottom(true);
    }
  }, []);

  const handleAccept = async () => {
    if (!termsData?.id) {
      setError(t('terms.error'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/api/terms/accept', { termsVersionId: termsData.id });
      if (onAccepted) onAccepted();
    } catch {
      setError(t('terms.error'));
    } finally {
      setSubmitting(false);
    }
  };

  // Se há conteúdo no banco, renderiza direto (plain text ou HTML sanitizado)
  const hasDbContent = termsData?.content;
  const sanitizedContent = hasDbContent
    ? DOMPurify.sanitize(termsData.content)
    : null;

  // Fallback: seções estáticas do i18n
  const i18nSections = ['s1', 's2', 's3', 's4', 's5', 's6'];

  const displayTitle = termsData?.title || t('terms.title');

  const content = (
    <Box display="flex" flexDirection="column" gap="4">
      <Box display="flex" flexDirection="column" gap="1">
        <Title as="h2">{displayTitle}</Title>
        {termsData?.version && (
          <Text fontSize="caption" color="neutral-textLow">
            {`v${termsData.version}`}
          </Text>
        )}
      </Box>

      {!viewOnly && !scrolledToBottom && (
        <Alert appearance="primary">
          <Text>{t('terms.scrollHint')}</Text>
        </Alert>
      )}

      <Box
        ref={scrollRef}
        onScroll={handleScroll}
        overflow="auto"
        maxHeight={viewOnly ? '100%' : '400px'}
        padding="4"
        borderColor="neutral-surfaceHighlight"
        borderStyle="solid"
        borderWidth="1"
        borderRadius="2"
      >
        {hasDbContent ? (
          /* Conteúdo do banco — suporta plain text e HTML sanitizado */
          sanitizedContent.includes('<') ? (
            <div
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
              style={{ fontSize: '14px', lineHeight: '1.6' }}
            />
          ) : (
            <Text style={{ whiteSpace: 'pre-wrap' }}>
              {termsData.content}
            </Text>
          )
        ) : (
          /* Fallback: seções estáticas do i18n */
          i18nSections.map((key) => (
            <Box key={key} marginBottom="4">
              <Title as="h4">{t(`terms.sections.${key}.title`)}</Title>
              <Text>{t(`terms.sections.${key}.body`)}</Text>
            </Box>
          ))
        )}
      </Box>

      {!viewOnly && error && (
        <Alert appearance="danger">
          <Text>{error}</Text>
        </Alert>
      )}

      {!viewOnly && (
        <Button
          appearance="primary"
          onClick={handleAccept}
          disabled={!scrolledToBottom || submitting}
        >
          {submitting ? t('common.loading') : t('terms.accept')}
        </Button>
      )}
    </Box>
  );

  // viewOnly: renderiza direto, sem wrapper de página cheia (ex: dentro de Sidebar)
  if (viewOnly) {
    return <Box padding="4">{content}</Box>;
  }

  // Modo gate: centralizado em tela cheia
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      padding="4"
    >
      <Box maxWidth="640px" width="100%">
        <Card>
          <Card.Body>{content}</Card.Body>
        </Card>
      </Box>
    </Box>
  );
}
