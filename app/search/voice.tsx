import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Input, Screen, Text } from '@/components/primitives';
import { useTheme } from '@/theme';

/**
 * Voice input.
 *
 * Speech-to-text is a device capability, not a NailedIt feature: on a real build
 * the microphone key on the system keyboard dictates straight into this field,
 * which costs nothing, works offline, and supports Hebrew. The transcript then
 * enters the exact same search path as typing — voice is an input method, not
 * a separate feature with its own behaviour.
 */
export default function VoiceSearch() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const [text, setText] = useState('');

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.lg }}>
        <Text variant="title">{t('search.voice')}</Text>
        <Text variant="body" tone="secondary">
          {t('search.placeholder')}
        </Text>
        <Input
          value={text}
          onChangeText={setText}
          autoFocus
          multiline
          placeholder={t('search.placeholder')}
          returnKeyType="search"
        />
        <Button
          label={t('search.title')}
          disabled={text.trim().length === 0}
          onPress={() =>
            router.replace({ pathname: '/search/results', params: { q: text.trim() } })
          }
        />
      </View>
    </Screen>
  );
}
