import type { AxisPoint, AxisScale } from '../types'

export interface AxisFit {
  scale: AxisScale
  /** Maps pixel position along the primary axis to data value */
  toValue: (pixel: number) => number | null
  /** Maps data value back to pixel (for overlays / diagnostics) */
  toPixel: (value: number) => number | null
  valid: boolean
  pointCount: number
  /** Suggest switching to log when Linear is used across decades */
  scaleWarning: string | null
}

interface CalibSample {
  pixel: number
  /** Transformed axis value (log/linear/reciprocal space) */
  t: number
  value: number
}

function transformValue(value: number, scale: AxisScale): number | null {
  switch (scale) {
    case 'linear':
      return value
    case 'log10':
      return value > 0 ? Math.log10(value) : null
    case 'loge':
      return value > 0 ? Math.log(value) : null
    case 'log2':
      return value > 0 ? Math.log2(value) : null
    case 'reciprocal':
      return value !== 0 ? 1 / value : null
    case 'sqrt':
      return value >= 0 ? Math.sqrt(value) : null
    case 'squared':
      // Signed square so negative values stay invertible: sign(v)·v²
      return Math.sign(value) * value * value
    case 'asinh':
      // Soft log-like for data that crosses zero
      return Math.asinh(value)
  }
}

function inverseTransform(t: number, scale: AxisScale): number {
  switch (scale) {
    case 'linear':
      return t
    case 'log10':
      return 10 ** t
    case 'loge':
      return Math.exp(t)
    case 'log2':
      return 2 ** t
    case 'reciprocal':
      return 1 / t
    case 'sqrt':
      return t * t
    case 'squared':
      return Math.sign(t) * Math.sqrt(Math.abs(t))
    case 'asinh':
      return Math.sinh(t)
  }
}

function buildSamples(
  points: AxisPoint[],
  scale: AxisScale,
  axis: 'x' | 'y',
): CalibSample[] {
  const samples: CalibSample[] = []
  for (const p of points) {
    if (p.value === null || !Number.isFinite(p.value)) continue
    const pixel = axis === 'x' ? p.px : p.py
    const t = transformValue(p.value, scale)
    if (t === null || !Number.isFinite(t) || !Number.isFinite(pixel)) continue
    samples.push({ pixel, t, value: p.value })
  }
  // Sort by pixel; if two share a pixel, keep the later one
  samples.sort((a, b) => a.pixel - b.pixel)
  const dedup: CalibSample[] = []
  for (const s of samples) {
    if (dedup.length && Math.abs(dedup[dedup.length - 1].pixel - s.pixel) < 1e-6) {
      dedup[dedup.length - 1] = s
    } else {
      dedup.push(s)
    }
  }
  return dedup
}

/**
 * Piecewise-linear interpolation in transformed space between neighboring
 * calibration markers. Extrapolates using the nearest end segment.
 * This keeps each marker exact and avoids global least-squares skew on log axes.
 */
function interpolateT(samples: CalibSample[], pixel: number): number | null {
  if (samples.length < 2) return null

  if (pixel <= samples[0].pixel) {
    return lerpT(samples[0], samples[1], pixel)
  }
  for (let i = 0; i < samples.length - 1; i++) {
    if (pixel <= samples[i + 1].pixel) {
      return lerpT(samples[i], samples[i + 1], pixel)
    }
  }
  const n = samples.length
  return lerpT(samples[n - 2], samples[n - 1], pixel)
}

function lerpT(a: CalibSample, b: CalibSample, pixel: number): number | null {
  const span = b.pixel - a.pixel
  if (Math.abs(span) < 1e-12) return a.t
  const u = (pixel - a.pixel) / span
  return a.t + u * (b.t - a.t)
}

function interpolatePixel(samples: CalibSample[], t: number): number | null {
  if (samples.length < 2) return null
  const sorted = [...samples].sort((a, b) => a.t - b.t)

  if (t <= sorted[0].t) {
    return lerpPixel(sorted[0], sorted[1], t)
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    if (t <= sorted[i + 1].t) {
      return lerpPixel(sorted[i], sorted[i + 1], t)
    }
  }
  const n = sorted.length
  return lerpPixel(sorted[n - 2], sorted[n - 1], t)
}

function lerpPixel(a: CalibSample, b: CalibSample, t: number): number | null {
  const span = b.t - a.t
  if (Math.abs(span) < 1e-15) return a.pixel
  const u = (t - a.t) / span
  return a.pixel + u * (b.pixel - a.pixel)
}

function scaleWarningFor(
  scale: AxisScale,
  samples: CalibSample[],
): string | null {
  if (scale !== 'linear' || samples.length < 2) return null
  const vals = samples.map((s) => Math.abs(s.value)).filter((v) => v > 0)
  if (vals.length < 2) return null
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (min > 0 && max / min >= 50) {
    return 'Values span many orders of magnitude - try Log₁₀, Log₂, or Logₑ if this axis is logarithmic'
  }
  return null
}

/**
 * Fit an axis from 2+ calibration points.
 * X-axis uses pixel X; Y-axis uses pixel Y.
 */
export function fitAxis(
  points: AxisPoint[],
  scale: AxisScale,
  axis: 'x' | 'y',
): AxisFit {
  const samples = buildSamples(points, scale, axis)
  const warning = scaleWarningFor(scale, samples)

  if (samples.length < 2) {
    return {
      scale,
      toValue: () => null,
      toPixel: () => null,
      valid: false,
      pointCount: samples.length,
      scaleWarning: warning,
    }
  }

  // Ensure transformed values are not all identical
  const tSpan = Math.max(...samples.map((s) => s.t)) - Math.min(...samples.map((s) => s.t))
  if (Math.abs(tSpan) < 1e-15) {
    return {
      scale,
      toValue: () => null,
      toPixel: () => null,
      valid: false,
      pointCount: samples.length,
      scaleWarning: warning,
    }
  }

  return {
    scale,
    pointCount: samples.length,
    valid: true,
    scaleWarning: warning,
    toValue: (pixel: number) => {
      const t = interpolateT(samples, pixel)
      if (t === null) return null
      const v = inverseTransform(t, scale)
      return Number.isFinite(v) ? v : null
    },
    toPixel: (value: number) => {
      const t = transformValue(value, scale)
      if (t === null) return null
      const pixel = interpolatePixel(samples, t)
      return pixel !== null && Number.isFinite(pixel) ? pixel : null
    },
  }
}
