// How numbers are written on screen. One place, so money, counts and
// percentages read the same everywhere and never show a raw value.
//
// One format for every amount: three significant figures, no trailing zeros.
//   $449   $1.2K   $14K   $2.74M   $3.41B
// A figure the player types and must read back exactly (a retail price, a
// unit cost, a salary being negotiated) is written with `price`: $1,299.

/** The most a device can be priced at, and the largest single production run, so a slip of the keyboard cannot write a figure with thirty digits into the game. */
export const MAX_PRICE = 99_999
export const MAX_RUN = 50_000_000

/** Thousands separators are always commas, whatever the browser's language: the decimals beside them are always points. */
const whole = (v: number) => Math.round(v).toLocaleString('en-US')

const UNITS: [number, string][] = [
  [1e3, 'K'],
  [1e6, 'M'],
  [1e9, 'B'],
  [1e12, 'T'],
]

/** A number of a unit to three significant figures, without the zeros that say nothing: 1.20 is 1.2, 14.0 is 14. */
const sig3 = (v: number) => {
  const text = v.toFixed(v < 9.995 ? 2 : v < 99.95 ? 1 : 0)
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text
}

/**
 * A magnitude in short form: 1,200 is 1.2K, 14,000 is 14K, 2,740,000 is 2.74M.
 * Below a thousand it is written as a whole number. A value that would round
 * up to 1000 of its unit moves to the next one, so 999,999 is 1M and never 1000K.
 */
function short(a: number): string {
  if (Math.round(a) < 1000) return whole(a)
  for (let i = 0; i < UNITS.length; i++) {
    const [size, unit] = UNITS[i]
    const next = UNITS[i + 1]
    if (next && a >= next[0]) continue
    const text = sig3(a / size)
    if (Number(text) >= 1000) {
      // past the last unit there is nowhere to go: group the digits rather than fall into exponent form
      return next ? `${sig3(a / next[0])}${next[1]}` : `${whole(a / size)}${unit}`
    }
    return `${text}${unit}`
  }
  return whole(a)
}

/** True when a number written this way shows nothing but zeros, so a minus in front of it would be a lie. */
const isZero = (text: string) => !/[1-9]/.test(text)

/**
 * An amount of money: $449, $1.2K, $14K, $2.74M, $3.41B. Anything that is not
 * a number is "--". (The second argument is what older callers passed for a
 * number of decimals; every amount is now written to three figures.)
 */
export function money(v: number, _digits?: number): string {
  if (!Number.isFinite(v)) return '--'
  const body = short(Math.abs(v))
  return `${v < 0 && !isZero(body) ? '-' : ''}$${body}`
}

/** A change in money, always with its sign: +$1.2K, -$340. Nothing at all is "$0". */
export function moneyDelta(v: number): string {
  if (!Number.isFinite(v)) return '--'
  const body = short(Math.abs(v))
  return isZero(body) ? '$0' : `${v < 0 ? '-' : '+'}$${body}`
}

/** An exact amount in whole dollars, for a figure the player sets and reads back: $1,299. */
export function price(v: number): string {
  if (!Number.isFinite(v)) return '--'
  const body = whole(Math.abs(v))
  return `${v < 0 && !isZero(body) ? '-' : ''}$${body}`
}

/** A count, in the same short form as money: 449, 1.2K, 2.74M. */
export function num(v: number): string {
  if (!Number.isFinite(v)) return '--'
  const body = short(Math.abs(v))
  return `${v < 0 && !isZero(body) ? '-' : ''}${body}`
}

/** A whole number written out in full with separators: 1,234,567. */
export function int(v: number): string {
  if (!Number.isFinite(v)) return '--'
  const body = whole(Math.abs(v))
  return `${v < 0 && !isZero(body) ? '-' : ''}${body}`
}

/** A fraction as a percentage: 0.123 is 12.3%, 0.5 is 50%. One decimal at most, and none when it would be a zero. */
export function pct(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return '--'
  const fixed = (Math.abs(v) * 100).toFixed(digits)
  const body = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
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
