// Player settings and key bindings. Kept in the browser, outside any save,
// so they follow the player from one company to the next.
import { create } from 'zustand'

export type Quality = 'low' | 'medium' | 'high'

export interface Settings {
  /** How much the 3D views draw: shadows, ambient shading and resolution. */
  quality: Quality
  /** Multiplier on how fast the building camera pans, turns and zooms. */
  cameraSpeed: number
  /** Scroll wheel zooms toward the pointer rather than the middle of the view. */
  zoomToPointer: boolean
  /** Save automatically at month ends and big moments. */
  autosave: boolean
  /** Pause the game when something needs a decision. */
  pauseOnAlert: boolean
  /** Show people walking about the campus. */
  walkers: boolean
  /** Background sound of the place on screen, 0-1. */
  ambience: number
}

export const DEFAULT_SETTINGS: Settings = { quality: 'medium', cameraSpeed: 1, zoomToPointer: true, autosave: true, pauseOnAlert: false, walkers: true, ambience: 0.5 }

export const QUALITY: Record<Quality, { label: string; note: string; dpr: number; shadows: number; ao: boolean }> = {
  low: { label: 'Low', note: 'No shadows or shading. For laptops without a graphics card.', dpr: 1, shadows: 0, ao: false },
  medium: { label: 'Medium', note: 'Shadows, full resolution on most screens.', dpr: 1.25, shadows: 2048, ao: false },
  high: { label: 'High', note: 'Sharper, with soft contact shading in corners.', dpr: 2, shadows: 4096, ao: true },
}

export interface Action {
  id: string
  group: 'Game' | 'Screens' | 'Building' | 'Designer'
  label: string
  /** Default keys, as KeyboardEvent.code values. */
  keys: string[]
}

export const ACTIONS: Action[] = [
  { id: 'pause', group: 'Game', label: 'Pause or resume', keys: ['Space'] },
  { id: 'speed1', group: 'Game', label: 'Normal speed', keys: ['Digit1'] },
  { id: 'speed2', group: 'Game', label: 'Fast', keys: ['Digit2'] },
  { id: 'speed3', group: 'Game', label: 'Fastest', keys: ['Digit3'] },
  { id: 'save', group: 'Game', label: 'Quick save', keys: ['F5'] },
  { id: 'newDevice', group: 'Game', label: 'Design a new device', keys: ['KeyN'] },
  { id: 'feed', group: 'Game', label: 'Show or hide the news feed', keys: ['KeyF'] },
  { id: 'tab:city', group: 'Screens', label: 'City', keys: ['KeyG'] },
  { id: 'tab:dashboard', group: 'Screens', label: 'Overview', keys: ['F1'] },
  { id: 'tab:products', group: 'Screens', label: 'Devices', keys: ['F2'] },
  { id: 'tab:research', group: 'Screens', label: 'Research', keys: ['F3'] },
  { id: 'tab:market', group: 'Screens', label: 'Market', keys: ['F4'] },
  { id: 'tab:office', group: 'Screens', label: 'Campus', keys: ['KeyC'] },
  { id: 'tab:factory', group: 'Screens', label: 'Factory', keys: ['F6'] },
  { id: 'tab:stores', group: 'Screens', label: 'Stores', keys: ['F7'] },
  { id: 'tab:marketing', group: 'Screens', label: 'Marketing', keys: ['F8'] },
  { id: 'tab:staff', group: 'Screens', label: 'Staff', keys: ['F9'] },
  { id: 'tab:finance', group: 'Screens', label: 'Finance', keys: ['F10'] },
  { id: 'camForward', group: 'Building', label: 'Move the camera forward', keys: ['KeyW', 'ArrowUp'] },
  { id: 'camBack', group: 'Building', label: 'Move the camera back', keys: ['KeyS', 'ArrowDown'] },
  { id: 'camLeft', group: 'Building', label: 'Move the camera left', keys: ['KeyA', 'ArrowLeft'] },
  { id: 'camRight', group: 'Building', label: 'Move the camera right', keys: ['KeyD', 'ArrowRight'] },
  { id: 'camTurnLeft', group: 'Building', label: 'Turn the camera left', keys: ['KeyQ'] },
  { id: 'camTurnRight', group: 'Building', label: 'Turn the camera right', keys: ['KeyE'] },
  { id: 'camIn', group: 'Building', label: 'Zoom in', keys: ['Equal', 'NumpadAdd'] },
  { id: 'camOut', group: 'Building', label: 'Zoom out', keys: ['Minus', 'NumpadSubtract'] },
  { id: 'camHome', group: 'Building', label: 'Recentre the camera', keys: ['Home'] },
  { id: 'rotate', group: 'Building', label: 'Turn the item being placed', keys: ['KeyR'] },
  { id: 'cancel', group: 'Building', label: 'Put the tool away', keys: ['Escape'] },
  { id: 'sell', group: 'Building', label: 'Sell item tool', keys: ['Delete'] },
  { id: 'viewNext', group: 'Building', label: 'Next view (cutaway, walls, outside)', keys: ['KeyV'] },
  { id: 'buildMenu', group: 'Building', label: 'Open or close the build menu', keys: ['KeyB'] },
]

const KEY = 'sb-settings'
const BIND = 'sb-keys'

function read(key: string): Record<string, unknown> {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as unknown
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const within = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback)
const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)

/**
 * Settings as stored, made safe to use: anything missing, of the wrong kind
 * or out of range (an older build, a hand-edited or damaged entry) falls back
 * to its default instead of reaching the 3D views.
 */
export function cleanSettings(raw: Record<string, unknown>): Settings {
  const d = DEFAULT_SETTINGS
  return {
    quality: typeof raw.quality === 'string' && raw.quality in QUALITY ? (raw.quality as Quality) : d.quality,
    cameraSpeed: within(raw.cameraSpeed, 0.4, 2.5, d.cameraSpeed),
    zoomToPointer: flag(raw.zoomToPointer, d.zoomToPointer),
    autosave: flag(raw.autosave, d.autosave),
    pauseOnAlert: flag(raw.pauseOnAlert, d.pauseOnAlert),
    walkers: flag(raw.walkers, d.walkers),
    ambience: within(raw.ambience, 0, 1, d.ambience),
  }
}

/** Key bindings as stored, keeping only known actions with a list of key codes each, two at most. */
export function cleanBinds(raw: Record<string, unknown>): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const a of ACTIONS) {
    const keys = raw[a.id]
    if (Array.isArray(keys)) out[a.id] = [...new Set(keys.filter((k): k is string => typeof k === 'string' && k.length > 0))].slice(0, 2)
  }
  return out
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable */
  }
}

interface Store {
  settings: Settings
  /** Player's own keys per action id; missing means the default. */
  binds: Record<string, string[]>
  set(patch: Partial<Settings>): void
  bind(action: string, keys: string[]): void
  resetKeys(): void
  resetSettings(): void
}

export const useSettings = create<Store>((set, get) => ({
  settings: cleanSettings(read(KEY)),
  binds: cleanBinds(read(BIND)),
  set(patch) {
    const settings = cleanSettings({ ...get().settings, ...patch })
    write(KEY, settings)
    set({ settings })
  },
  bind(action, keys) {
    const binds = { ...get().binds, [action]: keys }
    write(BIND, binds)
    set({ binds })
  },
  resetKeys() {
    write(BIND, {})
    set({ binds: {} })
  },
  resetSettings() {
    write(KEY, DEFAULT_SETTINGS)
    set({ settings: DEFAULT_SETTINGS })
  },
}))

export const keysFor = (action: string): string[] => useSettings.getState().binds[action] ?? ACTIONS.find((a) => a.id === action)?.keys ?? []

/** The other actions that already use a key, by label: what binding it somewhere else would take it from. */
export const holdersOf = (code: string, except: string): string[] => ACTIONS.filter((a) => a.id !== except && keysFor(a.id).includes(code)).map((a) => a.label)

/** The action a key press means within the given groups, if any. */
export function actionFor(e: Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey'>, groups: Action['group'][]): string | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  for (const a of ACTIONS) if (groups.includes(a.group) && keysFor(a.id).includes(e.code)) return a.id
  return null
}

/** True while any key bound to the action is held. `held` is the set of pressed codes. */
export const isHeld = (held: Set<string>, action: string) => keysFor(action).some((k) => held.has(k))

/** A key code as the player would name it. */
export function keyName(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) return 'Num ' + (NUMPAD[code.slice(6)] ?? code.slice(6))
  return KEY_NAMES[code] ?? code
}
const NUMPAD: Record<string, string> = { Add: '+', Subtract: '-', Multiply: '*', Divide: '/', Decimal: '.', Enter: 'Enter', Equal: '=' }
const KEY_NAMES: Record<string, string> = {
  Space: 'Space',
  Escape: 'Esc',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Equal: '=',
  Minus: '-',
  Delete: 'Del',
  Insert: 'Ins',
  Backquote: '`',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  IntlBackslash: '\\',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  Backspace: 'Bksp',
  CapsLock: 'Caps',
  ContextMenu: 'Menu',
}
