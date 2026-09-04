import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { ToolIllustration } from '@/components/domain/ToolIllustration';
import { Button, Input, Screen, Text } from '@/components/primitives';
import { useListingDraft } from '@/features/listing/draft';
import { useTheme } from '@/theme';
import type { CategorySlug, RiskLevel } from '@/types/domain';

const CATEGORIES: { slug: CategorySlug; risk: RiskLevel }[] = [
  { slug: 'power-tools', risk: 'medium' },
  { slug: 'hand-tools', risk: 'low' },
  { slug: 'gardening', risk: 'medium' },
  { slug: 'cleaning', risk: 'low' },
  { slug: 'ladders', risk: 'medium' },
  { slug: 'painting', risk: 'low' },
  { slug: 'automotive', risk: 'medium' },
  { slug: 'woodworking', risk: 'high' },
  { slug: 'home-repair', risk: 'low' },
  { slug: 'moving', risk: 'low' },
  { slug: 'camping', risk: 'low' },
  { slug: 'other', risk: 'low' },
];

const REASON_KEY: Record<string, string> = {
  not_a_tool: 'listing.notATool',
  quota_exceeded: 'ai.quotaReached',
  offline: 'ai.offline',
  timeout: 'ai.failed',
  model_failed: 'ai.failed',
  invalid_image: 'ai.poorPhoto',
  low_confidence: 'listing.couldntTell',
};

/**
 * The manual picker — the floor under the whole listing flow.
 *
 * Every AI failure lands here within 12 seconds, with the photo already
 * attached. The listing flow can never be blocked by the AI; that is the
 * difference between a delightful shortcut and a dependency.
 */
export default function ManualPicker() {
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, colors, radius } = useTheme();
  const { update } = useListingDraft();

  const [category, setCategory] = useState<CategorySlug | null>(null);
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');

  const reasonKey = reason ? REASON_KEY[reason] : undefined;

  function next() {
    if (!category) return;
    const risk = CATEGORIES.find((c) => c.slug === category)?.risk ?? 'low';
    update({
      categorySlug: category,
      title: name.trim() || t(`categories.${category}`),
      toolType: name.trim().toLowerCase().replace(/\s+/g, '-') || category,
      brand: brand.trim() || null,
      model: null,
      isModelConfirmed: false,
      risk,
      aiOutcome: 'rejected',
    });
    router.push('/list/details');
  }

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xl, gap: spacing.xl }}>
        {reasonKey ? (
          <View
            style={{
              padding: spacing.lg,
              borderRadius: radius.md,
              backgroundColor: colors.warningSoft,
              gap: spacing.xs,
            }}
          >
            <Text variant="bodyStrong" tone="warning">
              {t(reasonKey)}
            </Text>
            <Text variant="caption" tone="warning">
              {t('ai.failedBody')}
            </Text>
          </View>
        ) : null}

        <Text variant="title">{t('listing.chooseCategory')}</Text>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {CATEGORIES.map((item) => (
            <Pressable
              key={item.slug}
              onPress={() => setCategory(item.slug)}
              accessibilityRole="button"
              accessibilityState={{ selected: category === item.slug }}
              accessibilityLabel={t(`categories.${item.slug}`)}
              style={{ width: '30%', gap: spacing.xs }}
            >
              <View
                style={{
                  height: 72,
                  borderRadius: radius.md,
                  overflow: 'hidden',
                  borderWidth: category === item.slug ? 2 : 1,
                  borderColor: category === item.slug ? colors.accent : colors.border,
                }}
              >
                <ToolIllustration category={item.slug} size={72} />
              </View>
              <Text variant="caption" numberOfLines={2}>
                {t(`categories.${item.slug}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        {category ? (
          <View style={{ gap: spacing.lg }}>
            <Input
              label={t('listing.chooseType')}
              value={name}
              onChangeText={setName}
              placeholder={t(`categories.${category}`)}
            />
            <Input label={t('listing.brandOptional')} value={brand} onChangeText={setBrand} />
            <Button size="large" label={t('common.continue')} onPress={next} />
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
