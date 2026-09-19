type PreferenceReader = Pick<Storage, 'getItem'>;
type PreferenceWriter = Pick<Storage, 'setItem'>;

export function readUsageTipsPreference(storage: PreferenceReader | undefined, key: string): boolean {
  try { return storage?.getItem(key) !== 'false'; } catch { return true; }
}

export function saveUsageTipsPreference(storage: PreferenceWriter | undefined, key: string, visible: boolean): void {
  try { storage?.setItem(key, String(visible)); } catch { /* Dismissal still works when storage is unavailable. */ }
}

export function getUsageTipsStorage(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
}
