import assert from 'node:assert/strict';
import test from 'node:test';
import {createReleaseBody, parseArgs} from '../scripts/publish-play-open-testing.mjs';

test('Play release payload targets the API open testing track with release notes', () => {
  assert.deepEqual(createReleaseBody({
    track: 'beta',
    versionCode: 1,
    releaseName: '1.0',
    releaseNotes: 'Initial AssetMaster Android release.',
  }), {
    track: 'beta',
    releases: [
      {
        name: '1.0',
        status: 'completed',
        versionCodes: ['1'],
        releaseNotes: [
          {
            language: 'en-US',
            text: 'Initial AssetMaster Android release.',
          },
        ],
      },
    ],
  });
});

test('Play release payload can pause an existing production version', () => {
  assert.deepEqual(createReleaseBody({
    track: 'production',
    versionCode: '1',
    releaseName: '1.0',
    releaseNotes: 'Initial AssetMaster Android release.',
    status: 'halted',
    userFraction: 0.01,
  }), {
    track: 'production',
    releases: [
      {
        name: '1.0',
        status: 'halted',
        versionCodes: ['1'],
        userFraction: 0.01,
        releaseNotes: [
          {
            language: 'en-US',
            text: 'Initial AssetMaster Android release.',
          },
        ],
      },
    ],
  });
});

test('Play publisher arguments default to safe probe mode', () => {
  assert.deepEqual(parseArgs([
    '--package',
    'link.created.assetmaster',
    '--key',
    '..\\big-genre-172004-b7bf916fca08.json',
  ]), {
    mode: 'probe',
    track: 'beta',
    releaseName: '1.0',
    releaseNotes: 'Initial AssetMaster Android release.',
    package: 'link.created.assetmaster',
    key: '..\\big-genre-172004-b7bf916fca08.json',
  });
});
