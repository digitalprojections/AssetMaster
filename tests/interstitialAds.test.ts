import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInterstitialPageChangeGate,
  getInterstitialAdConfig,
  initializeInterstitialAds,
  prepareInterstitialAd,
  showPreparedInterstitialAd,
} from '../src/utils/interstitialAds';

const testEnv = {
  VITE_ADMOB_ANDROID_INTERSTITIAL_ID: ' test-interstitial-id ',
  VITE_ADMOB_TEST_ADS: 'true',
};

test('interstitial configuration is normalized from environment values', () => {
  assert.deepEqual(getInterstitialAdConfig(testEnv), {
    adId: 'test-interstitial-id',
    isTesting: true,
  });
});

test('interstitial operations are no-ops outside Android', async () => {
  const calls: string[] = [];
  const adapter = {
    initialize: async () => { calls.push('initialize'); },
    prepareInterstitial: async () => { calls.push('prepare'); },
    showInterstitial: async () => { calls.push('show'); },
  };

  assert.equal(await initializeInterstitialAds('web', testEnv, adapter), false);
  assert.equal(await prepareInterstitialAd('ios', testEnv, adapter), false);
  assert.equal(await showPreparedInterstitialAd('web', adapter), false);
  assert.deepEqual(calls, []);
});

test('Android interstitial operations stay disabled until an ad unit is configured', async () => {
  const calls: string[] = [];
  const adapter = {
    initialize: async () => { calls.push('initialize'); },
    prepareInterstitial: async () => { calls.push('prepare'); },
    showInterstitial: async () => { calls.push('show'); },
  };

  assert.equal(await initializeInterstitialAds('android', {}, adapter), false);
  assert.equal(await prepareInterstitialAd('android', {}, adapter), false);
  assert.deepEqual(calls, []);
});

test('Android interstitial operations delegate to the native adapter', async () => {
  const calls: Array<{ name: string; options?: unknown }> = [];
  const adapter = {
    initialize: async () => { calls.push({ name: 'initialize' }); },
    prepareInterstitial: async (options: unknown) => { calls.push({ name: 'prepare', options }); },
    showInterstitial: async () => { calls.push({ name: 'show' }); },
  };

  assert.equal(await initializeInterstitialAds('android', testEnv, adapter), true);
  assert.equal(await prepareInterstitialAd('android', testEnv, adapter), true);
  assert.equal(await showPreparedInterstitialAd('android', adapter), true);
  assert.deepEqual(calls, [
    { name: 'initialize' },
    { name: 'prepare', options: { adId: 'test-interstitial-id', isTesting: true } },
    { name: 'show' },
  ]);
});

test('page-change gate shows an interstitial before every Android page transition', async () => {
  const calls: string[] = [];
  const adapter = {
    initialize: async () => { calls.push('initialize'); },
    prepareInterstitial: async () => { calls.push('prepare'); },
    showInterstitial: async () => { calls.push('show'); },
  };
  const gate = createInterstitialPageChangeGate({
    getPlatform: () => 'android',
    getEnvironment: () => testEnv,
    adapter,
  });

  assert.equal(await gate.showBeforePageChange(), true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(await gate.showBeforePageChange(), true);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(calls, [
    'initialize',
    'prepare',
    'show',
    'prepare',
    'show',
    'prepare',
  ]);
});

test('page-change gate skips web transitions without calling the native adapter', async () => {
  const calls: string[] = [];
  const adapter = {
    initialize: async () => { calls.push('initialize'); },
    prepareInterstitial: async () => { calls.push('prepare'); },
    showInterstitial: async () => { calls.push('show'); },
  };
  const gate = createInterstitialPageChangeGate({
    getPlatform: () => 'web',
    getEnvironment: () => testEnv,
    adapter,
  });

  assert.equal(await gate.warmUp(), false);
  assert.equal(await gate.showBeforePageChange(), false);
  assert.deepEqual(calls, []);
});
