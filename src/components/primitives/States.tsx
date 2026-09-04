import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';

type Action = { label: string; onPress: () => void };

type Props = {
  title: string;
  body?: string;
  primaryAction?: Action;
  secondaryAction?: Action;
  icon?: React.ReactNode;
  testID?: string;
};

/**
 * Every list in the app has one of these. In a marketplace this thin, the empty
 * state is not a fallback — it is the growth mechanism, because it turns unmet
 * demand into a broadcast that creates supply.
 */
export function EmptyState({ title, body, primaryAction, secondaryAction, icon, testID }: Props) {
  const { spacing } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        alignItems: 'center',
        paddingVertical: spacing.huge,
        paddingHorizontal: spacing.lg,
        gap: spacing.md,
      }}
    >
      {icon}
      <Text variant="heading" center>
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="secondary" center style={{ maxWidth: 320 }}>
          {body}
        </Text>
      ) : null}
      <View style={{ alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.sm, maxWidth: 360 }}>
        {primaryAction ? <Button label={primaryAction.label} onPress={primaryAction.onPress} /> : null}
        {secondaryAction ? (
          <Button label={secondaryAction.label} onPress={secondaryAction.onPress} variant="ghost" />
        ) : null}
      </View>
    </View>
  );
}

/**
 * One error component for the whole app. Human sentences, always a retry, and
 * never a raw error code in front of a user — the code goes to Sentry.
 */
export function ErrorState({
  title,
  body,
  onRetry,
  retryLabel,
  testID,
}: {
  title: string;
  body?: string;
  onRetry?: () => void;
  retryLabel: string;
  testID?: string;
}) {
  return (
    <EmptyState
      testID={testID}
      title={title}
      body={body}
      primaryAction={onRetry ? { label: retryLabel, onPress: onRetry } : undefined}
    />
  );
}
