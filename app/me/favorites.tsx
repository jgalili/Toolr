import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList } from 'react-native';

import { ToolCard } from '@/components/domain/ToolCard';
import { EmptyState, Screen, Text } from '@/components/primitives';
import { useFavorites, useToggleFavorite } from '@/features/tools/hooks';
import { useTheme } from '@/theme';

export default function Favorites() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing } = useTheme();
  const { data } = useFavorites();
  const toggle = useToggleFavorite();

  return (
    <Screen padded={false}>
      <FlatList
        data={data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg }}
        ListHeaderComponent={
          <Text variant="title" style={{ marginBottom: spacing.md }}>
            {t('profile.favorites')}
          </Text>
        }
        ListEmptyComponent={
          <EmptyState
            title={t('empty.noFavorites')}
            body={t('empty.noFavoritesBody')}
            primaryAction={{ label: t('home.needTool'), onPress: () => router.push('/search') }}
          />
        }
        renderItem={({ item }) => (
          <ToolCard
            tool={item}
            onPress={() => router.push(`/tool/${item.id}`)}
            onToggleFavorite={() => toggle.mutate({ toolId: item.id, favorite: false })}
          />
        )}
      />
    </Screen>
  );
}
