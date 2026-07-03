import React, { useState, useEffect, useRef } from 'react';
import { SavedSegment, AnimationFrame, AnimationProject } from '../types';
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
  Sparkles,
  Layers,
  Check,
  RotateCcw,
  ArrowRight,
  Columns,
  Square
} from 'lucide-react';
import JSZip from 'jszip';
import { motion, AnimatePresence } from 'motion/react';
import BackgroundRemover from './BackgroundRemover';
import { createSegmentImage } from '../utils/canvasUtils';

interface AnimationStudioProps {
  savedSegments: SavedSegment[];
  workspaceImage?: HTMLImageElement | null;
  onUpdateSegment?: (id: string, updatedUrl: string) => void;
  onClose: () => void;
}

export default function AnimationStudio({ savedSegments, workspaceImage, onUpdateSegment, onClose }: AnimationStudioProps) {
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
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  
  // Grid subdivision config
  const [cols, setCols] = useState<number>(4);
  const [rows, setRows] = useState<number>(1);
  const [showSubdivisionGrid, setShowSubdivisionGrid] = useState<boolean>(false);

  // Viewport guides
  const [showCrosshair, setShowCrosshair] = useState<boolean>(true);
  const [onionSkin, setOnionSkin] = useState<boolean>(true);
  const [onionSkinOpacity, setOnionSkinOpacity] = useState<number>(0.3);
  const [previewZoom, setPreviewZoom] = useState<number>(1.5);

  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Canvas ref for generating sub-frame slices
  const sliceCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Cache for segment images to ensure synchronous, buttery-smooth on-the-fly re-slicing
  const segmentImageCacheRef = useRef<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    savedSegments.forEach((segment) => {
      if (!segmentImageCacheRef.current[segment.id]) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          segmentImageCacheRef.current[segment.id] = img;
        };
        img.src = segment.thumbnailUrl;
      }
    });
  }, [savedSegments]);

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
        segmentImageCacheRef.current[segment.id] = srcImg;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            canvas.width = frameW;
            canvas.height = frameH;
            ctx.clearRect(0, 0, frameW, frameH);

            // Draw sub-rectangle onto canvas
            const sx = c * frameW;
            const sy = r * frameH;
            
            let subFrameUrl = '';
            if (workspaceImage) {
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
              sourceSegmentId: segment.id,
              sliceX: sx,
              sliceY: sy,
              sliceW: frameW,
              sliceH: frameH,
            });
          }
        }

        setProject((prev) => ({
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
      sourceSegmentId: segment.id,
      sliceX: 0,
      sliceY: 0,
      sliceW: segment.bounds.width,
      sliceH: segment.bounds.height,
    };

    setProject((prev) => {
      const updatedFrames = [...prev.frames, newFrame];
      // Adapt workspace bounds to largest frame size if empty
      const maxW = Math.max(prev.width, segment.bounds.width);
      const maxH = Math.max(prev.height, segment.bounds.height);
      return {
        ...prev,
        frames: updatedFrames,
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
      if (workspaceImage) {
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

      const cachedImg = segmentImageCacheRef.current[segment.id];
      if (cachedImg) {
        updateWithImg(cachedImg);
      } else {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          segmentImageCacheRef.current[segment.id] = img;
          updateWithImg(img);
        };
        img.src = segment.thumbnailUrl;
      }
    });
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
        sliceX: newSliceX,
        sliceY: newSliceY,
        thumbnailUrl: newUrl,
      };
      return { ...prev, frames: newFrames };
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
        sliceX: newSliceX,
        sliceY: newSliceY,
        thumbnailUrl: newUrl,
      };
    });

    const newFrames = await Promise.all(resetFramesPromises);
    setProject((prev) => ({
      ...prev,
      frames: newFrames,
    }));
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
            
            // Draw image centered at 0,0 relative
            outCtx.drawImage(img, -img.width / 2, -img.height / 2);
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
            
            sheetCtx.drawImage(img, -img.width / 2, -img.height / 2);
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

  const handleSaveCleanedSegmentLocally = (id: string, updatedUrl: string) => {
    if (onUpdateSegment) {
      onUpdateSegment(id, updatedUrl);
    }

    // Refresh any frames that contain the segment reference
    setProject((prev) => {
      const updatedFrames = prev.frames.map((frame) => {
        if (frame.id.includes(`frame_${id}`) || frame.id.startsWith(`slice_${id}`)) {
          // Since sliced frames are generated procedurally on demand,
          // updating the base segment means a fresh slice operation will pick up the cleaned version immediately.
          // For single frames or frames that refer directly to segment, let's update their url:
          return {
            ...frame,
            thumbnailUrl: updatedUrl
          };
        }
        return frame;
      });
      return {
        ...prev,
        frames: updatedFrames
      };
    });

    setShowBgRemover(false);
  };

  // Find currently selected segment
  const activeSegment = savedSegments.find((s) => s.id === selectedSegmentId);

  return (
    <div id="animation-studio-container" className="fixed inset-0 bg-slate-950 text-slate-100 font-sans z-40 flex flex-col overflow-hidden">
      {/* Invisible canvas for slices */}
      <canvas ref={sliceCanvasRef} className="hidden" />

      {/* 1. Header Toolbar */}
      <header className="h-16 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-3 sm:px-6 shrink-0">
        <div className="flex items-center space-x-2 sm:space-x-3">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-1.5 sm:p-2 rounded-xl shadow-lg shrink-0">
            <Layers className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-xs sm:text-base tracking-tight text-slate-100 truncate">
              <span className="hidden xs:inline">Animation & Spritesheet Studio</span>
              <span className="xs:hidden">Anim Studio</span>
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
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Mobile Tab Switcher */}
        <div className="flex lg:hidden bg-slate-950 border-b border-slate-800 shrink-0 z-20">
          <button
            onClick={() => setActiveStudioTab('player')}
            className={`flex-1 py-3 text-center text-xs font-semibold border-b-2 transition-all ${
              activeStudioTab === 'player'
                ? 'border-indigo-500 text-white bg-slate-900/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🎬 Stage & Loop
          </button>
          <button
            onClick={() => setActiveStudioTab('source')}
            className={`flex-1 py-3 text-center text-xs font-semibold border-b-2 transition-all ${
              activeStudioTab === 'source'
                ? 'border-indigo-500 text-white bg-slate-900/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            ✂️ Source & Slice
          </button>
          <button
            onClick={() => setActiveStudioTab('nudge')}
            className={`flex-1 py-3 text-center text-xs font-semibold border-b-2 transition-all ${
              activeStudioTab === 'nudge'
                ? 'border-indigo-500 text-white bg-slate-900/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            🎯 Align & Export
          </button>
        </div>
        
        {/* 2.1 Left Panel: Cutouts importer / Subdivision Tools */}
        <aside className={`w-full lg:w-80 border-r border-slate-800 bg-slate-950 flex flex-col overflow-y-auto p-4 shrink-0 space-y-5 ${
          activeStudioTab === 'source' ? 'flex' : 'hidden lg:flex'
        }`}>
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
                      </div>
                    ) : (
                      <span className="text-slate-400">Select a saved cut...</span>
                    )}
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform shrink-0 ml-1.5 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Options List */}
                  {isDropdownOpen && (
                    <div className="absolute left-0 right-0 mt-1 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-30 max-h-60 overflow-y-auto py-1 divide-y divide-slate-900">
                      {savedSegments.map((seg) => {
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
                              <p className="text-[10px] text-slate-500 font-mono mt-0.5">{seg.bounds.width} × {seg.bounds.height} px</p>
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
                        <p className="text-[10px] text-indigo-400 font-medium mt-1">Ready for animation</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowBgRemover(true)}
                      className="w-full py-2 bg-gradient-to-r from-emerald-600/20 to-teal-600/20 hover:from-emerald-600/30 hover:to-teal-600/30 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Clean / Polish Background</span>
                    </button>
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

              <div className="flex flex-col space-y-2 pt-2">
                <button
                  onClick={() => loadSegmentAsFrames(activeSegment)}
                  className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center space-x-1.5 shadow-md shadow-indigo-600/10 cursor-pointer"
                >
                  <Sparkles className="h-4 w-4" />
                  <span>Slice & View Playing Back</span>
                </button>
                <button
                  onClick={() => appendSegmentAsFrame(activeSegment)}
                  className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <Plus className="h-4 w-4 text-slate-500" />
                  <span>Append as single Frame</span>
                </button>
              </div>

              <p className="text-[10px] text-slate-500 leading-relaxed">
                If the saved cutout contains a grid of animation states (e.g. walk cycle), divide it to instantly preview the animation loop. Adjust columns/rows to match the sprites sheet grid.
              </p>
            </div>
          )}

          {/* Timeline Viewport Configuration */}
          <div className="border-t border-slate-900 pt-4 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
              <Settings className="h-4 w-4 text-purple-400" />
              <span>Studio Guides</span>
            </h3>

            {/* Crosshair guide toggle */}
            <label className="flex items-center justify-between p-2 hover:bg-slate-900/60 rounded-lg cursor-pointer transition-colors">
              <span className="text-xs text-slate-300">Target Crosshair (Center)</span>
              <input
                type="checkbox"
                checked={showCrosshair}
                onChange={(e) => setShowCrosshair(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500 bg-slate-900 border-slate-800 h-4 w-4 cursor-pointer"
              />
            </label>

            {/* Onion Skin toggle */}
            <div className="space-y-1.5 p-2 bg-slate-900/20 border border-slate-900 rounded-lg">
              <label className="flex items-center justify-between cursor-pointer">
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
        </aside>

        {/* 2.2 Middle: Live Loop Player Workspace */}
        <section className={`flex-1 flex flex-col bg-slate-900 relative ${
          activeStudioTab === 'player' ? 'flex' : 'hidden lg:flex'
        }`}>
          
          {/* Top playback hud */}
          <div className="h-12 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between px-3 sm:px-6 shrink-0 text-slate-300">
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
              <span className="text-[10px] sm:text-xs font-medium text-slate-400 hidden xs:inline">FPS:</span>
              <span className="text-[11px] sm:text-xs font-mono font-bold text-indigo-400 w-5 text-center">{project.fps}</span>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={project.fps}
                onChange={(e) => setProject({ ...project, fps: parseInt(e.target.value, 10) })}
                className="w-14 xs:w-20 sm:w-28 accent-indigo-500 cursor-pointer h-1"
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

          {/* Animation rendering stage */}
          <div className="flex-1 flex items-center justify-center p-8 overflow-hidden relative">
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
        <aside className={`w-full lg:w-80 border-l border-slate-800 bg-slate-950 flex flex-col p-4 overflow-y-auto shrink-0 space-y-4 ${
          activeStudioTab === 'nudge' ? 'flex' : 'hidden lg:flex'
        }`}>
          <div className="space-y-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center space-x-2">
              <Move className="h-4 w-4 text-emerald-400" />
              <span>3. Visual Centering Nudges</span>
            </h2>
            <p className="text-[10px] text-slate-500">
              Align frame centers to eliminate camera wobble or drift during loop playback.
            </p>
          </div>

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
                  </div>
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

              {/* Reset Controls */}
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
            </div>
          )}

          {/* 2.4 Download Centered Exports */}
          {project.frames.length > 0 && (
            <div className="pt-4 border-t border-slate-900 space-y-2.5 mt-auto">
              <span className="text-[10px] text-slate-400 tracking-wider uppercase font-bold">4. Export Animated Asset</span>
              
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
                <span>Export aligned Spritesheet</span>
              </button>
              
              <p className="text-[9px] text-center text-slate-500 leading-relaxed font-mono">
                PNGs will be scaled and padded to exactly {project.width}x{project.height}px with transparency preserved.
              </p>
            </div>
          )}
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
