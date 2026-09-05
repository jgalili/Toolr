import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, View } from 'react-native';

import { Icon } from '@/components/domain/Icon';
import { ToolCard } from '@/components/domain/ToolCard';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  SegmentedControl,
  Skeleton,
  Text,
} from '@/components/primitives';
import { useAuthGate } from '@/features/auth/useAuthGate';
import { useToolLoans } from '@/features/transactions/hooks';
import { currentLocale } from '@/i18n';
import { formatRadius } from '@/lib/format';
import { useTheme } from '@/theme';
import type { Coords, ToolFilters, ToolSummary } from '@/types/domain';
import type { Interpretation } from '@/schemas/ai';

import { FilterSheet } from './FilterSheet';
import { ToolMap } from './ToolMap';

type Props = {
  tools: ToolSummary[] | undefined;
  loading: boolean;
  error: unknown;
  filters: ToolFilters;
  centre: Coords;
  interpretation: Interpretation | null;
  onFiltersChange: (filters: ToolFilters) => void;
  onClearInterpretation: () => void;
  onRetry: () => void;
  onPostRequest: () => void;
  /** Rendered above the controls — the brand bar and the search field. */
  header?: React.ReactNode;
};

export function ResultsView({
  tools,
  loading,
  error,
  filters,
  centre,
  interpretation,
  onFiltersChange,
  onClearInterpretation,
  onRetry,
  onPostRequest,
  header,
}: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, colors, radius } = useTheme();
  const loanFor = useToolLoans((tools ?? []).map((tool) => tool.id));
  const [view, setView] = useState<'list' | 'map'>('list');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { requireMember } = useAuthGate();

  const openTool = (tool: ToolSummary) => router.push(`/tool/${tool.id}`);
  const borrow = (tool: ToolSummary) =>
    requireMember({ kind: 'borrow', name: tool.owner.firstName, tool: tool.title }, () =>
      router.push(`/tool/${tool.id}/request`),
    );

  const nextRadius = filters.radiusM < 1000 ? 3000 : filters.radiusM < 5000 ? 5000 : 10000;

  const chipIcon = (name: Parameters<typeof Icon>[0]['name']) => (
    <Icon name={name} color={colors.accent} size={17} strokeWidth={2} />
  );

  const controls = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.md }}>
      {header}

      {/* Filters are a row of answers to the three questions people actually
          ask — is it free, can I get it now, how far. Everything else is
          behind "more", because it is. */}
      {/* One scrolling row rather than a wrapping block: a filter bar that
          changes height as options toggle makes the list jump under the thumb. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: 'row', gap: spacing.sm, paddingEnd: spacing.lg }}
      >
        <Chip
          variant="outline"
          label={t('filters.freeOnly')}
          icon={chipIcon('sliders')}
          selected={filters.freeOnly}
          testID="chip-free-only"
          onPress={() => onFiltersChange({ ...filters, freeOnly: !filters.freeOnly })}
        />
        <Chip
          variant="outline"
          label={t('filters.availableNow')}
          icon={chipIcon('clock')}
          selected={filters.availableNow}
          testID="chip-available-now"
          onPress={() => onFiltersChange({ ...filters, availableNow: !filters.availableNow })}
        />
        <Chip
          variant="outline"
          label={t('search.withinDistance', { distance: formatRadius(filters.radiusM, t) })}
          icon={chipIcon('pin')}
          testID="chip-radius"
          onPress={() => setFiltersOpen(true)}
        />
      </ScrollView>

      <SegmentedControl
        testID="view-toggle"
        variant="brand"
        value={view}
        onChange={setView}
        segments={[
          {
            value: 'list',
            label: t('search.listView'),
            icon: (c) => <Icon name="list" color={c} size={19} />,
          },
          {
            value: 'map',
            label: t('search.mapView'),
            icon: (c) => <Icon name="map" color={c} size={19} />,
          },
        ]}
      />

      {/* An AI interpretation must be visible and reversible. Silently
          rewriting someone's query is the fastest way to make search feel
          broken. */}
      {interpretation ? (
        <View
          style={{
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: colors.accentSoft,
            gap: spacing.xs,
          }}
        >
          <Text variant="caption" tone="accent">
            {t('search.interpreted', {
              types:
                currentLocale() === 'he'
                  ? interpretation.explanation_he
                  : interpretation.explanation_en,
              query: filters.query ?? '',
            })}
          </Text>
          <Button
            label={t('search.searchExactWords')}
            variant="ghost"
            fullWidth={false}
            size="small"
            onPress={onClearInterpretation}
          />
        </View>
      ) : null}
    </View>
  );

  if (error) {
    return (
      <View style={{ flex: 1, padding: spacing.lg }}>
        <ErrorState
          title={t('errors.generic')}
          body={t('errors.genericBody')}
          retryLabel={t('common.retry')}
          onRetry={onRetry}
        />
      </View>
    );
  }

  const skeletons = (
    <View style={{ gap: spacing.md, paddingTop: spacing.sm }}>
      {[0, 1, 2, 3].map((n) => (
        <Skeleton key={n} height={112} radius={radius.lg} />
      ))}
    </View>
  );

  const empty = (
    /* The most important empty state in the product: it converts unmet demand
       into a broadcast, which is how supply gets created. */
    <EmptyState
      testID="empty-nearby"
      title={t('empty.noToolsNearby')}
      body={t('empty.noToolsNearbyBody')}
      primaryAction={{
        label: t('empty.widenRadius', { radius: formatRadius(nextRadius, t) }),
        onPress: () => onFiltersChange({ ...filters, radiusM: nextRadius }),
      }}
      secondaryAction={{ label: t('request.postNeed'), onPress: onPostRequest }}
    />
  );

  const card = (item: ToolSummary) => (
    <ToolCard
      tool={item}
      loan={loanFor(item.id)}
      onPress={() => openTool(item)}
      onBorrow={() => borrow(item)}
    />
  );

  /**
   * Map view keeps the results underneath rather than replacing them. A pin
   * tells you where; only the card tells you whether you want it.
   */
  if (view === 'map') {
    return (
      <View style={{ flex: 1 }}>
        <FlatList
          data={tools ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: spacing.huge }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <>
              <View style={{ paddingHorizontal: spacing.lg }}>{controls}</View>
              <ToolMap
                tools={tools ?? []}
                centre={centre}
                radiusM={filters.radiusM}
                onSelect={openTool}
              />
              <View
                style={{
                  marginTop: -spacing.lg,
                  paddingTop: spacing.sm,
                  borderTopStartRadius: radius.xl,
                  borderTopEndRadius: radius.xl,
                  backgroundColor: colors.background,
                  alignItems: 'center',
                }}
              >
                <View
                  style={{
                    width: 42,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: colors.borderStrong,
                  }}
                />
              </View>
            </>
          }
          renderItem={({ item }) => (
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
              {card(item)}
            </View>
          )}
          ListEmptyComponent={
            <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
              {loading ? skeletons : empty}
            </View>
          }
        />
        <FilterSheet
          visible={filtersOpen}
          filters={filters}
          centre={centre}
          onClose={() => setFiltersOpen(false)}
          onApply={onFiltersChange}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={tools ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {controls}
            {tools && tools.length > 0 ? (
              <Text variant="caption" tone="muted" style={{ paddingBottom: spacing.sm }}>
                {t('search.resultsCount', { count: tools.length })}
              </Text>
            ) : null}
          </>
        }
        ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
        renderItem={({ item }) => card(item)}
        ListEmptyComponent={loading ? skeletons : empty}
      />

      <FilterSheet
        visible={filtersOpen}
        filters={filters}
        centre={centre}
        onClose={() => setFiltersOpen(false)}
        onApply={onFiltersChange}
      />
    </View>
  );
}

/** The tappable search field that sits above the filters on Explore. */
export function SearchSummary({ query, onPress }: { query: string | null; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, radius, spacing } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel={query ?? t('search.placeholderShort')}
      testID="explore-search"
      style={({ pressed }) => ({
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingHorizontal: spacing.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <Icon name="search" color={colors.textMuted} size={21} />
      <Text variant="bodyLarge" tone={query ? 'default' : 'muted'} numberOfLines={1}>
        {query ?? t('search.placeholderShort')}
      </Text>
    </Pressable>
  );
}
