import './BestFitPanel.css'

interface Props {
  pointCount: number
  snapHalfWidth: number
  onSnapHalfWidth: (n: number) => void
  simplifyEpsilon: number
  onSimplifyEpsilon: (n: number) => void
  fitBusy: boolean
  undoCount: number
  hasImage: boolean
  fitError: string | null
  onSnap: () => void
  onSimplify: () => void
  onUndo: () => void
}

export function BestFitPanel({
  pointCount,
  snapHalfWidth,
  onSnapHalfWidth,
  simplifyEpsilon,
  onSimplifyEpsilon,
  fitBusy,
  undoCount,
  hasImage,
  fitError,
  onSnap,
  onSimplify,
  onUndo,
}: Props) {
  return (
    <div className="best-fit-panel">
      <header className="best-fit-header">
        <h3>Best Fit</h3>
        <span>{pointCount} pts</span>
      </header>
      <p className="best-fit-hint">
        Snap slides points onto the center of the ink stroke (not the edge). Simplify thins
        redundant samples (then re-snaps). Undo steps back through Snap/Simplify.
      </p>
      <label className="best-fit-field">
        Snap half-width
        <input
          type="number"
          min={2}
          max={20}
          step={1}
          value={snapHalfWidth}
          onChange={(e) => onSnapHalfWidth(Number(e.target.value) || 6)}
        />
        <span>px</span>
      </label>
      <label className="best-fit-field">
        Simplify tolerance
        <input
          type="number"
          min={0.5}
          max={20}
          step={0.5}
          value={simplifyEpsilon}
          onChange={(e) => onSimplifyEpsilon(Number(e.target.value) || 2)}
        />
        <span>px</span>
      </label>
      <div className="best-fit-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={fitBusy || pointCount < 2 || !hasImage}
          onClick={onSnap}
        >
          {fitBusy ? 'Working…' : 'Snap to curve'}
        </button>
        <button
          type="button"
          className="btn"
          disabled={fitBusy || pointCount < 3}
          onClick={onSimplify}
        >
          Simplify
        </button>
        <button type="button" className="btn" disabled={fitBusy || undoCount === 0} onClick={onUndo}>
          Undo ({undoCount})
        </button>
      </div>
      {fitError && <p className="best-fit-error">{fitError}</p>}
    </div>
  )
}
