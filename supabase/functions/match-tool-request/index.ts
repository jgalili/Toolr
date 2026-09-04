import { adminClient } from '../_shared/auth.ts';
import { json, preflight } from '../_shared/cors.ts';

/**
 * Re-runs the nearby-owner match for an open tool request.
 *
 * `create_tool_request` already notifies matching owners at post time. This
 * exists for the second pass: someone lists a jigsaw today, and a request
 * posted yesterday is still open and still within radius.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight();

  const { toolRequestId } = (await req.json().catch(() => ({}))) as { toolRequestId?: string };
  const admin = adminClient();

  const requestIds: string[] = [];
  if (toolRequestId) {
    requestIds.push(toolRequestId);
  } else {
    const { data } = await admin
      .from('tool_requests')
      .select('id')
      .eq('status', 'open')
      .gt('expires_at', new Date().toISOString())
      .limit(200);
    requestIds.push(...(data ?? []).map((r) => r.id));
  }

  let notified = 0;

  for (const id of requestIds) {
    const { data: matches } = await admin.rpc('match_tool_request', { p_request_id: id });
    const { data: request } = await admin
      .from('tool_requests')
      .select('raw_text')
      .eq('id', id)
      .maybeSingle();

    for (const match of matches ?? []) {
      // Don't tell the same owner about the same request twice.
      const { data: existing } = await admin
        .from('notifications')
        .select('id')
        .eq('user_id', match.owner_id)
        .eq('kind', 'nearby_tool_request')
        .contains('payload', { tool_request_id: id })
        .maybeSingle();
      if (existing) continue;

      await admin.from('notifications').insert({
        user_id: match.owner_id,
        kind: 'nearby_tool_request',
        title: 'Someone nearby needs a tool',
        body: request?.raw_text ?? '',
        route: `nailedit://request/${id}`,
        payload: { tool_request_id: id, tool_id: match.tool_id, distance_m: match.distance_m },
      });
      notified += 1;
    }
  }

  return json({ ok: true, requests: requestIds.length, notified });
});
