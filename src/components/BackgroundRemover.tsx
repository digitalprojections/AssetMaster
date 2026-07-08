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
  MousePointer,
  Eye,
  Settings,
  Grid
} from 'lucide-react';

interface BackgroundRemoverProps {
  segment: SavedSegment;
  onSave: (updatedUrl: string) => void;
  onClose: () => void;
}

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

type PixelPoint = {
  x: number;
  y: number;
};

type EdgeKeyDetection = {
  color: RgbColor;
  point: PixelPoint | null;
};

export default function BackgroundRemover({ segment, onSave, onClose }: BackgroundRemoverProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Undo history of base64 states
  const [history, setHistory] = useState<string[]>([]);
  const [baseImage, setBaseImage] = useState<string>(segment.thumbnailUrl);

  // Active tool state
  const [activeTool, setActiveTool] = useState<'magic-wand' | 'eraser' | 'shave'>('magic-wand');

  // Parameters
  const [magicTolerance, setMagicTolerance] = useState<number>(30);
  const [brushSize, setBrushSize] = useState<number>(16);
  const [shaveWidth, setShaveWidth] = useState<number>(1);
  const [isContiguous, setIsContiguous] = useState<boolean>(true);

  // Eye-dropper/wand picked color
  const [pickedColor, setPickedColor] = useState<RgbColor | null>(null);
  const [pickedPoint, setPickedPoint] = useState<PixelPoint | null>(null);
  const [edgeSeedPoint, setEdgeSeedPoint] = useState<PixelPoint | null>(null);
  const [manualKeyColor, setManualKeyColor] = useState<string>('#ffffff');
  const [isAutoDetectedKeyColor, setIsAutoDetectedKeyColor] = useState<boolean>(true);

  // Drawing state for manual eraser
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Canvas context and image load state
  const [canvasSize, setCanvasSize] = useState({ width: segment.bounds.width, height: segment.bounds.height });

  // Responsive controls state
  const [isControlsOpen, setIsControlsOpen] = useState<boolean>(true);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsControlsOpen(false);
    }
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

    if (pickedColor) {
      const currentURL = canvas.toDataURL('image/png');
      setHistory((prev) => [...prev, baseImage]);
      setBaseImage(currentURL);
    } else {
      setHistory((prev) => [...prev, baseImage]);
    }

    setPickedColor(color);
    setPickedPoint(point);
    setManualKeyColor(rgbToHex(color));
    setIsAutoDetectedKeyColor(false);
  };

  useEffect(() => {
    let isCancelled = false;

    setBaseImage(segment.thumbnailUrl);
    setHistory([]);
    setPickedColor(null);
    setPickedPoint(null);
    setEdgeSeedPoint(null);
    setIsAutoDetectedKeyColor(true);

    detectEdgeKeyColor(segment.thumbnailUrl).then((detection) => {
      if (isCancelled) {
        return;
      }

      if (!detection) {
        setManualKeyColor('#ffffff');
        return;
      }

      setManualKeyColor(rgbToHex(detection.color));
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

  // Initialize and redraw on canvas whenever the baseImage, pickedColor, pickedPoint, isContiguous or magicTolerance changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      setCanvasSize({ width: img.width, height: img.height });
      ctx.clearRect(0, 0, img.width, img.height);
      ctx.drawImage(img, 0, 0);

      // Apply keying dynamically on redraw!
      if (pickedColor) {
        if (isContiguous && pickedPoint) {
          keyOutColorContiguous(pickedPoint.x, pickedPoint.y, pickedColor.r, pickedColor.g, pickedColor.b, magicTolerance);
        } else {
          keyOutColor(pickedColor.r, pickedColor.g, pickedColor.b, magicTolerance);
        }
      }
    };
    img.src = baseImage;
  }, [baseImage, pickedColor, pickedPoint, isContiguous, magicTolerance]);

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
    setPickedColor(null);
    setPickedPoint(null);
    setIsAutoDetectedKeyColor(false);
  };

  // Sample pixel color from mouse coordinate
  const samplePixelColor = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const rect = canvas.getBoundingClientRect();
    // Scale coordinate according to real canvas dimensions
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);

    if (x >= 0 && x < canvas.width && y >= 0 && y < canvas.height) {
      const pixel = ctx.getImageData(x, y, 1, 1).data;
      return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
    }
    return null;
  };

  // Handle canvas mouse interaction
  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (activeTool === 'magic-wand') {
      const color = samplePixelColor(e);
      if (color) {
        // Calculate raw canvas coords
        const rect = canvas.getBoundingClientRect();
        const cx = Math.floor(((e.clientX - rect.left) / rect.width) * canvas.width);
        const cy = Math.floor(((e.clientY - rect.top) / rect.height) * canvas.height);

        activateKeyColor({ r: color.r, g: color.g, b: color.b }, { x: cx, y: cy });
      }
    } else if (activeTool === 'eraser') {
      // Bake the magic wand if active
      if (pickedColor) {
        const currentURL = canvas.toDataURL('image/png');
        setHistory((prev) => [...prev, baseImage]);
        setBaseImage(currentURL);
        setPickedColor(null);
        setPickedPoint(null);
        setIsAutoDetectedKeyColor(false);
      } else {
        setHistory((prev) => [...prev, baseImage]);
      }
      setIsDrawing(true);
      drawEraser(e);
    }
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Track mouse coordinates for rendering manual brush preview circular indicator
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    setMousePos({ x, y });

    if (activeTool === 'eraser' && isDrawing) {
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

      // Color distance
      const distance = Math.sqrt(
        Math.pow(r - targetR, 2) +
        Math.pow(g - targetG, 2) +
        Math.pow(b - targetB, 2)
      );

      if (distance <= tolerance) {
        data[i + 3] = 0; // Set Alpha to 0 (fully transparent)
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

      // Color distance
      const distance = Math.sqrt(
        Math.pow(r - targetR, 2) +
        Math.pow(g - targetG, 2) +
        Math.pow(b - targetB, 2)
      );

      if (distance <= tolerance) {
        data[idx + 3] = 0; // Fully transparent
        data[idx] = 0;
        data[idx + 1] = 0;
        data[idx + 2] = 0;

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
    setPickedColor(null);
    setPickedPoint(null);
    setIsAutoDetectedKeyColor(false);
  };

  // Quick reset to original segment cutout
  const handleReset = () => {
    const canvas = canvasRef.current;
    const currentURL = canvas ? canvas.toDataURL('image/png') : baseImage;
    setHistory((prev) => [...prev, currentURL]);
    setBaseImage(segment.thumbnailUrl);
    setPickedColor(null);
    setPickedPoint(null);
    setIsAutoDetectedKeyColor(true);

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
    if (!canvas) return;
    const finalUrl = canvas.toDataURL('image/png');
    onSave(finalUrl);
  };

  const handleApplyManualKeyColor = () => {
    activateKeyColor(hexToRgb(manualKeyColor), isContiguous ? edgeSeedPoint : null);
    setActiveTool('magic-wand');
  };

  return (
    <div id="bg-remover-modal" className="fixed inset-0 bg-slate-950/95 backdrop-blur-md z-50 flex items-center justify-center p-0 md:p-6 text-slate-100 font-sans">
      <div className="w-full max-w-5xl h-full md:h-[85vh] bg-slate-900 border-0 md:border border-slate-800 rounded-none md:rounded-3xl flex flex-col overflow-hidden shadow-2xl relative">
        
        {/* Header */}
        <header className="min-h-16 border-b border-slate-800 bg-slate-950/50 flex items-center justify-between gap-3 px-4 py-2 md:px-6 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="bg-emerald-500/10 p-2 border border-emerald-500/20 rounded-xl text-emerald-400">
              <Scissors className="h-5 w-5 animate-pulse" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-xs sm:text-sm text-slate-100 truncate">Cutout Boundary & Background Polish Workshop</h1>
              <p className="hidden sm:block text-[10px] text-slate-500 font-mono">Erase halos, background artifacts & solid color backing</p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-3">
            {/* Show Tools toggle button on mobile */}
            <button
              onClick={() => setIsControlsOpen(!isControlsOpen)}
              className="md:hidden flex items-center space-x-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-300 cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5 text-emerald-400" />
              <span>{isControlsOpen ? 'Hide' : 'Tools'}</span>
            </button>

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
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Content workspace split panel */}
        <div className="flex-1 min-h-0 flex overflow-hidden relative">
          
          {/* Main Visual interactive Canvas Area */}
          <div className="flex-1 min-h-0 bg-checkerboard relative flex items-center justify-center p-3 pb-24 md:p-8 overflow-hidden select-none">
            
            {/* Visual Canvas and guides */}
            <div className="relative border border-slate-800/80 rounded-none shadow-2xl max-w-full max-h-full overflow-hidden flex items-center justify-center">
              <canvas
                ref={canvasRef}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseLeave}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className={`max-w-full max-h-full block transition-shadow duration-300 ${
                  activeTool === 'magic-wand' ? 'cursor-crosshair' : 'cursor-none'
                }`}
                style={{
                  imageRendering: 'pixelated',
                }}
              />

              {/* Virtual Cursor Indicator for Manual Eraser Brush */}
              {activeTool === 'eraser' && mousePos && canvasRef.current && (
                <div
                  className="absolute border border-red-500 rounded-full bg-red-500/10 pointer-events-none"
                  style={{
                    left: `${(mousePos.x / canvasRef.current.width) * 100}%`,
                    top: `${(mousePos.y / canvasRef.current.height) * 100}%`,
                    width: `${(brushSize / canvasRef.current.width) * 100}%`,
                    height: `${(brushSize / canvasRef.current.width) * 100}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              )}
            </div>

            {!isControlsOpen && (
              <div className="absolute bottom-3 left-3 right-3 md:hidden z-20">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/92 backdrop-blur px-3 py-3 shadow-2xl space-y-2">
                  <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                    <span className="font-semibold uppercase tracking-wider text-emerald-400">Cleanup Actions</span>
                    <span>{activeTool === 'magic-wand' ? 'Magic Eraser' : activeTool === 'eraser' ? 'Brush Eraser' : 'Border Shave'}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <button
                      onClick={handleApply}
                      className="py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/10 active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <Check className="h-4.5 w-4.5" />
                      <span>Save Cleaned Cutout</span>
                    </button>
                    <button
                      onClick={() => setIsControlsOpen(true)}
                      className="px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
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

          {/* Backdrop for mobile bottom sheet */}
          {isControlsOpen && (
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-30 md:hidden"
              onClick={() => setIsControlsOpen(false)}
            />
          )}

          {/* Right Control Sidebar */}
          <aside className={`fixed md:static bottom-0 left-0 right-0 md:right-auto md:w-80 h-[70dvh] md:h-auto border-t md:border-t-0 md:border-l border-slate-800 bg-slate-950 flex flex-col shrink-0 z-40 transition-transform duration-300 md:transform-none ${
            isControlsOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'
          } overflow-hidden`}>
            
            {/* Mobile Bottom Sheet Handle */}
            <div className="flex md:hidden justify-center shrink-0 -mt-2 mb-2">
              <div className="w-12 h-1 bg-slate-800 rounded-full" />
            </div>
            
            <div className="p-5 border-b border-slate-800 bg-slate-950/95 backdrop-blur shrink-0 space-y-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">Cleanup Actions</h3>
                <p className="text-[10px] text-slate-500">
                  Save and reset stay pinned here while tool settings scroll below.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={handleApply}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/10 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Check className="h-4.5 w-4.5" />
                  <span>Save Cleaned Cutout</span>
                </button>
                <button
                  onClick={handleReset}
                  className="w-full py-2 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Reset to Original</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Toolbox Selector */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                <Sliders className="h-4 w-4 text-emerald-400" />
                <span>Erase Tools</span>
              </h3>
              
              <div className="grid grid-cols-1 gap-2">
                {/* 1. Magic Wand */}
                <button
                  onClick={() => setActiveTool('magic-wand')}
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
                    <p className="text-xs font-bold">Magic Color Eraser</p>
                    <p className="text-[10px] text-slate-500">Key out solid color backdrop</p>
                  </div>
                </button>

                {/* 2. Manual Eraser */}
                <button
                  onClick={() => setActiveTool('eraser')}
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
                    <p className="text-xs font-bold">Manual Erase Brush</p>
                    <p className="text-[10px] text-slate-500">Scrub out custom details</p>
                  </div>
                </button>

                {/* 3. Border Shave */}
                <button
                  onClick={() => setActiveTool('shave')}
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
                    <p className="text-xs font-bold">Border Shave (Erode)</p>
                    <p className="text-[10px] text-slate-500">Shrink outline boundary halo</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Dynamic settings per selected tool */}
            <div className="flex-1 space-y-4 pt-3 border-t border-slate-900">
              
              {activeTool === 'magic-wand' && (
                <div className="space-y-4">
                  <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider block">Magic Eraser Settings</span>
                  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Color Tolerance</span>
                      <span className="font-mono text-emerald-400 font-bold">{magicTolerance}</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="150"
                      step="1"
                      value={magicTolerance}
                      onChange={(e) => setMagicTolerance(parseInt(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer h-1.5"
                    />
                    <p className="text-[9px] text-slate-500 leading-relaxed">
                      Higher tolerance removes broader shade variations of the clicked color. Lower tolerance is more selective.
                    </p>
                  </div>

                  <div className="space-y-2 rounded-xl border border-slate-850 bg-slate-900 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] text-slate-300 font-semibold">Selected Key Color</p>
                        <p className="text-[9px] text-slate-500">
                          Auto-detected from edge pixels, then still editable if you want to override it.
                        </p>
                      </div>
                      <input
                        type="color"
                        value={manualKeyColor}
                        onChange={(e) => setManualKeyColor(e.target.value)}
                        className="h-10 w-14 cursor-pointer rounded-lg border border-slate-700 bg-transparent p-1"
                        aria-label="Select key color"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 text-[10px] font-mono text-slate-400">
                      <span>{manualKeyColor.toUpperCase()}</span>
                      <button
                        onClick={handleApplyManualKeyColor}
                        className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-emerald-300 transition-all hover:bg-emerald-500/20 cursor-pointer"
                      >
                        Apply This Color
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-2.5 bg-slate-900 border border-slate-850 rounded-xl cursor-pointer transition-all hover:bg-slate-850/50">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-200">Border Detection</span>
                      <span className="text-[9px] text-slate-500">Contiguous flood-fill (only connected pixels)</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={isContiguous}
                      onChange={(e) => setIsContiguous(e.target.checked)}
                      className="rounded text-emerald-500 focus:ring-emerald-500 bg-slate-950 border-slate-800 h-4 w-4 cursor-pointer"
                    />
                  </div>

                  {pickedColor && (
                    <div className="p-3 bg-slate-900 border border-slate-850 rounded-xl space-y-2">
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
                    </div>
                  )}

                </div>
              )}

              {activeTool === 'eraser' && (
                <div className="space-y-4">
                  <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider block">Manual Brush Settings</span>
                  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Brush Size</span>
                      <span className="font-mono text-emerald-400 font-bold">{brushSize}px</span>
                    </div>
                    <input
                      type="range"
                      min="2"
                      max="60"
                      step="1"
                      value={brushSize}
                      onChange={(e) => setBrushSize(parseInt(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer h-1.5"
                    />
                  </div>

                </div>
              )}

              {activeTool === 'shave' && (
                <div className="space-y-4">
                  <span className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider block">Border Shave Settings</span>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Shave Width (Erode)</span>
                      <span className="font-mono text-emerald-400 font-bold">{shaveWidth} px</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="6"
                      step="1"
                      value={shaveWidth}
                      onChange={(e) => setShaveWidth(parseInt(e.target.value))}
                      className="w-full accent-emerald-500 cursor-pointer h-1.5"
                    />
                    <p className="text-[9px] text-slate-500 leading-relaxed">
                      Shrinks the boundary of the sprite inward by $N$ pixels. This instantly dissolves thin outline fringes and background halos.
                    </p>
                  </div>

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
        </div>

      </div>
    </div>
  );
}
