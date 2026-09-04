import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Card, Screen, Text } from '@/components/primitives';
import { currentLocale, setLocale, type Locale } from '@/i18n';
import { useTheme } from '@/theme';

const OPTIONS: { locale: Locale; label: string }[] = [
  { locale: 'en', label: 'English' },
  { locale: 'he', label: 'עברית' },
];

/**
 * Switching between English and Hebrew flips the whole layout direction,
 * which React Native can only do properly after a restart. We say so before
 * it happens rather than letting the app appear to break.
 */
export default function LanguageSettings() {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [needsRestart, setNeedsRestart] = useState(false);
  const active = currentLocale();

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.lg }}>
        <Text variant="title">{t('settings.language')}</Text>

        <View style={{ gap: spacing.sm }}>
          {OPTIONS.map((option) => (
            <Card
              key={option.locale}
              onPress={async () => {
                const result = await setLocale(option.locale);
                setNeedsRestart(result.needsRestart);
              }}
              accessibilityLabel={option.label}
            >
              <Text variant="bodyLarge" tone={active === option.locale ? 'accent' : 'default'}>
                {active === option.locale ? '● ' : '○ '}
                {option.label}
              </Text>
            </Card>
          ))}
        </View>

        {needsRestart ? (
          <>
            <Text variant="body" tone="warning">
              {t('settings.languageRestart')}
            </Text>
            <Button label={t('common.done')} variant="secondary" onPress={() => setNeedsRestart(false)} />
          </>
        ) : (
          <Text variant="caption" tone="muted">
            {t('settings.languageRestart')}
          </Text>
        )}
      </View>
    </Screen>
  );
}
