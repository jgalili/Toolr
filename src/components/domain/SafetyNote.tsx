import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Text } from '@/components/primitives';
import { useTheme } from '@/theme';
import type { RiskLevel } from '@/types/domain';

/**
 * One line, only where it is earned.
 *
 * A hammer gets nothing. A circular saw gets a sentence. Warning every listing
 * trains people to ignore the warnings that matter.
 */
export function SafetyNote({ risk }: { risk: RiskLevel }) {
  const { t } = useTranslation();
  const { colors, radius, spacing } = useTheme();

  if (risk === 'low') return null;

  const high = risk === 'high';
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        padding: spacing.lg,
        borderRadius: radius.md,
        backgroundColor: high ? colors.dangerSoft : colors.warningSoft,
      }}
    >
      <View
        style={{
          width: 3,
          borderRadius: 2,
          backgroundColor: high ? colors.danger : colors.warning,
        }}
      />
      <Text variant="caption" tone={high ? 'danger' : 'warning'} style={{ flex: 1 }}>
        {t(`safety.${risk}`)}
      </Text>
    </View>
  );
}
