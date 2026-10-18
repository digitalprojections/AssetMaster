import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSourceGroups } from '../src/utils/sourceGroups';
import type { SavedSegment, AnimationFrame } from '../src/types';
const source = (id: string, extra = {}) => ({ id, name: `${id}.png`, thumbnailUrl: id, createdAt: 1, ...extra } as SavedSegment);
test('groups video frames by input identity, preserving separate imports with identical names', () => {
  const sources = [source('a', { collectionId: 'video_1', collectionName: 'Walk' }), source('b', { collectionId: 'video_1', collectionName: 'Walk' }), source('c', { collectionId: 'video_2', collectionName: 'Walk' })];
  const result = buildSourceGroups(sources, [{ sourceSegmentId: 'a' }, { sourceSegmentId: 'b' }] as AnimationFrame[]);
  assert.equal(result.length, 2);
  assert.equal(result[0].category, 'Videos');
  assert.equal(result[0].frameCount, 2);
  assert.deepEqual(result[0].sources.map(s => s.id), ['a', 'b']);
});
test('groups workspace cutouts and image imports with clear category labels', () => {
  const groups = buildSourceGroups([source('a', { inputSourceId: 'image1', inputSourceName: 'sheet.png', inputSourceType: 'image' }), source('b', { inputSourceId: 'image1', inputSourceName: 'sheet.png', inputSourceType: 'image' }), source('c', { collectionId: 'images_1', collectionName: 'Sprites' })], []);
  assert.equal(groups[0].name, 'sheet.png');
  assert.equal(groups[0].category, 'Image Cutouts');
  assert.equal(groups[0].sources.length, 2);
  assert.equal(groups[1].category, 'Image Imports');
});
test('legacy sources with unknown inputs remain separate and no sources disappear', () => {
  const sources = [source('a'), source('b')];
  const groups = buildSourceGroups(sources, []);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].category, 'Other Sources');
  assert.deepEqual(groups.flatMap(group => group.sources), sources);
  assert.deepEqual(buildSourceGroups([], []), []);
});

test('source management replaces timeline and dropdown bulk-selection controls', () => {
  const studio = readFileSync('src/components/AnimationStudio.tsx', 'utf8');
  assert.doesNotMatch(studio, /Select All Frames|Delete Selected Frames|Select frame \$\{/u);
  assert.doesNotMatch(studio, /Choose source cutout/u);
  assert.match(studio, /<SourceGroupManager/u);
  assert.match(readFileSync('src/components/SegmentList.tsx', 'utf8'), /sourceGroups\.map/u);
});
