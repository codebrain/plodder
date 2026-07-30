/** Distance from point to segment AB, with closest point on the segment. */
export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { dist: number; cx: number; cy: number; t: number } {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) {
    return { dist: Math.hypot(px - ax, py - ay), cx: ax, cy: ay, t: 0 }
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return { dist: Math.hypot(px - cx, py - cy), cx, cy, t }
}

/**
 * Find the polyline segment nearest to (px, py).
 * Returns insert index (after segment start) when within maxDist.
 */
export function nearestSegmentInsert(
  points: { px: number; py: number }[],
  px: number,
  py: number,
  maxDist: number,
): { insertAt: number; dist: number; cx: number; cy: number } | null {
  if (points.length < 2) return null

  let best: { insertAt: number; dist: number; cx: number; cy: number } | null = null

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const hit = distToSegment(px, py, a.px, a.py, b.px, b.py)
    // Prefer interior of segment for insert (not exactly on vertices)
    if (hit.t <= 0.02 || hit.t >= 0.98) continue
    if (hit.dist > maxDist) continue
    if (!best || hit.dist < best.dist) {
      best = { insertAt: i + 1, dist: hit.dist, cx: hit.cx, cy: hit.cy }
    }
  }

  return best
}
