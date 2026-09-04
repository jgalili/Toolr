import React, { useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

import { Text } from './Text';

type Props = TextInputProps & {
  label?: string;
  help?: string;
  error?: string | null;
  prefix?: string;
  suffix?: React.ReactNode;
};

export function Input({ label, help, error, prefix, suffix, style, ...rest }: Props) {
  const { colors, radius, spacing, type, hitSize } = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.danger : focused ? colors.accent : colors.border;

  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <Text variant="caption" tone="secondary">
          {label}
        </Text>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: hitSize.comfortable,
          paddingHorizontal: spacing.lg,
          borderWidth: 1,
          borderColor,
          borderRadius: radius.md,
          backgroundColor: colors.surface,
        }}
      >
        {prefix ? (
          <Text variant="bodyLarge" tone="muted">
            {prefix}
          </Text>
        ) : null}
        <TextInput
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          placeholderTextColor={colors.textMuted}
          style={[
            { flex: 1, color: colors.text, paddingVertical: spacing.md },
            type.bodyLarge,
            style,
          ]}
        />
        {suffix}
      </View>

      {error ? (
        <Text variant="caption" tone="danger">
          {error}
        </Text>
      ) : help ? (
        <Text variant="caption" tone="muted">
          {help}
        </Text>
      ) : null}
    </View>
  );
}
