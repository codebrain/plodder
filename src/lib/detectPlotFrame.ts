import { uid } from './uid'
import type { AxisPoint } from '../types'

export interface PlotFrame {
  left: number
  top: number
  right: number
  bottom: number
}

export interface SeededAxes {
  xPoints: AxisPoint[]
  yPoints: AxisPoint[]
  frame: PlotFrame | null
}

/**
 * Detect an axis-aligned graph rectangle (plot frame) from dark horizontal/vertical
 * ink, then seed X1/X2 on the bottom edge and Y1/Y2 on the left edge.
 * Falls back to percentage-based corners if no frame is found.
 */
export function seedAxesFromImage(img: HTMLImageElement): SeededAxes {
  const w = img.naturalWidth
  const h = img.naturalHeight
  const frame = detectPlotFrame(img) ?? fallbackFrame(w, h)
  return {
    frame,
    xPoints: seedX(frame),
    yPoints: seedY(frame),
  }
}

function seedX(frame: PlotFrame): AxisPoint[] {
  const inset = Math.max(4, (frame.right - frame.left) * 0.04)
  const py = frame.bottom
  return [
    { id: uid('x'), px: frame.left + inset, py, value: null },
    { id: uid('x'), px: frame.right - inset, py, value: null },
  ]
}

function seedY(frame: PlotFrame): AxisPoint[] {
  const inset = Math.max(4, (frame.bottom - frame.top) * 0.04)
  const px = frame.left
  return [
    { id: uid('y'), px, py: frame.bottom - inset, value: null },
    { id: uid('y'), px, py: frame.top + inset, value: null },
  ]
}

function fallbackFrame(w: number, h: number): PlotFrame {
  return {
    left: w * 0.1,
    top: h * 0.12,
    right: w * 0.9,
    bottom: h * 0.88,
  }
}

function detectPlotFrame(img: HTMLImageElement): PlotFrame | null {
  const w = img.naturalWidth
  const h = img.naturalHeight
  if (w < 32 || h < 32) return null

  const canvas = document.createElement('canvas')
  // Downsample large images for speed
  const maxSide = 900
  const scale = Math.min(1, maxSide / Math.max(w, h))
  const sw = Math.max(32, Math.round(w * scale))
  const sh = Math.max(32, Math.round(h * scale))
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, sw, sh)
  const { data } = ctx.getImageData(0, 0, sw, sh)

  const luma = new Float32Array(sw * sh)
  let sum = 0
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    luma[p] = v
    sum += v
  }
  const mean = sum / luma.length
  // Ink is darker than background; bias threshold toward dark
  const thr = Math.min(mean * 0.85, mean - 18)

  const rowScore = new Float32Array(sh)
  const colScore = new Float32Array(sw)

  for (let y = 0; y < sh; y++) {
    let dark = 0
    let run = 0
    let maxRun = 0
    const row = y * sw
    for (let x = 0; x < sw; x++) {
      if (luma[row + x] <= thr) {
        dark++
        run++
        if (run > maxRun) maxRun = run
      } else {
        run = 0
      }
    }
    // Prefer long continuous ink (frame lines) over scattered grid ticks
    rowScore[y] = maxRun / sw + 0.35 * (dark / sw)
  }

  for (let x = 0; x < sw; x++) {
    let dark = 0
    let run = 0
    let maxRun = 0
    for (let y = 0; y < sh; y++) {
      if (luma[y * sw + x] <= thr) {
        dark++
        run++
        if (run > maxRun) maxRun = run
      } else {
        run = 0
      }
    }
    colScore[x] = maxRun / sh + 0.35 * (dark / sh)
  }

  const hLines = peakPositions(rowScore, 0.28, Math.max(2, Math.round(sh * 0.008)))
  const vLines = peakPositions(colScore, 0.28, Math.max(2, Math.round(sw * 0.008)))

  if (hLines.length < 2 || vLines.length < 2) return null

  const minW = sw * 0.22
  const minH = sh * 0.22
  let best: { score: number; frame: PlotFrame } | null = null

  for (let i = 0; i < hLines.length; i++) {
    for (let j = i + 1; j < hLines.length; j++) {
      const top = hLines[i]
      const bottom = hLines[j]
      const height = bottom - top
      if (height < minH) continue

      for (let a = 0; a < vLines.length; a++) {
        for (let b = a + 1; b < vLines.length; b++) {
          const left = vLines[a]
          const right = vLines[b]
          const width = right - left
          if (width < minW) continue

          const area = (width / sw) * (height / sh)
          const edge =
            rowScore[top] +
            rowScore[bottom] +
            colScore[left] +
            colScore[right]
          // Prefer frames that aren't glued to the image border (margins for labels)
          const margin =
            Math.min(left, sw - 1 - right) / sw + Math.min(top, sh - 1 - bottom) / sh
          const aspect = width / height
          const aspectPenalty = aspect > 4 || aspect < 0.25 ? 0.4 : 1

          // Corner ink check
          const corners = cornerInk(luma, sw, sh, left, top, right, bottom, thr)

          const score = area * 2.2 + edge * 0.55 + margin * 0.8 + corners * 0.7
          const finalScore = score * aspectPenalty
          if (!best || finalScore > best.score) {
            best = {
              score: finalScore,
              frame: { left, top, right, bottom },
            }
          }
        }
      }
    }
  }

  if (!best || best.score < 1.2) return null

  // Map back to full image coordinates
  const inv = 1 / scale
  return {
    left: best.frame.left * inv,
    top: best.frame.top * inv,
    right: best.frame.right * inv,
    bottom: best.frame.bottom * inv,
  }
}

/** Non-max suppression peaks above threshold. */
function peakPositions(scores: Float32Array, minScore: number, minGap: number): number[] {
  const peaks: { i: number; s: number }[] = []
  for (let i = 1; i < scores.length - 1; i++) {
    const s = scores[i]
    if (s < minScore) continue
    if (s >= scores[i - 1] && s >= scores[i + 1]) {
      peaks.push({ i, s })
    }
  }
  peaks.sort((a, b) => b.s - a.s)

  const chosen: number[] = []
  for (const p of peaks) {
    if (chosen.some((c) => Math.abs(c - p.i) < minGap)) continue
    chosen.push(p.i)
  }
  return chosen.sort((a, b) => a - b)
}

function cornerInk(
  luma: Float32Array,
  w: number,
  h: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  thr: number,
): number {
  const r = 2
  const pts = [
    [left, top],
    [right, top],
    [left, bottom],
    [right, bottom],
  ]
  let hit = 0
  for (const [cx, cy] of pts) {
    let dark = 0
    let n = 0
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = Math.min(w - 1, Math.max(0, cx + dx))
        const y = Math.min(h - 1, Math.max(0, cy + dy))
        n++
        if (luma[y * w + x] <= thr) dark++
      }
    }
    if (dark / n > 0.2) hit++
  }
  return hit / 4
}
