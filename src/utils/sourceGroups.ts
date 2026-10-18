import type { SavedSegment, AnimationFrame } from '../types';

export type SourceGroup = { id: string; name: string; category: string; sources: SavedSegment[]; frameCount: number };
export const SOURCE_CATEGORIES = ['Videos', 'Image Imports', 'Image Cutouts', 'Other Sources'];

export function buildSourceGroups(sources: readonly SavedSegment[], frames: readonly AnimationFrame[]): SourceGroup[] {
  const groups = new Map<string, SourceGroup>();
  const sourceGroups = new Map<string, SourceGroup>();
  for (const source of sources) {
    const identity = source.inputSourceId || source.collectionId;
    const id = identity ? `input:${identity}` : `cutout:${source.id}`;
    const type = source.inputSourceType;
    const video = type === 'video' || source.collectionId?.startsWith('video_') || source.tags?.includes('video frame');
    const category = video ? 'Videos' : type === 'image' ? 'Image Cutouts' : identity ? 'Image Imports' : 'Other Sources';
    let group = groups.get(id);
    if (!group) {
      group = { id, name: source.inputSourceName || source.collectionName || source.name, category, sources: [], frameCount: 0 };
      groups.set(id, group);
    }
    group.sources.push(source);
    sourceGroups.set(source.id, group);
  }
  for (const frame of frames) {
    const group = frame.sourceSegmentId ? sourceGroups.get(frame.sourceSegmentId) : undefined;
    if (group) group.frameCount++;
  }
  return [...groups.values()];
}
