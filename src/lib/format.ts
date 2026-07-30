/** Display helper for calibrated axis / data values. */
export function formatValue(value: number | null, digits = 6): string {
  if (value === null || !Number.isFinite(value)) return '-'
  if (Math.abs(value) !== 0 && (Math.abs(value) < 1e-3 || Math.abs(value) >= 1e6)) {
    return value.toExponential(4)
  }
  const s = value.toPrecision(digits)
  return String(Number(s))
}
