import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/domain/AppHeader';
import { useAuthGate } from '@/features/auth/useAuthGate';
import { useLocation } from '@/features/location/useLocation';
import { useUnreadCount } from '@/features/notifications/hooks';
import { ResultsView, SearchSummary } from '@/features/search/ResultsView';
import { useSearch } from '@/features/search/useSearch';
import { useTheme } from '@/theme';

export default function Explore() {
  const { t } = useTranslation();
  const { centre } = useLocation();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { requireMember } = useAuthGate();
  const search = useSearch(centre);
  const unread = useUnreadCount();

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: colors.background }}>
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
        onPostRequest={() => requireMember({ kind: 'request' }, () => router.push('/request/new'))}
        header={
          <View style={{ gap: spacing.lg }}>
            <AppHeader
              right={{
                icon: 'bell',
                label: t('common.notifications'),
                badge: unread > 0,
                onPress: () => router.push('/me/activity'),
              }}
            />
            <SearchSummary query={search.filters.query} onPress={() => router.push('/search')} />
          </View>
        }
      />
    </View>
  );
}
