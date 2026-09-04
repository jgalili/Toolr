import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { useLocation } from '@/features/location/useLocation';
import { capture } from '@/lib/analytics';

import { markOnboarded } from '../index';

/**
 * The rationale is on THIS screen, above the system dialog — a permission
 * prompt with no explanation in front of it is the single most common reason
 * people refuse location, and refusing here costs us the whole product.
 */
export default function LocationStep() {
  const { t } = useTranslation();
  const router = useRouter();
  const { request, loading } = useLocation();

  const finish = async () => {
    await markOnboarded();
    capture('onboarding_completed');
    router.replace('/(tabs)');
  };

  return (
    <OnboardingScreen
      step={3}
      illustration="ladders"
      title={t('onboarding.locationTitle')}
      body={t('onboarding.locationBody')}
      primary={{
        label: loading ? t('common.loading') : t('onboarding.enableLocation'),
        onPress: async () => {
          await request();
          await finish();
        },
      }}
      secondary={{ label: t('onboarding.notNow'), onPress: finish }}
    />
  );
}
