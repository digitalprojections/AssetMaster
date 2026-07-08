import React, { useState } from 'react';
import { SavedSegment } from '../types';
import { Download, Trash2, Edit3, Check, X, Archive, FolderOpen, Upload, RotateCcw, Tags, Info } from 'lucide-react';
import JSZip from 'jszip';

interface SegmentListProps {
  segments: SavedSegment[];
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onUpdateTags: (id: string, tags: string[]) => void;
  onClearAll: () => void;
  onSelectSegment: (segment: SavedSegment) => void;
  onExportLibrary: () => void;
  onImportLibrary: () => void;
  onRestoreBackup: () => void;
}

export default function SegmentList({
  segments,
  onDelete,
  onRename,
  onUpdateTags,
  onClearAll,
  onSelectSegment,
  onExportLibrary,
  onImportLibrary,
  onRestoreBackup,
}: SegmentListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [tagDrafts, setTagDrafts] = useState<Record<string, string>>({});
  const [showLibraryHelp, setShowLibraryHelp] = useState(false);

  const startRename = (segment: SavedSegment) => {
    setEditingId(segment.id);
    // Strip file extension for cleaner editing
    const cleanName = segment.name.endsWith('.png')
      ? segment.name.slice(0, -4)
      : segment.name;
    setEditValue(cleanName);
  };

  const saveRename = (id: string) => {
    let finalName = editValue.trim() || 'cutout';
    if (!finalName.endsWith('.png')) {
      finalName += '.png';
    }
    onRename(id, finalName);
    setEditingId(null);
  };

  const commitTags = (segment: SavedSegment) => {
    const draftValue = tagDrafts[segment.id];
    if (draftValue === undefined) {
      return;
    }

    const nextTags = draftValue
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    onUpdateTags(segment.id, nextTags);
    setTagDrafts((prev) => {
      const next = { ...prev };
      delete next[segment.id];
      return next;
    });
  };

  // Helper to trigger a single image download
  const downloadSingle = (segment: SavedSegment) => {
    const link = document.createElement('a');
    link.href = segment.thumbnailUrl;
    link.download = segment.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Batch ZIP export using JSZip
  const exportAllToZip = async () => {
    if (segments.length === 0) return;
    setIsExporting(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder('cutouts');

      segments.forEach((segment) => {
        // segment.thumbnailUrl is "data:image/png;base64,..."
        const base64Data = segment.thumbnailUrl.split(',')[1];
        const filename = segment.name.endsWith('.png') ? segment.name : `${segment.name}.png`;
        folder?.file(filename, base64Data, { base64: true });
      });

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `image_cutouts_${Date.now()}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export ZIP:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div id="segment-list-container" className="flex flex-col h-full bg-slate-900 border-l border-slate-800 text-slate-100 font-sans">
      {/* Header section */}
      <div id="segment-list-header" className="p-4 border-b border-slate-800 bg-slate-900/50 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2 min-w-0 relative">
            <FolderOpen className="h-5 w-5 text-blue-400 shrink-0" />
            <h2 className="font-semibold text-sm tracking-wide uppercase truncate">Saved Cuts</h2>
            <span className="bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded-full font-mono font-bold shrink-0">
              {segments.length}
            </span>
            <button
              type="button"
              onClick={() => setShowLibraryHelp((prev) => !prev)}
              className="group relative flex h-6 w-6 items-center justify-center rounded-full border border-slate-800 bg-slate-950 text-slate-400 transition-all hover:border-slate-700 hover:text-slate-200 cursor-pointer"
              aria-label="Explain library save and load options"
              title="Library save/load help"
            >
              <Info className="h-3.5 w-3.5" />
              <span className="pointer-events-none absolute left-8 top-1/2 z-20 hidden -translate-y-1/2 whitespace-nowrap rounded border border-slate-800 bg-slate-950 px-2.5 py-1 text-[10px] text-slate-200 shadow-xl opacity-0 transition-opacity group-hover:opacity-100 md:block">
                What do library save/load buttons do?
              </span>
            </button>
            {showLibraryHelp && (
              <div className="absolute left-0 top-9 z-30 w-72 rounded-xl border border-slate-800 bg-slate-950/98 p-3 text-[11px] text-slate-300 shadow-2xl">
                <p className="font-semibold text-slate-100">Library buttons</p>
                <p className="mt-2">
                  <strong className="text-slate-100">Save Library</strong> downloads one JSON file containing your saved cutouts, names, tags, and cleanup state.
                </p>
                <p className="mt-2">
                  <strong className="text-slate-100">Load Library</strong> imports one of those JSON files and replaces the current saved cutout list.
                </p>
                <p className="mt-2">
                  <strong className="text-slate-100">Restore Backup</strong> restores the latest automatic browser backup stored on this device.
                </p>
                <button
                  type="button"
                  onClick={() => setShowLibraryHelp(false)}
                  className="mt-3 rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 transition-all hover:bg-slate-800 cursor-pointer"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
            <button
              id="batch-zip-export-btn"
              onClick={exportAllToZip}
              disabled={isExporting || segments.length === 0}
              className="flex items-center justify-center space-x-1 py-2.5 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
            >
              <Archive className="h-3.5 w-3.5" />
              <span>{isExporting ? 'Packaging...' : 'Export ZIP'}</span>
            </button>
            <button
              onClick={onExportLibrary}
              className="flex items-center justify-center space-x-1 py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs font-semibold transition-all cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Save Library</span>
            </button>
            <button
              onClick={onImportLibrary}
              className="flex items-center justify-center space-x-1 py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs font-semibold transition-all cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Load Library</span>
            </button>
            <button
              onClick={onRestoreBackup}
              className="flex items-center justify-center space-x-1 py-2.5 px-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-lg text-xs font-semibold transition-all cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Restore Backup</span>
            </button>
            <button
              id="clear-all-btn"
              onClick={onClearAll}
              disabled={segments.length === 0}
              className="col-span-2 text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer py-2.5 px-3 hover:bg-rose-950/20 rounded-lg border border-slate-800 hover:border-rose-900/30"
            >
              Clear All
            </button>
        </div>
      </div>

      {/* Segments Gallery Grid */}
      <div id="segment-list-gallery" className="flex-1 overflow-y-auto p-4 space-y-4">
        {segments.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
            <div className="p-4 bg-slate-950/40 rounded-full border border-slate-800/40">
              <FolderOpen className="h-8 w-8 text-slate-600" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium">No saved selections yet</p>
            <p className="text-xs text-slate-600 max-w-[200px]">
              Use the rectangle, lasso, or magnetic lasso tools to highlight and clip parts of the image.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {segments.map((segment) => (
              <div
                id={`segment-card-${segment.id}`}
                key={segment.id}
                className="group relative bg-slate-950/60 rounded-xl border border-slate-800/80 hover:border-slate-700/80 p-3 transition-all flex flex-col space-y-3 shadow-md hover:shadow-lg"
              >
                {/* Checkerboard Image Box */}
                <div
                  onClick={() => onSelectSegment(segment)}
                  className="w-full h-32 rounded-lg bg-checkerboard flex items-center justify-center relative cursor-zoom-in overflow-hidden border border-slate-800/60 group-hover:border-slate-700/60 shadow-inner"
                >
                  <img
                    src={segment.thumbnailUrl}
                    alt={segment.name}
                    className="max-w-[90%] max-h-[90%] object-contain drop-shadow-md transform transition-transform group-hover:scale-105 duration-300"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute top-2 left-2 bg-slate-900/95 backdrop-blur-sm border border-slate-800 text-[10px] font-mono px-1.5 py-0.5 rounded text-slate-400">
                    {segment.bounds.width} × {segment.bounds.height} px
                  </div>
                  <div className="absolute top-2 right-2 bg-blue-900/90 backdrop-blur-sm border border-blue-800 text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded text-blue-300 shadow">
                    {segment.type}
                  </div>
                </div>

                {/* Info and action row */}
                <div className="flex flex-col space-y-2">
                  {editingId === segment.id ? (
                    <div className="flex items-center space-x-1">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(segment.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 bg-slate-900 border border-blue-500 rounded px-2 py-1 text-xs text-white outline-none font-sans"
                        autoFocus
                      />
                      <button
                        onClick={() => saveRename(segment.id)}
                        className="p-1 hover:bg-emerald-950 text-emerald-400 rounded transition-colors"
                      >
                        <Check className="h-4.5 w-4.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 hover:bg-rose-950 text-rose-400 rounded transition-colors"
                      >
                        <X className="h-4.5 w-4.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-slate-200 truncate pr-2 max-w-[150px]">
                        {segment.name}
                      </h3>
                      <button
                        onClick={() => startRename(segment)}
                        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 p-1 hover:bg-slate-800 text-slate-400 hover:text-blue-400 rounded transition-all cursor-pointer"
                        title="Rename file"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center space-x-1.5 text-[10px] text-slate-500">
                      <Tags className="h-3.5 w-3.5 text-slate-600" />
                      <span>Tags</span>
                    </div>
                    <input
                      type="text"
                      value={tagDrafts[segment.id] ?? (segment.tags ?? []).join(', ')}
                      onChange={(e) => setTagDrafts((prev) => ({ ...prev, [segment.id]: e.target.value }))}
                      onBlur={() => commitTags(segment)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          commitTags(segment);
                        }
                        if (e.key === 'Escape') {
                          setTagDrafts((prev) => {
                            const next = { ...prev };
                            delete next[segment.id];
                            return next;
                          });
                        }
                      }}
                      placeholder="walk, idle, effect"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 outline-none focus:border-blue-500"
                    />
                    {segment.tags && segment.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {segment.tags.map((tag) => (
                          <span
                            key={`${segment.id}-${tag}`}
                            className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-200"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 pt-1 border-t border-slate-900 justify-end">
                    <button
                      onClick={() => downloadSingle(segment)}
                      className="flex-1 flex items-center justify-center space-x-1 px-2.5 py-1.5 bg-slate-900 hover:bg-blue-900/30 border border-slate-800 hover:border-blue-800 text-slate-300 hover:text-blue-200 rounded-lg text-xs font-medium transition-all cursor-pointer"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Download</span>
                    </button>
                    <button
                      onClick={() => onDelete(segment.id)}
                      className="p-1.5 bg-slate-900 hover:bg-rose-950/40 border border-slate-800 hover:border-rose-900/60 text-slate-400 hover:text-rose-400 rounded-lg transition-all cursor-pointer"
                      title="Delete saved cutout"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
