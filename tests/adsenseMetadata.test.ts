import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const publisherAccount = 'ca-pub-3838820812386239';
const authorizedSellerLine = 'google.com, pub-3838820812386239, DIRECT, f08c47fec0942fa0';

test('AssetMaster exposes the AdSense publisher tag in the document head', () => {
  const html = readFileSync('index.html', 'utf8');

  assert.match(
    html,
    new RegExp(`<meta name="google-adsense-account" content="${publisherAccount}"`)
  );
  assert.match(
    html,
    new RegExp(`pagead/js/adsbygoogle\\.js\\?client=${publisherAccount}`)
  );
  assert.match(html, /crossorigin="anonymous"/);
});

test('AssetMaster publishes the supplied AdMob seller authorization line', () => {
  const adsTxt = readFileSync('public/ads.txt', 'utf8').trim();
  const appAdsTxt = readFileSync('public/app-ads.txt', 'utf8').trim();

  assert.equal(adsTxt, authorizedSellerLine);
  assert.equal(appAdsTxt, authorizedSellerLine);
});
