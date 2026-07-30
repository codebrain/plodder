import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  AppMode,
  AxisPoint,
  AxisState,
  CursorInfo,
  DataPoint,
  PhantomPoint,
  TraceCurveStyle,
} from '../types'
import type { AxisFit } from '../lib/calibration'
import { formatValue } from '../lib/format'
import { uid } from '../lib/uid'
import { buildTraceCurve, strokePoints } from '../lib/smooth'
import { nearestSegmentInsert } from '../lib/polylineHit'
import { MIN_ZOOM, MAX_ZOOM } from '../lib/view'
import './PlotCanvas.css'

interface Props {
  imageUrl: string | null
  mode: AppMode
  xAxis: AxisState
  yAxis: AxisState
  dataPoints: DataPoint[]
  phantoms: PhantomPoint[]
  selectedPointId: string | null
  onSelectPoint: (id: string | null) => void
  xFit: AxisFit
  yFit: AxisFit
  showOverlay: boolean
  traceCurveStyle: TraceCurveStyle
  viewZoom: number
  viewPan: { x: number; y: number }
  onViewZoom: (zoom: number, originClient?: { x: number; y: number }) => void
  onViewPan: (pan: { x: number; y: number }) => void
  onAddAxisPoint: (axis: 'x' | 'y', point: AxisPoint) => void
  onMoveAxisPoint: (axis: 'x' | 'y', id: string, px: number, py: number) => void
  onAddDataPoint: (point: DataPoint, insertAt?: number) => void
  onMoveDataPoint: (id: string, px: number, py: number) => void
  onDeleteDataPoint: (id: string) => void
  onAddPhantom: (point: PhantomPoint) => void
  onMovePhantom: (id: string, px: number, py: number) => void
  onDeletePhantom: (id: string) => void
  onCursor: (info: CursorInfo | null) => void
}

const HIT_RADIUS = 10
/** Image-space distance to an existing segment to insert (not append) */
const INSERT_MAX_DIST = 18

type DragTarget =
  | { kind: 'x' | 'y' | 'data' | 'phantom'; id: string }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }

export function PlotCanvas({
  imageUrl,
  mode,
  xAxis,
  yAxis,
  dataPoints,
  phantoms,
  selectedPointId,
  onSelectPoint,
  xFit,
  yFit,
  showOverlay,
  traceCurveStyle,
  viewZoom,
  viewPan,
  onViewZoom,
  onViewPan,
  onAddAxisPoint,
  onMoveAxisPoint,
  onAddDataPoint,
  onMoveDataPoint,
  onDeleteDataPoint,
  onAddPhantom,
  onMovePhantom,
  onDeletePhantom,
  onCursor,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [fitSize, setFitSize] = useState({ w: 0, h: 0 })
  const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 })
  const [drag, setDrag] = useState<DragTarget | null>(null)
  const [hoverPx, setHoverPx] = useState<{ x: number; y: number } | null>(null)
  const [tooltip, setTooltip] = useState<{
    left: number
    top: number
    x: number | null
    y: number | null
  } | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)

  useEffect(() => {
    if (!imageUrl) {
      imgRef.current = null
      setImgNatural({ w: 0, h: 0 })
      return
    }
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      setImgNatural({ w: img.naturalWidth, h: img.naturalHeight })
    }
    img.src = imageUrl
  }, [imageUrl])

  // Base fit size (zoom 1 = contain)
  useEffect(() => {
    const el = wrapRef.current
    if (!el || !imgNatural.w) return

    const ro = new ResizeObserver(() => {
      const cw = el.clientWidth
      const ch = el.clientHeight
      const scale = Math.min(cw / imgNatural.w, ch / imgNatural.h)
      setFitSize({
        w: Math.max(1, Math.floor(imgNatural.w * scale)),
        h: Math.max(1, Math.floor(imgNatural.h * scale)),
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [imgNatural])

  const displayW = fitSize.w * viewZoom
  const displayH = fitSize.h * viewZoom

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const t = e.target as HTMLElement | null
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
        e.preventDefault()
        setSpaceDown(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const toImage = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas || !fitSize.w || !imgNatural.w) return null
      const rect = canvas.getBoundingClientRect()
      const sx = ((clientX - rect.left) / rect.width) * imgNatural.w
      const sy = ((clientY - rect.top) / rect.height) * imgNatural.h
      return { px: sx, py: sy }
    },
    [fitSize, imgNatural],
  )

  const hitRadiusImg = () => {
    const scale = (fitSize.w * viewZoom) / Math.max(imgNatural.w, 1)
    return HIT_RADIUS / Math.max(scale, 0.001)
  }

  const hitTest = useCallback(
    (px: number, py: number) => {
      const r = hitRadiusImg()

      for (const p of phantoms) {
        if (Math.hypot(p.px - px, p.py - py) <= r) return { kind: 'phantom' as const, id: p.id }
      }
      for (const p of dataPoints) {
        if (Math.hypot(p.px - px, p.py - py) <= r) return { kind: 'data' as const, id: p.id }
      }
      for (const p of xAxis.points) {
        if (Math.hypot(p.px - px, p.py - py) <= r) return { kind: 'x' as const, id: p.id }
      }
      for (const p of yAxis.points) {
        if (Math.hypot(p.px - px, p.py - py) <= r) return { kind: 'y' as const, id: p.id }
      }
      return null
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phantoms, dataPoints, xAxis.points, yAxis.points, fitSize, imgNatural, viewZoom],
  )

  // Draw at fit resolution; CSS scales with zoom for crisp interaction
  useEffect(() => {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !fitSize.w) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    // Render at zoomed resolution so markers stay sharp when zoomed
    const renderW = Math.max(1, Math.round(fitSize.w * viewZoom))
    const renderH = Math.max(1, Math.round(fitSize.h * viewZoom))
    canvas.width = renderW * dpr
    canvas.height = renderH * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const sx = renderW / imgNatural.w
    const sy = renderH / imgNatural.h

    ctx.clearRect(0, 0, renderW, renderH)
    ctx.imageSmoothingEnabled = viewZoom < 3
    ctx.drawImage(img, 0, 0, renderW, renderH)

    const toScreen = (px: number, py: number) => ({ x: px * sx, y: py * sy })
    const markerScale = Math.min(Math.max(viewZoom, 1), 2.5)

    // Trace curve overlay through data points
    if (showOverlay && dataPoints.length >= 2) {
      const screenPts = dataPoints.map((p) => toScreen(p.px, p.py))
      const smooth = buildTraceCurve(screenPts, traceCurveStyle, 14)

      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'

      ctx.strokeStyle = 'rgba(212, 120, 28, 0.22)'
      ctx.lineWidth = 7 * Math.min(markerScale, 1.4)
      strokePoints(ctx, smooth)

      ctx.strokeStyle = 'rgba(212, 120, 28, 0.95)'
      ctx.lineWidth = 2.25 * Math.min(markerScale, 1.4)
      strokePoints(ctx, smooth)
    }

    // Preview: insert into nearest segment, or extend from last point
    if (
      showOverlay &&
      (mode === 'digitize' || mode === 'best-fit') &&
      dataPoints.length >= 1 &&
      hoverPx
    ) {
      const insert = nearestSegmentInsert(
        dataPoints,
        hoverPx.x,
        hoverPx.y,
        INSERT_MAX_DIST / Math.max(viewZoom * 0.35, 0.5),
      )
      ctx.setLineDash([6, 5])
      ctx.strokeStyle = 'rgba(212, 120, 28, 0.55)'
      ctx.lineWidth = 1.5 * Math.min(markerScale, 1.4)

      if (insert && dataPoints.length >= 2) {
        const a = toScreen(dataPoints[insert.insertAt - 1].px, dataPoints[insert.insertAt - 1].py)
        const b = toScreen(dataPoints[insert.insertAt].px, dataPoints[insert.insertAt].py)
        const m = toScreen(hoverPx.x, hoverPx.y)
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(m.x, m.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
        ctx.beginPath()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(212, 120, 28, 0.7)'
        ctx.arc(m.x, m.y, 4, 0, Math.PI * 2)
        ctx.fill()
      } else if (mode === 'digitize') {
        const last = dataPoints[dataPoints.length - 1]
        const a = toScreen(last.px, last.py)
        const b = toScreen(hoverPx.x, hoverPx.y)
        ctx.beginPath()
        if (dataPoints.length >= 2) {
          const prev = toScreen(
            dataPoints[dataPoints.length - 2].px,
            dataPoints[dataPoints.length - 2].py,
          )
          const cx = a.x + (a.x - prev.x) * 0.25
          const cy = a.y + (a.y - prev.y) * 0.25
          ctx.moveTo(a.x, a.y)
          ctx.quadraticCurveTo(cx, cy, b.x, b.y)
        } else {
          ctx.moveTo(a.x, a.y)
          ctx.lineTo(b.x, b.y)
        }
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    const drawMarker = (
      px: number,
      py: number,
      label: string,
      color: string,
      shape: 'cross' | 'diamond' | 'circle' | 'ghost',
      sublabel?: string,
      selected = false,
    ) => {
      const { x, y } = toScreen(px, py)
      const u = Math.max(0.7, Math.min(1.15, 1 / Math.sqrt(viewZoom))) * 8

      ctx.save()
      if (selected) {
        ctx.beginPath()
        ctx.arc(x, y, u * 1.55, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(15, 118, 110, 0.22)'
        ctx.fill()
        ctx.strokeStyle = '#0f766e'
        ctx.lineWidth = 2 * (u / 8)
        ctx.stroke()
      }
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = 2 * u / 8

      if (shape === 'cross') {
        ctx.beginPath()
        ctx.moveTo(x - u, y)
        ctx.lineTo(x + u, y)
        ctx.moveTo(x, y - u)
        ctx.lineTo(x, y + u)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x, y, u * 0.45, 0, Math.PI * 2)
        ctx.fill()
      } else if (shape === 'diamond') {
        ctx.beginPath()
        ctx.moveTo(x, y - u * 0.9)
        ctx.lineTo(x + u * 0.9, y)
        ctx.lineTo(x, y + u * 0.9)
        ctx.lineTo(x - u * 0.9, y)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.4 * u / 8
        ctx.stroke()
      } else if (shape === 'ghost') {
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.arc(x, y, u * 0.75, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 0.35
        ctx.beginPath()
        ctx.arc(x, y, u * 0.35, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      } else {
        ctx.beginPath()
        ctx.arc(x, y, u * (selected ? 0.85 : 0.7), 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = selected ? '#0f766e' : '#fff'
        ctx.lineWidth = (selected ? 2.2 : 1.5) * u / 8
        ctx.stroke()
      }

      const fontSize = Math.max(10, 11 * (u / 8))
      ctx.font = `600 ${fontSize}px "IBM Plex Sans", system-ui, sans-serif`
      ctx.fillStyle = selected ? '#0f766e' : color
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.lineWidth = 3.5
      ctx.strokeText(label, x + u * 1.2, y - u * 0.9)
      ctx.fillText(label, x + u * 1.2, y - u * 0.9)

      if (sublabel) {
        ctx.font = `500 ${Math.max(9, fontSize * 0.85)}px "JetBrains Mono", ui-monospace, monospace`
        ctx.strokeText(sublabel, x + u * 1.2, y + u * 0.55)
        ctx.fillText(sublabel, x + u * 1.2, y + u * 0.55)
      }
      ctx.restore()
    }

    // Phantom verification points (under axis markers so axes stay on top)
    phantoms.forEach((p, i) => {
      const xv = formatValue(p.x, 4)
      const yv = formatValue(p.y, 4)
      drawMarker(p.px, p.py, `P${i + 1}`, '#6b5b95', 'ghost', `(${xv}, ${yv})`)
    })

    xAxis.points.forEach((p, i) => {
      const val = p.value !== null ? ` = ${formatValue(p.value, 4)}` : ''
      drawMarker(p.px, p.py, `X${i + 1}${val}`, '#c23b22', 'cross')
    })
    yAxis.points.forEach((p, i) => {
      const val = p.value !== null ? ` = ${formatValue(p.value, 4)}` : ''
      drawMarker(p.px, p.py, `Y${i + 1}${val}`, '#1a5fb4', 'diamond')
    })
    dataPoints.forEach((p, i) => {
      drawMarker(
        p.px,
        p.py,
        String(i + 1),
        '#d4781c',
        'circle',
        undefined,
        selectedPointId === p.id,
      )
    })
  }, [
    fitSize,
    imgNatural,
    xAxis.points,
    yAxis.points,
    dataPoints,
    phantoms,
    selectedPointId,
    showOverlay,
    traceCurveStyle,
    mode,
    hoverPx,
    viewZoom,
  ])

  const updateCursor = useCallback(
    (px: number, py: number, clientX?: number, clientY?: number) => {
      const x = xFit.valid ? xFit.toValue(px) : null
      const y = yFit.valid ? yFit.toValue(py) : null
      onCursor({ px, py, x, y })
      if (clientX !== undefined && clientY !== undefined) {
        const pad = 14
        const tipW = 120
        const vw = window.innerWidth
        const left = clientX + pad + tipW > vw ? clientX - tipW - 8 : clientX + pad
        setTooltip({ left, top: clientY + 10, x, y })
      }
    },
    [onCursor, xFit, yFit],
  )

  // Non-passive wheel so we can prevent page scroll while zooming
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (!imageUrl) return
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewZoom * factor))
      onViewZoom(next, { x: e.clientX, y: e.clientY })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [imageUrl, viewZoom, onViewZoom])

  const onPointerDown = (e: React.PointerEvent) => {
    if (!imageUrl) return

    const panGesture = e.button === 1 || (e.button === 0 && (spaceDown || e.altKey))
    if (panGesture) {
      e.preventDefault()
      setDrag({
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        panX: viewPan.x,
        panY: viewPan.y,
      })
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    const pos = toImage(e.clientX, e.clientY)
    if (!pos) return

    if (e.button === 2) {
      const hit = hitTest(pos.px, pos.py)
      if (hit?.kind === 'data') {
        onSelectPoint(hit.id)
        onDeleteDataPoint(hit.id)
      }
      if (hit?.kind === 'phantom') onDeletePhantom(hit.id)
      return
    }

    if (e.button !== 0) return

    const hit = hitTest(pos.px, pos.py)
    if (hit) {
      if (hit.kind === 'data') onSelectPoint(hit.id)
      setDrag(hit)
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      return
    }

    onSelectPoint(null)

    if (mode === 'calibrate-x') {
      onAddAxisPoint('x', { id: uid('x'), px: pos.px, py: pos.py, value: null })
    } else if (mode === 'calibrate-y') {
      onAddAxisPoint('y', { id: uid('y'), px: pos.px, py: pos.py, value: null })
    } else if (mode === 'verify') {
      onAddPhantom({
        id: uid('ph'),
        px: pos.px,
        py: pos.py,
        x: xFit.valid ? xFit.toValue(pos.px) : null,
        y: yFit.valid ? yFit.toValue(pos.py) : null,
      })
    } else if (mode === 'digitize' || mode === 'best-fit') {
      const point = {
        id: uid('pt'),
        px: pos.px,
        py: pos.py,
        x: xFit.valid ? xFit.toValue(pos.px) : null,
        y: yFit.valid ? yFit.toValue(pos.py) : null,
      }
      const insertMax = INSERT_MAX_DIST / Math.max(viewZoom * 0.35, 0.5)
      const insert = nearestSegmentInsert(dataPoints, pos.px, pos.py, insertMax)
      if (insert) {
        onAddDataPoint(point, insert.insertAt)
      } else if (mode === 'digitize') {
        onAddDataPoint(point)
      }
      // best-fit: only insert when near an existing segment
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (drag?.kind === 'pan') {
      onViewPan({
        x: drag.panX + (e.clientX - drag.startX),
        y: drag.panY + (e.clientY - drag.startY),
      })
      return
    }

    const pos = toImage(e.clientX, e.clientY)
    if (!pos) {
      setHoverPx(null)
      setTooltip(null)
      onCursor(null)
      return
    }

    setHoverPx({ x: pos.px, y: pos.py })
    updateCursor(pos.px, pos.py, e.clientX, e.clientY)

    if (!drag) return

    if (drag.kind === 'x') onMoveAxisPoint('x', drag.id, pos.px, pos.py)
    else if (drag.kind === 'y') onMoveAxisPoint('y', drag.id, pos.px, pos.py)
    else if (drag.kind === 'data') onMoveDataPoint(drag.id, pos.px, pos.py)
    else if (drag.kind === 'phantom') onMovePhantom(drag.id, pos.px, pos.py)
  }

  const onPointerUp = () => setDrag(null)
  const onPointerLeave = () => {
    if (!drag) {
      setHoverPx(null)
      setTooltip(null)
      onCursor(null)
    }
  }

  const cursor = drag?.kind === 'pan' ? 'grabbing' : spaceDown ? 'grab' : 'crosshair'

  return (
    <div className="plot-canvas-wrap" ref={wrapRef}>
      {!imageUrl && (
        <div className="plot-empty">
          <p>Upload a plot image to begin</p>
          <span>PNG, JPG, SVG, GIF, or WEBP</span>
        </div>
      )}
      {imageUrl && (
        <div
          className="plot-viewport"
          style={{
            transform: `translate(${viewPan.x}px, ${viewPan.y}px)`,
          }}
        >
          <canvas
            ref={canvasRef}
            className="plot-canvas"
            style={{
              width: displayW,
              height: displayH,
              cursor,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerLeave}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      )}
      {tooltip && (tooltip.x !== null || tooltip.y !== null) && (
        <div
          className="plot-cursor-tooltip"
          style={{ left: tooltip.left, top: tooltip.top }}
        >
          <div>
            <span>x</span> {formatValue(tooltip.x)}
          </div>
          <div>
            <span>y</span> {formatValue(tooltip.y)}
          </div>
        </div>
      )}
    </div>
  )
}
