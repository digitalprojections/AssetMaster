import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createPlayIntegrityRequestHash,
  getPlayIntegrityConfig,
  requestPlayIntegrityToken,
  stableSerializeIntegrityPayload,
  warmUpPlayIntegrity,
} from '../src/utils/playIntegrity';

test('Play Integrity config is enabled only with a numeric cloud project number', () => {
  assert.deepEqual(getPlayIntegrityConfig({VITE_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER: ' 123456789012 '}), {
    enabled: true,
    cloudProjectNumber: '123456789012',
  });

  assert.deepEqual(getPlayIntegrityConfig({VITE_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER: ''}), {
    enabled: false,
    cloudProjectNumber: '',
  });
});

test('Play Integrity request payloads are serialized deterministically', () => {
  assert.equal(
    stableSerializeIntegrityPayload({b: 2, a: {d: 4, c: 3}}),
    '{"a":{"c":3,"d":4},"b":2}',
  );
});

test('Play Integrity request hash uses SHA-256 base64url encoding', async () => {
  assert.equal(
    await createPlayIntegrityRequestHash('test'),
    'n4bQgYhMfWWaL-qgxVrQFaO_TxsrC4Is0V1sFbDwCgg',
  );
});

test('Play Integrity warm-up is skipped outside Android or without config', async () => {
  const calls: string[] = [];
  const plugin = {
    prepare: async () => {
      calls.push('prepare');
      return {prepared: true};
    },
    requestToken: async () => ({token: 'token'}),
  };

  assert.equal(await warmUpPlayIntegrity('web', {VITE_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER: '123'}, plugin), false);
  assert.equal(await warmUpPlayIntegrity('android', {}, plugin), false);
  assert.deepEqual(calls, []);
});

test('Play Integrity token requests pass only the request hash to the native bridge', async () => {
  const calls: Array<{ requestHash: string }> = [];
  const plugin = {
    prepare: async () => ({prepared: true}),
    requestToken: async (options: { requestHash: string }) => {
      calls.push(options);
      return {token: 'integrity-token'};
    },
  };

  const result = await requestPlayIntegrityToken(
    {action: 'launch', timestamp: 1},
    'android',
    {VITE_PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER: '123'},
    plugin,
  );

  assert.equal(result?.token, 'integrity-token');
  assert.equal(result?.requestHash, calls[0].requestHash);
  assert.match(calls[0].requestHash, /^[A-Za-z0-9_-]{43}$/);
});
