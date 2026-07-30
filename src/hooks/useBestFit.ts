import { useState, type Dispatch, type SetStateAction } from 'react'
import type { AxisFit } from '../lib/calibration'
import { loadLumaImage, snapPointsToCurve } from '../lib/snapToCurve'
import { simplifyPolyline } from '../lib/simplifyPolyline'
import type { DataPoint } from '../types'

const UNDO_CAP = 20

function clonePoints(pts: DataPoint[]): DataPoint[] {
  return pts.map((p) => ({ ...p }))
}

/** Snap-to-ink, simplify, and undo for Best Fit mode. */
export function useBestFit(
  imageUrl: string | null,
  dataPoints: DataPoint[],
  setDataPoints: Dispatch<SetStateAction<DataPoint[]>>,
  xFit: AxisFit,
  yFit: AxisFit,
) {
  const [fitUndoStack, setFitUndoStack] = useState<DataPoint[][]>([])
  const [fitBusy, setFitBusy] = useState(false)
  const [snapHalfWidth, setSnapHalfWidth] = useState(10)
  const [simplifyEpsilon, setSimplifyEpsilon] = useState(2)
  const [fitError, setFitError] = useState<string | null>(null)

  const pushFitUndo = (pts: DataPoint[]) => {
    setFitUndoStack((stack) => {
      const next = [...stack, clonePoints(pts)]
      return next.length > UNDO_CAP ? next.slice(next.length - UNDO_CAP) : next
    })
  }

  const clearFitUndo = () => setFitUndoStack([])

  const applyCalibrated = (pts: DataPoint[]): DataPoint[] =>
    pts.map((p) => ({
      ...p,
      x: xFit.valid ? xFit.toValue(p.px) : null,
      y: yFit.valid ? yFit.toValue(p.py) : null,
    }))

  const runSnapToCurve = async (pts: DataPoint[]) => {
    if (!imageUrl || pts.length < 2) return pts
    const img = await loadLumaImage(imageUrl)
    return applyCalibrated(snapPointsToCurve(img, pts, { halfWidth: snapHalfWidth }))
  }

  const onSnapToCurve = async () => {
    if (!imageUrl || dataPoints.length < 2) return
    setFitBusy(true)
    setFitError(null)
    try {
      pushFitUndo(dataPoints)
      setDataPoints(await runSnapToCurve(dataPoints))
    } catch (err) {
      setFitError(err instanceof Error ? err.message : 'Snap failed')
      setFitUndoStack((s) => s.slice(0, -1))
    } finally {
      setFitBusy(false)
    }
  }

  const onSimplify = async () => {
    if (dataPoints.length < 3) return
    setFitBusy(true)
    setFitError(null)
    try {
      pushFitUndo(dataPoints)
      let next = simplifyPolyline(dataPoints, simplifyEpsilon)
      if (imageUrl && next.length >= 2) {
        next = await runSnapToCurve(next)
      } else {
        next = applyCalibrated(next)
      }
      setDataPoints(next)
    } catch (err) {
      setFitError(err instanceof Error ? err.message : 'Simplify failed')
      setFitUndoStack((s) => s.slice(0, -1))
    } finally {
      setFitBusy(false)
    }
  }

  const onFitUndo = () => {
    if (fitUndoStack.length === 0) return
    const prev = fitUndoStack[fitUndoStack.length - 1]
    setFitUndoStack((s) => s.slice(0, -1))
    setDataPoints(applyCalibrated(prev))
  }

  return {
    fitUndoStack,
    fitBusy,
    snapHalfWidth,
    setSnapHalfWidth,
    simplifyEpsilon,
    setSimplifyEpsilon,
    fitError,
    setFitError,
    clearFitUndo,
    onSnapToCurve,
    onSimplify,
    onFitUndo,
  }
}
