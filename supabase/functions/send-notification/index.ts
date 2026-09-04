import { adminClient } from '../_shared/auth.ts';
import { json, preflight } from '../_shared/cors.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  priority: 'default' | 'high';
  channelId: string;
};

const HIGH_PRIORITY = new Set([
  'borrow_request_received',
  'borrow_request_accepted',
  'borrow_request_declined',
  'message_received',
]);

const PREF_COLUMN: Record<string, string> = {
  borrow_request_received: 'borrow_requests',
  borrow_request_accepted: 'request_responses',
  borrow_request_declined: 'request_responses',
  message_received: 'messages',
  pickup_reminder: 'reminders',
  return_reminder: 'reminders',
  nearby_tool_request: 'nearby_tool_requests',
};

/**
 * Sends the pushes for notification rows that haven't been pushed yet.
 *
 * Called on a schedule (or by a database webhook). Every notification is
 * already a row in `notifications` and appears in the in-app inbox — push is
 * a convenience, and the inbox is the truth. That is the mitigation for OEM
 * battery managers that silently drop messages.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  const admin = adminClient();

  const { data: pending, error } = await admin
    .from('notifications')
    .select('id, user_id, kind, title, body, route, payload')
    .is('pushed_at', null)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) return json({ ok: false, error: error.message }, 500);
  if (!pending || pending.length === 0) return json({ ok: true, sent: 0 });

  const userIds = [...new Set(pending.map((n) => n.user_id))];

  const [{ data: devices }, { data: prefs }] = await Promise.all([
    admin.from('user_devices').select('user_id, expo_push_token').in('user_id', userIds),
    admin.from('notification_prefs').select('*').in('user_id', userIds),
  ]);

  const tokensByUser = new Map<string, string[]>();
  for (const device of devices ?? []) {
    const list = tokensByUser.get(device.user_id) ?? [];
    list.push(device.expo_push_token);
    tokensByUser.set(device.user_id, list);
  }
  const prefsByUser = new Map((prefs ?? []).map((p) => [p.user_id, p as Record<string, boolean>]));

  const messages: PushMessage[] = [];
  const handled: string[] = [];

  for (const notification of pending) {
    handled.push(notification.id);

    const column = PREF_COLUMN[notification.kind];
    const userPrefs = prefsByUser.get(notification.user_id);
    if (column && userPrefs && userPrefs[column] === false) continue;

    for (const token of tokensByUser.get(notification.user_id) ?? []) {
      messages.push({
        to: token,
        title: notification.title,
        body: notification.body,
        data: { route: notification.route, ...(notification.payload ?? {}) },
        priority: HIGH_PRIORITY.has(notification.kind) ? 'high' : 'default',
        channelId: HIGH_PRIORITY.has(notification.kind) ? 'transactional' : 'reminders',
      });
    }
  }

  if (messages.length > 0) {
    // Expo accepts up to 100 messages per request.
    for (let i = 0; i < messages.length; i += 100) {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages.slice(i, i + 100)),
      });
    }
  }

  // Mark handled even when no device token existed, so an inactive user's
  // notifications do not pile up and get re-processed forever.
  await admin
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .in('id', handled);

  return json({ ok: true, sent: messages.length, processed: handled.length });
});
