import React, { useRef, useState } from 'react';
import { Copy, GripVertical, Trash2 } from 'lucide-react';
import type { AnimationFrame } from '../types';

type SelectionIntent = { range?: boolean; toggle?: boolean };
interface AnimationTimelineProps {
  frames: AnimationFrame[];
  activeFrameIndex: number;
  selectedIds: ReadonlySet<string>;
  clipboardCount: number;
  message: string;
  onSelect: (index: number, intent: SelectionIntent) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onReverse: () => void;
  onMoveFrames: (ids: string[], insertion: number) => void;
  onShift: (index: number, direction: 'left' | 'right') => void;
  onDuplicate: (index: number) => void;
  onRemove: (index: number) => void;
  getTransform: (frame: AnimationFrame, scale: number) => string;
}

export default function AnimationTimeline({ frames, activeFrameIndex, selectedIds, clipboardCount, message,
  onSelect, onSelectAll, onClearSelection, onCopy, onPaste, onReverse, onMoveFrames, onShift,
  onDuplicate, onRemove, getTransform }: AnimationTimelineProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointer: number; x: number; y: number; ids: string[]; dragging: boolean; insertion: number } | null>(null);
  const suppressClick = useRef(false);
  const [dropBoundary, setDropBoundary] = useState<number | null>(null);
  const [draggedIds, setDraggedIds] = useState<Set<string>>(() => new Set());
  const selectedCount = selectedIds.size;
  const buttonClass = 'min-h-8 rounded-lg border border-slate-700 bg-slate-900 px-2.5 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed';

  const startDrag = (event: React.PointerEvent<HTMLDivElement>, index: number) => {
    suppressClick.current = false;
    if (event.button !== 0 || event.shiftKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input')) return;
    // Touch users can scroll the strip normally; the grip provides a dedicated drag surface.
    if (event.pointerType !== 'mouse' && !target.closest('[data-drag-grip]')) return;
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY,
      ids: selectedIds.has(frames[index].id) ? frames.filter(frame => selectedIds.has(frame.id)).map(frame => frame.id) : [frames[index].id],
      dragging: false, insertion: index };
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    if (!current.dragging && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 6) return;
    if (!current.dragging) {
      current.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      if (!selectedIds.has(current.ids[0])) onSelect(frames.findIndex(frame => frame.id === current.ids[0]), {});
      setDraggedIds(new Set(current.ids));
    }
    event.preventDefault();
    const strip = viewport.current;
    if (!strip) return;
    const bounds = strip.getBoundingClientRect();
    if (event.clientX < bounds.left + 28) strip.scrollLeft -= 14;
    if (event.clientX > bounds.right - 28) strip.scrollLeft += 14;
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-timeline-index]');
    if (hit && strip.contains(hit)) {
      const targetIndex = Number(hit.dataset.timelineIndex);
      const rect = hit.getBoundingClientRect();
      current.insertion = targetIndex + (event.clientX >= rect.left + rect.width / 2 ? 1 : 0);
    } else if (event.clientX >= bounds.right) current.insertion = frames.length;
    else if (event.clientX <= bounds.left) current.insertion = 0;
    setDropBoundary(current.insertion);
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    gesture.current = null;
    if (current.dragging) {
      suppressClick.current = true;
      if (!cancelled) onMoveFrames(current.ids, current.insertion);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDropBoundary(null);
    setDraggedIds(new Set());
  };

  return <section aria-label="Frame sequence timeline" className="p-3 border-t border-slate-800 bg-slate-950/80 space-y-2 shrink-0"
    onKeyDown={event => {
      if ((event.target as HTMLElement).matches('input')) return;
      if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v'].includes(event.key.toLowerCase())) {
        event.preventDefault(); event.stopPropagation();
        if (event.key.toLowerCase() === 'a') onSelectAll();
        if (event.key.toLowerCase() === 'c' && selectedCount) onCopy();
        if (event.key.toLowerCase() === 'v' && clipboardCount) onPaste();
      }
    }}>
    <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
      <h3 className="font-semibold text-slate-300">Frame Sequence Timeline</h3>
      <span className="font-mono text-indigo-300">{selectedCount} selected · {frames.length} total frames</span>
    </div>
    <div className="flex flex-wrap items-center gap-1.5">
      <button type="button" className={buttonClass} onClick={onSelectAll} disabled={selectedCount === frames.length}>Select all</button>
      <button type="button" className={buttonClass} onClick={onClearSelection} disabled={!selectedCount}>Clear selection</button>
      <button type="button" className={buttonClass} onClick={onCopy} disabled={!selectedCount}>Copy selection</button>
      <button type="button" className={buttonClass} onClick={onPaste} disabled={!clipboardCount}>{frames.length ? 'Paste after active' : 'Paste frames'}{clipboardCount ? ` (${clipboardCount})` : ''}</button>
      <button type="button" className={buttonClass} onClick={onReverse} disabled={selectedCount < 2}>Reverse selection</button>
      <button type="button" className={buttonClass} disabled={!selectedCount || selectedIds.has(frames[0]?.id)}
        onClick={() => { const first = frames.findIndex(frame => selectedIds.has(frame.id)); onMoveFrames([...selectedIds], first - 1); }}>Move selection left</button>
      <button type="button" className={buttonClass} disabled={!selectedCount || selectedIds.has(frames[frames.length - 1]?.id)}
        onClick={() => { let last = -1; frames.forEach((frame, index) => { if (selectedIds.has(frame.id)) last = index; }); onMoveFrames([...selectedIds], last + 2); }}>Move selection right</button>
    </div>
    <p className="text-[10px] text-slate-400">Shift-click selects a range. Ctrl/Cmd-click or checkboxes select individual frames. Drag frames to reorder; on touch, drag the grip.</p>
    <p role="status" aria-live="polite" className="text-[10px] text-indigo-300 min-h-3">{message}</p>
    <div ref={viewport} className="flex gap-2 overflow-x-auto py-1 pb-2 scrollbar-thin">
      {frames.map((frame, idx) => {
        const isActive = idx === activeFrameIndex;
        const selected = selectedIds.has(frame.id);
        return <div key={frame.id} role="group" aria-label={`Frame ${idx + 1}`} aria-current={isActive ? 'step' : undefined}
          data-timeline-index={idx} data-frame-id={frame.id} tabIndex={0}
          onDragStart={event => event.preventDefault()}
          onPointerDown={event => startDrag(event, idx)} onPointerMove={moveDrag}
          onPointerUp={event => finishDrag(event)} onPointerCancel={event => finishDrag(event, true)}
          onLostPointerCapture={event => finishDrag(event, true)}
          onClick={event => { if (!suppressClick.current) onSelect(idx, { range: event.shiftKey, toggle: event.ctrlKey || event.metaKey }); }}
          onKeyDown={event => {
            if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            onSelect(idx, { range: event.shiftKey, toggle: event.ctrlKey || event.metaKey });
          }}
          className={`relative w-24 h-28 rounded-xl border flex flex-col p-1.5 cursor-grab active:cursor-grabbing shrink-0 select-none ${selected ? 'border-indigo-400 bg-indigo-950/60' : 'border-slate-700 bg-slate-900'} ${isActive ? 'ring-2 ring-indigo-400/50' : ''} ${draggedIds.has(frame.id) ? 'opacity-50' : ''} ${dropBoundary === idx ? 'before:absolute before:-left-1.5 before:inset-y-0 before:w-1 before:bg-emerald-400' : ''} ${dropBoundary === frames.length && idx === frames.length - 1 ? 'after:absolute after:-right-1 after:inset-y-0 after:w-1 after:bg-emerald-400' : ''}`}>
          <div className="flex items-center justify-between pb-1 text-xs">
            <label className="inline-flex min-w-7 min-h-7 items-center justify-center cursor-pointer" onClick={event => event.stopPropagation()}>
            <input type="checkbox" checked={selected} aria-label={`Select frame ${idx + 1}`} className="h-4 w-4 accent-indigo-500"
              onClick={event => event.stopPropagation()} onChange={() => onSelect(idx, { toggle: true })} />
            </label>
            <span className="font-mono text-slate-200">#{idx + 1}</span>
            <span data-drag-grip title="Drag to reorder frame selection" style={{ touchAction: 'none' }} className="inline-flex min-w-7 min-h-7 items-center justify-center text-slate-400"><GripVertical className="w-4 h-4 pointer-events-none" /></span>
          </div>
          <div className="flex-1 min-h-0 bg-checkerboard rounded-lg flex items-center justify-center overflow-hidden">
            <img src={frame.thumbnailUrl} alt={`Frame ${idx + 1}`} draggable={false} className="max-w-[85%] max-h-[85%] object-contain" style={{ transform: getTransform(frame, 0.4) }} />
          </div>
          <div className="flex justify-between items-center mt-1 text-slate-300">
            <div className="flex gap-1">
              <button type="button" disabled={idx === 0} onClick={event => { event.stopPropagation(); onShift(idx, 'left'); }} title="Move Left" aria-label={`Move frame ${idx + 1} left`} className="disabled:opacity-20">◀</button>
              <button type="button" disabled={idx === frames.length - 1} onClick={event => { event.stopPropagation(); onShift(idx, 'right'); }} title="Move Right" aria-label={`Move frame ${idx + 1} right`} className="disabled:opacity-20">▶</button>
            </div>
            <button type="button" onClick={event => { event.stopPropagation(); onDuplicate(idx); }} title="Duplicate Frame" aria-label={`Duplicate frame ${idx + 1}`}><Copy className="h-3.5 w-3.5" /></button>
            <button type="button" onClick={event => { event.stopPropagation(); onRemove(idx); }} title="Delete Frame" aria-label={`Delete frame ${idx + 1}`}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>;
      })}
    </div>
  </section>;
}
