# End-to-end flows (Maestro)

Three flows, because three journeys *are* the product:

| File | Journey |
|---|---|
| `01-find-and-borrow.yaml` | A guest searches in plain language, opens a tool, hits the auth wall |
| `02-list-a-tool.yaml` | The 30-second listing, including the AI falling over |
| `03-return-and-rate.yaml` | Pickup → return → two-sided rating |

## Running them

Maestro drives a real app, so you need a build on a device or emulator — not
Expo Go, because the listing flow uses the camera.

```bash
# once
curl -Ls "https://get.maestro.mobile.dev" | bash

# build and install a dev client
npx expo run:android          # or: eas build -p android --profile development

# then
maestro test e2e/01-find-and-borrow.yaml
maestro test e2e/           # all of them
```

These run against **demo mode** (no `.env`), so they need no accounts, no
network and no seeded database — which is also what makes them safe to run in
CI on an emulator.

## What they assert, and why those things

Each flow ends on an assertion that would catch a real regression, not just a
render:

- **01** — that a guest gets the *auth sheet*, not a full-screen gate, and that
  the sheet names the action ("Sign in to ask Yossi for the Bosch Cordless
  Drill"). If that ever becomes "Create an account", the guest funnel is broken
  even though nothing crashed.
- **02** — that the listing completes **with the AI unavailable**. Demo mode
  returns the medium-confidence tier, so the "which looks closest?" path runs;
  the flow then picks the generic fallback, which is the path a real user takes
  when the model is wrong.
- **03** — that the pickup address only appears after acceptance, and that the
  rating screen warns about the double-blind window.
