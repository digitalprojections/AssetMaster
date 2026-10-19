import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const appBuildGradle = readFileSync('android/app/build.gradle', 'utf8');
const gradleProperties = readFileSync('android/gradle.properties', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const mainActivity = readFileSync('android/app/src/main/java/link/created/assetmaster/MainActivity.java', 'utf8');
const packageJson = readFileSync('package.json', 'utf8');
const capacitorPrepareScript = readFileSync('scripts/prepare-capacitor-android.mjs', 'utf8');

test('Android release build enables R8 code and resource optimization', () => {
  assert.match(appBuildGradle, /release\s*\{[\s\S]*minifyEnabled true/u);
  assert.match(appBuildGradle, /release\s*\{[\s\S]*shrinkResources true/u);
  assert.match(appBuildGradle, /proguard-android-optimize\.txt/u);
  assert.doesNotMatch(appBuildGradle, /proguard-android\.txt/u);
  assert.doesNotMatch(gradleProperties, /android\.enableR8\.fullMode\s*=\s*false/u);
  assert.match(gradleProperties, /android\.r8\.optimizedResourceShrinking\s*=\s*true/u);
});

test('Android activity opts into supported edge-to-edge behavior', () => {
  assert.match(appBuildGradle, /androidx\.activity:activity:\$androidxActivityVersion/u);
  assert.match(mainActivity, /import androidx\.activity\.EdgeToEdge;/u);
  assert.match(mainActivity, /EdgeToEdge\.enable\(/u);
  assert.match(mainActivity, /SystemBarStyle\.auto/u);
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/u);
});

test('Android bundle automation avoids nested PowerShell quoting', () => {
  assert.match(packageJson, /"android:bundle": "node scripts\/create-android-upload-key\.mjs --if-missing && node scripts\/prepare-capacitor-android\.mjs --bundle-release"/u);
  assert.match(capacitorPrepareScript, /const bundleRelease = process\.argv\.includes\('--bundle-release'\);/u);
  assert.match(capacitorPrepareScript, /\['bundleRelease'\]/u);
});

test('Android Open testing publish metadata uses a fresh release version', () => {
  assert.match(appBuildGradle, /versionCode 21/u);
  assert.match(appBuildGradle, /versionName "1\.1\.20"/u);
  assert.match(packageJson, /--releaseName 1\.1\.20/u);
  assert.match(packageJson, /cleanup tool preferences/u);
});
