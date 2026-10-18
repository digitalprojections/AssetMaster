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
