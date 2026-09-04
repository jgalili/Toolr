import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { IS_DEMO } from '@/lib/config';

import { useTransactions } from './hooks';
import { cancelAllReminders, syncReminders, type ReminderStrings } from './reminders';

/**
 * Keeps the device's return reminders in step with the live borrows.
 *
 * Driven off the transactions query rather than fired at the moment a request
 * is accepted, so it is self-healing: reinstall the app, sign in on a second
 * device, or accept a borrow while offline, and the reminders reappear as soon
 * as the list loads. Anything that only ran once at accept time would not.
 */
export function useReturnReminders() {
  const { t } = useTranslation();
  const { data } = useTransactions();
  const lastSignature = useRef<string | null>(null);

  useEffect(() => {
    if (IS_DEMO) return;
    if (!data) return;

    // Only re-schedule when something that affects a reminder changed —
    // cancelling and re-adding notifications on every refetch is wasteful and,
    // on some Android builds, drops a notification in the gap.
    const signature = data
      .map((tx) => `${tx.id}:${tx.status}:${tx.dueAt}:${tx.viewerRole}`)
      .sort()
      .join('|');
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;

    const strings: ReminderStrings = {
      dayBeforeTitle: t('reminders.dayBeforeTitle'),
      dayBeforeBody: (tool) => t('reminders.dayBeforeBody', { tool }),
      dueTitle: t('reminders.dueTitle'),
      dueBody: (tool) => t('reminders.dueBody', { tool }),
      overdueTitle: t('reminders.overdueTitle'),
      overdueBody: (tool, name) => t('reminders.overdueBody', { tool, name }),
      lendingOverdueTitle: t('reminders.lendingOverdueTitle'),
      lendingOverdueBody: (tool, name) => t('reminders.lendingOverdueBody', { tool, name }),
    };

    void syncReminders(data, strings).catch(() => {
      // A device that refuses notifications is not a broken borrow.
    });
  }, [data, t]);

  useEffect(() => () => void cancelAllReminders().catch(() => undefined), []);
}
