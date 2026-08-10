import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const appId = 'ca-app-pub-3838820812386239~2734826159';
const interstitialId = 'ca-app-pub-3838820812386239/3880386868';

test('Android release configuration uses the supplied production AdMob app ID', () => {
  const stringsXml = readFileSync('android/app/src/main/res/values/strings.xml', 'utf8');
  const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');

  assert.match(stringsXml, new RegExp(`<string name="admob_app_id">${appId.replace('~', '\\~')}</string>`));
  assert.match(manifest, /android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"/);
  assert.match(manifest, /android:value="@string\/admob_app_id"/);
});

test('Android release environment uses the supplied production interstitial ID', () => {
  const envExample = readFileSync('.env.example', 'utf8');

  assert.match(envExample, new RegExp(`VITE_ADMOB_ANDROID_APP_ID=${appId.replace('~', '\\~')}`));
  assert.match(envExample, new RegExp(`VITE_ADMOB_ANDROID_INTERSTITIAL_ID=${interstitialId.replace('/', '\\/')}`));
  assert.match(envExample, /VITE_ADMOB_TEST_ADS=false/);
});
