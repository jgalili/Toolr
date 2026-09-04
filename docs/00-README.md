# Toolr — Phase 1 planning set

A neighbourhood tool-sharing app. Android-first, Israel-first, EN + HE with full RTL.

> **Status: Phase 1 complete. No application code written yet — by design.**
> The schema in `sql/001_initial_schema.sql` has been applied to a live Postgres 16 + PostGIS instance
> and its privacy guarantees tested (see `06-security-privacy.md` §1).

## Documents

| File | What's in it |
|---|---|
| `01-product-plan.md` | Concept, personas, journeys, MVP scope, exclusions, monetization, trust & safety, risk register |
| `02-technical-plan.md` | Every stack decision with its rejected alternative and its cost. Payments architecture |
| `03-information-architecture.md` | Navigation tree, all ~35 screens with states, component inventory |
| `04-database-schema.md` | Why the schema is shaped this way; state machines; indexes; retention |
| `05-ai-tool-identification.md` | Photo → AI → confirmation → listing, with the confidence policy and every fallback |
| `06-security-privacy.md` | Location privacy, RLS model, secrets, Play requirements, deletion |
| `07-build-plan.md` | Phase 2: repo layout, six milestones, test strategy |
| `sql/001_initial_schema.sql` | The runnable migration — 24 tables, 18 enums, 39 RLS policies, the geo search RPC, the guest/member gate |

## The decisions, in one table

| | Choice | The deciding reason |
|---|---|---|
| Mobile | **React Native + Expo (SDK 54+), TypeScript** | One language app-to-server; cloud builds with no local Android toolchain; OTA updates |
| Backend | **Supabase** | PostGIS. Firestore has no native geo query, and this app is a geo query |
| Database | Postgres 16 + PostGIS | Relational transactional data; RLS expresses the privacy rule directly |
| Auth | Supabase Auth — guest, email+password, Google | Guests browse on an anonymous session that upgrades in place; the wall appears only at the moment of action |
| Storage | Supabase Storage, 4 buckets | Built-in image transforms; private buckets for evidence and AI temp |
| Geo | `geography` + GiST + `ST_DWithin` via one `SECURITY DEFINER` RPC | Verified index scan at 5,000 rows |
| Maps | `react-native-maps`, Google provider | Correct Hebrew labels; **set a quota cap and billing alert on day one** |
| Push | Expo Push → FCM v1 | Free; every push is also an in-app inbox row |
| AI | Gemini Flash-Lite, server-side only, JSON schema | Cheapest capable multimodal; user always confirms |
| Analytics | PostHog (EU) + Sentry | Free tiers; no PII in events |
| Payments | **None in V1** — FREE or cash/Bit direct | Play exempts physical-goods rentals from Play Billing; Stripe doesn't serve Israel, so we build to a `PaymentProvider` interface instead |

**Run cost for the pilot: ~$25–35/month, plus $25 once for the Play developer account.**

> Email + password sign-in adds one hard dependency: a real transactional email provider (Resend free
> tier). Supabase's built-in sender is capped at 2 messages/hour and only reaches your own team — it
> cannot deliver a password reset to a user.

## The three things most likely to sink this

1. **Cold start.** Zero tools means zero users. One neighbourhood, seeded by hand, with "I need a tool"
   broadcasts as the empty-state CTA.
2. **Location privacy.** A leak here is a burglary tool. Mitigated structurally (separate table + RLS +
   deterministic fuzz + rounded distances) and tested.
3. **Play's 14-day closed-testing requirement.** Not a technical risk, but it is usually the thing that
   actually delays launch. Start it on day one.

## The product test

> Could my neighbour understand this without instructions?

If not, simplify it. Toolr is not equipment-management software. It is
*"I need a drill → someone nearby has one → borrow it."*
