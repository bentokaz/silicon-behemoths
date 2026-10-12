// How numbers are written on screen. One place, so money, counts and
// percentages read the same everywhere and never show a raw value.

/** The most a device can be priced at, and the largest single production run, so a slip of the keyboard cannot write a figure with thirty digits into the game. */
export const MAX_PRICE = 99_999
export const MAX_RUN = 50_000_000

/** Thousands separators are always commas, whatever the browser's language: the decimals beside them are always points. */
const whole = (v: number) => Math.round(v).toLocaleString('en-US')

const UNITS: [number, string][] = [
  [1e12, 'T'],
  [1e9, 'B'],
  [1e6, 'M'],
  [1e3, 'K'],
]

/**
 * A magnitude in short form: 12,345 is 12.3K, 2,500,000 is 2.50M. Below ten
 * thousand it is written out in full. A value that would round up to 1000 of
 * its unit moves to the next one, so 999,999 is 1.00M and never 1000.0K.
 */
function short(a: number, digits: number): string {
  if (a < 1e4) return whole(a)
  for (let i = UNITS.length - 1; i >= 0; i--) {
    const [size, unit] = UNITS[i]
    const next = UNITS[i - 1]
    if (next && a >= next[0]) continue
    // thousands keep one decimal; billions and up never fewer than two, so a valuation reads the same on every screen
    const d = unit === 'K' ? 1 : unit === 'M' ? digits : Math.max(2, digits)
    const text = (a / size).toFixed(d)
    if (Number(text) >= 1000 && next) return `${(a / next[0]).toFixed(next[1] === 'M' ? digits : Math.max(2, digits))}${next[1]}`
    // past the last unit there is nowhere to go: group the digits rather than fall into exponent form
    return `${Number(text) >= 1000 ? whole(a / size) : text}${unit}`
  }
  return whole(a)
}

/** True when a number written this way shows nothing but zeros, so a minus in front of it would be a lie. */
const isZero = (text: string) => !/[1-9]/.test(text)

/** An amount of money: $9,999, $12.3K, $2.50M, $1.25B. Anything that is not a number is "--". */
export function money(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return '--'
  const body = short(Math.abs(v), digits)
  return `${v < 0 && !isZero(body) ? '-' : ''}$${body}`
}

/** A count, in the same short form as money. */
export function num(v: number): string {
  if (!Number.isFinite(v)) return '--'
  const body = short(Math.abs(v), 2)
  return `${v < 0 && !isZero(body) ? '-' : ''}${body}`
}

/** A whole number written out in full with separators: 1,234,567. */
export function int(v: number): string {
  if (!Number.isFinite(v)) return '--'
  const body = whole(Math.abs(v))
  return `${v < 0 && !isZero(body) ? '-' : ''}${body}`
}

/** A fraction as a percentage: 0.123 is 12.3%. */
export function pct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '--'
  const body = (Math.abs(v) * 100).toFixed(digits)
  return `${v < 0 && !isZero(body) ? '-' : ''}${body}%`
}

/**
 * What a number field holds once someone has typed in it: a number within
 * bounds, whole unless decimals are wanted. Empty or unreadable text is the
 * lower bound (or zero when the bound is below it).
 */
export function readNumber(text: string, { min = 0, max = 1e9, whole: wholeOnly = true }: { min?: number; max?: number; whole?: boolean } = {}): number {
  const v = Number(text.trim())
  if (text.trim() === '' || !Number.isFinite(v)) return Math.max(min, Math.min(max, 0))
  const n = wholeOnly ? Math.round(v) : v
  return Math.max(min, Math.min(max, n))
}
