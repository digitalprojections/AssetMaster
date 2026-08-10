# AssetMaster Android release preparation

The Android wrapper is a Capacitor 8 project in `android/`. The web app remains the source of truth; Capacitor copies the `dist/` output into the native project.

## Play Billing ad-free upgrade

The billing-enabled Android release uses the non-consumable product ID `assetmaster_ad_free`. After this version is published to a Play testing track, create and activate the one-time product in Play Console or through the Android Publisher API. The app queries the localized Play price, supports purchase restoration, and skips interstitials after Google Play acknowledges the purchase.

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

## Play Integrity boundary

`src/utils/playIntegrity.ts` warms up the standard Play Integrity token provider on Android when `VITE_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER` is configured. Token requests hash the protected action payload before calling the native bridge so sensitive request data is not sent as plain text in the `requestHash`.

The Android wrapper includes a local Capacitor plugin named `PlayIntegrity` backed by `com.google.android.play:integrity:1.6.0`. Client tokens must be sent to a trusted backend and decoded with `playintegrity.googleapis.com`; do not trust a client-side token without server verification.

To activate the runtime path, enable the Play Integrity API in Google Cloud and link the same Cloud project in Play Console under Protected with Play > Play Integrity API.

## Release blockers still pending

- Production AdMob app ID and interstitial ad-unit ID.
- Consent/privacy configuration and user-facing privacy controls.
- Android signing key and Play App Signing configuration.
- Store listing, content rating, Data safety, and target-release verification.
