import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Screen, Text } from '@/components/primitives';
import { useListingDraft } from '@/features/listing/draft';
import { prepareForIdentification } from '@/features/listing/prepareImage';
import { capture } from '@/lib/analytics';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';

/**
 * The AI working state.
 *
 * Two rules: it is always cancellable, and it always ends somewhere useful.
 * Whatever happens — success, low confidence, timeout, quota, no network — the
 * person lands on a screen where they can finish the listing.
 */
export default function Identifying() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, radius, colors } = useTheme();
  const { draft, applyIdentification } = useListingDraft();
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;

    async function run() {
      if (!draft.photoUri) {
        router.replace('/list/manual');
        return;
      }

      const small = await prepareForIdentification(draft.photoUri);
      const outcome = await api.identifyTool(small);
      if (cancelled.current) return;

      if (!outcome.ok) {
        capture('ai_identification_failed', { code: outcome.code });
        router.replace({ pathname: '/list/manual', params: { reason: outcome.code } });
        return;
      }

      capture('ai_tool_identified', {
        tier: outcome.tier,
        has_model: outcome.identification.model != null,
      });

      if (outcome.tier === 'low' || !outcome.identification.tool_type) {
        router.replace({ pathname: '/list/manual', params: { reason: 'low_confidence' } });
        return;
      }

      applyIdentification(outcome.identification, 'accepted');
      router.replace({
        pathname: '/list/confirm',
        params: { tier: outcome.tier, payload: JSON.stringify(outcome.identification) },
      });
    }

    void run();
    return () => {
      cancelled.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Screen>
      <View
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xl }}
      >
        {draft.photoUri ? (
          <View
            style={{
              width: 240,
              height: 240,
              borderRadius: radius.lg,
              overflow: 'hidden',
              borderWidth: 2,
              borderColor: colors.accent,
            }}
          >
            <Image
              source={{ uri: draft.photoUri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
          </View>
        ) : null}

        <Text variant="heading" center>
          {t('listing.identifying')}
        </Text>

        <Button
          label={t('common.cancel')}
          variant="ghost"
          onPress={() => {
            cancelled.current = true;
            router.replace('/list/manual');
          }}
        />
      </View>
    </Screen>
  );
}
