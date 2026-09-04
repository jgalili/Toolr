import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/primitives';
import { backArrow } from '@/i18n/direction';
import { useAuthGate } from '@/features/auth/useAuthGate';
import { useLocation } from '@/features/location/useLocation';
import { ResultsView } from '@/features/search/ResultsView';
import { useSearch } from '@/features/search/useSearch';
import { useTheme } from '@/theme';

export default function SearchResults() {
  const { q, category } = useLocalSearchParams<{ q?: string; category?: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const { centre } = useLocation();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { requireMember } = useAuthGate();

  const search = useSearch(centre, q ?? '');

  useEffect(() => {
    if (q) void search.submit(q);
    if (category) {
      search.setFilters((f) => ({ ...f, categoryId: Number(category) }));
    }
    // Run once for the params this screen was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingHorizontal: spacing.sm,
        }}
      >
        <Button
          label={`${backArrow()}  ${t('common.back')}`}
          variant="ghost"
          fullWidth={false}
          onPress={() => router.back()}
        />
        <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
          {q ?? t('search.categories')}
        </Text>
      </View>

      <ResultsView
        tools={search.results}
        loading={search.loading}
        error={search.error}
        filters={search.filters}
        centre={centre}
        interpretation={search.interpretation}
        onFiltersChange={search.setFilters}
        onClearInterpretation={search.clearInterpretation}
        onRetry={() => void search.refetch()}
        onPostRequest={() =>
          requireMember({ kind: 'request' }, () => router.push('/request/new'))
        }
      />
    </View>
  );
}
