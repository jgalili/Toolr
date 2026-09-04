import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';

import { Screen, Text } from '@/components/primitives';
import { api } from '@/lib/api';
import { useTheme } from '@/theme';
import type { NotificationPrefs } from '@/types/domain';

const KEYS: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'borrowRequests', label: 'settings.notificationTypes.borrow_requests' },
  { key: 'requestResponses', label: 'settings.notificationTypes.request_responses' },
  { key: 'messages', label: 'settings.notificationTypes.messages' },
  { key: 'reminders', label: 'settings.notificationTypes.reminders' },
  { key: 'nearbyToolRequests', label: 'settings.notificationTypes.nearby_tool_requests' },
];

/**
 * Per-type toggles from day one. Every notification NailedIt sends is
 * transactional — there are no marketing pushes to switch off, because there
 * are none to begin with.
 */
export default function NotificationSettings() {
  const { t } = useTranslation();
  const { spacing, colors } = useTheme();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  useEffect(() => {
    void api.getNotificationPrefs().then(setPrefs);
  }, []);

  function update(key: keyof NotificationPrefs, value: boolean) {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    void api.setNotificationPrefs(next);
  }

  return (
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl, gap: spacing.lg }}>
        <Text variant="title">{t('settings.notifications')}</Text>

        {prefs
          ? KEYS.map(({ key, label }) => (
              <View
                key={key}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.md,
                  paddingVertical: spacing.sm,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <Text variant="bodyLarge" style={{ flex: 1 }}>
                  {t(label)}
                </Text>
                <Switch
                  value={prefs[key]}
                  onValueChange={(value) => update(key, value)}
                  accessibilityLabel={t(label)}
                />
              </View>
            ))
          : null}
      </View>
    </Screen>
  );
}
