import { Tabs, useRouter } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/domain/Icon';
import { UserAvatar } from '@/components/domain/UserAvatar';
import { Text } from '@/components/primitives';
import { useSession } from '@/features/auth/session';
import { useAuthGate } from '@/features/auth/useAuthGate';
import { useTheme } from '@/theme';

/**
 * Five tabs, all the same weight.
 *
 * An earlier version raised the centre button into a floating circle. It drew
 * the eye but it also implied that listing a tool is the main event, and it
 * isn't — most sessions are someone who needs a drill tonight. Home carries the
 * two big choices; the bar is just the way back to them.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const router = useRouter();
  const { requireMember } = useAuthGate();
  const session = useSession();

  // Signed in, the last tab is *you*: your face and your name, not a generic
  // silhouette labelled "Profile". A guest still gets the silhouette, because
  // there is nobody to show yet.
  const signedIn = !session.isGuest;
  const meLabel = signedIn ? (session.displayName ?? t('home.tabProfile')) : t('home.tabProfile');

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 68,
          paddingBottom: 10,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('home.tabHome'),
          tabBarIcon: ({ color, focused }) => (
            <Icon name="home" color={color} filled={focused} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="browse"
        options={{
          title: t('home.tabExplore'),
          tabBarIcon: ({ color, focused }) => (
            <Icon name="search" color={color} size={24} strokeWidth={focused ? 2.4 : 1.9} />
          ),
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: t('home.tabAdd'),
          // Custom, because listing needs an account and the gate must fire
          // before navigation rather than on the screen we land on.
          tabBarButton: ({ accessibilityState }) => {
            const focused = Boolean(accessibilityState?.selected);
            const tint = focused ? colors.accent : colors.textMuted;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={t('home.haveTool')}
                testID="tab-add"
                onPress={() => requireMember({ kind: 'list' }, () => router.push('/list/camera'))}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'flex-start',
                  paddingTop: spacing.sm,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <View style={{ alignItems: 'center', gap: 3 }}>
                  <Icon name="plus-circle" color={tint} size={24} />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: tint }}>
                    {t('home.tabAdd')}
                  </Text>
                </View>
              </Pressable>
            );
          },
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: t('home.tabMessages'),
          tabBarIcon: ({ color, focused }) => (
            <Icon name="message" color={color} filled={focused} size={24} />
          ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: meLabel,
          tabBarIcon: ({ color, focused }) =>
            signedIn ? (
              <UserAvatar
                uri={session.avatarUrl}
                name={session.displayName ?? '?'}
                size={26}
                ring={focused}
              />
            ) : (
              <Icon name="person" color={color} size={24} strokeWidth={focused ? 2.4 : 1.9} />
            ),
        }}
      />
    </Tabs>
  );
}
