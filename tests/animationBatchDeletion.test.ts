import { createAnimationProjectHistory, pushAnimationProjectHistory, undoAnimationProjectHistory, redoAnimationProjectHistory } from '../src/utils/animationHistory';
import { reconcileDeletedSources } from '../src/utils/animationFrameDeletion';
import type { AnimationProject } from '../src/types';
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnimationFrameSets, planBatchFrameDeletion } from '../src/utils/animationBatchDeletion';
import type { AnimationFrame, SavedSegment } from '../src/types';
const frame = (id: string, sourceSegmentId?: string) => ({ id, sourceSegmentId } as AnimationFrame);
const source = (id: string, collectionId?: string, collectionName = 'Video') => ({ id, collectionId, collectionName, name: id } as SavedSegment);

test('removing a video set includes all its sources and referencing frames, preserving other imports', () => {
  const sources = [source('a', 'v1'), source('b', 'v1'), source('c', 'v2', 'Other')];
  const frames = [frame('1', 'a'), frame('2', 'b'), frame('3', 'c'), frame('4', 'a')];
  const sets = buildAnimationFrameSets(sources, frames);
  assert.equal(sets[0].frameCount, 3);
  assert.deepEqual(sets[0].sourceIds, ['a', 'b']);
  const result = planBatchFrameDeletion(frames, sources, [], sets[0].sourceIds, true);
  assert.deepEqual(result.frames.map(f => f.id), ['3']);
  assert.deepEqual(result.deletedSources.map(s => s.id), ['a', 'b']);
  assert.deepEqual(result.removedFrameIds, ['1', '2', '4']);
  assert.equal(frames.length, 4);
});

test('timeline multi-delete keeps order, deduplicates sources and protects shared sources', () => {
  const sources = [source('a'), source('b')];
  const frames = [frame('1', 'a'), frame('2', 'a'), frame('3', 'b'), frame('4')];
  const partial = planBatchFrameDeletion(frames, sources, ['1', '3', '3'], [], true);
  assert.deepEqual(partial.frames.map(f => f.id), ['2', '4']);
  assert.deepEqual(partial.deletedSources.map(s => s.id), ['b']);
  assert.equal(partial.sharedSourceCount, 1);
  const all = planBatchFrameDeletion(frames, sources, ['1', '2', '3'], [], true);
  assert.deepEqual(all.deletedSources.map(s => s.id), ['a', 'b']);
});

test('timeline-only set removal keeps cutouts and records their removal markers', () => {
  const sources = [source('a', 'video'), source('b', 'video')];
  const result = planBatchFrameDeletion([frame('1', 'a')], sources, [], ['a', 'b'], false);
  assert.equal(result.frames.length, 0);
  assert.equal(result.deletedSources.length, 0);
  assert.deepEqual(result.markedSourceIds, ['a']);
});

test('source-only leftovers and invalid selections are safe to remove in one operation', () => {
  const sources = [source('a', 'video'), source('b', 'other')];
  assert.deepEqual(planBatchFrameDeletion([], sources, [], ['a'], true).deletedSources.map(s => s.id), ['a']);
  assert.equal(planBatchFrameDeletion([frame('1', 'b')], sources, ['stale'], ['missing'], true).removedFrameIds.length, 0);
  assert.equal(planBatchFrameDeletion([], sources, [], [], true).deletedSources.length, 0);
  assert.equal(buildAnimationFrameSets([source('single')], []).length, 0);
});

test('a complete set is restored and deleted again as one history operation', () => {
  const sources = [source('a', 'video'), source('b', 'video'), source('c', 'other')];
  const frames = [frame('1', 'a'), frame('2', 'b'), frame('3', 'c')];
  const before = { project: { frames } as AnimationProject, activeFrameIndex: 1, deletedSources: [] as SavedSegment[] };
  const plan = planBatchFrameDeletion(frames, sources, [], ['a', 'b'], true);
  const after = { project: { frames: plan.frames } as AnimationProject, activeFrameIndex: 0, deletedSources: plan.deletedSources };
  const undo = undoAnimationProjectHistory(pushAnimationProjectHistory(createAnimationProjectHistory(), before), after)!;
  assert.deepEqual(undo.snapshot.project.frames, frames);
  assert.deepEqual(new Set(reconcileDeletedSources([sources[2]], after.deletedSources, []).map(s => s.id)), new Set(['a', 'b', 'c']));
  const redo = redoAnimationProjectHistory(undo.history, undo.snapshot)!;
  assert.deepEqual(redo.snapshot.project.frames.map(f => f.id), ['3']);
  assert.deepEqual(reconcileDeletedSources(sources, [], redo.snapshot.deletedSources ?? []).map(s => s.id), ['c']);
});

test('separate imports with the same name remain separate sets', () => {
  const sets = buildAnimationFrameSets([source('a', 'first'), source('b', 'second')], []);
  assert.equal(sets.length, 2);
  assert.deepEqual(sets.map(set => set.id), ['first', 'second']);
});
