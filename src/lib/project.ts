import type {
  AppMode,
  AxisScale,
  AxisState,
  DataPoint,
  PhantomPoint,
  TraceCurveStyle,
} from '../types'
import { downloadText } from './export'
import { baseName } from './files'
import { DEFAULT_TRACE_CURVE } from './smooth'

export const PROJECT_VERSION = 1 as const
export const PROJECT_KIND = 'plodder-project' as const
/** Older session kind still accepted on load */
const LEGACY_PROJECT_KIND = 'plotter-project' as const

export interface PlodderProject {
  kind: typeof PROJECT_KIND
  version: typeof PROJECT_VERSION
  savedAt: string
  imageName: string | null
  /** Data URL (image/*;base64,...) so the project is self-contained */
  imageDataUrl: string | null
  xAxis: AxisState
  yAxis: AxisState
  dataPoints: DataPoint[]
  phantoms: PhantomPoint[]
  showOverlay: boolean
  traceCurveStyle: TraceCurveStyle
  mode: AppMode
}

const SCALES = new Set<AxisScale>([
  'linear',
  'log10',
  'loge',
  'log2',
  'reciprocal',
  'sqrt',
  'squared',
  'asinh',
])
const MODES = new Set<AppMode>(['calibrate-x', 'calibrate-y', 'verify', 'digitize', 'best-fit'])
const CURVE_STYLES = new Set<TraceCurveStyle>(['smooth', 'straight', 'classic', 'rounded'])

export async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const res = await fetch(blobUrl)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image'))
    reader.readAsDataURL(blob)
  })
}

export async function buildProject(input: {
  imageUrl: string | null
  imageName: string | null
  xAxis: AxisState
  yAxis: AxisState
  dataPoints: DataPoint[]
  phantoms: PhantomPoint[]
  showOverlay: boolean
  traceCurveStyle: TraceCurveStyle
  mode: AppMode
}): Promise<PlodderProject> {
  let imageDataUrl: string | null = null
  if (input.imageUrl) {
    if (input.imageUrl.startsWith('data:')) {
      imageDataUrl = input.imageUrl
    } else {
      imageDataUrl = await blobUrlToDataUrl(input.imageUrl)
    }
  }

  return {
    kind: PROJECT_KIND,
    version: PROJECT_VERSION,
    savedAt: new Date().toISOString(),
    imageName: input.imageName,
    imageDataUrl,
    xAxis: input.xAxis,
    yAxis: input.yAxis,
    dataPoints: input.dataPoints,
    phantoms: input.phantoms,
    showOverlay: input.showOverlay,
    traceCurveStyle: input.traceCurveStyle,
    mode: input.mode,
  }
}

export async function downloadProject(project: PlodderProject, filename?: string) {
  const name = filename ?? `${baseName(project.imageName, 'plot')}.plodder.json`
  downloadText(name, JSON.stringify(project, null, 2), 'application/json')
}

export function parseProject(raw: unknown): PlodderProject {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid project file')
  }
  const obj = raw as Record<string, unknown>

  if (obj.kind !== PROJECT_KIND && obj.kind !== LEGACY_PROJECT_KIND) {
    throw new Error('Not a Plodder project file (missing kind)')
  }
  if (obj.version !== 1) {
    throw new Error(`Unsupported project version: ${String(obj.version)}`)
  }

  return {
    kind: PROJECT_KIND,
    version: PROJECT_VERSION,
    savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : new Date().toISOString(),
    imageName: typeof obj.imageName === 'string' ? obj.imageName : null,
    imageDataUrl:
      typeof obj.imageDataUrl === 'string' && obj.imageDataUrl.startsWith('data:image/')
        ? obj.imageDataUrl
        : null,
    xAxis: parseAxis(obj.xAxis),
    yAxis: parseAxis(obj.yAxis),
    dataPoints: parseDataPoints(obj.dataPoints),
    phantoms: parsePhantoms(obj.phantoms),
    showOverlay: typeof obj.showOverlay === 'boolean' ? obj.showOverlay : true,
    traceCurveStyle:
      typeof obj.traceCurveStyle === 'string' && CURVE_STYLES.has(obj.traceCurveStyle as TraceCurveStyle)
        ? (obj.traceCurveStyle as TraceCurveStyle)
        : DEFAULT_TRACE_CURVE,
    mode: typeof obj.mode === 'string' && MODES.has(obj.mode as AppMode) ? (obj.mode as AppMode) : 'digitize',
  }
}

export async function readProjectFile(file: File): Promise<PlodderProject> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Project file is not valid JSON')
  }
  return parseProject(parsed)
}

export function isProbablyProjectFile(file: File): boolean {
  const name = file.name.toLowerCase()
  return (
    name.endsWith('.plodder.json') ||
    name.endsWith('.plotter.json') ||
    (name.endsWith('.json') && !file.type.startsWith('image/'))
  )
}

function parseAxis(raw: unknown): AxisState {
  if (!raw || typeof raw !== 'object') {
    return { scale: 'linear', points: [] }
  }
  const obj = raw as Record<string, unknown>
  const scale =
    typeof obj.scale === 'string' && SCALES.has(obj.scale as AxisScale)
      ? (obj.scale as AxisScale)
      : 'linear'
  const points = Array.isArray(obj.points)
    ? obj.points
        .map((p) => parseAxisPoint(p))
        .filter((p): p is NonNullable<typeof p> => p !== null)
    : []
  return { scale, points }
}

function parseAxisPoint(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.px !== 'number' || typeof p.py !== 'number') return null
  const value =
    p.value === null || p.value === undefined
      ? null
      : typeof p.value === 'number' && Number.isFinite(p.value)
        ? p.value
        : null
  return {
    id: typeof p.id === 'string' ? p.id : crypto.randomUUID(),
    px: p.px,
    py: p.py,
    value,
  }
}

function parseDataPoints(raw: unknown): DataPoint[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const p = item as Record<string, unknown>
      if (typeof p.px !== 'number' || typeof p.py !== 'number') return null
      return {
        id: typeof p.id === 'string' ? p.id : crypto.randomUUID(),
        px: p.px,
        py: p.py,
        x: finiteOrNull(p.x),
        y: finiteOrNull(p.y),
      }
    })
    .filter((p): p is DataPoint => p !== null)
}

function parsePhantoms(raw: unknown): PhantomPoint[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const p = item as Record<string, unknown>
      if (typeof p.px !== 'number' || typeof p.py !== 'number') return null
      return {
        id: typeof p.id === 'string' ? p.id : crypto.randomUUID(),
        px: p.px,
        py: p.py,
        x: finiteOrNull(p.x),
        y: finiteOrNull(p.y),
      }
    })
    .filter((p): p is PhantomPoint => p !== null)
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
