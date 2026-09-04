import { Image } from 'expo-image';
import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

type Props = {
  uri?: string | null;
  name?: string | null;
  size?: number;
};

export function Avatar({ uri, name, size = 40 }: Props) {
  const { colors } = useTheme();
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={name ?? undefined}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text variant={size >= 56 ? 'title' : 'bodyStrong'} tone="accent">
        {initial}
      </Text>
    </View>
  );
}
