import { AdMob } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

type AdEnvironment = Record<string, string | undefined>;

export type InterstitialAdConfig = {
  adId: string;
  isTesting: boolean;
};

export type InterstitialAdAdapter = {
  initialize: () => Promise<void>;
  prepareInterstitial: (options: InterstitialAdConfig) => Promise<unknown>;
  showInterstitial: () => Promise<void>;
};

const runtimeEnvironment = ((import.meta as ImportMeta & { env?: AdEnvironment }).env ?? {}) as AdEnvironment;

export function getInterstitialAdConfig(environment: AdEnvironment = runtimeEnvironment): InterstitialAdConfig {
  return {
    adId: environment.VITE_ADMOB_ANDROID_INTERSTITIAL_ID?.trim() ?? '',
    isTesting: environment.VITE_ADMOB_TEST_ADS === 'true',
  };
}

function isConfiguredAndroid(platform: string, config: InterstitialAdConfig): boolean {
  return platform === 'android' && config.adId.length > 0;
}

export async function initializeInterstitialAds(
  platform: string = Capacitor.getPlatform(),
  environment: AdEnvironment = runtimeEnvironment,
  adapter: InterstitialAdAdapter = AdMob,
): Promise<boolean> {
  if (!isConfiguredAndroid(platform, getInterstitialAdConfig(environment))) {
    return false;
  }

  await adapter.initialize();
  return true;
}

export async function prepareInterstitialAd(
  platform: string = Capacitor.getPlatform(),
  environment: AdEnvironment = runtimeEnvironment,
  adapter: InterstitialAdAdapter = AdMob,
): Promise<boolean> {
  const config = getInterstitialAdConfig(environment);
  if (!isConfiguredAndroid(platform, config)) {
    return false;
  }

  await adapter.prepareInterstitial(config);
  return true;
}

export async function showPreparedInterstitialAd(
  platform: string = Capacitor.getPlatform(),
  adapter: InterstitialAdAdapter = AdMob,
): Promise<boolean> {
  if (platform !== 'android') {
    return false;
  }

  await adapter.showInterstitial();
  return true;
}
