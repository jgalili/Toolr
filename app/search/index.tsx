import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { ToolIllustration } from '@/components/domain/ToolIllustration';
import { Button, Chip, Input, Screen, Text } from '@/components/primitives';
import { useTheme } from '@/theme';
import type { CategorySlug } from '@/types/domain';

const CATEGORIES: { id: number; slug: CategorySlug }[] = [
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

const EXAMPLES = [
  'drill',
  'I need to make a hole in a concrete wall',
  'something for sanding a wooden table',
  'ladder',
];

export default function SearchEntry() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, colors, radius } = useTheme();
  const [text, setText] = useState('');

  const go = (query: string, categoryId?: number) => {
    router.push({
      pathname: '/search/results',
      params: { q: query, category: categoryId ? String(categoryId) : '' },
    });
  };

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.xl }}>
        <Text variant="title">{t('search.title')}</Text>

        <Input
          value={text}
          onChangeText={setText}
          placeholder={t('search.placeholder')}
          autoFocus
          returnKeyType="search"
          onSubmitEditing={() => text.trim() && go(text.trim())}
          accessibilityLabel={t('search.title')}
        />

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button
            label={`🎤  ${t('search.voice')}`}
            variant="secondary"
            fullWidth={false}
            style={{ flex: 1 }}
            onPress={() => router.push('/search/voice')}
          />
          {/* Deliberately labelled rather than silently dead — a button that
              does nothing with no explanation is worse than no button. */}
          <Chip label={`📷 ${t('search.photo')} · ${t('search.photoComingSoon')}`} />
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="label" tone="muted" uppercase>
            {t('search.recent')}
          </Text>
          <View style={{ gap: spacing.xs }}>
            {EXAMPLES.map((example) => (
              <Pressable
                key={example}
                onPress={() => go(example)}
                accessibilityRole="button"
                accessibilityLabel={example}
                style={({ pressed }) => ({
                  paddingVertical: spacing.md,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text variant="bodyLarge" tone="secondary">
                  {example}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ gap: spacing.md }}>
          <Text variant="label" tone="muted" uppercase>
            {t('search.categories')}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {CATEGORIES.map((category) => (
              <Pressable
                key={category.id}
                onPress={() => go('', category.id)}
                accessibilityRole="button"
                accessibilityLabel={t(`categories.${category.slug}`)}
                style={({ pressed }) => ({
                  width: '30%',
                  gap: spacing.xs,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <View
                  style={{
                    height: 72,
                    borderRadius: radius.md,
                    overflow: 'hidden',
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <ToolIllustration category={category.slug} size={72} />
                </View>
                <Text variant="caption" numberOfLines={2}>
                  {t(`categories.${category.slug}`)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}
