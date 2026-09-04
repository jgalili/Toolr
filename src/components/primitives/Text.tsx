import React from 'react';
import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme';

export type TextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'bodyLarge'
  | 'body'
  | 'bodyStrong'
  | 'caption'
  | 'label';

export type TextTone =
  | 'default'
  | 'secondary'
  | 'muted'
  | 'accent'
  | 'offer'
  | 'warning'
  | 'danger'
  | 'onAccent'
  | 'onOffer';

type Props = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
  center?: boolean;
  uppercase?: boolean;
};

export function Text({
  variant = 'body',
  tone = 'default',
  center,
  uppercase,
  style,
  ...rest
}: Props) {
  const { colors, type } = useTheme();

  const toneColor: Record<TextTone, string> = {
    default: colors.text,
    secondary: colors.textSecondary,
    muted: colors.textMuted,
    accent: colors.accentText,
    offer: colors.offer,
    warning: colors.warning,
    danger: colors.danger,
    onAccent: colors.onAccent,
    onOffer: colors.onOffer,
  };

  const base = type[variant] as TextStyle;

  return (
    <RNText
      {...rest}
      style={[
        base,
        { color: toneColor[tone] },
        center && { textAlign: 'center' },
        uppercase && { textTransform: 'uppercase' },
        style,
      ]}
    />
  );
}
