import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDecodeIntegrityTokenBody,
  parseArgs,
  PLAY_INTEGRITY_SCOPE,
} from '../scripts/decode-play-integrity-token.mjs';

test('Play Integrity decode payload uses the REST API field name', () => {
  assert.deepEqual(createDecodeIntegrityTokenBody(' integrity-token '), {
    integrityToken: 'integrity-token',
  });
});

test('Play Integrity decode script requires a token source', () => {
  assert.throws(
    () => parseArgs(['--key', '..\\key.json', '--package', 'link.created.assetmaster']),
    /--token or --tokenFile/,
  );
});

test('Play Integrity decode script uses the playintegrity OAuth scope', () => {
  assert.equal(PLAY_INTEGRITY_SCOPE, 'https://www.googleapis.com/auth/playintegrity');
});
