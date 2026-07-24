import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useNexo } from './providers/NexoProvider.jsx';
import { useProfile } from './hooks/useProfile.js';
import Layout from './components/Layout.jsx';
import LoadingState from './components/LoadingState.jsx';
import TermsPage from './pages/TermsPage.jsx';
import BillingPage from './pages/BillingPage.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Settings from './pages/Settings.jsx';
import { Box, Alert, Text, Button } from '@nimbus-ds/components';
import { useNavigate } from 'react-router-dom';

/**
 * Banner exibido quando trial_mode=free e o trial ainda está vigente.
 * Mostra o número de dias restantes e um botão para ver os planos.
 */
function TrialBanner({ daysLeft }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Box paddingX="4" paddingTop="4">
      <Alert appearance="warning">
        <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="2">
          <Text>
            {daysLeft === 1
              ? t('trial.bannerFreeOne')
              : t('trial.bannerFree', { days: daysLeft })}
          </Text>
          <Button appearance="transparent" onClick={() => navigate('/billing')}>
            {t('trial.bannerAction')}
          </Button>
        </Box>
      </Alert>
    </Box>
  );
}

export default function App() {
  const { store, billingStatus, termsAccepted, setTermsAccepted, termsData, loading: nexoLoading } = useNexo();
  const { profile, loading: profileLoading, hasProfile, refetch: refetchProfile } = useProfile();

  if (nexoLoading || profileLoading) {
    return <LoadingState />;
  }

  // Gate 1: Terms
  if (termsAccepted === false) {
    return (
      <TermsPage
        termsData={termsData}
        onAccepted={() => setTermsAccepted(true)}
      />
    );
  }

  // Gate 2: Billing
  if (billingStatus && billingStatus.hasAccess === false) {
    return <BillingPage locked />;
  }

  // Gate 3: Onboarding
  if (!hasProfile) {
    return <Onboarding onComplete={refetchProfile} />;
  }

  // Banner de trial gratuito (trial_mode=free, dentro do prazo)
  const trialMode = billingStatus?.trialMode;
  const trialDaysLeft = billingStatus?.trialDaysLeft || 0;
  const showTrialBanner = trialMode === 'free' && trialDaysLeft > 0;

  return (
    <>
      {showTrialBanner && <TrialBanner daysLeft={trialDaysLeft} />}
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="settings" element={<Settings />} />
          {/* Adicione aqui as rotas específicas do seu app */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}
