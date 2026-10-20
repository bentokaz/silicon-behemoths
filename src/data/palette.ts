// The named device colours the designer offers, in families, and the colours the company has used before: its own
// house colours, read from its devices in the save (most recent first), and the scheme a new design starts from.
import type { DeviceDesign, DeviceType, Product } from '../sim/types'

export interface NamedColour {
  name: string
  hex: string
}
export interface ColourFamily {
  title: string
  colours: NamedColour[]
}

/** Finishes and named colours, as device makers name them. */
export const DEVICE_PALETTE: ColourFamily[] = [
  {
    title: 'Classic finishes',
    colours: [
      { name: 'Midnight', hex: '#1c2129' },
      { name: 'Starlight', hex: '#e9e2d4' },
      { name: 'Space grey', hex: '#4a4c51' },
      { name: 'Silver', hex: '#d7d9dc' },
      { name: 'Graphite', hex: '#2f3033' },
      { name: 'Jet black', hex: '#0d0e10' },
      { name: 'Gold', hex: '#e3cfa6' },
      { name: 'Rose gold', hex: '#e6c0b0' },
    ],
  },
  {
    title: 'Metals',
    colours: [
      { name: 'Titanium natural', hex: '#bdb6ab' },
      { name: 'Black titanium', hex: '#3a3a3c' },
      { name: 'White titanium', hex: '#efede8' },
      { name: 'Desert titanium', hex: '#c7a98a' },
      { name: 'Brushed aluminium', hex: '#b9bcc0' },
      { name: 'Gunmetal', hex: '#53565c' },
      { name: 'Copper', hex: '#b87352' },
      { name: 'Champagne', hex: '#d8c6a5' },
    ],
  },
  {
    title: 'Colours',
    colours: [
      { name: 'Sierra blue', hex: '#a7c1d9' },
      { name: 'Pacific blue', hex: '#2e4a63' },
      { name: 'Alpine green', hex: '#4d5e4c' },
      { name: 'Deep purple', hex: '#4b3f55' },
      { name: 'Product red', hex: '#bf1e2d' },
      { name: 'Coral', hex: '#ee7762' },
      { name: 'Sunset orange', hex: '#e8743b' },
      { name: 'Forest', hex: '#2e4a3c' },
      { name: 'Ocean teal', hex: '#2a7f84' },
      { name: 'Cobalt', hex: '#2f5fb3' },
    ],
  },
  {
    title: 'Pastels',
    colours: [
      { name: 'Lavender', hex: '#cfc4e6' },
      { name: 'Mint', hex: '#c6e8d5' },
      { name: 'Sky', hex: '#c4def2' },
      { name: 'Blush', hex: '#f2cfd3' },
      { name: 'Lemon', hex: '#f4ecb0' },
      { name: 'Peach', hex: '#f6d2b8' },
      { name: 'Sage', hex: '#c9d3bd' },
      { name: 'Lilac', hex: '#e1c9e8' },
    ],
  },
]

const HEX = /^#[0-9a-f]{6}$/i
/** The name of a colour of the palette, if it is one. */
export const colourName = (hex: string) => DEVICE_PALETTE.flatMap((f) => f.colours).find((c) => c.hex === hex.toLowerCase())?.name

/** The company's designs, most recent first: those in development or on sale before those that have ended. */
function ownDesigns(products: readonly Product[], companyId = 'player'): DeviceDesign[] {
  return products
    .filter((p) => p.companyId === companyId)
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (b.p.launchDay ?? 0) - (a.p.launchDay ?? 0) || b.i - a.i)
    .map(({ p }) => p.design)
}

/** Every colour the company's devices have used, most recent first, each once: the body, the frame and the colourways. */
export function houseColours(products: readonly Product[], max = 12): string[] {
  const out: string[] = []
  for (const d of ownDesigns(products)) {
    for (const c of [d.body.backColor, d.body.frameColor, ...(d.colors ?? []).flatMap((w) => [w.back, w.frame])]) {
      const hex = typeof c === 'string' && HEX.test(c) ? c.toLowerCase() : null
      if (hex && !out.includes(hex)) out.push(hex)
      if (out.length >= max) return out
    }
  }
  return out
}

/**
 * A new design in the company's house colours: the body and frame colours of its latest device of the same kind, or
 * failing that of its latest device of any kind, and the same kind's colourways too. A first device keeps its own.
 */
export function inHouseColours(d: DeviceDesign, products: readonly Product[], type: DeviceType): DeviceDesign {
  const designs = ownDesigns(products)
  const last = designs.find((x) => x.type === type) ?? designs[0]
  if (!last) return d
  const same = last.type === type
  return {
    ...d,
    body: { ...d.body, backColor: last.body.backColor, frameColor: last.body.frameColor },
    colors: same && last.colors?.length ? last.colors.map((c) => ({ ...c })) : d.colors,
  }
}
