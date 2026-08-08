import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const publisherAccount = 'ca-pub-3838820812386239';

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
