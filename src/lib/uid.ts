/** Short prefixed id for markers and digitized points. */
export function uid(prefix = 'id'): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}
