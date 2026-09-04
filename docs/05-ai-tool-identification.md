# Toolr — AI Tool Identification Design (Phase 1)

The governing rule for everything below:

> **The AI is a shortcut, never an authority.** It fills the form faster than the user could. The user
> always approves. The app must work identically, only slower, when the AI is wrong, slow, or down.

---

## 1. Technology selection — what actually exists in 2026

| Option | Verdict |
|---|---|
| **Gemini API, Flash-Lite tier, multimodal + structured output** | **Chosen.** Cheapest capable vision model; native JSON-schema-constrained output; single API for both image identification and natural-language query interpretation |
| Google Cloud Vision — label detection | Rejected as primary. Returns generic labels ("tool", "machine", "hardware"), no brand/model reasoning. Retained as an optional cheap pre-filter |
| Google Cloud Vision — Product Search | Rejected. Requires *you* to build and host the product catalogue; that is the hard part, and it doesn't solve it |
| **"Google Lens API"** | **Does not exist as a public product.** The brief was right to flag this. There is no supported public Lens endpoint; every "Lens API" on offer is an unofficial scraper — fragile, and a terms-of-service problem. We do not use one |
| Self-hosted CLIP / open-vision model | Rejected for MVP. Needs GPU hosting and a labelled tool dataset we don't have. Revisit only if per-call cost ever matters, which at Flash-Lite pricing it won't |
| Image embeddings + curated catalogue (`pgvector`) | **Phase 3 refinement**, not MVP — see §8 |

**Cost sanity check.** A 1024 px photo is on the order of a few hundred to ~1,500 image tokens. At
Flash-Lite input pricing (roughly $0.10–$0.30 per million input tokens depending on tier), one
identification costs a small fraction of an agora. Even at 10,000 identifications a month this is a
rounding error next to the Supabase bill. Cost is not the constraint; **latency and trust are.**

---

## 2. Pipeline

```
 ┌─ PHONE ────────────────────────────────────────────────────────────┐
 │ 1. expo-camera capture                                             │
 │ 2. expo-image-manipulator → 1024 px longest edge, JPEG q0.70,      │
 │    EXIF stripped (GPS especially)                                  │
 │ 3. upload to Storage bucket `ai-temp/{userId}/{uuid}.jpg` (private)│
 │ 4. POST /functions/v1/identify-tool  { path }   + user JWT         │
 └───────────────────────────┬────────────────────────────────────────┘
                             ▼
 ┌─ EDGE FUNCTION `identify-tool` (Deno/TS) ──────────────────────────┐
 │ a. verify JWT → userId                                             │
 │ b. consume_ai_quota('identify', 25)  → 429 if over                 │
 │ c. download object; validate: real JPEG/PNG/WebP by magic bytes,   │
 │    ≤ 8 MB, ≤ 4096 px                                               │
 │ d. call Gemini: image + system prompt + responseSchema             │
 │ e. Zod-validate the response; repair once, then fail closed        │
 │ f. apply CONFIDENCE POLICY (§4) — this is where we blank out       │
 │    model numbers the model isn't sure about                        │
 │ g. persist to ai_identification_results                            │
 │ h. return ranked candidates + a suggested listing draft            │
 └───────────────────────────┬────────────────────────────────────────┘
                             ▼
 ┌─ PHONE ────────────────────────────────────────────────────────────┐
 │ 5. Confirmation screen — high / medium / low variant               │
 │ 6. USER CONFIRMS, CORRECTS, or falls back to the manual picker     │
 │ 7. PATCH the ai_identification_results row with user_action        │
 │ 8. Listing draft pre-filled → price + availability → LIST TOOL     │
 └────────────────────────────────────────────────────────────────────┘
```

Every arrow has a timeout and a fallback. The whole client-side budget is **12 seconds**; past that the
user lands on the manual picker with their photo already attached.

---

## 3. The model contract

### 3.1 System prompt (v1 — versioned in `prompt_version`)

```
You identify hand tools, power tools, garden and household equipment from a single photograph,
for a neighbourhood tool-lending app.

Rules:
- If the image does not contain a lendable tool or piece of equipment, set is_tool=false and stop.
- Report only what you can actually see. Never guess a model number to seem helpful.
- Report brand and model confidence SEPARATELY from tool-type confidence. You will often be able
  to tell that something is a cordless drill without being able to tell which one.
- If you cannot read a model number or clearly recognise the exact product, leave "model" null.
  A correct generic answer is far better than a plausible wrong specific one.
- Give at most 4 alternatives, ordered by confidence.
- Write a description of at most 2 short sentences, covering what the tool is for and what is
  visibly included (battery, charger, case, blade). Never state specifications you cannot see.
- Never mention safety unless the tool genuinely carries injury risk; then one short clause.
```

### 3.2 Response schema (enforced by `responseSchema`, re-validated with Zod)

```jsonc
{
  "is_tool": true,
  "category": "power-tools",              // must be one of the 12 category slugs
  "tool_type": "cordless-drill",          // controlled vocabulary, ~120 slugs
  "tool_type_confidence": 0.94,
  "brand": "Bosch",
  "brand_confidence": 0.81,
  "model": "GSB 18V-55",
  "model_confidence": 0.62,
  "power_source": "cordless",             // cordless | corded | manual | petrol | unknown
  "visible_accessories": ["battery", "charger", "case"],
  "condition_hint": "good",               // like_new | good | worn | unknown
  "risk": "medium",                       // low | medium | high
  "suggested_title": "Bosch Cordless Combi Drill",
  "suggested_description": "18V cordless drill for wood, metal and light masonry. Includes one battery and charger.",
  "alternatives": [
    { "brand": "Bosch", "model": "GSR 18V-55", "tool_type": "cordless-drill", "confidence": 0.21 },
    { "brand": "Bosch", "model": "EasyImpact 18V", "tool_type": "cordless-drill", "confidence": 0.11 }
  ],
  "notes": "Model plate not legible in this photo."
}
```

**Validation is not optional.** `category` and `tool_type` are checked against our controlled vocabulary;
anything outside it is coerced to the nearest known slug or to `other`. `suggested_description` is
truncated at 200 characters. Any confidence outside `[0,1]` invalidates the whole response.
A malformed response gets **one** repair attempt (re-prompt with the validation error), then the request
fails to the manual picker. We never show the user a raw model response.

---

## 4. The confidence policy

This is the part that keeps the product honest. It runs **server-side**, so the client cannot be
tricked into displaying an overconfident claim.

```ts
// applied to the validated response before it is returned
if (r.model_confidence < 0.70) { r.model = null }        // do not state a model we're unsure of
if (r.brand_confidence < 0.60) { r.brand = null }
const top = r.tool_type_confidence
const tier = top >= 0.80 ? 'high' : top >= 0.50 ? 'medium' : 'low'
```

| Tier | Server returns | Screen | Wording |
|---|---|---|---|
| **High** ≥ 0.80 | one primary candidate | single confirmation | *"We think this is: **Bosch GSB 18V-55** Cordless Combi Drill"* → **YES** / **NOT QUITE** |
| **Medium** 0.50–0.79 | 2–4 ranked candidates | option list | *"Which looks closest?"* — each row tagged **Possible match** — plus **None of these** |
| **Low** < 0.50 | candidates suppressed | manual picker | *"We couldn't tell what this is. What kind of tool is it?"* — category grid |
| `is_tool: false` | rejection | friendly error | *"That doesn't look like a tool. Try another photo?"* — with **Add it manually** |

**Confidence vocabulary shown to users** — three phrases, used consistently, never numbers:

- **"Likely"** — model retained, `model_confidence ≥ 0.70`
- **"Possible match"** — a medium-tier alternative
- **"Model uncertain"** — tool type known, model blanked. The listing then reads
  *"Cordless drill · Bosch · model not confirmed"*

Percentages are never shown. "83% confident" reads as precision the model does not have, and users
either over-trust it or find it baffling.

**"Just call it a generic cordless drill"** is present as a first-class option on **every** variant,
including the high-confidence one. It is often the honest answer and it is always the fastest one.

**Listings carry a provenance flag.** `tools.is_model_confirmed` is `true` only when the user explicitly
confirmed a specific model. Unconfirmed models render with the *model uncertain* treatment on the tool
detail page — the borrower sees the same uncertainty the owner saw, which is the whole point.

---

## 5. Failure modes and their fallbacks

| Failure | Detection | Fallback |
|---|---|---|
| Photo isn't a tool | `is_tool: false` | Friendly re-shoot prompt + manual entry |
| Model returns malformed JSON | Zod validation fails | One repair retry → manual picker |
| Gemini timeout / 5xx | 10 s server timeout | Manual picker, photo preserved; logged to Sentry |
| Rate limited by provider | 429 from Gemini | Manual picker + *"Our helper is busy — add it manually, it only takes a moment"* |
| User over daily quota | `consume_ai_quota` returns false | Manual picker, no scary error |
| No network | Client detects | *"Add it manually now, and we'll try to identify it when you're back online"* — draft saved locally |
| Blurry / dark photo | Low confidence | Medium/low tier handles it naturally; we also suggest *"Try again in better light"* |
| Multiple tools in frame | Model returns the most prominent + `notes` | User can correct; a future version can offer "we see 3 tools — list them all?" |
| Confidently wrong | User taps **NOT QUITE** | `user_action = 'corrected'`, logged. **This ratio is the metric we watch** |

**The invariant:** at no point in the listing flow is the AI on the critical path. A user who taps
"I have a tool" can always reach "LIST TOOL" without any AI call succeeding.

---

## 6. Natural-language search interpretation

The same infrastructure, a different Edge Function: `interpret-query`.

```
"I need to make a hole in a concrete wall"
        ↓  sha256 cache lookup (ai_query_cache) — hit? return, 0 tokens, ~5 ms
        ↓  miss → Gemini Flash-Lite, text only, JSON schema
{
  "tool_types": ["rotary-hammer", "hammer-drill", "cordless-drill"],
  "categories": ["power-tools"],
  "keywords": ["concrete", "masonry", "SDS"],
  "explanation_en": "hammer drills and rotary hammers",
  "explanation_he": "מקדחות רוטט ופטישונים",
  "confidence": 0.9
}
        ↓  search_tools_nearby(..., p_tool_types => tool_types, p_query => keywords)
```

Three properties that matter:

1. **Cached by hash.** "drill" gets interpreted once, ever. Popular queries cost nothing. The cache is
   keyed on `sha256(lower(trim(query)) || ':' || locale)`.
2. **Interpretation is visible and reversible.** The results screen shows
   *"Showing hammer drills and rotary hammers for 'hole in a concrete wall'"* with
   **Search the exact words instead**. Silent query rewriting is the fastest way to make a search feel
   broken.
3. **It degrades to keyword search.** If the function fails, times out, or the user is offline, we run
   plain full-text + trigram search. Slightly worse results, zero breakage.

**Voice input** is native device speech-to-text (free, on-device, supports Hebrew). Its transcript enters
this exact same path — voice is an input method, not a separate feature.

---

## 7. Abuse and cost controls

- **The API key never leaves the server.** Not in the bundle, not in an `EXPO_PUBLIC_*` var, not in a
  config file. Edge Function secrets only.
- **Auth required.** Anonymous users can browse, but identification requires a signed-in account.
- **Quotas enforced in Postgres** (`consume_ai_quota`), not in the client: 25 identifications and 100
  query interpretations per user per day. Generous for a human, useless for a script.
- **Image caps** before the model call: ≤ 8 MB, ≤ 4096 px, real image by magic bytes.
- **`ai-temp` objects expire after 24 hours**, cleaned nightly. Identification photos that don't become
  listings do not linger.
- **A monthly spend alert** on the Google Cloud project, with a hard quota below the alert.

---

## 8. Roadmap — where this goes

**Phase 2 (post-MVP): catalogue re-ranking.**
Curate a few thousand common tool SKUs (brand, model, type, a reference image). Store CLIP-style image
embeddings in `pgvector`. Run the user's photo through the embedder, take the nearest catalogue
neighbours, and use them to *re-rank or confirm* the model's brand/model guess. The vision model stays
the generalist; the catalogue makes it precise on the 200 tools that make up most listings.

**Phase 3: task → toolkit.** The feature the brief is most excited about, and rightly.

```
"I want to hang a TV on a concrete wall"
        ↓
{
  "task": "mount-tv-concrete",
  "kit": [
    { "tool_type": "hammer-drill",     "necessity": "required", "why": "concrete needs hammer action" },
    { "tool_type": "masonry-drill-bit","necessity": "required", "why": "8mm for standard wall plugs" },
    { "tool_type": "spirit-level",     "necessity": "required", "why": "so the TV hangs straight" },
    { "tool_type": "stud-detector",    "necessity": "recommended", "why": "avoid drilling into wiring" },
    { "tool_type": "screwdriver",      "necessity": "required" }
  ],
  "consumables": ["wall plugs", "screws"],
  "safety": "Wear eye protection. Check for electrical cables before drilling."
}
        ↓  for each kit item: search_tools_nearby(...) → "3 of 5 available within 1 km"
```

The architecture already supports this: `interpret-query` returns a *list* of tool types, and
`search_tools_nearby` takes a `text[]` of them. The task advisor is the same two functions returning a
structured multi-item kit and running N searches. It needs a curated task→kit knowledge base to be
reliable (an LLM alone will confidently invent drill-bit diameters), which is why it is Phase 3 and not
MVP — but nothing in the MVP schema needs to change to accommodate it.

**Consumables are the business model hiding in this feature.** "You'll also need 8 mm wall plugs" is the
most natural affiliate/local-hardware-shop moment the product will ever have. Worth remembering; not
worth building yet.
