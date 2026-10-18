import type { AnimationFrame, SavedSegment } from '../types';

export function planFrameDeletion(
  frames: readonly AnimationFrame[], sources: readonly SavedSegment[], frameId: string, deleteSource: boolean,
) {
  const frame = frames.find(candidate => candidate.id === frameId);
  const remaining = frames.filter(candidate => candidate.id !== frameId);
  const source = frame?.sourceSegmentId ? sources.find(candidate => candidate.id === frame.sourceSegmentId) : undefined;
  const sharedFrameCount = source ? remaining.filter(candidate => candidate.sourceSegmentId === source.id).length : 0;
  return {
    frames: remaining, source, sharedFrameCount,
    deletedSource: deleteSource && sharedFrameCount === 0 ? source : undefined,
  };
}

// Reconcile only timeline-owned deletions; leave unrelated library edits intact.
export function reconcileDeletedSources(
  sources: readonly SavedSegment[], previous: readonly SavedSegment[], next: readonly SavedSegment[],
): SavedSegment[] {
  const removedIds = new Set(next.map(source => source.id));
  const presentIds = new Set(sources.map(source => source.id));
  const restored = previous.filter(source => !removedIds.has(source.id) && !presentIds.has(source.id));
  const result = sources.filter(source => !removedIds.has(source.id));
  for (const source of restored) {
    const nextSibling = source.collectionId ? result.findIndex(candidate =>
      candidate.collectionId === source.collectionId && (candidate.collectionIndex ?? 0) > (source.collectionIndex ?? 0),
    ) : -1;
    if (nextSibling >= 0) {
      result.splice(nextSibling, 0, source);
    } else {
      const lastSibling = source.collectionId ? result.map(candidate => candidate.collectionId).lastIndexOf(source.collectionId) : -1;
      result.splice(lastSibling >= 0 ? lastSibling + 1 : 0, 0, source);
    }
  }
  return result;
}

export function clearReaddedSourceMarkers(previousFrames: readonly AnimationFrame[], nextFrames: readonly AnimationFrame[], markedIds: readonly string[]): string[] {
  const previousIds = new Set(previousFrames.map(frame => frame.id));
  const readdedSources = new Set(nextFrames.filter(frame => !previousIds.has(frame.id)).map(frame => frame.sourceSegmentId));
  return markedIds.filter(id => !readdedSources.has(id));
}

export function markTimelineRemovedSources(sources: SavedSegment[], removedIds: readonly string[]): SavedSegment[] {
  const removed = new Set(removedIds);
  let changed = false;
  const result = sources.map(source => {
    const flag = removed.has(source.id);
    if (Boolean(source.removedFromTimeline) === flag) return source;
    changed = true;
    return { ...source, removedFromTimeline: flag };
  });
  return changed ? result : sources;
}
