import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Point, SavedSegment, SelectionTool, RectBounds } from './types';
import { findSnappedPoint, createSegmentImage, getPathBounds } from './utils/canvasUtils';
import { SAMPLE_IMAGES, SampleImage } from './data/samples';
import SegmentList from './components/SegmentList';
import AnimationStudio from './components/AnimationStudio';
import BackgroundRemover from './components/BackgroundRemover';
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
  HelpCircle,
  Undo,
  Download,
  AlertCircle,
  Eye,
  X,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
  const [showHelp, setShowHelp] = useState<boolean>(true);
  const [previewSegment, setPreviewSegment] = useState<SavedSegment | null>(null);
  const [showAnimationStudio, setShowAnimationStudio] = useState<boolean>(false);
  const [showBgRemover, setShowBgRemover] = useState<boolean>(false);
  const [antsOffset, setAntsOffset] = useState<number>(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  // Auto-collapse sidebar and help on small screens on load
  useEffect(() => {
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
      setShowHelp(false);
    }
  }, []);

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Pinch-to-zoom and multi-touch panning refs
  const touchStartDistRef = useRef<number | null>(null);
  const touchStartZoomRef = useRef<number>(1);
  const touchStartOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const touchStartMidpointRef = useRef<Point>({ x: 0, y: 0 });
  const isMultiTouchingRef = useRef<boolean>(false);

  // Load saved cutouts from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('lasso_saved_segments');
    if (saved) {
      try {
        setSavedSegments(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse saved segments', e);
      }
    }
    const index = localStorage.getItem('lasso_cutout_index');
    if (index) {
      setLastCutoutIndex(parseInt(index, 10));
    }
  }, []);

  // Save cutouts to localStorage when they change
  const updateSavedSegments = (newSegments: SavedSegment[]) => {
    setSavedSegments(newSegments);
    localStorage.setItem('lasso_saved_segments', JSON.stringify(newSegments));
  };

  const updateCutoutIndex = (newIndex: number) => {
    setLastCutoutIndex(newIndex);
    localStorage.setItem('lasso_cutout_index', newIndex.toString());
  };

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

  // Load an image safely (supporting CORS for presets)
  const loadImage = (url: string, name: string, fallbackUrl?: string) => {
    setIsLoading(true);
    setErrorMsg(null);
    setActivePath([]);
    setIsClosed(false);
    setRectStart(null);
    setRectEnd(null);
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
        loadImage(fallbackUrl, name);
      } else {
        setIsLoading(false);
        setErrorMsg('Failed to load image. If this is a cross-origin image, it might be restricted by CORS. Try uploading a local image!');
      }
    };
    img.src = url;
  };

  // Load initial preset on mount if nothing loaded
  useEffect(() => {
    if (!image && !isLoading) {
      loadImage(SAMPLE_IMAGES[0].url, 'parrot.jpg', SAMPLE_IMAGES[0].fallbackUrl);
    }
  }, []);

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
  }, [image, offset, zoom, activePath, activeTool, rectStart, rectEnd, hoverPoint, antsOffset, snapRadius]);

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
    };

    updateSavedSegments([newSegment, ...savedSegments]);
    updateCutoutIndex(lastCutoutIndex + 1);
    setIsSidebarOpen(true);

    // Highlight action success by flashing
    setActivePath([]);
    setRectStart(null);
    setRectEnd(null);
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
      setIsPanning(true);
      setPanStart({ x: clientX - offset.x, y: clientY - offset.y });
      return;
    }

    // Prevent interaction outside boundary
    if (imgPt.x < 0 || imgPt.x > image.width || imgPt.y < 0 || imgPt.y > image.height) {
      return;
    }

    if (activeTool === 'rectangle') {
      setRectStart(imgPt);
      setRectEnd(imgPt);
      setActivePath([]);
      setIsClosed(false);
    } else if (activeTool === 'lasso') {
      setIsDrawing(true);
      setActivePath([imgPt]);
      setIsClosed(false);
    } else if (activeTool === 'magnetic') {
      // Calculate real snapped point on high-contrast edge
      const hiddenCanvas = document.createElement('canvas');
      hiddenCanvas.width = image.width;
      hiddenCanvas.height = image.height;
      const hiddenCtx = hiddenCanvas.getContext('2d');
      if (hiddenCtx) {
        hiddenCtx.drawImage(image, 0, 0);
        const snapped = findSnappedPoint(hiddenCtx, imgPt, snapRadius, image.width, image.height);

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

    if (activeTool === 'rectangle' && rectStart) {
      setRectEnd(imgPt);
    } else if (activeTool === 'lasso' && isDrawing) {
      // Append if moved a little
      setActivePath((prev) => [...prev, imgPt]);
    } else if (activeTool === 'magnetic') {
      if (isClosed) {
        setHoverPoint(null);
        return;
      }
      // Dynamic snapping calculation for hover circle
      const hiddenCanvas = document.createElement('canvas');
      hiddenCanvas.width = image.width;
      hiddenCanvas.height = image.height;
      const hiddenCtx = hiddenCanvas.getContext('2d');
      if (hiddenCtx) {
        hiddenCtx.drawImage(image, 0, 0);
        const snapped = findSnappedPoint(hiddenCtx, imgPt, snapRadius, image.width, image.height);

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

  const handleSaveCleanedSegment = (id: string, updatedUrl: string) => {
    updateSavedSegments(
      savedSegments.map((s) => (s.id === id ? { ...s, thumbnailUrl: updatedUrl } : s))
    );
    // Also update previewSegment state so UI updates dynamically
    setPreviewSegment((prev) => prev && prev.id === id ? { ...prev, thumbnailUrl: updatedUrl } : prev);
    setShowBgRemover(false);
  };

  return (
    <div id="app-root" className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans select-none antialiased">
      {/* 1. Header Navigation Bar */}
      <header id="main-header" className="h-16 border-b border-slate-800 bg-slate-950 flex items-center justify-between px-3 md:px-6 z-10 shrink-0">
        <div className="flex items-center space-x-3 shrink-0">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-500/10">
            <Scissors className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm md:text-base tracking-tight bg-gradient-to-r from-blue-100 to-indigo-100 bg-clip-text text-transparent">
              LassoCut
            </h1>
            <p className="hidden sm:block text-[10px] text-slate-400 font-medium">Smart Transparent Image Cutter</p>
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

        <div className="flex items-center space-x-2 md:space-x-3">
          {/* Preset Selector */}
          <div className="relative">
            <select
              onChange={(e) => {
                const sample = SAMPLE_IMAGES.find((s) => s.id === e.target.value);
                if (sample) loadImage(sample.url, `${sample.id}.jpg`, sample.fallbackUrl);
              }}
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-lg text-xs text-slate-300 px-2 md:px-3 py-2 cursor-pointer outline-none transition-all max-w-[120px] sm:max-w-none"
              defaultValue="parrot"
            >
              <option disabled>Select Preset Image...</option>
              {SAMPLE_IMAGES.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  Sample: {sample.name}
                </option>
              ))}
            </select>
          </div>

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

          {/* Quick Help toggler */}
          <button
            onClick={() => setShowHelp(!showHelp)}
            className={`p-2 rounded-lg border transition-all cursor-pointer ${
              showHelp
                ? 'bg-blue-900/20 border-blue-800 text-blue-400'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggle Help Panel"
          >
            <HelpCircle className="h-4 w-4" />
          </button>

          {/* Mobile settings toggle */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
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
      <main id="main-workstation" className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* 2.1 Left Tool Shelf */}
        <aside
          id="left-tools"
          className="w-full md:w-16 h-14 md:h-auto border-b md:border-b-0 md:border-r border-slate-800 bg-slate-950 flex flex-row md:flex-col items-center justify-center md:justify-start py-1 md:py-4 px-4 md:px-0 gap-2 md:space-y-4 shrink-0"
        >
          <div className="flex flex-row md:flex-col items-center justify-center gap-1 md:space-y-2 w-full max-w-md md:max-w-none md:px-2">
            {[
              { id: 'magnetic', icon: Sparkles, label: 'Magnetic Lasso (M)', desc: 'Snaps automatically to contrast boundaries.' },
              { id: 'lasso', icon: Scissors, label: 'Freehand Lasso (L)', desc: 'Draw a custom selection area freely.' },
              { id: 'rectangle', icon: Square, label: 'Rectangle (R)', desc: 'Drag a rectangular bounding crop.' },
              { id: 'select', icon: MousePointer, label: 'Pan & Move (V)', desc: 'Pan or zoom without active drawing.' },
            ].map((tool) => {
              const IconComp = tool.icon;
              const isSelected = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => {
                    setActiveTool(tool.id as SelectionTool);
                    // Clear state when switching
                    setRectStart(null);
                    setRectEnd(null);
                  }}
                  className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer group relative ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900'
                  }`}
                  title={tool.label}
                >
                  <IconComp className="h-4.5 w-4.5 md:h-5 md:w-5" />
                  {/* Custom elegant tooltip */}
                  <span className="absolute hidden md:block left-14 bg-slate-950 border border-slate-800 text-slate-200 text-[10px] py-1 px-2.5 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20 font-sans">
                    <strong>{tool.label}</strong>: {tool.desc}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="hidden md:block w-8 border-t border-slate-800 my-1" />

          {/* Quick Clear Current Path Button */}
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

          {/* Magnetic backspace action */}
          {activeTool === 'magnetic' && activePath.length > 0 && (
            <button
              onClick={() => setActivePath((prev) => prev.slice(0, -1))}
              className="w-10 h-10 md:w-11 md:h-11 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center transition-all cursor-pointer shrink-0"
              title="Undo last point (Backspace)"
            >
              <Undo className="h-4 w-4 md:h-4.5 md:w-4.5" />
            </button>
          )}
        </aside>

        {/* 2.2 Interactive Canvas Area */}
        <div id="canvas-workspace" ref={containerRef} className="flex-1 h-full relative overflow-hidden bg-slate-900">
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
          <div id="canvas-hud-footer" className="absolute bottom-4 left-4 bg-slate-950/90 border border-slate-800/80 backdrop-blur px-3 py-1.5 rounded-xl flex items-center space-x-2.5 shadow-xl">
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

          {/* Interactive Tutorial Banner */}
          {showHelp && (
            <div id="instruction-card" className="absolute top-4 left-4 right-4 sm:right-auto max-w-sm bg-slate-950/95 border border-slate-800/80 backdrop-blur rounded-xl p-4 shadow-xl text-xs space-y-2.5 z-10">
              <div className="flex justify-between items-center">
                <span className="font-semibold text-blue-400 tracking-wider uppercase text-[10px] font-mono">Quick Workflow Guide</span>
                <button
                  onClick={() => setShowHelp(false)}
                  className="text-slate-500 hover:text-slate-300 cursor-pointer p-0.5"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {activeTool === 'magnetic' && (
                <div className="space-y-1 text-slate-300">
                  <p className="font-medium text-slate-200">🧲 Smart Magnetic Lasso Mode</p>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1 text-[11px]">
                    <li>Click once on image edge to start drawing.</li>
                    <li>Move mouse slowly along high-contrast boundaries.</li>
                    <li>Click anywhere to place anchor nodes manually.</li>
                    <li>Double-click or click start node to close.</li>
                    <li>Press <kbd className="bg-slate-900 border border-slate-800 text-slate-300 px-1 py-0.5 rounded text-[9px] font-mono">Backspace</kbd> to undo last anchor node.</li>
                  </ul>
                </div>
              )}

              {activeTool === 'lasso' && (
                <div className="space-y-1 text-slate-300">
                  <p className="font-medium text-slate-200">✏️ Freehand Lasso Mode</p>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1 text-[11px]">
                    <li>Hold and drag mouse to outline any shape.</li>
                    <li>Release mouse click to automatically close path.</li>
                  </ul>
                </div>
              )}

              {activeTool === 'rectangle' && (
                <div className="space-y-1 text-slate-300">
                  <p className="font-medium text-slate-200">⬛ Rectangle Select Mode</p>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1 text-[11px]">
                    <li>Drag box boundaries over desired parts.</li>
                    <li>Release to save rectangular bounding path.</li>
                  </ul>
                </div>
              )}

              {activeTool === 'select' && (
                <div className="space-y-1 text-slate-300">
                  <p className="font-medium text-slate-200">🖐️ Pan & Zoom Workspace</p>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-400 pl-1 text-[11px]">
                    <li>Drag on the screen to shift viewport.</li>
                    <li>Use mouse scroll wheel to dynamically zoom.</li>
                  </ul>
                </div>
              )}

              <div className="pt-2 border-t border-slate-900 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                <span>Hold <span className="bg-slate-900 border border-slate-800 text-slate-300 px-1 rounded">Space</span> to Pan</span>
                <span>Press <kbd className="bg-slate-900 border border-slate-800 text-slate-300 px-1 rounded">Esc</kbd> to Deselect</span>
              </div>
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
          className={`fixed md:static top-0 right-0 h-full md:h-auto w-80 max-w-[85vw] border-l border-slate-800 bg-slate-950 flex flex-col shrink-0 z-40 shadow-2xl md:shadow-none transition-transform duration-300 md:transform-none ${
            isSidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
          }`}
        >
          {/* Mobile sidebar header */}
          <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950 shrink-0">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Settings & Saved Cuts</span>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 hover:bg-slate-900 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Active selection settings panel */}
          <div id="selection-settings-card" className="p-4 border-b border-slate-800 space-y-4">
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
            {activeTool === 'magnetic' && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-medium text-slate-300">Snap Radius (px)</label>
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
                <p className="text-[10px] text-slate-500">Size of search envelope around cursor to sniff out edges.</p>
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

              {/* Input for name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-300">File Export Name</label>
                <div className="flex items-center space-x-1">
                  <input
                    type="text"
                    value={cutoutDraftName}
                    onChange={(e) => setCutoutDraftName(e.target.value)}
                    placeholder="Enter segment name..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-blue-500 font-sans"
                  />
                  <span className="text-xs text-slate-500 font-mono pr-2">.png</span>
                </div>
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

          {/* 2.4 Saved Segments Gallery (Scrollable) */}
          <div className="flex-1 overflow-hidden">
            <SegmentList
              segments={savedSegments}
              onDelete={handleDeleteSegment}
              onRename={handleRenameSegment}
              onClearAll={handleClearAllSegments}
              onSelectSegment={handleSelectSavedSegment}
            />
          </div>
        </aside>
      </main>

      {/* 3. Modal / Popup Overlay to Preview any Saved Segment with zoom controls */}
      <AnimatePresence>
        {previewSegment && (
          <motion.div
            id="preview-segment-modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
                <div className="flex items-center space-x-2">
                  <div className="bg-blue-500/10 p-1.5 rounded-lg border border-blue-500/20 text-blue-400">
                    <Eye className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-200">{previewSegment.name}</h3>
                    <p className="text-[10px] text-slate-500 font-mono font-medium">
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
              <div className="flex-1 h-96 bg-checkerboard flex items-center justify-center p-12 relative overflow-hidden border-b border-slate-800">
                <img
                  src={previewSegment.thumbnailUrl}
                  alt={previewSegment.name}
                  className="max-w-full max-h-full object-contain drop-shadow-2xl"
                  referrerPolicy="no-referrer"
                />
              </div>

              {/* Action Footer */}
              <div className="p-4 bg-slate-950/60 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono">
                  Saved: {new Date(previewSegment.createdAt).toLocaleTimeString()}
                </span>
                <div className="flex space-x-2.5">
                  <button
                    onClick={() => setShowBgRemover(true)}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-semibold shadow shadow-emerald-500/10 active:scale-[0.98] transition-all cursor-pointer"
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
                    className="flex items-center space-x-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow shadow-blue-500/10 active:scale-[0.98] transition-all cursor-pointer"
                  >
                    <Download className="h-4 w-4" />
                    <span>Download PNG</span>
                  </button>
                  <button
                    onClick={() => setPreviewSegment(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold border border-slate-700 cursor-pointer"
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
        {showAnimationStudio && (
          <AnimationStudio
            savedSegments={savedSegments}
            workspaceImage={image}
            onUpdateSegment={handleSaveCleanedSegment}
            onClose={() => setShowAnimationStudio(false)}
          />
        )}
      </AnimatePresence>

      {/* Background Remover Polish Overlay */}
      <AnimatePresence>
        {showBgRemover && previewSegment && (
          <BackgroundRemover
            segment={previewSegment}
            onSave={handleSaveCleanedSegment}
            onClose={() => setShowBgRemover(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
