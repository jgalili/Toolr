# Toolr — Security & Privacy Plan (Phase 1)

---

## 1. Location privacy — the one that matters most

Toolr asks people to publish, on a map, the approximate location of a valuable object inside their home.
Getting this wrong is not a bug; it is a burglary tool.

### The rules

1. **The exact point is never public.** It lives in `tool_locations`, a separate table whose RLS policy
   admits only the owner. `tools` — the table everyone can read — holds only `fuzzed_location`.
2. **The fuzz is a stable 100–200 m offset**, deterministic from the tool id plus a server-side salt.
   Deterministic matters: re-randomising on every read lets an attacker average N reads back to the true
   point. This is the mistake most "just add jitter" implementations make.
3. **Displayed distances are rounded to 50 m** inside the search RPC. Precise distances from three
   vantage points trilaterate a position; rounded ones don't.
4. **Coarse labels are the default UI.** "Florentin", "near Dizengoff Center", "350 m away" — a
   neighbourhood name reads as friendlier *and* leaks less than a pin.
5. **The exact address is released only after acceptance**, through
   `get_pickup_location(transaction_id)` — a `SECURITY DEFINER` function that verifies the caller is a
   participant and the transaction is at least `agreed`. There is no other code path to it.
6. **The map preview on a tool page draws a circle, not a pin**, captioned *"Approximate area"*.
7. **GPS EXIF is stripped from every photo on the device before upload.** A listing photo taken in a
   living room otherwise carries the exact coordinates in its metadata — defeating everything above.
8. **Map pins are clustered**, so a single tool is rarely rendered as a lone isolated marker.
9. **Coarse location permission is what we request** (`ACCESS_COARSE_LOCATION`). Fine location is offered
   only as an optional upgrade for "centre the map on me", and the app is fully functional without any
   location permission at all (manual neighbourhood picker).
10. **We never store a location history.** `user_private.home_location` is a single optional point used
    to default the search centre; there is no trail.

### Verified, not assumed

These guarantees were tested against a live Postgres+PostGIS instance with the migration applied:

| Test | Result |
|---|---|
| Fuzz offset distance | **114 m** (inside the 100–200 m band) |
| Fuzz is deterministic across calls | **true** |
| Signed-in user reading another owner's `tool_locations` | **0 rows** |
| Anonymous client reading `tool_locations` | **0 rows** |
| Anonymous client reading active `tools` | **5,002 rows** (browse-before-signup works) |
| Geo query plan at 5,000 rows | **Bitmap Index Scan on `tools_fuzzed_location_gix`** |

And the guest/member boundary, exercised the same way:

| Test | Result |
|---|---|
| Member sign-up provisions a profile | **1 row**, `verification_level = email` |
| Guest (anonymous) sign-up provisions a profile | **0 rows** — as intended |
| `is_member()` for a guest | **false** |
| Guest reading active tools / running the search RPC | **works** |
| Guest adding a favourite | **allowed** |
| **Guest inserting a borrow request** | **refused by RLS** |
| Guest upgrade → profile created, same user id | **"Dana"** |
| Guest's favourite after the upgrade | **still there** |
| `is_member()` after upgrade, then borrowing | **true**, request accepted |
| Confirming an email on a phone-verified profile | **stays `phone`** — verification never downgrades |
| `purge_stale_guests()` on a 90-day-old guest | **1 row removed** |

Both tables belong in CI. If a future migration ever makes `tool_locations` readable, or lets a guest
write a borrow request, the build should go red before the change reaches a user.

---

## 2. Authorization model

Everything is Row Level Security. There is no "the app will remember to filter this" anywhere.

### Guests vs members

A guest holds a **real** session — Supabase anonymous sign-in — so `auth.uid()` is non-null for them.
What separates a guest from a member is the `is_anonymous` claim in the JWT, read by
`public.is_member()`. That function gates every policy that *creates* content, and no policy that *reads*
public content:

| A guest may | A guest may not |
|---|---|
| Read active listings, search, use the map | Send a borrow request |
| Use natural-language search (on a lower AI quota) | Send a message |
| Add and remove favourites | List a tool, post a tool request, rate anyone |

The rule lives in the database, so it holds for every client — including a hand-rolled one holding a
stolen anon key. Verified below.

Two abuse controls come with anonymous sign-in, because it is an unauthenticated endpoint that creates
rows: **Cloudflare Turnstile** on that endpoint (Supabase's own recommendation) and the built-in
**30 requests/hour per IP** limit. `purge_stale_guests()` deletes anonymous users idle 30 days.

| Data | Who can read |
|---|---|
| Active listings (public columns) | Everyone, including anonymous — deliberately |
| Draft / paused / removed listings | Owner only |
| Exact tool coordinates | Owner only (+ counterparty via the RPC, post-acceptance) |
| `user_private` (phone, email, home point) | Self only |
| Borrow requests | The two parties |
| Transactions | The two parties |
| Messages | Participants of that conversation only |
| Ratings | Published ones publicly; your own always |
| Disputes & evidence photos | Participants + admins (private bucket, signed URLs) |
| `ai_query_cache` | Service role only — no policy at all |

Two RLS habits worth stating because they are easy to get wrong:

- **Every policy names both `USING` and `WITH CHECK`** where writes are allowed. A `USING`-only update
  policy lets a user move a row *out* of their own visibility.
- **Every `SECURITY DEFINER` function pins its `search_path`** (`public`, or `auth, public` for the two
  that read JWT claims). Without it, a caller can shadow a function or table name via their own schema and
  hijack the definer's privileges.

---

## 2b. Password and email security

Email + password sign-in brings its own surface, and none of it is optional:

- **Leaked-password protection on** — Supabase checks candidate passwords against HaveIBeenPwned.
  Minimum length 8, with a strength meter that advises rather than blocks. No forced
  symbol-and-digit rules: they reliably produce `Passw0rd!` and nothing else.
- **Email confirmation on.** An unconfirmed account cannot borrow.
- **Custom SMTP is mandatory.** Supabase's built-in sender is capped at **2 messages per hour** and only
  delivers to pre-authorised team addresses, with no delivery SLA — it physically cannot send a user a
  password reset. Resend (or Postmark/SES) from day one; SPF/DKIM configured, or the reset mail lands in
  spam and users conclude the app is broken.
- **The reset form is not an enumeration oracle.** Identical response and identical timing whether or not
  the address exists.
- **Rate limits** on sign-in attempts, reset requests and confirmation resends, with a visible countdown
  rather than a silent failure.
- **Identity linking only on verified emails.** Auto-linking a social identity to an existing account on
  an *unverified* address is how account-takeover-by-signup works. Confirmation is on and Google's emails
  arrive verified, so the match can be trusted; nothing else auto-links.
- **Session tokens in `expo-secure-store`** (Android Keystore-backed), never AsyncStorage.

## 3. Secrets

| Secret | Where it lives | Never |
|---|---|---|
| Gemini API key | Supabase Edge Function secret | In the app bundle, in git, in an `EXPO_PUBLIC_*` var |
| Supabase **service role** key | Edge Function secrets only | In the app. Ever. It bypasses all RLS |
| Supabase **anon** key | In the app — this is correct and safe | — |
| Google Maps Android key | In the app (unavoidable) — **restricted by package name + SHA-1 fingerprint, with a usage quota cap and a billing alert** | Unrestricted |
| FCM service account | Uploaded to EAS | In the repo |
| Google OAuth client IDs | In the app — public by design | — |
| Resend / SMTP credentials | Supabase Auth config (server side) | The app or the repo |
| Turnstile secret key | Supabase Auth config | The app (the *site* key is public and belongs there) |

`.env` files are gitignored; `.env.example` documents the names and nothing else. A pre-commit secret
scan (`gitleaks`) runs in CI. If a key does leak, rotation must be a documented one-page procedure, not
an improvisation.

---

## 4. Photos

- Client resizes to 1600 px (listing) / 1024 px (AI), JPEG q0.75, **EXIF stripped including GPS**.
- Server validates by magic bytes, not the declared content type; caps at 8 MB and 4096 px.
- Buckets: `tool-photos` and `avatars` are public-read (they are listing content); `dispute-evidence`
  and `ai-temp` are private, accessed through short-lived signed URLs.
- `ai-temp` objects are deleted after 24 hours by a nightly job.
- Deleting a tool or an account deletes its storage objects in the same transaction as the rows.
- Moderation for V1 is reactive: the AI's `is_tool: false` blocks obvious non-tool uploads, and users can
  report a listing. A proactive safe-search pass is a fast follow if it becomes necessary.

---

## 5. Messages

- Scoped to a transaction. There is no open DM inbox and no user search — the two structural decisions
  that keep a marketplace from becoming a harassment surface.
- **Phone numbers are never auto-revealed.** Users can share one in chat if they choose; that is their
  decision, made deliberately.
- Block is bidirectional and enforced *in the search query itself*, so a blocked user's listings simply
  do not exist for you.
- Report copies the reported message into the report record, so deleting it doesn't destroy the evidence.
- Message bodies are excluded from Sentry breadcrumbs and from all analytics events.
- Conversations close (read-only) 30 days after a transaction completes.

---

## 6. Account & data deletion

Play requires an in-app path *and* a web path to request deletion. Both are built.

**Guests** hold nothing to delete but an anonymous row and their favourites; clearing app data or 30 days
of inactivity removes both, and the account screen offers **Forget this device** explicitly.

**In-app:** Settings → Delete account → plain-language explanation of what goes and what stays → typed
confirmation → immediate sign-out → 7-day grace window (a "reactivate" link by email) → permanent
deletion by a scheduled job.

**Web:** a public URL (`toolr.app/delete-account`) that accepts an email address and routes to the same
process, for people who have uninstalled the app.

**Data export:** Settings → Privacy → Download my data produces a JSON bundle of profile, listings,
transactions, messages and ratings, delivered by signed URL. Not strictly required for an Israel-first
launch, but it is a day-one GDPR obligation the moment a single EU user signs up, and it is far cheaper
to build now than to retrofit.

What is retained after deletion, and why, is enumerated in `04-database-schema.md` §5. The short version:
the counterparty's transaction history and their published ratings survive in anonymised form, because
one person's deletion must not silently rewrite another person's reputation.

---

## 7. Google Play requirements checklist

| Requirement | Our position |
|---|---|
| **Data Safety form** | Filled from an explicit data inventory. Declared: approximate location (app functionality, not shared, not linked for ads), photos (app functionality), name & email (account), messages (app functionality), device identifiers (push). Nothing sold. Nothing used for advertising or tracking. Guests supply none of it — worth stating in the listing, because "browse without an account" is a genuine differentiator |
| **Data deletion** | In-app + public web URL, both live before submission |
| **Privacy policy URL** | Required and linked in the listing and in-app. Must describe the location fuzzing honestly |
| **Permissions** | Only `ACCESS_COARSE_LOCATION`, `CAMERA`, `READ_MEDIA_IMAGES`, `POST_NOTIFICATIONS`, `INTERNET`. No background location, no contacts, no phone state. Every one requested in-context with a rationale screen first |
| **Target API level** | Current Play requirement at submission time; Expo SDK handles this |
| **Photo/video permissions policy** | We use the photo picker where possible and request broad media access only when genuinely needed |
| **Payments policy** | Non-issue: Play's Payments policy explicitly excludes *"purchases or rentals of physical goods"* from the Play Billing requirement. Tool rentals are physical-goods rentals. We still ship V1 with no in-app payments at all |
| **UGC policy** | In-app reporting, blocking, a published moderation standard, and a contactable owner. Marketplaces get scrutinised here — have the report flow working before review, not after |
| **Closed testing requirement** | New personal developer accounts need ~12 testers for 14 continuous days before production access. **Start this on day one of the pilot — the 14-day clock is usually the real launch blocker, not the code** |
| **Account creation → deletion parity** | If an account can be made in the app, it must be deletable in the app. Done |
| **Ads / families policy** | Not applicable — no ads, 18+ |

---

## 8. Application security practices

- **All writes go through RLS or an authenticated Edge Function.** No trusted client.
- **Zod schemas at every boundary** — Edge Function inputs, AI responses, and form inputs — with the same
  schema files imported by app and server so they cannot drift.
- **Rate limits in Postgres**, not memory: AI quotas, plus caps on borrow requests per user per day and
  messages per minute. In-memory limits are useless across serverless invocations.
- **No raw SQL from the client.** Only PostgREST calls under RLS, plus the whitelisted RPCs.
- **Tokens in `expo-secure-store`** (Android Keystore-backed), never AsyncStorage.
- **Certificate pinning** is deliberately *not* used — it breaks more often than it protects for an app
  of this shape.
- **Dependency scanning** (`npm audit` + Dependabot) in CI; `expo-updates` gives us a same-day path to
  ship a JS-side fix without a Play review.
- **Sentry `beforeSend`** scrubs coordinates, message bodies, emails and phone numbers.
- **Admin actions** (moderation, dispute resolution) run through a separate authenticated admin surface
  with the service role, never from the mobile app, and are written to an audit log.

---

## 9. Legal — the part that is not a technical problem

Two items that need a human lawyer before a public launch, not a template off the internet:

1. **Liability for injury and property damage.** People will borrow circular saws. The Terms of Service
   must be explicit that Toolr is an introduction service, does not inspect or vet tools, and makes no
   safety warranty — and the product must back that up by *not* implying vetting anywhere in the UI.
   Risk-level acknowledgement on HIGH-risk categories is both a safety measure and evidence of one.
2. **Whether the platform is a party to a rental agreement** once money is involved, and what that means
   for Israeli consumer-protection and tax rules. This is the single strongest argument for keeping V1
   free-or-cash-only: it defers the question until there is a product worth answering it for.

Also needed before launch: a privacy policy that honestly describes location fuzzing (not boilerplate),
community/safety guidelines, and a named contact for reports.
