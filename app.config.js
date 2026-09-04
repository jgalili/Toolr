/**
 * The static config lives in app.json; this exists for exactly one thing.
 *
 * GitHub Pages serves a project site from a subfolder —
 * `https://<user>.github.io/<repo>/` — so every asset and route has to be
 * prefixed with `/<repo>`. Hardcoding that in app.json would bake one person's
 * repository name into the app and break the native builds, so it comes from
 * an environment variable that only the Pages workflow sets. Everywhere else —
 * `expo start`, `expo prebuild`, EAS — the variable is absent, the base URL
 * stays empty, and this file returns app.json unchanged.
 */
const app = require('./app.json');

const baseUrl = (process.env.EXPO_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');

module.exports = () => ({
  ...app.expo,
  experiments: {
    ...app.expo.experiments,
    ...(baseUrl ? { baseUrl } : {}),
  },
});
