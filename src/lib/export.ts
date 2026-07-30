import type { DataPoint } from '../types'

export function toCsv(points: DataPoint[]): string {
  const header = 'x,y'
  const rows = points.map((p) => `${formatNumber(p.x)},${formatNumber(p.y)}`)
  return [header, ...rows].join('\n')
}

export function toJson(points: DataPoint[]): string {
  const data = points.map((p) => ({ x: p.x, y: p.y }))
  return JSON.stringify(data, null, 2)
}

export function toPythonList(points: DataPoint[]): string {
  const rows = points.map((p) => `  [${formatNumber(p.x)}, ${formatNumber(p.y)}]`)
  return `[\n${rows.join(',\n')}\n]`
}

function formatNumber(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return 'null'
  return String(v)
}

export function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
