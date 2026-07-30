import type { TraceCurveStyle } from '../types'

export type { TraceCurveStyle }

export const TRACE_CURVE_OPTIONS: {
  value: TraceCurveStyle
  label: string
  description: string
}[] = [
  {
    value: 'smooth',
    label: 'Smooth',
    description:
      'Curve passes through every point with stable centripetal Catmull-Rom smoothing (default).',
  },
  {
    value: 'straight',
    label: 'Straight',
    description: 'Connect points with straight line segments - no smoothing.',
  },
  {
    value: 'classic',
    label: 'Classic',
    description:
      'Uniform Catmull-Rom spline through points; smoother but can overshoot or loop.',
  },
  {
    value: 'rounded',
    label: 'Round',
    description: 'Chaikin corner-cutting - softens corners without forcing the path through mid-edges.',
  },
]

export const DEFAULT_TRACE_CURVE: TraceCurveStyle = 'smooth'

type Pt = { x: number; y: number }

/** Build the display polyline for the chosen trace curve style. */
export function buildTraceCurve(
  points: Pt[],
  style: TraceCurveStyle = DEFAULT_TRACE_CURVE,
  segmentsPerSpan = 12,
): Pt[] {
  if (points.length < 2) return points.slice()
  switch (style) {
    case 'straight':
      return points.slice()
    case 'classic':
      return uniformCatmullRom(points, segmentsPerSpan)
    case 'rounded':
      return chaikin(points, 3)
    case 'smooth':
    default:
      return centripetalCatmullRom(points, segmentsPerSpan)
  }
}

function centripetalCatmullRom(points: Pt[], segmentsPerSpan: number): Pt[] {
  if (points.length === 2) return points.slice()
  const out: Pt[] = []
  const n = points.length
  const alpha = 0.5

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(n - 1, i + 2)]

    const t0 = 0
    const t1 = t0 + Math.pow(dist(p0, p1), alpha)
    const t2 = t1 + Math.pow(dist(p1, p2), alpha)
    const t3 = t2 + Math.pow(dist(p2, p3), alpha)

    for (let s = 0; s < segmentsPerSpan; s++) {
      const t = t1 + ((t2 - t1) * s) / segmentsPerSpan
      out.push(centripetal(p0, p1, p2, p3, t0, t1, t2, t3, t))
    }
  }
  out.push(points[n - 1])
  return out
}

function uniformCatmullRom(points: Pt[], segmentsPerSpan: number): Pt[] {
  if (points.length === 2) return points.slice()
  const out: Pt[] = []
  const n = points.length

  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(n - 1, i + 2)]

    for (let s = 0; s < segmentsPerSpan; s++) {
      const t = s / segmentsPerSpan
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  out.push(points[n - 1])
  return out
}

/** Chaikin corner cutting - rounds corners; does not pass through original vertices after first cut. */
function chaikin(points: Pt[], iterations: number): Pt[] {
  let pts = points.slice()
  for (let iter = 0; iter < iterations; iter++) {
    if (pts.length < 2) break
    const next: Pt[] = [pts[0]]
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      next.push({
        x: 0.75 * a.x + 0.25 * b.x,
        y: 0.75 * a.y + 0.25 * b.y,
      })
      next.push({
        x: 0.25 * a.x + 0.75 * b.x,
        y: 0.25 * a.y + 0.75 * b.y,
      })
    }
    next.push(pts[pts.length - 1])
    pts = next
  }
  return pts
}

function dist(a: Pt, b: Pt) {
  return Math.hypot(b.x - a.x, b.y - a.y) || 1e-6
}

function centripetal(
  p0: Pt,
  p1: Pt,
  p2: Pt,
  p3: Pt,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  t: number,
) {
  const a1 = lerpPoint(p0, p1, safeDiv(t - t0, t1 - t0))
  const a2 = lerpPoint(p1, p2, safeDiv(t - t1, t2 - t1))
  const a3 = lerpPoint(p2, p3, safeDiv(t - t2, t3 - t2))
  const b1 = lerpPoint(a1, a2, safeDiv(t - t0, t2 - t0))
  const b2 = lerpPoint(a2, a3, safeDiv(t - t1, t3 - t1))
  return lerpPoint(b1, b2, safeDiv(t - t1, t2 - t1))
}

function safeDiv(n: number, d: number) {
  return Math.abs(d) < 1e-9 ? 0 : n / d
}

function lerpPoint(a: Pt, b: Pt, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Stroke a path of points on a canvas context. */
export function strokePoints(ctx: CanvasRenderingContext2D, points: Pt[]) {
  if (points.length === 0) return
  ctx.beginPath()
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  })
  ctx.stroke()
}
