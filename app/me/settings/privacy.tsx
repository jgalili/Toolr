import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/primitives';
import { useLocation } from '@/features/location/useLocation';
import { useTheme } from '@/theme';

export default function PrivacySettings() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const { status } = useLocation();

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.lg }}>
        <Text variant="title">{t('settings.privacy')}</Text>

        <Card>
          <View style={{ gap: spacing.sm }}>
            <Text variant="bodyStrong">{t('settings.locationPrecision')}</Text>
            <Text variant="body" tone="secondary">
              {t('settings.locationApprox')}
            </Text>
            <Text variant="caption" tone="muted">
              {t('listing.locationPrivacyNote')}
            </Text>
            <Text variant="caption" tone="muted">
              {status === 'granted' ? '' : t('errors.locationDeniedBody')}
            </Text>
          </View>
        </Card>

        <Button label={t('settings.exportData')} variant="secondary" onPress={() => undefined} />
        <Button label={t('settings.forgetDevice')} variant="ghost" onPress={() => undefined} />
      </View>
    </Screen>
  );
}
