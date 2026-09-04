import { useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';

import { markOnboarded } from '../index';

export default function Welcome() {
  const { t } = useTranslation();
  const router = useRouter();

  const skip = async () => {
    await markOnboarded();
    router.replace('/(tabs)');
  };

  return (
    <OnboardingScreen
      step={1}
      illustration="power-tools"
      title={t('onboarding.welcomeTitle')}
      body={t('onboarding.welcomeBody')}
      primary={{ label: t('common.next'), onPress: () => router.push('/(onboarding)/lend') }}
      onSkip={skip}
    />
  );
}
