# Getting NailedIt onto your phone

You want an **APK** (Android's install file — TPK is Samsung's Tizen format,
different thing).

I can't build it for you. Both my cloud container and the Linux workspace on
your machine sit behind an egress allowlist that refuses `dl.google.com` (the
Android SDK), `services.gradle.org` and `api.expo.dev`. I re-checked before
writing this; npm gets through, everything Android-related does not. Your
Windows machine has no such block, so the build has to start there.

Everything that could be prepared has been.

---

## Just do this

Double-click **`BUILD-APK.bat`** in your Toolr folder.

It finds your Android SDK (Android Studio puts it in `%LOCALAPPDATA%\Android\Sdk`),
generates the native project, compiles, and drops **`NailedIt.apk`** next to the
script. First run takes 10–20 minutes because Gradle downloads its world; after
that it's a couple of minutes.

Then get it onto the phone:

- plug the phone in and run `adb install -r NailedIt.apk`, or
- email it / put it in Drive, open it on the phone, and allow "install from
  this source" when Android asks. That prompt is normal for any app that didn't
  come from the Play Store.

If the script says it can't find an Android SDK, it tells you the two ways
forward. The cloud one needs no SDK at all:

```powershell
npx eas login
npx eas init
npx eas build -p android --profile preview
```

That builds on Expo's servers and hands you a download link. It needs a free
Expo account.

---

## Things I set up so this works first try

**No keystore needed.** Expo's Android template signs release builds with a
bundled debug key (I checked the actual template rather than assuming). That's
fine for sideloading and testing. It is *not* fine for the Play Store — you'd
generate a real key first, and that's a different conversation.

**Your Supabase URL and publishable key are in `eas.json`.** `.env` is
gitignored and EAS only uploads what git tracks, so a cloud build would
otherwise have shipped with no backend and silently fallen into demo mode. The
local build reads your `.env` directly, so it's covered either way. Both values
are meant to be public — the publishable key is designed to ship in clients, and
row-level security is what actually protects the data. Your service-role key is
not in there and must never be.

**The map degrades instead of breaking.** `app.json` carries a placeholder
Google Maps key, and Google Maps on Android draws nothing without a real billed
one — you'd have got a grey rectangle. The app now checks whether the key is
real and falls back to the drawn schematic map, the same one Expo Go shows.

---

## What's different in the APK vs Expo Go

**Google sign-in works, and via a different route.** A real build contains the
native Google module, but that needs an Android OAuth client registered against
this build's SHA-1, which doesn't exist yet. The app tries native, finds no
usable config, and falls back to the browser flow returning to
`nailedit://auth/callback` — which is on your Supabase allow-list. So the APK
does **not** have the `exp://…` redirect problem Expo Go has.

Want the native one-tap sheet later: `npx eas credentials` gives you the SHA-1;
add an Android OAuth client with it in the same Google Cloud project.

**Return reminders behave properly.** They're local notifications; Android asks
for permission the first time a borrow is agreed. Expo Go can't do remote push
at all, which is part of why they're local.

**AI tool identification** still needs `GEMINI_API_KEY` set in Supabase (Edge
Functions → Secrets). Until then it falls through to manual entry by design.

---

## If it fails

The two likely spots:

- **`@react-native-google-signin/google-signin`** in `app.json` still has
  `iosUrlScheme: com.googleusercontent.apps.REPLACE_WITH_YOUR_IOS_CLIENT_ID`.
  It's iOS-only and Android ignores it. If it ever blocks the build, delete that
  plugin entry — the browser sign-in flow doesn't need it.
- **Gradle memory** on a machine with less RAM. Add
  `org.gradle.jvmargs=-Xmx4g` to `android\gradle.properties` and rerun.

Send me the line after `* What went wrong:` and I'll take it from there.
