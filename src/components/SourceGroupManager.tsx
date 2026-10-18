import React, { useState } from 'react';
import type { SavedSegment } from '../types';
import { SOURCE_CATEGORIES, type SourceGroup } from '../utils/sourceGroups';

type Props = {
  groups: SourceGroup[]; disabled: boolean; selectedSourceId: string;
  onDelete: (label: string, sourceIds: string[]) => void;
  onSelect: (source: SavedSegment) => void;
  getStatus: (source: SavedSegment) => string | null;
};

export default function SourceGroupManager({ groups, disabled, selectedSourceId, onDelete, onSelect, getStatus }: Props) {
  const [query, setQuery] = useState('');
  const search = query.trim().toLowerCase();
  const visible = groups.filter(group => group.name.toLowerCase().includes(search) || group.sources.some(source => source.name.toLowerCase().includes(search)));
  return <section aria-label="Source Manager" className="space-y-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3">
    <div><h3 className="text-sm font-semibold text-slate-100">Source Manager</h3><p className="mt-1 text-[11px] text-slate-400">Manage cutouts by the video, folder, or image they came from.</p></div>
    <input aria-label="Find an input source" placeholder="Find a video, image, or cutout" value={query} onChange={event => setQuery(event.target.value)} className="w-full min-h-11 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-200" />
    <div className="max-h-[32rem] overflow-y-auto space-y-4">
      {SOURCE_CATEGORIES.map(category => {
        const items = visible.filter(group => group.category === category);
        return items.length ? <section key={category} aria-label={category} className="space-y-2">
          <h4 className="text-xs font-semibold text-indigo-300">{category} · {items.length}</h4>
          {items.map(group => <article key={group.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-2">
            <div className="flex items-center gap-2">
              <img src={group.sources[0].thumbnailUrl} alt="" loading="lazy" className="h-10 w-10 shrink-0 rounded bg-checkerboard object-contain" />
              <div className="min-w-0 flex-1"><p className="break-words text-xs font-semibold text-slate-100">{group.name}</p><p className="mt-1 text-[10px] text-slate-400">{group.sources.length} {group.sources.length === 1 ? 'cutout' : 'cutouts'} · {group.frameCount} timeline {group.frameCount === 1 ? 'frame' : 'frames'}</p></div>
            </div>
            <button disabled={disabled} onClick={() => onDelete(`source “${group.name}”`, group.sources.map(source => source.id))} aria-label={`Delete source group ${group.name}`} className="mt-2 w-full min-h-11 rounded-lg border border-rose-800 px-3 text-xs font-semibold text-rose-300 disabled:opacity-40">Delete Source</button>
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-3 text-xs text-slate-300">View Cutouts ({group.sources.length})</summary>
              <ul className="space-y-1">
                {group.sources.map(source => <li key={source.id} className="flex items-center gap-2 border-t border-slate-800 py-1">
                  <button aria-pressed={selectedSourceId === source.id} onClick={() => onSelect(source)} className="flex flex-1 min-w-0 min-h-11 items-center gap-2 text-left">
                    <img src={source.thumbnailUrl} alt="" loading="lazy" className="h-8 w-8 shrink-0 rounded object-contain bg-checkerboard" />
                    <span className="min-w-0"><span className="block break-words text-[11px] text-slate-200">{source.name}</span>{getStatus(source) && <span className="block text-[10px] text-amber-300">{getStatus(source)}</span>}</span>
                  </button>
                  <button disabled={disabled} onClick={() => onDelete(`cutout “${source.name}”`, [source.id])} aria-label={`Delete grouped cutout ${source.name}`} className="min-h-11 shrink-0 rounded border border-rose-900 px-2 text-xs text-rose-300 disabled:opacity-40">Delete</button>
                </li>)}
              </ul>
            </details>
          </article>)}
        </section> : null;
      })}
      {!visible.length && <p className="text-xs text-slate-400">No sources match this search.</p>}
    </div>
  </section>;
}
