import assert from 'node:assert/strict';
import { reorderLayers } from '../src/utils/collageLayers';
const layers = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
for (const [mode, expected] of [['forward', 'acb'], ['backward', 'bac'], ['front', 'acb'], ['back', 'bac']] as const) {
  assert.equal(reorderLayers(layers, 'b', mode).map(x => x.id).join(''), expected);
}
assert.equal(reorderLayers(layers, 'a', 'front').map(x => x.id).join(''), 'bca');
assert.equal(reorderLayers(layers, 'c', 'back').map(x => x.id).join(''), 'cab');
assert.equal(reorderLayers(layers, 'a', 'backward'), layers);
assert.equal(reorderLayers(layers, 'c', 'forward'), layers);
assert.equal(reorderLayers(layers, 'missing', 'front'), layers);
assert.deepEqual(reorderLayers([], 'missing', 'back'), []);
assert.equal(layers.map(x => x.id).join(''), 'abc');
assert.equal(reorderLayers(layers, 'a', 'front')[2], layers[0]);
console.log('collage layer tests passed');
