# NailedIt

**Someone nearby has it.**

An Android-first app for lending and renting tools between neighbours.
React Native (Expo) + Supabase (Postgres/PostGIS) + Gemini for photo identification.

---

## Run it on your PC — start here

You need **Node.js 20 or newer**. If `node -v` in PowerShell prints nothing or
a number below 20, install the LTS build from nodejs.org first and reopen the
terminal.

Open PowerShell in this folder and run:

```powershell
npm install
npm start
```

`npm install` takes a few minutes the first time. `npm start` prints a QR code
and a menu.

**To see it on your PC:** press `w`. It opens in your browser at
`localhost:8081`. Everything works there except the camera — that is native,
and a browser has none. The map works everywhere (see below).

**To see it on your phone:** install **Expo Go** from the Play Store, then scan
the QR code with it. Your phone and PC must be on the same Wi-Fi. This is the
better way to judge it — it is a phone app.

Run `npm run doctor` at any point to see what is and is not configured.

### Two modes, one codebase

| | when | what you get |
|---|---|---|
| **Demo** | no `.env` | 14 tools around Florentin held in memory. Nothing is saved; restarting resets it. |
| **Live** | `.env` present | Your real Supabase project. Accounts, listings, messages and ratings all persist. |

`.env` is already filled in with your project. **Delete `.env` to drop back into
demo mode** at any time — the same code runs both, so this is the fastest way to
tell a data problem from a code problem.

**Try these four things first**, because they are the product:

1. Tap **I NEED A TOOL** → tap *"I need to make a hole in a concrete wall"*.
   Watch it turn a described job into hammer drills, and say so in a chip you
   can undo.
2. Open **Bosch Cordless Drill** → the owner card, the pickup windows, what's
   in the box. Tap **Borrow**: as a guest a sheet rises saying *"Sign in to ask
   Daniel for the Bosch Cordless Drill"* — not "create an account" — and
   **Keep browsing** puts you back exactly where you were.
3. **Explore** → **Map**. Every pin is a fuzzed point, and the caption says so.
4. Settings → Language → **עברית**. The whole app mirrors.

### Seeing no tools? Read this first

The demo listings are in **Florentin, Tel Aviv**, and the app searches within
3 km of *you*. If you are anywhere else, the correct answer to "what's nearby"
is nothing, and the app says so. Two ways to fix it:

- **Fastest, works as a guest:** tap the area chip under the logo on Home and
  pick a Tel Aviv neighbourhood. Tools appear immediately.
- **Best for showing people:** sign in, then **Settings → Move sample tools to
  my area**. It picks the whole demo neighbourhood up and sets it down around
  you — the drill stays 300 m away, the ladder 700 m, the layout intact. Now
  the demo is local to whoever you are showing it to.

If the list is empty *and* you are in Tel Aviv, that is a real fault: run
`npm run doctor`. It calls your project and names the step that is incomplete,
and it tells a missing migration apart from a blocked network.

### What needs more than Expo Go

Only the **camera** (the photo step of listing). Everything else, including the
map, runs in Expo Go and on web — the map falls back to a drawn schematic with
the pins in their true relative positions, and swaps itself for Google Maps
automatically once you make a development build.

- **Easiest, nothing to install:** `npx eas build --profile development --platform android`.
  Free account at expo.dev; it builds in the cloud and gives you an APK link.
- **Local:** install Android Studio, then `npx expo run:android`.

Until then, the listing flow still works from **Choose from gallery**.

---

## What's here

```
app/                  Screens. The folder tree IS the navigation tree.
src/
  components/         primitives/ (Button, Text, Sheet…) and domain/ (ToolCard, Wordmark, Icon…)
  features/           auth/ tools/ search/ listing/ transactions/ chat/ location/ notifications/
  lib/                api/ (demo + live), config, format, geo, analytics, supabase
  schemas/            Zod — shared with the Edge Functions
  theme/              tokens.ts — every colour, size and space in the app
  i18n/               en.json + he.json. No string is ever hard-coded.
  demo/               seed data for demo mode
supabase/
  APPLY-ALL.sql       every migration in order, for pasting into the SQL editor
  migrations/         the database, in order
  functions/          Edge Functions (Deno)
  tests/              SQL assertions — run these in CI
docs/                 the Phase 1 planning set
tests/                unit tests
```

**House rules:** no file over ~250 lines · hooks fetch, components render ·
every user-visible string comes from `t()` · every money value is agorot
(integer) until the moment it is formatted · every distance is metres.

**Two brand colours, and they mean different things.** Teal is *getting* —
needing, borrowing, finding. Blue is *giving* — listing, offering, messaging.
They are `colors.accent` and `colors.offer`; never swap them for variety.

---

## Going live — the setup, in order

Each step produces one or more environment values. Nothing before step 6 costs money.

### 1. The database (~5 min) ✅ project created

Your project is `ycdnowjhttgtskbilmnx`, and `.env` already points at it.
What remains is applying the schema:

**The one-paste way (no tools to install):**
Supabase dashboard → **SQL Editor** → **New query** → paste the whole of
`supabase/APPLY-ALL.sql` → **Run**. It is one file containing every migration
in order, and it is safe to run twice — the seed skips itself if tools exist.

**Or with the CLI:**
```bash
npm i -g supabase
supabase link --project-ref ycdnowjhttgtskbilmnx
supabase db push
```

Then, still in the dashboard:

- **Authentication → Sign In / Providers → turn on "Allow anonymous sign-ins"**.
  Guest browsing does not work without it.
- **Authentication → URL Configuration → Redirect URLs**, add:
  ```
  nailedit://auth/callback
  http://localhost:8081
  ```

Finally run `npm run doctor`. It calls your project and names anything missing —
including checking, from outside, that exact coordinates are *not* publicly
readable.

**The demo data.** `APPLY-ALL.sql` seeds 14 listings across six neighbours,
with pickup windows, "what's included", one accepted borrow with its chat, and
one pending request. That conversation belongs to the seed users, so RLS quite
correctly hides it from you. To get your own copy: sign in, then
**Settings → Load sample data**. Drop
`supabase/migrations/20260101000700_demo_helpers.sql` before a public launch.

### 2. Email — do this before you think you need it (~20 min)

**Password sign-in does not work without it.** Supabase's built-in mail sender
is capped at **2 messages per hour** and only delivers to your own team's
addresses — it physically cannot send a user a password reset.

1. Create a **Resend** account (free tier is plenty), add your domain, and set
   the SPF and DKIM records it gives you. Without those the mail lands in spam
   and people conclude the app is broken.
2. Supabase → **Authentication → SMTP Settings** → paste the Resend credentials.
3. Supabase → **Authentication → Providers → Email**: turn **Confirm email** on.
4. Supabase → **Authentication → Policies**: turn on **leaked password
   protection** (checks against HaveIBeenPwned) and set minimum length 8.

### 3. Google sign-in (~15 min) ⚠️ NOT DONE YET

**This is why the Google button does not work.** Supabase reports
`provider is not enabled` because no Google OAuth client exists yet. The app
now checks that at startup and hides the Google button rather than offering
one that fails — it comes back on its own the moment you finish this step.

The last action below — pasting the client *secret* into Supabase — is yours
to do: I don't handle credentials, even yours.

Google sign-in works **two ways**, and you do not need a native build to test it:

- **Browser flow** — used in Expo Go, on web, and as the fallback everywhere.
  Needs only the Supabase project plus a Google OAuth *web* client.
- **Native One Tap sheet** — nicer, used automatically once you make a
  development build and set `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.

The app picks whichever is available, so start with the browser flow.

1. **Google Cloud Console** → create a project → **APIs & Services → OAuth
   consent screen** → External → fill in the app name and your email.
2. **Credentials → Create credentials → OAuth client ID → Web application.**
   Under **Authorised redirect URIs** add exactly this:
   ```
   https://ycdnowjhttgtskbilmnx.supabase.co/auth/v1/callback
   ```
3. Copy the **client ID** and **client secret**.
4. **Supabase → Authentication → Sign In / Providers → Google** → turn it on,
   paste both, save.
5. Check the redirect URLs from step 1 are in place. Without them the browser
   comes back and the app never receives the session.

Optional, only once you make a development build:

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=<the web client id from step 3>
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=<an Android OAuth client, needs your SHA-1>
```

### 4. Gemini, for photo identification (~5 min)

1. Get an API key from Google AI Studio.
2. Set it as an Edge Function secret — **never in `.env`**:
   ```bash
   supabase secrets set GEMINI_API_KEY=...
   supabase secrets set GEMINI_MODEL=gemini-2.5-flash-lite
   supabase functions deploy identify-tool interpret-query \
     send-notification match-tool-request delete-account
   ```
3. Set a **budget alert** on the Google Cloud project. At Flash-Lite pricing one
   identification costs a fraction of an agora, but an unbounded key is how a
   hobby project receives a surprising bill.

### 5. Maps (~10 min)

The drawn map works everywhere and costs nothing, so this is optional until you
want real streets.

1. Google Cloud → enable **Maps SDK for Android** → create an API key.
2. **Restrict it** to your Android package name + SHA-1, **cap its quota**, and
   **set a billing alert**. All three. An unrestricted Maps key is the classic
   way to get a four-figure invoice.
3. Put the key in EAS rather than in git:
   ```bash
   eas secret:create --name GOOGLE_MAPS_ANDROID_KEY --value <key>
   ```
   then reference it in `app.json` under `android.config.googleMaps.apiKey`.

### 6. Push notifications (~10 min)

1. Firebase console → add an Android app with package `app.nailedit.android`.
2. Download `google-services.json`, and upload the FCM v1 **service account
   key** to EAS: `eas credentials` → Android → FCM V1.
3. Nothing else — Expo's push service handles the rest, free.

### 7. Anti-abuse (~5 min)

Cloudflare Turnstile → create a site. The **site** key goes in `.env`
(`EXPO_PUBLIC_TURNSTILE_SITE_KEY`); the **secret** key goes in Supabase →
Authentication → Attack Protection. Anonymous sign-in creates a database row
without a login, so it needs a CAPTCHA in front of it.

### 8. Scheduled jobs

In the Supabase SQL editor:

```sql
select cron.schedule('expire-requests',  '0 * * * *',  $$select public.expire_stale_requests()$$);
select cron.schedule('publish-ratings',  '0 2 * * *',  $$select public.publish_stale_ratings()$$);
select cron.schedule('purge-guests',     '0 3 * * *',  $$select public.purge_stale_guests()$$);
select cron.schedule('purge-ai-temp',    '0 3 * * *',  $$select public.purge_ai_temp()$$);
```

Plus a scheduled call to the `send-notification` function every minute or two.

### 9. Google Play (~$25, and start the clock early)

Register the developer account **now**, before the app is finished. A new
personal developer account needs **12 testers running a closed test for 14
continuous days** before it can publish publicly. That clock, not the code, is
usually what delays a launch.

---

## Running the checks

```powershell
npm run doctor        # what is set up and what is not
npm run typecheck     # 0 errors
npm test              # 28 tests
```

`npm run doctor` is the one to reach for when something does not work. It reads
your `.env`, actually calls your Supabase project, and names the step that is
incomplete. It also distinguishes "the migrations aren't applied" from "a VPN is
blocking supabase.co", which are the two things that look identical from inside
the app.

End-to-end flows (needs a development build and Maestro — see `e2e/README.md`):

```powershell
maestro test e2e/
```

Database assertions (needs Postgres 16 + PostGIS; no Supabase required — on
Windows the easiest route is Docker: `docker run -d -p 5432:5432 -e
POSTGRES_PASSWORD=postgres postgis/postgis:16-3.4`, or just let GitHub Actions
run them, which is what `.github/workflows/ci.yml` does):

```bash
createdb nailedit_test
psql -v ON_ERROR_STOP=1 -d nailedit_test -f supabase/tests/_local_auth_stub.sql
psql -v ON_ERROR_STOP=1 -d nailedit_test -f supabase/migrations/20260101000000_initial_schema.sql
psql -v ON_ERROR_STOP=1 -d nailedit_test -f supabase/migrations/20260101000100_rpcs.sql
psql -v ON_ERROR_STOP=1 -d nailedit_test -f supabase/migrations/20260101000200_retention.sql
psql -d nailedit_test -1 -f supabase/tests/guest_boundary.sql
psql -d nailedit_test -1 -f supabase/tests/transaction_loop.sql
psql -d nailedit_test -1 -f supabase/tests/deletion_retention.sql
```

**Do not skip the SQL tests in CI.** Three of those assertions are load-bearing:

- no non-owner can read `tool_locations` (a leak there is a burglary tool);
- a guest session cannot insert a `borrow_request`;
- deleting an account does not destroy the *other* person's record of the exchange.

Each of those broke at least once while this was being built, and each was
caught by running the query rather than by reading the schema.

---

## Four things worth knowing before you change anything

**1. The exact address lives in its own table.** `tools` is public and holds a
*fuzzed* point — a stable 100–200 m offset derived from the tool's id.
`tool_locations` holds the real one and is owner-only. The single path to a real
coordinate is `get_pickup_location()`, which checks the caller is a participant
*and* the transaction is accepted. The fuzz is deterministic on purpose: a pin
that re-randomises each read can be averaged back to the true point.

**2. The AI is never on the critical path.** Every failure — no model, timeout,
quota, offline, low confidence — lands on the manual picker within 12 seconds
with the photo attached. The confidence dial on Add Tool never travels alone:
the *server* has already blanked any model number below 0.70 confidence before
the screen sees it, so a tampered client cannot make the app state a model the
vision model was unsure about.

**3. Guests hold a real session.** Guest mode is a Supabase anonymous sign-in,
not "no account". That is what makes the upgrade lossless: the user id survives,
so a guest who hearted four drills finds four hearted drills after signing in.
`public.is_member()` reads the `is_anonymous` JWT claim and gates every write
policy — "guests can't borrow" is enforced once, in the database, for every
client.

**4. Ranking is a formula you can tune, in two places at once.** Nearby results
score `0.45·distance + 0.20·availability + 0.15·fit + 0.12·reputation +
0.08·free`, which is why a free tool available now can outrank a paid one that
is closer. The same formula appears in `search_tools_nearby` (SQL) and in
`src/lib/api/demo.ts` — change one and you must change the other, or demo mode
and production will disagree about what "nearest" means.

---

## What is deliberately not built

In-app payments, deposits, ID verification, insurance, delivery, commercial
accounts, and the task→toolkit AI advisor. Every one of them has its column,
table or enum value already in the schema — turning any of them on is an
implementation, not a migration against live data. `docs/01-product-plan.md` §5
has the full list and the reasoning.

**Before a public launch you need a lawyer**, not a template, for the Terms and
the Privacy Policy. People will borrow circular saws from strangers, and the
liability position on that is not something to improvise.
