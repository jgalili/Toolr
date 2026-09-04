/**
 * Runtime configuration, read once from EXPO_PUBLIC_* env vars.
 *
 * Nothing here is a secret. Every value in this file ships inside the app
 * bundle and is visible to anyone who unzips the APK — that is fine for all of
 * them by design. The Supabase service-role key, the Gemini API key and the
 * SMTP credentials are NOT here and must never be: they live in Supabase Edge
 * Function secrets.
 *
 * When Supabase isn't configured the app runs in DEMO MODE against local seed
 * data, so a fresh clone is useful before any account exists.
 */

/**
 * Every read below is written out in full, on purpose.
 *
 * Expo replaces `process.env.EXPO_PUBLIC_FOO` with its literal value when it
 * bundles for production, and it does that by *textual* substitution — it can
 * only see member expressions it can read statically. A lookup like
 * `process.env[name]` is invisible to it, so nothing gets substituted, and in
 * a production bundle `process.env` is an empty object.
 *
 * That failure is silent and nasty: the dev server injects a real environment
 * at runtime, so `expo start` works perfectly while every exported build —
 * the APK, the web deploy — comes up with no backend and quietly falls into
 * demo mode. Repetition here is the price of the values actually arriving.
 */
const RAW = {
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  EXPO_PUBLIC_TURNSTILE_SITE_KEY: process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY,
  EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
} as const;

function env(name: keyof typeof RAW): string | undefined {
  const value = RAW[name];
  return value && value.length > 0 ? value : undefined;
}

export const config = {
  supabaseUrl: env('EXPO_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: env('EXPO_PUBLIC_SUPABASE_ANON_KEY'),

  googleWebClientId: env('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'),
  googleAndroidClientId: env('EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID'),

  turnstileSiteKey: env('EXPO_PUBLIC_TURNSTILE_SITE_KEY'),

  posthogKey: env('EXPO_PUBLIC_POSTHOG_KEY'),
  posthogHost: env('EXPO_PUBLIC_POSTHOG_HOST') ?? 'https://eu.i.posthog.com',

  sentryDsn: env('EXPO_PUBLIC_SENTRY_DSN'),
} as const;

/** True when there is no backend configured and we should use seed data. */
export const IS_DEMO = !config.supabaseUrl || !config.supabaseAnonKey;

/** Google Sign-In needs a client id; without one we hide the button rather than showing a broken one. */
export const GOOGLE_AVAILABLE = !IS_DEMO && Boolean(config.googleWebClientId);

export const DEFAULTS = {
  /** Walking distance first — the product's whole premise is that the tool is close. */
  searchRadiusM: 500,
  radiusOptions: [500, 1000, 3000, 5000, 10000] as const,
  currency: 'ILS' as const,
  /** Florentin, Tel Aviv. Used as the map centre before we have a location. */
  fallbackCoords: { latitude: 32.0553, longitude: 34.7688 },
  fallbackNeighbourhood: 'Florentin',
  aiTimeoutMs: 12_000,
  requestExpiryHours: 48,
} as const;
