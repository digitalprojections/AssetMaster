import assert from 'node:assert/strict';
import { panScroll } from '../src/utils/cleanupPan';
assert.deepEqual(panScroll({ x: 100, y: 80 }, { x: 20, y: 30 }, { x: 50, y: 10 }), { x: 70, y: 100 });
assert.deepEqual(panScroll({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 40, y: 50 }), { x: 0, y: 0 });
assert.deepEqual(panScroll({ x: 0, y: 0 }, { x: 30, y: 40 }, { x: 0, y: 0 }), { x: 30, y: 40 });
console.log('Cleanup pan tests passed');
