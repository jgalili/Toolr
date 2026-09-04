import React from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

type Props = {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** Extra bottom padding so a sticky footer never covers the last row. */
  footerSpace?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Screen({ children, scroll, padded = true, footerSpace = 0, style, testID }: Props) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const inner: StyleProp<ViewStyle> = [
    padded && { paddingHorizontal: spacing.lg },
    { paddingBottom: insets.bottom + spacing.lg + footerSpace },
    style,
  ];

  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View testID={testID} style={[{ flex: 1, backgroundColor: colors.background }, inner]}>
      {children}
    </View>
  );
}
