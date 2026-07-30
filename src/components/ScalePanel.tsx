import type { AxisScale, AxisState } from '../types'
import './ScalePanel.css'

interface Props {
  xAxis: AxisState
  yAxis: AxisState
  xValid: boolean
  yValid: boolean
  xWarning?: string | null
  yWarning?: string | null
  onScaleChange: (axis: 'x' | 'y', scale: AxisScale) => void
  onValueChange: (axis: 'x' | 'y', id: string, value: number | null) => void
  onRemovePoint: (axis: 'x' | 'y', id: string) => void
  onClearAxis: (axis: 'x' | 'y') => void
}

const SCALES: { value: AxisScale; label: string; title: string }[] = [
  { value: 'linear', label: 'Linear', title: 'Even spacing: value ∝ position' },
  { value: 'log10', label: 'Log₁₀', title: 'Base-10 log - decades (1, 10, 100…)' },
  { value: 'loge', label: 'Logₑ', title: 'Natural log' },
  { value: 'log2', label: 'Log₂', title: 'Base-2 log - octaves / binary scales' },
  { value: 'reciprocal', label: '1/x', title: 'Reciprocal scale' },
  { value: 'sqrt', label: '√x', title: 'Square-root scale (value ≥ 0)' },
  { value: 'squared', label: 'x²', title: 'Quadratic / signed-square scale' },
  { value: 'asinh', label: 'asinh', title: 'Inverse sinh - soft log that crosses zero' },
]

function parseValue(raw: string): number | null {
  let t = raw.trim()
  if (!t) return null

  // Accept tick-style suffixes: 10k, 5K, 2.5M, 1e3
  const suffix = t.match(/^([+-]?[\d.]+(?:e[+-]?\d+)?)\s*([kKmM])$/i)
  if (suffix) {
    const n = Number(suffix[1])
    if (!Number.isFinite(n)) return null
    const mult = suffix[2].toLowerCase() === 'm' ? 1e6 : 1e3
    return n * mult
  }

  const normalized = t
    .replace(/\s+/g, '')
    .replace(/×/g, '*')
    .replace(/\^/g, '**')
  try {
    if (!/^[\d.eE+\-*/()]+$/.test(normalized)) return null
    const v = Function(`"use strict"; return (${normalized})`)() as number
    return typeof v === 'number' && Number.isFinite(v) ? v : null
  } catch {
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }
}

export function ScalePanel({
  xAxis,
  yAxis,
  xValid,
  yValid,
  xWarning = null,
  yWarning = null,
  onScaleChange,
  onValueChange,
  onRemovePoint,
  onClearAxis,
}: Props) {
  return (
    <div className="scale-panel">
      <AxisBlock
        title="X-axis"
        accent="x"
        axis={xAxis}
        valid={xValid}
        warning={xWarning}
        onScaleChange={(s) => onScaleChange('x', s)}
        onValueChange={(id, v) => onValueChange('x', id, v)}
        onRemove={(id) => onRemovePoint('x', id)}
        onClear={() => onClearAxis('x')}
        hint="Click the plot in Calibrate X mode to add markers. Values interpolate between neighboring markers (use Log₁₀ for log plots like 10 / 100 / 1k / 10k)."
      />
      <AxisBlock
        title="Y-axis"
        accent="y"
        axis={yAxis}
        valid={yValid}
        warning={yWarning}
        onScaleChange={(s) => onScaleChange('y', s)}
        onValueChange={(id, v) => onValueChange('y', id, v)}
        onRemove={(id) => onRemovePoint('y', id)}
        onClear={() => onClearAxis('y')}
        hint="Click the plot in Calibrate Y mode to add markers along the vertical scale."
      />
    </div>
  )
}

function AxisBlock({
  title,
  accent,
  axis,
  valid,
  warning,
  onScaleChange,
  onValueChange,
  onRemove,
  onClear,
  hint,
}: {
  title: string
  accent: 'x' | 'y'
  axis: AxisState
  valid: boolean
  warning: string | null
  onScaleChange: (s: AxisScale) => void
  onValueChange: (id: string, value: number | null) => void
  onRemove: (id: string) => void
  onClear: () => void
  hint: string
}) {
  return (
    <section className={`axis-block axis-${accent}`}>
      <header className="axis-header">
        <h3>{title}</h3>
        <span className={`axis-status ${valid ? 'ok' : ''}`}>
          {valid ? `${axis.points.length} pts · calibrated` : `${axis.points.length} pts · need ≥2 values`}
        </span>
      </header>

      <div className="scale-row">
        {SCALES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={`scale-chip ${axis.scale === s.value ? 'active' : ''}`}
            title={s.title}
            onClick={() => onScaleChange(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {warning && <p className="axis-warning">{warning}</p>}
      <p className="axis-hint">{hint}</p>

      <ul className="axis-points">
        {axis.points.length === 0 && <li className="axis-empty">No markers yet</li>}
        {axis.points.map((p, i) => (
          <li key={p.id}>
            <span className="pt-label">
              {accent.toUpperCase()}
              {i + 1}
            </span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="value"
              defaultValue={p.value ?? ''}
              key={`${p.id}-${p.value}`}
              onBlur={(e) => onValueChange(p.id, parseValue(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  ;(e.target as HTMLInputElement).blur()
                }
              }}
            />
            <button type="button" className="icon-btn" title="Remove" onClick={() => onRemove(p.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>

      {axis.points.length > 0 && (
        <button type="button" className="text-btn" onClick={onClear}>
          Clear {title.toLowerCase()} markers
        </button>
      )}
    </section>
  )
}
