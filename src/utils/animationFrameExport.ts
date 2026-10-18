import type { AnimationFrame } from '../types';

export function frameExportFilename(name: string, index: number): string {
  const safeName = name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'assetmaster';
  return `${safeName}_frame_${String(index + 1).padStart(3, '0')}.png`;
}

export function renderSingleAnimationFrame(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  frame: Pick<AnimationFrame, 'offsetX' | 'offsetY' | 'scale' | 'flipX' | 'flipY'>,
  width: number,
  height: number,
  pivot: { x: number; y: number },
): void {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  try {
    ctx.translate(width / 2 + frame.offsetX, height / 2 + frame.offsetY);
    ctx.scale(frame.flipX ? -frame.scale : frame.scale, frame.flipY ? -frame.scale : frame.scale);
    ctx.drawImage(image, -pivot.x, -pivot.y);
  } finally {
    ctx.restore();
  }
}
