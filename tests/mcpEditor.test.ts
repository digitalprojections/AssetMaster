import assert from 'node:assert/strict';
import test from 'node:test';
import { getCutoutPath, getCompanionAddress, parsePairingFragment } from '../src/utils/mcpEditor';
test('MCP cutouts require one bounded rectangle or a nonempty polygon', () => {
  assert.deepEqual(getCutoutPath({ rectangle: { x: 2, y: 3, width: 4, height: 5 } }, 20, 20), [{ x: 2, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 8 }, { x: 2, y: 8 }]);
  assert.throws(() => getCutoutPath({ rectangle: { x: 19, y: 0, width: 4, height: 5 } }, 20, 20), /bounds/i);
  assert.throws(() => getCutoutPath({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }, 20, 20), /area/i);
  assert.throws(() => getCutoutPath({ points: [{ x: NaN, y: 0 }] }, 20, 20), /polygon/i);
  assert.throws(() => getCutoutPath({}, 20, 20), /exactly one/i);
});
test('pairing accepts only loopback ports and explicit fragment fields', () => {
  assert.equal(getCompanionAddress('38475'), 'http://127.0.0.1:38475');
  assert.throws(() => getCompanionAddress('https://evil.example'), /port/i);
  assert.throws(() => getCompanionAddress('0'), /port/i);
  assert.deepEqual(parsePairingFragment('#mcp-port=38475&mcp-code=abc'), { port: '38475', code: 'abc' });
  assert.equal(parsePairingFragment('#other'), null);
});
