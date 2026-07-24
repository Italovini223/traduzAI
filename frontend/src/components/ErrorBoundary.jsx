import React from 'react';
import { useTranslation } from 'react-i18next';
import { Box, Text, Title, Button, Alert } from '@nimbus-ds/components';

function ErrorFallback({ error, onReload }) {
  const { t } = useTranslation();
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height="100vh"
      gap="4"
      padding="4"
    >
      <Alert appearance="danger">
        <Title as="h3">{t('app.errorBoundary.title')}</Title>
        <Text>
          {error?.message || t('app.errorBoundary.description')}
        </Text>
      </Alert>
      <Button appearance="primary" onClick={onReload}>
        {t('app.errorBoundary.reload')}
      </Button>
    </Box>
  );
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} onReload={this.handleReload} />;
    }

    return this.props.children;
  }
}
