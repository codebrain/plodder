import { useRef } from 'react'
import { PlotCanvas } from './components/PlotCanvas'
import { MIN_ZOOM, MAX_ZOOM } from './lib/view'
import { ZoomPanel } from './components/ZoomPanel'
import { ScalePanel } from './components/ScalePanel'
import { DataTable } from './components/DataTable'
import { PhantomPanel } from './components/PhantomPanel'
import { BestFitPanel } from './components/BestFitPanel'
import { Toolbar } from './components/Toolbar'
import { downloadText, toCsv, toJson, toPythonList } from './lib/export'
import { baseName } from './lib/files'
import { useBestFit } from './hooks/useBestFit'
import { usePlotSession } from './hooks/usePlotSession'
import { useViewTransform } from './hooks/useViewTransform'
import './App.css'

export default function App() {
  const view = useViewTransform()
  const fitCtl = useRef({
    clearFitUndo: () => {},
    setFitError: (_err: string | null) => {},
  })

  const session = usePlotSession({
    resetView: view.resetView,
    clearFitUndo: () => fitCtl.current.clearFitUndo(),
    setFitError: (err) => fitCtl.current.setFitError(err),
  })

  const fit = useBestFit(
    session.imageUrl,
    session.dataPoints,
    session.setDataPoints,
    session.xFit,
    session.yFit,
  )
  fitCtl.current = {
    clearFitUndo: fit.clearFitUndo,
    setFitError: fit.setFitError,
  }

  const exportBase = baseName(session.fileName)

  return (
    <div className="app">
      <Toolbar
        mode={session.mode}
        onMode={session.setMode}
        imageUrl={session.imageUrl}
        dataPointCount={session.dataPoints.length}
        hasSession={session.hasSession}
        showOverlay={session.showOverlay}
        onShowOverlay={session.setShowOverlay}
        traceCurveStyle={session.traceCurveStyle}
        onTraceCurveStyle={session.setTraceCurveStyle}
        fileRef={session.fileRef}
        projectRef={session.projectRef}
        urlInputRef={session.urlInputRef}
        showUrlForm={session.showUrlForm}
        urlDraft={session.urlDraft}
        onUrlDraft={session.setUrlDraft}
        urlBusy={session.urlBusy}
        projectBusy={session.projectBusy}
        onOpenUrlForm={session.openUrlForm}
        onToggleUrlForm={() => session.setShowUrlForm(false)}
        onUrlSubmit={session.onUrlSubmit}
        onClear={session.clearEverything}
        onSaveProject={() => void session.saveProject()}
        onLoadProjectFile={(f) => void session.loadProjectFromFile(f)}
        onLoadImageFile={session.loadFile}
        onExportCsv={() =>
          downloadText(`${exportBase}.csv`, toCsv(session.dataPoints), 'text/csv')
        }
        onExportJson={() =>
          downloadText(`${exportBase}.json`, toJson(session.dataPoints), 'application/json')
        }
        onExportPython={() =>
          downloadText(`${exportBase}.py.txt`, toPythonList(session.dataPoints), 'text/plain')
        }
      />

      {session.projectError && (
        <div className="project-banner" role="alert">
          <span>{session.projectError}</span>
          <button type="button" onClick={() => session.setProjectError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <main className="workspace">
        <aside className="sidebar">
          <ScalePanel
            xAxis={session.xAxis}
            yAxis={session.yAxis}
            xValid={session.xFit.valid}
            yValid={session.yFit.valid}
            xWarning={session.xFit.scaleWarning}
            yWarning={session.yFit.scaleWarning}
            onScaleChange={session.onScaleChange}
            onValueChange={session.onValueChange}
            onRemovePoint={session.onRemoveAxisPoint}
            onClearAxis={session.onClearAxis}
          />
          <PhantomPanel
            phantoms={session.phantoms}
            canGenerate={session.canGeneratePhantoms}
            onGenerate={session.onGeneratePhantoms}
            onDelete={session.onDeletePhantom}
            onClear={() => session.setPhantoms([])}
          />
          {session.mode === 'best-fit' && (
            <BestFitPanel
              pointCount={session.dataPoints.length}
              snapHalfWidth={fit.snapHalfWidth}
              onSnapHalfWidth={fit.setSnapHalfWidth}
              simplifyEpsilon={fit.simplifyEpsilon}
              onSimplifyEpsilon={fit.setSimplifyEpsilon}
              fitBusy={fit.fitBusy}
              undoCount={fit.fitUndoStack.length}
              hasImage={!!session.imageUrl}
              fitError={fit.fitError}
              onSnap={() => void fit.onSnapToCurve()}
              onSimplify={() => void fit.onSimplify()}
              onUndo={fit.onFitUndo}
            />
          )}
          <DataTable
            points={session.dataPoints}
            selectedId={session.selectedPointId}
            onSelect={session.setSelectedPointId}
            onDelete={session.onDeleteDataPoint}
            onDeleteSelected={session.onDeleteSelectedPoint}
            onClear={() => {
              session.setDataPoints([])
              session.setSelectedPointId(null)
              fit.clearFitUndo()
            }}
          />
        </aside>

        <section
          ref={view.stageRef}
          className={`stage ${session.dragOver ? 'drag-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            session.setDragOver(true)
          }}
          onDragLeave={() => session.setDragOver(false)}
          onDrop={session.onDrop}
        >
          {!session.imageUrl && (
            <div className={`dropzone ${session.dragOver ? 'drag-over' : ''}`}>
              <button
                type="button"
                className="dropzone-open"
                onClick={() => session.fileRef.current?.click()}
              >
                <strong>Drop a plot image or project here</strong>
                <span>PNG/JPG… or a .plodder.json session · or click to upload</span>
              </button>
              <form className="dropzone-url" onSubmit={session.onUrlSubmit}>
                <label htmlFor="dropzone-image-url">Or load from URL</label>
                <div className="dropzone-url-row">
                  <input
                    id="dropzone-image-url"
                    type="url"
                    value={session.urlDraft}
                    onChange={(e) => session.setUrlDraft(e.target.value)}
                    placeholder="https://example.com/plot.png"
                    disabled={session.urlBusy}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={session.urlBusy || !session.urlDraft.trim()}
                  >
                    {session.urlBusy ? 'Loading…' : 'Load URL'}
                  </button>
                </div>
              </form>
            </div>
          )}
          {session.imageUrl && (
            <>
              <div className="stage-meta">
                <span className="file-chip">{session.fileName}</span>
                <span className={`calib-chip ${session.calibrated ? 'ok' : ''}`}>
                  {session.calibrated ? 'Axes calibrated' : 'Calibrate X & Y (≥2 points each)'}
                </span>
                <span className="mode-chip">
                  {session.mode === 'calibrate-x' && 'Click to place X markers'}
                  {session.mode === 'calibrate-y' && 'Click to place Y markers'}
                  {session.mode === 'verify' &&
                    'Click phantoms on ticks to check interpolated values'}
                  {session.mode === 'digitize' &&
                    'Click to add · near line to insert · select a point, then Delete'}
                  {session.mode === 'best-fit' &&
                    'Snap · Simplify · Undo · select + Delete · click near line to insert'}
                </span>
              </div>
              <div className="stage-canvas">
                <ZoomPanel imageUrl={session.imageUrl} cursor={session.cursor} />
                <div className="zoom-controls" title="Scroll to zoom · Space/Alt+drag to pan">
                  <button
                    type="button"
                    className="btn zoom-btn"
                    onClick={() => view.onViewZoom(view.viewZoom / 1.25)}
                    disabled={view.viewZoom <= MIN_ZOOM}
                  >
                    −
                  </button>
                  <span className="zoom-label">{Math.round(view.viewZoom * 100)}%</span>
                  <button
                    type="button"
                    className="btn zoom-btn"
                    onClick={() => view.onViewZoom(view.viewZoom * 1.25)}
                    disabled={view.viewZoom >= MAX_ZOOM}
                  >
                    +
                  </button>
                  <button type="button" className="btn zoom-btn" onClick={view.resetView}>
                    Reset
                  </button>
                </div>
                <PlotCanvas
                  imageUrl={session.imageUrl}
                  mode={session.mode}
                  xAxis={session.xAxis}
                  yAxis={session.yAxis}
                  dataPoints={session.dataPoints}
                  phantoms={session.phantoms}
                  selectedPointId={session.selectedPointId}
                  onSelectPoint={session.setSelectedPointId}
                  xFit={session.xFit}
                  yFit={session.yFit}
                  showOverlay={session.showOverlay}
                  traceCurveStyle={session.traceCurveStyle}
                  viewZoom={view.viewZoom}
                  viewPan={view.viewPan}
                  onViewZoom={view.onViewZoom}
                  onViewPan={view.setViewPan}
                  onAddAxisPoint={session.onAddAxisPoint}
                  onMoveAxisPoint={session.onMoveAxisPoint}
                  onAddDataPoint={session.onAddDataPoint}
                  onMoveDataPoint={session.onMoveDataPoint}
                  onDeleteDataPoint={session.onDeleteDataPoint}
                  onAddPhantom={session.onAddPhantom}
                  onMovePhantom={session.onMovePhantom}
                  onDeletePhantom={session.onDeletePhantom}
                  onCursor={session.setCursor}
                />
              </div>
              <p className="zoom-help">
                Scroll to zoom the main image · hold Space or Alt and drag to pan · middle-click drag
                also pans
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
