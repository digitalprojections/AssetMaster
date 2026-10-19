import type { Point, RectBounds } from '../types';
export type McpEditorRequest = { action: string; [key: string]: unknown };
export type McpEditorResult = { ok: boolean; message?: string; [key: string]: unknown };
export function getCompanionAddress(port: string) {
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error('Enter a port between 1 and 65535.');
  return `http://127.0.0.1:${Number(port)}`;
}
export function parsePairingFragment(hash: string) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const port = params.get('mcp-port'); const code = params.get('mcp-code');
  if (!port || !code) return null;
  try { getCompanionAddress(port); } catch { return null; }
  return { port, code };
}
export function getCutoutPath(input: { rectangle?: RectBounds; points?: Point[] }, width: number, height: number): Point[] {
  if (Boolean(input.rectangle) === Boolean(input.points)) throw new Error('Supply exactly one rectangle or polygon.');
  let points = input.points;
  if (input.rectangle) {
    const { x, y, width: w, height: h } = input.rectangle;
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) throw new Error('Rectangle dimensions must be positive finite numbers.');
    points = [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
  }
  if (!Array.isArray(points) || points.length < 3 || points.length > 10000 || !points.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))) throw new Error('Polygon must contain 3 to 10000 finite points.');
  if (points.some(p => p.x < 0 || p.y < 0 || p.x > width || p.y > height)) throw new Error('Cutout points must stay within the source image bounds.');
  const area = Math.abs(points.reduce((sum, p, i) => { const next = points![(i + 1) % points!.length]; return sum + p.x * next.y - next.x * p.y; }, 0)) / 2;
  if (area < 1) throw new Error('Cutout polygon must enclose at least one pixel of area.');
  return points;
}
export async function loadMcpImage(dataUrl: string) {
  if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl) || dataUrl.length > 28 * 1024 * 1024) throw new Error('Import requires a PNG, JPEG or WebP within the 20 MiB transfer budget.');
  const image = new Image(); image.src = dataUrl;
  await image.decode();
  if (image.naturalWidth * image.naturalHeight > 32 * 1024 * 1024 || image.naturalWidth > 16384 || image.naturalHeight > 16384) throw new Error('Image exceeds the editor memory budget: 32 Mi pixels and a 16384px edge.');
  return image;
}
export async function getMcpPng(source: HTMLImageElement | string, preview = false) {
  const image = typeof source === 'string' ? await loadMcpImage(source) : source;
  const scale = preview ? Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight)) : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image rendering is unavailable in this browser.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/png');
  if (dataUrl.length > 28 * 1024 * 1024) throw new Error('PNG exceeds the 20 MiB transfer budget. Export a smaller cutout.');
  return { dataUrl, width: canvas.width, height: canvas.height };
}
