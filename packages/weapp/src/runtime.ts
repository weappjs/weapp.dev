/** Both tsdown's entry files and shared Node chunks live at the dist root. */
const runtimeRoot = new URL(import.meta.url.endsWith('.ts') ? '../dist/' : './', import.meta.url)

export function runtimeAsset(relative: string): URL {
  return new URL(relative, runtimeRoot)
}
