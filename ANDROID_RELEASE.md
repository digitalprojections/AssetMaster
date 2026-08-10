# AssetMaster Android release preparation

The Android wrapper is a Capacitor 8 project in `android/`. The web app remains the source of truth; Capacitor copies the `dist/` output into the native project.

## Local setup

1. Copy `.env.example` to `.env.local` for a release-configured build.
2. For local testing, override the IDs with Google’s test app/interstitial IDs and set `VITE_ADMOB_TEST_ADS=true`.
3. The AdMob identifiers are public placement identifiers; keep private account credentials and signing material out of source control.

## Repeatable commands

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run android:prepare
npm.cmd run android:build
```

`android:prepare` builds with the Capacitor `/` base path, creates the Android platform if needed, and syncs native plugins. `android:build` additionally assembles a debug APK.

## Interstitial boundary

`src/utils/interstitialAds.ts` exposes initialization, preparation, and display operations. They are no-ops on web/iOS and remain disabled until `VITE_ADMOB_ANDROID_INTERSTITIAL_ID` is configured. No screen currently invokes the display operation; the next product decision is the safe cadence, such as after an export or between completed workflows.

Before production release, add the consent flow required for the audiences served, verify the real AdMob app/ad-unit IDs, and test the Android user path with test ads on a physical device.

## Release blockers still pending

- Production AdMob app ID and interstitial ad-unit ID.
- Consent/privacy configuration and user-facing privacy controls.
- Android signing key and Play App Signing configuration.
- Store listing, content rating, Data safety, and target-release verification.
