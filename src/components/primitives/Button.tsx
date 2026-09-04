import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

/**
 * `primary` is teal (needing, borrowing). `offer` is blue (listing, offering).
 * `outline` is the teal-bordered pill used for the Borrow action on a card,
 * where a filled button would out-shout the card it sits in.
 */
export type ButtonVariant =
  | 'primary'
  | 'offer'
  | 'outline'
  | 'offer-outline'
  | 'secondary'
  | 'ghost'
  | 'destructive';
export type ButtonSize = 'regular' | 'large' | 'small';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  /** `pill` for card-level actions and filters; `rounded` everywhere else. */
  shape?: 'rounded' | 'pill';
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityHint?: string;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'regular',
  disabled,
  loading,
  icon,
  fullWidth = true,
  shape = 'rounded',
  style,
  testID,
  accessibilityHint,
}: Props) {
  const { colors, radius, spacing, hitSize } = useTheme();
  const inactive = disabled || loading;

  const height =
    size === 'large' ? hitSize.primary : size === 'small' ? hitSize.min : hitSize.comfortable;

  const palette: Record<
    ButtonVariant,
    {
      bg: string;
      border: string;
      tone: 'onAccent' | 'onOffer' | 'default' | 'accent' | 'offer' | 'danger';
    }
  > = {
    primary: { bg: colors.accent, border: colors.accent, tone: 'onAccent' },
    offer: { bg: colors.offer, border: colors.offer, tone: 'onOffer' },
    outline: { bg: 'transparent', border: colors.accent, tone: 'accent' },
    'offer-outline': { bg: 'transparent', border: colors.offer, tone: 'offer' },
    secondary: { bg: colors.surface, border: colors.borderStrong, tone: 'default' },
    ghost: { bg: 'transparent', border: 'transparent', tone: 'accent' },
    destructive: { bg: colors.dangerSoft, border: colors.dangerSoft, tone: 'danger' },
  };
  const p = palette[variant];

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: Boolean(inactive), busy: Boolean(loading) }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: height,
          borderRadius: shape === 'pill' ? radius.pill : radius.md,
          backgroundColor: p.bg,
          borderColor: p.border,
          paddingHorizontal: spacing.xl,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.onAccent : variant === 'offer' ? colors.onOffer : colors.accent}
        />
      ) : (
        <View style={[styles.row, { gap: spacing.sm }]}>
          {icon}
          <Text
            variant={size === 'large' ? 'heading' : 'bodyStrong'}
            tone={p.tone}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
});
