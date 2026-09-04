import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppHeader } from '@/components/domain/AppHeader';
import { AVATAR_PRESETS, UserAvatar, presetValue } from '@/components/domain/UserAvatar';
import { Button, Input, Screen, Text } from '@/components/primitives';
import { useSession } from '@/features/auth/session';
import { backIcon } from '@/i18n/direction';
import { requireSupabase } from '@/lib/supabase';
import { IS_DEMO } from '@/lib/config';
import { useTheme } from '@/theme';

/**
 * Name and picture.
 *
 * Google hands us both when someone signs in with it, so for most people this
 * screen is a confirmation rather than a chore. It exists for the rest: anyone
 * who signed up with an email, or who would rather not use their Google photo.
 */
export default function EditProfile() {
  const { t } = useTranslation();
  const router = useRouter();
  const { spacing, colors } = useTheme();
  const session = useSession();

  const [name, setName] = useState(session.displayName ?? '');
  const [avatar, setAvatar] = useState<string | null>(session.avatarUrl ?? null);
  const [busy, setBusy] = useState(false);

  // The photo from the identity provider, if there is one — kept separate so
  // "use my Google photo" can put it back after someone tries a preset.
  const googlePhoto =
    session.avatarUrl && !session.avatarUrl.startsWith('preset:') ? session.avatarUrl : null;

  async function save() {
    setBusy(true);
    try {
      if (!IS_DEMO) {
        const supabase = requireSupabase();
        const trimmed = name.trim();
        if (trimmed.length > 0 && trimmed !== session.displayName) {
          await supabase.rpc('set_my_display_name', { p_name: trimmed });
        }
        if (avatar !== (session.avatarUrl ?? null)) {
          await supabase.rpc('set_my_avatar', { p_avatar: avatar });
        }
      }
      await session.refreshProfile();
      router.back();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <AppHeader
        align="center"
        size={26}
        tagline={false}
        left={{ icon: backIcon(), label: t('common.back'), onPress: () => router.back() }}
      />

      <View style={{ paddingTop: spacing.lg, gap: spacing.xl }}>
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <UserAvatar uri={avatar} name={name || '?'} size={96} />
        </View>

        <Input
          label={t('profile.yourName')}
          help={t('profile.nameHelp')}
          value={name}
          onChangeText={setName}
          autoComplete="given-name"
          maxLength={40}
        />

        <View style={{ gap: spacing.sm }}>
          <Text variant="label" tone="muted" uppercase>
            {t('profile.choosePicture')}
          </Text>
          <Text variant="caption" tone="muted">
            {t('profile.choosePictureBody')}
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {googlePhoto ? (
              <Pressable
                onPress={() => setAvatar(googlePhoto)}
                accessibilityRole="button"
                accessibilityLabel={t('profile.useGooglePhoto')}
                accessibilityState={{ selected: avatar === googlePhoto }}
              >
                <UserAvatar uri={googlePhoto} size={64} ring={avatar === googlePhoto} />
              </Pressable>
            ) : null}

            {AVATAR_PRESETS.map((preset) => {
              const value = presetValue(preset.id);
              return (
                <Pressable
                  key={preset.id}
                  onPress={() => setAvatar(value)}
                  accessibilityRole="button"
                  accessibilityLabel={preset.id}
                  accessibilityState={{ selected: avatar === value }}
                >
                  <UserAvatar uri={value} size={64} ring={avatar === value} />
                </Pressable>
              );
            })}

            <Pressable
              onPress={() => setAvatar(null)}
              accessibilityRole="button"
              accessibilityLabel={t('profile.noPicture')}
              accessibilityState={{ selected: avatar === null }}
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: avatar === null ? 2 : 1,
                borderColor: avatar === null ? colors.accent : colors.border,
              }}
            >
              <Text variant="caption" tone="muted">
                {(name || '?').trim().charAt(0).toUpperCase() || '?'}
              </Text>
            </Pressable>
          </View>
        </View>

        <Button
          size="large"
          label={t('common.save')}
          loading={busy}
          disabled={name.trim().length === 0}
          onPress={() => void save()}
        />
      </View>
    </Screen>
  );
}
