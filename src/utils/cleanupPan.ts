type Point = { x: number; y: number };

/** Convert a viewport drag to native scroll offsets. The browser clamps the far edge. */
export function panScroll(scroll: Point, start: Point, current: Point): Point {
  return { x: Math.max(0, scroll.x + start.x - current.x), y: Math.max(0, scroll.y + start.y - current.y) };
}
