import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Chip, Input, Screen, SegmentedControl, Text } from '@/components/primitives';
import { useLocation } from '@/features/location/useLocation';
import { capture } from '@/lib/analytics';
import { api } from '@/lib/api';
import { DEFAULTS } from '@/lib/config';
import { formatRadius } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * "I need a tool" broadcast.
 *
 * This is the answer to an empty marketplace: it turns unmet demand into a
 * notification for nearby owners, so demand creates supply rather than
 * bouncing off an empty search.
 */
export default function NewToolRequest() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { centre } = useLocation();

  const [text, setText] = useState('');
  const [radiusM, setRadius] = useState(1000);
  const [when, setWhen] = useState<'today' | 'tomorrow' | 'anytime'>('tomorrow');
  const [busy, setBusy] = useState(false);

  async function post() {
    setBusy(true);
    try {
      const from = new Date();
      if (when === 'tomorrow') from.setDate(from.getDate() + 1);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);

      await api.createToolRequest({
        rawText: text.trim(),
        radiusM,
        neededFrom: when === 'anytime' ? null : from.toISOString(),
        neededTo: when === 'anytime' ? null : to.toISOString(),
        centre,
      });
      capture('tool_request_created', { radius_m: radiusM });
      router.replace('/(tabs)');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.xl }}>
        <Text variant="title">{t('request.needTitle')}</Text>

        <Input
          value={text}
          onChangeText={setText}
          placeholder={t('request.needPlaceholder')}
          multiline
          autoFocus
          maxLength={300}
        />

        <SegmentedControl
          segments={[
            { value: 'today', label: t('request.today') },
            { value: 'tomorrow', label: t('request.tomorrow') },
            { value: 'anytime', label: t('listing.askMe') },
          ]}
          value={when}
          onChange={setWhen}
        />

        <View style={{ gap: spacing.sm }}>
          <Text variant="label" tone="muted" uppercase>
            {t('request.needRadius')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {DEFAULTS.radiusOptions.map((option) => (
              <Chip
                key={option}
                label={formatRadius(option, t)}
                selected={radiusM === option}
                onPress={() => setRadius(option)}
              />
            ))}
          </View>
        </View>

        <Button
          size="large"
          label={t('request.postRequest')}
          disabled={text.trim().length < 2}
          loading={busy}
          onPress={post}
        />
      </View>
    </Screen>
  );
}
