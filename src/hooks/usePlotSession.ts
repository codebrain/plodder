import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react'
import { fitAxis } from '../lib/calibration'
import { seedAxesFromImage } from '../lib/detectPlotFrame'
import { fileNameFromUrl } from '../lib/files'
import { generatePhantomGrid } from '../lib/phantoms'
import {
  buildProject,
  downloadProject,
  isProbablyProjectFile,
  readProjectFile,
  type PlodderProject,
} from '../lib/project'
import { DEFAULT_TRACE_CURVE } from '../lib/smooth'
import type {
  AppMode,
  AxisPoint,
  AxisScale,
  AxisState,
  CursorInfo,
  DataPoint,
  PhantomPoint,
  TraceCurveStyle,
} from '../types'

const initialAxis = (): AxisState => ({
  scale: 'linear',
  points: [],
})

function revokeBlobUrl(url: string | null) {
  if (url && url.startsWith('blob:')) URL.revokeObjectURL(url)
}

/**
 * Owns the digitizing session: image, calibration, phantoms, points, and project I/O.
 */
export function usePlotSession(opts: {
  resetView: () => void
  clearFitUndo: () => void
  setFitError: (err: string | null) => void
}) {
  const { resetView, clearFitUndo, setFitError } = opts

  const fileRef = useRef<HTMLInputElement>(null)
  const projectRef = useRef<HTMLInputElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [mode, setMode] = useState<AppMode>('calibrate-x')
  const [xAxis, setXAxis] = useState<AxisState>(initialAxis)
  const [yAxis, setYAxis] = useState<AxisState>(initialAxis)
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([])
  const [phantoms, setPhantoms] = useState<PhantomPoint[]>([])
  const [cursor, setCursor] = useState<CursorInfo | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)
  const [traceCurveStyle, setTraceCurveStyle] = useState<TraceCurveStyle>(DEFAULT_TRACE_CURVE)
  const [dragOver, setDragOver] = useState(false)
  const [projectBusy, setProjectBusy] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [urlDraft, setUrlDraft] = useState('')
  const [showUrlForm, setShowUrlForm] = useState(false)
  const [urlBusy, setUrlBusy] = useState(false)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)

  const xFit = useMemo(() => fitAxis(xAxis.points, xAxis.scale, 'x'), [xAxis])
  const yFit = useMemo(() => fitAxis(yAxis.points, yAxis.scale, 'y'), [yAxis])

  useEffect(() => {
    setDataPoints((prev) =>
      prev.map((p) => ({
        ...p,
        x: xFit.valid ? xFit.toValue(p.px) : null,
        y: yFit.valid ? yFit.toValue(p.py) : null,
      })),
    )
    setPhantoms((prev) =>
      prev.map((p) => ({
        ...p,
        x: xFit.valid ? xFit.toValue(p.px) : null,
        y: yFit.valid ? yFit.toValue(p.py) : null,
      })),
    )
  }, [xFit, yFit])

  const applyNewImage = useCallback(
    (url: string, name: string) => {
      setImageUrl((prev) => {
        revokeBlobUrl(prev)
        return url
      })
      setFileName(name)
      setDataPoints([])
      setPhantoms([])
      setSelectedPointId(null)
      clearFitUndo()
      setFitError(null)
      setProjectError(null)
      setMode('calibrate-x')
      resetView()

      const img = new Image()
      img.onload = () => {
        const seeded = seedAxesFromImage(img)
        setXAxis({ scale: 'linear', points: seeded.xPoints })
        setYAxis({ scale: 'linear', points: seeded.yPoints })
      }
      img.onerror = () => {
        setProjectError('Could not decode image')
      }
      img.src = url
    },
    [clearFitUndo, resetView, setFitError],
  )

  const loadFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) return
      applyNewImage(URL.createObjectURL(file), file.name)
    },
    [applyNewImage],
  )

  const loadImageFromUrl = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed) return

      let parsed: URL
      try {
        parsed = new URL(trimmed)
      } catch {
        setProjectError('Invalid image URL')
        return
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        setProjectError('Only http(s) image URLs are supported')
        return
      }

      setUrlBusy(true)
      setProjectError(null)
      try {
        const res = await fetch(parsed.href, { mode: 'cors' })
        if (!res.ok) {
          throw new Error(`Failed to fetch image (${res.status})`)
        }
        const blob = await res.blob()
        const looksLikeImage =
          blob.type.startsWith('image/') ||
          blob.type === '' ||
          blob.type === 'application/octet-stream'
        if (!looksLikeImage) {
          throw new Error('URL did not return an image')
        }

        const objectUrl = URL.createObjectURL(blob)
        try {
          await new Promise<void>((resolve, reject) => {
            const img = new Image()
            img.onload = () => resolve()
            img.onerror = () => reject(new Error('URL is not a valid image'))
            img.src = objectUrl
          })
        } catch (err) {
          URL.revokeObjectURL(objectUrl)
          throw err
        }

        applyNewImage(objectUrl, fileNameFromUrl(parsed.href))
        setUrlDraft('')
        setShowUrlForm(false)
      } catch (err) {
        const message =
          err instanceof TypeError
            ? 'Could not load image from URL (CORS blocked or network error). Try downloading the image and opening the file instead.'
            : err instanceof Error
              ? err.message
              : 'Failed to load image from URL'
        setProjectError(message)
      } finally {
        setUrlBusy(false)
      }
    },
    [applyNewImage],
  )

  const onUrlSubmit = (e: FormEvent) => {
    e.preventDefault()
    void loadImageFromUrl(urlDraft)
  }

  const openUrlForm = () => {
    setShowUrlForm(true)
    queueMicrotask(() => urlInputRef.current?.focus())
  }

  const applyProject = useCallback(
    (project: PlodderProject) => {
      setProjectError(null)
      setXAxis(project.xAxis)
      setYAxis(project.yAxis)
      setDataPoints(project.dataPoints)
      setPhantoms(project.phantoms)
      setSelectedPointId(null)
      setShowOverlay(project.showOverlay)
      setTraceCurveStyle(project.traceCurveStyle ?? DEFAULT_TRACE_CURVE)
      setMode(project.mode)
      clearFitUndo()
      resetView()

      if (project.imageDataUrl) {
        setImageUrl((prev) => {
          revokeBlobUrl(prev)
          return project.imageDataUrl
        })
        setFileName(project.imageName ?? 'restored-image')
      } else if (project.imageName) {
        setFileName((prev) => prev ?? project.imageName)
      }
    },
    [clearFitUndo, resetView],
  )

  const saveProject = async () => {
    if (!imageUrl) return
    setProjectBusy(true)
    setProjectError(null)
    try {
      const project = await buildProject({
        imageUrl,
        imageName: fileName,
        xAxis,
        yAxis,
        dataPoints,
        phantoms,
        showOverlay,
        traceCurveStyle,
        mode,
      })
      await downloadProject(project)
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Failed to save project')
    } finally {
      setProjectBusy(false)
    }
  }

  const loadProjectFromFile = async (file: File) => {
    setProjectBusy(true)
    setProjectError(null)
    try {
      applyProject(await readProjectFile(file))
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : 'Failed to load project')
    } finally {
      setProjectBusy(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (isProbablyProjectFile(file)) {
      void loadProjectFromFile(file)
      return
    }
    loadFile(file)
  }

  const onAddAxisPoint = (axis: 'x' | 'y', point: AxisPoint) => {
    const setter = axis === 'x' ? setXAxis : setYAxis
    setter((prev) => ({ ...prev, points: [...prev.points, point] }))
  }

  const onMoveAxisPoint = (axis: 'x' | 'y', id: string, px: number, py: number) => {
    const setter = axis === 'x' ? setXAxis : setYAxis
    setter((prev) => ({
      ...prev,
      points: prev.points.map((p) => (p.id === id ? { ...p, px, py } : p)),
    }))
  }

  const onValueChange = (axis: 'x' | 'y', id: string, value: number | null) => {
    const setter = axis === 'x' ? setXAxis : setYAxis
    setter((prev) => ({
      ...prev,
      points: prev.points.map((p) => (p.id === id ? { ...p, value } : p)),
    }))
  }

  const onScaleChange = (axis: 'x' | 'y', scale: AxisScale) => {
    const setter = axis === 'x' ? setXAxis : setYAxis
    setter((prev) => ({ ...prev, scale }))
  }

  const onRemoveAxisPoint = (axis: 'x' | 'y', id: string) => {
    const setter = axis === 'x' ? setXAxis : setYAxis
    setter((prev) => ({
      ...prev,
      points: prev.points.filter((p) => p.id !== id),
    }))
  }

  const onClearAxis = (axis: 'x' | 'y') => {
    if (axis === 'x') setXAxis(initialAxis())
    else setYAxis(initialAxis())
  }

  const onAddDataPoint = (point: DataPoint, insertAt?: number) => {
    setDataPoints((prev) => {
      if (insertAt === undefined || insertAt < 0 || insertAt > prev.length) {
        return [...prev, point]
      }
      const next = prev.slice()
      next.splice(insertAt, 0, point)
      return next
    })
  }

  const onMoveDataPoint = (id: string, px: number, py: number) => {
    setDataPoints((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              px,
              py,
              x: xFit.valid ? xFit.toValue(px) : null,
              y: yFit.valid ? yFit.toValue(py) : null,
            }
          : p,
      ),
    )
  }

  const onDeleteDataPoint = useCallback((id: string) => {
    setDataPoints((prev) => prev.filter((p) => p.id !== id))
    setSelectedPointId((cur) => (cur === id ? null : cur))
  }, [])

  const onDeleteSelectedPoint = () => {
    if (!selectedPointId) return
    onDeleteDataPoint(selectedPointId)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (!selectedPointId) return
      e.preventDefault()
      onDeleteDataPoint(selectedPointId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedPointId, onDeleteDataPoint])

  const onAddPhantom = (point: PhantomPoint) => {
    setPhantoms((prev) => [...prev, point])
  }

  const onMovePhantom = (id: string, px: number, py: number) => {
    setPhantoms((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              px,
              py,
              x: xFit.valid ? xFit.toValue(px) : null,
              y: yFit.valid ? yFit.toValue(py) : null,
            }
          : p,
      ),
    )
  }

  const onDeletePhantom = (id: string) => {
    setPhantoms((prev) => prev.filter((p) => p.id !== id))
  }

  const onGeneratePhantoms = () => {
    setPhantoms(generatePhantomGrid(xAxis.points, yAxis.points, xFit, yFit))
    setMode('verify')
  }

  const clearEverything = () => {
    const hasWork =
      !!imageUrl ||
      dataPoints.length > 0 ||
      phantoms.length > 0 ||
      xAxis.points.length > 0 ||
      yAxis.points.length > 0
    if (!hasWork) return

    const ok = window.confirm(
      'Clear everything?\n\nThis removes the image, axis calibration, phantoms, and digitized points. This cannot be undone.',
    )
    if (!ok) return

    revokeBlobUrl(imageUrl)
    setImageUrl(null)
    setFileName(null)
    setXAxis(initialAxis())
    setYAxis(initialAxis())
    setDataPoints([])
    setPhantoms([])
    setSelectedPointId(null)
    clearFitUndo()
    setFitError(null)
    setProjectError(null)
    setUrlDraft('')
    setShowUrlForm(false)
    setCursor(null)
    setMode('calibrate-x')
    resetView()
  }

  const calibrated = xFit.valid && yFit.valid
  const canGeneratePhantoms = xAxis.points.length >= 2 && yAxis.points.length >= 2
  const hasSession =
    !!imageUrl ||
    dataPoints.length > 0 ||
    phantoms.length > 0 ||
    xAxis.points.length > 0 ||
    yAxis.points.length > 0

  return {
    fileRef,
    projectRef,
    urlInputRef,
    imageUrl,
    fileName,
    mode,
    setMode,
    xAxis,
    yAxis,
    dataPoints,
    setDataPoints,
    phantoms,
    setPhantoms,
    cursor,
    setCursor,
    showOverlay,
    setShowOverlay,
    traceCurveStyle,
    setTraceCurveStyle,
    dragOver,
    setDragOver,
    projectBusy,
    projectError,
    setProjectError,
    urlDraft,
    setUrlDraft,
    showUrlForm,
    setShowUrlForm,
    urlBusy,
    selectedPointId,
    setSelectedPointId,
    xFit,
    yFit,
    calibrated,
    canGeneratePhantoms,
    hasSession,
    loadFile,
    onUrlSubmit,
    openUrlForm,
    saveProject,
    loadProjectFromFile,
    onDrop,
    onAddAxisPoint,
    onMoveAxisPoint,
    onValueChange,
    onScaleChange,
    onRemoveAxisPoint,
    onClearAxis,
    onAddDataPoint,
    onMoveDataPoint,
    onDeleteDataPoint,
    onDeleteSelectedPoint,
    onAddPhantom,
    onMovePhantom,
    onDeletePhantom,
    onGeneratePhantoms,
    clearEverything,
  }
}
