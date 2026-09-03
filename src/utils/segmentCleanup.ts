import type { SavedSegment } from '../types';

export type SaveCleanedSegmentResult = {
  savedSegment: SavedSegment;
  nextSegments: SavedSegment[];
  mode: 'created' | 'updated';
};

export const saveCleanedSegmentResult = ({
  segments,
  sourceSegment,
  updatedUrl,
  timestamp,
  createSegmentId,
  createSegmentName,
}: {
  segments: SavedSegment[];
  sourceSegment: SavedSegment;
  updatedUrl: string;
  timestamp: number;
  createSegmentId: () => string;
  createSegmentName: (baseName: string) => string;
}): SaveCleanedSegmentResult => {
  if (sourceSegment.backgroundRemovedAt) {
    const updatedSegment: SavedSegment = {
      ...sourceSegment,
      thumbnailUrl: updatedUrl,
      backgroundRemovedAt: timestamp,
      cleanupProcessedAt: timestamp,
      tags: [...(sourceSegment.tags ?? [])],
    };

    let replaced = false;
    const nextSegments = segments.map((segment) => {
      if (segment.id !== sourceSegment.id) {
        return segment;
      }

      replaced = true;
      return updatedSegment;
    });

    return {
      savedSegment: updatedSegment,
      nextSegments: replaced ? nextSegments : [updatedSegment, ...segments],
      mode: 'updated',
    };
  }

  const newSegment: SavedSegment = {
    ...sourceSegment,
    id: createSegmentId(),
    name: createSegmentName(sourceSegment.name),
    thumbnailUrl: updatedUrl,
    createdAt: timestamp,
    backgroundRemovedAt: timestamp,
    cleanupProcessedAt: timestamp,
    derivedFromSegmentId: sourceSegment.id,
    tags: [...(sourceSegment.tags ?? [])],
  };

  return {
    savedSegment: newSegment,
    nextSegments: [
      newSegment,
      ...segments.map((segment) => (
        segment.id === sourceSegment.id && !segment.backgroundRemovedAt
          ? { ...segment, cleanupProcessedAt: timestamp }
          : segment
      )),
    ],
    mode: 'created',
  };
};
