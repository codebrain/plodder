/** Strip the last extension from a filename for export basenames. */
export function baseName(name: string | null, fallback = 'plot-data'): string {
  if (!name) return fallback
  return name.replace(/\.[^.]+$/, '') || fallback
}

/** Best-effort filename from an image URL path. */
export function fileNameFromUrl(href: string): string {
  try {
    const path = new URL(href).pathname
    const base = path.split('/').filter(Boolean).pop()
    if (base && /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(base)) {
      return decodeURIComponent(base)
    }
  } catch {
    /* ignore */
  }
  return 'image-from-url'
}
