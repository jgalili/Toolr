import * as AuthSession from 'expo-auth-session';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { config } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';

/**
 * Google sign-in, three ways.
 *
 * `@react-native-google-signin/google-signin` gives the nice native One Tap
 * sheet — but it is a native module, so it does not exist in **Expo Go**. If
 * that were the only path, Google sign-in would be untestable until you made a
 * development build, which is a miserable place to discover it doesn't work.
 *
 * So: try native, then fall back. The fallback differs by platform, and the
 * difference matters:
 *
 *   * **native** (Expo Go, dev build) — open a system auth session, wait for it
 *     to hand the redirect URL back in-process, finish the exchange ourselves.
 *   * **web** — navigate the whole page to Google and let it come back to
 *     `/auth/callback`, where supabase-js's `detectSessionInUrl` finishes the
 *     PKCE exchange on load. A popup would put the session in the popup's
 *     window, not this one, and the page you are looking at would sit there
 *     still logged out — which is exactly what it looked like.
 */

// Required so the browser tab closes itself and hands control back to the app.
WebBrowser.maybeCompleteAuthSession();

const IS_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export type GoogleResult =
  | { ok: true }
  | { ok: true; redirecting: true }
  | { ok: false; reason: 'cancelled' | 'unconfigured' | 'failed'; detail?: string };

/** Is the native module actually present in this binary? */
async function loadNativeModule() {
  try {
    const mod = await import('@react-native-google-signin/google-signin');
    // In Expo Go the import resolves but the native side is missing, so the
    // module object is there while the methods throw. Probing is the only
    // reliable check.
    if (!mod?.GoogleSignin?.hasPlayServices) return null;
    await mod.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: false });
    return mod.GoogleSignin;
  } catch {
    return null;
  }
}

async function nativeSignIn(): Promise<GoogleResult | null> {
  if (Platform.OS === 'web') return null;
  if (!config.googleWebClientId) return null;

  const GoogleSignin = await loadNativeModule();
  if (!GoogleSignin) return null;

  try {
    GoogleSignin.configure({
      webClientId: config.googleWebClientId,
      ...(config.googleAndroidClientId ? { androidClientId: config.googleAndroidClientId } : {}),
      offlineAccess: false,
    });

    const result = await GoogleSignin.signIn();
    const idToken =
      (result as { data?: { idToken?: string | null } }).data?.idToken ??
      (result as { idToken?: string | null }).idToken;

    if (!idToken) return { ok: false, reason: 'cancelled' };

    const { error } = await requireSupabase().auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    return error ? { ok: false, reason: 'failed', detail: error.message } : { ok: true };
  } catch {
    // Fall through to the browser flow rather than dead-ending.
    return null;
  }
}

/**
 * Web: full-page redirect.
 *
 * `skipBrowserRedirect` stays false so supabase-js navigates this tab to
 * Google. Nothing after this line runs — the page is gone. We come back at
 * `${origin}/auth/callback?code=…`, and the client (pkce + detectSessionInUrl)
 * exchanges the code during its own construction.
 */
async function webSignIn(): Promise<GoogleResult> {
  const supabase = requireSupabase();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  // On GitHub Pages the app is served from a subfolder — the origin alone is
  // not where the app lives. `EXPO_PUBLIC_BASE_URL` is inlined at build time,
  // so this is the deployed base path or an empty string everywhere else.
  const base = (process.env.EXPO_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  const redirectTo = `${origin}${base}/auth/callback`;

  if (__DEV__) console.log(`[auth] Google redirect URI: ${redirectTo}`);

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error) return { ok: false, reason: 'failed', detail: error.message };
  return { ok: true, redirecting: true };
}

/**
 * Native: system auth session.
 *
 * Supabase hosts the redirect, Google shows its own consent screen, and we come
 * back to `nailedit://auth/callback` (or `exp://…/--/auth/callback` in Expo Go)
 * with either tokens in the fragment or a PKCE code in the query.
 */
async function nativeBrowserSignIn(): Promise<GoogleResult> {
  const supabase = requireSupabase();

  const redirectTo = AuthSession.makeRedirectUri({
    scheme: 'nailedit',
    path: 'auth/callback',
  });

  // The single most useful line when this breaks.
  //
  // Supabase silently falls back to the project's Site URL when `redirect_to`
  // is not on its allow-list — so a missing entry looks like "Google sent me
  // to localhost", with nothing anywhere naming the URL that was actually
  // asked for. In Expo Go this is `exp://<host>:8081/--/auth/callback`, and
  // the host changes with the network, so it is worth printing every time.
  if (__DEV__) {
    console.log(`[auth] Google redirect URI: ${redirectTo}`);
    console.log('[auth] this exact URL must match a Supabase redirect allow-list entry');
  }

  // A loopback address in the redirect is a guaranteed dead end, and worth
  // catching before the person spends a round trip through Google to find out.
  //
  // In Expo Go the redirect is derived from however the dev server was
  // reached. Connect the phone over USB (or use an emulator) and that is
  // `exp://127.0.0.1:8081/…` — an address that means *the phone itself*, where
  // nothing is listening. Google returns, the phone tries to open localhost,
  // and it dies there. Switching the dev server to LAN gives an address the
  // phone can actually reach.
  const loopback = /^exp:\/\/(localhost|127\.0\.0\.1)\b/.test(redirectTo);
  if (loopback && IS_EXPO_GO) {
    return {
      ok: false,
      reason: 'failed',
      detail:
        `redirect is ${redirectTo} — a loopback address the phone cannot reach. ` +
        'Start the dev server in LAN mode (press "s"/use --lan, not localhost or USB) and retry.',
    };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error || !data?.url) {
    return { ok: false, reason: 'failed', detail: error?.message ?? 'no authorize url' };
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    showInRecents: false,
  });

  if (result.type !== 'success' || !result.url) {
    return {
      ok: false,
      reason: result.type === 'cancel' ? 'cancelled' : 'failed',
      // `dismiss` almost always means the redirect never matched `redirectTo`,
      // which in practice means it is missing from Supabase's allow-list.
      detail: result.type === 'dismiss' ? `no redirect back to ${redirectTo}` : result.type,
    };
  }

  const url = new URL(result.url);

  // An error can come back on either side of the '#'.
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
  const failure =
    fragment.get('error_description') ??
    fragment.get('error') ??
    url.searchParams.get('error_description') ??
    url.searchParams.get('error');
  if (failure) return { ok: false, reason: 'failed', detail: failure };

  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');

  if (accessToken && refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    return sessionError ? { ok: false, reason: 'failed', detail: sessionError.message } : { ok: true };
  }

  const code = url.searchParams.get('code');
  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    return exchangeError
      ? { ok: false, reason: 'failed', detail: exchangeError.message }
      : { ok: true };
  }

  return { ok: false, reason: 'failed', detail: 'redirect carried neither tokens nor a code' };
}

/**
 * Sign in with Google. Native sheet where it exists, browser everywhere else.
 */
export async function signInWithGoogle(): Promise<GoogleResult> {
  if (!config.googleWebClientId && !config.supabaseUrl) {
    return { ok: false, reason: 'unconfigured' };
  }

  const native = await nativeSignIn();
  if (native) return native;

  try {
    return Platform.OS === 'web' ? await webSignIn() : await nativeBrowserSignIn();
  } catch (e) {
    return { ok: false, reason: 'failed', detail: e instanceof Error ? e.message : String(e) };
  }
}
