import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';

import { Button, Chip, Sheet, Text } from '@/components/primitives';
import { useSearchTools } from '@/features/tools/hooks';
import { formatRadius } from '@/lib/format';
import { DEFAULTS } from '@/lib/config';
import { useTheme } from '@/theme';
import { DEFAULT_FILTERS, type Coords, type ToolFilters } from '@/types/domain';

const CATEGORIES: { id: number; slug: string }[] = [
  { id: 1, slug: 'power-tools' },
  { id: 2, slug: 'hand-tools' },
  { id: 3, slug: 'gardening' },
  { id: 4, slug: 'cleaning' },
  { id: 5, slug: 'ladders' },
  { id: 6, slug: 'painting' },
  { id: 7, slug: 'automotive' },
  { id: 8, slug: 'woodworking' },
  { id: 9, slug: 'home-repair' },
  { id: 10, slug: 'moving' },
  { id: 11, slug: 'camping' },
  { id: 12, slug: 'other' },
];

function Row({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
      }}
    >
      <Text variant="bodyLarge">{label}</Text>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

export function FilterSheet({
  visible,
  filters,
  centre,
  onClose,
  onApply,
}: {
  visible: boolean;
  filters: ToolFilters;
  centre: Coords;
  onClose: () => void;
  onApply: (filters: ToolFilters) => void;
}) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [draft, setDraft] = useState<ToolFilters>(filters);

  // Re-sync when the sheet is reopened with different filters.
  React.useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  /**
   * The count on the button has to be the count for the filters you are
   * *editing*, not the ones already applied.
   *
   * This previously took the applied result count as a prop, so choosing 10 km
   * still said "Show 0 tools" — the answer for the 3 km you were leaving
   * behind. You pressed it anyway and got two. A button that states a number
   * has to state the right one, so it runs the search it is offering.
   *
   * React Query caches by filter key, so flicking between chips you have
   * already tried is instant and costs nothing.
   */
  const preview = useSearchTools(centre, draft, visible);
  const previewCount = preview.data?.length;

  return (
    <Sheet visible={visible} onClose={onClose} title={t('filters.title')} testID="filter-sheet">
      <Row
        label={t('filters.freeOnly')}
        value={draft.freeOnly}
        onChange={(freeOnly) => setDraft((d) => ({ ...d, freeOnly }))}
      />
      <Row
        label={t('filters.availableNow')}
        value={draft.availableNow}
        onChange={(availableNow) => setDraft((d) => ({ ...d, availableNow }))}
      />

      <View style={{ gap: spacing.sm }}>
        <Text variant="label" tone="muted" uppercase>
          {t('filters.distance')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {DEFAULTS.radiusOptions.map((radius) => (
            <Chip
              key={radius}
              label={formatRadius(radius, t)}
              selected={draft.radiusM === radius}
              onPress={() => setDraft((d) => ({ ...d, radiusM: radius }))}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text variant="label" tone="muted" uppercase>
          {t('filters.category')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {CATEGORIES.map((category) => (
            <Chip
              key={category.id}
              label={t(`categories.${category.slug}`)}
              selected={draft.categoryId === category.id}
              onPress={() =>
                setDraft((d) => ({
                  ...d,
                  categoryId: d.categoryId === category.id ? null : category.id,
                }))
              }
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <Button
          // No number until there is a number: claiming one while the count is
          // still loading is how the old bug felt honest and was wrong.
          label={
            previewCount == null
              ? preview.isPending
                ? t('filters.counting')
                : t('filters.applyGeneric')
              : t('filters.apply', { count: previewCount })
          }
          onPress={() => {
            onApply(draft);
            onClose();
          }}
        />
        <Button
          label={t('filters.reset')}
          variant="ghost"
          onPress={() => setDraft({ ...DEFAULT_FILTERS, radiusM: draft.radiusM })}
        />
      </View>
    </Sheet>
  );
}
