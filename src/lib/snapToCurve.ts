import type { DataPoint } from '../types'
import { uid } from './uid'

export interface LumaImage {
  width: number
  height: number
  /** Row-major luminance 0-255 (darker = lower) */
  luma: Float32Array
}

export interface SnapOptions {
  /** Half-width of cross-track search in pixels (default 10) */
  halfWidth?: number
  /** Along-curve station sweep half-length in pixels (default 2) */
  alongSweep?: number
  /** Minimum darkness improvement vs local background to accept snap */
  minContrast?: number
}

const SAMPLE_STEP = 0.25

export async function loadLumaImage(imageUrl: string): Promise<LumaImage> {
  const img = await loadHtmlImage(imageUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not create canvas context')
  ctx.drawImage(img, 0, 0)
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const luma = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    luma[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
  }
  return { width, height, luma }
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to load image for snap'))
    img.src = url
  })
}

function sampleLuma(img: LumaImage, x: number, y: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  if (x0 < 0 || y0 < 0 || x0 >= img.width - 1 || y0 >= img.height - 1) {
    const xi = Math.min(img.width - 1, Math.max(0, Math.round(x)))
    const yi = Math.min(img.height - 1, Math.max(0, Math.round(y)))
    return img.luma[yi * img.width + xi]
  }
  const fx = x - x0
  const fy = y - y0
  const i = y0 * img.width + x0
  const a = img.luma[i]
  const b = img.luma[i + 1]
  const c = img.luma[i + img.width]
  const d = img.luma[i + img.width + 1]
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
}

function normalize(dx: number, dy: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return { x: 1, y: 0 }
  return { x: dx / len, y: dy / len }
}

function tangentAt(points: { px: number; py: number }[], i: number) {
  const n = points.length
  if (n < 2) return { x: 1, y: 0 }
  if (i <= 0) return normalize(points[1].px - points[0].px, points[1].py - points[0].py)
  if (i >= n - 1) {
    return normalize(points[n - 1].px - points[n - 2].px, points[n - 1].py - points[n - 2].py)
  }
  return normalize(points[i + 1].px - points[i - 1].px, points[i + 1].py - points[i - 1].py)
}

interface Profile {
  offsets: number[]
  samples: number[]
}

function sampleProfile(
  img: LumaImage,
  sx: number,
  sy: number,
  N: { x: number; y: number },
  halfWidth: number,
): Profile {
  const offsets: number[] = []
  const samples: number[] = []
  for (let o = -halfWidth; o <= halfWidth + 1e-9; o += SAMPLE_STEP) {
    offsets.push(o)
    samples.push(sampleLuma(img, sx + N.x * o, sy + N.y * o))
  }
  return { offsets, samples }
}

/**
 * Expand half-width until the dark band has bright margins on both sides
 * (so we can measure the full stroke thickness), capped for safety.
 */
function resolveHalfWidth(
  img: LumaImage,
  sx: number,
  sy: number,
  N: { x: number; y: number },
  baseHalf: number,
  minContrast: number,
): number {
  let half = Math.max(baseHalf, 4)
  const maxHalf = Math.min(40, Math.max(baseHalf * 3, baseHalf + 16))

  for (let iter = 0; iter < 8; iter++) {
    const { samples } = sampleProfile(img, sx, sy, N, half)
    const bg = estimateBackground(samples)
    const minL = Math.min(...samples)
    if (bg - minL < minContrast) return half

    const thr = inkThreshold(bg, minL)
    const first = samples.findIndex((v) => v <= thr)
    const last = (() => {
      for (let i = samples.length - 1; i >= 0; i--) if (samples[i] <= thr) return i
      return -1
    })()

    // Need bright margins: ink shouldn't start/end at the probe tips
    const margin = Math.ceil(2 / SAMPLE_STEP)
    const touchesEdge =
      first >= 0 && (first < margin || last > samples.length - 1 - margin)

    if (!touchesEdge || half >= maxHalf) return half
    half = Math.min(maxHalf, half + 4)
  }
  return half
}

function estimateBackground(samples: number[]): number {
  // Use the brighter of the two ends (outside the stroke)
  const edge = Math.max(2, Math.floor(samples.length * 0.08))
  let sum = 0
  let n = 0
  for (let i = 0; i < edge; i++) {
    sum += samples[i] + samples[samples.length - 1 - i]
    n += 2
  }
  return sum / n
}

function inkThreshold(bg: number, minL: number): number {
  // Midway toward the darkest ink - captures the body of a thick stroke, not just the edge
  return bg - (bg - minL) * 0.45
}

interface DarkRun {
  start: number
  end: number
  /** Darkness-weighted center index (fractional) */
  center: number
  width: number
  meanDark: number
}

function findDarkRuns(samples: number[], thr: number): DarkRun[] {
  const runs: DarkRun[] = []
  let i = 0
  while (i < samples.length) {
    while (i < samples.length && samples[i] > thr) i++
    if (i >= samples.length) break
    const start = i
    let weightSum = 0
    let weightedIdx = 0
    let darkSum = 0
    while (i < samples.length && samples[i] <= thr) {
      const w = Math.max(0.01, thr - samples[i] + 1)
      weightSum += w
      weightedIdx += w * i
      darkSum += samples[i]
      i++
    }
    const end = i - 1
    if (end >= start) {
      runs.push({
        start,
        end,
        center: weightedIdx / weightSum,
        width: end - start + 1,
        meanDark: darkSum / (end - start + 1),
      })
    }
  }
  return runs
}

/**
 * Center of the stroke along the normal - midpoint of the dark band,
 * not the darkest edge pixel.
 */
function strokeCenterOffset(
  profile: Profile,
  minContrast: number,
  preferNear = 0,
): number | null {
  const { offsets, samples } = profile
  const bg = estimateBackground(samples)
  const minL = Math.min(...samples)
  if (bg - minL < minContrast) return null

  const thr = inkThreshold(bg, minL)
  const runs = findDarkRuns(samples, thr)
  if (runs.length === 0) return null

  // Prefer the run nearest the guide point that is thick enough to be the curve
  const minWidth = Math.max(2, Math.ceil(1.5 / SAMPLE_STEP))
  const candidates = runs.filter((r) => r.width >= minWidth)
  const pool = candidates.length ? candidates : runs

  let best = pool[0]
  let bestScore = Infinity
  for (const r of pool) {
    const centerOff = offsets[0] + r.center * SAMPLE_STEP
    const dist = Math.abs(centerOff - preferNear)
    // Prefer wider, darker runs near the click
    const score = dist * 2 + r.meanDark * 0.05 - r.width * 0.15
    if (score < bestScore) {
      bestScore = score
      best = r
    }
  }

  return offsets[0] + best.center * SAMPLE_STEP
}

function snapOne(
  img: LumaImage,
  points: { px: number; py: number }[],
  i: number,
  halfWidth: number,
  alongSweep: number,
  minContrast: number,
): { px: number; py: number; offset: number } {
  const p = points[i]
  const T = tangentAt(points, i)
  const N = { x: -T.y, y: T.x }

  let bestScore = Infinity
  let best = { px: p.px, py: p.py, offset: 0 }
  let found = false

  for (let s = -alongSweep; s <= alongSweep; s += 1) {
    const sx = p.px + T.x * s
    const sy = p.py + T.y * s
    const half = resolveHalfWidth(img, sx, sy, N, halfWidth, minContrast)
    const profile = sampleProfile(img, sx, sy, N, half)
    const centerOff = strokeCenterOffset(profile, minContrast, 0)
    if (centerOff === null) continue

    const bg = estimateBackground(profile.samples)
    const minL = Math.min(...profile.samples)
    const contrast = bg - minL
    // Prefer stations near the original point with strong contrast
    const score = Math.abs(s) * 0.4 + Math.abs(centerOff) * 0.1 - contrast * 0.05

    if (score < bestScore) {
      bestScore = score
      best = {
        px: sx + N.x * centerOff,
        py: sy + N.y * centerOff,
        offset: centerOff,
      }
      found = true
    }
  }

  return found ? best : { px: p.px, py: p.py, offset: 0 }
}

/**
 * Snap each digitized point onto the centerline of the local ink stroke.
 */
export function snapPointsToCurve(
  img: LumaImage,
  points: DataPoint[],
  options: SnapOptions = {},
): DataPoint[] {
  if (points.length === 0) return points

  const halfWidth = options.halfWidth ?? 10
  const alongSweep = options.alongSweep ?? 2
  const minContrast = options.minContrast ?? 10

  const guide = points.map((p) => ({ px: p.px, py: p.py }))
  const snapped = guide.map((_, i) =>
    snapOne(img, guide, i, halfWidth, alongSweep, minContrast),
  )

  // Smooth only the cross-track offset so neighbors don't flip top/bottom edge
  const offsets = snapped.map((s) => s.offset)
  const smoothedOffsets = offsets.map((o, i) => {
    if (i === 0 || i === offsets.length - 1) return o
    return (offsets[i - 1] + o + offsets[i + 1]) / 3
  })

  const result = snapped.map((s, i) => {
    const T = tangentAt(guide, i)
    const N = { x: -T.y, y: T.x }
    // Rebuild from guide station (no along-sweep) using smoothed centerline offset
    const o = smoothedOffsets[i]
    // Blend: mostly measured center, slight neighbor-offset consensus
    const measured = { px: s.px, py: s.py }
    const fromGuide = {
      px: guide[i].px + N.x * o,
      py: guide[i].py + N.y * o,
    }
    return {
      px: measured.px * 0.65 + fromGuide.px * 0.35,
      py: measured.py * 0.65 + fromGuide.py * 0.35,
    }
  })

  return points.map((p, i) => ({
    ...p,
    id: p.id || uid('pt'),
    px: result[i].px,
    py: result[i].py,
    x: null,
    y: null,
  }))
}
