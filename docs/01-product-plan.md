# Toolr — Product Plan (Phase 1)

> Working name: **Toolr**. The brief also used "ToolAround" in some UI copy — all in-app strings go through
> i18n keys, so the display name is a single value (`app.name`) we can change in one place. See §12.

---

## 1. Product concept

Toolr is a neighbourhood tool-sharing app that turns the drills, ladders and pressure washers gathering
dust in people's storage into a shared local resource. A person who needs a tool opens the app, says or
types what they need — in plain language, including describing the *job* rather than the tool — and sees
what is available within walking distance, sorted by how close, how cheap and how trusted it is. A person
who *has* a tool photographs it; an AI vision model identifies it, pre-fills the listing, and the owner
answers exactly two questions — free or rent, and when — before tapping **List tool**. The whole listing
takes about 30 seconds. Everything else in the product exists to make those two moments feel effortless
and safe: approximate locations until a deal is agreed, two-sided ratings, a scoped chat, and a return
confirmation. It should never feel like equipment-management software. It should feel like *"I need a
drill → someone nearby has one → borrow it."*

---

## 2. Primary personas

### P1 — Dana, 34, "The Occasional Fixer" (borrower, primary)
Rents a 3-room flat in Florentin. Wants to hang a TV, assemble IKEA furniture, put up a shelf. Owns a
screwdriver and nothing else. Will not buy a ₪400 hammer drill for one hole. Currently texts her building
WhatsApp group and hopes. Non-technical, uses Instagram and Wolt daily.
**Success = she gets a drill within a 15-minute walk today, without an awkward negotiation.**

### P2 — Yossi, 58, "The Guy With The Garage" (owner, primary)
Owns 40+ tools, uses maybe six regularly. Genuinely likes helping neighbours and slightly resents the
clutter. Suspicious of apps that want his ID and bank details. Will lend for free to build goodwill;
might charge ₪20/day for the expensive stuff.
**Success = listing takes under a minute, and he can say "no" to a request without feeling rude.**

### P3 — Adi, 41, "The Side-Income Lender" (owner, secondary)
Bought a pressure washer and a tile cutter for a renovation. Wants them to pay for themselves. Cares
about deposits, damage, and who is borrowing.
**Success = predictable small income and confidence the tool comes back.**

### P4 — Michal, 67, "The Careful Neighbour" (both, accessibility-critical)
Retired, on a mid-range Android, smaller text feels small. Wants to lend her late husband's tools to
people in the building rather than throw them out. Needs very large targets and plain Hebrew.
**Success = she can complete every flow without asking her son for help.**

**Anti-persona:** the professional rental shop. Commercial accounts are explicitly out of MVP — they
change the tone of the product from "neighbour" to "vendor" and would drown out free listings.

---

## 3. Core user journeys

### J1 — Borrow (the money journey)
1. Open app → home → **I NEED A TOOL** (or type directly into the search field).
2. Type / speak / photograph the need. Natural language accepted: *"a hole in a concrete wall"*.
3. AI maps the intent to candidate tool types (hammer drill, rotary hammer, SDS bits).
4. Results list, sorted by a blended score of distance × availability × free/paid × owner rating × fit.
   Toggle to map view. Filters are present but visually secondary.
5. Tap a result → tool detail: big photo, distance ("350 m away"), price or FREE, owner card, rating,
   availability, safety note if the tool is medium/high risk.
6. **Borrow** → pick Today / Tomorrow / choose dates → optional one-line message → send.
   *(This is where an account is required, and nowhere earlier. A guest gets a sheet over the screen
   they were already on — Google, or email and password — and lands straight back on the same tool.)*
7. Owner gets a push. Accept / Decline / Message.
8. On accept: chat opens, **exact pickup location and the owner's first name + pin are revealed**.
9. Pickup. Use. Return.
10. Return confirmation prompt to both sides → two-sided rating → done.

### J1b — The guest path
No sign-up screen exists at first open. A first-time user lands on Home and can search, browse the map,
open any tool and heart the ones they like — all on an anonymous session they never see. The account is
asked for exactly once, at the moment they tap **Borrow**, and the sheet says *"Sign in to ask Yossi for
the drill"* rather than *"Create an account"*. Because the anonymous session upgrades in place, their
hearted tools are still hearted on the other side of it.

### J2 — List a tool in 30 seconds (the supply journey)
1. Home → **I HAVE A TOOL** → camera opens immediately (no form first).
2. Snap photo → image is resized on-device and sent to our server, which calls the vision model.
3. Confirmation screen:
   - High confidence → *"We think this is: Bosch GSB 18V-55 Cordless Combi Drill"* → **YES** / **NOT QUITE**.
   - Medium → *"Which looks closest?"* with 2–4 options + **None of these**.
   - Low → *"We couldn't tell exactly. What is it?"* → category grid + "Generic cordless drill".
4. One screen with two decisions: **FREE / RENT (₪ __ per day)** and **Available now / Choose dates / Ask me**.
5. **LIST TOOL**. Everything else lives under a collapsed *"Add more details"*.

### J3 — Request a tool (demand signal, MVP-lite)
Empty search results, or a deliberate "post what you need", creates a `tool_request`
(*"Need a jigsaw tomorrow afternoon around Florentin"*). Nearby owners of matching tool types get a push:
*"Someone 600 m away is looking for a jigsaw."* → **I can lend mine** → this opens a pre-filled offer.
Included in MVP in a deliberately thin form (see §5) because it is the answer to an empty marketplace.

### J4 — Return & trust loop
Due time passes → both sides get *"Did you return the drill?"* / *"Was the drill returned?"* →
YES / REPORT ISSUE → optional two-sided rating with tag chips, not essays.

### J5 — Something went wrong
Report issue → photos + description → creates a `dispute` record and opens a support thread. MVP does
**not** adjudicate; it records, notifies both parties, and gives us the data model for a real claims
process later.

---

## 4. MVP features (V1 — ship this)

| # | Feature | Notes |
|---|---|---|
| 1 | Onboarding, 3 screens, skippable | Third screen asks for approximate location with a reason |
| 2 | **Guest mode** — browse, search, map and favourite with no account | A real anonymous session, so signing in later keeps the same identity and the same favourites |
| 3 | **Email + password** sign-up and sign-in | With confirmation, password reset, and leaked-password protection. Needs a real email provider — Supabase's built-in sender is capped at 2/hour |
| 3b | **Google Sign-In** | Native One Tap. Facebook and Apple sit behind a provider-agnostic layer for later |
| 4 | Location permission (coarse-first) | `ACCESS_COARSE_LOCATION` requested; fine only if user opts in |
| 5 | Nearby search — list + map | PostGIS radius query, server-side; 500 m default, 1/3/5/10 km |
| 6 | Natural-language search | LLM intent → tool types → keyword + category search inside radius |
| 7 | Voice input | Native speech-to-text, no extra API |
| 8 | Tool detail page | Fuzzed location until accepted |
| 9 | Add a tool via photo | Camera-first, on-device resize |
| 10 | AI tool identification + **explicit user confirmation** | Never auto-accepted |
| 11 | AI short description (editable) | 1–2 sentences, capped |
| 12 | FREE or ₪/day listing | No in-app payment — "arranged with owner" |
| 13 | Borrow request with dates | Today / Tomorrow / custom |
| 14 | Accept / Decline / Message | Push-notified |
| 15 | Scoped chat + quick replies | Realtime, per-transaction, no phone numbers exposed |
| 16 | Exact pickup location released on accept | The core privacy mechanic |
| 17 | Return confirmation | Both sides |
| 18 | Two-sided ratings | Stars + tag chips |
| 19 | Push notifications | 7 event types, no marketing pushes |
| 20 | Minimal profile | Name, photo, area, rating, exchange count, member since |
| 21 | Favourites (heart) | |
| 22 | Report / block user, report damaged tool | Records a dispute, notifies us |
| 23 | Safety notes on medium/high-risk categories | One line, not a wall of warnings |
| 24 | EN + HE with full RTL | From day one, not retrofitted |
| 25 | Account + data deletion in-app | Play requirement, and the right thing |
| 26 | Thin "I need a tool" broadcast (J3) | Cold-start weapon |

**Definition of done for V1:** a real neighbour in one Tel Aviv neighbourhood can list a real drill and a
different real neighbour can borrow it, end to end, with no one from the team intervening.

---

## 5. Explicitly excluded from MVP

Excluded, but the schema and architecture leave room for each (the column, table or enum value exists):

| Excluded | Why | Architectural hook already in place |
|---|---|---|
| In-app payments | Play policy allows it, but no PSP integration in 30 days; Stripe is unavailable in Israel (§ tech plan) | `price_per_day_agorot`, `currency`, `transactions.agreed_price_agorot`, `payment_status` enum with only `not_applicable`/`offline` used |
| Deposits | Needs payment rails + dispute process | `tools.deposit_agorot`, `transactions.deposit_agorot` |
| ID verification | Cost + friction; phone verification first | `profiles.verification_level` enum (`none`/`email`/`phone`/`id`) |
| Phone auth / SMS verification | SMS costs real money per send; Google and email+password cover V1 | Supabase phone auth is one config change; `user_private.phone_e164` exists |
| Facebook / Apple sign-in | Meta needs business verification and a data-deletion callback; Apple only matters once iOS does | One `signInWith(provider)` function and one `<SocialButtons />` component — adding a provider is config plus a button |
| **Guest borrowing** | An owner handing over a drill needs someone accountable on the other side. Owners would switch it off after the first tool that didn't come back | If we ever reverse this: drop `is_member()` from the `borrow_requests` insert policy, add `profiles.accepts_guest_requests`, and require a verified email or phone on the guest before their first request |
| Insurance & claims adjudication | Needs a legal entity and a partner | `disputes` table with status machine |
| Delivery / courier | Kills the "walk 300 m" simplicity | — |
| Tool bundles, community groups, clubs | Feature creep | `tool_requests` scoping fields |
| Professional / commercial accounts | Changes product tone | `profiles.account_type` enum |
| Subscriptions | Nothing to subscribe to yet | — |
| **Task → toolkit AI advisor** ("hang a TV on concrete") | The killer future feature; needs a curated task→tool knowledge base | The NL-search Edge Function already returns a *list* of tool types; the advisor is the same function returning a *structured multi-item kit* |
| Ratings sub-scores in UI | Complexity | `ratings.tags text[]` stores the dimensions already |
| Web app | Android-first | Supabase + RN Web is a later option |
| iOS | Android-first, but Expo makes it a build target, not a rewrite | — |

---

## 6. Monetization possibilities

Ranked by how well they fit the product, **not** by revenue size. Toolr's whole value is the free-lending
culture; monetization must not tax generosity.

1. **Take rate on paid rentals only (recommended eventual model).** 10–15% commission on ₪-denominated
   rentals, once in-app payments exist. Free lends stay free forever. Requires an Israeli PSP with
   marketplace payouts (see technical plan).
2. **Deposit handling fee.** A flat ₪5–10 to hold and release a deposit — high perceived value, clearly
   optional, only touches the expensive-tool segment.
3. **Promoted listings for local hardware/rental shops.** Only once organic density exists; risky for tone.
4. **"Toolr Protect"** — a small optional coverage fee per rental (₪5) backed by an insurance partner.
   The single most defensible monetization in this category, and the strongest trust unlock.
5. **Neighbourhood/building plans** (a va'ad bayit pays for a shared tool locker). Interesting B2B2C wedge.
6. **What we will not do:** charge to list, charge to browse, gate distance behind a paywall, or run ads.

**MVP monetization: none.** Revenue at this stage is a distraction from the only metric that matters —
whether the second borrow happens.

---

## 7. Trust & safety concerns

The product asks strangers to hand over physical property. Trust is the product, not a feature of it.

**Concern → mitigation in V1:**

| Risk | V1 mitigation | Later |
|---|---|---|
| Tool is stolen / not returned | Real-name-ish profiles via Google, two-sided ratings, transaction history, due-date reminders, dispute record, block/report | Phone + ID verification, deposits, insurance |
| Owner's home address exposed to strangers | Exact coordinates stored in a **separate table** unreadable by anyone but the owner until a request is accepted; public map shows a stable random offset of 100–200 m; distance shown rounded to 50 m | Optional neutral pickup points |
| Borrower is injured using a dangerous tool | Risk level per category; one-line safety note on medium/high risk; explicit acknowledgement checkbox for HIGH risk items before requesting; ToS liability disclaimer | Required competency confirmation, tool-specific guidance |
| Harassment via chat | Chat is scoped to a transaction, closes after completion, block + report, no phone numbers auto-shared | Automated abuse classification |
| Fake/inappropriate photos | Server-side image validation (type, size, dimensions); AI identification doubles as a sanity check — a photo that isn't a tool gets `is_tool: false` and is rejected | Moderation queue + safe-search |
| Retaliatory ratings | Ratings are only visible after **both** sides rate or after 7 days (double-blind window) | Weighted reputation |
| Discrimination in accept/decline | Owners see first name + rating, not surname or ID | Bias monitoring |
| Cold-start emptiness feels like a dead app | Strong empty states that convert to a *tool request* rather than a dead end; single-neighbourhood launch | — |
| Minors borrowing power tools | 18+ in ToS; HIGH-risk acknowledgement | Age verification |

---

## 8. Major technical risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | **AI misidentifies a tool and the listing states a wrong model.** A borrower travels for a "rotary hammer" and gets a drill. | High | User confirmation is mandatory; the model is *never* stated as fact — labels are "Likely" / "Possible match" / "Model uncertain"; `model` is forced to `null` unless `model_confidence ≥ 0.70`; "Generic X" is always a first-class option. |
| R2 | **Location privacy leak** via a query that returns exact coordinates. | Critical | Exact points live in `tool_locations` with owner-only RLS; all public reads go through a `SECURITY DEFINER` RPC that can only ever return the fuzzed point. Verified by a test that asserts an anon client cannot select from `tool_locations`. |
| R3 | **Two-sided cold start.** Zero tools = zero users. | Critical (product) | Launch one neighbourhood; seed listings manually; make "I need a tool" broadcasts the empty-state CTA so demand creates supply. |
| R4 | Hebrew RTL bugs (mirrored icons, wrong-side chevrons, mixed LTR numerals). | Medium | RTL from commit #1, logical layout props only (`marginStart`, not `marginLeft`), an RTL screenshot check in the release checklist. |
| R5 | AI cost/abuse — someone scripts 10,000 identification calls. | Medium | Server-side key only, per-user daily quota enforced in Postgres, image size cap, auth required. |
| R6 | Geo query performance as data grows. | Medium | PostGIS `geography` + GiST index + `ST_DWithin`; never fetch-all-and-filter-on-device. |
| R7 | Supabase free-tier project pauses after 7 days of inactivity. | Low/annoying | Fine pre-launch; move to Pro ($25/mo) the week before real users. |
| R8 | Play Store rejection — Data Safety mismatch, missing account deletion, or permission justification. | Medium | Data Safety form derived from an explicit data inventory (§ security doc); in-app deletion built in V1; permissions requested in-context with rationale screens. |
| R9 | Push delivery on Chinese OEM Androids (Xiaomi/Huawei aggressive battery killing). | Medium | High-priority FCM messages for time-critical events; in-app inbox as the source of truth so a missed push is never a lost request. |
| R10 | Liability for injury or property damage. | High (legal, not technical) | ToS + disclaimers drafted before public launch; risk-level acknowledgements; no claim of vetting users. **Get a lawyer before launch — this is not something to improvise.** |
| R11 | Expo Go cannot run some native modules (maps, camera config plugins). | Low | Use EAS development builds from day one; do not build against Expo Go. |

---

## 9. Success metrics for V1

Only four numbers matter in the pilot neighbourhood:

- **Listing completion rate** and **median time from "I have a tool" to listed** (target: ≥70%, ≤60 s).
- **Search → borrow-request conversion** (target: ≥8% of searches that return ≥1 result).
- **Request → completed transaction rate** (target: ≥40%).
- **Repeat rate:** % of borrowers who borrow a second time within 30 days (the only real signal of PMF).

Supporting: AI identification acceptance rate (accepted as-is vs corrected vs rejected) — this tells us
whether the 30-second promise is real.
