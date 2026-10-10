// Zustand store: holds the live GameState, the designer draft and UI state.
// The simulation mutates GameState in place; `rev` is bumped to re-render.
import { create } from 'zustand'
import { sfx } from '../audio/sfx'
import { DAYS_PER_MONTH } from '../data/catalog'
import { clampPart, newPart, nextPartId } from '../sim/geometry'
import { newGame, player, starterDesign, tick } from '../sim/game'
import { type FingerprintStyle, type FrontStyle, layoutParts } from '../sim/rivals'
import type { Body, DeviceDesign, GameConfig, GameState, PartKind, PlacedPart, Specs } from '../sim/types'
import { AUTOSAVE, saveGame } from './saves'

export type Tab = 'dashboard' | 'products' | 'market' | 'rivals' | 'research' | 'staff' | 'office' | 'finance' | 'system'
export type EditorMode = 'simple' | 'advanced'

/** Choices of the simple editor. The parts are generated from these. */
export interface SimpleLayout {
  layout: number
  cams: number
  sensor: number
  front: FrontStyle
  fingerprint: FingerprintStyle
  flash: boolean
  logo: string
}

function savedMode(): EditorMode {
  try {
    return localStorage.getItem('sb-editor') === 'advanced' ? 'advanced' : 'simple'
  } catch {
    return 'simple'
  }
}

function relayout(d: DeviceDesign, o: SimpleLayout, g: GameState): PlacedPart[] {
  return layoutParts(d.body, { ...o, periscope: g.features.includes('periscope') && o.sensor >= 3, stereo: d.specs.extras.includes('stereo'), logoImage: !!player(g).logo })
}
export type Speed = 0 | 1 | 2 | 4
/** Simulated days per real second at each speed. */
export const DAYS_PER_SECOND: Record<Speed, number> = { 0: 0, 1: 1, 2: 3, 4: 10 }

interface Store {
  screen: 'menu' | 'new' | 'game'
  tab: Tab
  game: GameState | null
  rev: number
  speed: Speed
  designing: boolean
  editorMode: EditorMode
  simple: SimpleLayout
  draft: DeviceDesign | null
  selectedPart: string | null
  focusProduct: string | null
  toast: { text: string; tone: 'ok' | 'bad' } | null

  setScreen(s: Store['screen']): void
  setTab(t: Tab): void
  setSpeed(s: Speed): void
  begin(cfg: GameConfig): void
  resume(state: GameState): void
  quit(): void
  advance(days: number): void
  act<T>(fn: (g: GameState) => T): T
  say(text: string, tone?: 'ok' | 'bad'): void
  focus(productId: string | null, tab?: Tab): void

  openDesigner(from?: DeviceDesign): void
  closeDesigner(): void
  setEditorMode(m: EditorMode): void
  setSimple(patch: Partial<SimpleLayout>): void
  selectPart(id: string | null): void
  setBody(patch: Partial<Body>): void
  setSpecs(patch: Partial<Specs>): void
  setDraft(patch: Partial<DeviceDesign>): void
  addPart(kind: PartKind): void
  patchPart(id: string, patch: Partial<PlacedPart>): void
  removePart(id: string): void
  duplicatePart(id: string): void
}

let toastTimer = 0

export const useStore = create<Store>((set, get) => ({
  screen: 'menu',
  tab: 'dashboard',
  game: null,
  rev: 0,
  speed: 0,
  designing: false,
  editorMode: savedMode(),
  simple: { layout: 1, cams: 3, sensor: 0, front: 'notch', fingerprint: 'side', flash: true, logo: '' },
  draft: null,
  selectedPart: null,
  focusProduct: null,
  toast: null,

  setScreen: (screen) => set({ screen }),
  setTab: (tab) => set({ tab }),
  setSpeed: (speed) => set({ speed }),
  begin: (cfg) => set({ game: newGame(cfg), screen: 'game', tab: 'dashboard', speed: 0, rev: 0, designing: false, draft: null, focusProduct: null }),
  resume: (state) => set({ game: state, screen: 'game', tab: 'dashboard', speed: 0, rev: 0, designing: false, draft: null, focusProduct: null }),
  quit: () => set({ game: null, screen: 'menu', speed: 0, designing: false, draft: null }),

  advance(days) {
    const g = get().game
    if (!g || g.gameOver || days <= 0) return
    const lastNews = g.news[0]?.id ?? 0
    const month = Math.floor(g.day / DAYS_PER_MONTH)
    tick(g, days)
    const fresh = g.news.filter((n) => n.id > lastNews && n.kind !== 'rival')
    if (fresh.some((n) => n.kind === 'alert')) sfx.error()
    else if (fresh.some((n) => n.kind === 'review' || n.kind === 'research')) sfx.confirm()
    else if (fresh.length) sfx.notify()
    if (Math.floor(g.day / DAYS_PER_MONTH) !== month) void saveGame(AUTOSAVE, g).catch(() => {})
    set({ rev: get().rev + 1, speed: g.gameOver ? 0 : get().speed })
  },

  act(fn) {
    const g = get().game!
    const out = fn(g)
    set({ rev: get().rev + 1 })
    return out
  },

  say(text, tone = 'ok') {
    window.clearTimeout(toastTimer)
    set({ toast: { text, tone } })
    if (tone === 'bad') sfx.error()
    toastTimer = window.setTimeout(() => set({ toast: null }), 3200)
  },

  focus: (focusProduct, tab) => set(tab ? { focusProduct, tab } : { focusProduct }),

  openDesigner(from) {
    const g = get().game
    if (!g) return
    const draft: DeviceDesign = from ? JSON.parse(JSON.stringify(from)) : starterDesign(g)
    // read the simple-editor choices back from the parts that are there
    const rear = draft.parts.filter((p) => p.kind === 'camera' && p.face === 'back')
    const selfie = draft.parts.find((p) => p.kind === 'camera' && p.face === 'front')
    const fp = draft.parts.find((p) => p.kind === 'fingerprint')
    const logo = draft.parts.find((p) => p.kind === 'logo')
    const simple: SimpleLayout = {
      layout: 1,
      cams: Math.min(4, Math.max(1, rear.length)),
      sensor: rear.reduce((m, p) => Math.max(m, p.sensor ?? 0), 0),
      front: selfie?.underDisplay ? 'under' : draft.parts.some((p) => p.kind === 'notch') ? 'notch' : g.features.includes('punch') ? 'punch' : 'notch',
      fingerprint: !fp ? 'none' : fp.face === 'front' ? 'display' : fp.face === 'back' ? 'back' : 'side',
      flash: draft.parts.some((p) => p.kind === 'flash'),
      logo: logo?.text ?? player(g).name.split(' ')[0].slice(0, 10).toUpperCase(),
    }
    set({ designing: true, draft, simple, selectedPart: null, speed: 0 })
  },
  closeDesigner: () => set({ designing: false, selectedPart: null }),
  setEditorMode(editorMode) {
    try {
      localStorage.setItem('sb-editor', editorMode)
    } catch {
      /* storage unavailable */
    }
    set({ editorMode, selectedPart: null })
  },
  setSimple(patch) {
    const { draft: d, game: g } = get()
    if (!d || !g) return
    const simple = { ...get().simple, ...patch }
    set({ simple, draft: { ...d, parts: relayout(d, simple, g) }, selectedPart: null })
  },
  selectPart: (selectedPart) => set({ selectedPart }),

  setBody(patch) {
    const d = get().draft
    if (!d) return
    const body = { ...d.body, ...patch }
    const g = get().game
    // the simple editor owns the layout, so it follows the body as it changes shape
    if (get().editorMode === 'simple' && g) set({ draft: { ...d, body, parts: relayout({ ...d, body }, get().simple, g) } })
    else set({ draft: { ...d, body, parts: d.parts.map((p) => clampPart(body, p)) } })
  },
  setSpecs(patch) {
    const d = get().draft
    if (d) set({ draft: { ...d, specs: { ...d.specs, ...patch } } })
  },
  setDraft(patch) {
    const d = get().draft
    if (d) set({ draft: { ...d, ...patch } })
  },
  addPart(kind) {
    const d = get().draft
    const g = get().game
    if (!d || !g) return
    const p = newPart(kind, d, kind === 'camera' ? g.levels.camera : 0)
    set({ draft: { ...d, parts: [...d.parts, p] }, selectedPart: p.id })
  },
  patchPart(id, patch) {
    const d = get().draft
    if (!d) return
    set({ draft: { ...d, parts: d.parts.map((p) => (p.id === id ? clampPart(d.body, { ...p, ...patch }) : p)) } })
  },
  removePart(id) {
    const d = get().draft
    if (d) set({ draft: { ...d, parts: d.parts.filter((p) => p.id !== id) }, selectedPart: null })
  },
  duplicatePart(id) {
    const d = get().draft
    const src = d?.parts.find((p) => p.id === id)
    if (!d || !src) return
    const copy = clampPart(d.body, { ...src, id: nextPartId(d), x: src.x + (src.w + 2), y: src.y })
    set({ draft: { ...d, parts: [...d.parts, copy] }, selectedPart: copy.id })
  },
}))

/** The live game. Re-renders the caller whenever the simulation changes. */
export function useGame(): GameState {
  useStore((s) => s.rev)
  return useStore((s) => s.game)!
}
