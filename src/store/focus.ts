// A place picked in the city view, for the screen it leads to. The city says
// which store or region was clicked; the screen reads it once as it opens.

const pending: Partial<Record<'store' | 'region', string>> = {}

export function aim(kind: 'store' | 'region', id: string) {
  pending[kind] = id
}

// What each screen was showing when it was last left (its sub-tab, a filter,
// how far a list was scrolled), so that coming back finds it the same. Kept
// for one game: starting or loading another forgets it.
const views = new Map<string, unknown>()
export const viewKept = (key: string) => views.has(key)
export const keptView = <T>(key: string) => views.get(key) as T
export const keepView = (key: string, value: unknown) => void views.set(key, value)
export function forgetViews() {
  views.clear()
  delete pending.store
  delete pending.region
}

/** The id the city pointed at, if any. Forgets it once read. */
export function takeAim(kind: 'store' | 'region'): string | undefined {
  const id = pending[kind]
  delete pending[kind]
  return id
}
