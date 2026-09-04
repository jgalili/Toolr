import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SafetyNote } from '@/components/domain/SafetyNote';
import { Button, Input, Screen, SegmentedControl, Text } from '@/components/primitives';
import { useListingDraft } from '@/features/listing/draft';
import { useSubmitListing } from '@/features/listing/submit';
import { parseMoneyToAgorot } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * The only required screen in the listing flow.
 *
 * Exactly two decisions — free or rent, and when — then LIST TOOL. Everything
 * else is behind "Add more details". That restraint is most of what makes
 * thirty seconds real.
 */
export default function Details() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { draft, update } = useListingDraft();
  const { submit, error, pending } = useSubmitListing();

  const [expanded, setExpanded] = useState(false);
  const [price, setPrice] = useState('');

  const priceAgorot = parseMoneyToAgorot(price);
  const canSubmit = draft.isFree || (priceAgorot != null && priceAgorot > 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen scroll footerSpace={100}>
        <View style={{ paddingTop: spacing.xl, gap: spacing.xl }}>
          <Input
            label={t('listing.editTitle')}
            value={draft.title}
            onChangeText={(title) => update({ title })}
            maxLength={80}
          />

          {draft.description ? (
            <View style={{ gap: spacing.xs }}>
              <Input
                label={t('listing.descriptionLabel')}
                value={draft.description}
                onChangeText={(description) => update({ description })}
                multiline
                maxLength={400}
              />
              <Text variant="caption" tone="muted">
                {t('ai.generatedDescription')}
              </Text>
            </View>
          ) : null}

          <View style={{ gap: spacing.md }}>
            <Text variant="heading">{t('listing.howToLend')}</Text>
            <SegmentedControl
              segments={[
                { value: 'free', label: t('listing.lendFree') },
                { value: 'rent', label: t('listing.lendRent') },
              ]}
              value={draft.isFree ? 'free' : 'rent'}
              onChange={(value) => update({ isFree: value === 'free' })}
            />
            {!draft.isFree ? (
              <Input
                label={t('listing.pricePerDay')}
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                prefix="₪"
                placeholder="15"
              />
            ) : null}
          </View>

          <View style={{ gap: spacing.md }}>
            <Text variant="heading">{t('listing.availability')}</Text>
            <SegmentedControl
              segments={[
                { value: 'now', label: t('listing.availableNow') },
                { value: 'dates', label: t('listing.chooseDates') },
                { value: 'ask', label: t('listing.askMe') },
              ]}
              value={draft.availabilityMode}
              onChange={(availabilityMode) => update({ availabilityMode })}
            />
          </View>

          <SafetyNote risk={draft.risk} />

          <View
            style={{
              padding: spacing.lg,
              borderRadius: radius.md,
              backgroundColor: colors.accentSoft,
            }}
          >
            <Text variant="caption" tone="accent">
              {t('listing.locationPrivacyNote')}
            </Text>
          </View>

          <Button
            label={`${expanded ? '▾' : '▸'}  ${t('listing.addMoreDetails')}`}
            variant="ghost"
            onPress={() => setExpanded((value) => !value)}
          />

          {expanded ? (
            <View style={{ gap: spacing.lg }}>
              <Input
                label={t('listing.accessories')}
                value={draft.accessories ?? ''}
                onChangeText={(accessories) => update({ accessories })}
                placeholder={t('listing.accessoriesPlaceholder')}
              />
              <Input
                label={t('listing.instructions')}
                value={draft.instructions ?? ''}
                onChangeText={(instructions) => update({ instructions })}
                multiline
              />
              <Input
                label={t('listing.maxBorrowDays')}
                value={draft.maxBorrowDays ? String(draft.maxBorrowDays) : ''}
                onChangeText={(value) => {
                  const parsed = Number.parseInt(value, 10);
                  update({ maxBorrowDays: Number.isFinite(parsed) ? parsed : null });
                }}
                keyboardType="numeric"
              />
              <View style={{ gap: spacing.xs }}>
                <Text variant="caption" tone="secondary">
                  {t('listing.deposit')}
                </Text>
                <Text variant="caption" tone="muted">
                  {t('listing.depositComingSoon')}
                </Text>
              </View>
            </View>
          ) : null}

          {error ? (
            <Text variant="caption" tone="danger">
              {error}
            </Text>
          ) : null}
        </View>
      </Screen>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          start: 0,
          end: 0,
          padding: spacing.lg,
          paddingBottom: insets.bottom + spacing.md,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Button
          testID="list-tool"
          size="large"
          label={t('listing.listTool')}
          disabled={!canSubmit}
          loading={pending}
          onPress={() => void submit(priceAgorot)}
        />
      </View>
    </View>
  );
}
