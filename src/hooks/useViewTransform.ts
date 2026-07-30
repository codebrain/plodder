import { useCallback, useRef, useState, type RefObject } from 'react'
import { MAX_ZOOM, MIN_ZOOM } from '../lib/view'

export function useViewTransform() {
  const stageRef = useRef<HTMLElement>(null)
  const [viewZoom, setViewZoom] = useState(1)
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 })

  const resetView = useCallback(() => {
    setViewZoom(1)
    setViewPan({ x: 0, y: 0 })
  }, [])

  const onViewZoom = useCallback(
    (nextZoom: number, originClient?: { x: number; y: number }) => {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom))
      if (!originClient || !stageRef.current) {
        setViewZoom(z)
        return
      }
      const rect = stageRef.current.getBoundingClientRect()
      const cx = originClient.x - rect.left - rect.width / 2
      const cy = originClient.y - rect.top - rect.height / 2
      // Keep the point under the cursor stable while zooming
      setViewPan((pan) => ({
        x: cx - ((cx - pan.x) * z) / viewZoom,
        y: cy - ((cy - pan.y) * z) / viewZoom,
      }))
      setViewZoom(z)
    },
    [viewZoom],
  )

  return {
    stageRef: stageRef as RefObject<HTMLElement>,
    viewZoom,
    viewPan,
    setViewPan,
    onViewZoom,
    resetView,
  }
}
