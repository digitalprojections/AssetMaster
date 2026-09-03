import type { SavedSegment } from '../types';

export type SegmentSourceFilter = 'all' | 'needs-cleanup' | 'cleaned';
export type SegmentCleanupStatus = 'needs-cleanup' | 'reviewed' | 'cleaned';

export const isVisibleForSegmentSourceFilter = (
  segment: SavedSegment,
  filter: SegmentSourceFilter,
): boolean => {
  if (filter === 'needs-cleanup') {
    return !segment.backgroundRemovedAt && !segment.cleanupProcessedAt;
  }

  if (filter === 'cleaned') {
    return Boolean(segment.backgroundRemovedAt);
  }

  return true;
};

export const getSegmentCleanupStatus = (segment: SavedSegment): SegmentCleanupStatus => {
  if (segment.backgroundRemovedAt) {
    return 'cleaned';
  }

  if (segment.cleanupProcessedAt) {
    return 'reviewed';
  }

  return 'needs-cleanup';
};

export const getSegmentCleanupStatusLabel = (segment: SavedSegment): string => {
  const status = getSegmentCleanupStatus(segment);
  if (status === 'cleaned') {
    return 'Cleaned';
  }

  if (status === 'reviewed') {
    return 'Reviewed';
  }

  return 'Needs Cleanup';
};
