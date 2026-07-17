import React, { useState, useEffect, useRef } from 'react';
import { SavedSegment, AnimationFrame, AnimationProject, AnimationStudioProjectFile } from '../types';
import {
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Download,
  Archive,
  Grid,
  Settings,
  X,
  RefreshCw,
  Move,
  Maximize,
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  ArrowDownToLine,
  Sparkles,
  Layers,
  Check,
  RotateCcw,
  ArrowRight,
  Columns,
  Square,
  Upload,
  Tags,
  Save
} from 'lucide-react';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'motion/react';
import BackgroundRemover from './BackgroundRemover';
import { createSegmentImage } from '../utils/canvasUtils';
import { getIndexedDbRecord, setIndexedDbRecord } from '../utils/indexedDbStorage';

type DetectedSpriteComponent = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  area: number;
  centerX: number;
  centerY: number;
};

type SegmentImageCacheEntry = {
  image: HTMLImageElement;
  src: string;
};

type SourceFilter = 'all' | 'needs-cleanup' | 'cleaned';

const STUDIO_PROJECT_STORAGE_KEY = 'assetmaster.animationStudio.project.v1';

interface AnimationStudioProps {
  savedSegments: SavedSegment[];
  workspaceImage?: HTMLImageElement | null;
  onCreateSegment?: (sourceSegment: SavedSegment, updatedUrl: string) => SavedSegment | undefined;
  onClose: () => void;
}

export default function AnimationStudio({ savedSegments, workspaceImage, onCreateSegment, onClose }: AnimationStudioProps) {
  // Current animation project
  const [project, setProject] = useState<AnimationProject>({
    id: 'anim_proj',
    name: 'Sprite_Animation',
    frames: [],
    fps: 8,
    loop: true,
    width: 256,
    height: 256,
  });

  const [activeFrameIndex, setActiveFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>('');
  const [showBgRemover, setShowBgRemover] = useState<boolean>(false);
  const [activeStudioTab, setActiveStudioTab] = useState<'player' | 'source' | 'nudge'>('player');
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [sourceSearch, setSourceSearch] = useState<string>('');
  const [cleanupQueue, setCleanupQueue] = useState<string[]>([]);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const projectImportInputRef = useRef<HTMLInputElement | null>(null);
  
  // Grid subdivision config
  const [cols, setCols] = useState<number>(4);
  const [rows, setRows] = useState<number>(1);
  const [showSubdivisionGrid, setShowSubdivisionGrid] = useState<boolean>(false);

  // Viewport guides
  const [showCrosshair, setShowCrosshair] = useState<boolean>(true);
  const [onionSkin, setOnionSkin] = useState<boolean>(true);
  const [onionSkinOpacity, setOnionSkinOpacity] = useState<number>(0.3);
  const [previewZoom, setPreviewZoom] = useState<number>(1.5);
  const [isAutoDetectingGrid, setIsAutoDetectingGrid] = useState<boolean>(false);
  const [isAutoCenteringFrames, setIsAutoCenteringFrames] = useState<boolean>(false);
  const [autoDetectedGridLabel, setAutoDetectedGridLabel] = useState<string>('');

  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [isProjectHydrated, setIsProjectHydrated] = useState<boolean>(false);

  // Canvas ref for generating sub-frame slices
  const sliceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Cache for segment images to ensure synchronous, buttery-smooth on-the-fly re-slicing
  const segmentImageCacheRef = useRef<Record<string, SegmentImageCacheEntry>>({});
  const [gridAssessmentNonce, setGridAssessmentNonce] = useState<number>(0);

  const normalizeFrame = (frame: AnimationFrame, fallbackWidth: number, fallbackHeight: number): AnimationFrame => {
    const baseWidth = frame.sliceW ?? frame.originalSliceW ?? fallbackWidth;
    const baseHeight = frame.sliceH ?? frame.originalSliceH ?? fallbackHeight;
    const pivotX = frame.pivotX ?? frame.originalPivotX ?? Math.round(baseWidth / 2);
    const pivotY = frame.pivotY ?? frame.originalPivotY ?? Math.round(baseHeight / 2);

    return {
      ...frame,
      pivotX,
      pivotY,
      originalPivotX: frame.originalPivotX ?? pivotX,
      originalPivotY: frame.originalPivotY ?? pivotY,
      originalSliceX: frame.originalSliceX ?? frame.sliceX,
      originalSliceY: frame.originalSliceY ?? frame.sliceY,
      originalSliceW: frame.originalSliceW ?? frame.sliceW ?? baseWidth,
      originalSliceH: frame.originalSliceH ?? frame.sliceH ?? baseHeight,
    };
  };

  const normalizeProject = (incomingProject: AnimationProject): AnimationProject => ({
    ...incomingProject,
    updatedAt: Date.now(),
    frames: incomingProject.frames.map((frame) => normalizeFrame(frame, incomingProject.width, incomingProject.height)),
  });

  const getFramePivot = (frame: AnimationFrame, imageWidth: number, imageHeight: number) => ({
    x: frame.pivotX ?? frame.originalPivotX ?? Math.round(imageWidth / 2),
    y: frame.pivotY ?? frame.originalPivotY ?? Math.round(imageHeight / 2),
  });

  const loadSegmentImage = (segment: SavedSegment): Promise<HTMLImageElement> => {
    const cached = segmentImageCacheRef.current[segment.id];
    if (cached && cached.src === segment.thumbnailUrl) {
      return Promise.resolve(cached.image);
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        segmentImageCacheRef.current[segment.id] = {
          image: img,
          src: segment.thumbnailUrl,
        };
        resolve(img);
      };
      img.onerror = () => reject(new Error(`Failed to load segment image: ${segment.name}`));
      img.src = segment.thumbnailUrl;
    });
  };

  const loadImageElement = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load frame image'));
      img.src = src;
    });
  };

  const groupAxisValues = (values: number[], tolerance: number): number[][] => {
    if (values.length === 0) return [];

    const sorted = [...values].sort((a, b) => a - b);
    const groups: number[][] = [[sorted[0]]];

    for (let i = 1; i < sorted.length; i++) {
      const value = sorted[i];
      const currentGroup = groups[groups.length - 1];
      const currentAverage = currentGroup.reduce((sum, item) => sum + item, 0) / currentGroup.length;

      if (Math.abs(value - currentAverage) <= tolerance) {
        currentGroup.push(value);
      } else {
        groups.push([value]);
      }
    }

    return groups;
  };

  const detectGridFromTransparency = async (segment: SavedSegment) => {
    const img = await loadSegmentImage(segment);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data, width, height } = imageData;
    const visited = new Uint8Array(width * height);
    const components: DetectedSpriteComponent[] = [];
    const alphaThreshold = 16;
    const queueX = new Int32Array(width * height);
    const queueY = new Int32Array(width * height);

    const indexFor = (x: number, y: number) => y * width + x;
    const isOpaque = (x: number, y: number) => data[indexFor(x, y) * 4 + 3] > alphaThreshold;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const startIndex = indexFor(x, y);
        if (visited[startIndex] || !isOpaque(x, y)) {
          continue;
        }

        let head = 0;
        let tail = 0;
        queueX[tail] = x;
        queueY[tail] = y;
        tail += 1;
        visited[startIndex] = 1;

        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        let area = 0;

        while (head < tail) {
          const currentX = queueX[head];
          const currentY = queueY[head];
          head += 1;
          area += 1;

          if (currentX < minX) minX = currentX;
          if (currentX > maxX) maxX = currentX;
          if (currentY < minY) minY = currentY;
          if (currentY > maxY) maxY = currentY;

          const neighbors = [
            [currentX - 1, currentY],
            [currentX + 1, currentY],
            [currentX, currentY - 1],
            [currentX, currentY + 1],
          ];

          neighbors.forEach(([nextX, nextY]) => {
            if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) {
              return;
            }

            const nextIndex = indexFor(nextX, nextY);
            if (visited[nextIndex] || !isOpaque(nextX, nextY)) {
              return;
            }

            visited[nextIndex] = 1;
            queueX[tail] = nextX;
            queueY[tail] = nextY;
            tail += 1;
          });
        }

        const componentWidth = maxX - minX + 1;
        const componentHeight = maxY - minY + 1;
        components.push({
          minX,
          minY,
          maxX,
          maxY,
          width: componentWidth,
          height: componentHeight,
          area,
          centerX: minX + componentWidth / 2,
          centerY: minY + componentHeight / 2,
        });
      }
    }

    if (components.length === 0) {
      return { cols: 1, rows: 1, count: 0 };
    }

    const largestArea = Math.max(...components.map((component) => component.area));
    const filteredComponents = components.filter((component) => component.area >= Math.max(12, largestArea * 0.08));

    if (filteredComponents.length === 0) {
      return { cols: 1, rows: 1, count: 0 };
    }

    const averageWidth = filteredComponents.reduce((sum, component) => sum + component.width, 0) / filteredComponents.length;
    const averageHeight = filteredComponents.reduce((sum, component) => sum + component.height, 0) / filteredComponents.length;
    const columnGroups = groupAxisValues(
      filteredComponents.map((component) => component.centerX),
      Math.max(8, averageWidth * 0.6)
    );
    const rowGroups = groupAxisValues(
      filteredComponents.map((component) => component.centerY),
      Math.max(8, averageHeight * 0.6)
    );

    const detectedCols = Math.max(1, columnGroups.length);
    const detectedRows = Math.max(1, rowGroups.length);

    return {
      cols: detectedCols,
      rows: detectedRows,
      count: filteredComponents.length,
    };
  };

  const getOpaqueBoundsFromImage = (img: HTMLImageElement) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha <= 16) continue;

        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    if (maxX < minX || maxY < minY) {
      return null;
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2,
    };
  };

  useEffect(() => {
    savedSegments.forEach((segment) => {
      const cached = segmentImageCacheRef.current[segment.id];
      if (!cached || cached.src !== segment.thumbnailUrl) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          segmentImageCacheRef.current[segment.id] = {
            image: img,
            src: segment.thumbnailUrl,
          };
        };
        img.src = segment.thumbnailUrl;
      }
    });
  }, [savedSegments]);

  useEffect(() => {
    if (savedSegments.length === 0) {
      if (selectedSegmentId !== '') {
        setSelectedSegmentId('');
      }
      return;
    }

    const selectedStillExists = savedSegments.some((segment) => segment.id === selectedSegmentId);
    if (!selectedSegmentId || !selectedStillExists) {
      setSelectedSegmentId(savedSegments[0].id);
    }
  }, [savedSegments, selectedSegmentId]);

  useEffect(() => {
    let cancelled = false;

    const loadProject = async () => {
      try {
        const indexedDbSnapshot = await getIndexedDbRecord<AnimationStudioProjectFile>(STUDIO_PROJECT_STORAGE_KEY);
        const parsed = indexedDbSnapshot;
        if (parsed?.project) {
          if (cancelled) {
            return;
          }

          const normalized = normalizeProject(parsed.project);
          setProject(normalized);
          setCols(parsed.cols ?? 4);
          setRows(parsed.rows ?? 1);
          setShowSubdivisionGrid(parsed.showSubdivisionGrid ?? false);
          if (parsed.selectedSegmentId) {
            setSelectedSegmentId(parsed.selectedSegmentId);
          }
          return;
        }
      } catch (error) {
        console.error('Failed to load saved animation studio project from IndexedDB', error);
      }

      const savedProjectRaw = localStorage.getItem(STUDIO_PROJECT_STORAGE_KEY);
      if (!savedProjectRaw) {
        return;
      }

      try {
        const parsed = JSON.parse(savedProjectRaw) as Partial<AnimationStudioProjectFile>;
        if (!parsed.project || cancelled) {
          return;
        }

        const normalized = normalizeProject(parsed.project);
        setProject(normalized);
        setCols(parsed.cols ?? 4);
        setRows(parsed.rows ?? 1);
        setShowSubdivisionGrid(parsed.showSubdivisionGrid ?? false);
        if (parsed.selectedSegmentId) {
          setSelectedSegmentId(parsed.selectedSegmentId);
        }

        await setIndexedDbRecord(STUDIO_PROJECT_STORAGE_KEY, {
          version: 1,
          exportedAt: parsed.exportedAt ?? Date.now(),
          project: normalized,
          selectedSegmentId: parsed.selectedSegmentId,
          cols: parsed.cols ?? 4,
          rows: parsed.rows ?? 1,
          showSubdivisionGrid: parsed.showSubdivisionGrid ?? false,
        } satisfies AnimationStudioProjectFile);
      } catch (error) {
        console.error('Failed to migrate saved animation studio project', error);
      }
    };

    void loadProject().finally(() => {
      if (!cancelled) {
        setIsProjectHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isProjectHydrated) {
      return;
    }

    const snapshot: AnimationStudioProjectFile = {
      version: 1,
      exportedAt: Date.now(),
      project,
      selectedSegmentId,
      cols,
      rows,
      showSubdivisionGrid,
    };
    void setIndexedDbRecord(STUDIO_PROJECT_STORAGE_KEY, snapshot).catch((error) => {
      console.error('Failed to persist animation studio project into IndexedDB', error);
    });
  }, [cols, isProjectHydrated, project, rows, selectedSegmentId, showSubdivisionGrid]);

  // Close custom dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Playback loop timer
  useEffect(() => {
    if (!isPlaying || project.frames.length === 0) return;

    const intervalMs = 1000 / project.fps;
    const timer = setInterval(() => {
      setActiveFrameIndex((prevIndex) => {
        if (prevIndex >= project.frames.length - 1) {
          return project.loop ? 0 : prevIndex;
        }
        return prevIndex + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, project.fps, project.frames.length, project.loop]);

  // If frame index goes out of bounds when frames are deleted
  useEffect(() => {
    if (project.frames.length === 0) {
      setActiveFrameIndex(0);
      setIsPlaying(false);
    } else if (activeFrameIndex >= project.frames.length) {
      setActiveFrameIndex(project.frames.length - 1);
    }
  }, [project.frames.length, activeFrameIndex]);

  const activeSegment = savedSegments.find((s) => s.id === selectedSegmentId);
  const hasActiveFrame = project.frames.length > 0 && Boolean(project.frames[activeFrameIndex]);
  const normalizedSourceSearch = sourceSearch.trim().toLowerCase();
  const filteredSegments = savedSegments.filter((segment) => {
    const matchesFilter =
      (sourceFilter === 'all' && (Boolean(segment.backgroundRemovedAt) || !segment.cleanupProcessedAt)) ||
      (sourceFilter === 'needs-cleanup' && !segment.backgroundRemovedAt && !segment.cleanupProcessedAt) ||
      (sourceFilter === 'cleaned' && Boolean(segment.backgroundRemovedAt));
    const matchesSearch =
      normalizedSourceSearch.length === 0 ||
      segment.name.toLowerCase().includes(normalizedSourceSearch) ||
      (segment.tags ?? []).some((tag) => tag.toLowerCase().includes(normalizedSourceSearch));

    return matchesFilter && matchesSearch;
  });
  const filterCounts = {
    all: savedSegments.filter((segment) => Boolean(segment.backgroundRemovedAt) || !segment.cleanupProcessedAt).length,
    'needs-cleanup': savedSegments.filter((segment) => !segment.backgroundRemovedAt && !segment.cleanupProcessedAt).length,
    cleaned: savedSegments.filter((segment) => Boolean(segment.backgroundRemovedAt)).length,
  };
  const queuedSegments = cleanupQueue
    .map((segmentId) => savedSegments.find((segment) => segment.id === segmentId))
    .filter(Boolean) as SavedSegment[];
  const previewGuideControls = (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/35 p-3">
      <div className="flex items-center space-x-2">
        <Settings className="h-4 w-4 text-purple-400" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Preview Guides</span>
      </div>

      <label className="flex items-center justify-between gap-3 cursor-pointer">
        <span className="text-xs text-slate-300">Target Crosshair</span>
        <input
          type="checkbox"
          checked={showCrosshair}
          onChange={(e) => setShowCrosshair(e.target.checked)}
          className="rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-800 h-4 w-4 cursor-pointer"
        />
      </label>

      <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-xs text-slate-300">Onion Skinning</span>
          <input
            type="checkbox"
            checked={onionSkin}
            onChange={(e) => setOnionSkin(e.target.checked)}
            className="rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-800 h-4 w-4 cursor-pointer"
          />
        </label>
        {onionSkin && (
          <div className="space-y-1">
            <div className="flex justify-between text-[9px] text-slate-500 font-mono">
              <span>Opacity</span>
              <span>{Math.round(onionSkinOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="0.8"
              step="0.05"
              value={onionSkinOpacity}
              onChange={(e) => setOnionSkinOpacity(parseFloat(e.target.value))}
              className="w-full accent-indigo-500 h-1 cursor-pointer"
            />
          </div>
        )}
      </div>
    </div>
  );

  useEffect(() => {
    const isFilterActive = sourceFilter !== 'all' || normalizedSourceSearch.length > 0;
    if (!isFilterActive || filteredSegments.length === 0) {
      return;
    }

    const selectedVisible = filteredSegments.some((segment) => segment.id === selectedSegmentId);
    if (!selectedVisible) {
      setSelectedSegmentId(filteredSegments[0].id);
    }
  }, [filteredSegments, normalizedSourceSearch, selectedSegmentId, sourceFilter]);

  useEffect(() => {
    let cancelled = false;

    if (!activeSegment) {
      setAutoDetectedGridLabel('');
      return;
    }

    setIsAutoDetectingGrid(true);
    detectGridFromTransparency(activeSegment)
      .then((detectedGrid) => {
        if (cancelled || !detectedGrid) return;

        setCols(detectedGrid.cols);
        setRows(detectedGrid.rows);
        setAutoDetectedGridLabel(
          detectedGrid.count > 0
            ? `Auto-detected ${detectedGrid.count} object${detectedGrid.count === 1 ? '' : 's'} as ${detectedGrid.cols} col${detectedGrid.cols === 1 ? '' : 's'} × ${detectedGrid.rows} row${detectedGrid.rows === 1 ? '' : 's'}`
            : 'No separate objects detected, defaulted to 1 × 1'
        );
      })
      .catch((error) => {
        console.error('Failed to auto-detect sprite grid', error);
        if (!cancelled) {
          setAutoDetectedGridLabel('Auto-detect failed, keeping manual grid values');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsAutoDetectingGrid(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSegment, gridAssessmentNonce]);

  // Load a single cutout and auto-subdivide or load as single frame
  const loadSegmentAsFrames = (segment: SavedSegment) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Calculate individual frame sizes
      const frameW = Math.floor(segment.bounds.width / cols);
      const frameH = Math.floor(segment.bounds.height / rows);
      
      const newFrames: AnimationFrame[] = [];
      const totalFrames = cols * rows;

      // Temporary canvas to extract parts
      const canvas = sliceCanvasRef.current || document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Segment source image
      const srcImg = new Image();
      srcImg.crossOrigin = 'anonymous';
      srcImg.onload = () => {
        // Store in cache
        segmentImageCacheRef.current[segment.id] = {
          image: srcImg,
          src: segment.thumbnailUrl,
        };

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            canvas.width = frameW;
            canvas.height = frameH;
            ctx.clearRect(0, 0, frameW, frameH);

            // Draw sub-rectangle onto canvas
            const sx = c * frameW;
            const sy = r * frameH;
            
            let subFrameUrl = '';
            if (workspaceImage && !segment.backgroundRemovedAt) {
              const frameBounds = {
                x: segment.bounds.x + sx,
                y: segment.bounds.y + sy,
                width: frameW,
                height: frameH,
              };
              subFrameUrl = createSegmentImage(workspaceImage, segment.path, frameBounds, segment.feather);
            } else {
              ctx.drawImage(
                srcImg,
                sx, sy, frameW, frameH, // Source clip
                0, 0, frameW, frameH    // Target
              );
              subFrameUrl = canvas.toDataURL('image/png');
            }

            newFrames.push({
              id: `frame_${segment.id}_${r}_${c}_${Date.now()}`,
              thumbnailUrl: subFrameUrl,
              offsetX: 0,
              offsetY: 0,
              scale: 1.0,
              duration: 1,
              pivotX: Math.round(frameW / 2),
              pivotY: Math.round(frameH / 2),
              sourceSegmentId: segment.id,
              sliceX: sx,
              sliceY: sy,
              sliceW: frameW,
              sliceH: frameH,
              originalSliceX: sx,
              originalSliceY: sy,
              originalSliceW: frameW,
              originalSliceH: frameH,
              originalPivotX: Math.round(frameW / 2),
              originalPivotY: Math.round(frameH / 2),
            });
          }
        }

        setProject((prev) => normalizeProject({
          ...prev,
          frames: newFrames,
          width: frameW,
          height: frameH,
        }));
        setActiveFrameIndex(0);
        setIsPlaying(true);
      };
      srcImg.src = segment.thumbnailUrl;
    };
    img.src = segment.thumbnailUrl;
  };

  // Add individual saved cuts sequentially as custom frames
  const appendSegmentAsFrame = (segment: SavedSegment) => {
    const newFrame: AnimationFrame = {
      id: `frame_${segment.id}_${Date.now()}`,
      thumbnailUrl: segment.thumbnailUrl,
      offsetX: 0,
      offsetY: 0,
      scale: 1.0,
      duration: 1,
      pivotX: Math.round(segment.bounds.width / 2),
      pivotY: Math.round(segment.bounds.height / 2),
      sourceSegmentId: segment.id,
      sliceX: 0,
      sliceY: 0,
      sliceW: segment.bounds.width,
      sliceH: segment.bounds.height,
      originalSliceX: 0,
      originalSliceY: 0,
      originalSliceW: segment.bounds.width,
      originalSliceH: segment.bounds.height,
      originalPivotX: Math.round(segment.bounds.width / 2),
      originalPivotY: Math.round(segment.bounds.height / 2),
    };

    setProject((prev) => {
      const updatedFrames = [...prev.frames, newFrame];
      // Adapt workspace bounds to largest frame size if empty
      const maxW = Math.max(prev.width, segment.bounds.width);
      const maxH = Math.max(prev.height, segment.bounds.height);
      return {
        ...prev,
        frames: updatedFrames.map((frame) => normalizeFrame(frame, prev.frames.length === 0 ? segment.bounds.width : maxW, prev.frames.length === 0 ? segment.bounds.height : maxH)),
        width: prev.frames.length === 0 ? segment.bounds.width : maxW,
        height: prev.frames.length === 0 ? segment.bounds.height : maxH,
      };
    });

    if (project.frames.length === 0) {
      setActiveFrameIndex(0);
    }
  };

  // Helper to generate new sliced thumbnail url from original segment image
  const getRegeneratedUrl = (frame: AnimationFrame, sx: number, sy: number): Promise<string> => {
    return new Promise((resolve) => {
      if (!frame.sourceSegmentId) {
        resolve(frame.thumbnailUrl);
        return;
      }
      const segment = savedSegments.find((s) => s.id === frame.sourceSegmentId);
      if (!segment) {
        resolve(frame.thumbnailUrl);
        return;
      }

      // If workspaceImage is provided, regenerate from the original full image to avoid any clipping issues!
      if (workspaceImage && !segment.backgroundRemovedAt) {
        const frameBounds = {
          x: segment.bounds.x + sx,
          y: segment.bounds.y + sy,
          width: frame.sliceW ?? project.width,
          height: frame.sliceH ?? project.height,
        };
        const url = createSegmentImage(workspaceImage, segment.path, frameBounds, segment.feather);
        resolve(url);
        return;
      }

      const updateWithImg = (img: HTMLImageElement) => {
        const canvas = document.createElement('canvas');
        canvas.width = frame.sliceW ?? project.width;
        canvas.height = frame.sliceH ?? project.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(
            img,
            sx, sy, canvas.width, canvas.height,
            0, 0, canvas.width, canvas.height
          );
          resolve(canvas.toDataURL('image/png'));
        } else {
          resolve(frame.thumbnailUrl);
        }
      };

      const cachedEntry = segmentImageCacheRef.current[segment.id];
      if (cachedEntry && cachedEntry.src === segment.thumbnailUrl) {
        updateWithImg(cachedEntry.image);
      } else {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          segmentImageCacheRef.current[segment.id] = {
            image: img,
            src: segment.thumbnailUrl,
          };
          updateWithImg(img);
        };
        img.src = segment.thumbnailUrl;
      }
    });
  };

  const reassessSelectedSegment = () => {
    if (!activeSegment) return;

    delete segmentImageCacheRef.current[activeSegment.id];
    setAutoDetectedGridLabel('Reassessing cleaned cutout...');
    setGridAssessmentNonce((prev) => prev + 1);
  };

  const addActiveSegmentToCleanupQueue = () => {
    if (!activeSegment) return;
    setCleanupQueue((prev) => (
      prev.includes(activeSegment.id)
        ? prev
        : [...prev, activeSegment.id]
    ));
  };

  const queueVisibleNeedsCleanupSegments = () => {
    const nextIds = filteredSegments
      .filter((segment) => !segment.backgroundRemovedAt && !segment.cleanupProcessedAt)
      .map((segment) => segment.id);

    setCleanupQueue((prev) => Array.from(new Set([...prev, ...nextIds])));
  };

  const startQueuedCleanup = () => {
    const nextId = cleanupQueue.find((segmentId) => savedSegments.some((segment) => segment.id === segmentId));
    if (nextId) {
      setSelectedSegmentId(nextId);
      setShowBgRemover(true);
      return;
    }

    if (activeSegment) {
      setShowBgRemover(true);
    }
  };

  const removeQueuedSegment = (segmentId: string) => {
    setCleanupQueue((prev) => prev.filter((queuedId) => queuedId !== segmentId));
  };

  // Nudge selected frame position offsets or source slicing rectangle
  const nudgeActiveFrame = async (dx: number, dy: number) => {
    if (project.frames.length === 0) return;
    const frameIndex = activeFrameIndex;
    const frame = project.frames[frameIndex];

    if (frame.sourceSegmentId) {
      const currentSliceX = frame.sliceX ?? 0;
      const currentSliceY = frame.sliceY ?? 0;
      const newSliceX = currentSliceX + dx;
      const newSliceY = currentSliceY + dy;

      const newUrl = await getRegeneratedUrl(frame, newSliceX, newSliceY);
      setProject((prev) => {
        const newFrames = [...prev.frames];
        newFrames[frameIndex] = {
          ...newFrames[frameIndex],
          sliceX: newSliceX,
          sliceY: newSliceY,
          thumbnailUrl: newUrl,
        };
        return { ...prev, frames: newFrames };
      });
    } else {
      // Fallback to visual nudge if not generated from a source segment
      setProject((prev) => {
        const newFrames = [...prev.frames];
        const target = { ...newFrames[frameIndex] };
        target.offsetX += dx;
        target.offsetY += dy;
        newFrames[frameIndex] = target;
        return { ...prev, frames: newFrames };
      });
    }
  };

  // Change scale factor of selected frame
  const adjustActiveFrameScale = (scaleValue: number) => {
    if (project.frames.length === 0) return;
    setProject((prev) => {
      const newFrames = [...prev.frames];
      const target = { ...newFrames[activeFrameIndex] };
      target.scale = Math.max(0.1, Math.min(3.0, scaleValue));
      newFrames[activeFrameIndex] = target;
      return { ...prev, frames: newFrames };
    });
  };

  // Delete a frame from timeline
  const removeFrameAt = (index: number) => {
    setProject((prev) => {
      const newFrames = prev.frames.filter((_, idx) => idx !== index);
      return { ...prev, frames: newFrames };
    });
  };

  // Move frame in timeline (reordering)
  const shiftFrameOrder = (index: number, direction: 'left' | 'right') => {
    const targetIdx = direction === 'left' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= project.frames.length) return;

    setProject((prev) => {
      const newFrames = [...prev.frames];
      const temp = newFrames[index];
      newFrames[index] = newFrames[targetIdx];
      newFrames[targetIdx] = temp;
      return { ...prev, frames: newFrames };
    });
    setActiveFrameIndex(targetIdx);
  };

  // Reset all adjustments for active frame
  const resetActiveFrameCenter = async () => {
    if (project.frames.length === 0) return;
    const frameIndex = activeFrameIndex;
    const frame = project.frames[frameIndex];

    let newUrl = frame.thumbnailUrl;
    let newSliceX = frame.sliceX;
    let newSliceY = frame.sliceY;

    if (frame.sourceSegmentId && frame.originalSliceX !== undefined && frame.originalSliceY !== undefined) {
      newSliceX = frame.originalSliceX;
      newSliceY = frame.originalSliceY;
      newUrl = await getRegeneratedUrl(frame, newSliceX, newSliceY);
    }

    setProject((prev) => {
      const newFrames = [...prev.frames];
      newFrames[frameIndex] = {
        ...newFrames[frameIndex],
        offsetX: 0,
        offsetY: 0,
        scale: 1.0,
        pivotX: newFrames[frameIndex].originalPivotX,
        pivotY: newFrames[frameIndex].originalPivotY,
        sliceX: newSliceX,
        sliceY: newSliceY,
        thumbnailUrl: newUrl,
      };
      return { ...prev, frames: newFrames.map((item) => normalizeFrame(item, prev.width, prev.height)), updatedAt: Date.now() };
    });
  };

  // Reset adjustments for ALL frames globally
  const resetAllFramesCenter = async () => {
    if (project.frames.length === 0) return;
    
    const resetFramesPromises = project.frames.map(async (frame) => {
      let newUrl = frame.thumbnailUrl;
      let newSliceX = frame.sliceX;
      let newSliceY = frame.sliceY;

      if (frame.sourceSegmentId && frame.originalSliceX !== undefined && frame.originalSliceY !== undefined) {
        newSliceX = frame.originalSliceX;
        newSliceY = frame.originalSliceY;
        newUrl = await getRegeneratedUrl(frame, newSliceX, newSliceY);
      }

      return {
        ...frame,
        offsetX: 0,
        offsetY: 0,
        scale: 1.0,
        pivotX: frame.originalPivotX,
        pivotY: frame.originalPivotY,
        sliceX: newSliceX,
        sliceY: newSliceY,
        thumbnailUrl: newUrl,
      };
    });

    const newFrames = await Promise.all(resetFramesPromises);
    setProject((prev) => ({
      ...prev,
      frames: newFrames.map((frame) => normalizeFrame(frame, prev.width, prev.height)),
      updatedAt: Date.now(),
    }));
  };

  const alignAllFrames = async (
    horizontal: 'left' | 'center' | 'right' | null,
    vertical: 'top' | 'center' | 'bottom' | null
  ) => {
    if (project.frames.length === 0 || isAutoCenteringFrames) return;

    setIsAutoCenteringFrames(true);
    try {
      const alignedFrames = await Promise.all(
        project.frames.map(async (frame) => {
          const img = await loadImageElement(frame.thumbnailUrl);
          const opaqueBounds = getOpaqueBoundsFromImage(img);

          if (!opaqueBounds) {
            return frame;
          }

          const pivot = getFramePivot(frame, img.width, img.height);
          let nextOffsetX = frame.offsetX;
          let nextOffsetY = frame.offsetY;

          if (horizontal === 'left') {
            nextOffsetX = Math.round(pivot.x - opaqueBounds.minX - project.width / 2);
          } else if (horizontal === 'center') {
            nextOffsetX = Math.round(pivot.x - opaqueBounds.centerX);
          } else if (horizontal === 'right') {
            nextOffsetX = Math.round(project.width / 2 + pivot.x - opaqueBounds.maxX);
          }

          if (vertical === 'top') {
            nextOffsetY = Math.round(pivot.y - opaqueBounds.minY - project.height / 2);
          } else if (vertical === 'center') {
            nextOffsetY = Math.round(pivot.y - opaqueBounds.centerY);
          } else if (vertical === 'bottom') {
            nextOffsetY = Math.round(project.height / 2 + pivot.y - opaqueBounds.maxY);
          }

          return {
            ...frame,
            offsetX: nextOffsetX,
            offsetY: nextOffsetY,
          };
        })
      );

      setProject((prev) => ({
        ...prev,
        frames: alignedFrames,
      }));
    } catch (error) {
      console.error('Failed to align frames', error);
    } finally {
      setIsAutoCenteringFrames(false);
    }
  };

  // Download centered frames as ZIP package
  const exportCenteredPngZip = async () => {
    if (project.frames.length === 0) return;
    setIsExporting(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder(`${project.name}_centered`);

      // We render each frame into a unified sized canvas applying offsets/scale perfectly centered
      const outCanvas = document.createElement('canvas');
      outCanvas.width = project.width;
      outCanvas.height = project.height;
      const outCtx = outCanvas.getContext('2d');

      if (!outCtx) throw new Error('Could not create output rendering context');

      const loadAndRenderFrame = (frame: AnimationFrame, index: number): Promise<void> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            outCtx.clearRect(0, 0, project.width, project.height);
            
            // Draw with alignment transforms applied
            outCtx.save();
            // Translate to center point
            outCtx.translate(project.width / 2 + frame.offsetX, project.height / 2 + frame.offsetY);
            outCtx.scale(frame.scale, frame.scale);
            const pivot = getFramePivot(frame, img.width, img.height);
            
            // Draw image centered at 0,0 relative
            outCtx.drawImage(img, -pivot.x, -pivot.y);
            outCtx.restore();

            const frameDataUrl = outCanvas.toDataURL('image/png');
            const base64Data = frameDataUrl.split(',')[1];
            folder?.file(`${project.name}_centered_${String(index + 1).padStart(3, '0')}.png`, base64Data, { base64: true });
            resolve();
          };
          img.src = frame.thumbnailUrl;
        });
      };

      // Process in order
      for (let i = 0; i < project.frames.length; i++) {
        await loadAndRenderFrame(project.frames[i], i);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.name}_batch_transparent_centered.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to export centered ZIP', e);
    } finally {
      setIsExporting(false);
    }
  };

  // Export as horizontal grid Sprite Sheet PNG
  const exportSpriteSheet = async () => {
    if (project.frames.length === 0) return;
    setIsExporting(true);
    try {
      const sheetCanvas = document.createElement('canvas');
      sheetCanvas.width = project.width * project.frames.length;
      sheetCanvas.height = project.height;
      const sheetCtx = sheetCanvas.getContext('2d');
      if (!sheetCtx) throw new Error('Canvas rendering error');

      sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);

      const renderFrameToStrip = (frame: AnimationFrame, index: number): Promise<void> => {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const startX = index * project.width;
            
            sheetCtx.save();
            // Offset drawing matrix to frame slot center
            sheetCtx.translate(startX + project.width / 2 + frame.offsetX, project.height / 2 + frame.offsetY);
            sheetCtx.scale(frame.scale, frame.scale);
            const pivot = getFramePivot(frame, img.width, img.height);
            
            sheetCtx.drawImage(img, -pivot.x, -pivot.y);
            sheetCtx.restore();
            resolve();
          };
          img.src = frame.thumbnailUrl;
        });
      };

      for (let i = 0; i < project.frames.length; i++) {
        await renderFrameToStrip(project.frames[i], i);
      }

      const url = sheetCanvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.name}_spritesheet.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Failed to export spritesheet', e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSaveCleanedSegmentLocally = (updatedUrl: string) => {
    if (!activeSegment) {
      return;
    }

    const processedSegmentId = activeSegment.id;
    const remainingQueue = cleanupQueue.filter((segmentId) => segmentId !== processedSegmentId);

    delete segmentImageCacheRef.current[activeSegment.id];

    const newSegment = onCreateSegment?.(activeSegment, updatedUrl);
    setCleanupQueue(remainingQueue);
    if (newSegment) {
      setSelectedSegmentId(newSegment.id);
      setAutoDetectedGridLabel('Reassessing cleaned cutout...');
      setGridAssessmentNonce((prev) => prev + 1);
    }

    const nextQueuedSegmentId = remainingQueue.find((segmentId) => (
      savedSegments.some((segment) => segment.id === segmentId)
    ));
    if (nextQueuedSegmentId) {
      setSelectedSegmentId(nextQueuedSegmentId);
      setShowBgRemover(true);
      return;
    }

    setShowBgRemover(false);
  };

  const downloadJsonFile = (filename: string, payload: unknown) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildProjectSnapshot = (): AnimationStudioProjectFile => ({
    version: 1,
    exportedAt: Date.now(),
    project: normalizeProject(project),
    selectedSegmentId,
    cols,
    rows,
    showSubdivisionGrid,
  });

  const handleExportProject = () => {
    downloadJsonFile(`${project.name || 'assetmaster'}_animation_project.json`, buildProjectSnapshot());
  };

  const handleImportProjectRequest = () => {
    projectImportInputRef.current?.click();
  };

  const handleImportProjectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<AnimationStudioProjectFile>;
      if (!parsed.project) {
        throw new Error('Missing project payload');
      }

      if (!window.confirm(`Replace the current animation project with "${parsed.project.name || file.name}"?`)) {
        return;
      }

      setProject(normalizeProject(parsed.project));
      setCols(parsed.cols ?? 4);
      setRows(parsed.rows ?? 1);
      setShowSubdivisionGrid(parsed.showSubdivisionGrid ?? false);
      setSelectedSegmentId(parsed.selectedSegmentId ?? '');
      setActiveFrameIndex(0);
      setIsPlaying(false);
    } catch (error) {
      console.error('Failed to import animation project', error);
      window.alert('The selected animation project file could not be loaded.');
    } finally {
      event.target.value = '';
    }
  };

  const setActiveFramePivotPreset = (preset: 'center' | 'bottom-center' | 'top-center' | 'top-left') => {
    if (!hasActiveFrame) return;

    setProject((prev) => {
      const frames = [...prev.frames];
      const target = { ...frames[activeFrameIndex] };
      const width = target.sliceW ?? target.originalSliceW ?? prev.width;
      const height = target.sliceH ?? target.originalSliceH ?? prev.height;

      if (preset === 'center') {
        target.pivotX = Math.round(width / 2);
        target.pivotY = Math.round(height / 2);
      } else if (preset === 'bottom-center') {
        target.pivotX = Math.round(width / 2);
        target.pivotY = height;
      } else if (preset === 'top-center') {
        target.pivotX = Math.round(width / 2);
        target.pivotY = 0;
      } else {
        target.pivotX = 0;
        target.pivotY = 0;
      }

      frames[activeFrameIndex] = normalizeFrame(target, prev.width, prev.height);
      return { ...prev, frames, updatedAt: Date.now() };
    });
  };

  const nudgeActiveFramePivot = (dx: number, dy: number) => {
    if (!hasActiveFrame) return;

    setProject((prev) => {
      const frames = [...prev.frames];
      const target = { ...frames[activeFrameIndex] };
      const width = target.sliceW ?? target.originalSliceW ?? prev.width;
      const height = target.sliceH ?? target.originalSliceH ?? prev.height;
      const currentPivotX = target.pivotX ?? target.originalPivotX ?? Math.round(width / 2);
      const currentPivotY = target.pivotY ?? target.originalPivotY ?? Math.round(height / 2);

      target.pivotX = currentPivotX + dx;
      target.pivotY = currentPivotY + dy;

      frames[activeFrameIndex] = normalizeFrame(target, prev.width, prev.height);
      return { ...prev, frames, updatedAt: Date.now() };
    });
  };

  const trimFrameAt = async (frameIndex: number): Promise<AnimationFrame | null> => {
    const frame = project.frames[frameIndex];
    if (!frame) {
      return null;
    }

    const img = await loadImageElement(frame.thumbnailUrl);
    const opaqueBounds = getOpaqueBoundsFromImage(img);
    if (!opaqueBounds) {
      return frame;
    }

    const trimWidth = opaqueBounds.maxX - opaqueBounds.minX + 1;
    const trimHeight = opaqueBounds.maxY - opaqueBounds.minY + 1;
    if (trimWidth === img.width && trimHeight === img.height) {
      return frame;
    }

    const canvas = document.createElement('canvas');
    canvas.width = trimWidth;
    canvas.height = trimHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return frame;
    }

    ctx.clearRect(0, 0, trimWidth, trimHeight);
    ctx.drawImage(
      img,
      opaqueBounds.minX,
      opaqueBounds.minY,
      trimWidth,
      trimHeight,
      0,
      0,
      trimWidth,
      trimHeight
    );

    const currentPivot = getFramePivot(frame, img.width, img.height);

    return normalizeFrame({
      ...frame,
      thumbnailUrl: canvas.toDataURL('image/png'),
      pivotX: currentPivot.x - opaqueBounds.minX,
      pivotY: currentPivot.y - opaqueBounds.minY,
      originalPivotX: (frame.originalPivotX ?? currentPivot.x) - opaqueBounds.minX,
      originalPivotY: (frame.originalPivotY ?? currentPivot.y) - opaqueBounds.minY,
      sliceX: frame.sliceX !== undefined ? frame.sliceX + opaqueBounds.minX : frame.sliceX,
      sliceY: frame.sliceY !== undefined ? frame.sliceY + opaqueBounds.minY : frame.sliceY,
      sliceW: trimWidth,
      sliceH: trimHeight,
      trimmedBounds: {
        x: opaqueBounds.minX,
        y: opaqueBounds.minY,
        width: trimWidth,
        height: trimHeight,
      },
    }, project.width, project.height);
  };

  const trimActiveFrameTransparentPadding = async () => {
    if (!hasActiveFrame) return;
    const trimmedFrame = await trimFrameAt(activeFrameIndex);
    if (!trimmedFrame) return;

    setProject((prev) => {
      const frames = [...prev.frames];
      frames[activeFrameIndex] = trimmedFrame;
      return { ...prev, frames, updatedAt: Date.now() };
    });
  };

  const trimAllFramesTransparentPadding = async () => {
    if (project.frames.length === 0) return;
    const nextFrames = await Promise.all(project.frames.map((_, index) => trimFrameAt(index)));

    setProject((prev) => ({
      ...prev,
      frames: nextFrames.map((frame, index) => frame ?? prev.frames[index]),
      updatedAt: Date.now(),
    }));
  };

  const renderFrameSignature = async (frame: AnimationFrame): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = project.width;
    canvas.height = project.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return frame.thumbnailUrl;
    }

    const img = await loadImageElement(frame.thumbnailUrl);
    const pivot = getFramePivot(frame, img.width, img.height);

    ctx.clearRect(0, 0, project.width, project.height);
    ctx.save();
    ctx.translate(project.width / 2 + frame.offsetX, project.height / 2 + frame.offsetY);
    ctx.scale(frame.scale, frame.scale);
    ctx.drawImage(img, -pivot.x, -pivot.y);
    ctx.restore();

    return canvas.toDataURL('image/png');
  };

  const removeDuplicateFrames = async () => {
    if (project.frames.length < 2) return;

    const seen = new Set<string>();
    const uniqueFrames: AnimationFrame[] = [];

    for (const frame of project.frames) {
      const signature = await renderFrameSignature(frame);
      if (seen.has(signature)) {
        continue;
      }
      seen.add(signature);
      uniqueFrames.push(frame);
    }

    if (uniqueFrames.length === project.frames.length) {
      return;
    }

    setProject((prev) => ({
      ...prev,
      frames: uniqueFrames,
      updatedAt: Date.now(),
    }));
    setActiveFrameIndex((prev) => Math.min(prev, uniqueFrames.length - 1));
  };

  const buildSpriteMetadata = () => ({
    version: 1,
    exportedAt: Date.now(),
    project: {
      id: project.id,
      name: project.name,
      width: project.width,
      height: project.height,
      fps: project.fps,
      loop: project.loop,
      frameCount: project.frames.length,
    },
    frames: project.frames.map((frame, index) => {
      const sourceSegment = savedSegments.find((segment) => segment.id === frame.sourceSegmentId);
      const fallbackWidth = frame.sliceW ?? frame.originalSliceW ?? project.width;
      const fallbackHeight = frame.sliceH ?? frame.originalSliceH ?? project.height;
      return {
        index,
        id: frame.id,
        filename: `${project.name}_frame_${String(index + 1).padStart(3, '0')}.png`,
        spritesheet: {
          x: index * project.width,
          y: 0,
          width: project.width,
          height: project.height,
        },
        source: {
          segmentId: frame.sourceSegmentId ?? null,
          segmentName: sourceSegment?.name ?? null,
          tags: sourceSegment?.tags ?? [],
        },
        slice: {
          x: frame.sliceX ?? 0,
          y: frame.sliceY ?? 0,
          width: fallbackWidth,
          height: fallbackHeight,
        },
        alignment: {
          offsetX: frame.offsetX,
          offsetY: frame.offsetY,
          scale: frame.scale,
        },
        pivot: {
          x: frame.pivotX ?? frame.originalPivotX ?? Math.round(fallbackWidth / 2),
          y: frame.pivotY ?? frame.originalPivotY ?? Math.round(fallbackHeight / 2),
        },
        duration: frame.duration,
        trimmedBounds: frame.trimmedBounds ?? null,
      };
    }),
  });

  const exportSpriteSheetPackage = async () => {
    if (project.frames.length === 0) return;
    setIsExporting(true);
    try {
      const sheetCanvas = document.createElement('canvas');
      sheetCanvas.width = project.width * project.frames.length;
      sheetCanvas.height = project.height;
      const sheetCtx = sheetCanvas.getContext('2d');
      if (!sheetCtx) throw new Error('Canvas rendering error');

      sheetCtx.clearRect(0, 0, sheetCanvas.width, sheetCanvas.height);

      for (let i = 0; i < project.frames.length; i += 1) {
        const frame = project.frames[i];
        const img = await loadImageElement(frame.thumbnailUrl);
        const pivot = getFramePivot(frame, img.width, img.height);

        sheetCtx.save();
        sheetCtx.translate(i * project.width + project.width / 2 + frame.offsetX, project.height / 2 + frame.offsetY);
        sheetCtx.scale(frame.scale, frame.scale);
        sheetCtx.drawImage(img, -pivot.x, -pivot.y);
        sheetCtx.restore();
      }

      const zip = new JSZip();
      zip.file(`${project.name}_spritesheet.png`, sheetCanvas.toDataURL('image/png').split(',')[1], { base64: true });
      zip.file(`${project.name}_spritesheet.json`, JSON.stringify(buildSpriteMetadata(), null, 2));

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${project.name}_spritesheet_package.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export spritesheet package', error);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    const handleStudioKeyDown = (event: KeyboardEvent) => {
      if (showBgRemover) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isTypingTarget = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '');
      if (isTypingTarget) {
        return;
      }

      if (event.key === ' ') {
        if (project.frames.length === 0) return;
        event.preventDefault();
        setIsPlaying((prev) => !prev);
        return;
      }

      if (event.key === '[') {
        event.preventDefault();
        setActiveFrameIndex((prev) => Math.max(0, prev - 1));
        return;
      }

      if (event.key === ']') {
        event.preventDefault();
        setActiveFrameIndex((prev) => Math.min(project.frames.length - 1, prev + 1));
        return;
      }

      if (hasActiveFrame && event.key.startsWith('Arrow')) {
        event.preventDefault();
        const step = event.shiftKey ? 5 : 1;
        if (event.key === 'ArrowLeft') void nudgeActiveFrame(-step, 0);
        if (event.key === 'ArrowRight') void nudgeActiveFrame(step, 0);
        if (event.key === 'ArrowUp') void nudgeActiveFrame(0, -step);
        if (event.key === 'ArrowDown') void nudgeActiveFrame(0, step);
        return;
      }

      if (hasActiveFrame && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        removeFrameAt(activeFrameIndex);
        return;
      }

      if (event.key.toLowerCase() === 'g') {
        event.preventDefault();
        setShowCrosshair((prev) => !prev);
        return;
      }

      if (event.key.toLowerCase() === 'o') {
        event.preventDefault();
        setOnionSkin((prev) => !prev);
        return;
      }

      if (event.key.toLowerCase() === 'c' && activeSegment) {
        event.preventDefault();
        setShowBgRemover(true);
        return;
      }

      if (event.key.toLowerCase() === 'r' && activeSegment) {
        event.preventDefault();
        reassessSelectedSegment();
      }
    };

    window.addEventListener('keydown', handleStudioKeyDown);
    return () => window.removeEventListener('keydown', handleStudioKeyDown);
  }, [activeFrameIndex, activeSegment, hasActiveFrame, project.frames.length, showBgRemover]);

  return (
    <div id="animation-studio-container" className="fixed inset-0 h-[100dvh] overflow-hidden bg-slate-950 text-slate-100 font-sans z-40 flex flex-col">
      {/* Invisible canvas for slices */}
      <canvas ref={sliceCanvasRef} className="hidden" />
      <input
        ref={projectImportInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportProjectFile}
      />

      {/* 1. Header Toolbar */}
      <header className="z-20 min-h-16 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-3 px-3 py-2 sm:px-6 shrink-0">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-1.5 sm:p-2 rounded-xl shadow-lg shrink-0">
            <Layers className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-xs sm:text-base tracking-tight text-slate-100 truncate">
              <span className="hidden sm:inline">Animation & Spritesheet Studio</span>
              <span className="sm:hidden">Anim Studio</span>
            </h1>
            <p className="text-[9px] sm:text-[10px] text-indigo-400 font-mono truncate">
              <span className="hidden sm:inline">Visual Perfect Centering & Onion Skinning Guides</span>
              <span className="sm:hidden">Centering & Onion Guides</span>
            </p>
          </div>
        </div>

        {/* Middle Project Properties */}
        <div className="hidden lg:flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
            <span className="text-slate-500 font-mono">Project:</span>
            <input
              type="text"
              value={project.name}
              onChange={(e) => setProject({ ...project, name: e.target.value.replace(/\s+/g, '_') })}
              className="bg-transparent border-none text-white font-semibold outline-none focus:ring-1 focus:ring-indigo-500 rounded px-1 w-32"
            />
          </div>
          
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300">
            <span className="text-slate-500 font-mono">Viewport:</span>
            <input
              type="number"
              value={project.width}
              onChange={(e) => setProject({ ...project, width: Math.max(16, parseInt(e.target.value) || 256) })}
              className="bg-slate-950 border border-slate-800 text-center text-white font-mono w-14 rounded py-0.5 outline-none"
            />
            <span className="text-slate-600">×</span>
            <input
              type="number"
              value={project.height}
              onChange={(e) => setProject({ ...project, height: Math.max(16, parseInt(e.target.value) || 256) })}
              className="bg-slate-950 border border-slate-800 text-center text-white font-mono w-14 rounded py-0.5 outline-none"
            />
            <span className="text-slate-500">px</span>
          </div>
        </div>

        <div className="hidden md:flex items-center space-x-2 shrink-0">
          <button
            onClick={handleExportProject}
            className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 transition-all cursor-pointer"
          >
            <Save className="h-3.5 w-3.5 text-emerald-400" />
            <span>Save Project</span>
          </button>
          <button
            onClick={handleImportProjectRequest}
            className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 transition-all cursor-pointer"
          >
            <Upload className="h-3.5 w-3.5 text-indigo-400" />
            <span>Load Project</span>
          </button>
        </div>

        <div className="flex md:hidden items-center gap-1 shrink-0">
          <button
            onClick={handleExportProject}
            className="h-9 w-9 rounded-lg border border-slate-800 bg-slate-900 text-emerald-400 flex items-center justify-center"
            aria-label="Save animation project"
            title="Save Project"
          >
            <Save className="h-4 w-4" />
          </button>
          <button
            onClick={handleImportProjectRequest}
            className="h-9 w-9 rounded-lg border border-slate-800 bg-slate-900 text-indigo-400 flex items-center justify-center"
            aria-label="Load animation project"
            title="Load Project"
          >
            <Upload className="h-4 w-4" />
          </button>
        </div>

        {/* Right close button */}
        <button
          onClick={onClose}
          className="flex items-center space-x-1 sm:space-x-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg px-2.5 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold cursor-pointer transition-all shrink-0"
        >
          <X className="h-3.5 w-3.5" />
          <span>Exit</span>
        </button>
      </header>

      {/* 2. Main Studio workspace */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Mobile Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950 border-b border-slate-800 p-2 lg:hidden shrink-0 z-10">
          <button
            onClick={() => setActiveStudioTab('player')}
            className={`min-h-11 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeStudioTab === 'player'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/15'
                : 'border border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            <Play className="h-4 w-4" />
            <span>Stage & Loop</span>
          </button>
          <button
            onClick={() => setActiveStudioTab('source')}
            className={`min-h-11 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeStudioTab === 'source'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/15'
                : 'border border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            <Columns className="h-4 w-4" />
            <span>Source & Slice</span>
          </button>
        </div>
        
        {/* 2.1 Left Panel: Cutouts importer / Subdivision Tools */}
        <aside className={`${activeStudioTab === 'source' ? 'flex' : 'hidden lg:flex'} w-full lg:w-80 flex-1 lg:flex-none min-h-0 border-r border-slate-800 bg-slate-950 flex-col overflow-y-auto overscroll-contain lg:overflow-hidden shrink-0`}>
          <div className="p-4 border-b border-slate-800 bg-slate-950/95 backdrop-blur shrink-0 space-y-3">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Source Actions</h2>
              <p className="text-[10px] text-slate-500">
                Slice actions stay at the top of this source workspace.
              </p>
            </div>

            {activeSegment ? (
              <div className="space-y-2">
                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-[10px] text-slate-400">
                  {isAutoDetectingGrid ? 'Detecting object grid from transparency...' : autoDetectedGridLabel || 'Grid will be auto-detected from the transparent cutout'}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Columns (X)</label>
                    <input
                      type="number"
                      min="1"
                      max="32"
                      value={cols}
                      onChange={(e) => setCols(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2.5 text-xs text-center font-mono text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">Rows (Y)</label>
                    <input
                      type="number"
                      min="1"
                      max="32"
                      value={rows}
                      onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg py-1.5 px-2.5 text-xs text-center font-mono text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => loadSegmentAsFrames(activeSegment)}
                    disabled={isAutoDetectingGrid}
                    className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-md shadow-indigo-600/10 cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>{isAutoDetectingGrid ? 'Detecting Grid...' : 'Slice & View Playing Back'}</span>
                  </button>
                  <button
                    onClick={() => appendSegmentAsFrame(activeSegment)}
                    className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <Plus className="h-4 w-4 text-slate-500" />
                    <span>Append as Single Frame</span>
                  </button>
                  <button
                    onClick={reassessSelectedSegment}
                    disabled={isAutoDetectingGrid}
                    className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-800 disabled:text-slate-500 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`h-4 w-4 text-slate-500 ${isAutoDetectingGrid ? 'animate-spin' : ''}`} />
                    <span>{isAutoDetectingGrid ? 'Reassessing...' : 'Reassess Transparency'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5 text-[11px] text-slate-500">
                Pick a saved cutout to enable slicing actions here.
              </div>
            )}
          </div>
          <div className="flex-none lg:flex-1 overflow-visible lg:overflow-y-auto overscroll-contain p-4 space-y-5">
          {/* Mobile-only Project Properties inside Left Panel */}
          <div className="block lg:hidden bg-slate-900/40 border border-slate-800 p-3.5 rounded-xl space-y-3 shrink-0">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Project Configuration</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-mono">Project Name</label>
                <input
                  type="text"
                  value={project.name}
                  onChange={(e) => setProject({ ...project, name: e.target.value.replace(/\s+/g, '_') })}
                  className="w-full bg-slate-950 border border-slate-800 px-2 py-1.5 text-xs text-white rounded-lg outline-none focus:border-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-mono">Viewport Bounds (PX)</label>
                <div className="flex items-center space-x-1">
                  <input
                    type="number"
                    value={project.width}
                    onChange={(e) => setProject({ ...project, width: Math.max(16, parseInt(e.target.value) || 256) })}
                    className="w-14 bg-slate-950 border border-slate-800 px-1 py-1.5 text-xs text-center text-white rounded-lg font-mono outline-none focus:border-indigo-500"
                  />
                  <span className="text-slate-600">×</span>
                  <input
                    type="number"
                    value={project.height}
                    onChange={(e) => setProject({ ...project, height: Math.max(16, parseInt(e.target.value) || 256) })}
                    className="w-14 bg-slate-950 border border-slate-800 px-1 py-1.5 text-xs text-center text-white rounded-lg font-mono outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center space-x-2">
              <Grid className="h-4 w-4 text-indigo-400" />
              <span>1. Choose Source Cutout</span>
            </h2>
            
            {savedSegments.length === 0 ? (
              <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
                No segments cut yet! Go back and save image cuts first.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Filter Source Cutouts</span>
                    <span className="text-[10px] text-slate-500 font-mono">{filteredSegments.length} shown</span>
                  </div>
                  <input
                    type="text"
                    value={sourceSearch}
                    onChange={(e) => setSourceSearch(e.target.value)}
                    placeholder="Search by cutout name or tag..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'all' as SourceFilter, label: 'All', count: filterCounts.all },
                      { id: 'needs-cleanup' as SourceFilter, label: 'Needs Cleanup', count: filterCounts['needs-cleanup'] },
                      { id: 'cleaned' as SourceFilter, label: 'Cleaned', count: filterCounts.cleaned },
                    ].map((filterOption) => (
                      <button
                        key={filterOption.id}
                        type="button"
                        onClick={() => setSourceFilter(filterOption.id)}
                        className={`rounded-xl border px-2 py-2 text-[10px] font-semibold transition-all cursor-pointer ${
                          sourceFilter === filterOption.id
                            ? 'border-indigo-500 bg-indigo-500/15 text-indigo-200'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <div>{filterOption.label}</div>
                        <div className="mt-1 font-mono text-[9px] opacity-80">{filterOption.count}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2 relative" ref={dropdownRef}>
                  {/* Custom Dropdown Trigger Button */}
                  <button
                    type="button"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-200 flex items-center justify-between outline-none cursor-pointer hover:border-slate-700 hover:bg-slate-900/80 transition-all text-left"
                  >
                    {activeSegment ? (
                      <div className="flex items-center space-x-2 min-w-0">
                        <div className="w-6 h-6 bg-checkerboard rounded border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                          <img
                            src={activeSegment.thumbnailUrl}
                            alt=""
                            className="max-w-full max-h-full object-contain"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                        <span className="truncate font-medium">{activeSegment.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono shrink-0">({activeSegment.bounds.width}×{activeSegment.bounds.height})</span>
                        <span
                          className={`hidden sm:inline text-[9px] px-1.5 py-0.5 rounded-full border shrink-0 ${
                            activeSegment.backgroundRemovedAt
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                          }`}
                        >
                          {activeSegment.backgroundRemovedAt ? 'Cleaned' : 'Needs Cleanup'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400">Select a saved cut...</span>
                    )}
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform shrink-0 ml-1.5 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Options List */}
                  {isDropdownOpen && (
                    <div className="absolute left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-30 max-h-60 overflow-y-auto py-1 divide-y divide-slate-900">
                      {filteredSegments.length === 0 ? (
                        <div className="px-3 py-4 text-center text-xs text-slate-500">
                          No cutouts match the current search and filter.
                        </div>
                      ) : filteredSegments.map((seg) => {
                        const isSelected = seg.id === selectedSegmentId;
                        return (
                          <button
                            key={seg.id}
                            type="button"
                            onClick={() => {
                              setSelectedSegmentId(seg.id);
                              setIsDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-2 flex items-center space-x-2.5 hover:bg-indigo-600/10 text-left transition-all cursor-pointer ${
                              isSelected ? 'bg-indigo-950/40 text-indigo-400' : 'text-slate-300'
                            }`}
                          >
                            <div className="w-10 h-10 bg-checkerboard rounded border border-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                              <img
                                src={seg.thumbnailUrl}
                                alt=""
                                className="max-w-[90%] max-h-[90%] object-contain"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold truncate text-slate-200">{seg.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[10px] text-slate-500 font-mono">{seg.bounds.width} × {seg.bounds.height} px</p>
                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded-full border ${
                                    seg.backgroundRemovedAt
                                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                      : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                  }`}
                                >
                                  {seg.backgroundRemovedAt ? 'Cleaned' : 'Needs Cleanup'}
                                </span>
                              </div>
                              {seg.tags && seg.tags.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {seg.tags.slice(0, 3).map((tag) => (
                                    <span
                                      key={`${seg.id}-${tag}`}
                                      className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-200"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            {isSelected && (
                              <Check className="h-4 w-4 text-indigo-400 shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {activeSegment && (
                  <div className="space-y-2">
                    <div className="border border-slate-800 bg-slate-900/50 p-3 rounded-xl flex items-center space-x-3 relative overflow-hidden">
                      <div className="w-16 h-16 bg-checkerboard rounded-lg flex items-center justify-center border border-slate-800 shrink-0">
                        <img src={activeSegment.thumbnailUrl} alt="Thumbnail" className="max-w-[85%] max-h-[85%] object-contain" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate text-slate-200">{activeSegment.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">{activeSegment.bounds.width} × {activeSegment.bounds.height} px</p>
                        <p className="text-[10px] text-indigo-400 font-medium mt-1">
                          {isAutoDetectingGrid ? 'Analyzing transparent objects...' : autoDetectedGridLabel || 'Ready for animation'}
                        </p>
                        {activeSegment.tags && activeSegment.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {activeSegment.tags.map((tag) => (
                              <span
                                key={`${activeSegment.id}-${tag}`}
                                className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-200"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setShowBgRemover(true)}
                      className="w-full py-2 bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Clean / Polish Background</span>
                    </button>
                    <button
                      onClick={reassessSelectedSegment}
                      disabled={isAutoDetectingGrid}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-800 disabled:text-slate-500 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${isAutoDetectingGrid ? 'animate-spin' : ''}`} />
                      <span>{isAutoDetectingGrid ? 'Reassessing...' : 'Reassess Selected Cutout'}</span>
                    </button>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2">
                          <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bulk Cleanup Queue</span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-500">{queuedSegments.length} queued</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={addActiveSegmentToCleanupQueue}
                          className="py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer"
                        >
                          Queue Selected
                        </button>
                        <button
                          onClick={queueVisibleNeedsCleanupSegments}
                          className="py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer"
                        >
                          Queue Visible
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={startQueuedCleanup}
                          className="py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-[10px] font-semibold text-white cursor-pointer"
                        >
                          {queuedSegments.length > 0 ? 'Run Queue Cleanup' : 'Clean Current'}
                        </button>
                        <button
                          onClick={() => setCleanupQueue([])}
                          className="py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer"
                        >
                          Clear Queue
                        </button>
                      </div>
                      {queuedSegments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {queuedSegments.slice(0, 6).map((segment) => (
                            <button
                              key={`queued-${segment.id}`}
                              type="button"
                              onClick={() => removeQueuedSegment(segment.id)}
                              className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] text-emerald-200 cursor-pointer"
                            >
                              {segment.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Slicing & Subdivision Controls */}
          {activeSegment && (
            <div className="space-y-4 border-t border-slate-900 pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
                <Columns className="h-4 w-4 text-emerald-400" />
                <span>2. Subdivide / Slice Sprite Sheet</span>
              </h3>

              <p className="text-[10px] text-slate-500 leading-relaxed">
                If the saved cutout contains a grid of animation states (e.g. walk cycle), divide it to instantly preview the animation loop. Adjust columns/rows to match the sprites sheet grid.
              </p>
            </div>
          )}

        </div>
        </aside>

        {/* 2.2 Middle: Live Loop Player Workspace */}
        <section className={`${activeStudioTab === 'player' ? 'flex' : 'hidden lg:flex'} w-full flex-1 min-h-0 flex-col bg-slate-900 relative overflow-y-auto overscroll-contain lg:overflow-hidden`}>
          
          {/* Top playback hud */}
          <div className="min-h-12 border-b border-slate-800 bg-slate-950/40 flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6 shrink-0 text-slate-300">
            <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={project.frames.length === 0}
                className={`p-1.5 sm:p-2 rounded-full cursor-pointer transition-all ${
                  isPlaying 
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/15' 
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/15'
                } disabled:opacity-40 shrink-0`}
                title={isPlaying ? 'Pause Loop' : 'Play Loop'}
              >
                {isPlaying ? <Pause className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="currentColor" /> : <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4" fill="currentColor" />}
              </button>
              
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setActiveFrameIndex((prev) => Math.max(0, prev - 1))}
                  disabled={project.frames.length === 0 || isPlaying}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
                <span className="text-[10px] sm:text-xs font-mono font-bold text-slate-300 px-0.5 sm:px-1 whitespace-nowrap">
                  F {project.frames.length > 0 ? activeFrameIndex + 1 : 0} / {project.frames.length}
                </span>
                <button
                  onClick={() => setActiveFrameIndex((prev) => Math.min(project.frames.length - 1, prev + 1))}
                  disabled={project.frames.length === 0 || isPlaying}
                  className="p-1 hover:bg-slate-800 rounded text-slate-400 disabled:opacity-40"
                >
                  <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
              </div>
            </div>

            {/* Playback FPS selector slider */}
            <div className="flex items-center space-x-1.5 sm:space-x-3 min-w-0">
              <span className="hidden sm:inline text-[10px] sm:text-xs font-medium text-slate-400">FPS:</span>
              <span className="text-[11px] sm:text-xs font-mono font-bold text-indigo-400 w-5 text-center">{project.fps}</span>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={project.fps}
                onChange={(e) => setProject({ ...project, fps: parseInt(e.target.value, 10) })}
                className="w-20 sm:w-28 accent-indigo-500 cursor-pointer h-1"
              />
            </div>

            {/* Playback zoom size */}
            <div className="flex items-center space-x-1 sm:space-x-2 shrink-0">
              <span className="text-[10px] sm:text-[11px] text-slate-500 hidden sm:inline">Zoom:</span>
              <button onClick={() => setPreviewZoom((z) => Math.max(0.5, z - 0.25))} className="text-xs font-mono px-1 sm:px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-300">-</button>
              <span className="text-[10px] sm:text-xs font-mono font-bold text-slate-300 w-8 text-center">{Math.round(previewZoom * 100)}%</span>
              <button onClick={() => setPreviewZoom((z) => Math.min(5, z + 0.25))} className="text-xs font-mono px-1 sm:px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded text-slate-300">+</button>
            </div>
          </div>

          <div className="hidden lg:block px-3 sm:px-6 pt-3 shrink-0">
            {previewGuideControls}
          </div>

          {/* Animation rendering stage */}
          <div className="flex-none h-[38dvh] min-h-[240px] lg:flex-1 lg:h-auto lg:min-h-0 flex items-center justify-center p-3 sm:p-8 overflow-hidden relative">
            {project.frames.length === 0 ? (
              <div className="text-center max-w-sm space-y-3 p-6 bg-slate-950/40 rounded-2xl border border-slate-800/40">
                <div className="p-4 bg-slate-900/60 rounded-full inline-block border border-slate-800/60 text-slate-500">
                  <Play className="h-8 w-8" />
                </div>
                <h3 className="text-sm font-semibold text-slate-300">Animation Timeline Empty</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Select a saved cutout from the left panel, and click <strong className="text-indigo-400">Slice & View</strong> or <strong className="text-slate-300">Append</strong> to load image frames here.
                </p>
              </div>
            ) : (
              <div
                className="relative bg-checkerboard border border-slate-800 rounded-xl shadow-2xl flex items-center justify-center transition-all"
                style={{
                  width: `${project.width * previewZoom}px`,
                  height: `${project.height * previewZoom}px`,
                }}
              >
                {/* 1. ONION SKIN LAYER: Previous Frame */}
                {onionSkin && activeFrameIndex > 0 && !isPlaying && (
                  <div
                    className="absolute inset-0 pointer-events-none flex items-center justify-center"
                    style={{ opacity: onionSkinOpacity }}
                  >
                    <img
                      src={project.frames[activeFrameIndex - 1].thumbnailUrl}
                      alt="Onion Skin Prev"
                      className="object-contain"
                      style={{
                        transformOrigin: `${project.frames[activeFrameIndex - 1].pivotX ?? 0}px ${project.frames[activeFrameIndex - 1].pivotY ?? 0}px`,
                        transform: `translate(${project.frames[activeFrameIndex - 1].offsetX * previewZoom}px, ${project.frames[activeFrameIndex - 1].offsetY * previewZoom}px) scale(${project.frames[activeFrameIndex - 1].scale})`,
                        maxWidth: '100%',
                        maxHeight: '100%',
                      }}
                    />
                  </div>
                )}

                {/* 2. ONION SKIN LAYER: Next Frame */}
                {onionSkin && activeFrameIndex < project.frames.length - 1 && !isPlaying && (
                  <div
                    className="absolute inset-0 pointer-events-none flex items-center justify-center"
                    style={{ opacity: onionSkinOpacity }}
                  >
                    <img
                      src={project.frames[activeFrameIndex + 1].thumbnailUrl}
                      alt="Onion Skin Next"
                      className="object-contain"
                      style={{
                        transformOrigin: `${project.frames[activeFrameIndex + 1].pivotX ?? 0}px ${project.frames[activeFrameIndex + 1].pivotY ?? 0}px`,
                        transform: `translate(${project.frames[activeFrameIndex + 1].offsetX * previewZoom}px, ${project.frames[activeFrameIndex + 1].offsetY * previewZoom}px) scale(${project.frames[activeFrameIndex + 1].scale})`,
                        maxWidth: '100%',
                        maxHeight: '100%',
                      }}
                    />
                  </div>
                )}

                {/* 3. CORE ACTIVE FRAME */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <img
                    src={project.frames[activeFrameIndex].thumbnailUrl}
                    alt={`Frame ${activeFrameIndex}`}
                    className="object-contain"
                    style={{
                      transformOrigin: `${project.frames[activeFrameIndex].pivotX ?? 0}px ${project.frames[activeFrameIndex].pivotY ?? 0}px`,
                      transform: `translate(${project.frames[activeFrameIndex].offsetX * previewZoom}px, ${project.frames[activeFrameIndex].offsetY * previewZoom}px) scale(${project.frames[activeFrameIndex].scale})`,
                      maxWidth: '100%',
                      maxHeight: '100%',
                    }}
                  />
                </div>

                {/* Centering crosshair layout guide lines */}
                {showCrosshair && (
                  <div className="absolute inset-0 pointer-events-none">
                    {/* Vertical axis line */}
                    <div className="absolute top-0 bottom-0 left-1/2 -ml-px w-[1px] border-l border-dashed border-red-500/35" />
                    {/* Horizontal axis line */}
                    <div className="absolute left-0 right-0 top-1/2 -mt-px h-[1px] border-t border-dashed border-red-500/35" />
                    {/* Center Ring target */}
                    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 border border-dashed border-red-500/35 rounded-full" />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:hidden border-t border-slate-800 bg-slate-950/70 p-4 space-y-4 shrink-0">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                <Move className="h-4 w-4 text-emerald-400" />
                <span>Loop Controls</span>
              </h3>
              {hasActiveFrame && (
                <span className="text-[10px] font-mono text-indigo-400">
                  Frame {activeFrameIndex + 1}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleExportProject}
                className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <Save className="h-3.5 w-3.5 text-emerald-400" />
                <span>Save Project</span>
              </button>
              <button
                onClick={handleImportProjectRequest}
                className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <Upload className="h-3.5 w-3.5 text-indigo-400" />
                <span>Load Project</span>
              </button>
            </div>

            {!hasActiveFrame ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5 text-[11px] text-slate-500">
                Load frames to unlock alignment and export controls here.
              </div>
            ) : (
              <>
                {previewGuideControls}

                <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Align All Frames</div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => alignAllFrames('left', null)}
                      disabled={isAutoCenteringFrames}
                      className="py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-800 disabled:text-slate-500 border border-slate-800 rounded-xl text-slate-300 flex items-center justify-center cursor-pointer"
                    >
                      <ArrowLeftToLine className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => alignAllFrames('center', null)}
                      disabled={isAutoCenteringFrames}
                      className="py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl cursor-pointer flex items-center justify-center"
                    >
                      <AlignCenterHorizontal className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => alignAllFrames('right', null)}
                      disabled={isAutoCenteringFrames}
                      className="py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-800 disabled:text-slate-500 border border-slate-800 rounded-xl text-slate-300 flex items-center justify-center cursor-pointer"
                    >
                      <ArrowRightToLine className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => alignAllFrames(null, 'top')}
                      disabled={isAutoCenteringFrames}
                      className="py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-800 disabled:text-slate-500 border border-slate-800 rounded-xl text-slate-300 flex items-center justify-center cursor-pointer"
                    >
                      <ArrowUpToLine className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => alignAllFrames(null, 'center')}
                      disabled={isAutoCenteringFrames}
                      className="py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl cursor-pointer flex items-center justify-center"
                    >
                      <AlignCenterVertical className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => alignAllFrames(null, 'bottom')}
                      disabled={isAutoCenteringFrames}
                      className="py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-800 disabled:text-slate-500 border border-slate-800 rounded-xl text-slate-300 flex items-center justify-center cursor-pointer"
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => alignAllFrames('center', 'center')}
                    disabled={isAutoCenteringFrames}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl flex items-center justify-center transition-all cursor-pointer"
                  >
                    <Maximize className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={resetActiveFrameCenter}
                    className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[11px] text-slate-400 font-medium flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset Current</span>
                  </button>
                  <button
                    onClick={resetAllFramesCenter}
                    className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[11px] text-slate-400 font-medium flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3 animate-spin-slow" />
                    <span>Reset All</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={trimActiveFrameTransparentPadding}
                    className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer"
                  >
                    Trim Current
                  </button>
                  <button
                    onClick={trimAllFramesTransparentPadding}
                    className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer"
                  >
                    Trim All
                  </button>
                  <button
                    onClick={removeDuplicateFrames}
                    className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer"
                  >
                    Deduplicate
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={exportCenteredPngZip}
                    disabled={isExporting}
                    className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/10 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Archive className="h-4.5 w-4.5" />
                    <span>{isExporting ? 'Packaging ZIP...' : 'Export Centered PNGs ZIP'}</span>
                  </button>
                  <button
                    onClick={exportSpriteSheet}
                    disabled={isExporting}
                    className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-indigo-400 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer"
                  >
                    <Grid className="h-4 w-4" />
                    <span>Export Aligned Spritesheet</span>
                  </button>
                  <button
                    onClick={exportSpriteSheetPackage}
                    disabled={isExporting}
                    className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer"
                  >
                    <Archive className="h-4 w-4" />
                    <span>Export Sheet + JSON</span>
                  </button>
                </div>

                <div className="bg-slate-900/60 border border-slate-850 p-3 rounded-xl space-y-1 font-mono text-[11px] text-slate-400">
                  <p className="font-semibold text-slate-200">Frame #{activeFrameIndex + 1} Stats:</p>
                  <div className="space-y-1 pt-1 text-slate-300">
                    {project.frames[activeFrameIndex].sourceSegmentId ? (
                      <>
                        <div className="text-indigo-400 font-semibold text-[9px] uppercase tracking-wider">Source Slice (Crop Box):</div>
                        <div className="grid grid-cols-2 gap-1 pb-1.5 text-xs border-b border-slate-800/80 mb-1.5">
                          <div>Slice X: <span className="font-bold text-emerald-400">{project.frames[activeFrameIndex].sliceX}px</span></div>
                          <div>Slice Y: <span className="font-bold text-emerald-400">{project.frames[activeFrameIndex].sliceY}px</span></div>
                          <div>Width: <span className="font-bold text-slate-400">{project.frames[activeFrameIndex].sliceW}px</span></div>
                          <div>Height: <span className="font-bold text-slate-400">{project.frames[activeFrameIndex].sliceH}px</span></div>
                        </div>
                      </>
                    ) : null}
                    <div className="text-indigo-400 font-semibold text-[9px] uppercase tracking-wider">Visual Alignment:</div>
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div>Visual X: <span className="font-bold text-emerald-400">{project.frames[activeFrameIndex].offsetX}px</span></div>
                      <div>Visual Y: <span className="font-bold text-emerald-400">{project.frames[activeFrameIndex].offsetY}px</span></div>
                      <div className="col-span-2">Zoom / Scale: <span className="font-bold text-indigo-400">{Math.round(project.frames[activeFrameIndex].scale * 100)}%</span></div>
                      <div>Pivot X: <span className="font-bold text-amber-300">{project.frames[activeFrameIndex].pivotX}px</span></div>
                      <div>Pivot Y: <span className="font-bold text-amber-300">{project.frames[activeFrameIndex].pivotY}px</span></div>
                    </div>
                    {savedSegments.find((segment) => segment.id === project.frames[activeFrameIndex].sourceSegmentId)?.tags?.length ? (
                      <div className="pt-1 border-t border-slate-800/80">
                        <div className="text-indigo-400 font-semibold text-[9px] uppercase tracking-wider flex items-center space-x-1">
                          <Tags className="h-3 w-3" />
                          <span>Source Tags</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(savedSegments.find((segment) => segment.id === project.frames[activeFrameIndex].sourceSegmentId)?.tags ?? []).map((tag) => (
                            <span key={`desktop-tag-${tag}`} className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-200">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-2 p-3 bg-slate-900/30 border border-slate-900 rounded-xl">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <span>Pivot Anchor</span>
                    <span className="font-mono text-amber-300">{project.frames[activeFrameIndex].pivotX}px, {project.frames[activeFrameIndex].pivotY}px</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setActiveFramePivotPreset('center')} className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer">Center</button>
                    <button onClick={() => setActiveFramePivotPreset('bottom-center')} className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer">Feet / Bottom</button>
                    <button onClick={() => setActiveFramePivotPreset('top-center')} className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer">Top Center</button>
                    <button onClick={() => setActiveFramePivotPreset('top-left')} className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer">Top Left</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => nudgeActiveFramePivot(-1, 0)} className="py-1.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white">Pivot -1 X</button>
                    <button onClick={() => nudgeActiveFramePivot(1, 0)} className="py-1.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white">Pivot +1 X</button>
                    <button onClick={() => nudgeActiveFramePivot(0, -1)} className="py-1.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white">Pivot -1 Y</button>
                    <button onClick={() => nudgeActiveFramePivot(0, 1)} className="py-1.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white">Pivot +1 Y</button>
                  </div>
                </div>

                <div className="flex flex-col items-center space-y-1.5 p-3 bg-slate-900/30 border border-slate-900 rounded-xl">
                  <span className="text-[10px] text-slate-400 tracking-wider uppercase font-bold mb-2">
                    {project.frames[activeFrameIndex].sourceSegmentId ? 'Source Slice Adjuster' : 'Align Offset Nudge'}
                  </span>
                  <button
                    onClick={() => nudgeActiveFrame(0, -1)}
                    className="w-10 h-10 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg flex items-center justify-center font-bold text-xs shadow cursor-pointer active:scale-95 transition-all"
                  >
                    ▲
                  </button>
                  <div className="flex space-x-6">
                    <button
                      onClick={() => nudgeActiveFrame(-1, 0)}
                      className="w-10 h-10 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg flex items-center justify-center font-bold text-xs shadow cursor-pointer active:scale-95 transition-all"
                    >
                      ◀
                    </button>
                    <button
                      onClick={() => nudgeActiveFrame(1, 0)}
                      className="w-10 h-10 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg flex items-center justify-center font-bold text-xs shadow cursor-pointer active:scale-95 transition-all"
                    >
                      ▶
                    </button>
                  </div>
                  <button
                    onClick={() => nudgeActiveFrame(0, 1)}
                    className="w-10 h-10 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg flex items-center justify-center font-bold text-xs shadow cursor-pointer active:scale-95 transition-all"
                  >
                    ▼
                  </button>
                  <div className="grid grid-cols-2 gap-2 w-full pt-3">
                    <button
                      onClick={() => nudgeActiveFrame(-5, 0)}
                      className="py-1 px-2 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white"
                    >
                      Nudge -5px X
                    </button>
                    <button
                      onClick={() => nudgeActiveFrame(5, 0)}
                      className="py-1 px-2 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white"
                    >
                      Nudge +5px X
                    </button>
                    <button
                      onClick={() => nudgeActiveFrame(0, -5)}
                      className="py-1 px-2 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white"
                    >
                      Nudge -5px Y
                    </button>
                    <button
                      onClick={() => nudgeActiveFrame(0, 5)}
                      className="py-1 px-2 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white"
                    >
                      Nudge +5px Y
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5 p-3 bg-slate-900/30 border border-slate-900 rounded-xl">
                  <div className="flex justify-between text-xs font-semibold text-slate-300">
                    <span>Frame Scale</span>
                    <span className="text-indigo-400 font-mono">{Math.round(project.frames[activeFrameIndex].scale * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="2.5"
                    step="0.05"
                    value={project.frames[activeFrameIndex].scale}
                    onChange={(e) => adjustActiveFrameScale(parseFloat(e.target.value))}
                    className="w-full accent-indigo-500 h-1 cursor-pointer"
                  />
                </div>
              </>
            )}
          </div>

          {/* Timeline slider representation at base */}
          {project.frames.length > 0 && (
            <div className="p-4 border-t border-slate-800 bg-slate-950/80 space-y-3 shrink-0">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-400">Frame Sequence Timeline</span>
                <span className="font-mono text-indigo-400 font-bold">{project.frames.length} total frames</span>
              </div>
              
              <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-thin">
                {project.frames.map((frame, idx) => {
                  const isActive = idx === activeFrameIndex;
                  return (
                    <div
                      key={frame.id}
                      onClick={() => {
                        setActiveFrameIndex(idx);
                        setIsPlaying(false);
                      }}
                      className={`relative w-20 h-20 rounded-xl bg-slate-900 border flex flex-col justify-between p-1.5 cursor-pointer shrink-0 transition-all ${
                        isActive
                          ? 'border-indigo-500 bg-indigo-950/30 ring-2 ring-indigo-500/35 scale-[1.03] shadow-lg'
                          : 'border-slate-800/80 hover:border-slate-700 hover:bg-slate-850'
                      }`}
                    >
                      {/* Image Preview */}
                      <div className="flex-1 bg-checkerboard rounded-lg flex items-center justify-center overflow-hidden border border-slate-950/40 relative">
                        <img
                          src={frame.thumbnailUrl}
                          alt={`Frame ${idx + 1}`}
                          className="max-w-[85%] max-h-[85%] object-contain"
                          style={{
                            transform: `translate(${frame.offsetX * 0.4}px, ${frame.offsetY * 0.4}px) scale(${frame.scale})`,
                          }}
                        />
                        
                        {/* Sequence Number tag */}
                        <div className="absolute bottom-1 left-1 bg-slate-950/90 text-[8px] px-1 font-bold text-slate-300 rounded font-mono">
                          #{idx + 1}
                        </div>
                      </div>

                      {/* Small Frame Actions */}
                      <div className="flex justify-between items-center mt-1 text-[8px] text-slate-400 px-0.5">
                        <div className="flex space-x-1">
                          {idx > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                shiftFrameOrder(idx, 'left');
                              }}
                              className="hover:text-indigo-400"
                              title="Move Left"
                            >
                              ◀
                            </button>
                          )}
                          {idx < project.frames.length - 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                shiftFrameOrder(idx, 'right');
                              }}
                              className="hover:text-indigo-400"
                              title="Move Right"
                            >
                              ▶
                            </button>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFrameAt(idx);
                          }}
                          className="hover:text-rose-400 transition-colors"
                          title="Delete Frame"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* 2.3 Right Panel: Visual Perfect Alignment Nudge Controls */}
        <aside className="hidden lg:flex lg:w-80 min-h-0 border-l border-slate-800 bg-slate-950 flex-col overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-800 bg-slate-950/95 backdrop-blur shrink-0 space-y-3">
            <div className="space-y-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center space-x-2">
                <Move className="h-4 w-4 text-emerald-400" />
                <span>Alignment Actions</span>
              </h2>
              <p className="text-[10px] text-slate-500">
                Keep export and reset controls pinned here while frame adjustments scroll below.
              </p>
            </div>

            {project.frames.length > 0 ? (
              <div className="space-y-2">
                <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/30 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Align All Frames</div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => alignAllFrames('left', null)}
                      disabled={isAutoCenteringFrames}
                      title="Align Left"
                      aria-label="Align Left"
                      className="py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-800 disabled:text-slate-500 border border-slate-800 rounded-xl text-slate-300 flex items-center justify-center cursor-pointer"
                    >
                      <ArrowLeftToLine className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => alignAllFrames('center', null)}
                      disabled={isAutoCenteringFrames}
                      title="Center Horizontally"
                      aria-label="Center Horizontally"
                      className="py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl cursor-pointer flex items-center justify-center"
                    >
                      <AlignCenterHorizontal className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => alignAllFrames('right', null)}
                      disabled={isAutoCenteringFrames}
                      title="Align Right"
                      aria-label="Align Right"
                      className="py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-800 disabled:text-slate-500 border border-slate-800 rounded-xl text-slate-300 flex items-center justify-center cursor-pointer"
                    >
                      <ArrowRightToLine className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => alignAllFrames(null, 'top')}
                      disabled={isAutoCenteringFrames}
                      title="Align Top"
                      aria-label="Align Top"
                      className="py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-800 disabled:text-slate-500 border border-slate-800 rounded-xl text-slate-300 flex items-center justify-center cursor-pointer"
                    >
                      <ArrowUpToLine className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => alignAllFrames(null, 'center')}
                      disabled={isAutoCenteringFrames}
                      title="Center Vertically"
                      aria-label="Center Vertically"
                      className="py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl cursor-pointer flex items-center justify-center"
                    >
                      <AlignCenterVertical className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => alignAllFrames(null, 'bottom')}
                      disabled={isAutoCenteringFrames}
                      title="Align Bottom"
                      aria-label="Align Bottom"
                      className="py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-800 disabled:text-slate-500 border border-slate-800 rounded-xl text-slate-300 flex items-center justify-center cursor-pointer"
                    >
                      <ArrowDownToLine className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    onClick={() => alignAllFrames('center', 'center')}
                    disabled={isAutoCenteringFrames}
                    title="Center Both Axes"
                    aria-label="Center Both Axes"
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl flex items-center justify-center transition-all cursor-pointer"
                  >
                    <Maximize className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={resetActiveFrameCenter}
                    className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[11px] text-slate-400 font-medium flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Reset Current</span>
                  </button>
                  <button
                    onClick={resetAllFramesCenter}
                    className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[11px] text-slate-400 font-medium flex items-center justify-center space-x-1 cursor-pointer"
                  >
                    <RefreshCw className="h-3 w-3 animate-spin-slow" />
                    <span>Reset All</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={trimActiveFrameTransparentPadding}
                    className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer"
                  >
                    Trim Current
                  </button>
                  <button
                    onClick={trimAllFramesTransparentPadding}
                    className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer"
                  >
                    Trim All
                  </button>
                  <button
                    onClick={removeDuplicateFrames}
                    className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer"
                  >
                    Deduplicate
                  </button>
                </div>

                <button
                  onClick={exportCenteredPngZip}
                  disabled={isExporting}
                  className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/10 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Archive className="h-4.5 w-4.5" />
                  <span>{isExporting ? 'Packaging ZIP...' : 'Export Centered PNGs ZIP'}</span>
                </button>

                <button
                  onClick={exportSpriteSheet}
                  disabled={isExporting}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-indigo-400 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  <Grid className="h-4 w-4" />
                  <span>Export Aligned Spritesheet</span>
                </button>
                <button
                  onClick={exportSpriteSheetPackage}
                  disabled={isExporting}
                  className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer"
                >
                  <Archive className="h-4 w-4" />
                  <span>Export Sheet + JSON</span>
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5 text-[11px] text-slate-500">
                Load frames to unlock alignment and export actions here.
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {project.frames.length === 0 || !project.frames[activeFrameIndex] ? (
            <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl text-center text-xs text-slate-500">
              No active frames to align. Load frames first.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Highlight active frame coordinates */}
              <div className="bg-slate-900/60 border border-slate-850 p-3 rounded-xl space-y-1 font-mono text-[11px] text-slate-400">
                <p className="font-semibold text-slate-200">Frame #{activeFrameIndex + 1} Stats:</p>
                <div className="space-y-1 pt-1 text-slate-300">
                  {project.frames[activeFrameIndex].sourceSegmentId ? (
                    <>
                      <div className="text-indigo-400 font-semibold text-[9px] uppercase tracking-wider">Source Slice (Crop Box):</div>
                      <div className="grid grid-cols-2 gap-1 pb-1.5 text-xs border-b border-slate-800/80 mb-1.5">
                        <div>Slice X: <span className="font-bold text-emerald-400">{project.frames[activeFrameIndex].sliceX}px</span></div>
                        <div>Slice Y: <span className="font-bold text-emerald-400">{project.frames[activeFrameIndex].sliceY}px</span></div>
                        <div>Width: <span className="font-bold text-slate-400">{project.frames[activeFrameIndex].sliceW}px</span></div>
                        <div>Height: <span className="font-bold text-slate-400">{project.frames[activeFrameIndex].sliceH}px</span></div>
                      </div>
                    </>
                  ) : null}
                  <div className="text-indigo-400 font-semibold text-[9px] uppercase tracking-wider">Visual Alignment:</div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div>Visual X: <span className="font-bold text-emerald-400">{project.frames[activeFrameIndex].offsetX}px</span></div>
                    <div>Visual Y: <span className="font-bold text-emerald-400">{project.frames[activeFrameIndex].offsetY}px</span></div>
                    <div className="col-span-2">Zoom / Scale: <span className="font-bold text-indigo-400">{Math.round(project.frames[activeFrameIndex].scale * 100)}%</span></div>
                    <div>Pivot X: <span className="font-bold text-amber-300">{project.frames[activeFrameIndex].pivotX}px</span></div>
                    <div>Pivot Y: <span className="font-bold text-amber-300">{project.frames[activeFrameIndex].pivotY}px</span></div>
                  </div>
                  {savedSegments.find((segment) => segment.id === project.frames[activeFrameIndex].sourceSegmentId)?.tags?.length ? (
                    <div className="pt-1 border-t border-slate-800/80">
                      <div className="text-indigo-400 font-semibold text-[9px] uppercase tracking-wider flex items-center space-x-1">
                        <Tags className="h-3 w-3" />
                        <span>Source Tags</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(savedSegments.find((segment) => segment.id === project.frames[activeFrameIndex].sourceSegmentId)?.tags ?? []).map((tag) => (
                          <span key={`mobile-tag-${tag}`} className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-1.5 py-0.5 text-[9px] text-indigo-200">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2 p-3 bg-slate-900/30 border border-slate-900 rounded-xl">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Pivot Anchor</span>
                  <span className="font-mono text-amber-300">{project.frames[activeFrameIndex].pivotX}px, {project.frames[activeFrameIndex].pivotY}px</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setActiveFramePivotPreset('center')} className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer">Center</button>
                  <button onClick={() => setActiveFramePivotPreset('bottom-center')} className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer">Feet / Bottom</button>
                  <button onClick={() => setActiveFramePivotPreset('top-center')} className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer">Top Center</button>
                  <button onClick={() => setActiveFramePivotPreset('top-left')} className="py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-[10px] font-semibold text-slate-300 cursor-pointer">Top Left</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => nudgeActiveFramePivot(-1, 0)} className="py-1.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white">Pivot -1 X</button>
                  <button onClick={() => nudgeActiveFramePivot(1, 0)} className="py-1.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white">Pivot +1 X</button>
                  <button onClick={() => nudgeActiveFramePivot(0, -1)} className="py-1.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white">Pivot -1 Y</button>
                  <button onClick={() => nudgeActiveFramePivot(0, 1)} className="py-1.5 bg-slate-950 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white">Pivot +1 Y</button>
                </div>
              </div>

              {/* Nudge Compass D-Pad Buttons */}
              <div className="flex flex-col items-center space-y-1.5 p-3 bg-slate-900/30 border border-slate-900 rounded-xl">
                <span className="text-[10px] text-slate-400 tracking-wider uppercase font-bold mb-2">
                  {project.frames[activeFrameIndex].sourceSegmentId ? 'Source Slice Adjuster' : 'Align Offset Nudge'}
                </span>
                
                {/* UP */}
                <button
                  onClick={() => nudgeActiveFrame(0, -1)}
                  className="w-10 h-10 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg flex items-center justify-center font-bold text-xs shadow cursor-pointer active:scale-95 transition-all"
                  title="Nudge Up 1px"
                >
                  ▲
                </button>

                {/* LEFT & RIGHT */}
                <div className="flex space-x-6">
                  <button
                    onClick={() => nudgeActiveFrame(-1, 0)}
                    className="w-10 h-10 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg flex items-center justify-center font-bold text-xs shadow cursor-pointer active:scale-95 transition-all"
                    title="Nudge Left 1px"
                  >
                    ◀
                  </button>
                  <button
                    onClick={() => nudgeActiveFrame(1, 0)}
                    className="w-10 h-10 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg flex items-center justify-center font-bold text-xs shadow cursor-pointer active:scale-95 transition-all"
                    title="Nudge Right 1px"
                  >
                    ▶
                  </button>
                </div>

                {/* DOWN */}
                <button
                  onClick={() => nudgeActiveFrame(0, 1)}
                  className="w-10 h-10 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-200 rounded-lg flex items-center justify-center font-bold text-xs shadow cursor-pointer active:scale-95 transition-all"
                  title="Nudge Down 1px"
                >
                  ▼
                </button>

                {/* Micro Nudges helper note */}
                <div className="grid grid-cols-2 gap-2 w-full pt-3">
                  <button
                    onClick={() => nudgeActiveFrame(-5, 0)}
                    className="py-1 px-2 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white"
                  >
                    Nudge -5px X
                  </button>
                  <button
                    onClick={() => nudgeActiveFrame(5, 0)}
                    className="py-1 px-2 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white"
                  >
                    Nudge +5px X
                  </button>
                  <button
                    onClick={() => nudgeActiveFrame(0, -5)}
                    className="py-1 px-2 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white"
                  >
                    Nudge -5px Y
                  </button>
                  <button
                    onClick={() => nudgeActiveFrame(0, 5)}
                    className="py-1 px-2 bg-slate-900 border border-slate-800 rounded text-[10px] font-mono text-slate-400 hover:text-white"
                  >
                    Nudge +5px Y
                  </button>
                </div>
              </div>

              {/* Slider: Scale Adjustment */}
              <div className="space-y-1.5 p-3 bg-slate-900/30 border border-slate-900 rounded-xl">
                <div className="flex justify-between text-xs font-semibold text-slate-300">
                  <span>Frame Scale</span>
                  <span className="text-indigo-400 font-mono">{Math.round(project.frames[activeFrameIndex].scale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="2.5"
                  step="0.05"
                  value={project.frames[activeFrameIndex].scale}
                  onChange={(e) => adjustActiveFrameScale(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 h-1 cursor-pointer"
                />
              </div>
            </div>
          )}
          {project.frames.length > 0 && (
            <p className="text-[9px] text-center text-slate-500 leading-relaxed font-mono">
              PNGs will be scaled and padded to exactly {project.width}x{project.height}px with transparency preserved.
            </p>
          )}
          </div>
        </aside>

      </div>

      {/* Background Remover Polish Overlay */}
      <AnimatePresence>
        {showBgRemover && activeSegment && (
          <BackgroundRemover
            segment={activeSegment}
            onSave={handleSaveCleanedSegmentLocally}
            onClose={() => setShowBgRemover(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
