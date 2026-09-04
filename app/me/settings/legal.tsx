import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Card, Screen, Text } from '@/components/primitives';
import { useTheme } from '@/theme';

/**
 * Placeholder links, deliberately labelled as such.
 *
 * The Terms and Privacy Policy need a lawyer before public launch — the
 * liability position on lending power tools to strangers is not something to
 * improvise from a template.
 */
export default function LegalSettings() {
  const { t } = useTranslation();
  const { spacing } = useTheme();

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.lg }}>
        <Text variant="title">{t('settings.legal')}</Text>

        {[t('settings.terms'), t('settings.privacyPolicy'), t('settings.safety')].map((label) => (
          <Card key={label}>
            <View style={{ gap: spacing.xs }}>
              <Text variant="bodyLarge">{label}</Text>
              <Text variant="caption" tone="warning">
                Not written yet — required before public launch.
              </Text>
            </View>
          </Card>
        ))}
      </View>
    </Screen>
  );
}
