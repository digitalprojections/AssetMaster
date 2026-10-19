const KEY = 'assetmaster.cleanup.borderDetection.session.v1';
let memoryValue = true;

export function getCleanupSessionStorage(): Storage | undefined {
  try { return window.sessionStorage; } catch { return undefined; }
}

export function readBorderDetection(storage: Pick<Storage, 'getItem'> | undefined): boolean {
  try {
    const value = storage?.getItem(KEY);
    if (value === 'true' || value === 'false') memoryValue = value === 'true';
  } catch { /* Keep session memory when browser storage is blocked. */ }
  return memoryValue;
}

export function saveBorderDetection(storage: Pick<Storage, 'setItem'> | undefined, enabled: boolean): void {
  memoryValue = enabled;
  try { storage?.setItem(KEY, String(enabled)); } catch { /* In-memory session fallback. */ }
}


const SETTINGS_KEY = 'assetmaster.cleanup.settings.session.v1';

export interface CleanupSettings {
  activeTool: 'magic-wand' | 'eraser' | 'shave';
  eraserMode: 'manual' | 'color-match';
  magicTolerance: number;
  keyStrengthPercent: number;
  keyEdgeFadePercent: number;
  magicBrushSize: number;
  brushSize: number;
  shaveWidth: number;
  manualKeyColor: string;
  panMode: boolean;
  viewZoom: number;
}

export const DEFAULT_CLEANUP_SETTINGS: Readonly<CleanupSettings> = Object.freeze({
  activeTool: 'magic-wand', eraserMode: 'manual', magicTolerance: 30,
  keyStrengthPercent: 100, keyEdgeFadePercent: 45, magicBrushSize: 10,
  brushSize: 16, shaveWidth: 1, manualKeyColor: '#ffffff', panMode: false, viewZoom: 1,
});
let memorySettings: CleanupSettings = { ...DEFAULT_CLEANUP_SETTINGS };

export function normalizeCleanupSettings(value: unknown): CleanupSettings {
  const settings = { ...DEFAULT_CLEANUP_SETTINGS };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return settings;
  const input = value as Record<string, unknown>;
  const ranges = { magicTolerance: [0, 150], keyStrengthPercent: [0, 100], keyEdgeFadePercent: [0, 100],
    magicBrushSize: [2, 32], brushSize: [2, 60], shaveWidth: [1, 6], viewZoom: [1, 12] } as const;
  for (const key of Object.keys(ranges) as (keyof typeof ranges)[]) {
    const next = input[key];
    const [min, max] = ranges[key];
    if (typeof next === 'number' && Number.isFinite(next) && next >= min && next <= max
      && (key === 'viewZoom' || Number.isInteger(next))) settings[key] = next;
  }
  if (input.activeTool === 'magic-wand' || input.activeTool === 'eraser' || input.activeTool === 'shave') settings.activeTool = input.activeTool;
  if (input.eraserMode === 'manual' || input.eraserMode === 'color-match') settings.eraserMode = input.eraserMode;
  if (typeof input.panMode === 'boolean') settings.panMode = input.panMode;
  if (typeof input.manualKeyColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.manualKeyColor)) settings.manualKeyColor = input.manualKeyColor;
  return settings;
}

export function readCleanupSettings(storage: Pick<Storage, 'getItem'> | undefined): CleanupSettings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (raw) memorySettings = normalizeCleanupSettings(JSON.parse(raw));
  } catch { /* Preserve session memory when browser storage is blocked or corrupt. */ }
  return { ...memorySettings };
}

export function saveCleanupSettings(storage: Pick<Storage, 'setItem'> | undefined, settings: CleanupSettings): void {
  memorySettings = normalizeCleanupSettings(settings);
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(memorySettings)); } catch { /* In-memory session fallback. */ }
}
