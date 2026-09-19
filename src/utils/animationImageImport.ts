import type { AnimationFrame, AnimationProject, SavedSegment } from '../types';

export const ANIMATION_IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif';
type DecodedImage = { thumbnailUrl: string; width: number; height: number };
export type ImportedAnimationImages = {
  name: string;
  frames: AnimationFrame[];
  segments: SavedSegment[];
  width: number;
  height: number;
  ignoredCount: number;
};

const naturalOrder = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const imagePath = (file: File) => file.webkitRelativePath || file.name;

export function selectAnimationImageFiles(files: readonly File[]): File[] {
  return files.filter(file => /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name)
    && !imagePath(file).split('/').some(part => part.startsWith('.')))
    .sort((a, b) => naturalOrder.compare(imagePath(a), imagePath(b)) || imagePath(a).localeCompare(imagePath(b)));
}

export async function decodeAnimationImage(file: File): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The image canvas is unavailable.');
    context.drawImage(image, 0, 0);
    return { thumbnailUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Decode the entire selection before callers change the project or asset library.
export async function importAnimationImages(
  files: readonly File[],
  decode: (file: File) => Promise<DecodedImage> = decodeAnimationImage,
): Promise<ImportedAnimationImages> {
  const selected = selectAnimationImageFiles(files);
  if (!selected.length) throw new Error('No supported images were found. Choose PNG, JPEG, WebP, GIF, BMP, or AVIF files.');
  const first = selected[0];
  const name = first.webkitRelativePath?.split('/')[0]
    || first.name.replace(/\.[^.]+$/, '').replace(/[_\- ]?\d+$/, '') || 'Image sequence';
  const collectionId = `images_${crypto.randomUUID()}`;
  const createdAt = Date.now();
  const result: ImportedAnimationImages = { name, frames: [], segments: [], width: 0, height: 0, ignoredCount: files.length - selected.length };
  for (const [index, file] of selected.entries()) {
    let image: DecodedImage;
    try {
      image = await decode(file);
      if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0) {
        throw new Error('Invalid image dimensions.');
      }
    } catch {
      throw new Error(`Could not read "${imagePath(file)}". No frames were imported.`);
    }
    const { thumbnailUrl, width, height } = image;
    const segmentId = `${collectionId}_${index}`;
    result.width = Math.max(result.width, width);
    result.height = Math.max(result.height, height);
    result.segments.push({
      id: segmentId, name: file.name, thumbnailUrl, type: 'rectangle', feather: 0,
      path: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }],
      bounds: { x: 0, y: 0, width, height }, createdAt: createdAt + index,
      collectionId, collectionName: name, collectionIndex: index + 1, collectionCount: selected.length,
      tags: ['image frame', name],
    });
    result.frames.push({
      id: `frame_${segmentId}`, thumbnailUrl, sourceSegmentId: segmentId,
      offsetX: 0, offsetY: 0, scale: 1, duration: 1,
      pivotX: width / 2, pivotY: height / 2, originalPivotX: width / 2, originalPivotY: height / 2,
      sliceX: 0, sliceY: 0, sliceW: width, sliceH: height,
      originalSliceX: 0, originalSliceY: 0, originalSliceW: width, originalSliceH: height,
    });
  }
  return result;
}

export function appendImportedAnimation(project: AnimationProject, imported: ImportedAnimationImages): AnimationProject {
  return {
    ...project,
    name: project.frames.length ? project.name : imported.name,
    frames: [...project.frames, ...imported.frames],
    width: project.frames.length ? Math.max(project.width, imported.width) : imported.width,
    height: project.frames.length ? Math.max(project.height, imported.height) : imported.height,
  };
}
