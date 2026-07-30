import { useEffect, useRef, useState } from 'react'
import type { CursorInfo } from '../types'
import './ZoomPanel.css'

interface Props {
  imageUrl: string | null
  cursor: CursorInfo | null
}

const LOUPE_SIZE = 140
const ZOOMS = [4, 8] as const

function drawLoupe(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement | null,
  cursor: CursorInfo | null,
  zoom: number,
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const size = LOUPE_SIZE
  canvas.width = size
  canvas.height = size
  ctx.fillStyle = '#1c252d'
  ctx.fillRect(0, 0, size, size)

  if (!img || !cursor) {
    ctx.fillStyle = '#8a9aa6'
    ctx.font = '12px "IBM Plex Sans", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Hover plot', size / 2, size / 2)
    return
  }

  const src = size / zoom
  const sx = cursor.px - src / 2
  const sy = cursor.py - src / 2

  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, sx, sy, src, src, 0, 0, size, size)

  ctx.strokeStyle = 'rgba(255, 80, 60, 0.9)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(size / 2, 0)
  ctx.lineTo(size / 2, size)
  ctx.moveTo(0, size / 2)
  ctx.lineTo(size, size / 2)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(size / 2, size / 2, 3, 0, Math.PI * 2)
  ctx.stroke()
}

export function ZoomPanel({ imageUrl, cursor }: Props) {
  const canvas4Ref = useRef<HTMLCanvasElement>(null)
  const canvas8Ref = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)

  useEffect(() => {
    if (!imageUrl) {
      setImg(null)
      return
    }
    let cancelled = false
    const next = new Image()
    next.onload = () => {
      if (!cancelled) setImg(next)
    }
    next.src = imageUrl
    return () => {
      cancelled = true
    }
  }, [imageUrl])

  useEffect(() => {
    if (canvas4Ref.current) drawLoupe(canvas4Ref.current, img, cursor, ZOOMS[0])
    if (canvas8Ref.current) drawLoupe(canvas8Ref.current, img, cursor, ZOOMS[1])
  }, [img, cursor])

  return (
    <div className="zoom-panel" aria-hidden={!imageUrl}>
      <div className="zoom-loupe">
        <div className="zoom-title">×{ZOOMS[0]}</div>
        <canvas
          ref={canvas4Ref}
          className="zoom-canvas"
          width={LOUPE_SIZE}
          height={LOUPE_SIZE}
        />
      </div>
      <div className="zoom-loupe">
        <div className="zoom-title">×{ZOOMS[1]}</div>
        <canvas
          ref={canvas8Ref}
          className="zoom-canvas"
          width={LOUPE_SIZE}
          height={LOUPE_SIZE}
        />
      </div>
    </div>
  )
}
