import type { FormEvent, RefObject } from 'react'
import type { AppMode, TraceCurveStyle } from '../types'
import { TRACE_CURVE_OPTIONS } from '../lib/smooth'
import logoUrl from '../assets/logo.svg'

interface Props {
  mode: AppMode
  onMode: (mode: AppMode) => void
  imageUrl: string | null
  dataPointCount: number
  hasSession: boolean
  showOverlay: boolean
  onShowOverlay: (v: boolean) => void
  traceCurveStyle: TraceCurveStyle
  onTraceCurveStyle: (style: TraceCurveStyle) => void
  fileRef: RefObject<HTMLInputElement | null>
  projectRef: RefObject<HTMLInputElement | null>
  urlInputRef: RefObject<HTMLInputElement | null>
  showUrlForm: boolean
  urlDraft: string
  onUrlDraft: (v: string) => void
  urlBusy: boolean
  projectBusy: boolean
  onOpenUrlForm: () => void
  onToggleUrlForm: () => void
  onUrlSubmit: (e: FormEvent) => void
  onClear: () => void
  onSaveProject: () => void
  onLoadProjectFile: (file: File) => void
  onLoadImageFile: (file: File) => void
  onExportCsv: () => void
  onExportJson: () => void
  onExportPython: () => void
}

export function Toolbar({
  mode,
  onMode,
  imageUrl,
  dataPointCount,
  hasSession,
  showOverlay,
  onShowOverlay,
  traceCurveStyle,
  onTraceCurveStyle,
  fileRef,
  projectRef,
  urlInputRef,
  showUrlForm,
  urlDraft,
  onUrlDraft,
  urlBusy,
  projectBusy,
  onOpenUrlForm,
  onToggleUrlForm,
  onUrlSubmit,
  onClear,
  onSaveProject,
  onLoadProjectFile,
  onLoadImageFile,
  onExportCsv,
  onExportJson,
  onExportPython,
}: Props) {
  return (
    <header className="topbar">
      <div className="brand" title="Plodder - extract data from graph images">
        <img className="brand-mark" src={logoUrl} alt="" width={28} height={28} />
        <strong>Plodder</strong>
      </div>

      <div className="mode-switch" role="tablist" aria-label="Mode">
        <button
          type="button"
          role="tab"
          className={mode === 'calibrate-x' ? 'active' : ''}
          aria-selected={mode === 'calibrate-x'}
          onClick={() => onMode('calibrate-x')}
          title="Calibrate X-axis"
        >
          X
        </button>
        <button
          type="button"
          role="tab"
          className={mode === 'calibrate-y' ? 'active' : ''}
          aria-selected={mode === 'calibrate-y'}
          onClick={() => onMode('calibrate-y')}
          title="Calibrate Y-axis"
        >
          Y
        </button>
        <button
          type="button"
          role="tab"
          className={mode === 'verify' ? 'active' : ''}
          aria-selected={mode === 'verify'}
          onClick={() => onMode('verify')}
          disabled={!imageUrl}
          title="Phantom verification points"
        >
          Ph
        </button>
        <button
          type="button"
          role="tab"
          className={mode === 'digitize' ? 'active' : ''}
          aria-selected={mode === 'digitize'}
          onClick={() => onMode('digitize')}
          disabled={!imageUrl}
          title="Trace line"
        >
          Trace
        </button>
        <button
          type="button"
          role="tab"
          className={mode === 'best-fit' ? 'active' : ''}
          aria-selected={mode === 'best-fit'}
          onClick={() => onMode('best-fit')}
          disabled={!imageUrl || dataPointCount < 2}
          title="Best Fit - snap & simplify"
        >
          Fit
        </button>
      </div>

      <div className="top-actions">
        <label className="overlay-toggle" title="Show line overlay on the plot">
          <input
            type="checkbox"
            checked={showOverlay}
            onChange={(e) => onShowOverlay(e.target.checked)}
          />
          Line
        </label>

        <label
          className="curve-style"
          title={TRACE_CURVE_OPTIONS.find((o) => o.value === traceCurveStyle)?.description}
        >
          <select
            value={traceCurveStyle}
            onChange={(e) => onTraceCurveStyle(e.target.value as TraceCurveStyle)}
            aria-label="Trace curve style"
          >
            {TRACE_CURVE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} title={o.description}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="btn"
          onClick={() => fileRef.current?.click()}
          title={imageUrl ? 'Replace image' : 'Upload image'}
        >
          {imageUrl ? 'Img' : 'Open'}
        </button>
        <button
          type="button"
          className={`btn ${showUrlForm ? 'active-toggle' : ''}`}
          onClick={() => (showUrlForm ? onToggleUrlForm() : onOpenUrlForm())}
          title="Load image from URL"
          disabled={urlBusy}
        >
          {urlBusy ? '…' : 'URL'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onLoadImageFile(f)
            e.target.value = ''
          }}
        />
        {showUrlForm && (
          <form className="url-load-form" onSubmit={onUrlSubmit}>
            <input
              ref={urlInputRef}
              type="url"
              value={urlDraft}
              onChange={(e) => onUrlDraft(e.target.value)}
              placeholder="https://example.com/plot.png"
              disabled={urlBusy}
              aria-label="Image URL"
            />
            <button type="submit" className="btn btn-primary" disabled={urlBusy || !urlDraft.trim()}>
              Load
            </button>
          </form>
        )}

        <button
          type="button"
          className="btn btn-danger"
          disabled={!hasSession}
          onClick={onClear}
          title="Clear image, calibration, and all points"
        >
          Clear
        </button>

        <div className="export-group project-group">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!imageUrl || projectBusy}
            onClick={onSaveProject}
            title="Save project (.plodder.json)"
          >
            {projectBusy ? '…' : 'Save'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={projectBusy}
            onClick={() => projectRef.current?.click()}
            title="Load project (.plodder.json)"
          >
            Load
          </button>
          <input
            ref={projectRef}
            type="file"
            accept=".json,.plodder.json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onLoadProjectFile(f)
              e.target.value = ''
            }}
          />
        </div>

        <div className="export-group">
          <button
            type="button"
            className="btn"
            disabled={dataPointCount === 0}
            onClick={onExportCsv}
            title="Export CSV"
          >
            CSV
          </button>
          <button
            type="button"
            className="btn"
            disabled={dataPointCount === 0}
            onClick={onExportJson}
            title="Export JSON"
          >
            JSON
          </button>
          <button
            type="button"
            className="btn"
            disabled={dataPointCount === 0}
            onClick={onExportPython}
            title="Export Python list"
          >
            PY
          </button>
        </div>
      </div>
    </header>
  )
}
