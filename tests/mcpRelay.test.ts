import assert from 'node:assert/strict';
import test from 'node:test';
import { isMcpRelayResponse, isMcpRelayHello } from '../src/utils/mcpRelay';
test('relay responses require the expected origin, window, channel and correlation ID', () => {
  const source = {} as Window;
  const event = { source, origin: 'http://127.0.0.1:38475', data: { channel: 'assetmaster-relay-response', id: 'test', status: 200, result: {} } } as MessageEvent;
  assert.equal(isMcpRelayResponse(event, source, event.origin, 'test'), true);
  assert.equal(isMcpRelayResponse(event, {} as Window, event.origin, 'test'), false);
  assert.equal(isMcpRelayResponse(event, source, 'https://evil.example', 'test'), false);
  assert.equal(isMcpRelayResponse(event, source, event.origin, 'other'), false);
  assert.equal(isMcpRelayResponse({ ...event, data: { ...event.data, channel: 'other' } } as MessageEvent, source, event.origin, 'test'), false);
});

test('relay discovery requires the pairing secret and exact local origin', () => {
  const event = { source: {} as Window, origin: 'http://127.0.0.1:38475', data: { channel: 'assetmaster-relay-hello', code: 'secret' } } as MessageEvent;
  assert.equal(isMcpRelayHello(event, event.origin, 'secret'), true);
  assert.equal(isMcpRelayHello(event, event.origin, 'wrong'), false);
  assert.equal(isMcpRelayHello(event, 'https://evil.example', 'secret'), false);
});
