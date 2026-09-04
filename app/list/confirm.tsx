import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/domain/AppHeader';
import { ConfidenceRing } from '@/components/domain/ConfidenceRing';
import { Icon } from '@/components/domain/Icon';
import { ToolIllustration } from '@/components/domain/ToolIllustration';
import { Button, Card, Input, Screen, SegmentedControl, Sheet, Text } from '@/components/primitives';
import { useListingDraft } from '@/features/listing/draft';
import { useSubmitListing } from '@/features/listing/submit';
import { backChevronIcon, chevronIcon } from '@/i18n/direction';
import { capture } from '@/lib/analytics';
import { parseMoneyToAgorot } from '@/lib/format';
import { identificationSchema, type Identification } from '@/schemas/ai';
import { useTheme } from '@/theme';
import type { CategorySlug } from '@/types/domain';

/**
 * Add Tool — the whole listing on one screen.
 *
 * This is where the honesty policy becomes visible. High confidence gets one
 * candidate to confirm; medium gets a short list; low never reaches this
 * screen. `model` has already been blanked server-side if the vision model
 * wasn't sure, so nothing here can overstate what is actually known, and
 * "choose generic X" is offered on every variant — it is often the honest
 * answer and always the fastest.
 *
 * Everything below the identification card is the two decisions that make a
 * listing real: free or paid, and when. Everything else is optional and lives
 * behind "add more details", which is most of what makes thirty seconds true.
 */

/** A label with a quiet (i) — a hint that is available, not one that shouts. */
function FieldLabel({ label, hint }: { label: string; hint: string }) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${hint}`}
        hitSlop={8}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        <Text variant="bodyStrong" style={{ fontSize: 17 }}>
          {label}
        </Text>
        <Icon name="info" color={colors.textMuted} size={16} />
      </Pressable>
      {open ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export default function Confirm() {
  const { tier, payload } = useLocalSearchParams<{ tier?: string; payload?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, radius, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { draft, update, applyIdentification } = useListingDraft();
  const { submit, error, pending } = useSubmitListing();

  const [price, setPrice] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const identification = useMemo<Identification | null>(() => {
    if (!payload) return null;
    try {
      const parsed = identificationSchema.safeParse(JSON.parse(payload));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }, [payload]);

  if (!identification) {
    router.replace('/list/manual');
    return null;
  }

  const isHigh = tier === 'high';
  const genericName = identification.tool_type?.replace(/-/g, ' ') ?? 'tool';
  const displayName =
    [identification.brand, identification.model].filter(Boolean).join(' ') ||
    identification.suggested_title ||
    genericName;

  const priceAgorot = parseMoneyToAgorot(price);
  const canSubmit = draft.isFree || (priceAgorot != null && priceAgorot > 0);

  const accept = (chosen?: { brand: string | null; model: string | null }) => {
    capture('ai_result_accepted', { tier: tier ?? 'unknown' });
    applyIdentification(chosen ? { ...identification, ...chosen } : identification, 'accepted');
    setConfirmed(true);
  };

  const acceptGeneric = () => {
    capture('ai_result_corrected', { tier: tier ?? 'unknown', to: 'generic' });
    applyIdentification({ ...identification, brand: null, model: null }, 'generic');
    update({ title: genericName.replace(/^\w/, (c) => c.toUpperCase()), isModelConfirmed: false });
    setConfirmed(true);
  };

  const reject = () => {
    capture('ai_result_rejected', { tier: tier ?? 'unknown' });
    router.replace('/list/manual');
  };

  const availabilityLabel = t(
    draft.availabilityMode === 'now'
      ? 'listing.availableNow'
      : draft.availabilityMode === 'dates'
        ? 'listing.chooseDates'
        : 'listing.askMe',
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen scroll footerSpace={104} testID="add-tool">
        <AppHeader align="center" size={26} />

        <View style={{ gap: spacing.xl, paddingTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel={t('common.back')}
              hitSlop={10}
              style={{ padding: spacing.xs }}
            >
              <Icon name={backChevronIcon()} color={colors.text} size={24} strokeWidth={2.2} />
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Text variant="title">{t('listing.addTool')}</Text>
              <Text variant="caption" tone="muted">
                {t('listing.under30')}
              </Text>
            </View>
            <View style={{ width: 32 }} />
          </View>

          {/* The photo, with the only edit that matters on it. */}
          <View
            style={{
              height: 210,
              borderRadius: radius.lg,
              overflow: 'hidden',
              backgroundColor: colors.surfaceSunken,
            }}
          >
            {draft.photoUri ? (
              <Image
                source={{ uri: draft.photoUri }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
              />
            ) : (
              <ToolIllustration
                toolType={identification.tool_type ?? undefined}
                category={(identification.category ?? 'other') as CategorySlug}
                size={150}
              />
            )}
            <Pressable
              onPress={() => router.replace('/list/camera')}
              accessibilityRole="button"
              accessibilityLabel={t('listing.retakePhoto')}
              testID="retake-photo"
              style={({ pressed }) => ({
                position: 'absolute',
                bottom: spacing.md,
                end: spacing.md,
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surface,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Icon name="pencil" color={colors.text} size={20} />
            </Pressable>
          </View>

          <View style={{ gap: spacing.md }}>
            <Text variant="bodyStrong" style={{ fontSize: 17 }}>
              {t('listing.aiIdentification')}
            </Text>

            {isHigh ? (
              <View
                style={{
                  gap: spacing.lg,
                  padding: spacing.lg,
                  borderRadius: radius.lg,
                  borderWidth: 1,
                  borderColor: confirmed ? colors.accent : colors.border,
                  backgroundColor: colors.surface,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View
                    style={{
                      width: 62,
                      height: 62,
                      borderRadius: radius.md,
                      overflow: 'hidden',
                      backgroundColor: colors.surfaceSunken,
                    }}
                  >
                    {draft.photoUri ? (
                      <Image
                        source={{ uri: draft.photoUri }}
                        style={{ width: '100%', height: '100%' }}
                        contentFit="cover"
                      />
                    ) : (
                      <ToolIllustration
                        toolType={identification.tool_type ?? undefined}
                        category={(identification.category ?? 'other') as CategorySlug}
                        size={54}
                      />
                    )}
                  </View>

                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="caption" tone="muted">
                      {t('listing.weThinkThis')}
                    </Text>
                    <Text variant="bodyStrong" style={{ fontSize: 17 }}>
                      {displayName}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {t('listing.likelyType', { type: genericName })}
                    </Text>
                  </View>

                  <ConfidenceRing value={identification.tool_type_confidence} />
                </View>

                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <Button
                    style={{ flex: 1 }}
                    testID="ai-yes"
                    label={t('common.yes')}
                    icon={<Icon name="check-circle" color={colors.onAccent} size={19} />}
                    onPress={() => accept()}
                  />
                  <Button
                    style={{ flex: 1 }}
                    testID="ai-not-quite"
                    variant="outline"
                    label={t('listing.notQuite')}
                    icon={<Icon name="question-circle" color={colors.accent} size={19} />}
                    onPress={reject}
                  />
                </View>

                <Pressable
                  onPress={acceptGeneric}
                  accessibilityRole="button"
                  accessibilityLabel={t('listing.chooseGeneric', { type: genericName })}
                  testID="ai-generic"
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Text variant="body" tone="accent">
                    {t('listing.chooseGeneric', { type: genericName })}
                  </Text>
                  <Icon name={chevronIcon()} color={colors.accent} size={19} />
                </Pressable>
              </View>
            ) : (
              /* Medium confidence: a short list, because one confident-looking
                 answer would be a guess dressed up as a fact. */
              <View style={{ gap: spacing.md }}>
                <Text variant="body" tone="secondary">
                  {t('listing.whichClosest')}
                </Text>
                {identification.alternatives.map((alternative, index) => (
                  <Card
                    key={`${alternative.brand}-${alternative.model}-${index}`}
                    onPress={() => accept({ brand: alternative.brand, model: alternative.model })}
                    accessibilityLabel={[alternative.brand, alternative.model]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: spacing.md,
                      }}
                    >
                      <Text variant="bodyStrong" style={{ flex: 1 }}>
                        {[alternative.brand, alternative.model].filter(Boolean).join(' ') ||
                          alternative.tool_type.replace(/-/g, ' ')}
                      </Text>
                      <ConfidenceRing value={alternative.confidence} size={52} />
                    </View>
                  </Card>
                ))}
                <Card onPress={acceptGeneric} accessibilityLabel={genericName}>
                  <Text variant="bodyStrong" tone="accent">
                    {t('listing.chooseGeneric', { type: genericName })}
                  </Text>
                </Card>
                <Button label={t('listing.noneOfThese')} variant="secondary" onPress={reject} />
              </View>
            )}
          </View>

          <View style={{ gap: spacing.md }}>
            <FieldLabel label={t('listing.listingMode')} hint={t('listing.listingModeHint')} />
            <SegmentedControl
              testID="listing-mode"
              variant="brand"
              tone="offer"
              segments={[
                { value: 'free', label: t('listing.lendFree') },
                { value: 'rent', label: t('listing.lendRent') },
              ]}
              value={draft.isFree ? 'free' : 'rent'}
              onChange={(value) => update({ isFree: value === 'free' })}
            />
          </View>

          {!draft.isFree ? (
            <View style={{ gap: spacing.md }}>
              <FieldLabel label={t('listing.price')} hint={t('listing.priceHint')} />
              <Input
                label=""
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                prefix="₪"
                placeholder="15"
                suffix={
                  <Text variant="bodyLarge" tone="muted">
                    {t('listing.perDayShort')}
                  </Text>
                }
                testID="price-input"
              />
            </View>
          ) : null}

          <View style={{ gap: spacing.md }}>
            <FieldLabel label={t('listing.availabilityLabel')} hint={t('listing.availabilityHint')} />
            <Pressable
              onPress={() => setPickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={availabilityLabel}
              testID="availability-picker"
              style={({ pressed }) => ({
                minHeight: 56,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                paddingHorizontal: spacing.lg,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                opacity: pressed ? 0.9 : 1,
              })}
            >
              <Icon name="calendar" color={colors.textSecondary} size={20} />
              <Text variant="body" style={{ flex: 1 }}>
                {availabilityLabel}
              </Text>
              <Icon name="chevron-down" color={colors.textMuted} size={20} />
            </Pressable>
          </View>

          <Button
            label={t('listing.addMoreDetails')}
            variant="ghost"
            onPress={() => router.push('/list/details')}
          />

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
          variant="offer"
          label={t('listing.listTool')}
          disabled={!canSubmit}
          loading={pending}
          onPress={() => void submit(priceAgorot)}
        />
      </View>

      <Sheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title={t('listing.availability')}
      >
        <View style={{ gap: spacing.sm }}>
          {(['now', 'dates', 'ask'] as const).map((mode) => (
            <Card
              key={mode}
              onPress={() => {
                update({ availabilityMode: mode });
                setPickerOpen(false);
              }}
              accessibilityLabel={t(
                mode === 'now'
                  ? 'listing.availableNow'
                  : mode === 'dates'
                    ? 'listing.chooseDates'
                    : 'listing.askMe',
              )}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
              >
                <Text variant="bodyStrong">
                  {t(
                    mode === 'now'
                      ? 'listing.availableNow'
                      : mode === 'dates'
                        ? 'listing.chooseDates'
                        : 'listing.askMe',
                  )}
                </Text>
                {draft.availabilityMode === mode ? (
                  <Icon name="check" color={colors.accent} size={20} strokeWidth={2.4} />
                ) : null}
              </View>
            </Card>
          ))}
        </View>
      </Sheet>
    </View>
  );
}
