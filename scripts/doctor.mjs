#!/usr/bin/env node
/**
 * NailedIt setup doctor.
 *
 *   npm run doctor
 *
 * Reads .env, actually calls Supabase, and tells you which step is incomplete
 * and what to do about it. Written because "it doesn't work" is a much worse
 * error message than "your project exists but the tools table is missing, so
 * the migrations have not been applied".
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const RESET = '[0m';
const BOLD = '[1m';
const DIM = '[2m';
const GREEN = '[32m';
const YELLOW = '[33m';
const RED = '[31m';

const results = [];
const ok = (name, detail) => results.push({ level: 'ok', name, detail });
const warn = (name, detail, fix) => results.push({ level: 'warn', name, detail, fix });
const fail = (name, detail, fix) => results.push({ level: 'fail', name, detail, fix });

/**
 * Every call is time-boxed.
 *
 * A paused project, a VPN or a corporate proxy makes these requests hang
 * rather than fail, and a check that never finishes is worse than one that
 * says "couldn't reach it".
 */
const TIMEOUT_MS = 8000;

async function get(url, init = {}) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

function readEnv() {
  const path = join(root, '.env');
  if (!existsSync(path)) return null;
  const env = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (value) env[key] = value;
  }
  return env;
}

async function main() {
  console.log(`\n${BOLD}NailedIt setup check${RESET}\n`);

  const env = readEnv();

  if (!env) {
    warn(
      'Environment',
      'No .env file — running in DEMO MODE.',
      'That is fine for looking around. To use a real database, copy .env.example to .env and fill in the Supabase values.',
    );
    report();
    return;
  }

  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    fail(
      'Supabase keys',
      'EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.',
      'Supabase dashboard → Project Settings → API. Copy "Project URL" and the "anon public" key.',
    );
    report();
    return;
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)) {
    warn('Supabase URL', `Looks unusual: ${url}`, 'It should look like https://abcdefgh.supabase.co');
  } else {
    ok('Supabase URL', url);
  }

  // ── Can we reach the project at all? ─────────────────────────────────────
  const headers = { apikey: anon, Authorization: `Bearer ${anon}` };
  const base = url.replace(/\/$/, '');

  try {
    const res = await get(`${base}/rest/v1/`, { headers });
    if (res.status === 401) {
      fail(
        'Connection',
        'Supabase rejected the key (401).',
        'Project Settings → API Keys. Copy the "publishable" key (sb_publishable_…) or the legacy "anon public" key. NOT the secret / service_role key.',
      );
      report();
      return;
    }

    // Supabase answers in JSON, always — even its errors. A plain-text refusal
    // is something in the middle: a VPN, a corporate proxy, a DNS filter. Say
    // so and stop, because every check after this one would report a fault
    // that isn't there.
    const contentType = res.headers.get('content-type') ?? '';
    if (!res.ok && !contentType.includes('json')) {
      fail(
        'Connection',
        `Something between you and Supabase refused the request (HTTP ${res.status}, not a Supabase reply).`,
        'A VPN, corporate proxy or network filter is blocking *.supabase.co. Try another network, then run this again.',
      );
      report();
      return;
    }

    ok('Connection', `Reached the project (HTTP ${res.status}).`);
  } catch (error) {
    fail(
      'Connection',
      `Could not reach ${base} — ${error.message}`,
      'Check the URL and your internet, and that the project is not paused (free projects pause after about a week idle). If you are behind a corporate proxy or VPN it may be blocking *.supabase.co.',
    );
    report();
    return;
  }

  // ── Have the migrations been applied? ────────────────────────────────────
  try {
    const res = await get(`${base}/rest/v1/tool_categories?select=slug&limit=1`, { headers });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0) {
        ok('Database schema', 'Tables exist and the categories are seeded.');
      } else {
        warn('Database schema', 'Tables exist but tool_categories is empty.', 'Re-run the first migration.');
      }
    } else {
      fail(
        'Database schema',
        `tool_categories is not readable (HTTP ${res.status}).`,
        'The migrations have not been applied. Run `supabase db push`, or paste the files in supabase/migrations/ into the SQL editor in order.',
      );
    }
  } catch (error) {
    fail('Database schema', error.message, 'Check the connection above first.');
  }

  // ── The geo search function is the one the whole app depends on ──────────
  try {
    const res = await get(`${base}/rest/v1/rpc/search_tools_nearby`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_lat: 32.0553, p_lng: 34.7688, p_radius_m: 3000 }),
    });
    if (res.ok) {
      const rows = await res.json();
      const count = Array.isArray(rows) ? rows.length : 0;
      if (count > 0) ok('Nearby search', `Returned ${count} tools around Florentin.`);
      else
        warn(
          'Nearby search',
          'Works, but returned nothing.',
          'Expected if you skipped the seed migration. Apply 20260101000400_seed_dev.sql to get 14 demo tools.',
        );
    } else {
      fail(
        'Nearby search',
        `search_tools_nearby failed (HTTP ${res.status}).`,
        'Apply supabase/migrations/20260101000000_initial_schema.sql — it defines this function.',
      );
    }
  } catch (error) {
    fail('Nearby search', error.message, '');
  }

  // ── The tables the tool page needs ──────────────────────────────────────
  for (const [table, label, fix] of [
    ['tool_pickup_windows', 'Pickup windows', 'Apply supabase/migrations/20260101000500_pickup_and_items.sql.'],
    ['tool_included_items', "What's included", 'Apply supabase/migrations/20260101000500_pickup_and_items.sql.'],
  ]) {
    try {
      const res = await get(`${base}/rest/v1/${table}?select=tool_id&limit=1`, { headers });
      if (res.ok) {
        const rows = await res.json();
        if (Array.isArray(rows) && rows.length > 0) ok(label, 'Table exists and has demo rows.');
        else warn(label, 'Table exists but is empty.', 'Expected if you skipped the seed migration.');
      } else {
        fail(label, `${table} is not readable (HTTP ${res.status}).`, fix);
      }
    } catch (error) {
      fail(label, error.message, fix);
    }
  }

  // ── The demo affordance ─────────────────────────────────────────────────
  try {
    const res = await get(`${base}/rest/v1/rpc/seed_demo_for_me`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: '{}',
    });
    // 401/403 is the RIGHT answer here: it means the function exists and
    // refused an unauthenticated caller, which is what it should do.
    if (res.status === 404) {
      fail(
        'Sample data helper',
        'seed_demo_for_me() is missing.',
        'Apply supabase/migrations/20260101000700_demo_helpers.sql. Settings → Load sample data needs it.',
      );
    } else if (res.status === 401 || res.status === 403 || res.ok) {
      ok('Sample data helper', 'seed_demo_for_me() is installed and refuses anonymous callers.');
    } else {
      warn('Sample data helper', `Unexpected reply (HTTP ${res.status}).`, '');
    }
  } catch (error) {
    warn('Sample data helper', error.message, '');
  }

  // ── The privacy guarantee, checked from outside ──────────────────────────
  try {
    const res = await get(`${base}/rest/v1/tool_locations?select=tool_id&limit=1`, { headers });
    const rows = res.ok ? await res.json() : null;
    if (Array.isArray(rows) && rows.length > 0) {
      fail(
        'Location privacy',
        'EXACT COORDINATES ARE PUBLICLY READABLE. This is the one thing that must never be true.',
        'Row Level Security is off on tool_locations. Re-apply the initial schema migration and check RLS is enabled in the dashboard.',
      );
    } else {
      ok('Location privacy', 'tool_locations is not readable with the anon key. Correct.');
    }
  } catch {
    ok('Location privacy', 'tool_locations refused the request. Correct.');
  }

  // ── Auth providers ───────────────────────────────────────────────────────
  try {
    const res = await get(`${base}/auth/v1/settings`, { headers });
    if (res.ok) {
      const settings = await res.json();
      const providers = settings.external ?? {};

      if (providers.google) ok('Google sign-in', 'Enabled on the Supabase project.');
      else
        fail(
          'Google sign-in',
          'The Google provider is turned off.',
          'Supabase → Authentication → Sign In / Providers → Google. You need a Google Cloud OAuth client id and secret.',
        );

      if (settings.external_anonymous_users_enabled) ok('Guest mode', 'Anonymous sign-in is enabled.');
      else
        fail(
          'Guest mode',
          'Anonymous sign-in is off, so guests cannot browse.',
          'Supabase → Authentication → Sign In / Providers → turn on "Allow anonymous sign-ins".',
        );

      if (settings.mailer_autoconfirm === false) {
        ok('Email confirmation', 'On — new accounts must confirm.');
      } else {
        warn(
          'Email confirmation',
          'Off. Accounts are usable without confirming an address.',
          'Fine while testing. Turn it on before real users, and configure SMTP or the emails will not send.',
        );
      }
    } else {
      warn('Auth settings', `Could not read them (HTTP ${res.status}).`, '');
    }
  } catch (error) {
    warn('Auth settings', error.message, '');
  }

  if (env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) {
    ok('Google client id', 'Set — the native One Tap sheet will be used in a development build.');
  } else {
    warn(
      'Google client id',
      'Not set in .env.',
      'Optional. Without it Google sign-in still works through the browser flow, which is what Expo Go uses anyway.',
    );
  }

  report();
}

function report() {
  const width = Math.max(...results.map((r) => r.name.length)) + 2;
  for (const r of results) {
    const mark = r.level === 'ok' ? `${GREEN}OK  ${RESET}` : r.level === 'warn' ? `${YELLOW}WARN${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`  ${mark}  ${r.name.padEnd(width)} ${r.detail}`);
    if (r.fix) console.log(`        ${DIM}${' '.repeat(width)} → ${r.fix}${RESET}`);
  }

  const failures = results.filter((r) => r.level === 'fail').length;
  const warnings = results.filter((r) => r.level === 'warn').length;

  console.log();
  if (failures === 0 && warnings === 0) {
    console.log(`  ${GREEN}${BOLD}Everything is wired up.${RESET} Run ${BOLD}npm start${RESET}.\n`);
  } else if (failures === 0) {
    console.log(`  ${GREEN}Ready to run${RESET} — ${warnings} thing(s) worth knowing about above.\n`);
  } else {
    console.log(`  ${RED}${failures} thing(s) need fixing${RESET} before the app will work against your project.\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\n${RED}The check itself crashed:${RESET}`, error.message, '\n');
  process.exitCode = 1;
});
