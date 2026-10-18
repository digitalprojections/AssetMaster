import React from 'react';

type Props = {
  label: string; frameCount: number; sourceCount: number; sharedSourceCount: number;
  canDeleteSources: boolean; onCancel: () => void; onConfirm: () => void;
};

export default function BulkFrameDeletionDialog({ label, frameCount, sourceCount, sharedSourceCount, canDeleteSources, onCancel, onConfirm }: Props) {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/80 flex items-center justify-center p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="bulk-delete-title" aria-describedby="bulk-delete-summary"
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-xl"
        onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); onCancel(); }
          if (event.key === 'Tab') {
            const buttons = Array.from((event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
            const first = buttons[0], last = buttons[buttons.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
          }
        }}>
        <h2 id="bulk-delete-title" className="text-lg font-semibold text-white">Delete {label}?</h2>
        <p id="bulk-delete-summary" className="mt-2 text-sm text-slate-300">This will delete {sourceCount} saved {sourceCount === 1 ? 'cutout' : 'cutouts'} and all {frameCount} linked timeline {frameCount === 1 ? 'frame' : 'frames'}.</p>
        {sharedSourceCount > 0 && <p className="mt-2 text-sm text-amber-200">{sharedSourceCount} shared {sharedSourceCount === 1 ? 'source stays' : 'sources stay'} because other timeline frames still use them.</p>}
        <p className="mt-2 text-sm text-slate-400">Items outside this selection stay unchanged. Undo restores this operation.</p>
        <div className="mt-5 flex flex-col gap-2">
          <button autoFocus onClick={onCancel} className="min-h-11 rounded-xl border border-slate-600 px-4 text-sm text-slate-200">Cancel</button>
          <button disabled={!canDeleteSources || !sourceCount} onClick={onConfirm} className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white disabled:opacity-40">Delete Source and Frames</button>
        </div>
      </section>
    </div>
  );
}
