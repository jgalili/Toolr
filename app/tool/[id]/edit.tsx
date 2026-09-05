import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  Input,
  Screen,
  SegmentedControl,
  Sheet,
  Skeleton,
  Text,
} from '@/components/primitives';
import { useSession } from '@/features/auth/session';
import { useToast } from '@/features/feedback/toast';
import {
  buildPatch,
  editableFrom,
  hasChanges,
  validate,
  type EditableListing,
} from '@/features/listing/toolPatch';
import { useRemoveTool, useTool, useUpdateTool } from '@/features/tools/hooks';
import { formatMoney, parseMoneyToAgorot } from '@/lib/format';
import { useTheme } from '@/theme';

/**
 * Change a listing you have already published.
 *
 * Its absence was reported as a bug, and it was one: a price typed wrong was
 * permanent, a tool you had sold went on being advertised, and the only way
 * round either was to publish a corrected duplicate.
 *
 * The screen deliberately edits the SAME small set of fields the listing flow
 * asks for, in the same order and with the same words. An edit screen that
 * exposes more than the create screen teaches people that the quick path hid
 * something from them.
 *
 * What it will not change: what the tool IS — type, brand, risk. A listing
 * that can quietly turn into a different tool after someone has bookmarked it
 * is a listing nobody can rely on. That is a re-list, not an edit.
 */
export default function EditListing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, colors, radius } = useTheme();
  const { userId } = useSession();
  const { show } = useToast();

  const { data: tool, isPending } = useTool(id);
  const update = useUpdateTool();
  const remove = useRemoveTool();

  const [form, setForm] = useState<EditableListing | null>(null);
  const [priceText, setPriceText] = useState('');
  const [confirming, setConfirming] = useState(false);

  // Seed the form once the listing arrives, and not on every render after —
  // re-seeding from a refetch would throw away whatever is being typed.
  useEffect(() => {
    if (!tool || form) return;
    const editable = editableFrom(tool);
    setForm(editable);
    setPriceText(editable.pricePerDayAgorot != null ? String(editable.pricePerDayAgorot / 100) : '');
  }, [tool, form]);

  const patch = useMemo(
    () => (tool && form ? buildPatch(editableFrom(tool), form) : {}),
    [tool, form],
  );
  const problem = form ? validate(form) : null;
  const dirty = hasChanges(patch);

  if (isPending || !form) {
    return (
      <Screen>
        <View style={{ paddingTop: spacing.xl, gap: spacing.lg }}>
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} height={72} radius={radius.md} />
          ))}
        </View>
      </Screen>
    );
  }

  // Someone else's listing, or one that has gone. Both are the same dead end,
  // and neither should render a form that cannot possibly save.
  if (!tool || (userId && tool.ownerProfile.id !== userId)) {
    return (
      <Screen>
        <EmptyState
          title={t('errors.notFound')}
          primaryAction={{ label: t('common.back'), onPress: () => router.back() }}
        />
      </Screen>
    );
  }

  const set = (changes: Partial<EditableListing>) =>
    setForm((current) => (current ? { ...current, ...changes } : current));

  function save() {
    if (!dirty) return;
    update.mutate(
      { id, patch },
      {
        onSuccess: () => {
          show({ message: t('listing.editSaved'), tone: 'success' });
          router.back();
        },
      },
    );
  }

  function confirmRemove() {
    setConfirming(false);
    remove.mutate(id, {
      onSuccess: () => {
        show({ message: t('listing.removed'), tone: 'success' });
        // Back to the list, not to the listing that no longer exists.
        router.replace('/me/tools');
      },
    });
  }

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xl, gap: spacing.xl }}>
        <Text variant="title">{t('listing.edit')}</Text>

        <Input
          label={t('listing.editTitle')}
          value={form.title}
          onChangeText={(title) => set({ title })}
          maxLength={80}
        />

        <Input
          label={t('listing.descriptionLabel')}
          value={form.description ?? ''}
          onChangeText={(description) => set({ description })}
          multiline
          maxLength={400}
        />

        <View style={{ gap: spacing.md }}>
          <Text variant="heading">{t('listing.howToLend')}</Text>
          <SegmentedControl
            segments={[
              { value: 'free', label: t('listing.lendFree') },
              { value: 'rent', label: t('listing.lendRent') },
            ]}
            value={form.isFree ? 'free' : 'rent'}
            onChange={(value) => set({ isFree: value === 'free' })}
          />
          {!form.isFree ? (
            <Input
              label={t('listing.pricePerDay')}
              value={priceText}
              onChangeText={(text) => {
                setPriceText(text);
                set({ pricePerDayAgorot: parseMoneyToAgorot(text) });
              }}
              keyboardType="numeric"
              prefix="₪"
              placeholder="15"
            />
          ) : null}
          {problem === 'needsPrice' ? (
            <Text variant="caption" tone="danger">
              {t('errors.needsPrice')}
            </Text>
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
            value={form.availabilityMode}
            onChange={(availabilityMode) => set({ availabilityMode })}
          />
          <Text variant="caption" tone="muted">
            {t('listing.availabilityHint')}
          </Text>
        </View>

        <Input
          label={t('listing.accessories')}
          value={form.accessories ?? ''}
          onChangeText={(accessories) => set({ accessories })}
          placeholder={t('listing.accessoriesPlaceholder')}
        />
        <Input
          label={t('listing.instructions')}
          value={form.instructions ?? ''}
          onChangeText={(instructions) => set({ instructions })}
          multiline
        />
        <Input
          label={t('listing.maxBorrowDays')}
          value={form.maxBorrowDays != null ? String(form.maxBorrowDays) : ''}
          onChangeText={(value) => {
            const parsed = Number.parseInt(value, 10);
            set({ maxBorrowDays: Number.isFinite(parsed) ? parsed : null });
          }}
          keyboardType="numeric"
        />

        <Button
          testID="save-listing"
          size="large"
          label={t('listing.save')}
          disabled={!dirty || problem != null}
          loading={update.isPending}
          onPress={save}
        />
        {!dirty ? (
          <Text variant="caption" tone="muted" center>
            {t('listing.noChanges')}
          </Text>
        ) : null}

        {/* Deletion sits apart, below everything, and asks first. It is the
            one control here that cannot be undone by editing again. */}
        <Card>
          <View style={{ gap: spacing.sm }}>
            <Text variant="caption" tone="muted">
              {formatMoney(tool.pricePerDayAgorot ?? 0, tool.currency)}
            </Text>
            <Button
              label={t('listing.removeTool')}
              variant="ghost"
              loading={remove.isPending}
              onPress={() => setConfirming(true)}
            />
          </View>
        </Card>
      </View>

      <Sheet visible={confirming} onClose={() => setConfirming(false)}>
        <View style={{ gap: spacing.md, padding: spacing.lg }}>
          <Text variant="heading">{t('listing.removeConfirmTitle')}</Text>
          <Text variant="body" tone="secondary">
            {t('listing.removeConfirmBody')}
          </Text>
          <Button
            label={t('listing.removeConfirm')}
            onPress={confirmRemove}
            style={{ backgroundColor: colors.danger }}
          />
          <Button label={t('common.cancel')} variant="ghost" onPress={() => setConfirming(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}
