// Is this a device design at all? Scoring, costing and the internal layout
// look a design's choices up in tables, and take its measurements as numbers:
// handed an index past the end of a table, or a measurement that is not a
// number, they would fail or produce nonsense. The editor can only make valid
// designs; this is the check for one that came from anywhere else (an edited
// or damaged save, another program), made before the game accepts it.
import { LENSES, MAX_LEVEL, REFRESH } from '../data/catalog'
import { ANC, COOLERS, FLIP_COVERS, GPUS, HINGES, MIC_ARRAYS, OPTICS, SPEAKERS, TYPES, driverOptions, inputOptions, sizeLimits } from '../data/devices'
import type { DeviceDesign, Face, PartKind } from './types'

const FACES: Face[] = ['front', 'back', 'left', 'right', 'top', 'bottom']
const KINDS: PartKind[] = ['camera', 'island', 'flash', 'notch', 'button', 'port', 'grille', 'fingerprint', 'logo', 'vent', 'slot', 'light']
/** The most parts a design can carry. Far more than any device has; few enough to lay out. */
export const MAX_PARTS = 400

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const index = (v: unknown, length: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < length
const text = (v: unknown) => typeof v === 'string' && v.length <= 200
const optional = (v: unknown, ok: (v: unknown) => boolean) => v === undefined || ok(v)

/** What is wrong with a design, in a few words, or null if the game can work with it. */
export function designProblem(design: unknown): string | null {
  const d = design as DeviceDesign
  if (!d || typeof d !== 'object') return 'it is not a design'
  if (typeof d.type !== 'string' || !Object.hasOwn(TYPES, d.type)) return 'its kind of device is unknown'
  const b = d.body
  const s = d.specs
  if (!b || typeof b !== 'object') return 'it has no body'
  if (!s || typeof s !== 'object') return 'it has no specification'
  if (!Array.isArray(d.parts)) return 'it has no list of parts'

  // ---- the body: measurements in millimetres
  for (const k of ['width', 'height', 'thickness'] as const) if (!num(b[k]) || b[k] <= 0 || b[k] > 5000) return `its ${k} is not a measurement`
  if (!optional(b.fold, (v) => v === 'book' || v === 'flip')) return 'it folds in no known way'
  // no device of a kind is a fraction of the smallest or several times the largest that kind comes in
  const lim = sizeLimits(d.type, b.fold)
  if (b.width < lim.width[0] * 0.5 || b.width > lim.width[1] * 2) return `its width is not that of a ${TYPES[d.type].name.toLowerCase()}`
  if (b.height < lim.height[0] * 0.5 || b.height > lim.height[1] * 2) return `its height is not that of a ${TYPES[d.type].name.toLowerCase()}`
  if (b.thickness < 1 || b.thickness > TYPES[d.type].maxThickness * 2) return `its thickness is not that of a ${TYPES[d.type].name.toLowerCase()}`
  for (const k of ['corner', 'bezelTop', 'bezelBottom', 'bezelSide'] as const) if (!num(b[k]) || b[k] < 0 || b[k] > 2500) return `its ${k} is not a measurement`
  if (b.edge !== 'flat' && b.edge !== 'round') return 'its edge is neither flat nor round'
  if (b.backFinish !== 'gloss' && b.backFinish !== 'matte') return 'its finish is neither gloss nor matte'
  for (const k of ['frameMat', 'backMat', 'frameColor', 'backColor'] as const) if (!text(b[k])) return `its ${k} is missing`
  for (const k of ['strap', 'strapColor', 'stand'] as const) if (!optional(b[k], text)) return `its ${k} is not a choice`
  if (!optional(b.buds, (v) => v === 'stem' || v === 'bean')) return 'its buds are of no known shape'
  if (!optional(b.form, (v) => v === 'column' || v === 'orb' || v === 'block')) return 'its form is of no known shape'
  if (!optional(b.screen, (v) => typeof v === 'boolean')) return 'its screen is neither there nor not'
  if (!optional(b.fold, (v) => v === 'book' || v === 'flip')) return 'it folds in no known way'
  if (!optional(b.cover, (v) => index(v, FLIP_COVERS.length))) return 'its cover screen is not a choice'

  // ---- the specification: places in the tables of options
  if (!index(s.panel, MAX_LEVEL + 1)) return 'its display panel is not a choice'
  if (!REFRESH.some((r) => r.hz === s.refresh)) return 'its refresh rate is not a choice'
  if (!index(s.chipGen, MAX_LEVEL + 1) || !index(s.chipTier, 3)) return 'its chip is not a choice'
  if (!optional(s.customChip, text)) return 'its own chip is not a choice'
  if (!num(s.ram) || s.ram < 0 || s.ram > 1e6) return 'its memory is not an amount'
  if (!num(s.storage) || s.storage < 0 || s.storage > 1e9) return 'its storage is not an amount'
  if (!num(s.battery) || s.battery < 0 || s.battery > 1e7) return 'its battery is not a capacity'
  if (!index(s.charging, MAX_LEVEL + 1)) return 'its charging is not a choice'
  if (!Array.isArray(s.extras) || s.extras.length > 50 || !s.extras.every(text)) return 'its extras are not a list'
  if (!optional(s.io, (v) => Array.isArray(v) && v.length <= 100 && v.every(text))) return 'its ports are not a list'
  if (!optional(s.gpu, (v) => index(v, GPUS.length))) return 'its graphics card is not a choice'
  if (!optional(s.keyboard, (v) => index(v, inputOptions(d.type)?.length ?? 1))) return 'its input device is not a choice'
  if (!optional(s.cooling, (v) => index(v, COOLERS.length))) return 'its cooling is not a choice'
  if (!optional(s.speakers, (v) => index(v, SPEAKERS.length))) return 'its speakers are not a choice'
  if (!optional(s.driver, (v) => index(v, driverOptions(d.type).length))) return 'its driver is not a choice'
  if (!optional(s.anc, (v) => index(v, ANC.length))) return 'its noise cancelling is not a choice'
  if (!optional(s.hinge, (v) => index(v, HINGES.length))) return 'its hinge is not a choice'
  if (!optional(s.optics, (v) => index(v, OPTICS.length))) return 'its lenses are not a choice'
  if (!optional(s.mics, (v) => index(v, MIC_ARRAYS.length))) return 'its microphones are not a choice'

  // ---- the parts on its faces
  if (d.parts.length > MAX_PARTS) return `it has more than ${MAX_PARTS} parts`
  const ids = new Set<string>()
  for (const p of d.parts) {
    if (!p || typeof p !== 'object' || !text(p.id)) return 'one of its parts is not a part'
    if (ids.has(p.id)) return 'two of its parts share an id'
    ids.add(p.id)
    if (!KINDS.includes(p.kind) || !FACES.includes(p.face)) return 'one of its parts is of no known kind or on no known face'
    for (const k of ['x', 'y', 'rot'] as const) if (!num(p[k]) || Math.abs(p[k]) > 1e5) return 'one of its parts is in no place'
    for (const k of ['w', 'h'] as const) if (!num(p[k]) || p[k] < 0 || p[k] > 1e4) return 'one of its parts has no size'
    if (!optional(p.r, (v) => num(v) && (v as number) >= 0 && (v as number) <= 1e4)) return 'one of its parts has no radius'
    if (!optional(p.sensor, (v) => index(v, MAX_LEVEL + 1))) return 'one of its cameras has an unknown sensor'
    if (!optional(p.lens, (v) => typeof v === 'string' && Object.hasOwn(LENSES, v))) return 'one of its cameras has an unknown lens'
    if (!optional(p.text, text) || !optional(p.color, text)) return 'one of its parts carries text that is not text'
    if (!optional(p.finish, (v) => v === 'frame' || v === 'back' || v === 'black')) return 'one of its parts has an unknown finish'
  }
  if (!num(d.wallpaper)) return 'its wallpaper is not a choice'
  if (!optional(d.colors, (v) => Array.isArray(v) && v.length <= 24 && v.every((c) => c && text(c.name) && text(c.frame) && text(c.back)))) return 'its colours are not a list'
  return null
}
