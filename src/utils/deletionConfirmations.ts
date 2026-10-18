export type FrameDeletionAction = 'timeline' | 'both';
export type DeletionConfirmations = Record<string, { frameAction: FrameDeletionAction }>;
const KEY = 'assetmaster.deletionConfirmations.v1';
type Reader = Pick<Storage, 'getItem'>;
type Writer = Pick<Storage, 'setItem'>;

export function readDeletionConfirmations(storage: Reader | undefined): DeletionConfirmations {
  try {
    const value = JSON.parse(storage?.getItem(KEY) ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const preferences: DeletionConfirmations = {};
    for (const [id, setting] of Object.entries(value)) {
      const action = (setting as { frameAction?: unknown } | null)?.frameAction;
      if (action === 'timeline' || action === 'both') preferences[id] = { frameAction: action };
    }
    return preferences;
  } catch { return {}; }
}

export function saveDeletionConfirmations(storage: Writer | undefined, preferences: DeletionConfirmations): boolean {
  if (!storage) return false;
  try { storage.setItem(KEY, JSON.stringify(preferences)); return true; } catch { return false; }
}

export function setGroupConfirmations(preferences: DeletionConfirmations, groupIds: readonly string[], muted: boolean, action?: FrameDeletionAction): DeletionConfirmations {
  const next = { ...preferences };
  for (const id of groupIds) {
    if (muted) next[id] = { frameAction: action ?? preferences[id]?.frameAction ?? 'timeline' };
    else delete next[id];
  }
  return next;
}

export function areGroupConfirmationsMuted(preferences: DeletionConfirmations, groupIds: readonly string[]): boolean {
  return groupIds.length > 0 && groupIds.every(id => Boolean(preferences[id]));
}

export function getMutedFrameAction(preferences: DeletionConfirmations, groupId: string, canDeleteSource: boolean): FrameDeletionAction | null {
  const action = preferences[groupId]?.frameAction;
  if (!action || (action === 'both' && !canDeleteSource)) return null;
  return action;
}
