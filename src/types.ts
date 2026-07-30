/** Shared domain types for the Plodder digitizer. */

export type AxisScale =
  | 'linear'
  | 'log10'
  | 'loge'
  | 'log2'
  | 'reciprocal'
  | 'sqrt'
  | 'squared'
  | 'asinh'

export type AppMode = 'calibrate-x' | 'calibrate-y' | 'verify' | 'digitize' | 'best-fit'

/** How the traced line overlay is drawn between digitized points */
export type TraceCurveStyle = 'smooth' | 'straight' | 'classic' | 'rounded'

export interface AxisPoint {
  id: string
  /** Image-space pixel coordinates */
  px: number
  py: number
  /** Known axis value at this marker */
  value: number | null
}

export interface DataPoint {
  id: string
  px: number
  py: number
  x: number | null
  y: number | null
}

/** Verification markers showing interpolated axis values */
export interface PhantomPoint {
  id: string
  px: number
  py: number
  x: number | null
  y: number | null
}

export interface AxisState {
  scale: AxisScale
  points: AxisPoint[]
}

export interface CursorInfo {
  px: number
  py: number
  x: number | null
  y: number | null
}
