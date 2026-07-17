import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Point, SavedSegment, SelectionTool, RectBounds, AssetLibraryFile } from './types';
import { findAxisSnapGuides, findSnappedPoint, createSegmentImage, getPathBounds } from './utils/canvasUtils';
import { getIndexedDbRecord, setIndexedDbRecord } from './utils/indexedDbStorage';
import { SAMPLE_IMAGES, SampleImage } from './data/samples';
import bmcButton from './assets/bmc-button.svg';
import SegmentList from './components/SegmentList';
import AnimationStudio from './components/AnimationStudio';
import BackgroundRemover from './components/BackgroundRemover';
import CollageStudio from './components/CollageStudio';
import {
  Upload,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Trash2,
  MousePointer,
  Square,
  Sparkles,
  Scissors,
  Undo,
  Download,
  AlertCircle,
  Eye,
  X,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type GuideCandidate = {
  value: number;
  source: string;
};

type RectSnapPreview = {
  point: Point;
  guideX: GuideCandidate | null;
  guideY: GuideCandidate | null;
};

const LEGACY_SEGMENTS_KEY = 'lasso_saved_segments';
const LEGACY_INDEX_KEY = 'lasso_cutout_index';
const LIBRARY_STATE_KEY = 'assetmaster.library.state.v1';
const LIBRARY_BACKUPS_KEY = 'assetmaster.library.backups.v1';
const MAX_LIBRARY_BACKUPS = 5;

const normalizeSavedSegment = (segment: SavedSegment): SavedSegment => ({
  ...segment,
  tags: Array.isArray(segment.tags) ? segment.tags : [],
});

export default function App() {
  // Image states
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageName, setImageName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Selection configurations
  const [activeTool, setActiveTool] = useState<SelectionTool>('magnetic');
  const [feather, setFeather] = useState<number>(0);
  const [snapRadius, setSnapRadius] = useState<number>(15);

  // Active selection states
  const [activePath, setActivePath] = useState<Point[]>([]);
  const [isClosed, setIsClosed] = useState<boolean>(false);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [rectStart, setRectStart] = useState<Point | null>(null);
  const [rectEnd, setRectEnd] = useState<Point | null>(null);
  const [rectSnapPreview, setRectSnapPreview] = useState<RectSnapPreview | null>(null);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);

  // Pan and zoom states
  const [zoom, setZoom] = useState<number>(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<Point>({ x: 0, y: 0 });

  // Saved Segments List
  const [savedSegments, setSavedSegments] = useState<SavedSegment[]>([]);
  const [cutoutDraftName, setCutoutDraftName] = useState<string>('');
  const [lastCutoutIndex, setLastCutoutIndex] = useState<number>(1);

  // UI state
  const [previewSegment, setPreviewSegment] = useState<SavedSegment | null>(null);
  const [showAnimationStudio, setShowAnimationStudio] = useState<boolean>(false);
  const [showCollageStudio, setShowCollageStudio] = useState<boolean>(false);
  const [showBgRemover, setShowBgRemover] = useState<boolean>(false);
  const [antsOffset, setAntsOffset] = useState<number>(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [mobileSidebarTab, setMobileSidebarTab] = useState<'settings' | 'cuts'>('cuts');
  const [isLeftToolbarCollapsed, setIsLeftToolbarCollapsed] = useState<boolean>(false);
  const [isLibraryHydrated, setIsLibraryHydrated] = useState<boolean>(false);
  const hasLoadedImage = Boolean(image) && !isLoading;
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(false);

  // Auto-collapse sidebar on small screens on load
  useEffect(() => {
    const applyResponsiveUi = () => {
      const isMobile = window.innerWidth < 768;
      setIsMobileViewport(isMobile);
      if (isMobile) {
        setIsSidebarOpen(false);
        setIsLeftToolbarCollapsed(true);
      }
    };

    applyResponsiveUi();
    window.addEventListener('resize', applyResponsiveUi);

    return () => {
      window.removeEventListener('resize', applyResponsiveUi);
    };
  }, []);

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hiddenImageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenImageCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const libraryImportInputRef = useRef<HTMLInputElement | null>(null);

  // Pinch-to-zoom and multi-touch panning refs
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);
  const touchStartOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const touchStartMidpointRef = useRef<Point>({ x: 0, y: 0 });
  const isMultiTouchingRef = useRef<boolean>(false);

  // Load saved cutouts from IndexedDB on mount, falling back to legacy browser storage once for migration.
  useEffect(() => {
    let cancelled = false;

    const loadLibraryState = async () => {
      const applySnapshot = (snapshot: Partial<AssetLibraryFile>) => {
        if (cancelled) {
          return;
        }

        setSavedSegments((snapshot.savedSegments ?? []).map(normalizeSavedSegment));
        setLastCutoutIndex(snapshot.lastCutoutIndex ?? 1);
      };

      try {
        const indexedDbState = await getIndexedDbRecord<AssetLibraryFile>(LIBRARY_STATE_KEY);
        if (indexedDbState) {
          applySnapshot(indexedDbState);
          return;
        }
      } catch (error) {
        console.error('Failed to read library state from IndexedDB', error);
      }

      let migratedSnapshot: Partial<AssetLibraryFile> | null = null;
      const restoreLegacyBackup = () => {
        const backupsRaw = localStorage.getItem(LIBRARY_BACKUPS_KEY);
        if (!backupsRaw) {
          return null;
        }

        try {
          const backups = JSON.parse(backupsRaw) as Array<{ payload: string; savedAt: number }>;
          const latestBackup = backups[0];
          if (!latestBackup?.payload) {
            return null;
          }

          return JSON.parse(latestBackup.payload) as Pick<AssetLibraryFile, 'savedSegments' | 'lastCutoutIndex'>;
        } catch (error) {
          console.error('Failed to restore legacy library backup', error);
          return null;
        }
      };

      const structuredState = localStorage.getItem(LIBRARY_STATE_KEY);
      if (structuredState) {
        try {
          migratedSnapshot = JSON.parse(structuredState) as Partial<AssetLibraryFile>;
        } catch (error) {
          console.error('Failed to parse structured library state', error);
          migratedSnapshot = restoreLegacyBackup();
        }
      } else {
        const legacySaved = localStorage.getItem(LEGACY_SEGMENTS_KEY);
        const legacyIndex = localStorage.getItem(LEGACY_INDEX_KEY);
        if (legacySaved) {
          try {
            migratedSnapshot = {
              savedSegments: (JSON.parse(legacySaved) as SavedSegment[]).map(normalizeSavedSegment),
              lastCutoutIndex: legacyIndex ? parseInt(legacyIndex, 10) : 1,
            };
          } catch (error) {
            console.error('Failed to parse saved segments', error);
            migratedSnapshot = restoreLegacyBackup();
          }
        } else {
          migratedSnapshot = restoreLegacyBackup();
        }
      }

      if (migratedSnapshot) {
        applySnapshot(migratedSnapshot);

        try {
          await setIndexedDbRecord(LIBRARY_STATE_KEY, {
            version: 1,
            exportedAt: Date.now(),
            lastCutoutIndex: migratedSnapshot.lastCutoutIndex ?? 1,
            savedSegments: (migratedSnapshot.savedSegments ?? []).map(normalizeSavedSegment),
          } satisfies AssetLibraryFile);
          await setIndexedDbRecord(LIBRARY_BACKUPS_KEY, [{
            payload: JSON.stringify({
              version: 1,
              lastCutoutIndex: migratedSnapshot.lastCutoutIndex ?? 1,
              savedSegments: (migratedSnapshot.savedSegments ?? []).map(normalizeSavedSegment),
            }),
            savedAt: Date.now(),
          }]);
        } catch (error) {
          console.error('Failed to migrate legacy library state into IndexedDB', error);
        }
      }
    };

    void loadLibraryState().finally(() => {
      if (!cancelled) {
        setIsLibraryHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Update in-memory cutouts; IndexedDB persistence is handled by the autosave effect below.
  const updateSavedSegments = (newSegments: SavedSegment[]) => {
    setSavedSegments(newSegments);
  };

  const updateCutoutIndex = (newIndex: number) => {
    setLastCutoutIndex(newIndex);
  };

  useEffect(() => {
    if (!isLibraryHydrated) {
      return;
    }

    const normalizedSegments = savedSegments.map(normalizeSavedSegment);
    const snapshotForStorage: AssetLibraryFile = {
      version: 1,
      exportedAt: Date.now(),
      lastCutoutIndex,
      savedSegments: normalizedSegments,
    };
    const snapshotPayload = JSON.stringify({
      version: 1,
      lastCutoutIndex,
      savedSegments: normalizedSegments,
    });

    void (async () => {
      try {
        await setIndexedDbRecord(LIBRARY_STATE_KEY, snapshotForStorage);

        const existingBackups = await getIndexedDbRecord<Array<{ payload: string; savedAt: number }>>(LIBRARY_BACKUPS_KEY) ?? [];
        if (existingBackups[0]?.payload !== snapshotPayload) {
          const nextBackups = [
            { payload: snapshotPayload, savedAt: Date.now() },
            ...existingBackups,
          ].slice(0, MAX_LIBRARY_BACKUPS);
          await setIndexedDbRecord(LIBRARY_BACKUPS_KEY, nextBackups);
        }
      } catch (error) {
        console.error('Failed to persist library snapshot into IndexedDB', error);
      }
    })();
  }, [isLibraryHydrated, lastCutoutIndex, savedSegments]);

  const createUniqueSegmentName = useCallback((baseName: string) => {
    const hasPngExtension = baseName.toLowerCase().endsWith('.png');
    const bareName = hasPngExtension ? baseName.slice(0, -4) : baseName;
    let candidateName = `${bareName}_cleaned.png`;
    let suffix = 2;

    const existingNames = new Set(savedSegments.map((segment) => segment.name.toLowerCase()));
    while (existingNames.has(candidateName.toLowerCase())) {
      candidateName = `${bareName}_cleaned_${suffix}.png`;
      suffix += 1;
    }

    return candidateName;
  }, [savedSegments]);

  const createCleanedSegment = useCallback((sourceSegment: SavedSegment, updatedUrl: string) => {
    const timestamp = Date.now();
    const newSegment: SavedSegment = {
      ...sourceSegment,
      id: `seg_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
      name: createUniqueSegmentName(sourceSegment.name),
      thumbnailUrl: updatedUrl,
      createdAt: timestamp,
      backgroundRemovedAt: timestamp,
      cleanupProcessedAt: timestamp,
      derivedFromSegmentId: sourceSegment.id,
      tags: [...(sourceSegment.tags ?? [])],
    };

    updateSavedSegments([
      newSegment,
      ...savedSegments.map((segment) => (
        segment.id === sourceSegment.id && !segment.backgroundRemovedAt
          ? { ...segment, cleanupProcessedAt: timestamp }
          : segment
      )),
    ]);
    return newSegment;
  }, [createUniqueSegmentName, savedSegments]);

  // Keep ants marching
  useEffect(() => {
    let frameId: number;
    const tick = () => {
      setAntsOffset((prev) => (prev + 0.4) % 20);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, []);

  // Helper to get image coordinates from client mouse event
  const getImgCoords = useCallback(
    (clientX: number, clientY: number, canvas: HTMLCanvasElement): Point => {
      const rect = canvas.getBoundingClientRect();
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      return {
        x: (screenX - offset.x) / zoom,
        y: (screenY - offset.y) / zoom,
      };
    },
    [offset, zoom]
  );

  const getVisibleImageBounds = useCallback((): RectBounds | null => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return null;

    const visibleLeft = Math.max(0, (-offset.x) / zoom);
    const visibleTop = Math.max(0, (-offset.y) / zoom);
    const visibleRight = Math.min(image.width, (canvas.width - offset.x) / zoom);
    const visibleBottom = Math.min(image.height, (canvas.height - offset.y) / zoom);

    if (visibleRight <= visibleLeft || visibleBottom <= visibleTop) {
      return null;
    }

    return {
      x: visibleLeft,
      y: visibleTop,
      width: visibleRight - visibleLeft,
      height: visibleBottom - visibleTop,
    };
  }, [image, offset, zoom]);

  const intersectsBounds = useCallback((a: RectBounds, b: RectBounds) => {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }, []);

  useEffect(() => {
    if (!image) {
      hiddenImageCanvasRef.current = null;
      hiddenImageCtxRef.current = null;
      return;
    }

    const hiddenCanvas = document.createElement('canvas');
    hiddenCanvas.width = image.width;
    hiddenCanvas.height = image.height;
    const hiddenCtx = hiddenCanvas.getContext('2d');

    if (!hiddenCtx) {
      hiddenImageCanvasRef.current = null;
      hiddenImageCtxRef.current = null;
      return;
    }

    hiddenCtx.drawImage(image, 0, 0);
    hiddenImageCanvasRef.current = hiddenCanvas;
    hiddenImageCtxRef.current = hiddenCtx;
  }, [image]);

  const getRectGuideCandidates = useCallback((): { x: GuideCandidate[]; y: GuideCandidate[] } => {
    if (!image) {
      return { x: [], y: [] };
    }

    const visibleBounds = getVisibleImageBounds();
    const imageSpaceThreshold = snapRadius / zoom;
    const expandedVisibleBounds = visibleBounds
      ? {
          x: Math.max(0, visibleBounds.x - imageSpaceThreshold),
          y: Math.max(0, visibleBounds.y - imageSpaceThreshold),
          width: Math.min(image.width, visibleBounds.x + visibleBounds.width + imageSpaceThreshold) - Math.max(0, visibleBounds.x - imageSpaceThreshold),
          height: Math.min(image.height, visibleBounds.y + visibleBounds.height + imageSpaceThreshold) - Math.max(0, visibleBounds.y - imageSpaceThreshold),
        }
      : null;

    const xCandidates: GuideCandidate[] = [
      { value: 0, source: 'image left' },
      { value: image.width, source: 'image right' },
    ];
    const yCandidates: GuideCandidate[] = [
      { value: 0, source: 'image top' },
      { value: image.height, source: 'image bottom' },
    ];

    savedSegments.forEach((segment, index) => {
      if (expandedVisibleBounds && !intersectsBounds(segment.bounds, expandedVisibleBounds)) {
        return;
      }

      const label = segment.name || `segment ${index + 1}`;
      xCandidates.push(
        { value: segment.bounds.x, source: `${label} left` },
        { value: segment.bounds.x + segment.bounds.width, source: `${label} right` }
      );
      yCandidates.push(
        { value: segment.bounds.y, source: `${label} top` },
        { value: segment.bounds.y + segment.bounds.height, source: `${label} bottom` }
      );
    });

    return { x: xCandidates, y: yCandidates };
  }, [getVisibleImageBounds, image, intersectsBounds, savedSegments, snapRadius, zoom]);

  const getBestGuide = useCallback(
    (value: number, candidates: GuideCandidate[]): GuideCandidate | null => {
      let bestCandidate: GuideCandidate | null = null;
      let bestDistance = Infinity;

      candidates.forEach((candidate) => {
        const distance = Math.abs(candidate.value - value) * zoom;
        if (distance <= snapRadius && distance < bestDistance) {
          bestDistance = distance;
          bestCandidate = candidate;
        }
      });

      return bestCandidate;
    },
    [snapRadius, zoom]
  );

  const getRectSnapPreview = useCallback(
    (cursor: Point): RectSnapPreview | null => {
      if (!image) return null;

      const { x, y } = getRectGuideCandidates();
      const visibleBounds = getVisibleImageBounds();
      const imageSpaceRadius = Math.max(6, (snapRadius / zoom) * 2);
      const axisGuides = hiddenImageCtxRef.current
        ? findAxisSnapGuides(
            hiddenImageCtxRef.current,
            cursor,
            imageSpaceRadius,
            image.width,
            image.height,
            visibleBounds ?? undefined
          )
        : { x: null, y: null };

      if (axisGuides.x !== null) {
        x.push({ value: axisGuides.x, source: 'visible vertical edge' });
      }
      if (axisGuides.y !== null) {
        y.push({ value: axisGuides.y, source: 'visible horizontal edge' });
      }

      const guideX = getBestGuide(cursor.x, x);
      const guideY = getBestGuide(cursor.y, y);

      if (!guideX || !guideY) {
        return null;
      }

      return {
        point: {
          x: guideX.value,
          y: guideY.value,
        },
        guideX,
        guideY,
      };
    },
    [getBestGuide, getRectGuideCandidates, getVisibleImageBounds, image, snapRadius, zoom]
  );

  const getMagneticSnapPoint = useCallback(
    (cursor: Point): Point => {
      if (!image || !hiddenImageCtxRef.current) {
        return cursor;
      }

      const visibleBounds = getVisibleImageBounds();
      const imageSpaceRadius = Math.max(3, snapRadius / zoom);

      return findSnappedPoint(
        hiddenImageCtxRef.current,
        cursor,
        imageSpaceRadius,
        image.width,
        image.height,
        visibleBounds ?? undefined
      );
    },
    [getVisibleImageBounds, image, snapRadius, zoom]
  );

  // Load an image safely (supporting CORS for presets)
  const loadImage = (
    url: string,
    name: string,
    fallbackUrl?: string,
    finalErrorMessage = 'Failed to load image. If this is a cross-origin image, it might be restricted by CORS. Try uploading a local image!'
  ) => {
    setIsLoading(true);
    setErrorMsg(null);
    setActivePath([]);
    setIsClosed(false);
    setRectStart(null);
    setRectEnd(null);
    setRectSnapPreview(null);
    setHoverPoint(null);

    const img = new Image();
    img.crossOrigin = 'anonymous'; // CRITICAL: prevents canvas tainting
    img.onload = () => {
      setImage(img);
      setImageName(name);
      setIsLoading(false);

      // Fit image to screen initially
      if (containerRef.current) {
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        const scale = Math.min((cw - 60) / img.width, (ch - 60) / img.height, 1.5);
        setZoom(scale);
        setOffset({
          x: (cw - img.width * scale) / 2,
          y: (ch - img.height * scale) / 2,
        });
      }
    };
    img.onerror = () => {
      if (fallbackUrl) {
        console.warn(`Primary image failed to load, trying fallback: ${fallbackUrl}`);
        loadImage(fallbackUrl, name, undefined, finalErrorMessage);
      } else {
        setIsLoading(false);
        setErrorMsg(finalErrorMessage);
      }
    };
    img.src = url;
  };

  // Set default draft name whenever a new selection is made
  useEffect(() => {
    if (activePath.length > 0) {
      const toolLabel = activeTool === 'rectangle' ? 'rect' : activeTool;
      setCutoutDraftName(`cutout_${toolLabel}_${lastCutoutIndex}`);
    } else {
      setCutoutDraftName('');
    }
  }, [activePath, activeTool, lastCutoutIndex]);

  // Handle local file uploads
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          loadImage(event.target.result as string, file.name);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Auto-close loop or manual key operations
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Space for panning
      if (e.key === ' ' && !isPanning) {
        // Space acts as a shortcut
      }
      // Shortcut keys
      if (document.activeElement?.tagName !== 'INPUT') {
        if (e.key.toLowerCase() === 'v') setActiveTool('select');
        if (e.key.toLowerCase() === 'r') setActiveTool('rectangle');
        if (e.key.toLowerCase() === 'l') setActiveTool('lasso');
        if (e.key.toLowerCase() === 'm') setActiveTool('magnetic');
        if (e.key === 'Escape') {
          setActivePath([]);
          setIsClosed(false);
          setRectStart(null);
          setRectEnd(null);
          setRectSnapPreview(null);
        }
        // Undo last magnetic lasso point
        if ((e.key === 'Backspace' || e.key === 'Delete') && activeTool === 'magnetic' && activePath.length > 0) {
          setActivePath((prev) => prev.slice(0, -1));
          setIsClosed(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, activePath, isPanning]);

  // Draw the entire interactive workspace
  const drawWorkspace = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Reset size to fill the wrapper client dimensions
    const cw = canvas.parentElement?.clientWidth || 800;
    const ch = canvas.parentElement?.clientHeight || 600;
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }

    ctx.clearRect(0, 0, cw, ch);

    // 1. Draw Workspace Grid Background
    ctx.save();
    ctx.fillStyle = '#0f172a'; // slate-900 background
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();

    // 2. Draw Image and Selection elements under Zoom/Pan matrix
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // Draw solid shadow under the image bounds
    ctx.fillStyle = '#020617'; // slate-950
    ctx.fillRect(-4 / zoom, -4 / zoom, image.width + 8 / zoom, image.height + 8 / zoom);

    // Render image
    ctx.drawImage(image, 0, 0);

    // Define temporary mask canvas if selection active
    if (activePath.length > 1) {
      ctx.save();
      // Overlay spotlight mask (dims the background outside the selection)
      ctx.fillStyle = 'rgba(2, 6, 23, 0.65)'; // transparent dark
      ctx.beginPath();
      ctx.rect(0, 0, image.width, image.height);

      // Draw active path reversed to carve out selection (evenodd rule)
      ctx.moveTo(activePath[0].x, activePath[0].y);
      for (let i = 1; i < activePath.length; i++) {
        ctx.lineTo(activePath[i].x, activePath[i].y);
      }
      ctx.closePath();
      ctx.fill('evenodd');
      ctx.restore();
    }

    // Draw completed selections marching ants outline
    if (activePath.length > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(activePath[0].x, activePath[0].y);
      for (let i = 1; i < activePath.length; i++) {
        ctx.lineTo(activePath[i].x, activePath[i].y);
      }
      ctx.closePath();

      // Marching ants: Double layer stroke (white underlying, black overlaying dashed)
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.lineDashOffset = -antsOffset / zoom;
      ctx.stroke();

      ctx.strokeStyle = '#3b82f6'; // beautiful blue dash offset
      ctx.lineDashOffset = (-antsOffset + 4) / zoom;
      ctx.stroke();
      ctx.restore();
    }

    // Draw active drawing guides for Rectangle selection
    if (activeTool === 'rectangle' && rectStart && rectEnd) {
      ctx.save();
      const rx = Math.min(rectStart.x, rectEnd.x);
      const ry = Math.min(rectStart.y, rectEnd.y);
      const rw = Math.abs(rectStart.x - rectEnd.x);
      const rh = Math.abs(rectStart.y - rectEnd.y);

      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';
      ctx.fillRect(rx, ry, rw, rh);

      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([4 / zoom, 4 / zoom]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.restore();
    }

    if (activeTool === 'rectangle' && rectSnapPreview) {
      ctx.save();
      ctx.setLineDash([6 / zoom, 6 / zoom]);
      ctx.lineWidth = 1.5 / zoom;

      ctx.strokeStyle = 'rgba(45, 212, 191, 0.95)';
      ctx.beginPath();
      ctx.moveTo(rectSnapPreview.guideX.value, 0);
      ctx.lineTo(rectSnapPreview.guideX.value, image.height);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)';
      ctx.beginPath();
      ctx.moveTo(0, rectSnapPreview.guideY.value);
      ctx.lineTo(image.width, rectSnapPreview.guideY.value);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(rectSnapPreview.point.x, rectSnapPreview.point.y, 5 / zoom, 0, Math.PI * 2);
      ctx.fillStyle = '#f97316';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5 / zoom;
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Draw Magnetic Lasso anchor dots and connecting guides
    if (activeTool === 'magnetic' && activePath.length > 0) {
      ctx.save();
      // Draw path segments so far
      ctx.beginPath();
      ctx.moveTo(activePath[0].x, activePath[0].y);
      for (let i = 1; i < activePath.length; i++) {
        ctx.lineTo(activePath[i].x, activePath[i].y);
      }

      // Live dynamic line from last anchor to current hover snapped point
      if (hoverPoint && !isDrawing && !isClosed) {
        ctx.lineTo(hoverPoint.x, hoverPoint.y);
      }

      if (isClosed) {
        ctx.closePath();
      }

      ctx.strokeStyle = isClosed ? '#3b82f6' : '#10b981'; // blue when closed, vibrant emerald when active
      ctx.lineWidth = 2 / zoom;
      ctx.stroke();

      // Draw anchor points
      const isOverStartNode = activePath.length > 2 && hoverPoint &&
        Math.abs(hoverPoint.x - activePath[0].x) < 0.001 &&
        Math.abs(hoverPoint.y - activePath[0].y) < 0.001;

      activePath.forEach((pt, idx) => {
        ctx.beginPath();
        // Make first node physically larger and clearer to hit when hovered
        const radius = (idx === 0 ? (isOverStartNode && !isClosed ? 8 : 6) : 3.5) / zoom;
        ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = idx === 0 ? (isClosed ? '#3b82f6' : (isOverStartNode ? '#f43f5e' : '#ef4444')) : '#60a5fa';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = (idx === 0 && isOverStartNode && !isClosed ? 2 : 1) / zoom;
        ctx.fill();
        ctx.stroke();
      });

      ctx.restore();
    }

    ctx.restore(); // Restore Zoom/Pan transformations

    // 3. Render floating selection indicators (non-zoomed overlays)
    if (activeTool === 'magnetic' && hoverPoint) {
      // Draw snapping target ring under the cursor
      const screenX = hoverPoint.x * zoom + offset.x;
      const screenY = hoverPoint.y * zoom + offset.y;

      const isOverStartNode = activePath.length > 2 &&
        Math.abs(hoverPoint.x - activePath[0].x) < 0.001 &&
        Math.abs(hoverPoint.y - activePath[0].y) < 0.001;

      ctx.save();
      if (isOverStartNode && !isClosed) {
        // High-contrast easy close-loop target indicator
        ctx.beginPath();
        ctx.arc(screenX, screenY, 16, 0, Math.PI * 2);
        ctx.strokeStyle = '#ef4444';
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.lineWidth = 2.5;
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(screenX, screenY, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();

        // Overlay text warning that we are snapping to complete the loop!
        ctx.fillStyle = '#f43f5e';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 3;
        ctx.fillText('Click to Close Loop', screenX, screenY - 20);
      } else {
        // Circular snapping pull boundary
        ctx.beginPath();
        ctx.arc(screenX, screenY, snapRadius * zoom, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.fillStyle = 'rgba(16, 185, 129, 0.04)';
        ctx.lineWidth = 1;
        ctx.fill();
        ctx.stroke();

        // Precision Snapping point dot
        ctx.beginPath();
        ctx.arc(screenX, screenY, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#10b981';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    if (activeTool === 'rectangle' && rectSnapPreview) {
      const screenX = rectSnapPreview.point.x * zoom + offset.x;
      const screenY = rectSnapPreview.point.y * zoom + offset.y;
      const label = 'Corner snap target';

      ctx.save();
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#f8fafc';
      ctx.shadowColor = 'rgba(2, 6, 23, 0.95)';
      ctx.shadowBlur = 5;
      ctx.fillText(label, screenX, screenY - 14);
      ctx.restore();
    }
  }, [image, offset, zoom, activePath, activeTool, rectStart, rectEnd, rectSnapPreview, hoverPoint, antsOffset, snapRadius]);

  // Redraw when elements update
  useEffect(() => {
    drawWorkspace();
  }, [drawWorkspace]);

  // Window resize observer to update canvas dimensions dynamically
  useEffect(() => {
    const handleResize = () => drawWorkspace();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawWorkspace]);

  // Triggered when clicking "Save selection"
  const handleSaveSegment = () => {
    if (!image || activePath.length < 2) return;

    const bounds = getPathBounds(activePath, image.width, image.height);
    if (bounds.width <= 0 || bounds.height <= 0) return;

    // Create a crop on a separate canvas
    const dataUrl = createSegmentImage(image, activePath, bounds, feather);

    const name = cutoutDraftName.trim()
      ? (cutoutDraftName.endsWith('.png') ? cutoutDraftName : `${cutoutDraftName}.png`)
      : `cutout_${Date.now()}.png`;

    const newSegment: SavedSegment = {
      id: `seg_${Date.now()}`,
      name,
      path: [...activePath],
      type: activeTool === 'rectangle' ? 'rectangle' : activeTool === 'magnetic' ? 'magnetic' : 'lasso',
      bounds,
      feather,
      thumbnailUrl: dataUrl,
      createdAt: Date.now(),
      backgroundRemovedAt: undefined,
      cleanupProcessedAt: undefined,
      tags: [],
    };

    updateSavedSegments([newSegment, ...savedSegments]);
    updateCutoutIndex(lastCutoutIndex + 1);
    setIsSidebarOpen(true);

    // Highlight action success by flashing
    setActivePath([]);
    setRectStart(null);
    setRectEnd(null);
    setRectSnapPreview(null);
  };

  // Canvas interaction mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const clientX = e.clientX;
    const clientY = e.clientY;
    const imgPt = getImgCoords(clientX, clientY, canvas);

    // Pan with space or middle mouse or Select Tool
    if (activeTool === 'select' || e.button === 1) {
      setRectSnapPreview(null);
      setIsPanning(true);
      setPanStart({ x: clientX - offset.x, y: clientY - offset.y });
      return;
    }

    // Prevent interaction outside boundary
    if (imgPt.x < 0 || imgPt.x > image.width || imgPt.y < 0 || imgPt.y > image.height) {
      return;
    }

    if (activeTool === 'rectangle') {
      const snappedPoint = rectSnapPreview?.point ?? imgPt;
      setRectStart(snappedPoint);
      setRectEnd(snappedPoint);
      setRectSnapPreview(getRectSnapPreview(snappedPoint));
      setActivePath([]);
      setIsClosed(false);
    } else if (activeTool === 'lasso') {
      setRectSnapPreview(null);
      setIsDrawing(true);
      setActivePath([imgPt]);
      setIsClosed(false);
    } else if (activeTool === 'magnetic') {
      setRectSnapPreview(null);
      const snapped = getMagneticSnapPoint(imgPt);

      // If the path was already closed, start a fresh selection
      if (isClosed) {
        setIsClosed(false);
        setActivePath([snapped]);
        return;
      }

      // Check if close to start point to close path - scaled by zoom for perfect screen-space accuracy (32px radius)
      if (activePath.length > 2) {
        const distToStart = Math.sqrt(
          Math.pow(snapped.x - activePath[0].x, 2) + Math.pow(snapped.y - activePath[0].y, 2)
        );

        if (distToStart * zoom < 32) {
          // Close path
          setIsClosed(true);
          return;
        }
      }

      // Add to anchor nodes
      setActivePath((prev) => [...prev, snapped]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    const clientX = e.clientX;
    const clientY = e.clientY;

    if (isPanning) {
      setOffset({
        x: clientX - panStart.x,
        y: clientY - panStart.y,
      });
      return;
    }

    const imgPt = getImgCoords(clientX, clientY, canvas);
    const clampedImgPt = image
      ? {
          x: Math.max(0, Math.min(image.width, imgPt.x)),
          y: Math.max(0, Math.min(image.height, imgPt.y)),
        }
      : imgPt;

    if (activeTool === 'rectangle') {
      const snappedPreview = getRectSnapPreview(clampedImgPt);
      setRectSnapPreview(snappedPreview);
      if (rectStart) {
        setRectEnd(snappedPreview?.point ?? clampedImgPt);
      }
    } else if (activeTool === 'lasso' && isDrawing) {
      setRectSnapPreview(null);
      // Append if moved a little
      setActivePath((prev) => [...prev, imgPt]);
    } else if (activeTool === 'magnetic') {
      setRectSnapPreview(null);
      if (isClosed) {
        setHoverPoint(null);
        return;
      }

      const snapped = getMagneticSnapPoint(imgPt);

      // If close to the start point, snap the hover preview directly onto the start node (32px screen-space radius)
      if (activePath.length > 2) {
        const distToStart = Math.sqrt(
          Math.pow(snapped.x - activePath[0].x, 2) + Math.pow(snapped.y - activePath[0].y, 2)
        );
        if (distToStart * zoom < 32) {
          setHoverPoint(activePath[0]);
          return;
        }
      }
      setHoverPoint(snapped);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (activeTool === 'rectangle' && rectStart && rectEnd) {
      const minX = Math.min(rectStart.x, rectEnd.x);
      const maxX = Math.max(rectStart.x, rectEnd.x);
      const minY = Math.min(rectStart.y, rectEnd.y);
      const maxY = Math.max(rectStart.y, rectEnd.y);

      // Verify some threshold area
      if (Math.abs(maxX - minX) > 2 && Math.abs(maxY - minY) > 2) {
        setActivePath([
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ]);
        setIsClosed(true);
      }
      setRectStart(null);
      setRectEnd(null);
      setRectSnapPreview(null);
    } else if (activeTool === 'lasso' && isDrawing) {
      setIsDrawing(false);
      if (activePath.length > 2) {
        setIsClosed(true);
      } else {
        setActivePath([]);
        setIsClosed(false);
      }
    }
  };

  const handleMouseLeave = () => {
    if (!rectStart) {
      setRectSnapPreview(null);
    }

    if (activeTool === 'magnetic') {
      setHoverPoint(null);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    e.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;

    const worldX = (pointerX - offset.x) / zoom;
    const worldY = (pointerY - offset.y) / zoom;

    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newZoom = Math.max(0.1, Math.min(zoom * zoomFactor, 8));

    setZoom(newZoom);
    setOffset({
      x: pointerX - worldX * newZoom,
      y: pointerY - worldY * newZoom,
    });
  };

  // Zoom helpers
  const handleZoomIn = () => setZoom((prev) => Math.min(prev * 1.25, 8));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev * 0.8, 0.1));
  const handleZoomFit = () => {
    if (!image || !containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const scale = Math.min((cw - 60) / image.width, (ch - 60) / image.height, 1.5);
    setZoom(scale);
    setOffset({
      x: (cw - image.width * scale) / 2,
      y: (ch - image.height * scale) / 2,
    });
  };
  const handleZoom100 = () => {
    if (!image || !containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    setZoom(1);
    setOffset({
      x: (cw - image.width) / 2,
      y: (ch - image.height) / 2,
    });
  };

  // Magnetic double-click or enter to close loop
  const handleDoubleClick = () => {
    if (activeTool === 'magnetic' && activePath.length > 2) {
      // Close selection
      setIsClosed(true);
    }
  };

  // Touch handlers for mobile/tablet canvas interaction
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      isMultiTouchingRef.current = true;
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStartDistRef.current = dist;
      
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      touchStartMidpointRef.current = { x: midX, y: midY };
      
      touchStartZoomRef.current = zoom;
      touchStartOffsetRef.current = { ...offset };
    } else if (e.touches.length === 1 && !isMultiTouchingRef.current) {
      const touch = e.touches[0];
      if (activeTool !== 'select') {
        e.preventDefault();
      }
      handleMouseDown({
        clientX: touch.clientX,
        clientY: touch.clientY,
        button: 0,
        preventDefault: () => {},
      } as any);
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && isMultiTouchingRef.current) {
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const newDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const newMidX = (t1.clientX + t2.clientX) / 2;
      const newMidY = (t1.clientY + t2.clientY) / 2;
      
      if (touchStartDistRef.current && touchStartDistRef.current > 0) {
        const ratio = newDist / touchStartDistRef.current;
        const newZoom = Math.max(0.1, Math.min(touchStartZoomRef.current * ratio, 8));
        
        const dx = newMidX - touchStartMidpointRef.current.x;
        const dy = newMidY - touchStartMidpointRef.current.y;
        
        const px = touchStartMidpointRef.current.x;
        const py = touchStartMidpointRef.current.y;
        
        const newOffsetX = px - (px - touchStartOffsetRef.current.x) * (newZoom / touchStartZoomRef.current) + dx;
        const newOffsetY = py - (py - touchStartOffsetRef.current.y) * (newZoom / touchStartZoomRef.current) + dy;
        
        setZoom(newZoom);
        setOffset({ x: newOffsetX, y: newOffsetY });
      }
    } else if (e.touches.length === 1 && !isMultiTouchingRef.current) {
      const touch = e.touches[0];
      if (activeTool !== 'select') {
        e.preventDefault();
      }
      handleMouseMove({
        clientX: touch.clientX,
        clientY: touch.clientY,
        preventDefault: () => {},
      } as any);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length < 2) {
      isMultiTouchingRef.current = false;
      touchStartDistRef.current = null;
    }
    if (activeTool !== 'select') {
      e.preventDefault();
    }
    handleMouseUp({} as any);
  };

  // Saved Segments handlers
  const handleDeleteSegment = (id: string) => {
    updateSavedSegments(savedSegments.filter((s) => s.id !== id));
  };

  const handleRenameSegment = (id: string, newName: string) => {
    updateSavedSegments(
      savedSegments.map((s) => (s.id === id ? { ...s, name: newName } : s))
    );
  };

  const handleUpdateSegmentTags = (id: string, tags: string[]) => {
    const normalizedTags = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
    updateSavedSegments(
      savedSegments.map((segment) => (
        segment.id === id
          ? { ...segment, tags: normalizedTags }
          : segment
      ))
    );
  };

  const handleExportLibrary = () => {
    const libraryFile: AssetLibraryFile = {
      version: 1,
      exportedAt: Date.now(),
      lastCutoutIndex,
      savedSegments: savedSegments.map(normalizeSavedSegment),
    };
    const blob = new Blob([JSON.stringify(libraryFile, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `assetmaster-library-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportLibraryRequest = () => {
    libraryImportInputRef.current?.click();
  };

  const handleImportLibraryFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<AssetLibraryFile>;
      const importedSegments = Array.isArray(parsed.savedSegments)
        ? parsed.savedSegments.map(normalizeSavedSegment)
        : [];

      if (!window.confirm(`Replace the current saved cutout library with ${importedSegments.length} imported items?`)) {
        return;
      }

      setSavedSegments(importedSegments);
      setLastCutoutIndex(parsed.lastCutoutIndex ?? Math.max(1, importedSegments.length + 1));
      setPreviewSegment(null);
    } catch (error) {
      console.error('Failed to import library file', error);
      window.alert('The selected library file could not be loaded.');
    } finally {
      event.target.value = '';
    }
  };

  const handleRestoreLibraryBackup = () => {
    void (async () => {
      try {
        const backups = await getIndexedDbRecord<Array<{ payload: string; savedAt: number }>>(LIBRARY_BACKUPS_KEY);
        const latestBackup = backups?.[0];
        if (!latestBackup?.payload) {
          window.alert('No library backup is available yet.');
          return;
        }

        const parsedBackup = JSON.parse(latestBackup.payload) as Pick<AssetLibraryFile, 'savedSegments' | 'lastCutoutIndex'>;
        if (!window.confirm(`Restore the latest backup from ${new Date(latestBackup.savedAt).toLocaleString()}?`)) {
          return;
        }

        setSavedSegments((parsedBackup.savedSegments ?? []).map(normalizeSavedSegment));
        setLastCutoutIndex(parsedBackup.lastCutoutIndex ?? 1);
        setPreviewSegment(null);
      } catch (error) {
        console.error('Failed to restore latest library backup', error);
        window.alert('The latest backup could not be restored.');
      }
    })();
  };

  const handleClearAllSegments = () => {
    if (window.confirm('Are you sure you want to delete all saved selections?')) {
      updateSavedSegments([]);
      updateCutoutIndex(1);
    }
  };

  // Load selection path again back to active selection
  const handleSelectSavedSegment = (segment: SavedSegment) => {
    setPreviewSegment(segment);
  };

  const handleSaveCleanedSegment = (sourceSegment: SavedSegment, updatedUrl: string) => {
    const newSegment = createCleanedSegment(sourceSegment, updatedUrl);
    setPreviewSegment(newSegment);
    setShowBgRemover(false);
    return newSegment;
  };

  const handleSavePreviewSegmentCleanup = (updatedUrl: string) => {
    if (!previewSegment) {
      return;
    }

    handleSaveCleanedSegment(previewSegment, updatedUrl);
  };

  return (
    <div id="app-root" className="h-[100dvh] w-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-none antialiased">
      {/* 1. Header Navigation Bar */}
      <header id="main-header" className="min-h-16 border-b border-slate-800 bg-slate-950 flex items-center justify-between gap-3 px-3 py-2 md:px-6 z-10 shrink-0">
        <div className="flex items-center space-x-3 shrink min-w-0">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/10">
            <Scissors className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm md:text-base tracking-tight bg-gradient-to-r from-blue-100 to-indigo-100 bg-clip-text text-transparent">
              LassoCut
            </h1>
            <p className="hidden sm:block text-[10px] text-slate-400 font-medium">Smart Transparent Image Cutter</p>
            {image && (
              <p className="md:hidden text-[10px] text-slate-500 font-mono truncate">
                {image.width} x {image.height}px
              </p>
            )}
          </div>
        </div>

        {/* Dynamic toolbar info */}
        <div className="hidden md:flex items-center space-x-6">
          {image && (
            <div className="text-xs bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 flex items-center space-x-3 text-slate-300 font-mono">
              <span className="truncate max-w-[120px]" title={imageName}>{imageName}</span>
              <span className="text-slate-600">|</span>
              <span>{image.width} × {image.height} px</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 flex-wrap">
          {/* Preset Selector */}
          <div className="relative hidden sm:block">
            <select
              onChange={(e) => {
                const sample = SAMPLE_IMAGES.find((s) => s.id === e.target.value);
                if (sample) {
                  loadImage(
                    sample.url,
                    `${sample.id}.jpg`,
                    sample.fallbackUrl,
                    `The "${sample.name}" sample could not be loaded from its remote source. Try another sample or upload a local image.`
                  );
                }
              }}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-xs text-slate-300 px-2 md:px-3 py-2 cursor-pointer outline-none transition-all max-w-[110px] sm:max-w-[160px]"
              defaultValue=""
            >
              <option value="" disabled>Select Preset Image...</option>
              {SAMPLE_IMAGES.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  Sample: {sample.name}
                </option>
              ))}
            </select>
          </div>

          {/* Open Collage Studio button */}
          <button
            onClick={() => setShowCollageStudio(true)}
            className="flex items-center space-x-1 md:space-x-1.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer shadow-md shadow-orange-500/10 active:scale-[0.98] transition-all"
            title="Arrange saved cutouts into exportable collage layouts"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Collage Studio</span>
            <span className="sm:hidden">Collage</span>
          </button>

          {/* Create Animation button */}
          <button
            onClick={() => setShowAnimationStudio(true)}
            className="flex items-center space-x-1 md:space-x-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer shadow-md shadow-indigo-500/10 active:scale-[0.98] transition-all"
            title="Create animations from saved cutout frames"
          >
            <Layers className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Animation Studio</span>
            <span className="sm:hidden">Studio</span>
          </button>

          {/* Local Upload */}
          <label className="flex items-center space-x-1 md:space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer shadow-md shadow-blue-500/10 active:scale-[0.98] transition-all">
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Upload Image</span>
            <span className="sm:hidden">Upload</span>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          <a
            href="https://buymeacoffee.com/ahmadfuzal"
            target="_blank"
            rel="noreferrer"
            className="hidden md:block shrink-0 rounded-lg overflow-hidden hover:opacity-90 transition-opacity"
            title="Support on Buy Me a Coffee"
            aria-label="Support on Buy Me a Coffee"
          >
            <img src={bmcButton} alt="Buy Me a Coffee" className="h-8 w-auto block" />
          </a>

          {/* Mobile settings toggle */}
          <button
            onClick={() => {
              setMobileSidebarTab('cuts');
              setIsSidebarOpen(!isSidebarOpen);
            }}
            aria-label="Open settings and saved cuts"
            className={`md:hidden p-2 rounded-lg border transition-all cursor-pointer relative ${
              isSidebarOpen
                ? 'bg-blue-900/20 border-blue-800 text-blue-400'
                : 'bg-slate-900 border-slate-800 text-slate-400'
            }`}
            title="Toggle Settings & Cuts"
          >
            <Eye className="h-4 w-4" />
            {savedSegments.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-[9px] font-bold h-4 w-4 rounded-full flex items-center justify-center border border-slate-950">
                {savedSegments.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* 2. Main Workstation Area */}
      <main id="main-workstation" className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden relative">
        {/* 2.1 Left Tool Shelf */}
        <aside
          id="left-tools"
          className={`border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950 flex shrink-0 overflow-hidden transition-all duration-200 ${
            isMobileViewport
              ? 'w-full flex-row items-center px-3 py-1 gap-2 h-14'
              : isLeftToolbarCollapsed
                ? 'w-7 flex-col items-center py-4 px-0.5'
                : 'w-16 flex-col items-center py-4 px-0'
          }`}
        >
          <button
            onClick={() => setIsLeftToolbarCollapsed((prev) => !prev)}
            className={`w-10 h-10 border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 transition-all cursor-pointer flex items-center justify-center shrink-0 ${
              isMobileViewport
                ? 'rounded-xl'
                : isLeftToolbarCollapsed
                  ? 'md:w-5 md:h-16 rounded-md'
                  : 'md:w-11 md:h-11 rounded-xl'
            }`}
            title={isLeftToolbarCollapsed ? 'Expand selection tools' : 'Collapse selection tools'}
          >
            {isMobileViewport ? (
              isLeftToolbarCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />
            ) : isLeftToolbarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>

          {!isLeftToolbarCollapsed && (
            <>
              <div className={`flex items-center justify-start gap-1 shrink-0 ${
                isMobileViewport
                  ? 'flex-row w-full max-w-md'
                  : 'flex-col md:space-y-2 w-full max-w-none md:px-2'
              }`}>
                {[
                  { id: 'magnetic', icon: Sparkles, label: 'Magnetic Lasso (M)', desc: 'Snaps automatically to contrast boundaries.' },
                  { id: 'lasso', icon: Scissors, label: 'Freehand Lasso (L)', desc: 'Draw a custom selection area freely.' },
                  { id: 'rectangle', icon: Square, label: 'Rectangle (R)', desc: 'Drag a rectangular bounding crop.' },
                  { id: 'select', icon: MousePointer, label: 'Pan & Move (V)', desc: 'Pan or zoom without active drawing.' },
                ].map((tool) => {
                  const IconComp = tool.icon;
                  const isEnabled = hasLoadedImage;
                  const isSelected = hasLoadedImage && activeTool === tool.id;
                  return (
                    <button
                      key={tool.id}
                      disabled={!isEnabled}
                      onClick={() => {
                        if (!isEnabled) return;
                        setActiveTool(tool.id as SelectionTool);
                        setRectStart(null);
                        setRectEnd(null);
                        setRectSnapPreview(null);
                        setHoverPoint(null);
                      }}
                      className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center transition-all group relative shrink-0 ${
                        isSelected
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                          : isEnabled
                            ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-900 cursor-pointer'
                            : 'text-slate-700 bg-transparent cursor-not-allowed opacity-60'
                      }`}
                      title={isEnabled ? tool.label : `${tool.label} - load an image first`}
                    >
                      <IconComp className="h-4.5 w-4.5 md:h-5 md:w-5" />
                      <span className="absolute hidden md:block left-14 bg-slate-950 border border-slate-800 text-slate-200 text-[10px] py-1 px-2.5 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 font-sans">
                        <strong>{tool.label}</strong>: {isEnabled ? tool.desc : 'Load an image to enable this tool.'}
                      </span>
                    </button>
                  );
                })}
              </div>

              {!isMobileViewport && <div className="w-8 border-t border-slate-800 my-1" />}

              {activePath.length > 0 && (
                <button
                  onClick={() => {
                    setActivePath([]);
                    setRectStart(null);
                    setRectEnd(null);
                  }}
                  className="w-10 h-10 md:w-11 md:h-11 rounded-lg hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 text-slate-400 hover:text-rose-400 flex items-center justify-center transition-all cursor-pointer shrink-0"
                  title="Discard current selection (Esc)"
                >
                  <Trash2 className="h-4 w-4 md:h-4.5 md:w-4.5" />
                </button>
              )}

              {activeTool === 'magnetic' && activePath.length > 0 && (
                <button
                  onClick={() => setActivePath((prev) => prev.slice(0, -1))}
                  className="w-10 h-10 md:w-11 md:h-11 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-all cursor-pointer shrink-0"
                  title="Undo last point (Backspace)"
                >
                  <Undo className="h-4 w-4 md:h-4.5 md:w-4.5" />
                </button>
              )}
            </>
          )}
        </aside>

        {/* 2.2 Interactive Canvas Area */}
        <div id="canvas-workspace" ref={containerRef} className="flex-1 min-h-0 h-full relative overflow-hidden bg-slate-900">
          {isLoading && (
            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 space-y-3">
              <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-300 font-mono">Decoding image layers...</p>
            </div>
          )}

          {errorMsg && (
            <div className="absolute top-4 left-4 right-4 bg-rose-950/80 border border-rose-900 backdrop-blur text-rose-200 px-4 py-3 rounded-xl flex items-start space-x-3 z-20 text-xs shadow-lg">
              <AlertCircle className="h-4.5 w-4.5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Image Loading Failed</p>
                <p className="text-rose-300 mt-1">{errorMsg}</p>
              </div>
              <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200 p-1 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {!image && !isLoading && !errorMsg && (
            <div className="absolute inset-0 flex items-center justify-center z-10 p-6">
              <div className="max-w-md w-full rounded-3xl border border-slate-800 bg-slate-950/80 backdrop-blur-xl p-6 sm:p-8 text-center shadow-2xl space-y-4">
                <div className="mx-auto w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <ImageIcon className="h-7 w-7" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-slate-100">Start with an image</h2>
                  <p className="text-sm text-slate-400">
                    Upload a local image or pick one of the sample presets to begin cutting out assets.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-blue-300">Recommended</p>
                    <p className="mt-1 text-sm font-medium text-slate-200">Upload your own image</p>
                    <p className="mt-1 text-xs text-slate-500">Most reliable start, with no remote loading dependency.</p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-300">Optional</p>
                    <p className="mt-1 text-sm font-medium text-slate-200">Use a sample preset</p>
                    <p className="mt-1 text-xs text-slate-500">Good for testing tools quickly from the preset menu above.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Floating Mobile Save Banner */}
          {activePath.length > 1 && (
            <div className="absolute top-4 left-4 right-4 md:hidden bg-slate-950/95 border border-emerald-500/40 rounded-xl p-3 shadow-2xl flex items-center justify-between space-x-3 z-30">
              <div className="flex items-center space-x-2 min-w-0 flex-1">
                <div className="w-10 h-10 bg-checkerboard rounded-lg flex items-center justify-center border border-slate-800 shrink-0">
                  {image && (
                    <img
                      src={createSegmentImage(
                        image,
                        activePath,
                        getPathBounds(activePath, image.width, image.height),
                        feather
                      )}
                      alt="Preview"
                      className="max-w-[90%] max-h-[90%] object-contain"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] text-emerald-400 font-bold uppercase tracking-wider">Crop Complete</p>
                  <input
                    type="text"
                    value={cutoutDraftName}
                    onChange={(e) => setCutoutDraftName(e.target.value)}
                    placeholder="Cutout name..."
                    className="bg-transparent text-xs text-white outline-none font-semibold w-full truncate border-b border-slate-700 focus:border-blue-500 py-0.5"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveSegment}
                className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg px-3 py-2 text-xs font-bold shrink-0 shadow-md transition-all flex items-center space-x-1"
              >
                <Scissors className="h-3 w-3" />
                <span>Save</span>
              </button>
            </div>
          )}

          {/* Interactive HTML5 Canvas */}
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            onDoubleClick={handleDoubleClick}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className={`w-full h-full block ${
              activeTool === 'select' || isPanning
                ? 'cursor-grab active:cursor-grabbing'
                : activeTool === 'magnetic'
                ? 'cursor-crosshair'
                : 'cursor-cell'
            }`}
          />

          {/* Zoom & Navigation Footer Hud */}
          {image && (
            <div id="canvas-hud-footer" className="absolute bottom-4 left-4 right-4 sm:right-auto bg-slate-950/90 border border-slate-800/80 backdrop-blur px-3 py-1.5 rounded-xl flex items-center justify-between sm:justify-start gap-2 sm:gap-2.5 shadow-xl">
            <button
              onClick={handleZoomOut}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-xs font-mono font-bold text-slate-300 min-w-[45px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <div className="w-px h-4 bg-slate-800" />
            <button
              onClick={handleZoomFit}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer flex items-center space-x-1"
              title="Fit to Workspace"
            >
              <Maximize2 className="h-4 w-4" />
              <span className="text-[10px] font-medium hidden sm:inline">Fit</span>
            </button>
            <button
              onClick={handleZoom100}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 cursor-pointer flex items-center space-x-1"
              title="Zoom to 100%"
            >
              <Minimize2 className="h-4 w-4" />
              <span className="text-[10px] font-medium hidden sm:inline">1:1</span>
            </button>
            </div>
          )}

        </div>

        {/* Backdrop for mobile sidebar drawer */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-30 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* 2.3 Right Configuration Panel */}
        <aside
          id="right-sidebar"
          className={`fixed md:static top-0 right-0 h-full md:h-auto w-full sm:w-80 max-w-full sm:max-w-[85vw] border-l border-slate-800 bg-slate-950 flex flex-col shrink-0 z-40 shadow-2xl md:shadow-none transition-transform duration-300 md:transform-none ${
            isSidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
          }`}
        >
          {/* Mobile sidebar header */}
          <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950 shrink-0">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Settings & Saved Cuts</span>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
              aria-label="Close settings and saved cuts"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 md:hidden border-b border-slate-800 bg-slate-950 p-2 gap-2 shrink-0">
            <button
              onClick={() => setMobileSidebarTab('settings')}
              className={`min-h-11 rounded-xl text-xs font-semibold transition-all ${
                mobileSidebarTab === 'settings'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/15'
                  : 'bg-slate-900 text-slate-400 border border-slate-800'
              }`}
            >
              Selection
            </button>
            <button
              onClick={() => setMobileSidebarTab('cuts')}
              className={`min-h-11 rounded-xl text-xs font-semibold transition-all ${
                mobileSidebarTab === 'cuts'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/15'
                  : 'bg-slate-900 text-slate-400 border border-slate-800'
              }`}
            >
              Saved Cuts ({savedSegments.length})
            </button>
          </div>
          <div className={`${mobileSidebarTab === 'settings' ? 'flex' : 'hidden'} md:flex flex-1 md:flex-none min-h-0 flex-col overflow-y-auto md:overflow-visible`}>
          <div className="p-4 border-b border-slate-800 bg-slate-950/95 backdrop-blur shrink-0 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-xs tracking-wide uppercase text-slate-300">Primary Actions</h2>
                <p className="text-[10px] text-slate-500">
                  Save and navigation controls stay pinned here while details scroll below.
                </p>
              </div>
              {activePath.length > 1 && (
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full">
                  Crop Ready
                </span>
              )}
            </div>

            {activePath.length > 1 ? (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={cutoutDraftName}
                    onChange={(e) => setCutoutDraftName(e.target.value)}
                    placeholder="Enter segment name..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500 font-sans"
                  />
                  <span className="text-xs text-slate-500 font-mono">.png</span>
                </div>
                <button
                  id="clip-segment-btn"
                  onClick={handleSaveSegment}
                  className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-emerald-500/10 active:scale-[0.98] transition-all cursor-pointer"
                >
                  <Scissors className="h-4 w-4 animate-bounce-slow" />
                  <span>Clip & Save Segment</span>
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2.5 text-[11px] text-slate-500">
                Make a selection to unlock save controls here.
              </div>
            )}
          </div>
          {/* Active selection settings panel */}
          <div id="selection-settings-card" className="p-4 border-b border-slate-800 space-y-4 shrink-0">
            <h2 className="font-semibold text-xs tracking-wide uppercase text-slate-400">Selection Controls</h2>

            {/* Slider: Feather selection (Smoothing) */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-xs font-medium text-slate-300">Feather Outline (px)</label>
                <span className="text-xs font-mono font-bold text-blue-400">{feather}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="40"
                step="1"
                value={feather}
                onChange={(e) => setFeather(parseInt(e.target.value, 10))}
                className="w-full accent-blue-500 cursor-pointer"
              />
              <p className="text-[10px] text-slate-500">Blurs boundaries for a smooth, natural clipping blend.</p>
            </div>

            {/* Slider: Magnetic Snap Radius */}
            {(activeTool === 'magnetic' || activeTool === 'rectangle') && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-slate-300">
                    {activeTool === 'rectangle' ? 'Guide Snap Threshold (px)' : 'Snap Radius (px)'}
                  </label>
                  <span className="text-xs font-mono font-bold text-emerald-400">{snapRadius}px</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="40"
                  step="1"
                  value={snapRadius}
                  onChange={(e) => setSnapRadius(parseInt(e.target.value, 10))}
                  className="w-full accent-emerald-500 cursor-pointer"
                />
                <p className="text-[10px] text-slate-500">
                  {activeTool === 'rectangle'
                    ? 'How close the cursor must be before flush guides lock to nearby edges.'
                    : 'Size of search envelope around cursor to sniff out edges.'}
                </p>
              </div>
            )}
          </div>

          {/* Active Clip Creation HUD */}
          {activePath.length > 1 ? (
            <div id="active-crop-creator" className="p-4 bg-slate-900/40 border-b border-slate-800 space-y-4">
              <div className="flex items-center space-x-2">
                <div className="bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20 text-emerald-400 animate-pulse">
                  <Eye className="h-4 w-4" />
                </div>
                <h2 className="font-semibold text-xs tracking-wide uppercase text-slate-200">Active Crop Pending</h2>
              </div>

              {/* Dynamic Feather Pre-Clip Thumbnail Container */}
              <div className="h-32 rounded-lg bg-checkerboard flex items-center justify-center relative overflow-hidden border border-slate-800/80 shadow-inner group">
                {image && (
                  <img
                    src={createSegmentImage(
                      image,
                      activePath,
                      getPathBounds(activePath, image.width, image.height),
                      feather
                    )}
                    alt="Active Cutout Preview"
                    className="max-w-[85%] max-h-[85%] object-contain drop-shadow-md"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="absolute bottom-2 right-2 bg-slate-950/90 backdrop-blur-sm border border-slate-800 text-[10px] font-mono px-1.5 py-0.5 rounded text-slate-400">
                  Pre-clipping Live Preview
                </div>
              </div>

            </div>
          ) : (
            <div className="p-4 bg-slate-900/20 border-b border-slate-800 text-center text-xs text-slate-500 flex flex-col items-center justify-center py-6 space-y-1">
              <div className="p-2 bg-slate-950 rounded-full border border-slate-900 text-slate-600 mb-1">
                <Scissors className="h-5 w-5" />
              </div>
              <p className="font-medium text-slate-400">No active selection</p>
              <p className="text-[11px] text-slate-600 max-w-[200px]">
                Draw boundaries on the image to activate the crop engine and preview transparent segments.
              </p>
            </div>
          )}
          </div>

          {/* 2.4 Saved Segments Gallery (Scrollable) */}
          <div className={`${mobileSidebarTab === 'cuts' ? 'flex' : 'hidden'} md:flex flex-1 min-h-0 overflow-hidden`}>
            <SegmentList
              segments={savedSegments}
              onDelete={handleDeleteSegment}
              onRename={handleRenameSegment}
              onUpdateTags={handleUpdateSegmentTags}
              onClearAll={handleClearAllSegments}
              onSelectSegment={handleSelectSavedSegment}
              onExportLibrary={handleExportLibrary}
              onImportLibrary={handleImportLibraryRequest}
              onRestoreBackup={handleRestoreLibraryBackup}
            />
          </div>
        </aside>
      </main>

      <input
        ref={libraryImportInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportLibraryFile}
      />

      {/* 3. Modal / Popup Overlay to Preview any Saved Segment with zoom controls */}
      <AnimatePresence>
        {previewSegment && (
          <motion.div
            id="preview-segment-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-800 flex justify-between items-start sm:items-center gap-3 bg-slate-950/40">
                <div className="flex items-center space-x-2 min-w-0">
                  <div className="bg-blue-500/10 p-1.5 rounded-lg border border-blue-500/20 text-blue-400">
                    <Eye className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm text-slate-200 truncate">{previewSegment.name}</h3>
                    <p className="text-[10px] text-slate-500 font-mono font-medium break-words">
                      Dimensions: {previewSegment.bounds.width} × {previewSegment.bounds.height} px | Tool: {previewSegment.type}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewSegment(null)}
                  className="p-1.5 bg-slate-850 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-all cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body Showcase Checkerboard */}
              <div className="flex-1 min-h-[240px] sm:h-96 bg-checkerboard flex items-center justify-center p-4 sm:p-12 relative overflow-hidden border-b border-slate-800">
                <img
                  src={previewSegment.thumbnailUrl}
                  alt={previewSegment.name}
                  className="max-w-full max-h-full object-contain drop-shadow-2xl"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Action Footer */}
              <div className="p-4 bg-slate-950/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <span className="text-[10px] text-slate-500 font-mono">
                  Saved: {new Date(previewSegment.createdAt).toLocaleTimeString()}
                </span>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <button
                    onClick={() => setShowBgRemover(true)}
                    className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold shadow shadow-emerald-500/10 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>Clean & Polish Background</span>
                  </button>
                  <button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = previewSegment.thumbnailUrl;
                      link.download = previewSegment.name;
                      link.click();
                    }}
                    className="w-full sm:w-auto flex items-center justify-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow shadow-blue-500/10 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download PNG</span>
                  </button>
                  <button
                    onClick={() => setPreviewSegment(null)}
                    className="w-full sm:w-auto px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 cursor-pointer"
                  >
                    Close Preview
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animation Studio Overlay */}
      <AnimatePresence>
        {showCollageStudio && (
          <CollageStudio
            savedSegments={savedSegments}
            onClose={() => setShowCollageStudio(false)}
          />
        )}
      </AnimatePresence>

      {/* Animation Studio Overlay */}
      <AnimatePresence>
        {showAnimationStudio && (
          <AnimationStudio
            savedSegments={savedSegments}
            workspaceImage={image}
            onCreateSegment={createCleanedSegment}
            onClose={() => setShowAnimationStudio(false)}
          />
        )}
      </AnimatePresence>

      {/* Background Remover Polish Overlay */}
      <AnimatePresence>
        {showBgRemover && previewSegment && (
          <BackgroundRemover
            segment={previewSegment}
            onSave={handleSavePreviewSegmentCleanup}
            onClose={() => setShowBgRemover(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
