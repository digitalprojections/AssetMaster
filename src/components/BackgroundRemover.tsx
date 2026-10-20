import { getCleanupSessionStorage, readCleanupSettings, saveCleanupSettings, readBorderDetection, saveBorderDetection } from '../utils/cleanupSession';
import { panScroll } from '../utils/cleanupPan';
import { getCleanupNavigation } from '../utils/cleanupNavigation';
import React, { useState, useEffect, useRef } from 'react';
import { SavedSegment } from '../types';
import {
  X,
  Undo2,
  Trash2,
  Sliders,
  Scissors,
  Check,
  RotateCcw,
  Sparkles,
  Eye,
  Settings,
  Grid,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  MAX_KEY_EDGE_FADE_PERCENT,
  MAX_KEY_STRENGTH_PERCENT,
  MIN_KEY_EDGE_FADE_PERCENT,
  MIN_KEY_STRENGTH_PERCENT,
  applyKeyRemovalToAlpha,
  getRgbDistance,
  normalizeKeyEdgeFadePercent,
  normalizeKeyStrengthPercent,
  type RgbColor,
} from '../utils/backgroundKeying';

interface BackgroundRemoverProps {
  segment: SavedSegment;
  onSave: (updatedUrl: string) => void;
  onClose: () => void;
  segments?: readonly SavedSegment[];
  onSelectSegment?: (segment: SavedSegment) => void;
}

type PixelPoint = {
  x: number;
  y: number;
};

type EdgeKeyDetection = {
  color: RgbColor;
  point: PixelPoint | null;
};

const ZOOM_MIN = 1;
const ZOOM_MAX = 12;
const ZOOM_STEP = 0.25;

export default function BackgroundRemover({ segment, onSave, onClose, segments = [segment], onSelectSegment }: BackgroundRemoverProps) {
  const navigation = getCleanupNavigation(segments, segment.id);
  const drafts = useRef(new Map<string, { sourceUrl: string; image: string; history: string[] }>());
  const [imageState, setImageState] = useState<'loading' | 'success' | 'error'>('loading');
  const [initialSettings] = useState(() => readCleanupSettings(getCleanupSessionStorage()));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const magicBrushColorRef = useRef<RgbColor | null>(null);
  
  const [panMode, setPanMode] = useState(initialSettings.panMode);
  const panGesture = useRef<{ id: number; start: PixelPoint; scroll: PixelPoint } | null>(null);

  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panMode || panGesture.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    const viewport = event.currentTarget;
    viewport.setPointerCapture(event.pointerId);
    panGesture.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, scroll: { x: viewport.scrollLeft, y: viewport.scrollTop } };
  };
  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = panGesture.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    event.preventDefault();
    const scroll = panScroll(gesture.scroll, gesture.start, { x: event.clientX, y: event.clientY });
    event.currentTarget.scrollLeft = scroll.x;
    event.currentTarget.scrollTop = scroll.y;
  };
  const endPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (panGesture.current?.id !== event.pointerId) return;
    panGesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  // Undo history of base64 states
  const [history, setHistory] = useState<string[]>([]);
  const [baseImage, setBaseImage] = useState<string>(segment.thumbnailUrl);

  // Active tool state
  const [activeTool, setActiveTool] = useState<'magic-wand' | 'eraser' | 'shave'>(initialSettings.activeTool);
  const [eraserMode, setEraserMode] = useState<'manual' | 'color-match'>(initialSettings.eraserMode);

  // Parameters
  const [magicTolerance, setMagicTolerance] = useState<number>(initialSettings.magicTolerance);
  const [keyStrengthPercent, setKeyStrengthPercent] = useState<number>(initialSettings.keyStrengthPercent);
  const [keyEdgeFadePercent, setKeyEdgeFadePercent] = useState<number>(initialSettings.keyEdgeFadePercent);
  const [magicBrushSize, setMagicBrushSize] = useState<number>(initialSettings.magicBrushSize);
  const [brushSize, setBrushSize] = useState<number>(initialSettings.brushSize);
  const [shaveWidth, setShaveWidth] = useState<number>(initialSettings.shaveWidth);
  const [isContiguous, setIsContiguous] = useState(() => readBorderDetection(getCleanupSessionStorage()));
  const setBorderDetection = (enabled: boolean) => {
    setIsContiguous(enabled);
    saveBorderDetection(getCleanupSessionStorage(), enabled);
  };

  // Eye-dropper/wand picked color
  const [pickedColor, setPickedColor] = useState<RgbColor | null>(null);
  const [previewColor, setPreviewColor] = useState<RgbColor | null>(null);
  const [pickedPoint, setPickedPoint] = useState<PixelPoint | null>(null);
  const [edgeSeedPoint, setEdgeSeedPoint] = useState<PixelPoint | null>(null);
  const [manualKeyColor, setManualKeyColor] = useState<string>(initialSettings.manualKeyColor);
  const [isAutoDetectedKeyColor, setIsAutoDetectedKeyColor] = useState<boolean>(true);

  // Drawing state for manual eraser
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Canvas context and image load state
  const [canvasSize, setCanvasSize] = useState({ width: segment.bounds.width, height: segment.bounds.height });
  const [viewZoom, setViewZoom] = useState<number>(initialSettings.viewZoom);
  const [workspaceSize, setWorkspaceSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    saveCleanupSettings(getCleanupSessionStorage(), {
      activeTool, eraserMode, magicTolerance, keyStrengthPercent, keyEdgeFadePercent,
      magicBrushSize, brushSize, shaveWidth, manualKeyColor, panMode, viewZoom,
    });
  }, [activeTool, eraserMode, magicTolerance, keyStrengthPercent, keyEdgeFadePercent,
    magicBrushSize, brushSize, shaveWidth, manualKeyColor, panMode, viewZoom]);

  // Responsive controls state
  const [isControlsOpen, setIsControlsOpen] = useState<boolean>(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateWorkspaceSize = () => {
      setWorkspaceSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateWorkspaceSize();

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateWorkspaceSize)
      : null;

    observer?.observe(container);
    window.addEventListener('resize', updateWorkspaceSize);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updateWorkspaceSize);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY === 0) {
        return;
      }

      event.preventDefault();
      setViewZoom((prev) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((prev + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)) * 100) / 100)));
    };

    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const rgbToHex = (color: RgbColor) => `#${[color.r, color.g, color.b]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;

  const hexToRgb = (hex: string): RgbColor => {
    const normalized = hex.replace('#', '');
    const safeHex = normalized.length === 3
      ? normalized.split('').map((char) => `${char}${char}`).join('')
      : normalized.padEnd(6, '0').slice(0, 6);

    return {
      r: parseInt(safeHex.slice(0, 2), 16),
      g: parseInt(safeHex.slice(2, 4), 16),
      b: parseInt(safeHex.slice(4, 6), 16),
    };
  };

  const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));

  const getCanvasPoint = (clientX: number, clientY: number): PixelPoint | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * canvas.height);

    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
      return null;
    }

    return { x, y };
  };

  const samplePixelAtPoint = (point: PixelPoint) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (point.x >= 0 && point.x < canvas.width && point.y >= 0 && point.y < canvas.height) {
      const pixel = ctx.getImageData(point.x, point.y, 1, 1).data;
      return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
    }

    return null;
  };

  const detectEdgeKeyColor = (imageUrl: string): Promise<EdgeKeyDetection | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const band = Math.max(1, Math.min(4, Math.floor(Math.min(width, height) / 12)));
        const bins = new Map<string, { count: number; rSum: number; gSum: number; bSum: number; firstPoint: PixelPoint }>();
        const quantize = (value: number) => Math.round(value / 16) * 16;

        const addPixel = (x: number, y: number) => {
          const idx = (y * width + x) * 4;
          const alpha = data[idx + 3];
          if (alpha === 0) {
            return;
          }

          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];
          const key = `${quantize(r)}-${quantize(g)}-${quantize(b)}`;
          const entry = bins.get(key) ?? { count: 0, rSum: 0, gSum: 0, bSum: 0, firstPoint: { x, y } };
          entry.count += 1;
          entry.rSum += r;
          entry.gSum += g;
          entry.bSum += b;
          bins.set(key, entry);
        };

        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            if (x < band || x >= width - band || y < band || y >= height - band) {
              addPixel(x, y);
            }
          }
        }

        let bestEntry: { count: number; rSum: number; gSum: number; bSum: number; firstPoint: PixelPoint } | null = null;
        bins.forEach((entry) => {
          if (!bestEntry || entry.count > bestEntry.count) {
            bestEntry = entry;
          }
        });

        if (!bestEntry || bestEntry.count === 0) {
          resolve(null);
          return;
        }

        resolve({
          color: {
            r: Math.round(bestEntry.rSum / bestEntry.count),
            g: Math.round(bestEntry.gSum / bestEntry.count),
            b: Math.round(bestEntry.bSum / bestEntry.count),
          },
          point: bestEntry.firstPoint,
        });
      };

      img.onerror = () => resolve(null);
      img.src = imageUrl;
    });
  };

  const activateKeyColor = (color: RgbColor, point: PixelPoint | null) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const currentURL = canvas.toDataURL('image/png');
    setHistory((prev) => [...prev, currentURL]);
    setBaseImage(currentURL);

    setPickedColor(color);
    setPreviewColor(color);
    setPickedPoint(point);
    setManualKeyColor(rgbToHex(color));
    setIsAutoDetectedKeyColor(false);
  };

  useEffect(() => {
    let isCancelled = false;

    const storedDraft = drafts.current.get(segment.id);
    const draft = storedDraft?.sourceUrl === segment.thumbnailUrl ? storedDraft : undefined;
    setImageState('loading');
    setBaseImage(draft?.image ?? segment.thumbnailUrl);
    setHistory(draft?.history ?? []);
    setIsDrawing(false);
    setMousePos(null);
    panGesture.current = null;
    setPickedColor(null);
    setPreviewColor(null);
    setPickedPoint(null);
    setEdgeSeedPoint(null);
    setIsAutoDetectedKeyColor(true);
    magicBrushColorRef.current = null;

    detectEdgeKeyColor(segment.thumbnailUrl).then((detection) => {
      if (isCancelled) {
        return;
      }

      if (!detection) {
        return;
      }

      setPickedColor(detection.color);
      setPickedPoint(detection.point);
      setEdgeSeedPoint(detection.point);
    });

    return () => {
      isCancelled = true;
    };
  }, [segment.id, segment.thumbnailUrl]);

  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      handleCanvasMouseDown({
        clientX: touch.clientX,
        clientY: touch.clientY,
        preventDefault: () => {},
      } as any);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length > 0) {
      const touch = e.touches[0];
      handleCanvasMouseMove({
        clientX: touch.clientX,
        clientY: touch.clientY,
        preventDefault: () => {},
      } as any);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    handleCanvasMouseUp();
  };

  // Initialize and redraw when key preview settings change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    let cancelled = false;
    setImageState('loading');
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      canvas.width = img.width;
      canvas.height = img.height;
      setCanvasSize({ width: img.width, height: img.height });
      ctx.clearRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);

      // Apply keying dynamically on redraw!
      if (previewColor) {
        if (isContiguous && pickedPoint) {
          keyOutColorContiguous(pickedPoint.x, pickedPoint.y, previewColor.r, previewColor.g, previewColor.b, magicTolerance);
        } else {
          keyOutColor(previewColor.r, previewColor.g, previewColor.b, magicTolerance);
        }
      }
      setImageState('success');
    };
    img.onerror = () => { if (!cancelled) setImageState('error'); };
    img.src = baseImage;
    return () => { cancelled = true; };
  }, [segment.id, baseImage, previewColor, pickedPoint, isContiguous, magicTolerance, keyStrengthPercent, keyEdgeFadePercent]);

  // Push current canvas state to history
  const pushHistory = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const currentState = canvas.toDataURL('image/png');
    setHistory((prev) => [...prev, currentState]);
  };

  // Undo last modification
  const handleUndo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    setBaseImage(previous);
    setPreviewColor(null);
    setPickedPoint(null);
    setIsAutoDetectedKeyColor(false);
    magicBrushColorRef.current = null;
  };

  // Sample pixel color from mouse coordinate
  const samplePixelColor = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const point = getCanvasPoint(e.clientX, e.clientY);
    return point ? samplePixelAtPoint(point) : null;
  };

  const eraseMatchingPixelsInBrush = (point: PixelPoint, targetColor: RgbColor, tolerance: number, diameter: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const radius = Math.max(1, diameter / 2);
    const radiusCeil = Math.ceil(radius);
    const x0 = Math.max(0, point.x - radiusCeil);
    const y0 = Math.max(0, point.y - radiusCeil);
    const x1 = Math.min(canvas.width - 1, point.x + radiusCeil);
    const y1 = Math.min(canvas.height - 1, point.y + radiusCeil);
    const width = x1 - x0 + 1;
    const height = y1 - y0 + 1;
    const imgData = ctx.getImageData(x0, y0, width, height);
    const data = imgData.data;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = x + x0 - point.x;
        const dy = y + y0 - point.y;
        if (dx * dx + dy * dy > radius * radius) {
          continue;
        }

        const idx = (y * width + x) * 4;
        const alpha = data[idx + 3];
        if (alpha === 0) {
          continue;
        }

        const distance = getRgbDistance(
          { r: data[idx], g: data[idx + 1], b: data[idx + 2] },
          targetColor
        );

        if (distance <= tolerance) {
          const nextAlpha = applyKeyRemovalToAlpha({
            alpha,
            distance,
            tolerance,
            strengthPercent: keyStrengthPercent,
            edgeFadePercent: keyEdgeFadePercent,
          });
          data[idx + 3] = nextAlpha;
          if (nextAlpha === 0) {
            data[idx] = 0;
            data[idx + 1] = 0;
            data[idx + 2] = 0;
          }
        }
      }
    }

    ctx.putImageData(imgData, x0, y0);
  };

  // Handle canvas mouse interaction
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (imageState !== 'success') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (activeTool === 'magic-wand') {
      const point = getCanvasPoint(e.clientX, e.clientY);
      if (!point) return;

      const pixel = samplePixelAtPoint(point);
      if (!pixel) return;

      activateKeyColor({ r: pixel.r, g: pixel.g, b: pixel.b }, point);
    } else if (activeTool === 'eraser') {
      // Bake the magic wand if active
      if (previewColor) {
        const currentURL = canvas.toDataURL('image/png');
        setHistory((prev) => [...prev, currentURL]);
        setBaseImage(currentURL);
        setPreviewColor(null);
        setPickedPoint(null);
        setIsAutoDetectedKeyColor(false);
      } else {
        setHistory((prev) => [...prev, canvas.toDataURL('image/png')]);
      }

      if (eraserMode === 'color-match') {
        const point = getCanvasPoint(e.clientX, e.clientY);
        if (!point) return;

        const sampledPixel = samplePixelAtPoint(point);
        const brushColor = pickedColor ?? (sampledPixel ? { r: sampledPixel.r, g: sampledPixel.g, b: sampledPixel.b } : null);
        if (!brushColor) return;

        if (!pickedColor) {
          setPickedColor(brushColor);
          setManualKeyColor(rgbToHex(brushColor));
          setIsAutoDetectedKeyColor(false);
        }

        magicBrushColorRef.current = brushColor;
        setIsDrawing(true);
        eraseMatchingPixelsInBrush(point, brushColor, magicTolerance, magicBrushSize);
        return;
      }

      setIsDrawing(true);
      drawEraser(e);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Track mouse coordinates for rendering manual brush preview circular indicator
    const point = getCanvasPoint(e.clientX, e.clientY);
    if (!point) return;
    const x = point.x;
    const y = point.y;
    setMousePos({ x, y });

    if (activeTool === 'eraser' && eraserMode === 'color-match' && isDrawing && magicBrushColorRef.current) {
      eraseMatchingPixelsInBrush(point, magicBrushColorRef.current, magicTolerance, magicBrushSize);
    }

    if (activeTool === 'eraser' && eraserMode === 'manual' && isDrawing) {
      drawEraser(e);
    }
  };

  const handleCanvasMouseUp = () => {
    if (isDrawing) {
      setIsDrawing(false);
      const canvas = canvasRef.current;
      if (canvas) {
        const currentURL = canvas.toDataURL('image/png');
        setBaseImage(currentURL);
      }
      magicBrushColorRef.current = null;
    }
  };

  const handleCanvasMouseLeave = () => {
    if (isDrawing) {
      setIsDrawing(false);
      const canvas = canvasRef.current;
      if (canvas) {
        const currentURL = canvas.toDataURL('image/png');
        setBaseImage(currentURL);
      }
      magicBrushColorRef.current = null;
    }
    setMousePos(null);
  };

  // Run the manual eraser brush
  const drawEraser = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  // Execute Color Keying (Erase matching colors globally)
  const keyOutColor = (targetR: number, targetG: number, targetB: number, tolerance: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const imgData = ctx.getImageData(0, 0, W, H);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a === 0) continue;

      const distance = getRgbDistance({ r, g, b }, { r: targetR, g: targetG, b: targetB });

      if (distance <= tolerance) {
        data[i + 3] = applyKeyRemovalToAlpha({
          alpha: a,
          distance,
          tolerance,
          strengthPercent: keyStrengthPercent,
          edgeFadePercent: keyEdgeFadePercent,
        });
      }
    }

    ctx.putImageData(imgData, 0, 0);
  };

  // Execute Contiguous Color Keying (Erase connected matching colors starting from seed)
  const keyOutColorContiguous = (
    startX: number,
    startY: number,
    targetR: number,
    targetG: number,
    targetB: number,
    tolerance: number
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    if (startX < 0 || startX >= W || startY < 0 || startY >= H) return;

    const imgData = ctx.getImageData(0, 0, W, H);
    const data = imgData.data;

    const visited = new Uint8Array(W * H);
    const queue = new Int32Array(W * H);
    let head = 0;
    let tail = 0;

    const startIdx = startY * W + startX;
    queue[tail++] = startIdx;
    visited[startIdx] = 1;

    while (head < tail) {
      const curr = queue[head++];
      const cx = curr % W;
      const cy = Math.floor(curr / W);

      const idx = curr * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a === 0) continue;

      const distance = getRgbDistance({ r, g, b }, { r: targetR, g: targetG, b: targetB });

      if (distance <= tolerance) {
        const nextAlpha = applyKeyRemovalToAlpha({
          alpha: a,
          distance,
          tolerance,
          strengthPercent: keyStrengthPercent,
          edgeFadePercent: keyEdgeFadePercent,
        });
        data[idx + 3] = nextAlpha;
        if (nextAlpha === 0) {
          data[idx] = 0;
          data[idx + 1] = 0;
          data[idx + 2] = 0;
        }

        const n1 = curr - 1;       // left
        const n2 = curr + 1;       // right
        const n3 = curr - W;       // top
        const n4 = curr + W;       // bottom

        if (cx > 0 && visited[n1] === 0) {
          visited[n1] = 1;
          queue[tail++] = n1;
        }
        if (cx < W - 1 && visited[n2] === 0) {
          visited[n2] = 1;
          queue[tail++] = n2;
        }
        if (cy > 0 && visited[n3] === 0) {
          visited[n3] = 1;
          queue[tail++] = n3;
        }
        if (cy < H - 1 && visited[n4] === 0) {
          visited[n4] = 1;
          queue[tail++] = n4;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  };

  // Execute Border Shaving (Alpha Channel Erosion)
  const applyShaveBorder = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Push current visual state to history so they can undo the shave
    const preShaveURL = canvas.toDataURL('image/png');
    setHistory((prev) => [...prev, preShaveURL]);

    const W = canvas.width;
    const H = canvas.height;
    const imgData = ctx.getImageData(0, 0, W, H);
    const data = imgData.data;

    // Fast copy of alpha channel
    const srcAlpha = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      srcAlpha[i] = data[i * 4 + 3];
    }
    const dstAlpha = new Uint8Array(srcAlpha);

    const k = shaveWidth;
    
    // Erosion algorithm: pixel is eroded if any pixel in radius is transparent
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (srcAlpha[y * W + x] === 0) continue;

        let minAlpha = 255;
        // Search kernel box
        for (let dy = -k; dy <= k; dy++) {
          for (let dx = -k; dx <= k; dx++) {
            // Circle distance filter
            if (dx * dx + dy * dy > k * k) continue;

            const nx = x + dx;
            const ny = y + dy;

            if (nx >= 0 && nx < W && ny >= 0 && ny < H) {
              const alpha = srcAlpha[ny * W + nx];
              if (alpha < minAlpha) minAlpha = alpha;
            } else {
              minAlpha = 0; // Edge boundaries erode to transparent
            }
          }
        }
        dstAlpha[y * W + x] = minAlpha;
      }
    }

    // Write alpha back and clear color channels of fully transparent pixels
    for (let i = 0; i < W * H; i++) {
      const newA = dstAlpha[i];
      data[i * 4 + 3] = newA;
      if (newA === 0) {
        data[i * 4] = 0;
        data[i * 4 + 1] = 0;
        data[i * 4 + 2] = 0;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Save the newly shaved canvas state as baseImage and clear pickedColor
    const postShaveURL = canvas.toDataURL('image/png');
    setBaseImage(postShaveURL);
    setPreviewColor(null);
    setPickedPoint(null);
    setIsAutoDetectedKeyColor(false);
    magicBrushColorRef.current = null;
  };

  // Quick reset to original segment cutout
  const handleReset = () => {
    const canvas = canvasRef.current;
    const currentURL = canvas ? canvas.toDataURL('image/png') : baseImage;
    setHistory((prev) => [...prev, currentURL]);
    setBaseImage(segment.thumbnailUrl);
    setPreviewColor(null);
    setPickedPoint(null);
    setIsAutoDetectedKeyColor(true);
    magicBrushColorRef.current = null;

    detectEdgeKeyColor(segment.thumbnailUrl).then((detection) => {
      if (!detection) {
        setManualKeyColor('#ffffff');
        return;
      }

      setManualKeyColor(rgbToHex(detection.color));
      setPickedColor(detection.color);
      setPickedPoint(detection.point);
      setEdgeSeedPoint(detection.point);
    });
  };

  // Apply changes back to app state
  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas || imageState !== 'success') return;
    const finalUrl = canvas.toDataURL('image/png');
    onSave(finalUrl);
  };

  const navigateToSegment = (target: SavedSegment | null) => {
    if (!target || !onSelectSegment || imageState === 'loading' || isDrawing) return;
    const canvas = canvasRef.current;
    if (canvas && imageState === 'success') {
      drafts.current.set(segment.id, {
        sourceUrl: segment.thumbnailUrl,
        image: canvas.toDataURL('image/png'),
        history: [...history],
      });
    }
    setImageState('loading');
    onSelectSegment(target);
  };

  const handleApplyManualKeyColor = () => {
    const nextColor = hexToRgb(manualKeyColor);

    if (activeTool === 'eraser' && eraserMode === 'color-match') {
      setPickedColor(nextColor);
      setPreviewColor(null);
      setPickedPoint(null);
      setIsAutoDetectedKeyColor(false);
      magicBrushColorRef.current = nextColor;
      return;
    }

    activateKeyColor(nextColor, isContiguous ? edgeSeedPoint : null);
  };

  const availableWidth = Math.max(workspaceSize.width - 48, 1);
  const availableHeight = Math.max(workspaceSize.height - 48, 1);
  const fitScale =
    canvasSize.width > 0 && canvasSize.height > 0
      ? Math.min(availableWidth / canvasSize.width, availableHeight / canvasSize.height, 1)
      : 1;
  const displayWidth = Math.max(1, Math.round(canvasSize.width * fitScale * viewZoom));
  const displayHeight = Math.max(1, Math.round(canvasSize.height * fitScale * viewZoom));
  const zoomPercent = Math.round(viewZoom * 100);
  const keyColorControls = (label: string) => (
    <div className="cleanup-color-row">
      <span>Key Color</span>
      <input type="color" value={manualKeyColor} onChange={event => setManualKeyColor(event.target.value)} aria-label={label} />
      <span className="font-mono">{manualKeyColor.toUpperCase()}</span>
      <button onClick={handleApplyManualKeyColor} title="Apply the selected key color" className="border border-slate-700 rounded text-emerald-300">Apply</button>
    </div>
  );

  const keyRefinementControls = (
    <div className="cleanup-refinement">
      <h4 className="cleanup-section-label">Key Refinement</h4>

      <div className="cleanup-slider-row"><div className="flex justify-between text-xs text-slate-300">
          <span>Removal Strength</span>
          <span className="font-mono text-emerald-400 font-bold">{keyStrengthPercent}%</span>
        </div><input
          type="range" aria-label="Removal Strength" title="Lower strength keeps similar object edges more opaque."
          min={MIN_KEY_STRENGTH_PERCENT}
          max={MAX_KEY_STRENGTH_PERCENT}
          step="1"
          value={keyStrengthPercent}
          onChange={(e) => setKeyStrengthPercent(normalizeKeyStrengthPercent(parseInt(e.target.value, 10)))}
          className="w-full accent-emerald-500 cursor-pointer h-1.5"
        /></div>

      <div className="cleanup-slider-row"><div className="flex justify-between text-xs text-slate-300">
          <span>Edge Fade</span>
          <span className="font-mono text-emerald-400 font-bold">{keyEdgeFadePercent}%</span>
        </div><input
          type="range" aria-label="Edge Fade" title="Higher fade softens pixels near the tolerance edge."
          min={MIN_KEY_EDGE_FADE_PERCENT}
          max={MAX_KEY_EDGE_FADE_PERCENT}
          step="1"
          value={keyEdgeFadePercent}
          onChange={(e) => setKeyEdgeFadePercent(normalizeKeyEdgeFadePercent(parseInt(e.target.value, 10)))}
          className="w-full accent-emerald-500 cursor-pointer h-1.5"
        /></div>
    </div>
  );

  return (
    <div id="bg-remover-modal" className="cleanup-workspace fixed inset-0 h-[100dvh] overflow-hidden bg-slate-950/95 backdrop-blur-md z-50 flex items-start md:items-center justify-center p-0 md:p-6 text-slate-100 font-sans">
      <div className="w-full max-w-5xl h-full md:h-[85vh] bg-slate-900 border-0 md:border border-slate-800 rounded-none md:rounded-3xl flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Header */}
        <header className="safe-area-top-bar min-h-16 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between gap-3 px-4 py-2 md:px-6 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="bg-emerald-500/10 p-2 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Scissors className="h-5 w-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-xs sm:text-sm text-slate-100 truncate">Background Cleanup</h1>
              <p className="hidden sm:block text-[10px] text-slate-500 font-mono">Erase halos, background artifacts & solid color backing</p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-3">
            <button
              onClick={handleUndo}
              disabled={history.length === 0}
              className="flex items-center space-x-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-40 text-slate-300 transition-all"
              title="Undo last change"
            >
              <Undo2 className="h-4 w-4" />
              <span className="hidden sm:inline">Undo ({history.length})</span>
              <span className="sm:hidden">({history.length})</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-850 border border-transparent hover:border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-all"
              aria-label="Close background cleanup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {onSelectSegment && (
          <nav aria-label="Cleanup frame navigation" className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950 px-3 py-2 shrink-0">
            <button type="button" aria-label="Previous frame" onClick={() => navigateToSegment(navigation.previous)} disabled={!navigation.previous || imageState === 'loading' || isDrawing} className="flex min-h-9 items-center gap-1 rounded border border-slate-700 px-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800">
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <div className="min-w-0 flex-1 text-center text-xs" aria-live="polite">
              <p>{navigation.index >= 0 ? `Frame ${navigation.index + 1} of ${navigation.total}` : 'Frame unavailable'}</p>
              <p className="max-w-48 mx-auto truncate text-[10px] text-slate-400" title={segment.name}>{segment.name}</p>
              {imageState !== 'success' && <p role="status">{imageState === 'loading' ? 'Loading frame…' : 'Unable to load frame'}</p>}
            </div>
            <button type="button" aria-label="Next frame" onClick={() => navigateToSegment(navigation.next)} disabled={!navigation.next || imageState === 'loading' || isDrawing} className="flex min-h-9 items-center gap-1 rounded border border-slate-700 px-2 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-800">
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </nav>
        )}

        <div className="grid grid-cols-2 gap-2 border-b border-slate-800 bg-slate-950 p-2 md:hidden shrink-0">
          <button
            onClick={() => setIsControlsOpen(false)}
            className={`min-h-11 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              !isControlsOpen
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/15'
                : 'border border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            <Eye className="h-4 w-4" />
            <span>Preview</span>
          </button>
          <button
            onClick={() => setIsControlsOpen(true)}
            className={`min-h-11 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              isControlsOpen
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/15'
                : 'border border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            <Sliders className="h-4 w-4" />
            <span>Tools</span>
          </button>
        </div>

        {/* Content workspace split panel */}
        <div className="flex items-center gap-3 px-3 py-2 border-b border-slate-800">
          <button type="button" aria-pressed={panMode} onClick={() => { handleCanvasMouseUp(); setMousePos(null); setPanMode((value) => !value); }}
            className={`px-3 py-1 rounded text-xs font-semibold ${panMode ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200'}`}>
            {panMode ? 'Pan active' : 'Pan'}
          </button>
          <span className="text-xs text-slate-400">{panMode ? 'Drag to move. Turn off Pan to edit.' : 'Enable Pan to move with a mouse or touch.'}</span>
        </div>
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden relative pb-20 md:pb-0">
          
          {/* Main Visual interactive Canvas Area */}
          <div
            ref={containerRef}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            onLostPointerCapture={() => { panGesture.current = null; }}
            style={{ touchAction: panMode ? 'none' : undefined, cursor: panMode ? 'grab' : undefined }}
            className={`${isControlsOpen ? 'hidden md:block' : 'block'} flex-1 min-h-0 bg-checkerboard relative overflow-auto select-none`}
          >
            <div className="w-max min-h-full min-w-full flex items-center justify-center p-3 pb-24 md:p-8">
            
            {/* Visual Canvas and guides */}
            <div
              className="relative border border-slate-800/80 rounded-none shadow-2xl overflow-hidden flex items-center justify-center shrink-0"
              style={{
                width: `${displayWidth}px`,
                height: `${displayHeight}px`,
              }}
            >
              <canvas
                ref={canvasRef}
                onMouseDown={panMode ? undefined : handleCanvasMouseDown}
                onMouseMove={panMode ? undefined : handleCanvasMouseMove}
                onMouseUp={panMode ? undefined : handleCanvasMouseUp}
                onMouseLeave={panMode ? undefined : handleCanvasMouseLeave}
                onTouchStart={panMode ? undefined : handleTouchStart}
                onTouchMove={panMode ? undefined : handleTouchMove}
                onTouchEnd={panMode ? undefined : handleTouchEnd}
                className={`block transition-shadow duration-300 ${
                  panMode ? 'cursor-grab' : activeTool === 'magic-wand' ? 'cursor-crosshair' : 'cursor-none'
                }`}
                style={{
                  imageRendering: 'pixelated',
                  width: `${displayWidth}px`,
                  height: `${displayHeight}px`,
                  touchAction: panMode || activeTool === 'eraser' ? 'none' : 'manipulation',
                }}
              />

              {/* Virtual Cursor Indicator for Manual Eraser Brush */}
              {!panMode && activeTool === 'eraser' && mousePos && canvasRef.current && (
                <div
                  className={`absolute rounded-full pointer-events-none ${eraserMode === 'color-match' ? 'border border-emerald-400 bg-emerald-400/10' : 'border border-red-500 bg-red-500/10'}`}
                  style={{
                    left: `${(mousePos.x / canvasRef.current.width) * 100}%`,
                    top: `${(mousePos.y / canvasRef.current.height) * 100}%`,
                    width: `${((eraserMode === 'color-match' ? magicBrushSize : brushSize) / canvasRef.current.width) * 100}%`,
                    height: `${((eraserMode === 'color-match' ? magicBrushSize : brushSize) / canvasRef.current.height) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              )}
            </div>
            </div>

            {!isControlsOpen && (
              <div className="absolute bottom-3 left-3 right-3 md:hidden z-20">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/92 backdrop-blur px-3 py-3 shadow-2xl space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-emerald-400">Cleanup Actions</span>
                    <span>
                      {activeTool === 'magic-wand'
                        ? 'Click Key'
                        : activeTool === 'eraser'
                          ? eraserMode === 'color-match'
                            ? 'Color Match Eraser'
                            : 'Manual Eraser'
                          : 'Border Shave'}
                    </span>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-2.5 py-2">
                    <div className="grid grid-cols-[2rem_minmax(3.5rem,1fr)_2rem_2.5rem] items-center gap-2">
                      <button
                        onClick={() => setViewZoom((prev) => clampZoom(prev - ZOOM_STEP))}
                        disabled={viewZoom <= ZOOM_MIN}
                        className="flex h-8 w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-300 transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Zoom out"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setViewZoom(1)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-2 text-center text-[10px] font-semibold text-slate-200 transition-all hover:bg-slate-800 cursor-pointer"
                        title="Reset to fit"
                      >
                        {zoomPercent}%
                      </button>
                      <button
                        onClick={() => setViewZoom((prev) => clampZoom(prev + ZOOM_STEP))}
                        disabled={viewZoom >= ZOOM_MAX}
                        className="flex h-8 w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-300 transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Zoom in"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setViewZoom(1)}
                        className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-2 text-[10px] font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20 cursor-pointer"
                      >
                        Fit
                      </button>
                    </div>
                    <p className="mt-1 text-[9px] text-slate-500">Mouse wheel zooms the cleanup view.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <button
                      onClick={() => setIsControlsOpen(true)}
                      className="py-3 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Settings className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Tools</span>
                    </button>
                  </div>
                  <button
                    onClick={handleReset}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reset to Original</span>
                  </button>
                </div>
              </div>
            )}

          </div>

          {/* Right Control Sidebar */}
          <aside className={`${isControlsOpen ? 'flex' : 'hidden md:flex'} cleanup-inspector w-full md:w-72 flex-1 md:flex-none min-h-0 border-t md:border-t-0 md:border-l border-slate-800 bg-slate-950 flex-col shrink-0 overflow-hidden`}>
            
            {/* Mobile Bottom Sheet Handle */}
            <div className="flex md:hidden justify-center shrink-0 pt-2">
              <div className="w-12 h-1 bg-slate-800 rounded-full" />
            </div>
            
            <div className="cleanup-actions p-2 border-b border-slate-800 bg-slate-950/95 backdrop-blur shrink-0 space-y-1">
              <div>
                <h3 className="sr-only">Cleanup Actions</h3>
              </div>
              <div className="cleanup-zoom" title="Scroll to zoom. Enable Pan and drag to move the view.">
                <div className="grid grid-cols-[2rem_minmax(3.5rem,1fr)_2rem_2.5rem] items-center gap-2">
                  <button
                    onClick={() => setViewZoom((prev) => clampZoom(prev - ZOOM_STEP))}
                    disabled={viewZoom <= ZOOM_MIN}
                    className="flex h-8 w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-300 transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Zoom out"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setViewZoom(1)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-center text-[10px] font-semibold text-slate-200 transition-all hover:bg-slate-800 cursor-pointer"
                    title="Reset to fit"
                  >
                    {zoomPercent}%
                  </button>
                  <button
                    onClick={() => setViewZoom((prev) => clampZoom(prev + ZOOM_STEP))}
                    disabled={viewZoom >= ZOOM_MAX}
                    className="flex h-8 w-full items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-slate-300 transition-all hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Zoom in"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setViewZoom(1)}
                    className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-2 text-[10px] font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20 cursor-pointer"
                  >
                    Fit
                  </button>
                </div>

              </div>
              <div className="cleanup-save-row hidden md:grid grid-cols-[minmax(0,1fr)_auto] gap-1">
                <button
                  aria-label="Save cleaned cutout" onClick={handleApply} disabled={imageState !== 'success'}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/10 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Check className="h-4.5 w-4.5" />
                  <span>Save Cutout</span>
                </button>
                <button
                  aria-label="Reset to original" onClick={handleReset}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset</span>
                </button>
              </div>
            </div>

            <div className="cleanup-settings flex-1 overflow-y-auto overscroll-contain p-2 space-y-2">
            {/* Toolbox Selector */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                <Sliders className="h-4 w-4 text-emerald-400" />
                <span>Erase Tools</span>
              </h3>
              
              <div className="cleanup-tool-selector grid grid-cols-3 gap-1">
                {/* 1. Magic Wand */}
                <button
                  aria-label="Click Key Eraser" title="Click Key Eraser" onClick={() => setActiveTool('magic-wand')}
                  className={`flex items-center space-x-3 px-3 py-3 rounded-xl border text-left cursor-pointer transition-all ${
                    activeTool === 'magic-wand'
                      ? 'bg-emerald-600/10 border-emerald-500 text-white shadow-lg'
                      : 'bg-slate-900 border-slate-850 text-slate-300 hover:border-slate-800'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${activeTool === 'magic-wand' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-950 text-slate-400'}`}>
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold">Key Eraser</p>
                    <p className="text-[10px] text-slate-500">Click once to key out a backdrop color</p>
                  </div>
                </button>

                {/* 2. Eraser */}
                <button
                  aria-label="Brush Eraser" title="Brush Eraser" onClick={() => setActiveTool('eraser')}
                  className={`flex items-center space-x-3 px-3 py-3 rounded-xl border text-left cursor-pointer transition-all ${
                    activeTool === 'eraser'
                      ? 'bg-emerald-600/10 border-emerald-500 text-white shadow-lg'
                      : 'bg-slate-900 border-slate-850 text-slate-300 hover:border-slate-800'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${activeTool === 'eraser' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-950 text-slate-400'}`}>
                    <Trash2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold">Eraser</p>
                    <p className="text-[10px] text-slate-500">Manual or color-match cleanup brushing</p>
                  </div>
                </button>

                {/* 3. Border Shave */}
                <button
                  aria-label="Border Shave" title="Border Shave" onClick={() => setActiveTool('shave')}
                  className={`flex items-center space-x-3 px-3 py-3 rounded-xl border text-left cursor-pointer transition-all ${
                    activeTool === 'shave'
                      ? 'bg-emerald-600/10 border-emerald-500 text-white shadow-lg'
                      : 'bg-slate-900 border-slate-850 text-slate-300 hover:border-slate-800'
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${activeTool === 'shave' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-950 text-slate-400'}`}>
                    <Scissors className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold">Edge Shave</p>
                    <p className="text-[10px] text-slate-500">Shrink outline boundary halo</p>
                  </div>
                </button>
              </div>
            </div>

            <details className="cleanup-help"><summary>Tool Help</summary><p>Key Eraser samples the background color. Tolerance controls the color range; Strength controls removal; Edge Fade softens the boundary. Border Detection restricts removal to connected pixels. Scroll to zoom, or enable Pan and drag to move.</p></details>

            {/* Dynamic settings per selected tool */}
            <div className="flex-1 space-y-4 pt-3 border-t border-slate-900">
              
              {activeTool === 'magic-wand' && (
                <div className="space-y-4">
                  <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider block">Click Key Settings</span>
                  
                  <div className="cleanup-slider-row"><div className="flex justify-between text-xs text-slate-300">
                      <span>Color Tolerance</span>
                      <span className="font-mono text-emerald-400 font-bold">{magicTolerance}</span>
                    </div><input
                      type="range" aria-label="Color Tolerance" title="Higher tolerance removes broader shade variations of the clicked color. Lower tolerance is more selective."
                      min="0"
                      max="150"
                      step="1"
                      value={magicTolerance}
                      onChange={(e) => setMagicTolerance(parseInt(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer h-1.5"
                    /></div>

                  {keyRefinementControls}

                  {keyColorControls("Select key color")}

                  <div className="cleanup-toggle-row" title="Restrict removal to connected background pixels.">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-200">Border Detection</span>
                      <span className="text-[9px] text-slate-500">Contiguous flood-fill (only connected pixels)</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={isContiguous}
                      onChange={(e) => setBorderDetection(e.target.checked)}
                      aria-label="Border detection"
                      className="rounded text-emerald-500 focus:ring-emerald-500 bg-slate-950 border-slate-800 h-4 w-4 cursor-pointer"
                    />
                  </div>

                  {pickedColor && (
                    <details className="cleanup-key-details"><summary className="cleanup-section-label">Active Key Details</summary>
                      <p className="text-[10px] text-slate-400">Active Key Color:</p>
                      <div className="flex items-center space-x-2.5">
                        <div
                          className="w-7 h-7 rounded-lg border border-slate-700 shadow"
                          style={{
                            backgroundColor: `rgb(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b})`,
                          }}
                        />
                        <div className="font-mono text-[10px] text-slate-400">
                          RGB: {pickedColor.r}, {pickedColor.g}, {pickedColor.b}
                        </div>
                      </div>
                      {isAutoDetectedKeyColor && (
                        <p className="text-[9px] text-emerald-400 leading-relaxed">
                          Auto-detected from the image edge and seeded from the border, so the border-only toggle works again without a fresh background click.
                        </p>
                      )}
                      {!isAutoDetectedKeyColor && !pickedPoint && (
                        <p className="text-[9px] text-emerald-400 leading-relaxed">
                          This pass is using the selected color globally, so tolerance works even without a new canvas click.
                        </p>
                      )}
                    </details>
                  )}

                </div>
              )}

              {activeTool === 'eraser' && (
                <div className="space-y-4">
                  <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider block">Eraser Settings</span>

                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-850 bg-slate-900 p-2">
                    <button
                      onClick={() => setEraserMode('manual')}
                      className={`rounded-lg px-3 py-2 text-[10px] font-semibold transition-all cursor-pointer ${
                        eraserMode === 'manual'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      Manual
                    </button>
                    <button
                      onClick={() => setEraserMode('color-match')}
                      className={`rounded-lg px-3 py-2 text-[10px] font-semibold transition-all cursor-pointer ${
                        eraserMode === 'color-match'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-950 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      Color Match
                    </button>
                  </div>

                  {eraserMode === 'manual' && (
                    <div className="cleanup-slider-row"><div className="flex justify-between text-xs text-slate-300">
                        <span>Brush Size</span>
                        <span className="font-mono text-emerald-400 font-bold">{brushSize}px</span>
                      </div><input
                        type="range" aria-label="Brush Size" title="Freely erases pixels regardless of color."
                        min="2"
                        max="60"
                        step="1"
                        value={brushSize}
                        onChange={(e) => setBrushSize(parseInt(e.target.value))}
                        className="w-full accent-emerald-500 cursor-pointer h-1.5"
                      /></div>
                  )}

                  {eraserMode === 'color-match' && (
                    <>
                      <div className="cleanup-slider-row"><div className="flex justify-between text-xs text-slate-300">
                          <span>Color Tolerance</span>
                          <span className="font-mono text-emerald-400 font-bold">{magicTolerance}</span>
                        </div><input
                          type="range" aria-label="Color Tolerance" title="Only matching pixels inside the brush are erased."
                          min="0"
                          max="150"
                          step="1"
                          value={magicTolerance}
                          onChange={(e) => setMagicTolerance(parseInt(e.target.value))}
                          className="w-full accent-emerald-500 cursor-pointer h-1.5"
                        /></div>

                      {keyRefinementControls}

                      <div className="cleanup-slider-row"><div className="flex justify-between text-xs text-slate-300">
                          <span>Brush Diameter</span>
                          <span className="font-mono text-emerald-400 font-bold">{magicBrushSize}px</span>
                        </div><input
                          type="range" aria-label="Brush Diameter" title="Smaller diameters help remove leftover background pixels without chewing into the subject."
                          min="2"
                          max="32"
                          step="1"
                          value={magicBrushSize}
                          onChange={(e) => setMagicBrushSize(parseInt(e.target.value))}
                          className="w-full accent-emerald-500 cursor-pointer h-1.5"
                        /></div>

                      {keyColorControls("Select eraser key color")}

                      {pickedColor && (
                        <details className="cleanup-key-details"><summary className="cleanup-section-label">Active Key Details</summary>
                          <p className="text-[10px] text-slate-400">Brush Key Color:</p>
                          <div className="flex items-center space-x-2.5">
                            <div
                              className="w-7 h-7 rounded-lg border border-slate-700 shadow"
                              style={{
                                backgroundColor: `rgb(${pickedColor.r}, ${pickedColor.g}, ${pickedColor.b})`,
                              }}
                            />
                            <div className="font-mono text-[10px] text-slate-400">
                              RGB: {pickedColor.r}, {pickedColor.g}, {pickedColor.b}
                            </div>
                          </div>
                        </details>
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTool === 'shave' && (
                <div className="space-y-4">
                  <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider block">Border Shave Settings</span>
                  
                  <div className="cleanup-slider-row"><div className="flex justify-between text-xs text-slate-300">
                      <span>Shave Width (Erode)</span>
                      <span className="font-mono text-emerald-400 font-bold">{shaveWidth} px</span>
                    </div><input
                      type="range" aria-label="Shave Width (Erode)" title="Shrinks the boundary of the sprite inward by $N$ pixels. This instantly dissolves thin outline fringes and background halos."
                      min="1"
                      max="6"
                      step="1"
                      value={shaveWidth}
                      onChange={(e) => setShaveWidth(parseInt(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer h-1.5"
                    /></div>

                  <button
                    onClick={applyShaveBorder}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 cursor-pointer shadow-md shadow-emerald-600/10 active:scale-[0.98] transition-all"
                  >
                    <Scissors className="h-3.5 w-3.5" />
                    <span>Apply Shave / Erode</span>
                  </button>
                </div>
              )}

            </div>
            </div>

          </aside>

          <div
            className="fixed bottom-0 left-0 right-0 z-[60] border-t border-slate-800 bg-slate-950/96 px-3 pt-3 shadow-2xl md:hidden"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <button
                onClick={handleApply}
                disabled={imageState !== 'success'}
                className="min-h-11 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 text-xs font-bold text-white shadow-lg shadow-emerald-600/10 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center space-x-2"
              >
                <Check className="h-4 w-4" />
                <span>Save Cleaned Cutout</span>
              </button>
              <button
                onClick={() => setIsControlsOpen((prev) => !prev)}
                className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-3 text-xs font-semibold text-slate-300 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <Settings className="h-3.5 w-3.5 text-emerald-400" />
                <span>{isControlsOpen ? 'Hide' : 'Tools'}</span>
              </button>
              <button
                onClick={handleReset}
                className="min-h-11 rounded-xl border border-slate-800 bg-slate-900 px-3 text-xs font-semibold text-slate-400 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center"
                aria-label="Reset to original"
                title="Reset to original"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
