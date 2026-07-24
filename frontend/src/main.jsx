import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@nimbus-ds/styles/dist/index.css';
import './index.css';
import './i18n/index.js';
import App from './App.jsx';
import NexoProvider from './providers/NexoProvider.jsx';
import InstallSuccess from './pages/InstallSuccess.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

function Root() {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;

  // Auth callback: backend redirected here with ?token=JWT after OAuth install
  // Also handle legacy ?session_token= format
  const callbackToken = params.get('token') || params.get('session_token');
  if (path === '/auth/callback' && callbackToken) {
    return (
      <ErrorBoundary>
        <InstallSuccess token={callbackToken} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <NexoProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </NexoProvider>
    </ErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
