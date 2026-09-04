# Toolr — Information Architecture (Phase 1)

## 1. Navigation tree

```
app/
├─ (onboarding)/                          [shown once; skippable; no auth]
│  ├─ welcome            "Why buy something you'll use once?"
│  ├─ lend               "Got tools gathering dust?"
│  └─ location           "Find tools around you."  → permission request
│
├─ (tabs)/                                [main shell — 5 tabs, always visible]
│  ├─ index              HOME
│  ├─ browse             BROWSE  (list ⇄ map toggle)
│  ├─ add                ADD     (centre FAB → opens camera modal, not a tab screen)
│  ├─ inbox              INBOX   (requests + chats, badge count)
│  └─ me                 ME      (profile / my tools / settings)
│
├─ search/
│  ├─ index              Search entry (text · voice · photo · categories)
│  └─ results            Results  (list ⇄ map, filter sheet)
│
├─ tool/
│  ├─ [id]               Tool detail
│  ├─ [id]/photos        Photo viewer
│  └─ [id]/request       Borrow request composer
│
├─ list/                                  [the 30-second flow]
│  ├─ camera             Camera / pick from gallery
│  ├─ identifying        AI working state
│  ├─ confirm            AI result confirmation  (high / medium / low variants)
│  ├─ manual             Manual category+type picker (fallback)
│  ├─ details            Price + availability + [Add more details]
│  └─ success            "Your drill is live · 3 neighbours nearby"
│
├─ request/
│  ├─ new                Post "I need a tool"
│  └─ [id]               Tool request detail + offers
│
├─ transaction/
│  ├─ [id]               Transaction detail / status timeline
│  ├─ [id]/pickup        Pickup details (exact location unlocked)
│  ├─ [id]/return        Return confirmation
│  ├─ [id]/rate          Rating
│  └─ [id]/issue         Report an issue (damage / not returned)
│
├─ chat/
│  └─ [conversationId]   Conversation
│
├─ profile/
│  └─ [userId]           Public profile
│
├─ me/
│  ├─ tools              My tools (+ edit / pause / delete)
│  ├─ borrowing          Things I'm borrowing
│  ├─ lending            Things I'm lending
│  ├─ favorites          Saved tools
│  ├─ edit               Edit my profile
│  └─ settings/
│     ├─ index           Settings root
│     ├─ account         Sign-in & security: linked providers, set/change password
│     ├─ notifications   Per-type toggles
│     ├─ language        English / עברית
│     ├─ privacy         Location precision, data export
│     ├─ legal           ToS, Privacy Policy, Safety guidelines
│     └─ delete-account  Two-step destructive flow
│
└─ auth/                                  [always modal, never a gate on browse]
   ├─ sign-in           Google · email + password
   ├─ sign-up           email, password, first name
   ├─ check-email       "We sent a link to dana@x.com"
   ├─ forgot-password   request a reset
   └─ reset-password    deep-linked from the email
```

**Tab bar rationale.** Five items, with **ADD as a raised centre button**. The brief's "two big buttons"
live on HOME (they are the primary path), while the tab bar is the escape hatch for people who have
already learned the app. HOME's *I NEED A TOOL* routes to `search/`; *I HAVE A TOOL* routes to
`list/camera`. Nothing is duplicated in a hamburger menu — there is no hamburger menu.

---

## 2. Screen-by-screen specification

Each screen lists **Purpose · Key elements · States**.
States are shorthand: **L** loading, **E** empty, **X** error, **P** permission denied, **O** offline.

### Onboarding

**O1 · Welcome** — *Purpose:* frame the value in one sentence.
Full-bleed warm photo, headline *"Why buy something you'll use once?"*, sub *"Borrow tools from people
nearby."*, **Next**, **Skip** (top-end corner). Dots indicator.

**O2 · Lend** — *"Got tools gathering dust?"* / *"Lend them for free, or earn a little."* **Next / Skip**.

**O3 · Location** — *"Find tools around you."* Plain-language rationale **above** the system dialog:
*"Toolr uses your approximate location to show tools available near you. We never show your exact address
to anyone."* Buttons: **Enable location** (primary) · **Not now** (text).
**States:** P → app still works; a "Set your area manually" city/neighbourhood picker appears and the
search radius centres on the neighbourhood centroid.

### Home

**H1 · Home** — *Purpose:* two decisions, nothing else.
- App name, tiny; a subtle location chip: *"Florentin · change"*.
- Search field placeholder: *"What do you need?"* (tapping it goes to `search/`).
- **🔍 I NEED A TOOL** — full-width, ≥ 64 dp tall.
- **➕ I HAVE A TOOL** — full-width, ≥ 64 dp tall, secondary style.
- **NEAR YOU** — horizontal card carousel (photo · name · distance · FREE/₪ · rating).
- Nothing else. No feed, no promos, no stats.
**States:** L skeleton cards · E "No tools nearby yet" card with **Post what you need** CTA ·
P location chip becomes **Set your area** · O cached results with an offline banner.

### Search & results

**S1 · Search entry** — big text field (autofocus), 🎤 **voice** button, 📷 **photo of the job** button
(future-flagged, disabled with a "coming soon" label rather than a dead button), recent searches, and a
12-item category grid with icons.

**S2 · Results** — segmented **List / Map**.
- List item = photo (72 dp) · title · `📍 350 m` · **FREE** or `₪15/day` · `★ 4.9` · heart.
- A quiet filter bar: **Free only · Available now · Distance · More**.
- If the query was interpreted by AI, a dismissible chip explains it: *"Showing hammer drills and rotary
  hammers for 'hole in a concrete wall'"* with **Search the exact words instead**. Interpretation must be
  visible and reversible — silent query rewriting is the fastest way to lose trust.
**States:** L skeletons · **E (critical)** *"Nothing nearby yet. Try a wider radius — or post what you're
looking for and we'll let nearby owners know."* with **Widen to 3 km** and **Post a request** ·
X retry · O cached.

**S3 · Map** — clustered pins, "search this area" button on pan, tapping a pin raises a compact tool card
sheet. Pins are fuzzed points. A one-line footnote: *"Pin locations are approximate."*

**S4 · Filter sheet** — bottom sheet: Free only (switch), Available now (switch), Distance (segmented:
500 m / 1 / 3 / 5 / 10 km), Category (chips), Max price (slider, only if not free-only), Pickup today.
**Reset** and **Show N tools** (live count).

### Tool

**T1 · Tool detail** —
Photo carousel → title → `📍 350 m away · Florentin` → **FREE** / `₪15 / day` → availability line
(*"Available today"* / *"Available after 17:00"* / *"Ask the owner"*) → short description →
owner card (photo, first name, `★ 4.9 · 12 exchanges`, `Verified`) → *what's included* → safety note
(medium/high risk only) → sticky bottom **BORROW** button.
Map preview shows a **circle**, not a pin, with the caption *"Approximate area"*.
**States:** L skeleton · X not found / removed · unavailable → button becomes **Ask about availability**.

**T2 · Borrow request composer** — *"When do you need it?"* → **Today · Tomorrow · Choose dates** →
optional time window → optional one-line message with quick suggestions → price summary
(*"FREE"* / *"₪15/day × 2 days = ₪30, paid directly to the owner"*) → **Send request**.
For HIGH-risk categories, a required checkbox: *"I know how to use this tool safely."*
**States:** auth wall (Google sheet) · L sending · X failed with retry · duplicate-request guard.

### Listing a tool

**A1 · Camera** — opens straight to the camera. A framing hint: *"Point at the tool"*. Shutter, gallery
picker, flash. **P** → permission rationale screen with **Open settings** and **Choose from gallery**.

**A2 · Identifying** — a genuinely nice 2–4 s state: the photo, a shimmering scan overlay,
*"Looking at your tool…"*. **Cancel** always available. Times out at 12 s → A4.

**A3 · Confirm** — three variants (see `05-ai-tool-identification.md`):
- **High (≥ 0.80):** *"We think this is: **Bosch GSB 18V-55** Cordless Combi Drill"* → **YES** / **Not quite**.
- **Medium (0.50–0.79):** *"Which looks closest?"* → 2–4 options, each labelled *Possible match*, plus
  **None of these**.
- **Low (< 0.50):** straight to A4.
The confidence language is always visible and never overstated. A **"Just call it a generic cordless
drill"** option is present in every variant.

**A4 · Manual picker** — category grid → tool type list (searchable) → optional brand field. Never a dead
end.

**A5 · Details** — the only required screen:
- Photo thumbnail + tool name (tap to edit).
- **FREE** / **RENT** segmented control. If RENT: a single `₪ ___ per day` numeric field with a suggested
  price hint.
- **Available now** / **Choose dates** / **Ask me**.
- Collapsed **▸ Add more details**: condition, accessories included, deposit (future, disabled with a
  label), pickup instructions, max borrowing period, safety notes.
- **LIST TOOL** — sticky, always enabled once price + availability are set.

**A6 · Success** — *"Your drill is live."* + *"3 neighbours within 1 km were looking for one this week."*
(only if true) → **View listing** / **Add another tool**.

### Requests (demand side)

**R1 · New tool request** — one text field (*"Need a jigsaw tomorrow afternoon"*), when (Today / Tomorrow /
Dates), radius, **Post request**. AI parses it into tool types for matching; the parse is shown and editable.

**R2 · Tool request detail** — your request, its parsed types, matching offers from owners, **I can lend
mine** for owners viewing someone else's request.

### Transactions

**X1 · Transaction detail** — a status timeline (Requested → Accepted → Picked up → Returned → Rated),
tool summary, counterparty card, **Message**, and the stage-appropriate primary action.

**X2 · Pickup** — **only reachable when status ≥ accepted.** Exact address, map pin, pickup notes,
**Open in Maps**, **Message**, **I picked it up**.

**X3 · Return** — *"Did you return the drill?"* **Yes** / **Not yet** / **Report an issue**.
Owner sees *"Was the drill returned?"* **Yes, all good** / **Report an issue**.

**X4 · Rate** — 1–5 stars + tag chips (borrower→owner: *Tool as described · Easy to reach · Flexible*;
owner→borrower: *On time · Good condition · Good communication*) + optional 140-char comment.
**Skip** allowed. Ratings publish after both sides rate or after 7 days.

**X5 · Report an issue** — reason (damaged / not returned / not as described / other) → photos →
description → **Submit**. Confirmation is honest: *"We've recorded this and notified [name]. We'll email
you within 2 business days."* — no promise of adjudication we can't keep.

### Inbox & chat

**I1 · Inbox** — two segments: **Requests** (incoming needing a decision, pinned at top) and **Chats**.
Request rows have inline **Accept** / **Decline** so the common case is one tap.

**C1 · Conversation** — realtime messages, quick-reply chips (*"Yes, it's available." · "What time do you
need it?" · "I can leave it downstairs." · "I'll be home after 18:00."*), a pinned tool + transaction
header, and a report/block overflow. No phone numbers are auto-shared. Read receipts, typing indicator.
**States:** L · E ("Say hi 👋" + quick replies) · O queued messages with a pending marker.

### Authentication

**AU1 · Sign-in sheet** — a bottom sheet over whatever the user was doing, never a full-screen gate.
Headline names the action, not the ceremony: *"Sign in to ask Yossi for the drill"*.
**Continue with Google** (primary, native One Tap) · a divider · email field → **Continue** ·
**Forgot password?**. Facebook and Apple slot into the same `<SocialButtons />` row when they are switched
on. Dismissing returns the user exactly where they were, still a guest, nothing lost.

**AU2 · Sign-up** — first name, email, password with a strength meter that advises rather than blocks.
One line of copy explains why the name is needed: *"Neighbours see your first name when you ask to
borrow."* → **Create account** → AU3.

**AU3 · Check your email** — *"We sent a link to dana@x.com."* **Open mail app** · **Resend** (rate-limited,
with a visible countdown) · **Use a different address**.

**AU4 · Forgot password** — one email field. The response is deliberately identical whether or not the
address exists, so the screen is not an account-enumeration oracle: *"If that address has an account,
we've sent a reset link."*

**AU5 · Reset password** — reached by deep link from the email. New password, confirm, done, signed in.

**AU6 · Settings → Sign-in & security** — shows what is linked (*"Google · dana@x.com"*, *"Password set"*),
and lets a user add a password to a social account or link a social account to a password account.
States: L · X (link failed because the provider's email is unverified — explained in words, not a code).

### Profile & settings

**P1 · Public profile** — photo, first name, `★ 4.9 (23)`, `12 successful exchanges`, `Member since
March 2026`, verification badges, neighbourhood (coarse), their active listings, recent review snippets.
No surname, no exact location, no contact details, no follower counts. **Report / Block** in overflow.

**P2 · Me** — own profile summary + shortcuts: My tools · Borrowing · Lending · Favourites · Settings.

**P3 · My tools** — list with status pills (Active / Paused / Borrowed out), swipe to pause,
**Add a tool** FAB.
**E:** *"Your toolbox is looking lonely. Add your first tool."*

**P4 · Settings** — sign-in & security (AU6), notifications (per type), language (English / עברית with an
immediate restart notice for RTL), location precision, legal, **Delete account**.

**P5 · Delete account** — plain explanation of what is deleted and what is retained in anonymised form
(transaction records the other party needs), typed confirmation, 7-day grace window, immediate sign-out.

---

## 3. Reusable component inventory

Building these first makes every screen above assembly rather than design.

**Primitives:** `Button` (primary/secondary/ghost/destructive, min 48 dp) · `Text` (typed variants:
display/title/body/caption) · `Card` · `Chip` · `Sheet` · `Skeleton` · `EmptyState` (icon + headline +
body + up to 2 actions) · `ErrorState` (message + retry) · `Avatar` · `Badge` · `Stepper` · `Switch` ·
`SegmentedControl` · `PriceInput` (agorot-safe, ₪ prefix, RTL-correct) · `DateRangePicker`.

**Domain:** `ToolCard` (list & carousel variants) · `ToolMapPin` + `ToolMapCard` · `DistanceLabel`
(rounds, localises: "350 m" / "0.8 km" / "350 מ׳") · `PriceLabel` (FREE badge vs ₪/day) · `RatingStars` ·
`OwnerCard` · `AvailabilityBadge` · `SafetyNote` (risk-level aware) · `ConfidenceLabel`
("Likely" / "Possible match" / "Model uncertain") · `AiSuggestionCard` · `RequestStatusTimeline` ·
`QuickReplyBar` · `MessageBubble` · `CategoryGrid` · `RadiusSelector` · `FilterBar` · `PermissionPrompt`
(rationale + action) · `AuthGate` (wraps any action needing sign-in).

**Layout rules that keep RTL honest:** only logical properties (`marginStart` / `paddingEnd` /
`start` / `end`), never `left`/`right`; all directional icons pulled through an
`icon(name, isRTL)` helper; numbers and prices always formatted through `Intl.NumberFormat` with the
active locale.

---

## 4. Global state & error behaviour

- **Loading:** skeletons that match the final layout, never spinners on full screens. Anything over 400 ms
  gets a skeleton; anything under gets nothing (no flash).
- **Empty:** every list has a written empty state with a next action. The two that matter most are
  "no tools nearby" (→ widen radius / post a request) and "no listings" (→ add your first tool).
- **Errors:** one `ErrorState` component, human sentences, always a retry. Never a raw error code in
  front of a user; the code goes to Sentry.
- **Permission denial:** never a dead end. Location denied → manual area picker. Camera denied → gallery.
  Notifications denied → in-app inbox still works, with a gentle one-time nudge.
- **Offline:** a persistent slim banner; cached search results and tool details remain readable; writes
  (messages, requests) are queued and marked *pending*, retried on reconnect.
- **AI failure:** always falls through to the manual picker within 12 s. The listing flow can *never* be
  blocked by the AI — that is the difference between a delightful shortcut and a dependency.
