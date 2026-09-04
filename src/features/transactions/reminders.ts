import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Transaction } from '@/types/domain';

/**
 * Return reminders.
 *
 * The single most common way a neighbourly loan goes wrong is not theft, it is
 * forgetting. A borrower means to bring the drill back on Tuesday, Tuesday
 * passes, and by Friday it is awkward enough that nobody says anything. That
 * silence is what stops people lending a second time.
 *
 * So the app remembers on their behalf. Three notifications per borrow:
 *
 *   * the evening before it is due — early enough to actually do something;
 *   * at the due time itself;
 *   * a day late, addressed to the *owner* as well, because by then it is a
 *     conversation rather than a reminder.
 *
 * These are LOCAL notifications, scheduled on the device. That is a deliberate
 * choice over server push: they need no push token, no credentials, no Expo
 * project, and they work in Expo Go and offline. The cost is that they only
 * fire on the device that scheduled them — fine for a borrow you arranged on
 * that phone, and the server-side `notifications` table still carries the
 * authoritative record.
 */

const CHANNEL_ID = 'returns';

/** Identifies our reminders so a re-sync can replace them without touching others. */
const TAG = 'nailedit.return';

export type ReminderStrings = {
  dayBeforeTitle: string;
  dayBeforeBody: (tool: string) => string;
  dueTitle: string;
  dueBody: (tool: string) => string;
  overdueTitle: string;
  overdueBody: (tool: string, name: string) => string;
  lendingOverdueTitle: string;
  lendingOverdueBody: (tool: string, name: string) => string;
};

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'Returns',
    importance: Notifications.AndroidImportance.DEFAULT,
    // A borrowed drill is not an emergency. No vibration pattern, no lights.
    vibrationPattern: [0, 200],
  });
}

/**
 * Ask only when there is something to remind about.
 *
 * Prompting for notifications on first launch, before anyone has borrowed
 * anything, is the classic way to get denied permanently. We ask the first
 * time a borrow is actually agreed.
 */
export async function ensureReminderPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

function at(date: Date, hour: number, minute = 0): Date {
  const out = new Date(date);
  out.setHours(hour, minute, 0, 0);
  return out;
}

type Planned = { when: Date; title: string; body: string; transactionId: string };

/** Pure, so it can be tested without a device. */
export function planReminders(
  transactions: Transaction[],
  strings: ReminderStrings,
  now: Date = new Date(),
): Planned[] {
  const planned: Planned[] = [];

  for (const tx of transactions) {
    // Only a live borrow needs reminding about.
    if (tx.status !== 'agreed' && tx.status !== 'picked_up') continue;

    const due = new Date(tx.dueAt);
    if (Number.isNaN(due.getTime())) continue;

    const tool = tx.toolTitle;
    const name = tx.counterparty.firstName;

    if (tx.viewerRole === 'borrower') {
      // 18:00 the evening before — after work, in time to arrange a drop-off.
      const eveningBefore = at(new Date(due.getTime() - 24 * 3600 * 1000), 18);
      if (eveningBefore > now) {
        planned.push({
          when: eveningBefore,
          title: strings.dayBeforeTitle,
          body: strings.dayBeforeBody(tool),
          transactionId: tx.id,
        });
      }

      if (due > now) {
        planned.push({
          when: due,
          title: strings.dueTitle,
          body: strings.dueBody(tool),
          transactionId: tx.id,
        });
      }

      const dayLate = at(new Date(due.getTime() + 24 * 3600 * 1000), 10);
      if (dayLate > now) {
        planned.push({
          when: dayLate,
          title: strings.overdueTitle,
          body: strings.overdueBody(tool, name),
          transactionId: tx.id,
        });
      }
    } else {
      // The owner hears nothing until it is actually late. Nagging someone
      // about a tool they lent generously is the wrong instinct.
      const dayLate = at(new Date(due.getTime() + 24 * 3600 * 1000), 10);
      if (dayLate > now) {
        planned.push({
          when: dayLate,
          title: strings.lendingOverdueTitle,
          body: strings.lendingOverdueBody(tool, name),
          transactionId: tx.id,
        });
      }
    }
  }

  return planned;
}

/**
 * Replace every reminder we own with the current plan.
 *
 * Wholesale replacement rather than diffing: the set is small, the source of
 * truth is the transaction list, and a diff that drifts leaves someone being
 * reminded to return a drill they gave back a week ago.
 */
export async function syncReminders(
  transactions: Transaction[],
  strings: ReminderStrings,
): Promise<number> {
  const plan = planReminders(transactions, strings);

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { tag?: string } | null)?.tag === TAG)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );

  if (plan.length === 0) return 0;

  if (!(await ensureReminderPermission())) return 0;
  await ensureChannel();

  for (const item of plan) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: item.title,
        body: item.body,
        data: { tag: TAG, transactionId: item.transactionId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: item.when,
        ...(Platform.OS === 'android' ? { channelId: CHANNEL_ID } : {}),
      },
    });
  }

  return plan.length;
}

export async function cancelAllReminders(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => (n.content.data as { tag?: string } | null)?.tag === TAG)
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}
