// Colour arithmetic for the colour picker: hex, RGB (0-255) and HSV (h 0-360, s and v 0-1).

export interface Rgb {
  r: number
  g: number
  b: number
}
export interface Hsv {
  h: number
  s: number
  v: number
}

/** '#rrggbb' in lower case from what was typed: #rgb or #rrggbb, with or without the #. Null when it is not a colour. */
export function parseHex(text: string): string | null {
  const t = text.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(t)) return `#${t[0]}${t[0]}${t[1]}${t[1]}${t[2]}${t[2]}`
  if (/^[0-9a-f]{6}$/.test(t)) return `#${t}`
  return null
}

export function hexToRgb(hex: string): Rgb {
  const h = parseHex(hex) ?? '#000000'
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) }
}

const byte = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b].map((n) => byte(n).toString(16).padStart(2, '0')).join('')}`
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const R = r / 255
  const G = g / 255
  const B = b / 255
  const max = Math.max(R, G, B)
  const min = Math.min(R, G, B)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === R) h = 60 * (((G - B) / d) % 6)
    else if (max === G) h = 60 * ((B - R) / d + 2)
    else h = 60 * ((R - G) / d + 4)
  }
  if (h < 0) h += 360
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const H = (((h % 360) + 360) % 360) / 60
  const S = Math.max(0, Math.min(1, s))
  const V = Math.max(0, Math.min(1, v))
  const c = V * S
  const x = c * (1 - Math.abs((H % 2) - 1))
  const m = V - c
  const [r, g, b] = H < 1 ? [c, x, 0] : H < 2 ? [x, c, 0] : H < 3 ? [0, c, x] : H < 4 ? [0, x, c] : H < 5 ? [x, 0, c] : [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}

export const hexToHsv = (hex: string) => rgbToHsv(hexToRgb(hex))
export const hsvToHex = (hsv: Hsv) => rgbToHex(hsvToRgb(hsv))

/** The list of recent colours with `hex` put first, without repeats, at most `keep` long. */
export function pushRecent(list: readonly string[], hex: string, keep = 8): string[] {
  const c = parseHex(hex)
  if (!c) return [...list]
  return [c, ...list.filter((x) => x !== c)].slice(0, keep)
}
