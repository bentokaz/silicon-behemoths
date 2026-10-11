// A place picked in the city view, for the screen it leads to. The city says
// which store or region was clicked; the screen reads it once as it opens.

const pending: Partial<Record<'store' | 'region', string>> = {}

export function aim(kind: 'store' | 'region', id: string) {
  pending[kind] = id
}

/** The id the city pointed at, if any. Forgets it once read. */
export function takeAim(kind: 'store' | 'region'): string | undefined {
  const id = pending[kind]
  delete pending[kind]
  return id
}
