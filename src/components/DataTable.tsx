import type { DataPoint } from '../types'
import { formatValue } from '../lib/format'
import './DataTable.css'

interface Props {
  points: DataPoint[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
  onDeleteSelected: () => void
  onClear: () => void
}

export function DataTable({
  points,
  selectedId,
  onSelect,
  onDelete,
  onDeleteSelected,
  onClear,
}: Props) {
  return (
    <div className="data-table">
      <header className="data-header">
        <h3>Dataset</h3>
        <span>{points.length} points</span>
      </header>

      <div className="data-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>x</th>
              <th>y</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {points.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  Trace line: click to add. Click a point to select, then Delete / Backspace, or use ×.
                </td>
              </tr>
            )}
            {points.map((p, i) => (
              <tr
                key={p.id}
                className={selectedId === p.id ? 'selected' : ''}
                onClick={() => onSelect(p.id)}
              >
                <td>{i + 1}</td>
                <td>{formatValue(p.x)}</td>
                <td>{formatValue(p.y)}</td>
                <td>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(p.id)
                    }}
                    title="Delete"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="data-actions">
        <button
          type="button"
          className="btn-delete-selected"
          disabled={!selectedId}
          onClick={onDeleteSelected}
        >
          Delete selected
        </button>
        {points.length > 0 && (
          <button type="button" className="clear-data" onClick={onClear}>
            Clear all points
          </button>
        )}
      </div>
    </div>
  )
}
