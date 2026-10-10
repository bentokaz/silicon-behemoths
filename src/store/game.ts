// Zustand store: holds the live GameState, the designer draft and UI state.
// The simulation mutates GameState in place; `rev` is bumped to re-render.
import { create } from 'zustand'
import { sfx } from '../audio/sfx'
import { DAYS_PER_MONTH } from '../data/catalog'
import { clampPart, newPart, nextPartId } from '../sim/geometry'
import { newGame, starterDesign, tick } from '../sim/game'
import type { Body, DeviceDesign, GameConfig, GameState, PartKind, PlacedPart, Specs } from '../sim/types'
import { AUTOSAVE, saveGame } from './saves'

export type Tab = 'dashboard' | 'products' | 'market' | 'rivals' | 'research' | 'finance' | 'system'
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
    set({ designing: true, draft, selectedPart: null, speed: 0 })
  },
  closeDesigner: () => set({ designing: false, selectedPart: null }),
  selectPart: (selectedPart) => set({ selectedPart }),

  setBody(patch) {
    const d = get().draft
    if (!d) return
    const body = { ...d.body, ...patch }
    set({ draft: { ...d, body, parts: d.parts.map((p) => clampPart(body, p)) } })
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
