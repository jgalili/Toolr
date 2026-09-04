import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';

import { markOnboarded } from '../index';

export default function Lend() {
  const { t } = useTranslation();
  const router = useRouter();

  const skip = async () => {
    await markOnboarded();
    router.replace('/(tabs)');
  };

  return (
    <OnboardingScreen
      step={2}
      illustration="hand-tools"
      title={t('onboarding.lendTitle')}
      body={t('onboarding.lendBody')}
      primary={{ label: t('common.next'), onPress: () => router.push('/(onboarding)/location') }}
      onSkip={skip}
    />
  );
}
