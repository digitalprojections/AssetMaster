export type LayerMove = 'forward' | 'backward' | 'front' | 'back';

// Items are stored in paint order: back to front, shared by preview and export.
export function reorderLayers<T extends { id: string }>(items: T[], id: string, mode: LayerMove): T[] {
  const index = items.findIndex(item => item.id === id);
  if (index < 0) return items;
  const target = mode === 'front' ? items.length - 1
    : mode === 'back' ? 0
    : mode === 'forward' ? Math.min(items.length - 1, index + 1)
    : Math.max(0, index - 1);
  if (target === index) return items;
  const result = [...items];
  const [item] = result.splice(index, 1);
  result.splice(target, 0, item);
  return result;
}
