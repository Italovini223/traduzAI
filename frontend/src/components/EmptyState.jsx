import React from 'react';
import { Box, Text, Title, Button } from '@nimbus-ds/components';

export default function EmptyState({ title, description, actionLabel, onAction }) {
  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      padding="8"
      gap="4"
    >
      {/* Illustration placeholder */}
      <Box
        width="120px"
        height="120px"
        borderRadius="full"
        backgroundColor="neutral-surface"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Text fontSize="highlight" color="neutral-textDisabled">---</Text>
      </Box>

      {title && <Title as="h3" textAlign="center">{title}</Title>}
      {description && <Text textAlign="center" color="neutral-textLow">{description}</Text>}
      {actionLabel && onAction && (
        <Button appearance="primary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
