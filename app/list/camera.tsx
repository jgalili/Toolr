import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/domain/AppHeader';
import { Icon } from '@/components/domain/Icon';
import { Button, EmptyState, Screen, Text } from '@/components/primitives';
import { backIcon } from '@/i18n/direction';
import { useListingDraft } from '@/features/listing/draft';
import { prepareForListing } from '@/features/listing/prepareImage';
import { capture } from '@/lib/analytics';
import { useTheme } from '@/theme';

/**
 * The listing flow opens straight to the camera. No form first.
 *
 * "Take a photo" is the fastest path to a listing, and making it the default —
 * rather than something behind a form — is most of what makes thirty seconds
 * achievable.
 */
export default function CameraScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const { update } = useListingDraft();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    capture('tool_listing_started');
  }, []);

  async function proceed(uri: string) {
    const prepared = await prepareForListing(uri);
    update({ photoUri: prepared });
    capture('tool_photo_uploaded');
    router.push('/list/identifying');
  }

  async function shoot() {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (photo?.uri) await proceed(photo.uri);
    } finally {
      setBusy(false);
    }
  }

  async function pickFromGallery() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) await proceed(result.assets[0].uri);
  }

  // Permission denied is never a dead end — the gallery still works.
  if (permission && !permission.granted) {
    return (
      <Screen>
        <AppHeader
          align="center"
          size={26}
          tagline={false}
          left={{ icon: backIcon(), label: t('common.back'), onPress: () => router.back() }}
        />
        <EmptyState
          title={t('errors.cameraDenied')}
          body={t('errors.cameraDeniedBody')}
          primaryAction={
            permission.canAskAgain
              ? { label: t('listing.enableCamera'), onPress: () => void requestPermission() }
              : { label: t('listing.chooseFromGallery'), onPress: pickFromGallery }
          }
          secondaryAction={{ label: t('listing.addManually'), onPress: () => router.push('/list/manual') }}
        />
      </Screen>
    );
  }

  if (!permission) {
    return (
      <Screen>
        <EmptyState
          title={t('common.loading')}
          primaryAction={{ label: t('common.continue'), onPress: () => void requestPermission() }}
        />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />

      {/* The viewfinder is full-bleed, so it opts out of the navigator's
          header — which means the way out has to live here, on the glass. */}
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        hitSlop={10}
        style={({ pressed }) => ({
          position: 'absolute',
          top: insets.top + spacing.md,
          start: spacing.md,
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(0,0,0,0.55)',
          opacity: pressed ? 0.7 : 1,
          zIndex: 2,
        })}
      >
        <Icon name={backIcon()} color="#fff" size={24} />
      </Pressable>

      <View
        style={{
          position: 'absolute',
          top: insets.top + spacing.lg,
          start: 0,
          end: 0,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
            borderRadius: 999,
            backgroundColor: 'rgba(0,0,0,0.55)',
          }}
        >
          <Text variant="bodyStrong" style={{ color: '#fff' }}>
            {t('listing.pointAtTool')}
          </Text>
        </View>
      </View>

      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + spacing.xl,
          start: spacing.lg,
          end: spacing.lg,
          gap: spacing.lg,
          alignItems: 'center',
        }}
      >
        <Pressable
          onPress={shoot}
          accessibilityRole="button"
          accessibilityLabel={t('listing.takePhoto')}
          disabled={busy}
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: '#fff',
            borderWidth: 5,
            borderColor: colors.accent,
            opacity: busy ? 0.6 : 1,
          }}
        />
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button
            label={t('listing.chooseFromGallery')}
            variant="secondary"
            fullWidth={false}
            onPress={pickFromGallery}
          />
          <Button
            label={t('listing.addManually')}
            variant="secondary"
            fullWidth={false}
            onPress={() => router.push('/list/manual')}
          />
        </View>
      </View>
    </View>
  );
}
