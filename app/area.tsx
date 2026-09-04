import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/primitives';
import { MANUAL_AREAS, useLocation } from '@/features/location/useLocation';
import { useTheme } from '@/theme';

/**
 * The manual area picker.
 *
 * Location denial is never a dead end. Everything in the app keeps working
 * from a neighbourhood centroid, which is also a perfectly reasonable privacy
 * choice — some people would rather tell us "Florentin" than "here".
 */
export default function AreaPicker() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { setManualArea, request, status, loading } = useLocation();

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.lg }}>
        <Text variant="title">{t('home.setArea')}</Text>

        {status !== 'granted' ? (
          <>
            <Text variant="body" tone="secondary">
              {t('onboarding.locationBody')}
            </Text>
            <Button
              label={loading ? t('common.loading') : t('onboarding.enableLocation')}
              onPress={async () => {
                const result = await request();
                if (result === 'granted') router.back();
              }}
            />
          </>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          {MANUAL_AREAS.map((area) => (
            <Card
              key={area.label}
              onPress={() => {
                setManualArea(area.coords, area.label);
                router.back();
              }}
              accessibilityLabel={area.label}
            >
              <Text variant="bodyLarge">{area.label}</Text>
            </Card>
          ))}
        </View>
      </View>
    </Screen>
  );
}
