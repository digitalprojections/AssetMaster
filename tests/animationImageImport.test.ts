import assert from 'node:assert/strict';
import test from 'node:test';
import { appendImportedAnimation, importAnimationImages, selectAnimationImageFiles } from '../src/utils/animationImageImport';
import type { AnimationProject } from '../src/types';

const file = (name: string, path = '') => ({ name, webkitRelativePath: path, type: '', size: 10 } as File);
const decode = async (source: File) => ({ thumbnailUrl: `data:image/png;${source.name}`, width: source.name.includes('10') ? 48 : 32, height: 64 });

test('selects image files in natural path order without mutating the picker result', () => {
  const input = [file('walk_10.png'), file('.gitkeep'), file('walk_2.PNG'), file('walk_1.png'), file('notes.txt'), file('.hidden.png')];
  assert.deepEqual(selectAnimationImageFiles(input).map(f => f.name), ['walk_1.png', 'walk_2.PNG', 'walk_10.png']);
  assert.equal(input[0].name, 'walk_10.png');
  assert.deepEqual(selectAnimationImageFiles([file('1.png', 'walk/rear/1.png'), file('2.png', 'walk/front/2.png')]).map(f => f.webkitRelativePath), ['walk/front/2.png', 'walk/rear/1.png']);
});

test('creates full-size editable frames and a matching cutout collection', async () => {
  const result = await importAnimationImages([file('walk_10.png', 'walk/walk_10.png'), file('walk_2.png', 'walk/walk_2.png'), file('.gitkeep')], decode);
  assert.equal(result.name, 'walk');
  assert.equal(result.width, 48);
  assert.equal(result.height, 64);
  assert.equal(result.ignoredCount, 1);
  assert.equal(result.frames.length, 2);
  const frame = result.frames[0];
  assert.equal(frame.thumbnailUrl, 'data:image/png;walk_2.png');
  assert.equal(frame.sourceSegmentId, result.segments[0].id);
  assert.deepEqual([frame.sliceX, frame.sliceY, frame.sliceW, frame.sliceH], [0, 0, 32, 64]);
  assert.deepEqual([frame.pivotX, frame.pivotY, frame.offsetX, frame.offsetY, frame.scale, frame.duration], [16, 32, 0, 0, 1, 1]);
  assert.equal(result.segments[0].name, 'walk_2.png');
  assert.equal(result.segments[1].collectionIndex, 2);
  assert.equal(result.segments[0].collectionCount, 2);
  const second = await importAnimationImages([file('walk_2.png')], decode);
  assert.notEqual(second.frames[0].id, frame.id);
});

test('rejects empty, unreadable and invalid-dimension imports before returning any frames', async () => {
  await assert.rejects(importAnimationImages([file('.gitkeep')], decode), /No supported images/);
  await assert.rejects(importAnimationImages([file('ok.png'), file('bad.png')], async f => {
    if (f.name === 'bad.png') throw new Error('decode failed');
    return decode(f);
  }), /bad.png/);
  await assert.rejects(importAnimationImages([file('zero.png')], async () => ({ thumbnailUrl: 'data:', width: 0, height: 64 })), /zero.png/);
});

test('appends without replacing existing frames or timing and sizes an empty project to the images', async () => {
  const imported = await importAnimationImages([file('walk_2.png')], decode);
  const empty: AnimationProject = { id: 'project', name: 'Untitled', width: 256, height: 256, frames: [], fps: 12, loop: false };
  const first = appendImportedAnimation(empty, imported);
  assert.deepEqual([first.width, first.height, first.fps, first.loop], [32, 64, 12, false]);
  assert.equal(empty.frames.length, 0);
  const next = appendImportedAnimation({ ...first, name: 'Existing', width: 100 }, imported);
  assert.equal(next.frames.length, 2);
  assert.equal(next.frames[0], first.frames[0]);
  assert.equal(next.name, 'Existing');
  assert.equal(next.width, 100);
});
