import type { PhantomPoint } from '../types'
import { formatValue } from '../lib/format'
import './PhantomPanel.css'

interface Props {
  phantoms: PhantomPoint[]
  canGenerate: boolean
  onGenerate: () => void
  onDelete: (id: string) => void
  onClear: () => void
}

export function PhantomPanel({ phantoms, canGenerate, onGenerate, onDelete, onClear }: Props) {
  return (
    <div className="phantom-panel">
      <header className="phantom-header">
        <h3>Phantom checks</h3>
        <span>{phantoms.length}</span>
      </header>
      <p className="phantom-hint">
        Place phantoms on known ticks or grid crossings. Labels show interpolated X/Y so you can
        verify calibration before digitizing.
      </p>
      <div className="phantom-actions">
        <button type="button" className="btn-sm" disabled={!canGenerate} onClick={onGenerate}>
          Grid from axes
        </button>
        {phantoms.length > 0 && (
          <button type="button" className="text-btn" onClick={onClear}>
            Clear phantoms
          </button>
        )}
      </div>
      <ul className="phantom-list">
        {phantoms.length === 0 && (
          <li className="phantom-empty">
            <span>Verify mode: click the plot to drop a phantom</span>
          </li>
        )}
        {phantoms.map((p, i) => (
          <li key={p.id}>
            <span className="ph-label">P{i + 1}</span>
            <span className="ph-vals">
              ({formatValue(p.x, 4)}, {formatValue(p.y, 4)})
            </span>
            <button type="button" className="icon-btn" title="Remove" onClick={() => onDelete(p.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
