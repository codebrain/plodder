import type { AxisFit } from './calibration'
import { uid } from './uid'
import type { AxisPoint, PhantomPoint } from '../types'

/**
 * Build phantom verification points:
 * 1) Midpoints between consecutive calibrated axis markers (along that axis)
 * 2) Grid crossings from every X marker × every Y marker
 */
export function generatePhantomGrid(
  xPoints: AxisPoint[],
  yPoints: AxisPoint[],
  xFit: AxisFit,
  yFit: AxisFit,
): PhantomPoint[] {
  const phantoms: PhantomPoint[] = []
  const seen = new Set<string>()

  const push = (px: number, py: number) => {
    const key = `${px.toFixed(1)},${py.toFixed(1)}`
    if (seen.has(key)) return
    seen.add(key)
    phantoms.push({
      id: uid('ph'),
      px,
      py,
      x: xFit.valid ? xFit.toValue(px) : null,
      y: yFit.valid ? yFit.toValue(py) : null,
    })
  }

  // Intermediate points between consecutive X markers (along the x-axis polyline)
  const xSorted = [...xPoints].sort((a, b) => a.px - b.px)
  for (let i = 0; i < xSorted.length - 1; i++) {
    const a = xSorted[i]
    const b = xSorted[i + 1]
    for (const t of [0.25, 0.5, 0.75]) {
      push(a.px + (b.px - a.px) * t, a.py + (b.py - a.py) * t)
    }
  }

  // Intermediate points between consecutive Y markers
  const ySorted = [...yPoints].sort((a, b) => b.py - a.py)
  for (let i = 0; i < ySorted.length - 1; i++) {
    const a = ySorted[i]
    const b = ySorted[i + 1]
    for (const t of [0.25, 0.5, 0.75]) {
      push(a.px + (b.px - a.px) * t, a.py + (b.py - a.py) * t)
    }
  }

  // Grid: each X marker's px crossed with each Y marker's py
  for (const xp of xPoints) {
    for (const yp of yPoints) {
      push(xp.px, yp.py)
    }
  }

  return phantoms
}
