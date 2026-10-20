export function getCleanupNavigation<T extends { id: string }>(frames: readonly T[], currentId: string) {
  const index = frames.findIndex(frame => frame.id === currentId);
  return {
    index,
    total: frames.length,
    previous: index > 0 ? frames[index - 1] : null,
    next: index >= 0 && index < frames.length - 1 ? frames[index + 1] : null,
  };
}
