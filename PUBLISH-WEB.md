# Putting NailedIt online

The goal: a URL that works whether or not your laptop is on. GitHub builds and
hosts it; every push to `main` redeploys. You'll get:

```
https://<your-github-username>.github.io/<repo-name>/
```

I can't push for you — that needs your GitHub credentials, which I don't take —
but everything on this side is done and verified.

---

## Steps

**0. Save the workflow file yourself.** I could not write it: files under
`.github/workflows/` are protected from remote tools, because a workflow file
runs arbitrary code in your CI and nothing but you should be able to put one
there. That guard is right, and it applies to me.

It's attached in the chat as `deploy-web.yml`. Save it to:

```
C:\Users\zany6\Toolr\.github\workflows\deploy-web.yml
```

Everything else below is already in place.

**1. Create the repo.** On github.com → New repository → name it `nailedit` →
**Public** (Pages is free on public repos) → don't add a README.

**2. Push.** In PowerShell, in `C:\Users\zany6\Toolr`:

```powershell
git init
git add .
git commit -m "NailedIt"
git branch -M main
git remote add origin https://github.com/<your-username>/nailedit.git
git push -u origin main
```

**3. Turn Pages on.** Repo → **Settings** → **Pages** → under "Build and
deployment", set **Source** to **GitHub Actions**. That's the only click.

**4. Watch it build.** The **Actions** tab shows "Deploy web". First run takes
about three minutes. When it goes green, the URL is printed at the end of the
deploy step, and appears on the Settings → Pages screen.

**5. Tell me the URL.** Google sign-in will not work until that exact address
is on your Supabase redirect allow-list. Send it and I'll add it — or do it
yourself in Supabase → Authentication → URL Configuration → Redirect URLs, adding
`https://<username>.github.io/<repo>/**`.

---

## What I set up, and why each piece is needed

**`.github/workflows/deploy-web.yml`** builds and deploys on every push to
`main`. Three details in it are load-bearing:

- **`.nojekyll`** — GitHub Pages runs Jekyll by default, and Jekyll silently
  skips every directory starting with an underscore. Expo puts the entire
  bundle in `_expo/`. Without this file you get a blank white page and no error.
- **`404.html` as a copy of `index.html`** — the app is a single-page bundle, so
  opening `/tool/123` directly would 404. Pages serves `404.html` for unknown
  paths, which hands the URL back to the router.
- **`EXPO_PUBLIC_BASE_URL=/<repo>`** — a project site lives in a subfolder, so
  without a base path every asset resolves to the domain root and nothing loads.

**`app.config.js`** is new, and exists only to inject that base path. Set the
variable and it prefixes everything; leave it unset — `expo start`, the APK
build, EAS — and it returns `app.json` untouched.

**Your Supabase URL and publishable key are in the workflow file.** On a public
repo they are readable, and that is fine: the publishable key is designed to
ship inside clients, and row-level security is what actually protects the data.
Your service-role key is not there. I checked the built bundle for it — the only
match was Supabase's own library code checking key prefixes, not a key.

**`.gitignore` now also excludes** `Claude outputs/` (working screenshots and
zips), `_superseded/`, and any `.apk`/`.keystore`. `.env` was already excluded.

---

## The bug this uncovered

`src/lib/config.ts` read environment variables through `process.env[name]` — a
dynamic lookup. Expo inlines `EXPO_PUBLIC_*` values by **textual substitution**
at build time, and it can only see static expressions like
`process.env.EXPO_PUBLIC_SUPABASE_URL`. A computed lookup is invisible to it.

The result was silent and would have wasted your afternoon: the dev server
injects a real environment at runtime, so `expo start` and Expo Go worked
perfectly, while **every exported build — the web deploy and the APK — would
have come up with no backend and quietly fallen into demo mode.** Same tools,
same seed data, no sign-in, nothing saved.

The reads are now written out in full, and I verified the deployed bundle
actually contains your Supabase host and publishable key rather than assuming.
This also means `BUILD-APK.bat` now produces a real app — before this fix it
would not have.

---

## Once it's live

**Anyone with the link can use it**, which is what you asked for — they can sign
in with Google and create listings against your live project. Two consequences
worth knowing:

- Your Google consent screen is still in **Testing**, so only the test users on
  it can actually sign in. Strangers can browse as guests. Publishing the
  consent screen removes that limit but needs a homepage, privacy policy and
  terms URL — which, conveniently, you'll now have a domain for.
- Everything they create lands in your real database alongside the demo seed.

To take it down: Settings → Pages → Source → None.
