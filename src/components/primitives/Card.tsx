import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  children: React.ReactNode;
  onPress?: () => void;
  /** Long-press for the secondary action a row has — clearing a chat, say. */
  onLongPress?: () => void;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  testID?: string;
};

export function Card({
  children,
  onPress,
  onLongPress,
  padded = true,
  style,
  accessibilityLabel,
  testID,
}: Props) {
  const { colors, radius, spacing, shadow } = useTheme();

  const body = (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: padded ? spacing.lg : 0,
          overflow: 'hidden',
        },
        shadow.card,
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress && !onLongPress) return body;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      {body}
    </Pressable>
  );
}
