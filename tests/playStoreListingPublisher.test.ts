import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {
  buildListingUpdateRequests,
  parseListingArgs,
  validateStoreListingConfig,
} from '../scripts/publish-play-store-listings.mjs';

const config = JSON.parse(readFileSync('play-publishing/store-listings.json', 'utf8'));

test('store listing config advertises AssetMaster features in English and Uzbek', () => {
  const summary = validateStoreListingConfig(config);

  assert.equal(summary.packageName, 'link.created.assetmaster');
  assert.deepEqual(summary.languages, ['en-US', 'ru-RU', 'uz']);
  assert.equal(summary.customListings[0].language, 'ru-RU');
  assert.match(config.listings['en-US'].fullDescription, /Transparent PNG cutout editor/u);
  assert.match(config.listings['en-US'].fullDescription, /Sprite sheet slicing/u);
  assert.match(config.listings['ru-RU'].fullDescription, /Shaffof PNG qirqimlar/u);
  assert.match(config.listings['ru-RU'].fullDescription, /Sprite sheet/u);
});

test('store listing text stays inside Google Play field limits', () => {
  for (const listing of Object.values(config.listings) as Array<{ title: string; shortDescription: string; fullDescription: string }>) {
    assert.ok(listing.title.length <= 30, `${listing.title} title is too long`);
    assert.ok(listing.shortDescription.length <= 80, `${listing.title} short description is too long`);
    assert.ok(listing.fullDescription.length <= 4000, `${listing.title} full description is too long`);
  }
});

test('listing publisher defaults to validation mode', () => {
  assert.deepEqual(parseListingArgs([
    '--package',
    'link.created.assetmaster',
    '--key',
    '..\\big-genre-172004-b7bf916fca08.json',
  ]), {
    mode: 'validate',
    package: 'link.created.assetmaster',
    key: '..\\big-genre-172004-b7bf916fca08.json',
    config: 'play-publishing/store-listings.json',
    languages: undefined,
    includeImages: false,
  });
});

test('listing publisher builds one update request per selected language', () => {
  assert.deepEqual(buildListingUpdateRequests({
    packageName: 'link.created.assetmaster',
    editId: 'edit-123',
    config,
    languages: ['en-US', 'ru-RU'],
  }), [
    {
      language: 'en-US',
      url: 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/link.created.assetmaster/edits/edit-123/listings/en-US',
      body: config.listings['en-US'],
    },
    {
      language: 'ru-RU',
      url: 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/link.created.assetmaster/edits/edit-123/listings/ru-RU',
      body: config.listings['ru-RU'],
    },
  ]);
});
