import { adminClient, requireCaller } from '../_shared/auth.ts';
import { json, preflight } from '../_shared/cors.ts';

/**
 * Account deletion.
 *
 * What goes and what stays is a deliberate split. The counterparty's
 * transaction records and their published ratings survive in anonymised form,
 * because one person deleting their account must not silently rewrite someone
 * else's exchange history or reputation.
 *
 * Play requires this to exist in-app AND at a public web URL.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  const caller = await requireCaller(req);
  if (!caller) return json({ ok: false, code: 'unauthorized' }, 401);

  const admin = adminClient();
  const userId = caller.id;

  // 1. Storage: listing photos and any leftover AI temp images.
  for (const bucket of ['tool-photos', 'ai-temp', 'avatars']) {
    const { data: files } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
    if (files && files.length > 0) {
      await admin.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
    }
  }

  // 2. Message bodies become tombstones — the row survives so the other
  //    person's thread stays coherent.
  await admin
    .from('messages')
    .update({ body: '[deleted]' })
    .eq('sender_id', userId);

  // 3. Ratings this person WROTE are anonymised and kept; ratings ABOUT them
  //    go with the profile (cascade).
  await admin
    .from('ratings')
    .update({ comment: null })
    .eq('rater_id', userId);

  // 4. The profile cascade removes tools, tool_locations, favourites,
  //    devices, prefs and notifications. Transactions and disputes are
  //    retained by their own foreign keys.
  await admin.from('profiles').delete().eq('id', userId);

  // 5. Finally the auth user.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return json({ ok: false, error: error.message }, 500);

  return json({ ok: true });
});
