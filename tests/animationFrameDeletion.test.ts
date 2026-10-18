import { createAnimationProjectHistory, pushAnimationProjectHistory, undoAnimationProjectHistory, redoAnimationProjectHistory } from '../src/utils/animationHistory';
import type { AnimationProject } from '../src/types';
import assert from 'node:assert/strict';
import test from 'node:test';
import { planFrameDeletion, reconcileDeletedSources, clearReaddedSourceMarkers, markTimelineRemovedSources, getSourceTimelineLabel } from '../src/utils/animationFrameDeletion';
import type { AnimationFrame, SavedSegment } from '../src/types';
const frame = (id: string, sourceSegmentId?: string) => ({ id, sourceSegmentId, thumbnailUrl: id, offsetX: 0, offsetY: 0, scale: 1, duration: 1 } as AnimationFrame);
const source = (id: string) => ({ id, name: `${id}.png` } as SavedSegment);

test('combined deletion removes the matching source and only the chosen frame, preserving sequence', () => {
  const frames = [frame('a', 's1'), frame('b', 's2'), frame('c', 's3')];
  const sources = [source('s1'), source('s2'), source('s3')];
  const result = planFrameDeletion(frames, sources, 'b', true);
  assert.deepEqual(result.frames.map(f => f.id), ['a', 'c']);
  assert.equal(result.deletedSource, sources[1]);
  assert.equal(frames.length, 3);
  assert.equal(sources.length, 3);
  assert.equal(planFrameDeletion(frames, sources, 'b', false).deletedSource, undefined);
});

test('shared sprite sources stay available until their final frame is removed', () => {
  const sources = [source('sheet')];
  const frames = [frame('a', 'sheet'), frame('b', 'sheet')];
  const first = planFrameDeletion(frames, sources, 'a', true);
  assert.equal(first.sharedFrameCount, 1);
  assert.equal(first.deletedSource, undefined);
  assert.deepEqual(first.frames.map(f => f.id), ['b']);
  assert.equal(planFrameDeletion(first.frames, sources, 'b', true).deletedSource?.id, 'sheet');
});

test('missing sources, standalone frames and stale frame ids never delete unrelated sources', () => {
  const frames = [frame('a', 'missing'), frame('b')];
  for (const id of ['a', 'b', 'stale']) {
    assert.equal(planFrameDeletion(frames, [source('other')], id, true).deletedSource, undefined);
  }
  assert.deepEqual(planFrameDeletion(frames, [], 'stale', true).frames, frames);
});

test('undo and redo reconcile only sources deleted by timeline actions, without duplicates', () => {
  const a = source('a'), b = source('b'), unrelated = source('other');
  assert.deepEqual(reconcileDeletedSources([unrelated], [a, b], [a]), [b, unrelated]);
  assert.deepEqual(reconcileDeletedSources([b, unrelated], [a], [a, b]), [unrelated]);
  assert.deepEqual(reconcileDeletedSources([b, unrelated], [a, b], [a]), [b, unrelated]);
  assert.deepEqual(reconcileDeletedSources([unrelated], [], []), [unrelated]);
});

test('combined deletion history restores frame sequence and source library together', () => {
  const a = source('s1'), b = source('s2');
  const originalFrames = [frame('a', a.id), frame('b', b.id)];
  const project = { id: 'p', name: 'Test', frames: originalFrames, width: 64, height: 64, fps: 8, loop: true } as AnimationProject;
  const before = { project, activeFrameIndex: 0, deletedSources: [] as SavedSegment[] };
  const deletion = planFrameDeletion(project.frames, [a, b], 'a', true);
  const after = { project: { ...project, frames: deletion.frames }, activeFrameIndex: 0, deletedSources: [deletion.deletedSource!] };
  const history = pushAnimationProjectHistory(createAnimationProjectHistory(), before);
  const undo = undoAnimationProjectHistory(history, after)!;
  assert.deepEqual(undo.snapshot.project.frames, originalFrames);
  assert.deepEqual(reconcileDeletedSources([b], after.deletedSources, undo.snapshot.deletedSources ?? []), [a, b]);
  const redo = redoAnimationProjectHistory(undo.history, undo.snapshot)!;
  assert.deepEqual(redo.snapshot.project.frames.map(f => f.id), ['b']);
  assert.deepEqual(reconcileDeletedSources([a, b], [], redo.snapshot.deletedSources ?? []), [b]);
});

test('undo restores an imported source between its collection neighbors', () => {
  const collection = (id: string, index: number) => ({ ...source(id), collectionId: 'images', collectionIndex: index });
  const a = collection('a', 1), b = collection('b', 2), c = collection('c', 3);
  assert.deepEqual(reconcileDeletedSources([a, c], [b], []).map(s => s.id), ['a', 'b', 'c']);
  assert.deepEqual(reconcileDeletedSources([a, b], [c], []).map(s => s.id), ['a', 'b', 'c']);
});

test('retained sources receive a persistent removal marker and undo clears it', () => {
  const sources = [source('a'), source('b')];
  const marked = markTimelineRemovedSources(sources, ['a']);
  assert.equal(marked[0].removedFromTimeline, true);
  assert.equal(marked[1], sources[1]);
  assert.equal(markTimelineRemovedSources(marked, ['a']), marked);
  assert.equal(markTimelineRemovedSources(marked, [])[0].removedFromTimeline, false);
  assert.equal(sources[0].removedFromTimeline, undefined);
  assert.equal(JSON.parse(JSON.stringify(marked))[0].removedFromTimeline, true);
});

test('readding a source clears its marker while unrelated edits retain it', () => {
  const before = [frame('a', 's1')];
  assert.deepEqual(clearReaddedSourceMarkers(before, before, ['s2']), ['s2']);
  assert.deepEqual(clearReaddedSourceMarkers(before, [...before, frame('b', 's2')], ['s2', 's3']), ['s3']);
});

test('dropdown status derives missing legacy sources from current membership', () => {
  const active = new Set(['a']);
  assert.equal(getSourceTimelineLabel(source('b'), active, true), 'Not in Timeline');
  assert.equal(getSourceTimelineLabel(source('a'), active, true), null);
  assert.equal(getSourceTimelineLabel({ ...source('b'), removedFromTimeline: true }, active, true), 'Removed from Timeline');
  assert.equal(getSourceTimelineLabel({ ...source('a'), removedFromTimeline: true }, active, true), 'Some Frames Removed');
  assert.equal(getSourceTimelineLabel(source('b'), active, false), 'Checking Timeline...');
  assert.equal(getSourceTimelineLabel(source('a'), new Set(), true), 'Not in Timeline');
});
