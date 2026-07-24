import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import nexo, { connect as nexoConnect, iAmReady, getSessionToken as nexoGetSessionToken } from '@tiendanube/nexo';
import { useTranslation } from 'react-i18next';
import api, { setSessionToken, setTokenRefresher, setOnUnauthorized } from '../services/api.js';
import LoadingState from '../components/LoadingState.jsx';
import { Box, Text, Alert } from '@nimbus-ds/components';

const NexoContext = createContext(null);

export function useNexo() {
  const ctx = useContext(NexoContext);
  if (!ctx) throw new Error('useNexo must be used within NexoProvider');
  return ctx;
}

function isInsideIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function isNuvemshopReferrer() {
  try {
    const ref = document.referrer.toLowerCase();
    return (
      ref.includes('nuvemshop') ||
      ref.includes('tiendanube') ||
      ref.includes('lojavirtualnuvem.com.br') ||
      ref.includes('mitiendanube.com') ||
      ref.includes('mynuvemshop.com')
    );
  } catch {
    return false;
  }
}

export default function NexoProvider({ children }) {
  const { t } = useTranslation();
  const [store, setStore] = useState(null);
  const [billingStatus, setBillingStatus] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(null);
  const [termsData, setTermsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const refreshInterval = useRef(null);
  const nexoInstanceRef = useRef(null);

  const isEmbedded = isInsideIframe() && isNuvemshopReferrer();
  const isDevLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  const loadStatus = useCallback(async () => {
    try {
      const [billingRes, termsRes] = await Promise.all([
        api.get('/api/billing/status'),
        api.get('/api/terms/status'),
      ]);
      if (billingRes.data) setBillingStatus(billingRes.data);
      if (termsRes.data) {
        setTermsAccepted(termsRes.data.accepted);
        setTermsData(termsRes.data.terms || null);
      }
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  }, []);

  const refreshToken = useCallback(async (nexoInstance) => {
    try {
      const token = await nexoGetSessionToken(nexoInstance);
      setSessionToken(token);
      return token;
    } catch (err) {
      console.error('Token refresh failed:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Direct access blocking: not embedded and not dev
        if (!isEmbedded && !isDevLocal) {
          setError('direct_access');
          setLoading(false);
          return;
        }

        let token = null;

        if (isDevLocal && !isEmbedded) {
          // Dev token flow
          const res = await api.post('/auth/dev-token', {});
          token = res.data.token;
          setSessionToken(token);
          if (res.data.store) setStore(res.data.store);
        } else {
          // Nexo SDK flow
          const nexoInstance = nexo.create({
            clientId: import.meta.env.VITE_NUVEMSHOP_APP_ID || '00000',
          });

          await nexoConnect(nexoInstance);
          token = await nexoGetSessionToken(nexoInstance);
          setSessionToken(token);
          nexoInstanceRef.current = nexoInstance;

          // Set up token refresher for 401 retry
          setTokenRefresher(() => refreshToken(nexoInstance));

          // Proactive token refresh every 20 minutes
          refreshInterval.current = setInterval(() => {
            refreshToken(nexoInstance);
          }, 20 * 60 * 1000);
        }

        // Verify token and get store info
        if (token) {
          try {
            const verifyRes = await api.get('/auth/verify-token');
            if (!cancelled && verifyRes.data) {
              setStore(verifyRes.data.store || verifyRes.data);
            }
          } catch (err) {
            console.warn('Could not verify token:', err);
          }
        }

        if (!cancelled) {
          await loadStatus();
          // Signal Nuvemshop that the app is fully ready (triggers iframe resize)
          if (nexoInstanceRef.current) iAmReady(nexoInstanceRef.current);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('NexoProvider init error:', err);
          setError(err.message || 'init_failed');
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, [isEmbedded, isDevLocal, loadStatus, refreshToken]);

  // Set up unauthorized handler
  useEffect(() => {
    setOnUnauthorized(() => {
      setError('unauthorized');
    });
  }, []);

  if (error === 'direct_access') {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100vh">
        <Alert appearance="warning">
          <Text>{t('app.directAccess')}</Text>
        </Alert>
      </Box>
    );
  }

  if (error) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100vh">
        <Alert appearance="danger">
          <Text>{t('app.error')}: {error}</Text>
        </Alert>
      </Box>
    );
  }

  if (loading) {
    return <LoadingState message={t('app.loading')} />;
  }

  return (
    <NexoContext.Provider value={{
      store,
      billingStatus,
      setBillingStatus,
      refreshStatus: loadStatus,    // recarrega billing + terms do backend
      termsAccepted,
      setTermsAccepted,
      termsData,
      loading,
      error,
    }}>
      {children}
    </NexoContext.Provider>
  );
}
