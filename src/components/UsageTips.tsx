import React, { useEffect, useId, useRef, useState } from 'react';
import { CircleHelp, X } from 'lucide-react';
import { getUsageTipsStorage, readUsageTipsPreference, saveUsageTipsPreference } from '../utils/usageTips';

interface UsageTipsProps {
  preferenceKey: string;
  children: React.ReactNode;
}

/** Non-modal, viewport-bounded help that never takes space from the editor. */
export default function UsageTips({ preferenceKey, children }: UsageTipsProps) {
  const [visible, setVisible] = useState(() => readUsageTipsPreference(getUsageTipsStorage(), preferenceKey));
  const hostRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const panelId = useId();

  const changeVisibility = (next: boolean) => {
    setVisible(next);
    saveUsageTipsPreference(getUsageTipsStorage(), preferenceKey, next);
    if (!next && panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!visible) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!hostRef.current?.contains(event.target as Node)) changeVisibility(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        changeVisibility(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [visible, preferenceKey]);

  return (
    <div ref={hostRef} className="shrink-0" onKeyDown={event => event.stopPropagation()}>
      <button ref={triggerRef} type="button" onClick={() => changeVisibility(!visible)}
        aria-label={visible ? 'Hide usage tips' : 'Show usage tips'} aria-expanded={visible} aria-controls={panelId}
        title="Usage tips" style={{ minWidth: 36, minHeight: 36 }} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">
        <CircleHelp className="h-4 w-4" /><span className="hidden sm:inline">Tips</span>
      </button>
      {visible && (
        <section id={panelId} ref={panelRef} aria-label="Animation Studio usage tips"
          className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-indigo-400/40 bg-slate-950 shadow-2xl"
          style={{ right: 'max(0.5rem, env(safe-area-inset-right))', top: 'calc(env(safe-area-inset-top) + 4rem)', width: 'min(24rem, calc(100vw - 1rem))', maxHeight: 'calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 5rem)' }}>
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-700 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-100">Usage tips</h2>
            <button type="button" onClick={() => changeVisibility(false)} aria-label="Dismiss usage tips" style={{ minHeight: 36 }}
              className="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
              <X className="h-3.5 w-3.5" />Hide tips
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-3 text-[13px] leading-relaxed text-slate-300">
            {children}
          </div>
        </section>
      )}
    </div>
  );
}
