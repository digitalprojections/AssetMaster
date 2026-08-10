import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const buildGradle = readFileSync('android/app/build.gradle', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const mainActivity = readFileSync('android/app/src/main/java/link/created/assetmaster/MainActivity.java', 'utf8');
const billingBridge = readFileSync('android/app/src/main/java/link/created/assetmaster/PlayBillingPlugin.java', 'utf8');
const billingClient = 'com.android.billingclient:billing:9.1.0';

test('Android release includes the Play Billing dependency', () => {
  assert.match(buildGradle, new RegExp(billingClient.replaceAll('.', '\\.'), 'u'));
});

test('Android manifest declares Play Billing permission', () => {
  assert.match(manifest, /uses-permission android:name="com\.android\.vending\.BILLING"/u);
});

test('Capacitor registers the Play Billing bridge', () => {
  assert.match(mainActivity, /registerPlugin\(PlayBillingPlugin\.class\)/u);
  assert.match(billingBridge, /@CapacitorPlugin\(name = "PlayBilling"\)/u);
});

test('Play Billing bridge uses the non-consumable ad-free product contract', () => {
  assert.match(billingBridge, /assetmaster_ad_free/u);
  assert.match(billingBridge, /BillingClient\.ProductType\.INAPP/u);
  assert.match(billingBridge, /acknowledgePurchase/u);
});
