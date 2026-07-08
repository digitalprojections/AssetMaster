import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipVertical,
  Image as ImageIcon,
  Layers,
  Lock,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Unlock,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { CollageItem, CollageProject, CollageStudioProjectFile, SavedSegment } from '../types';
import { getIndexedDbRecord, setIndexedDbRecord } from '../utils/indexedDbStorage';
import { buildSingleImagePdfBlob } from '../utils/pdfExport';

const COLLAGE_PROJECT_STORAGE_KEY = 'assetmaster.collageStudio.project.v1';

const CANVAS_PRESETS = [
  { label: 'Square', width: 1080, height: 1080 },
  { label: 'Story', width: 1080, height: 1920 },
  { label: 'Landscape', width: 1920, height: 1080 },
  { label: 'A4', width: 1240, height: 1754 },
];

const MIN_CANVAS_DIMENSION = 64;
const MAX_CANVAS_DIMENSION = 4000;

type CollageStudioProps = {
  savedSegments: SavedSegment[];
  onClose: () => void;
};

type InteractionState =
  | {
      mode: 'drag';
      itemId: string;
      startStageX: number;
      startStageY: number;
      startX: number;
      startY: number;
    }
  | {
      mode: 'resize';
      itemId: string;
      centerX: number;
      centerY: number;
      startDistance: number;
      startScale: number;
    };

const createDefaultProject = (): CollageProject => ({
  id: 'collage-project',
  name: 'Collage Project',
  width: 1080,
  height: 1080,
  background: {
    mode: 'transparent',
    color: '#ffffff',
  },
  items: [],
  updatedAt: Date.now(),
});

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeItem = (item: CollageItem): CollageItem => ({
  ...item,
  sourceSegmentId: item.sourceSegmentId ?? null,
  scale: clamp(item.scale ?? 1, 0.05, 8),
  rotation: item.rotation ?? 0,
  opacity: clamp(item.opacity ?? 1, 0, 1),
  flipX: Boolean(item.flipX),
  flipY: Boolean(item.flipY),
  locked: Boolean(item.locked),
  visible: item.visible !== false,
});

const normalizeProject = (incoming: CollageProject): CollageProject => ({
  ...incoming,
  width: Math.max(64, Math.round(incoming.width || 1080)),
  height: Math.max(64, Math.round(incoming.height || 1080)),
  background: {
    mode: incoming.background?.mode === 'solid' ? 'solid' : 'transparent',
    color: incoming.background?.color || '#ffffff',
  },
  items: (incoming.items ?? []).map(normalizeItem),
  updatedAt: Date.now(),
});

const loadImageElement = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load collage image'));
    img.src = src;
  });

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
        return;
      }

      reject(new Error('Could not read image file'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image file'));
    reader.readAsDataURL(file);
  });

const downloadBlob = (filename: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const downloadDataUrl = (filename: string, dataUrl: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

const downloadJsonFile = (filename: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(filename, blob);
};

export default function CollageStudio({ savedSegments, onClose }: CollageStudioProps) {
  const [project, setProject] = useState<CollageProject>(createDefaultProject);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [stageZoom, setStageZoom] = useState<number>(0.7);
  const [isProjectHydrated, setIsProjectHydrated] = useState<boolean>(false);
  const [sourceSearch, setSourceSearch] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [collapsedSections, setCollapsedSections] = useState({
    project: false,
    canvas: false,
    savedCutouts: false,
    layers: false,
    selectedItem: false,
  });
  const projectImportInputRef = useRef<HTMLInputElement | null>(null);
  const imageImportInputRef = useRef<HTMLInputElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<InteractionState | null>(null);

  const selectedItem = useMemo(
    () => project.items.find((item) => item.id === selectedItemId) ?? null,
    [project.items, selectedItemId]
  );

  const filteredSegments = useMemo(() => {
    const normalizedQuery = sourceSearch.trim().toLowerCase();
    if (!normalizedQuery) {
      return savedSegments;
    }

    return savedSegments.filter((segment) => {
      const haystack = [
        segment.name,
        ...(segment.tags ?? []),
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [savedSegments, sourceSearch]);

  const contentExtents = useMemo(() => {
    if (project.items.length === 0) {
      return {
        maxRight: project.width,
        maxBottom: project.height,
      };
    }

    let maxRight = 0;
    let maxBottom = 0;

    for (const item of project.items) {
      if (!item.visible) {
        continue;
      }

      const halfWidth = (item.originalWidth * item.scale) / 2;
      const halfHeight = (item.originalHeight * item.scale) / 2;
      const radians = (item.rotation * Math.PI) / 180;
      const horizontalExtent = Math.abs(Math.cos(radians)) * halfWidth + Math.abs(Math.sin(radians)) * halfHeight;
      const verticalExtent = Math.abs(Math.sin(radians)) * halfWidth + Math.abs(Math.cos(radians)) * halfHeight;

      maxRight = Math.max(maxRight, item.x + horizontalExtent);
      maxBottom = Math.max(maxBottom, item.y + verticalExtent);
    }

    return {
      maxRight: Math.max(MIN_CANVAS_DIMENSION, Math.ceil(maxRight)),
      maxBottom: Math.max(MIN_CANVAS_DIMENSION, Math.ceil(maxBottom)),
    };
  }, [project.height, project.items, project.width]);

  const toggleSection = (section: keyof typeof collapsedSections) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  useEffect(() => {
    let cancelled = false;

    const hydrateProject = async () => {
      try {
        const stored = await getIndexedDbRecord<CollageStudioProjectFile>(COLLAGE_PROJECT_STORAGE_KEY);
        if (!stored || cancelled) {
          return;
        }

        setProject(normalizeProject(stored.project));
        setSelectedItemId(stored.selectedItemId ?? null);
        setStageZoom(clamp(stored.stageZoom ?? 0.7, 0.25, 2));
      } catch (error) {
        console.error('Failed to read collage project from IndexedDB', error);
      } finally {
        if (!cancelled) {
          setIsProjectHydrated(true);
        }
      }
    };

    void hydrateProject();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isProjectHydrated) {
      return;
    }

    void setIndexedDbRecord<CollageStudioProjectFile>(COLLAGE_PROJECT_STORAGE_KEY, {
      version: 1,
      exportedAt: Date.now(),
      project: normalizeProject(project),
      selectedItemId,
      stageZoom,
    }).catch((error) => {
      console.error('Failed to persist collage project', error);
    });
  }, [isProjectHydrated, project, selectedItemId, stageZoom]);

  useEffect(() => {
    if (!selectedItemId) {
      return;
    }

    const stillExists = project.items.some((item) => item.id === selectedItemId);
    if (!stillExists) {
      setSelectedItemId(null);
    }
  }, [project.items, selectedItemId]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      const stage = stageRef.current;
      if (!interaction || !stage) {
        return;
      }

      const rect = stage.getBoundingClientRect();
      const stageX = (event.clientX - rect.left) / stageZoom;
      const stageY = (event.clientY - rect.top) / stageZoom;

      if (interaction.mode === 'drag') {
        const dx = stageX - interaction.startStageX;
        const dy = stageY - interaction.startStageY;
        setProject((prev) => ({
          ...prev,
          updatedAt: Date.now(),
          items: prev.items.map((item) => item.id === interaction.itemId ? {
            ...item,
            x: clamp(interaction.startX + dx, 0, prev.width),
            y: clamp(interaction.startY + dy, 0, prev.height),
          } : item),
        }));
      } else {
        const currentDistance = Math.max(8, Math.hypot(stageX - interaction.centerX, stageY - interaction.centerY));
        const scaleRatio = currentDistance / interaction.startDistance;
        setProject((prev) => ({
          ...prev,
          updatedAt: Date.now(),
          items: prev.items.map((item) => item.id === interaction.itemId ? {
            ...item,
            scale: clamp(interaction.startScale * scaleRatio, 0.05, 8),
          } : item),
        }));
      }
    };

    const handlePointerUp = () => {
      interactionRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [stageZoom]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (event.key === 'Escape') {
        setSelectedItemId(null);
        return;
      }

      if (!selectedItem) {
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && !selectedItem.locked) {
        event.preventDefault();
        setProject((prev) => ({
          ...prev,
          updatedAt: Date.now(),
          items: prev.items.filter((item) => item.id !== selectedItem.id),
        }));
        setSelectedItemId(null);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        duplicateSelectedItem();
        return;
      }

      if (selectedItem.locked) {
        return;
      }

      const delta = event.shiftKey ? 10 : 1;
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        return;
      }

      event.preventDefault();
      setProject((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        items: prev.items.map((item) => {
          if (item.id !== selectedItem.id) {
            return item;
          }

          return {
            ...item,
            x: clamp(item.x + (event.key === 'ArrowLeft' ? -delta : event.key === 'ArrowRight' ? delta : 0), 0, prev.width),
            y: clamp(item.y + (event.key === 'ArrowUp' ? -delta : event.key === 'ArrowDown' ? delta : 0), 0, prev.height),
          };
        }),
      }));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem]);

  const buildProjectSnapshot = (): CollageStudioProjectFile => ({
    version: 1,
    exportedAt: Date.now(),
    project: normalizeProject(project),
    selectedItemId,
    stageZoom,
  });

  const buildProjectItem = (input: {
    name: string;
    thumbnailUrl: string;
    originalWidth: number;
    originalHeight: number;
    placementIndex?: number;
    sourceSegmentId?: string | null;
  }): CollageItem => {
    const fitScale = Math.min(
      (project.width * 0.6) / Math.max(1, input.originalWidth),
      (project.height * 0.6) / Math.max(1, input.originalHeight),
      1
    );
    const normalizedScale = clamp(fitScale, 0.05, 8);
    const scaledWidth = input.originalWidth * normalizedScale;
    const scaledHeight = input.originalHeight * normalizedScale;
    const placementIndex = input.placementIndex ?? project.items.length;
    const offsetStep = Math.max(24, Math.round(Math.min(project.width, project.height) * 0.035));
    const columnCount = 3;
    const column = placementIndex % columnCount;
    const row = Math.floor(placementIndex / columnCount);
    const rawX = Math.round(project.width / 2 + (column - 1) * offsetStep);
    const rawY = Math.round(project.height / 2 + (row - 1) * offsetStep);

    return {
      id: `collage-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: input.name,
      sourceSegmentId: input.sourceSegmentId ?? null,
      thumbnailUrl: input.thumbnailUrl,
      originalWidth: Math.max(1, input.originalWidth),
      originalHeight: Math.max(1, input.originalHeight),
      x: clamp(rawX, Math.round(scaledWidth / 2), Math.max(Math.round(scaledWidth / 2), Math.round(project.width - (scaledWidth / 2)))),
      y: clamp(rawY, Math.round(scaledHeight / 2), Math.max(Math.round(scaledHeight / 2), Math.round(project.height - (scaledHeight / 2)))),
      scale: normalizedScale,
      rotation: 0,
      opacity: 1,
      flipX: false,
      flipY: false,
      locked: false,
      visible: true,
    };
  };

  const addSegmentToProject = (segment: SavedSegment) => {
    const newItem = buildProjectItem({
      name: segment.name.replace(/\.png$/i, ''),
      thumbnailUrl: segment.thumbnailUrl,
      originalWidth: Math.max(1, segment.bounds.width),
      originalHeight: Math.max(1, segment.bounds.height),
      sourceSegmentId: segment.id,
    });

    setProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      items: [...prev.items, newItem],
    }));
    setSelectedItemId(newItem.id);
  };

  const updateSelectedItem = (updater: (item: CollageItem) => CollageItem) => {
    if (!selectedItemId) {
      return;
    }

    setProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      items: prev.items.map((item) => item.id === selectedItemId ? updater(item) : item),
    }));
  };

  const duplicateSelectedItem = () => {
    if (!selectedItem) {
      return;
    }

    const duplicate: CollageItem = {
      ...selectedItem,
      id: `collage-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${selectedItem.name} Copy`,
      x: clamp(selectedItem.x + 24, 0, project.width),
      y: clamp(selectedItem.y + 24, 0, project.height),
      locked: false,
    };

    setProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      items: [...prev.items, duplicate],
    }));
    setSelectedItemId(duplicate.id);
  };

  const removeSelectedItem = () => {
    if (!selectedItem) {
      return;
    }

    setProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      items: prev.items.filter((item) => item.id !== selectedItem.id),
    }));
    setSelectedItemId(null);
  };

  const reorderSelectedItem = (mode: 'forward' | 'backward' | 'front' | 'back') => {
    if (!selectedItem) {
      return;
    }

    setProject((prev) => {
      const currentIndex = prev.items.findIndex((item) => item.id === selectedItem.id);
      if (currentIndex === -1) {
        return prev;
      }

      const nextItems = [...prev.items];
      const [item] = nextItems.splice(currentIndex, 1);
      let targetIndex = currentIndex;

      if (mode === 'forward') {
        targetIndex = Math.min(nextItems.length, currentIndex + 1);
      } else if (mode === 'backward') {
        targetIndex = Math.max(0, currentIndex - 1);
      } else if (mode === 'front') {
        targetIndex = nextItems.length;
      } else {
        targetIndex = 0;
      }

      nextItems.splice(targetIndex, 0, item);
      return {
        ...prev,
        updatedAt: Date.now(),
        items: nextItems,
      };
    });
  };

  const alignSelectedItem = (horizontal: 'left' | 'center' | 'right' | null, vertical: 'top' | 'center' | 'bottom' | null) => {
    if (!selectedItem) {
      return;
    }

    updateSelectedItem((item) => ({
      ...item,
      x: horizontal === 'left'
        ? Math.round(item.originalWidth * item.scale / 2)
        : horizontal === 'center'
          ? Math.round(project.width / 2)
          : horizontal === 'right'
            ? Math.round(project.width - (item.originalWidth * item.scale / 2))
            : item.x,
      y: vertical === 'top'
        ? Math.round(item.originalHeight * item.scale / 2)
        : vertical === 'center'
          ? Math.round(project.height / 2)
          : vertical === 'bottom'
            ? Math.round(project.height - (item.originalHeight * item.scale / 2))
            : item.y,
    }));
  };

  const handleStagePointerDown = () => {
    setSelectedItemId(null);
  };

  const getStagePoint = (clientX: number, clientY: number) => {
    const stage = stageRef.current;
    if (!stage) {
      return null;
    }

    const rect = stage.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / stageZoom,
      y: (clientY - rect.top) / stageZoom,
    };
  };

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>, item: CollageItem) => {
    if (item.locked) {
      setSelectedItemId(item.id);
      return;
    }

    const point = getStagePoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    event.stopPropagation();
    setSelectedItemId(item.id);
    interactionRef.current = {
      mode: 'drag',
      itemId: item.id,
      startStageX: point.x,
      startStageY: point.y,
      startX: item.x,
      startY: item.y,
    };
  };

  const beginResize = (event: React.PointerEvent<HTMLButtonElement>, item: CollageItem) => {
    if (item.locked) {
      return;
    }

    const point = getStagePoint(event.clientX, event.clientY);
    if (!point) {
      return;
    }

    event.stopPropagation();
    setSelectedItemId(item.id);
    interactionRef.current = {
      mode: 'resize',
      itemId: item.id,
      centerX: item.x,
      centerY: item.y,
      startDistance: Math.max(8, Math.hypot(point.x - item.x, point.y - item.y)),
      startScale: item.scale,
    };
  };

  const renderProjectToCanvas = async (options?: { fallbackBackgroundColor?: string }) => {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = project.width;
    outCanvas.height = project.height;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not create collage render context');
    }

    if (project.background.mode === 'solid') {
      ctx.fillStyle = project.background.color;
      ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);
    } else if (options?.fallbackBackgroundColor) {
      ctx.fillStyle = options.fallbackBackgroundColor;
      ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);
    } else {
      ctx.clearRect(0, 0, outCanvas.width, outCanvas.height);
    }

    for (const item of project.items) {
      if (!item.visible) {
        continue;
      }

      const img = await loadImageElement(item.thumbnailUrl);
      ctx.save();
      ctx.globalAlpha = item.opacity;
      ctx.translate(item.x, item.y);
      ctx.rotate((item.rotation * Math.PI) / 180);
      ctx.scale(item.scale, item.scale);
      ctx.scale(item.flipX ? -1 : 1, item.flipY ? -1 : 1);
      ctx.drawImage(
        img,
        -item.originalWidth / 2,
        -item.originalHeight / 2,
        item.originalWidth,
        item.originalHeight
      );
      ctx.restore();
    }

    return outCanvas;
  };

  const handleExportImage = async (format: 'png' | 'webp') => {
    setIsExporting(true);
    try {
      const canvas = await renderProjectToCanvas();
      const mimeType = format === 'png' ? 'image/png' : 'image/webp';
      const dataUrl = canvas.toDataURL(mimeType, 0.92);
      downloadDataUrl(
        `${(project.name || 'assetmaster-collage').replace(/\s+/g, '_').toLowerCase()}.${format}`,
        dataUrl
      );
    } catch (error) {
      console.error(`Failed to export ${format.toUpperCase()}`, error);
      window.alert(`The ${format.toUpperCase()} export could not be created.`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      const canvas = await renderProjectToCanvas({ fallbackBackgroundColor: '#ffffff' });
      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const pdfBlob = buildSingleImagePdfBlob({
        jpegDataUrl,
        width: project.width,
        height: project.height,
      });
      downloadBlob(
        `${(project.name || 'assetmaster-collage').replace(/\s+/g, '_').toLowerCase()}.pdf`,
        pdfBlob
      );
    } catch (error) {
      console.error('Failed to export PDF', error);
      window.alert('The PDF export could not be created.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportProject = () => {
    downloadJsonFile(
      `${(project.name || 'assetmaster-collage').replace(/\s+/g, '_').toLowerCase()}_collage_project.json`,
      buildProjectSnapshot()
    );
  };

  const handleImportProjectRequest = () => {
    projectImportInputRef.current?.click();
  };

  const handleImportImagesRequest = () => {
    imageImportInputRef.current?.click();
  };

  const autoSizeCanvasDimension = (dimension: 'width' | 'height') => {
    setProject((prev) => ({
      ...prev,
      updatedAt: Date.now(),
      [dimension]: dimension === 'width'
        ? clamp(contentExtents.maxRight, MIN_CANVAS_DIMENSION, MAX_CANVAS_DIMENSION)
        : clamp(contentExtents.maxBottom, MIN_CANVAS_DIMENSION, MAX_CANVAS_DIMENSION),
    }));
  };

  const handleImportProjectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const parsed = JSON.parse(await file.text()) as Partial<CollageStudioProjectFile>;
      if (!parsed.project) {
        throw new Error('Missing collage project payload');
      }

      if (!window.confirm(`Replace the current collage project with "${parsed.project.name || file.name}"?`)) {
        return;
      }

      setProject(normalizeProject(parsed.project));
      setSelectedItemId(parsed.selectedItemId ?? null);
      setStageZoom(clamp(parsed.stageZoom ?? 0.7, 0.25, 2));
    } catch (error) {
      console.error('Failed to import collage project', error);
      window.alert('The selected collage project file could not be loaded.');
    } finally {
      event.target.value = '';
    }
  };

  const handleImportImagesFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'));
    if (files.length === 0) {
      event.target.value = '';
      return;
    }

    try {
      const importedItems = await Promise.all(files.map(async (file, index) => {
        const dataUrl = await readFileAsDataUrl(file);
        const image = await loadImageElement(dataUrl);
        return buildProjectItem({
          name: file.name.replace(/\.[^.]+$/u, ''),
          thumbnailUrl: dataUrl,
          originalWidth: image.naturalWidth || image.width,
          originalHeight: image.naturalHeight || image.height,
          placementIndex: project.items.length + index,
        });
      }));

      setProject((prev) => ({
        ...prev,
        updatedAt: Date.now(),
        items: [...prev.items, ...importedItems],
      }));
      setSelectedItemId(importedItems[importedItems.length - 1]?.id ?? null);
    } catch (error) {
      console.error('Failed to import images into collage studio', error);
      window.alert('One or more selected images could not be imported.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md text-slate-100 flex items-center justify-center p-0 md:p-6">
      <div className="w-full h-full md:h-[90vh] max-w-[1700px] bg-slate-900 border-0 md:border border-slate-800 rounded-none md:rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        <header className="min-h-16 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3 px-4 py-2 md:px-6 shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="bg-orange-500/10 p-2 border border-orange-500/20 rounded-xl text-orange-300">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-sm text-slate-100 truncate">Collage Studio</h1>
              <p className="hidden sm:block text-[10px] text-slate-500 font-mono">Compose reusable cutouts into layered layouts</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setStageZoom((prev) => clamp(prev - 0.1, 0.25, 2))}
              className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer"
              title="Zoom out stage"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-xs font-mono text-slate-300 min-w-[48px] text-center">{Math.round(stageZoom * 100)}%</span>
            <button
              onClick={() => setStageZoom((prev) => clamp(prev + 0.1, 0.25, 2))}
              className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-300 hover:bg-slate-800 cursor-pointer"
              title="Zoom in stage"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={() => setStageZoom(1)}
              className="px-3 py-2 rounded-lg border border-slate-800 bg-slate-900 text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
            >
              1:1
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200 hover:bg-slate-800 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          <div className="flex-1 min-h-0 bg-slate-950 overflow-auto">
            <div className="min-h-full min-w-full flex items-center justify-center p-4 md:p-8">
              <div
                className="relative shrink-0"
                style={{
                  width: `${project.width * stageZoom}px`,
                  height: `${project.height * stageZoom}px`,
                }}
              >
                <div
                  ref={stageRef}
                  onPointerDown={handleStagePointerDown}
                  className="absolute top-0 left-0 overflow-hidden border border-slate-800 shadow-2xl"
                  style={{
                    width: `${project.width}px`,
                    height: `${project.height}px`,
                    transform: `scale(${stageZoom})`,
                    transformOrigin: 'top left',
                    backgroundColor: project.background.mode === 'solid' ? project.background.color : 'transparent',
                  }}
                >
                  {project.background.mode === 'transparent' && (
                    <div className="absolute inset-0 bg-checkerboard" />
                  )}

                  <div className="absolute left-1/2 top-0 bottom-0 -ml-px w-px border-l border-dashed border-slate-500/30 pointer-events-none" />
                  <div className="absolute top-1/2 left-0 right-0 -mt-px h-px border-t border-dashed border-slate-500/30 pointer-events-none" />

                  {project.items.map((item) => {
                    if (!item.visible) {
                      return null;
                    }

                    const isSelected = item.id === selectedItemId;

                    return (
                      <div
                        key={item.id}
                        onPointerDown={(event) => beginDrag(event, item)}
                        className="absolute cursor-move"
                        style={{
                          left: `${item.x}px`,
                          top: `${item.y}px`,
                          width: `${item.originalWidth}px`,
                          height: `${item.originalHeight}px`,
                          transform: `translate(-50%, -50%) rotate(${item.rotation}deg) scale(${item.scale})`,
                          transformOrigin: 'center center',
                          opacity: item.opacity,
                          zIndex: isSelected ? project.items.length + 10 : undefined,
                          cursor: item.locked ? 'default' : 'move',
                        }}
                      >
                        <img
                          src={item.thumbnailUrl}
                          alt={item.name}
                          draggable={false}
                          className="w-full h-full object-contain pointer-events-none select-none"
                          style={{
                            transform: `scaleX(${item.flipX ? -1 : 1}) scaleY(${item.flipY ? -1 : 1})`,
                          }}
                        />

                        {isSelected && (
                          <div className={`absolute inset-0 rounded border-2 pointer-events-none ${item.locked ? 'border-amber-400' : 'border-orange-400'}`} />
                        )}

                        {isSelected && !item.locked && (
                          <button
                            onPointerDown={(event) => beginResize(event, item)}
                            className="absolute -right-3 -bottom-3 h-6 w-6 rounded-full border border-orange-200 bg-orange-400 shadow-lg cursor-nwse-resize"
                            title="Resize item"
                          />
                        )}
                      </div>
                    );
                  })}

                  <div className="absolute bottom-2 right-2 bg-slate-950/90 border border-slate-800 rounded-lg px-2 py-1 text-[10px] font-mono text-slate-300">
                    {project.width} x {project.height}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <aside className="w-full lg:w-[320px] border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-950 flex flex-col overflow-hidden">
            <section className="border-b border-slate-800 bg-slate-950/95 shrink-0">
              <button
                onClick={() => toggleSection('project')}
                className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
              >
                <div>
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-300">Project</h2>
                  <p className="text-[10px] text-slate-500">Persistent locally, exportable as image, PDF, or project JSON.</p>
                </div>
                {collapsedSections.project ? <ChevronRight className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
              </button>

              {!collapsedSections.project && (
                <div className="px-3 pb-3 space-y-2.5">
                  <input
                    type="text"
                    value={project.name}
                    onChange={(event) => setProject((prev) => ({ ...prev, name: event.target.value, updatedAt: Date.now() }))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-slate-100 outline-none focus:border-orange-500"
                    placeholder="Collage project name"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => void handleExportImage('png')}
                      disabled={isExporting}
                      className="py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-bold cursor-pointer disabled:opacity-50"
                    >
                      Export PNG
                    </button>
                    <button
                      onClick={() => void handleExportImage('webp')}
                      disabled={isExporting}
                      className="py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Export WebP
                    </button>
                    <button
                      onClick={() => void handleExportPdf()}
                      disabled={isExporting}
                      className="py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                    >
                      Export PDF
                    </button>
                    <button
                      onClick={handleExportProject}
                      className="py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-[11px] font-semibold cursor-pointer"
                    >
                      Export Project
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={handleImportImagesRequest}
                      className="py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <ImageIcon className="h-3 w-3" />
                      <span>Images</span>
                    </button>
                    <button
                      onClick={handleImportProjectRequest}
                      className="py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="h-3 w-3" />
                      <span>Import</span>
                    </button>
                    <button
                      onClick={() => {
                        if (!window.confirm('Reset the current collage project?')) {
                          return;
                        }
                        setProject(createDefaultProject());
                        setSelectedItemId(null);
                        setStageZoom(0.7);
                      }}
                      className="py-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-200 text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>
              )}
            </section>

            <div className="flex-1 overflow-y-auto">
              <section className="border-b border-slate-800">
                <button
                  onClick={() => toggleSection('canvas')}
                  className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
                >
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Canvas</h3>
                  {collapsedSections.canvas ? <ChevronRight className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                </button>
                {!collapsedSections.canvas && (
                <div className="px-3 pb-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                      <span>Width</span>
                      <button
                        type="button"
                        onClick={() => autoSizeCanvasDimension('width')}
                        disabled={project.items.length === 0}
                        className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[9px] font-semibold text-slate-300 hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Auto
                      </button>
                    </span>
                    <input
                      type="number"
                      min={MIN_CANVAS_DIMENSION}
                      max={MAX_CANVAS_DIMENSION}
                      value={project.width}
                      onChange={(event) => setProject((prev) => ({ ...prev, width: Math.max(MIN_CANVAS_DIMENSION, Number(event.target.value) || prev.width), updatedAt: Date.now() }))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-orange-500"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
                      <span>Height</span>
                      <button
                        type="button"
                        onClick={() => autoSizeCanvasDimension('height')}
                        disabled={project.items.length === 0}
                        className="rounded border border-slate-800 bg-slate-950 px-1.5 py-0.5 text-[9px] font-semibold text-slate-300 hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        Auto
                      </button>
                    </span>
                    <input
                      type="number"
                      min={MIN_CANVAS_DIMENSION}
                      max={MAX_CANVAS_DIMENSION}
                      value={project.height}
                      onChange={(event) => setProject((prev) => ({ ...prev, height: Math.max(MIN_CANVAS_DIMENSION, Number(event.target.value) || prev.height), updatedAt: Date.now() }))}
                      className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-orange-500"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {CANVAS_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      onClick={() => setProject((prev) => ({ ...prev, width: preset.width, height: preset.height, updatedAt: Date.now() }))}
                      className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-slate-300 hover:bg-slate-800 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-slate-200">Background</span>
                    <button
                      onClick={() => setProject((prev) => ({
                        ...prev,
                        background: {
                          ...prev.background,
                          mode: prev.background.mode === 'transparent' ? 'solid' : 'transparent',
                        },
                        updatedAt: Date.now(),
                      }))}
                      className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1 text-[10px] text-slate-300 cursor-pointer"
                    >
                      {project.background.mode === 'transparent' ? 'Transparent' : 'Solid'}
                    </button>
                  </div>
                  <input
                    type="color"
                    value={project.background.color}
                    disabled={project.background.mode !== 'solid'}
                    onChange={(event) => setProject((prev) => ({
                      ...prev,
                      background: {
                        ...prev.background,
                        color: event.target.value,
                      },
                      updatedAt: Date.now(),
                    }))}
                    className="h-8 w-full rounded-md border border-slate-700 bg-transparent p-1 disabled:opacity-40"
                  />
                </div>
                </div>
                )}
              </section>

              <section className="border-b border-slate-800">
                <button
                  onClick={() => toggleSection('savedCutouts')}
                  className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
                >
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Saved Cutouts</h3>
                  {collapsedSections.savedCutouts ? <ChevronRight className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                </button>
                {!collapsedSections.savedCutouts && (
                <div className="px-3 pb-3 space-y-2.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={sourceSearch}
                    onChange={(event) => setSourceSearch(event.target.value)}
                    placeholder="Search cutouts or tags..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-2 text-[11px] text-slate-100 outline-none focus:border-orange-500"
                  />
                </div>

                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {filteredSegments.length === 0 ? (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center text-[10px] text-slate-500">
                      No saved cutouts match the current search.
                    </div>
                  ) : (
                    filteredSegments.map((segment) => (
                      <button
                        key={segment.id}
                        onClick={() => addSegmentToProject(segment)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-900/70 p-1.5 flex items-center gap-2 text-left hover:border-orange-500/40 hover:bg-slate-900 transition-all cursor-pointer"
                      >
                        <div className="h-11 w-11 shrink-0 rounded-md border border-slate-800 bg-checkerboard flex items-center justify-center overflow-hidden">
                          <img src={segment.thumbnailUrl} alt={segment.name} className="max-h-full max-w-full object-contain" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-slate-200 truncate">{segment.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono">
                            {segment.bounds.width} x {segment.bounds.height}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {(segment.tags ?? []).slice(0, 3).map((tag) => (
                              <span key={tag} className="rounded bg-slate-950 px-1.5 py-0.5 text-[8px] text-slate-400 border border-slate-800">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
                </div>
                )}
              </section>

              <section className="border-b border-slate-800">
                <button
                  onClick={() => toggleSection('layers')}
                  className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
                >
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Layers</h3>
                  {collapsedSections.layers ? <ChevronRight className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                </button>
                {!collapsedSections.layers && (
                <div className="px-3 pb-3 space-y-2.5">
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  {project.items.length === 0 ? (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center text-[10px] text-slate-500">
                      Add cutouts from the library to start building a collage.
                    </div>
                  ) : (
                    [...project.items].map((item, index) => {
                      const isSelected = item.id === selectedItemId;
                      return (
                        <button
                          key={item.id}
                          onClick={() => setSelectedItemId(item.id)}
                          className={`w-full rounded-lg border p-1.5 flex items-center gap-2 text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'border-orange-500 bg-orange-500/10'
                              : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
                          }`}
                        >
                          <div className="h-9 w-9 shrink-0 rounded-md border border-slate-800 bg-checkerboard overflow-hidden flex items-center justify-center">
                            <img src={item.thumbnailUrl} alt={item.name} className="max-h-full max-w-full object-contain" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold text-slate-200 truncate">{item.name}</p>
                            <p className="text-[10px] text-slate-500">Layer {index + 1}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {item.locked ? <Lock className="h-3 w-3 text-amber-400" /> : null}
                            {item.visible ? <Eye className="h-3 w-3 text-slate-500" /> : <EyeOff className="h-3 w-3 text-slate-600" />}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                </div>
                )}
              </section>

              <section className="border-b border-slate-800">
                <button
                  onClick={() => toggleSection('selectedItem')}
                  className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-slate-900/60 transition-colors cursor-pointer"
                >
                  <h3 className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">Selected Item</h3>
                  {collapsedSections.selectedItem ? <ChevronRight className="h-3.5 w-3.5 text-slate-500" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-500" />}
                </button>
                {!collapsedSections.selectedItem && (
                <div className="px-3 pb-3 space-y-2.5">
                {!selectedItem ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-center text-[10px] text-slate-500">
                    Select a layer on the stage or in the layer list to edit it.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 flex items-center gap-2">
                      <div className="h-11 w-11 shrink-0 rounded-md border border-slate-800 bg-checkerboard overflow-hidden flex items-center justify-center">
                        <img src={selectedItem.thumbnailUrl} alt={selectedItem.name} className="max-h-full max-w-full object-contain" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-100 truncate">{selectedItem.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {selectedItem.originalWidth} x {selectedItem.originalHeight}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span className="text-[10px] text-slate-500">X</span>
                        <input
                          type="number"
                          value={Math.round(selectedItem.x)}
                          onChange={(event) => updateSelectedItem((item) => ({ ...item, x: clamp(Number(event.target.value) || 0, 0, project.width) }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-orange-500"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-[10px] text-slate-500">Y</span>
                        <input
                          type="number"
                          value={Math.round(selectedItem.y)}
                          onChange={(event) => updateSelectedItem((item) => ({ ...item, y: clamp(Number(event.target.value) || 0, 0, project.height) }))}
                          className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1.5 text-[11px] text-slate-100 outline-none focus:border-orange-500"
                        />
                      </label>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-300">
                        <span>Scale</span>
                        <span className="font-mono text-orange-300">{Math.round(selectedItem.scale * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="400"
                        step="1"
                        value={Math.round(selectedItem.scale * 100)}
                        onChange={(event) => updateSelectedItem((item) => ({ ...item, scale: clamp(Number(event.target.value) / 100, 0.05, 8) }))}
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-300">
                        <span>Rotation</span>
                        <span className="font-mono text-orange-300">{Math.round(selectedItem.rotation)} deg</span>
                      </div>
                      <input
                        type="range"
                        min="-180"
                        max="180"
                        step="1"
                        value={selectedItem.rotation}
                        onChange={(event) => updateSelectedItem((item) => ({ ...item, rotation: Number(event.target.value) }))}
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-300">
                        <span>Opacity</span>
                        <span className="font-mono text-orange-300">{Math.round(selectedItem.opacity * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={Math.round(selectedItem.opacity * 100)}
                        onChange={(event) => updateSelectedItem((item) => ({ ...item, opacity: clamp(Number(event.target.value) / 100, 0, 1) }))}
                        className="w-full accent-orange-500 cursor-pointer"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => updateSelectedItem((item) => ({ ...item, flipX: !item.flipX }))}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-slate-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <FlipHorizontal className="h-3 w-3" />
                        <span>Flip X</span>
                      </button>
                      <button
                        onClick={() => updateSelectedItem((item) => ({ ...item, flipY: !item.flipY }))}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-slate-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <FlipVertical className="h-3 w-3" />
                        <span>Flip Y</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => alignSelectedItem('center', null)}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-slate-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <AlignCenterHorizontal className="h-3 w-3" />
                        <span>Center X</span>
                      </button>
                      <button
                        onClick={() => alignSelectedItem(null, 'center')}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-slate-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <AlignCenterVertical className="h-3 w-3" />
                        <span>Center Y</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <button
                        onClick={() => reorderSelectedItem('back')}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-slate-300 flex items-center justify-center cursor-pointer"
                        title="Send to back"
                      >
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => reorderSelectedItem('backward')}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-slate-300 flex items-center justify-center cursor-pointer"
                        title="Move backward"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => reorderSelectedItem('forward')}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-slate-300 flex items-center justify-center cursor-pointer"
                        title="Move forward"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => reorderSelectedItem('front')}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-slate-300 flex items-center justify-center cursor-pointer"
                        title="Bring to front"
                      >
                        <ArrowUpToLine className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => updateSelectedItem((item) => ({ ...item, locked: !item.locked }))}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-slate-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {selectedItem.locked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                        <span>{selectedItem.locked ? 'Unlock' : 'Lock'}</span>
                      </button>
                      <button
                        onClick={() => updateSelectedItem((item) => ({ ...item, visible: !item.visible }))}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-slate-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        {selectedItem.visible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        <span>{selectedItem.visible ? 'Hide' : 'Show'}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={duplicateSelectedItem}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-slate-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Copy className="h-3 w-3" />
                        <span>Duplicate</span>
                      </button>
                      <button
                        onClick={() => updateSelectedItem((item) => ({ ...item, rotation: 0, scale: 1, opacity: 1, flipX: false, flipY: false }))}
                        className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-slate-200 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span>Reset</span>
                      </button>
                      <button
                        onClick={removeSelectedItem}
                        className="rounded-md border border-rose-900/60 bg-rose-950/40 px-2 py-1.5 text-[10px] font-semibold text-rose-300 flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                )}
                </div>
                )}
              </section>
            </div>
          </aside>
        </div>

        <input
          ref={projectImportInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleImportProjectFile}
        />
        <input
          ref={imageImportInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImportImagesFile}
        />
      </div>
    </div>
  );
}
