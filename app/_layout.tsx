import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthGateProvider } from '@/features/auth/useAuthGate';
import { SessionProvider } from '@/features/auth/session';
import { LocationProvider } from '@/features/location/useLocation';
import { initI18n } from '@/i18n';
import { capture } from '@/lib/analytics';
import { NavHeader } from '@/components/domain/NavHeader';
import { useReturnReminders } from '@/features/transactions/useReturnReminders';
import { ThemeProvider, useTheme } from '@/theme';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

function RootNavigator() {
  const { colors } = useTheme();
  // Inside the providers, so it sees the live transaction list.
  useReturnReminders();
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          // Every pushed screen gets a back control by default. The handful
          // that draw their own brand header switch it off below, rather than
          // the other way round — a screen with no way out is a bug, and the
          // default should not be able to produce one.
          header: (props) => <NavHeader canGoBack={props.navigation.canGoBack()} />,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="list" options={{ presentation: 'modal', headerShown: false }} />
        <Stack.Screen name="auth" options={{ presentation: 'modal', headerShown: false }} />
        {/* These two draw the brand bar themselves, with their own actions. */}
        <Stack.Screen name="tool/[id]/index" options={{ headerShown: false }} />
        <Stack.Screen name="chat/[conversationId]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initI18n()
      .catch(() => undefined)
      .finally(() => {
        setReady(true);
        capture('app_opened');
        void SplashScreen.hideAsync();
      });
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <SessionProvider>
              <LocationProvider>
                <AuthGateProvider>
                  <RootNavigator />
                </AuthGateProvider>
              </LocationProvider>
            </SessionProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
