import assert from 'node:assert/strict';
import test from 'node:test';
import { detectVideoBackgroundColor, removeVideoBackground, parseVideoKeyColor } from '../src/utils/videoTransparency';

const pixels = (...values: number[]) => new Uint8ClampedArray(values);
test('preserve leaves every channel untouched, including partial alpha', () => {
  const data = pixels(0,255,0,128, 255,0,0,0);
  const before = data.slice();
  removeVideoBackground(data, null, 40, 20);
  assert.deepEqual(data, before);
});
test('color removal clears background and preserves subject and existing alpha', () => {
  const data = pixels(0,255,0,255, 255,0,0,180, 0,255,0,0);
  removeVideoBackground(data, {r:0,g:255,b:0}, 40, 20);
  assert.deepEqual([...data], [0,255,0,0, 255,0,0,180, 0,255,0,0]);
});
test('soft edges reduce alpha without making an existing transparent pixel opaque', () => {
  const data = pixels(30,255,0,128);
  removeVideoBackground(data, {r:0,g:255,b:0}, 40, 50);
  assert.equal(data[3], 64);
});
test('zero tolerance removes only exact matches', () => {
  const data = pixels(0,255,0,255, 1,255,0,255);
  removeVideoBackground(data, {r:0,g:255,b:0}, 0, 0);
  assert.equal(data[3], 0); assert.equal(data[7], 255);
});
test('border detection ignores transparent pixels and uses dominant border color', () => {
  const data = new Uint8ClampedArray(5*5*4);
  for(let i=0;i<data.length;i+=4) data.set([0,255,0,255], i);
  data.set([255,0,0,255], (2*5+2)*4);
  data.set([0,0,255,255], 0);
  data.set([255,255,255,0], 4);
  assert.deepEqual(detectVideoBackgroundColor(data,5,5), {r:0,g:255,b:0});
});
test('transparent border is unavailable rather than guessed black', () => {
  assert.equal(detectVideoBackgroundColor(new Uint8ClampedArray(16),2,2), null);
});
test('invalid frame dimensions fail clearly', () => {
  assert.throws(()=>detectVideoBackgroundColor(pixels(0,0,0,255),2,2), /dimensions/);
});
test('custom color accepts six hex digits and rejects malformed colors', () => {
  assert.deepEqual(parseVideoKeyColor('#00ff00'), {r:0,g:255,b:0});
  assert.throws(()=>parseVideoKeyColor('green'), /color/);
});
test('same fixed color is used for subsequent frames even when their borders change', () => {
  const key={r:0,g:255,b:0};
  const data=pixels(255,0,0,255, 0,255,0,255);
  removeVideoBackground(data,key,40,20);
  assert.equal(data[3],255); assert.equal(data[7],0);
});
