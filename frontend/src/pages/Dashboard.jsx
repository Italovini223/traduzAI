import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Card, Text, Title } from '@nimbus-ds/components';
import { useNexo } from '../providers/NexoProvider.jsx';

export default function Dashboard() {
  const { t } = useTranslation();
  const { store } = useNexo();

  return (
    <Box display="flex" flexDirection="column" gap="4">
      <Title as="h2">{t('dashboard.title')}</Title>

      <Card>
        <Card.Body>
          <Box display="flex" flexDirection="column" gap="2">
            <Text fontSize="highlight">{t('dashboard.welcome')}</Text>
            {store && (
              <Box display="flex" flexDirection="column" gap="1">
                <Text color="neutral-textLow">
                  {store.name || 'Store'} (ID: {store.id || store.storeId || '---'})
                </Text>
              </Box>
            )}
          </Box>
        </Card.Body>
      </Card>

      {/* Placeholder for app-specific dashboard content */}
      <Card>
        <Card.Body>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="center"
            padding="8"
            borderColor="neutral-surfaceHighlight"
            borderStyle="dashed"
            borderWidth="1"
            borderRadius="2"
          >
            <Text color="neutral-textDisabled">{t('dashboard.contentPlaceholder')}</Text>
          </Box>
        </Card.Body>
      </Card>
    </Box>
  );
}
