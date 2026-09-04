import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Two clients, two jobs.
 *
 * `userClient` runs AS THE CALLER, so RLS applies — use it for anything that
 * reads or writes the caller's own data. `adminClient` uses the service role
 * and bypasses RLS entirely; it is only for things a user genuinely cannot do
 * for themselves (writing an audit row, deleting an account).
 *
 * The service role key must never leave this environment.
 */
export function userClient(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
}

export type Caller = { id: string; isAnonymous: boolean };

export async function requireCaller(req: Request): Promise<Caller | null> {
  const { data } = await userClient(req).auth.getUser();
  if (!data.user) return null;
  return { id: data.user.id, isAnonymous: Boolean(data.user.is_anonymous) };
}
