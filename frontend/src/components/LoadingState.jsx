import React from 'react';
import { Box, Spinner, Text } from '@nimbus-ds/components';

export default function LoadingState({ message }) {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height="100vh"
      gap="4"
    >
      <Spinner size="large" />
      {message && <Text>{message}</Text>}
    </Box>
  );
}
