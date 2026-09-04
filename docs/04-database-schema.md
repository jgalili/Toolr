# Toolr — Database Schema (Phase 1)

The runnable version is `sql/001_initial_schema.sql` — 24 tables, 18 enums, 10 functions, the geospatial search RPC,
and RLS policies on every table. This document explains *why* it is shaped this way.

---

## 1. Entity map

```
auth.users
   └─1:1─ profiles ──1:1── user_private        (phone, home point — self-only)
            │       ──1:1── notification_prefs
            │       ──1:N── user_devices       (push tokens)
            │
            ├─1:N─ tools ──1:1── tool_locations   ← EXACT coordinates, owner-only
            │        │     ──1:N── tool_photos
            │        │     ──1:N── tool_availability
            │        │     ──N:1── tool_categories
            │        │
            │        └─1:N─ borrow_requests ──1:1── transactions ──1:N── ratings
            │                     │                      │        ──1:N── disputes
            │                     └─1:1── conversations ──1:N── messages
            │
            ├─1:N─ tool_requests ──1:N── tool_request_offers ──N:1── tools
            ├─1:N─ favorites, notifications, reports, blocks
            └─1:N─ ai_identification_results, ai_usage_quota

ai_query_cache          (service-role only, keyed by query hash)
```

---

## 2. The nine decisions that matter

### 2.0 Guests are real rows in `auth.users` and no rows anywhere else

Guest mode is a Supabase **anonymous session**, so a guest has an `auth.users` row with
`is_anonymous = true` — and deliberately no `profiles` row, because they cannot list, borrow, message or
rate, and a profile for them would be junk. The profile is provisioned at exactly two moments by
`provision_member()`: a normal sign-up, and the instant a guest upgrades. Two triggers on `auth.users`
call it — one on insert, one on the update where `is_anonymous` flips to false.

Two foreign keys point at `auth.users` rather than `profiles`, and both are deliberate:

- **`favorites.user_id`** — a guest can heart a drill, and because identity linking keeps the *same* user
  id through the upgrade, that heart is still there after they sign in. No migration step, no local-state
  sync code.
- **`ai_usage_quota.user_id`** — guests use natural-language search, which costs money per call. A stable
  per-guest identity gives us a quota row instead of an IP bucket that punishes everyone behind one
  café's Wi-Fi. This is the main reason guest mode uses a real session rather than an unauthenticated
  client.

`public.is_member()` reads the `is_anonymous` claim from the JWT and gates every content-creating policy.
"Guests cannot borrow" is therefore enforced once, in Postgres, for every client — not re-implemented on
each screen. It is `SECURITY DEFINER` so it does not depend on the calling role holding privileges on the
`auth` schema; the claims still come from the caller's own session.

`verification_level` moves only upward, through `greatest_verification()`. Confirming an email must never
downgrade someone who has already verified a phone.

The cost of all this is one `auth.users` row per device that ever opens the app.
`purge_stale_guests()` deletes anonymous users idle for 30 days; run it nightly.

### 2.1 The location split is the architecture

`tools.fuzzed_location` is public. `tool_locations.exact_location` is a **separate table** with an
owner-only RLS policy. This is not stylistic — Postgres RLS is *row*-level, not *column*-level, so a
public read policy on `tools` would expose every column on that row. Putting the exact point in its own
table is the only way to say "this row is public, that coordinate is not" and have the database enforce it.

Three consequences:

- The exact point is **never** returned by a normal query. The single path to it is
  `get_pickup_location(transaction_id)`, a `SECURITY DEFINER` function that checks the caller is a
  participant *and* the transaction is at least `agreed`.
- The fuzz is **deterministic** (seeded by the tool id + a salt) and applied once by a trigger. A pin that
  re-randomises on every read can be averaged over N reads to recover the true point — a genuine
  de-anonymisation attack that a "just add random noise" implementation walks straight into.
- Displayed distance is **rounded to 50 m** inside the RPC. Exact distances from three vantage points
  trilaterate a position; rounded ones don't.

### 2.2 Money is `bigint` agorot, never numeric-with-decimals, never float

`price_per_day_agorot bigint`, plus `currency char(3)` on every table that holds money. ₪15/day is
`1500`. Internationalisation later is a config change, not a migration.

### 2.3 Requests and transactions are separate tables

`borrow_requests` is the *negotiation* (pending → accepted / declined / cancelled / expired).
`transactions` is the *commitment*, created only on acceptance, with its own lifecycle
(agreed → picked_up → returned → completed, plus disputed / cancelled). Collapsing them into one row with
a bigger enum sounds simpler until you need to expire unanswered requests without touching real
transactions, or count "requests sent" separately from "exchanges completed".

Both sides confirm return independently (`owner_confirmed_return_at`, `borrower_confirmed_return_at`) —
`completed_at` is set when both agree, or by a job after a grace period when only one has.

### 2.4 The payment columns exist but V1 never writes to them

`payment_mode` is `free` or `offline` in V1; `in_app` is defined but unreachable. `payment_status`,
`payment_provider`, `provider_ref`, `platform_fee_agorot` and `deposit_agorot` all exist and are all
inert. Turning on payments later is an implementation of the `PaymentProvider` interface plus new enum
values in use — not a schema migration on a table with live data.

### 2.5 Ratings are double-blind

`ratings.is_published` starts `false`. A rating becomes visible when both sides have rated or after 7
days, whichever comes first. Without this, the first person to rate sets the tone and the second rates
retaliatorily. Reputation counters on `profiles` are only incremented when a rating *publishes*.

`smoothed_rating()` applies a Bayesian prior (4.6 stars, weight 5) so a single 5-star review doesn't
outrank forty 4.8s. This matters enormously in a young marketplace where most users have 1–2 reviews.

### 2.6 Reputation is denormalised on purpose

`rating_sum_owner` / `rating_count_owner` (and the borrower pair) live on `profiles`, maintained by
trigger. The search RPC ranks by owner reputation on every result row; a correlated aggregate over
`ratings` there would be the query's slowest part. The cost is a trigger to keep honest.

### 2.7 Blocks are enforced inside the search query

The `search_tools_nearby` RPC excludes tools from anyone the viewer has blocked *and* anyone who has
blocked the viewer. Filtering blocks in the client is how blocked users keep showing up in one screen
somebody forgot about.

### 2.8 The AI tables are the evaluation dataset

`ai_identification_results` stores the raw model response, the validated parse, the confidence, **and
what the user did about it** (`accepted` / `corrected` / `rejected` / `generic` / `abandoned`). That
column is the product's most valuable telemetry: it is the direct measurement of whether the 30-second
promise holds, and it is the training/eval set if we ever fine-tune or add a catalogue re-ranker.

---

## 3. State machines

**borrow_requests.status**

```
pending ──accept──► accepted ──► (transaction created)
   │──decline────► declined
   │──borrower cancels─► cancelled
   └──48h no response──► expired      (scheduled job)
```

**transactions.status**

```
agreed ──borrower confirms pickup──► picked_up ──return confirmed──► returned ──both rated / 7d──► completed
   │                                     │
   └──────────── cancelled ◄─────────────┘
                     issue reported at any point ──► disputed
```

**tool listing_status:** `draft → active ⇄ paused → removed`, plus `borrowed` set automatically while a
transaction is `picked_up` so the tool drops out of search without the owner doing anything.

---

## 4. Index rationale

| Index | Why it exists |
|---|---|
| `tools_fuzzed_location_gix` (GiST, partial on `status='active'`) | **The** index. Makes `ST_DWithin` an index scan. Partial, because we only ever search active listings, which keeps it small |
| `tools_search_gin` (GIN on tsvector) | Keyword search inside the radius |
| `tools_title_trgm` (GIN trigram) | Typo tolerance and substring matching, including Hebrew |
| `tools_type_idx` | The AI path filters by `tool_type = any(...)` |
| `requests_expiry_idx` (partial, pending only) | The expiry job scans a handful of rows, not the table |
| `tx_due_idx` (partial) | The return-reminder job |
| `messages_conv_idx` (conversation, created_at desc) | Chat pagination |
| `ratings_ratee_idx` (partial on published) | Profile review lists |
| `notif_unread_idx` (partial) | The tab-bar badge count |
| `tool_requests_types` (GIN on text[]) | Matching a broadcast against owners' tool types |

`to_tsvector('simple', ...)` rather than `'english'`: listings mix Hebrew and English, and the English
stemmer mangles Hebrew. Trigram search covers the fuzzy cases that stemming would have handled.

---

## 5. Data retention & deletion

| Data | On account deletion |
|---|---|
| `auth.users`, `profiles`, `user_private`, `user_devices` | Hard deleted |
| Anonymous (guest) `auth.users` rows | Purged nightly once idle 30 days, by `purge_stale_guests()` |
| `tools`, `tool_locations`, `tool_photos` (storage objects too) | Hard deleted |
| `messages` | Body replaced with a tombstone; the row survives so the counterparty's thread stays coherent |
| `transactions` | Retained with the user id replaced by a deleted-user sentinel — the other party's exchange count and history must not silently change |
| `ratings` *written by* the user | Retained, anonymised to "A former member" |
| `ratings` *about* the user | Deleted with the profile |
| `disputes` | Retained (legal/safety record), personal fields redacted |
| `ai_identification_results` | Images deleted; the parsed row is retained without the user id |
| Analytics | Deletion request issued to PostHog for that distinct id |

Implemented in a single `delete-account` Edge Function running as one transaction, invoked from
Settings → Delete account (7-day grace window, immediate sign-out).

`ai-temp` storage objects have a 24-hour TTL enforced by a nightly cron.
Expired `tool_requests` are pruned after 30 days.

---

## 6. Realistic seed data (development)

`sql/002_seed_dev.sql` (to be written in Phase 2) populates 8 profiles and ~20 tools around Tel Aviv,
including the set from the brief:

| Tool | Distance | Price |
|---|---|---|
| Bosch Cordless Drill | 280 m | FREE |
| Makita Jigsaw | 550 m | ₪15/day |
| 3 m Ladder | 700 m | FREE |
| Kärcher Pressure Washer | 1.2 km | ₪25/day |
| Black & Decker Sander | 1.4 km | FREE |

Seed points are generated around Florentin (32.0553 N, 34.7688 E) so the map and radius filters have
something honest to show. Seed data is created through the same triggers as real data — including the
fuzzing trigger — so development never accidentally exercises a path production won't.
