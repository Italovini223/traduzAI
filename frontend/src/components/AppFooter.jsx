import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Text, Sidebar, Button, Title } from '@nimbus-ds/components';
import TermsPage from '../pages/TermsPage.jsx';
import BrandSymbol from './BrandSymbol.jsx';
import { useNexo } from '../providers/NexoProvider.jsx';

/* eslint-disable no-undef */
const GIT_COMMIT = typeof __GIT_COMMIT__ !== 'undefined' ? __GIT_COMMIT__ : 'dev';

export default function AppFooter() {
  const { t } = useTranslation();
  const { termsData } = useNexo();
  const [termsOpen, setTermsOpen] = useState(false);
  const year = new Date().getFullYear();

  return (
    <>
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        flexWrap="wrap"
        gap="1"
        padding="2"
        borderColor="neutral-surfaceHighlight"
        borderStyle="solid"
        borderWidth="none"
        borderTopWidth="1"
        backgroundColor="neutral-background"
      >
        <BrandSymbol height={16} />
        <Text fontSize="caption" color="neutral-textLow">
          <a
            href="https://nuvempro.com.br"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'inherit', textDecoration: 'none', fontWeight: 600 }}
          >
            Nuvempro
          </a>
          {' '}© {year} · {t('footer.rights')} ·{' '}
          <span
            role="button"
            tabIndex={0}
            onClick={() => setTermsOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setTermsOpen(true);
              }
            }}
            style={{ cursor: 'pointer', textDecoration: 'underline' }}
          >
            {t('footer.terms')}
          </span>
          {' '}· v{GIT_COMMIT}
        </Text>
      </Box>

      <Sidebar open={termsOpen} onRemove={() => setTermsOpen(false)}>
        <TermsPage termsData={termsData} viewOnly />
      </Sidebar>
    </>
  );
}
