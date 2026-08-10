import {Capacitor, PluginListenerHandle, registerPlugin} from '@capacitor/core';

type BillingEnvironment = Record<string, string | undefined>;

export const DEFAULT_AD_FREE_PRODUCT_ID = 'assetmaster_ad_free';

export type PlayBillingProduct = {
  available: boolean;
  productId: string;
  title: string;
  description: string;
  formattedPrice: string;
  currencyCode: string;
};

export type PlayBillingEntitlement = {
  hasAdFree: boolean;
  productId: string;
  purchaseState: 'purchased' | 'pending' | 'canceled' | 'none' | 'error';
  purchaseToken?: string;
  acknowledged?: boolean;
};

export type PlayBillingPurchaseEvent = PlayBillingEntitlement & {
  status: 'purchased' | 'pending' | 'canceled' | 'error';
};

export type PlayBillingAdapter = {
  getProduct: (options: { productId: string }) => Promise<PlayBillingProduct | null>;
  purchase: (options: { productId: string }) => Promise<{ started: boolean }>;
  restorePurchases: (options: { productId: string }) => Promise<PlayBillingEntitlement>;
  addListener: (
    eventName: 'purchaseUpdated',
    listenerFunc: (event: PlayBillingPurchaseEvent) => void,
  ) => Promise<PluginListenerHandle>;
};

export type PlayBillingConfig = {
  enabled: boolean;
  productId: string;
};

const PlayBilling = registerPlugin<PlayBillingAdapter>('PlayBilling');

export function getPlayBillingConfig(environment: BillingEnvironment = import.meta.env): PlayBillingConfig {
  const configuredProductId = environment.VITE_PLAY_BILLING_PRODUCT_ID?.trim();
  const productId = configuredProductId || DEFAULT_AD_FREE_PRODUCT_ID;

  return {
    enabled: productId.length > 0,
    productId,
  };
}

export async function getAdFreeProduct(
  platform = Capacitor.getPlatform(),
  environment: BillingEnvironment = import.meta.env,
  adapter: PlayBillingAdapter = PlayBilling,
): Promise<PlayBillingProduct | null> {
  if (platform !== 'android') {
    return null;
  }

  const config = getPlayBillingConfig(environment);
  if (!config.enabled) {
    return null;
  }

  return adapter.getProduct({productId: config.productId});
}

export async function purchaseAdFreeUpgrade(
  platform = Capacitor.getPlatform(),
  environment: BillingEnvironment = import.meta.env,
  adapter: PlayBillingAdapter = PlayBilling,
): Promise<{ started: boolean }> {
  if (platform !== 'android') {
    return {started: false};
  }

  const config = getPlayBillingConfig(environment);
  if (!config.enabled) {
    return {started: false};
  }

  return adapter.purchase({productId: config.productId});
}

export async function restoreAdFreePurchase(
  platform = Capacitor.getPlatform(),
  environment: BillingEnvironment = import.meta.env,
  adapter: PlayBillingAdapter = PlayBilling,
): Promise<PlayBillingEntitlement> {
  if (platform !== 'android') {
    return {
      hasAdFree: false,
      productId: DEFAULT_AD_FREE_PRODUCT_ID,
      purchaseState: 'none',
    };
  }

  const config = getPlayBillingConfig(environment);
  if (!config.enabled) {
    return {
      hasAdFree: false,
      productId: config.productId,
      purchaseState: 'none',
    };
  }

  return adapter.restorePurchases({productId: config.productId});
}

export async function addAdFreePurchaseListener(
  platform = Capacitor.getPlatform(),
  listener: (event: PlayBillingPurchaseEvent) => void,
  adapter: PlayBillingAdapter = PlayBilling,
): Promise<PluginListenerHandle | null> {
  if (platform !== 'android') {
    return null;
  }

  return adapter.addListener('purchaseUpdated', listener);
}
