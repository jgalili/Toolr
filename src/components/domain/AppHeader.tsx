import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme';

import { Icon, type IconName } from './Icon';
import { Wordmark } from './Wordmark';

export type HeaderAction = {
  icon: IconName;
  label: string;
  onPress: () => void;
  /** Draws the small teal dot — unread mail, pending requests. */
  badge?: boolean;
  filled?: boolean;
  testID?: string;
};

function ActionButton({ action }: { action: HeaderAction }) {
  const { colors, hitSize } = useTheme();
  return (
    <Pressable
      onPress={action.onPress}
      accessibilityRole="button"
      accessibilityLabel={action.label}
      testID={action.testID}
      hitSlop={8}
      style={({ pressed }) => ({
        width: hitSize.min,
        height: hitSize.min,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name={action.icon} color={colors.text} size={25} filled={action.filled} />
      {action.badge ? (
        <View
          style={{
            position: 'absolute',
            top: 10,
            end: 10,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: colors.accent,
            borderWidth: 1.5,
            borderColor: colors.surface,
          }}
        />
      ) : null}
    </Pressable>
  );
}

/**
 * The brand bar that every primary screen wears.
 *
 * `align="start"` is the home/explore treatment — the mark sits where the eye
 * starts. `align="center"` is for pushed screens, where a back control on the
 * left needs a counterweight on the right or the mark drifts.
 */
export function AppHeader({
  align = 'start',
  size = 30,
  tagline = true,
  left,
  right,
}: {
  align?: 'start' | 'center';
  size?: number;
  tagline?: boolean;
  left?: HeaderAction;
  right?: HeaderAction;
}) {
  const { spacing, hitSize } = useTheme();

  const spacer = <View style={{ width: hitSize.min }} />;

  if (align === 'center') {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.xs,
          paddingTop: spacing.sm,
        }}
      >
        {left ? <ActionButton action={left} /> : spacer}
        <View style={{ alignItems: 'center' }}>
          <Wordmark size={size} tagline={tagline} />
        </View>
        {right ? <ActionButton action={right} /> : spacer}
      </View>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        paddingTop: spacing.sm,
      }}
    >
      <Wordmark size={size} tagline={tagline} />
      {right ? <ActionButton action={right} /> : null}
    </View>
  );
}
