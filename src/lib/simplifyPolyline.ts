import type { DataPoint } from '../types'
import { uid } from './uid'

/**
 * Ramer-Douglas-Peucker simplification in image pixel space.
 * Keeps first/last; drops points within `epsilon` px of the chord.
 */
export function simplifyPolyline(
  points: DataPoint[],
  epsilon = 2,
): DataPoint[] {
  if (points.length <= 2) return points.map(clonePoint)

  const keep = new Array(points.length).fill(false)
  keep[0] = true
  keep[points.length - 1] = true
  rdp(points, 0, points.length - 1, epsilon, keep)

  const out: DataPoint[] = []
  for (let i = 0; i < points.length; i++) {
    if (!keep[i]) continue
    out.push({
      ...clonePoint(points[i]),
      id: uid('pt'),
    })
  }
  return out
}

function clonePoint(p: DataPoint): DataPoint {
  return { id: p.id, px: p.px, py: p.py, x: p.x, y: p.y }
}

function rdp(
  points: DataPoint[],
  start: number,
  end: number,
  epsilon: number,
  keep: boolean[],
) {
  if (end <= start + 1) return

  const a = points[start]
  const b = points[end]
  let maxDist = -1
  let maxIdx = -1

  for (let i = start + 1; i < end; i++) {
    const d = perpDist(points[i], a, b)
    if (d > maxDist) {
      maxDist = d
      maxIdx = i
    }
  }

  if (maxDist > epsilon && maxIdx >= 0) {
    keep[maxIdx] = true
    rdp(points, start, maxIdx, epsilon, keep)
    rdp(points, maxIdx, end, epsilon, keep)
  }
}

function perpDist(
  p: DataPoint,
  a: DataPoint,
  b: DataPoint,
): number {
  const dx = b.px - a.px
  const dy = b.py - a.py
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return Math.hypot(p.px - a.px, p.py - a.py)
  const t = ((p.px - a.px) * dx + (p.py - a.py) * dy) / len2
  const projX = a.px + t * dx
  const projY = a.py + t * dy
  return Math.hypot(p.px - projX, p.py - projY)
}
