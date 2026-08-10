import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addAdFreePurchaseListener,
  getAdFreeProduct,
  getPlayBillingConfig,
  purchaseAdFreeUpgrade,
  restoreAdFreePurchase,
} from '../src/utils/playBilling';

const testEnv = {
  VITE_PLAY_BILLING_PRODUCT_ID: ' assetmaster_ad_free ',
};

test('Play Billing configuration uses the stable ad-free product ID', () => {
  assert.deepEqual(getPlayBillingConfig(testEnv), {
    enabled: true,
    productId: 'assetmaster_ad_free',
  });
  assert.deepEqual(getPlayBillingConfig({}), {
    enabled: true,
    productId: 'assetmaster_ad_free',
  });
});

test('Play Billing operations are no-ops outside Android', async () => {
  const calls: string[] = [];
  const adapter = {
    getProduct: async () => {
      calls.push('getProduct');
      return null;
    },
    purchase: async () => {
      calls.push('purchase');
      return { started: true };
    },
    restorePurchases: async () => {
      calls.push('restore');
      return { hasAdFree: true, productId: 'assetmaster_ad_free', purchaseState: 'purchased' as const };
    },
    addListener: async () => {
      calls.push('listener');
      return { remove: async () => {} };
    },
  };

  assert.equal(await getAdFreeProduct('web', testEnv, adapter), null);
  assert.equal((await purchaseAdFreeUpgrade('web', testEnv, adapter)).started, false);
  assert.equal((await restoreAdFreePurchase('web', testEnv, adapter)).hasAdFree, false);
  assert.equal(await addAdFreePurchaseListener('web', () => {}, adapter), null);
  assert.deepEqual(calls, []);
});

test('Android Play Billing operations delegate with the configured product ID', async () => {
  const calls: Array<{ name: string; productId?: string }> = [];
  const adapter = {
    getProduct: async ({ productId }: { productId: string }) => {
      calls.push({ name: 'getProduct', productId });
      return {
        available: true,
        productId,
        title: 'AssetMaster Ad-free',
        description: 'Remove interstitial ads permanently.',
        formattedPrice: '$4.99',
        currencyCode: 'USD',
      };
    },
    purchase: async ({ productId }: { productId: string }) => {
      calls.push({ name: 'purchase', productId });
      return { started: true };
    },
    restorePurchases: async ({ productId }: { productId: string }) => {
      calls.push({ name: 'restore', productId });
      return { hasAdFree: true, productId, purchaseState: 'purchased' as const };
    },
    addListener: async () => {
      calls.push({ name: 'listener' });
      return { remove: async () => {} };
    },
  };

  assert.equal((await getAdFreeProduct('android', testEnv, adapter))?.formattedPrice, '$4.99');
  assert.equal((await purchaseAdFreeUpgrade('android', testEnv, adapter)).started, true);
  assert.equal((await restoreAdFreePurchase('android', testEnv, adapter)).hasAdFree, true);
  await addAdFreePurchaseListener('android', () => {}, adapter);
  assert.deepEqual(calls, [
    { name: 'getProduct', productId: 'assetmaster_ad_free' },
    { name: 'purchase', productId: 'assetmaster_ad_free' },
    { name: 'restore', productId: 'assetmaster_ad_free' },
    { name: 'listener' },
  ]);
});
