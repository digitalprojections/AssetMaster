import type { AnimationFrame, SavedSegment } from '../types';

export type AnimationFrameSet = { id: string; name: string; sourceIds: string[]; frameCount: number };

export function buildAnimationFrameSets(sources: readonly SavedSegment[], frames: readonly AnimationFrame[]): AnimationFrameSet[] {
  const groups = new Map<string, AnimationFrameSet>();
  const sourceGroups = new Map<string, string>();
  for (const source of sources) {
    if (!source.collectionId) continue;
    let group = groups.get(source.collectionId);
    if (!group) { group = { id: source.collectionId, name: source.collectionName || 'Imported Frames', sourceIds: [], frameCount: 0 }; groups.set(group.id, group); }
    group.sourceIds.push(source.id);
    sourceGroups.set(source.id, group.id);
  }
  for (const frame of frames) {
    const groupId = frame.sourceSegmentId && sourceGroups.get(frame.sourceSegmentId);
    if (groupId) groups.get(groupId)!.frameCount++;
  }
  return [...groups.values()];
}

export function planBatchFrameDeletion(
  frames: readonly AnimationFrame[], sources: readonly SavedSegment[], selectedFrameIds: readonly string[], selectedSourceIds: readonly string[], deleteSources: boolean,
) {
  const frameIds = new Set(selectedFrameIds);
  const sourceIds = new Set(selectedSourceIds);
  const sourceMap = new Map(sources.map(source => [source.id, source]));
  const removedFrames: AnimationFrame[] = [], remainingFrames: AnimationFrame[] = [];
  for (const frame of frames) {
    (frameIds.has(frame.id) || (frame.sourceSegmentId && sourceIds.has(frame.sourceSegmentId)) ? removedFrames : remainingFrames).push(frame);
  }
  const affectedSourceIds = new Set(removedFrames.map(frame => frame.sourceSegmentId).filter((id): id is string => Boolean(id) && sourceMap.has(id!)));
  const remainingSourceIds = new Set(remainingFrames.map(frame => frame.sourceSegmentId));
  const candidates = new Set([...sourceIds, ...affectedSourceIds]);
  const deletedSources = deleteSources ? sources.filter(source => candidates.has(source.id) && !remainingSourceIds.has(source.id)) : [];
  const deletedIds = new Set(deletedSources.map(source => source.id));
  return {
    frames: remainingFrames,
    removedFrameIds: removedFrames.map(frame => frame.id),
    deletedSources,
    markedSourceIds: [...affectedSourceIds].filter(id => !deletedIds.has(id)),
    sharedSourceCount: [...candidates].filter(id => sourceMap.has(id) && remainingSourceIds.has(id)).length,
  };
}
