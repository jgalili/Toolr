import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ToolIllustration } from '@/components/domain/ToolIllustration';
import { Button, Screen, Text } from '@/components/primitives';
import { useTheme } from '@/theme';

export default function Success() {
  const { id, title } = useLocalSearchParams<{ id?: string; title?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, radius } = useTheme();

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.xl }}>
        <View style={{ width: 160, height: 160, borderRadius: radius.xl, overflow: 'hidden' }}>
          <ToolIllustration category="power-tools" size={160} />
        </View>

        <Text variant="display" center>
          {t('listing.listed', { tool: title ?? '' })}
        </Text>

        <View style={{ alignSelf: 'stretch', gap: spacing.md }}>
          <Button
            size="large"
            label={t('listing.viewListing')}
            onPress={() => router.replace(id ? `/tool/${id}` : '/(tabs)')}
          />
          <Button
            label={t('listing.addAnother')}
            variant="secondary"
            onPress={() => router.replace('/list/camera')}
          />
          <Button label={t('common.done')} variant="ghost" onPress={() => router.replace('/(tabs)')} />
        </View>
      </View>
    </Screen>
  );
}
