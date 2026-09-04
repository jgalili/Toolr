import React from 'react';
import { View } from 'react-native';

import { Avatar } from '@/components/primitives';
import { useTheme } from '@/theme';
import type { CategorySlug } from '@/types/domain';

import { ToolIllustration } from './ToolIllustration';

/**
 * A person's picture.
 *
 * Three cases, in order of how much the person has told us:
 *   1. a real photo URL (Google gives us one on sign-in);
 *   2. `preset:<tool-type>` — one of the built-in drawings, picked by someone
 *      who has no photo or would rather not use it;
 *   3. neither, in which case `Avatar` falls back to the initial.
 *
 * The preset list is deliberately tools rather than faces or abstract shapes.
 * Someone lending a rotary hammer choosing the rotary hammer as their picture
 * is doing something the product understands.
 */
export const AVATAR_PRESETS = [
  { id: 'cordless-drill', category: 'power-tools' },
  { id: 'hammer', category: 'hand-tools' },
  { id: 'jigsaw', category: 'woodworking' },
  { id: 'ladder', category: 'ladders' },
  { id: 'pressure-washer', category: 'cleaning' },
  { id: 'lawn-mower', category: 'gardening' },
  { id: 'paint-roller', category: 'painting' },
  { id: 'socket-set', category: 'automotive' },
] as const satisfies readonly { id: string; category: CategorySlug }[];

export type AvatarPresetId = (typeof AVATAR_PRESETS)[number]['id'];

const PRESET_PREFIX = 'preset:';

export function presetValue(id: string): string {
  return `${PRESET_PREFIX}${id}`;
}

function parsePreset(value: string | null | undefined) {
  if (!value?.startsWith(PRESET_PREFIX)) return null;
  const id = value.slice(PRESET_PREFIX.length);
  return AVATAR_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function UserAvatar({
  uri,
  name,
  size = 40,
  ring = false,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  ring?: boolean;
}) {
  const { colors } = useTheme();
  const preset = parsePreset(uri);

  const border = ring
    ? { borderWidth: 2, borderColor: colors.accent }
    : null;

  if (preset) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: 'hidden',
          backgroundColor: colors.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
          ...border,
        }}
      >
        <ToolIllustration
          toolType={preset.id}
          category={preset.category as CategorySlug}
          size={size}
        />
      </View>
    );
  }

  if (!ring) return <Avatar uri={uri} name={name} size={size} />;

  return (
    <View style={{ borderRadius: size / 2, overflow: 'hidden', ...border }}>
      <Avatar uri={uri} name={name} size={size - 4} />
    </View>
  );
}
