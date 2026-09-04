import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Screen, Text } from '@/components/primitives';
import { ToolIllustration } from '@/components/domain/ToolIllustration';
import { useTheme } from '@/theme';
import type { CategorySlug } from '@/types/domain';

type Props = {
  step: 1 | 2 | 3;
  title: string;
  body: string;
  illustration: CategorySlug;
  primary: { label: string; onPress: () => void };
  secondary?: { label: string; onPress: () => void };
  onSkip?: () => void;
};

export function OnboardingScreen({
  step,
  title,
  body,
  illustration,
  primary,
  secondary,
  onSkip,
}: Props) {
  const { t } = useTranslation();
  const { spacing, colors, radius } = useTheme();

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'space-between', paddingTop: spacing.huge }}>
        <View style={{ alignItems: 'flex-end' }}>
          {onSkip ? <Button label={t('common.skip')} variant="ghost" fullWidth={false} onPress={onSkip} /> : null}
        </View>

        <View style={{ gap: spacing.xxl, alignItems: 'center' }}>
          <View
            style={{
              width: 200,
              height: 200,
              borderRadius: radius.xl,
              overflow: 'hidden',
            }}
          >
            <ToolIllustration category={illustration} size={200} />
          </View>
          <View style={{ gap: spacing.md }}>
            <Text variant="display" center>
              {title}
            </Text>
            <Text variant="bodyLarge" tone="secondary" center>
              {body}
            </Text>
          </View>
        </View>

        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
            {[1, 2, 3].map((n) => (
              <View
                key={n}
                style={{
                  width: n === step ? 22 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: n === step ? colors.accent : colors.border,
                }}
              />
            ))}
          </View>
          <Button label={primary.label} onPress={primary.onPress} size="large" />
          {secondary ? (
            <Button label={secondary.label} variant="ghost" onPress={secondary.onPress} />
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
