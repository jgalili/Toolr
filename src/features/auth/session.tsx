import type { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { DEMO_USER_ID } from '@/demo/seed';
import { capture, identify, resetAnalytics } from '@/lib/analytics';
import { config, IS_DEMO } from '@/lib/config';
import { supabase } from '@/lib/supabase';

import { signInWithGoogle as runGoogleSignIn } from './googleSignIn';

export type AuthError =
  | 'invalid_credentials'
  | 'email_in_use'
  | 'email_not_confirmed'
  | 'too_many_attempts'
  | 'weak_password'
  /** The person closed the Google sheet. Show nothing; this is not an error. */
  | 'cancelled'
  | 'unknown';

export type SessionState = {
  /** Non-null for guests too — a guest holds a real anonymous session. */
  userId: string | null;
  /** True while the session is a Supabase anonymous session. */
  isGuest: boolean;
  /** The gate for every write: list, borrow, message, rate. */
  isMember: boolean;
  email: string | null;
  /** What to call this person on screen. Never the email address. */
  displayName: string | null;
  /** A real photo URL, or a `preset:<tool-type>` marker they picked. */
  avatarUrl: string | null;
  loading: boolean;
  googleAvailable: boolean;
  /** Re-read the profile after the person edits their name or avatar. */
  refreshProfile(): Promise<void>;

  signUpWithPassword(input: {
    firstName: string;
    email: string;
    password: string;
  }): Promise<{ ok: true; needsConfirmation: boolean } | { ok: false; error: AuthError }>;
  signInWithPassword(
    email: string,
    password: string,
  ): Promise<{ ok: true } | { ok: false; error: AuthError }>;
  signInWithGoogle(): Promise<{ ok: true } | { ok: false; error: AuthError; detail?: string }>;
  requestPasswordReset(email: string): Promise<void>;
  updatePassword(password: string): Promise<{ ok: true } | { ok: false; error: AuthError }>;
  signOut(): Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

function mapError(message: string | undefined): AuthError {
  const text = (message ?? '').toLowerCase();
  if (text.includes('invalid login')) return 'invalid_credentials';
  if (text.includes('already registered') || text.includes('already been registered'))
    return 'email_in_use';
  if (text.includes('email not confirmed')) return 'email_not_confirmed';
  if (text.includes('rate limit') || text.includes('too many')) return 'too_many_attempts';
  if (text.includes('pwned') || text.includes('weak')) return 'weak_password';
  return 'unknown';
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [demoMember, setDemoMember] = useState(false);
  const [loading, setLoading] = useState(true);
  const [googleEnabled, setGoogleEnabled] = useState(IS_DEMO);
  const [profile, setProfile] = useState<{ firstName: string; avatarUrl: string | null } | null>(
    null,
  );

  /**
   * Is Google actually switched on for this project?
   *
   * `/auth/v1/settings` is a public endpoint that lists the enabled
   * providers. Asking it is the difference between a button that signs you in
   * and a button that returns "provider is not enabled" — and a sign-in button
   * that fails is worse than no button at all.
   */
  useEffect(() => {
    if (IS_DEMO || !config.supabaseUrl || !config.supabaseAnonKey) return;
    let cancelled = false;
    const url = `${config.supabaseUrl.replace(/\/$/, '')}/auth/v1/settings`;
    fetch(url, { headers: { apikey: config.supabaseAnonKey } })
      .then((r) => (r.ok ? r.json() : null))
      .then((settings) => {
        if (!cancelled) setGoogleEnabled(Boolean(settings?.external?.google));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Boot.
   *
   * A first-time user is signed in ANONYMOUSLY, silently. That is what makes
   * the later upgrade lossless: Supabase identity linking keeps the same user
   * id, so favourites and quota survive signing in, and there is no migration
   * step to write or get wrong.
   */
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (IS_DEMO || !supabase) {
        setLoading(false);
        capture('guest_session_started');
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data.session) {
        setSession(data.session);
      } else {
        const { data: anon, error } = await supabase.auth.signInAnonymously();
        if (!cancelled && !error && anon.session) {
          setSession(anon.session);
          capture('guest_session_started');
        }
      }
      if (!cancelled) setLoading(false);
    }

    void boot();

    const subscription = supabase?.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (next?.user && !next.user.is_anonymous) identify(next.user.id);
    });

    return () => {
      cancelled = true;
      subscription?.data.subscription.unsubscribe();
    };
  }, []);

  const user: User | null = session?.user ?? null;
  const isGuest = IS_DEMO ? !demoMember : Boolean(user?.is_anonymous ?? true);

  /**
   * The profile behind the session.
   *
   * `sync_profile_from_identity()` first, because the profile row is created
   * when the app opens as a guest — before Google has told us anything — so
   * without a backfill a Google sign-in leaves you called "Neighbour" with no
   * picture. It only fills blanks, so a name or avatar the person chose is
   * never overwritten.
   */
  const loadProfile = useCallback(async () => {
    if (IS_DEMO || !supabase) return;
    const id = session?.user?.id;
    if (!id || session?.user?.is_anonymous) {
      setProfile(null);
      return;
    }
    try {
      await supabase.rpc('sync_profile_from_identity');
    } catch {
      // A profile that cannot be backfilled is still a usable profile.
    }
    const { data } = await supabase
      .from('profiles')
      .select('first_name, avatar_url')
      .eq('id', id)
      .maybeSingle();
    if (data) setProfile({ firstName: data.first_name, avatarUrl: data.avatar_url ?? null });
  }, [session?.user?.id, session?.user?.is_anonymous]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  /**
   * Fall back through the identity metadata when the profile row has not
   * caught up yet, so the first render after signing in already shows a name
   * rather than an email address.
   */
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const metaString = (key: string): string | null => {
    const value = meta[key];
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  };
  const metaName = metaString('full_name') ?? metaString('name') ?? metaString('given_name');
  const displayName = isGuest
    ? null
    : (profile?.firstName && profile.firstName !== 'Neighbour' ? profile.firstName : null) ??
      (metaName ? metaName.split(' ')[0] : null) ??
      profile?.firstName ??
      null;
  const avatarUrl = isGuest
    ? null
    : profile?.avatarUrl ?? metaString('avatar_url') ?? metaString('picture');

  const signUpWithPassword = useCallback<SessionState['signUpWithPassword']>(
    async ({ firstName, email, password }) => {
      capture('signup_started', { method: 'password' });

      if (IS_DEMO || !supabase) {
        setDemoMember(true);
        capture('signup_completed', { method: 'demo' });
        return { ok: true, needsConfirmation: false };
      }

      // updateUser on the existing anonymous session links the email in place,
      // keeping the same user id. That is what preserves favourites.
      const anonymous = user?.is_anonymous ?? false;
      if (anonymous) {
        const { error } = await supabase.auth.updateUser({
          email,
          password,
          data: { full_name: firstName },
        });
        if (error) return { ok: false, error: mapError(error.message) };
        capture('guest_upgraded', { method: 'password' });
        return { ok: true, needsConfirmation: true };
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: firstName } },
      });
      if (error) return { ok: false, error: mapError(error.message) };
      capture('signup_completed', { method: 'password' });
      return { ok: true, needsConfirmation: true };
    },
    [user],
  );

  const signInWithPassword = useCallback<SessionState['signInWithPassword']>(
    async (email, password) => {
      if (IS_DEMO || !supabase) {
        setDemoMember(true);
        return { ok: true };
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: mapError(error.message) };
      capture('signin_completed', { method: 'password' });
      return { ok: true };
    },
    [],
  );

  const signInWithGoogle = useCallback<SessionState['signInWithGoogle']>(async () => {
    if (IS_DEMO || !supabase) {
      setDemoMember(true);
      return { ok: true };
    }

    const anonymous = user?.is_anonymous ?? false;
    const result = await runGoogleSignIn();

    if (result.ok) {
      // Linking to an anonymous session keeps the SAME user id, so favourites
      // and quota survive. That is the whole reason guest mode holds a real
      // session rather than no session.
      capture(anonymous ? 'guest_upgraded' : 'signin_completed', { method: 'google' });
      return { ok: true };
    }

    // A cancelled sign-in is not an error — the person changed their mind.
    if (result.reason !== 'cancelled' && result.detail) {
      // Google sign-in fails for boring, findable reasons — a redirect URL
      // missing from the allow-list, a provider switched off. Swallowing the
      // reason turns a five-minute fix into an afternoon.
      console.warn('[auth] Google sign-in failed:', result.detail);
    }
    return {
      ok: false,
      error: result.reason === 'cancelled' ? 'cancelled' : 'unknown',
      detail: result.detail,
    };
  }, [user]);

  const requestPasswordReset = useCallback(async (email: string) => {
    if (IS_DEMO || !supabase) return;
    // The screen shows the same message either way, so this is never an
    // account-enumeration oracle.
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: 'nailedit://auth/reset-password' });
  }, []);

  const updatePassword = useCallback<SessionState['updatePassword']>(async (password) => {
    if (IS_DEMO || !supabase) return { ok: true };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, error: mapError(error.message) };
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    resetAnalytics();
    if (IS_DEMO || !supabase) {
      setDemoMember(false);
      return;
    }
    await supabase.auth.signOut();
    // Straight back to a guest session, so the app never shows a signed-out
    // dead end — you are always able to browse.
    const { data } = await supabase.auth.signInAnonymously();
    setSession(data.session ?? null);
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      userId: IS_DEMO ? DEMO_USER_ID : (user?.id ?? null),
      isGuest,
      isMember: !isGuest,
      email: IS_DEMO ? 'demo@nailedit.app' : (user?.email ?? null),
      displayName: IS_DEMO ? 'Demo' : displayName,
      avatarUrl: IS_DEMO ? null : avatarUrl,
      loading,
      googleAvailable: googleEnabled,
      refreshProfile: loadProfile,
      signUpWithPassword,
      signInWithPassword,
      signInWithGoogle,
      requestPasswordReset,
      updatePassword,
      signOut,
    }),
    [
      user,
      isGuest,
      loading,
      googleEnabled,
      displayName,
      avatarUrl,
      loadProfile,
      signUpWithPassword,
      signInWithPassword,
      signInWithGoogle,
      requestPasswordReset,
      updatePassword,
      signOut,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>');
  return ctx;
}
