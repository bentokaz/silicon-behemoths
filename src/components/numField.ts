// What a number typed into a field means: "95 mm", "1.5M", "$2,400", "-3.5 deg", "40%".

const MULT: Record<string, number> = { k: 1e3, K: 1e3, m: 1e6, M: 1e6, b: 1e9, B: 1e9, bn: 1e9 }

/**
 * The number in what was typed, with a unit or a currency sign around it ignored
 * and a thousands separator allowed. A k, M or B straight after the figure
 * multiplies it ("1.5M" is 1,500,000), unless it begins a longer word ("5 mm",
 * "8 Mb" are 5 and 8). Null when there is no figure at all.
 */
export function parseTyped(text: string): number | null {
  const m = /^\s*([-+−])?\s*[$£€]?\s*([-+−])?\s*((?:\d{1,3}(?:,\d{3})+|\d*)(?:\.\d*)?)\s*([a-zA-Z%°]*)/.exec(text)
  if (!m) return null
  const digits = m[3].replace(/,/g, '')
  if (!/\d/.test(digits)) return null
  let v = Number(digits)
  if (!Number.isFinite(v)) return null
  const suffix = m[4]
  if (suffix in MULT) v *= MULT[suffix]
  return (m[1] ?? m[2] ?? '').replace('−', '-') === '-' ? -v : v
}

/** How many decimal places a step needs: 0.25 needs 2, 0.5 needs 1, 10 needs none. */
export function placesOf(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0
  for (let p = 0; p < 6; p++) if (Math.abs(Math.round(step * 10 ** p) - step * 10 ** p) < 1e-9) return p
  return 6
}

/** Rounded to `places` decimals, without the float noise (0.1 + 0.2). */
export const roundTo = (v: number, places: number) => Number(v.toFixed(Math.max(0, Math.min(10, places))))

export interface FieldRule {
  min: number
  max: number
  /** The grid a committed value lands on, counted from zero. */
  step?: number
  /** Snap to `step`. */
  snap?: boolean
  /** Whole numbers only. */
  whole?: boolean
}

/** A value brought within the rule: snapped to its step (when asked), then within min and max. */
export function fitValue(v: number, { min, max, step, snap, whole }: FieldRule): number {
  if (!Number.isFinite(v)) v = Math.max(min, Math.min(max, 0))
  if (snap && step && step > 0) v = roundTo(Math.round(v / step) * step, placesOf(step))
  if (whole) v = Math.round(v)
  return Math.max(min, Math.min(max, v))
}

/**
 * What typed text commits to: the figure, divided by `scale` (a field that shows
 * a fraction as a percentage has a scale of 100), fitted to the rule. Null when
 * nothing readable was typed: the field then goes back to what it held.
 */
export function readField(text: string, rule: FieldRule & { scale?: number }): number | null {
  const n = parseTyped(text)
  if (n === null) return null
  return fitValue(n / (rule.scale ?? 1), rule)
}

/** One press of an arrow key: a step up or down (ten with Shift), snapped and within bounds. */
export function stepValue(v: number, dir: 1 | -1, rule: FieldRule & { big?: boolean }): number {
  const step = rule.step && rule.step > 0 ? rule.step : 1
  return fitValue(v + dir * step * (rule.big ? 10 : 1), { ...rule, step, snap: true })
}

/** A number as the field shows it for editing: no more decimals than asked for, no trailing zeros. */
export function editText(v: number, places: number): string {
  if (!Number.isFinite(v)) return '0'
  return String(roundTo(v, places))
}

/**
 * How a slider's readout maps back to its value, worked out from its `format`:
 * "95.5 mm" means typed figures are millimetres; "40%" for 0.4 means a scale of
 * 100. The format is tried at both ends and the middle of the range, so a
 * readout that is sometimes a word ("Off", "Unlimited") or that does not show
 * the value at all is left as a readout only (null).
 */
export function inferField(format: (v: number) => string, min: number, max: number): { scale: number; unit: string } | null {
  const probes = [min, (min + max) / 2, max]
  let found: { scale: number; unit: string } | null = null
  for (const scale of [1, 100]) {
    let unit: string | null = null
    let ok = true
    for (const v of probes) {
      const s = format(v)
      const n = parseTyped(s)
      const m = /^\s*[-+−]?\s*[$£€]?\s*[-+−]?\s*[\d.,]+\s*([kKmMbB](?![a-zA-Z]))?\s*(.*?)\s*$/.exec(s)
      if (n === null || !m) {
        ok = false
        break
      }
      const want = v * scale
      // the readout may round: allow a little more than half of its last shown digit, and 6% for "1.2M"
      const tol = Math.max(0.51 * 10 ** -((/\.(\d+)/.exec(s)?.[1].length) ?? 0), Math.abs(want) * 0.06)
      if (Math.abs(n - want) > tol) {
        ok = false
        break
      }
      const u = m[2]
      if (unit !== null && u !== unit) {
        ok = false
        break
      }
      unit = u
    }
    if (ok) {
      found = { scale, unit: unit ?? '' }
      break
    }
  }
  if (found && found.scale === 100 && found.unit !== '%') return null
  return found
}
