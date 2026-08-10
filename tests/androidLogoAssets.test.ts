import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

function readPngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  return {
    width: bytes.subarray(16, 20).readUInt32BE(0),
    height: bytes.subarray(20, 24).readUInt32BE(0),
  };
}

test('Android launcher and splash assets are generated from the public AssetMaster logo', () => {
  const generator = readFileSync('scripts/generate-android-logo-assets.mjs', 'utf8');

  assert.match(generator, /public\/logos\/assetmaster-logo\.png/);
  assert.deepEqual(readPngSize('public/logos/assetmaster-logo.png'), {width: 512, height: 512});
  assert.deepEqual(readPngSize('android/app/src/main/res/mipmap-mdpi/ic_launcher.png'), {width: 48, height: 48});
  assert.deepEqual(readPngSize('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png'), {width: 432, height: 432});
  assert.deepEqual(readPngSize('android/app/src/main/res/drawable-port-xxxhdpi/splash.png'), {width: 1280, height: 1920});
  assert.deepEqual(readPngSize('android/app/src/main/res/drawable-land-xxxhdpi/splash.png'), {width: 1920, height: 1280});
});
