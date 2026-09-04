import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';

const ONBOARDED_KEY = 'nailedit.onboarded';

/**
 * Entry point. Onboarding is shown once and is skippable; everything after it
 * works without an account.
 */
export default function Index() {
  const [seen, setSeen] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY)
      .then((value) => setSeen(value === 'true'))
      .catch(() => setSeen(false));
  }, []);

  if (seen === null) return null;
  return <Redirect href={seen ? '/(tabs)' : '/(onboarding)/welcome'} />;
}

export async function markOnboarded() {
  await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
}
