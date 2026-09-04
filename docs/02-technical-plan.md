# Toolr — Technical Plan (Phase 1)

Every decision below is stated as **Decision → Why → What we rejected → What it costs**.
Context that drove the weighting: *solo builder, cost-sensitive, Android-first, Israel-first, Claude does
the implementation.*

---

## 1. Mobile framework

### Decision: **React Native via Expo (SDK 54+), TypeScript, EAS Build, expo-router**

**Why**

- **One language across the whole stack.** Supabase Edge Functions run Deno/TypeScript. The app is
  TypeScript. Types generated from the Postgres schema (`supabase gen types typescript`) are imported
  *directly* by both the app and the functions. With Flutter, the AI/vision/server layer would be Dart on
  one side and TS on the other, and every schema change would need two hand-maintained models.
- **No local Android toolchain required.** EAS Build compiles the APK/AAB in the cloud. For a solo,
  cost-sensitive builder this removes Android Studio, SDK managers and Gradle from the critical path
  entirely — you go from `git push` to an installable build.
- **Every capability the brief needs is a first-party Expo module**, config-plugin ready:
  `expo-camera`, `expo-image-manipulator` (client-side resize), `expo-image-picker`, `expo-location`,
  `expo-notifications`, `expo-localization`, `expo-speech-recognition` / native STT, `expo-secure-store`.
  Maps come from `react-native-maps` with the Google provider.
- **Expo's push service is free and abstracts FCM**, which removes an entire class of setup work.
- **OTA updates (`expo-updates`)** let us ship JS-only fixes without a Play review — enormously valuable
  in the first weeks of a pilot.
- **RTL is workable**: `I18nManager` + logical layout props. Not free, but a known quantity.

**Rejected**

- **Flutter** — genuinely the better choice for pixel-identical custom UI and for animation-heavy
  products, and its Dart tooling is excellent. Rejected on stack cohesion (Dart client + TS server),
  a less mature `supabase_flutter` surface for realtime + storage edge cases, and no OTA update story
  as clean as `expo-updates`. If the app were UI-showpiece-first rather than data-and-trust-first,
  this decision could flip.
- **Native Kotlin** — best Android experience, worst time-to-MVP, and forfeits iOS entirely. Rejected
  against the stated cross-platform preference.

**Cost:** EAS free tier covers low build volumes; the Production plan is ~$19–99/mo if build queues
become annoying. Local `expo run:android` builds remain a $0 fallback.

**Key libraries**

| Concern | Choice |
|---|---|
| Navigation | `expo-router` (file-based, typed routes, deep links for push) |
| Server state | TanStack Query (caching, retries, offline-ish behaviour, optimistic updates) |
| Client state | Zustand (small — session, filters, draft listing) |
| Forms | React Hook Form + Zod (schemas shared with Edge Functions) |
| i18n | `i18next` + `react-i18next` + `expo-localization` |
| Styling | Nativewind (Tailwind) *or* a small typed theme + StyleSheet. Prefer the typed theme — one place for the type scale, spacing and colours, and no RTL surprises from utility classes |
| Maps | `react-native-maps` (Google provider on Android) |
| Images | `expo-image` (built-in caching, blurhash placeholders) |
| Analytics | `posthog-react-native` |
| Errors | Sentry (`@sentry/react-native`), free tier |

---

## 2. Backend

### Decision: **Supabase**

**Why — this is really a geospatial and authorization decision.**

1. **PostGIS.** Toolr's core query is *"active tools within R metres of me, matching these types, ordered
   by a blended score."* In Postgres that is one indexed `ST_DWithin` query. In Firestore there is no
   native geo query — the standard workaround is geohash prefix ranges fanned out over 9 bounding-box
   queries, then re-filtered client-side, and it composes badly with the other filters we need (free
   only, category, price, availability window). This alone decides it.
2. **Row Level Security expresses our privacy rule directly.** "Exact pickup coordinates must not be
   publicly queryable" becomes a policy on a table, enforced by the database, not by remembering to
   filter in every code path. Firestore Security Rules can do row-level checks but cannot express
   "return a derived, fuzzed value instead of the real one" — that needs a SQL function.
3. **Relational data.** Requests → transactions → ratings → disputes is a graph with real integrity
   constraints, foreign keys and joins. It is the wrong shape for a document store.
4. **Cost.** Free tier: 500 MB DB, 1 GB storage, 5 GB egress, 50,000 MAU, 500k Edge Function
   invocations/month, 200 concurrent realtime connections. Pro is $25/mo. Firebase Cloud Functions
   require the pay-as-you-go Blaze plan just to exist, so "free" is misleading there.
5. **Storage with on-the-fly image transformations** — thumbnails without writing a resize pipeline.
6. **Realtime** over Postgres changes gives us chat with no extra service.

**What we give up by not choosing Firebase** — and how we cover it:

| Firebase advantage | Our cover |
|---|---|
| FCM push is native and battle-tested | Expo Push Service (sits on FCM v1); Android needs an FCM service-account key uploaded to EAS |
| Google Sign-In integration is seamless | Supabase Auth has a first-class Google provider; on Android we use the native Google One Tap flow and exchange the ID token via `signInWithIdToken` |
| Crashlytics | Sentry |
| Firebase Analytics (free, unlimited) | PostHog free tier (1M events/mo) |
| App Check (anti-abuse) | Auth-required Edge Functions + Postgres-enforced rate limits |

**Cost note:** the Supabase free tier **pauses a project after ~1 week of inactivity**. Fine during
development; move to Pro before the pilot.

---

## 3. Database

**Postgres 15+ with PostGIS**, managed by Supabase. Full schema, indexes and RLS policies in
`04-database-schema.md` and `sql/001_initial_schema.sql`.

Principles:

- **Money is `bigint` in agorot** (₪1 = 100 agorot). Never floats. `currency char(3)` on every money row
  so international expansion is a data change, not a migration.
- **Timestamps are `timestamptz`**, always UTC, formatted in the client's timezone.
- **Enums are Postgres enums** for states that the app branches on, so an invalid state cannot be written.
- **Soft delete (`deleted_at`) for tools; hard delete for accounts** (with anonymised tombstones on
  transactions so the counterparty's history stays coherent).
- **Every table has RLS enabled.** No exceptions, including lookup tables (which get a permissive
  read-only policy).
- Migrations live in `supabase/migrations/`, applied with the Supabase CLI, versioned in git.

---

## 4. Authentication & identity

### Decision: **Supabase Auth. Four ways in: guest, email + password, Google, and (later) Facebook / Apple behind one provider-agnostic layer.**

#### 4.1 The identity ladder

| Level | How you get there | What you can do |
|---|---|---|
| **Guest** | Automatic on first open. No tap, no form. A real Supabase **anonymous session** (`is_anonymous = true`). | Browse, search, map, tool detail, natural-language search (lower AI quota), favourites, set your area, change language |
| **Member** | Email + password, or Google — one tap from wherever they were | Everything: list, borrow, message, rate, tool requests, push notifications |
| **Verified** *(V1.1)* | Phone OTP, later ID | A trust badge; a prerequisite for high-value tools once deposits exist |

**Guests browse; they do not borrow.** That is a deliberate reversal of the first instinct, and it is worth
being explicit about why. A borrow request is the moment a neighbour agrees to hand over physical
property. If the person on the other side is unaccountable, the owner carries all of the risk — and the
predictable outcome is not that guests borrow happily, it is that owners turn guest requests off after
the first tool that doesn't come back, quietly killing the feature. Requiring an account at that exact
moment costs one tap and buys the owner a name, a verified email and a rating history to build on.

#### 4.2 Why guest mode is an anonymous *session*, not "no session"

We could serve guests with the public anon key and no session at all. Using a real anonymous session
instead buys three specific things:

1. **The upgrade is lossless.** Supabase identity linking keeps the *same* `auth.users.id` when an
   anonymous user adds an email/password or links Google. Favourites, AI quota and the analytics identity
   all carry over with no migration step. A guest who has hearted four drills and then signs in finds
   four hearted drills — not an empty account.
2. **Guests can be rate-limited individually.** Natural-language search costs money per call. A stable
   per-guest identity means a quota row, rather than a device fingerprint or an IP bucket that punishes
   everyone behind one café's Wi-Fi.
3. **The rule is expressible in the database.** The JWT carries an `is_anonymous` claim, so
   `public.is_member()` gates every content-creating RLS policy. "Guests cannot borrow" is enforced once,
   in Postgres, for every client — not re-implemented in each screen.

The cost is one `auth.users` row per device that ever opens the app. Mitigated by:
**Cloudflare Turnstile on the anonymous sign-in endpoint** (Supabase's own recommendation, since it is an
unauthenticated row-creating endpoint), the built-in **30 requests/hour per IP** limit, and a nightly
`purge_stale_guests()` that deletes anonymous users idle for 30 days.

**Guests get no `profiles` row.** The profile is provisioned at exactly two moments — a normal sign-up,
and the instant a guest upgrades — by `provision_member()`, called from two triggers on `auth.users`.
So `profiles` holds one row per real person and nothing else.

#### 4.3 Email + password

The genuinely new work in this decision. It is not "just turn on a toggle":

- **Custom SMTP is mandatory, from day one.** Supabase's built-in email service is capped at
  **2 messages per hour** and will only send to pre-authorised team addresses — it is explicitly not for
  production, with no delivery SLA. Password reset and email confirmation are therefore blocked on a real
  provider. **Recommendation: Resend** (free tier covers a pilot comfortably), or Postmark/SES.
  Configuring custom SMTP also raises the Supabase limit to 30/hour, adjustable.
- **Email confirmation on.** Unconfirmed accounts cannot borrow. `verification_level` moves to `email`
  when confirmed — via a helper that only ever moves *up*, so confirming an email later never downgrades
  someone who has already verified a phone.
- **Leaked-password protection on** (Supabase checks HaveIBeenPwned), minimum length 8, and a strength
  meter that advises rather than blocks. No forced symbol/digit rules — they produce `Passw0rd!` and
  nothing else.
- **Rate limits** on sign-in and on password-reset requests, and a deliberately identical response
  whether or not the address exists, so the reset form is not an account-enumeration oracle.
- **First name is collected at sign-up** for password accounts. Google supplies it for free; the form has
  to ask.

#### 4.4 Social providers

**Google in V1.** `@react-native-google-signin/google-signin` for the native One Tap sheet, then
`supabase.auth.signInWithIdToken({ provider: 'google', token })` — no browser redirect, so it feels
native rather than like a web detour.

**Facebook and Apple are built for, not built.** Everything sits behind one `signInWith(provider)`
function and one `<SocialButtons />` component, so adding a provider is a config change plus a button.
Each has a real cost that should be paid deliberately, not by default:

- **Facebook** needs a Meta app in Live mode, business verification, a public privacy-policy URL and a
  **data-deletion request callback**. Worth adding if the pilot shows users who bounce off Google —
  plausibly true for the 55+ segment, which matters given Yossi and Michal.
- **Apple** is irrelevant to an Android-only V1, but becomes a scheduling item the moment iOS is on the
  table. App Store guideline 4.8 requires apps that use a third-party or social login to *also* offer an
  equivalent login service that limits collection to name and email, lets the user keep their email
  private, and does not collect in-app interactions for advertising. Our own email+password arguably
  qualifies, but reviewers vary and this is not a fight worth having on submission day —
  **plan to ship Sign in with Apple in the same release as iOS.**

#### 4.5 The collision everyone hits

Dana signs up with `dana@x.com` and a password. Three weeks later she taps **Continue with Google** with
the same address. Without a decision here she now has two accounts, two rating histories, and a support
ticket.

**Decision: automatic identity linking when both sides have a verified email.** Email confirmation is on,
and Google's emails arrive verified, so the addresses can be trusted to match a single person. The
settings screen shows what is linked — *"Signed in with Google · password set"* — and lets a user add a
password to a social account or link a social account to a password account. Unverified addresses are
never auto-linked; that is how account-takeover-by-signup happens.

#### 4.6 Where the wall appears

Never on browse. The auth sheet opens at the moment of action — borrow, message, list a tool, post a tool
request, rate — and it opens **over** the screen the user was on, so signing in returns them exactly
where they were, with the tool they were looking at still in front of them. The copy names the action,
not the ceremony: *"Sign in to ask Yossi for the drill"*, not *"Create an account"*.

## 5. Image storage & pipeline

Three Supabase Storage buckets:

| Bucket | Public? | Contents | RLS |
|---|---|---|---|
| `tool-photos` | public read | Listing photos | Insert/update/delete only by the tool owner |
| `avatars` | public read | Profile photos | Self only |
| `dispute-evidence` | **private** | Damage report photos | Signed URLs, participants + admins only |
| `ai-temp` | **private** | Photos uploaded for identification, TTL 24 h | Uploader only; cleaned by a nightly cron |

**Client-side, before upload** (`expo-image-manipulator`):
resize longest edge to **1600 px**, JPEG quality **0.75**, strip EXIF (critically: **strip GPS EXIF** —
otherwise a listing photo leaks the exact address we worked so hard to hide). Typical result: 200–400 KB.

For the AI call, a **separate smaller derivative** — longest edge **1024 px**, quality 0.7 — is uploaded to
`ai-temp`. Smaller images mean fewer image tokens and lower latency without measurably hurting
identification.

**Thumbnails** use Supabase Storage's image transformation query params (`?width=400&quality=70`) rather
than a generation pipeline — no extra code, cached at the CDN.

**Server-side validation** in the Edge Function: content-type sniffing (not the client-declared type),
max 8 MB, max 4096 px, decodes as a real image, and `is_tool: false` from the vision model rejects the
upload with a friendly error.

---

## 6. Geospatial search

**Model**

- `tool_locations.exact_location geography(Point,4326)` — private, owner-only, released to a counterparty
  only after a request is accepted.
- `tools.fuzzed_location geography(Point,4326)` — public. Generated **once, at insert**, by offsetting the
  exact point by a random bearing and a random distance in **[100 m, 200 m]**, seeded deterministically
  from the tool id so the pin never jitters between loads (a jittering pin can be averaged out over
  repeated reads to recover the true location — a real de-anonymisation attack).
- `tools.neighborhood_label text` — "Florentin", "near Dizengoff Center". Coarse, human, and the thing we
  actually show most of the time.

**Query** — one `SECURITY DEFINER` RPC, `search_tools_nearby(...)`:

```sql
WHERE t.status = 'active'
  AND ST_DWithin(t.fuzzed_location, ST_MakePoint(lng, lat)::geography, radius_m)
```

with a GiST index on `fuzzed_location`. `ST_DWithin` on `geography` uses the index and returns true
metre distances. Distance is returned **rounded to the nearest 50 m** so that even the fuzzed distance
cannot be trilaterated precisely.

Radii: 500 m (default) / 1 / 3 / 5 / 10 km. The default deliberately favours walking distance — the
product's premise is that the tool is *close*.

**Ranking** (computed in SQL, tunable without an app release):

```
score = 0.45 * distance_score      -- exp decay, 500 m half-life
      + 0.20 * availability_score  -- available now > today > dated > ask
      + 0.15 * fit_score           -- exact tool_type match > category match > text match
      + 0.12 * reputation_score    -- Bayesian-smoothed owner rating (avoids 1-review 5.0 domination)
      + 0.08 * free_bonus
```

**Never** fetch all tools and compute distance on-device. Beyond being slow, it ships every owner's
location to every phone.

---

## 7. Maps

### Decision: **`react-native-maps` with the Google Maps provider on Android**

- Android already has Google Play Services; the native map is familiar, fast, and RTL/Hebrew-labelled
  correctly out of the box — which matters a lot for an Israeli launch.
- **Billing reality check:** Google Maps Platform restructured in 2025 — mobile map loads are now billed
  SKUs with a monthly free usage threshold rather than the old unlimited-free mobile SDK. At MVP volumes
  this is comfortably inside the free threshold, but **verify the current threshold on the pricing page
  before launch and set a billing alert and an API-key quota cap on day one.** An unbounded Maps key is
  the classic way a hobby project receives a four-figure bill.
- **Geocoding is the expensive part, so we barely use it.** Reverse geocoding for `neighborhood_label`
  uses `expo-location.reverseGeocodeAsync` (device-side, free) and is done **once** when a tool is
  listed, then stored. No per-search geocoding.
- **Pins are clustered** (`react-native-map-clustering`) so a dense neighbourhood does not become a wall
  of markers, and so individual pins are harder to isolate.
- Tapping a pin shows a compact tool card sheet; the pin itself is the fuzzed point.

**Rejected:** Mapbox (better styling, but MAU-based pricing punishes exactly the growth we want, and
Hebrew label coverage is weaker). **Fallback if Google costs ever bite:** MapLibre Native + a free tile
source — a contained swap because all map usage sits behind one `<ToolMap />` component.

---

## 8. Push notifications

### Decision: **Expo Push Service → FCM v1 on Android**

- App registers, gets an Expo push token, stores it in `user_devices` (many devices per user).
- **Sending happens server-side only**, from a Supabase Edge Function `send-notification`, triggered by
  Postgres triggers / `pg_net` on inserts into `notifications`.
- Every notification is **also** a row in `notifications`, rendered in an in-app inbox. Push is a
  convenience; the inbox is the truth. This is the mitigation for aggressive OEM battery managers.
- Time-critical events (borrow request, accepted) are sent with high priority + a channel with
  `IMPORTANCE_HIGH`. Reminders use a default channel.
- Deep links: each notification carries a route (`toolr://requests/{id}`) handled by `expo-router`.
- **Notification types (V1, all transactional):** borrow request received, request accepted, request
  declined, new message, pickup reminder, return reminder (due-2h), nearby tool request matching a tool
  you own.
- **No marketing pushes in V1.** Per-type toggles in settings from day one.

---

## 9. AI image recognition

### Decision: **Google Gemini Flash-Lite tier via the Gemini API, called only from a Supabase Edge Function, with a strict JSON response schema.**

Full design in `05-ai-tool-identification.md`. Summary of the choice:

- **Gemini Flash-Lite models are the cheapest capable multimodal option** (the 2.5 Flash-Lite tier is
  around $0.10 per 1M input tokens; the 3.5 Flash-Lite tier around $0.30 in / $2.50 out). A 1024 px photo
  costs on the order of a few hundred to ~1,500 image tokens, so **one identification costs a fraction of
  an agora**. Even a generous free trial of the feature is affordable.
- **Structured output** (`responseSchema` / `responseMimeType: application/json`) gives us schema-conformant
  JSON rather than prose we have to parse — then we validate again with Zod server-side and never trust it.
- **Google Cloud Vision** was rejected as the primary: its label detection is generic
  ("tool", "hardware", "machine") and its product search requires you to build and host your own product
  catalogue. It remains a useful cheap *pre-filter* ("is this even a tool?") if cost ever matters.
- **"Google Lens API" does not exist as a public product.** The brief was right to flag this. There is no
  supported public endpoint for Lens-style product matching; anything claiming to be one is a scraper and
  is both fragile and a ToS problem. We do not use one.
- **Future refinement path:** a curated tool catalogue (a few thousand common SKUs) with image embeddings
  in `pgvector`, used to re-rank the model's brand/model guess. Designed for, not built now.

**Non-negotiable:** the API key lives in Supabase Edge Function secrets. It never ships in the app bundle,
never appears in an `EXPO_PUBLIC_*` variable, and every call is authenticated and rate-limited.

---

## 10. Analytics

### Decision: **PostHog Cloud (EU region) + Sentry**

- PostHog free tier (~1M events/month) covers the pilot comfortably; the RN SDK supports autocapture-off,
  which we want — we instrument events deliberately rather than hoovering everything.
- **EU region** for GDPR-friendliness and because Israeli users' data sitting in the EU is the easier
  privacy story.
- **No PII in event properties.** User is identified by the Supabase user UUID; never email, name, phone
  or coordinates. Location, if ever needed, is a coarse neighbourhood label, never a lat/lng.
- Events (exact names, defined once in `src/analytics/events.ts`):
  `app_opened`, `onboarding_completed`, `location_permission_result`, `signup_started`,
  `signup_completed`, `search_tool`, `search_no_results`, `view_tool`, `map_opened`,
  `tool_listing_started`, `tool_photo_uploaded`, `ai_tool_identified`, `ai_identification_failed`,
  `ai_result_accepted` / `ai_result_corrected` / `ai_result_rejected`, `tool_listing_created`,
  `borrow_requested`, `borrow_accepted`, `borrow_declined`, `message_sent`, `pickup_confirmed`,
  `return_confirmed`, `transaction_completed`, `rating_submitted`, `issue_reported`,
  `tool_request_created`, `tool_request_offer_made`.
- Sentry for crashes and Edge Function errors, with `beforeSend` scrubbing coordinates and message bodies.

---

## 11. Deployment architecture

```
┌───────────────────────────────────────────────┐
│  Android app (Expo / React Native / TS)       │
│  expo-router · TanStack Query · supabase-js   │
└───────┬─────────────────────────┬─────────────┘
        │ anon key + user JWT     │ Expo push token
        │ (RLS enforced)          │
        ▼                         ▼
┌──────────────────────┐   ┌──────────────────┐
│  Supabase            │   │ Expo Push Service│
│  ├ Postgres+PostGIS  │   └────────┬─────────┘
│  ├ Auth (Google)     │            ▼
│  ├ Storage (4 buckets)│      FCM v1 → device
│  ├ Realtime (chat)   │
│  └ Edge Functions ───┼──────► Gemini API  (server-side key)
│      identify-tool   │
│      interpret-query │
│      send-notification
│      match-tool-request
│      delete-account  │
└──────────────────────┘
        │
        ├─► PostHog (EU)   analytics
        └─► Sentry         errors
```

**Environments:** `local` (Supabase CLI + Docker) → `staging` (Supabase free project, EAS `preview`
channel, internal testing track) → `production` (Supabase Pro, EAS `production`, Play closed testing →
open testing → production).

**CI (GitHub Actions):** typecheck → lint → unit tests → `supabase db lint` → EAS build on tag.

**Play release path:** internal testing (you + 5 friends) → **closed testing with 12+ testers for 14 days**
(Google requires this for new personal developer accounts before production access) → open testing in one
neighbourhood → production. **Start the closed test early — the 14-day clock is often the actual launch
blocker.**

---

## 12. Estimated API dependencies

| Service | Purpose | Plan for MVP | Cost at MVP | Key held where |
|---|---|---|---|---|
| Supabase | DB, auth, storage, realtime, functions | Free → Pro at pilot | $0 → $25/mo | anon key in app (safe, RLS-guarded); service role key only in Edge Functions |
| Google Gemini API | Tool identification + NL query interpretation | Pay-as-you-go, Flash-Lite | < $5/mo at pilot volume | Edge Function secret |
| Google Maps Platform (Android SDK) | Map display | Free threshold + **quota cap + billing alert** | ~$0 | Android app key, restricted by package name + SHA-1 |
| Google Cloud (OAuth) | Google Sign-In | Free | $0 | Client IDs (public by design) |
| **Resend** (or Postmark/SES) | **Transactional email — confirmation, password reset. Mandatory: Supabase's built-in sender is capped at 2/hour and is not for production** | Free tier | $0 | SMTP credentials in Supabase Auth config |
| **Cloudflare Turnstile** | CAPTCHA on anonymous sign-in and password reset | Free | $0 | Secret key in Supabase Auth config |
| Expo EAS | Builds, OTA updates, push | Free tier | $0 (→ $19/mo if queues bite) | — |
| Firebase (FCM v1 only) | Android push transport | Spark (free) | $0 | Service account JSON uploaded to EAS |
| PostHog Cloud EU | Analytics | Free (1M events) | $0 | Public project key (write-only) |
| Sentry | Crash reporting | Developer (free) | $0 | DSN (public by design) |
| Google Play Console | Distribution | One-time | $25 | — |

**Total run cost for the pilot: ~$25–35/month plus a one-time $25.**

**Deliberately absent:** any payment provider. See below.

---

## 13. Payments architecture (future, but decided now)

**Play policy is not the obstacle.** Google Play's Payments policy explicitly lists *"purchases or rentals
of physical goods"* among transactions **not** supported by (and therefore not required to use) Google
Play's billing system. A peer-to-peer physical tool rental is squarely outside Play Billing, so we can use
any payment processor we like and pay Google nothing. This is settled — don't relitigate it later.

**The actual obstacle is Israel.** Stripe does not currently list Israel among its supported
countries/regions, which rules out Stripe Connect — the default answer for marketplaces — for an
Israeli-registered platform. So the architecture must not assume Stripe.

**Design consequence: a `PaymentProvider` interface, not a Stripe integration.**

```ts
interface PaymentProvider {
  createConnectedAccount(userId: string): Promise<ProviderAccountRef>
  createHold(txId: string, amountAgorot: number): Promise<HoldRef>   // deposits
  capture(holdRef: HoldRef, amountAgorot: number): Promise<CaptureRef>
  releaseHold(holdRef: HoldRef): Promise<void>
  payout(accountRef: ProviderAccountRef, amountAgorot: number): Promise<PayoutRef>
  refund(captureRef: CaptureRef, amountAgorot: number): Promise<RefundRef>
}
```

with `OfflinePaymentProvider` as the only V1 implementation (records intent, moves no money).
The `transactions` table already carries `payment_provider`, `payment_status`, `provider_ref`,
`platform_fee_agorot` and `deposit_agorot` so switching on a real provider is an implementation, not a
migration.

**Candidate providers to evaluate when the time comes** (all need direct due-diligence — marketplace
payouts to *individuals* is the hard part, not card acceptance):
Israeli gateways such as **Tranzila**, **Cardcom**, **Grow / Meshulam**, **PayPlus**; **Rapyd** (Israeli,
built for marketplace payouts); **PayPal** as a fallback for cross-border; and Stripe *if and when* Israel
becomes supported.

**V1 behaviour in the product:** a listing is either **FREE** or shows **₪X / day — paid directly to the
owner**. In Israel, "directly" in practice means cash or **Bit**, which every Israeli already has and
trusts. This is not a compromise: it removes KYC, chargebacks, tax reporting and dispute liability from
the MVP entirely, and it matches how neighbours already settle small sums.
