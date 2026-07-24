import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Text, Spinner } from '@nimbus-ds/components';

/**
 * InstallSuccess — shown when the OAuth callback lands on /auth/callback?token=...
 *
 * This page is rendered OUTSIDE of NexoProvider (in main.jsx Root) so it never
 * triggers the "must be accessed from Nuvemshop panel" error.
 *
 * Flow:
 * 1. Backend /auth/callback exchanges OAuth code, creates store, redirects to
 *    Nuvemshop admin (primary flow).
 * 2. If for any reason the user lands here (fallback), we decode the JWT to get
 *    nuvemshopId, then redirect to the correct Nuvemshop admin URL.
 */
export default function InstallSuccess({ token }) {
  const { t } = useTranslation();
  const [countdown, setCountdown] = useState(3);
  const [adminUrl, setAdminUrl] = useState(null);

  useEffect(() => {
    let targetUrl = 'https://www.nuvemshop.com.br/admin';

    // Decode JWT payload (no verification needed — we just need the nuvemshopId)
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.nuvemshopId) {
          targetUrl = `https://www.nuvemshop.com.br/admin/${payload.nuvemshopId}`;
        }
      } catch {
        // If decode fails, fall back to generic admin URL
      }
    }

    setAdminUrl(targetUrl);

    // Countdown and auto-redirect
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          window.location.href = targetUrl;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [token]);

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height="100vh"
      gap="6"
      padding="8"
    >
      {countdown > 0 ? (
        <>
          <Spinner size="large" />
          <Text fontSize="highlight" fontWeight="bold" color="success-textLow" textAlign="center">
            {t('install.success', 'Instalação concluída com sucesso!')}
          </Text>
          <Text color="neutral-textLow" textAlign="center">
            {t('install.redirecting', 'Redirecionando para o painel da Nuvemshop em')}
            {' '}{countdown}s...
          </Text>
          {adminUrl && (
            <a
              href={adminUrl}
              style={{ color: '#0070F3', textDecoration: 'underline', fontSize: '14px' }}
            >
              {t('install.clickHere', 'Clique aqui se não for redirecionado automaticamente')}
            </a>
          )}
        </>
      ) : (
        <Spinner size="large" />
      )}
    </Box>
  );
}
