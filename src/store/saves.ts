// Save slots in IndexedDB, plus export/import as a JSON file.
import { del, get, keys, set } from 'idb-keyval'
import { SAVE_VERSION, migrate, player } from '../sim/game'
import type { GameState } from '../sim/types'

const PREFIX = 'sb-save:'
export const AUTOSAVE = 'autosave'
/** Written automatically the moment the company's cash goes negative. */
export const BEFORE_DEBT = 'before-debt'
export const slotName = (slot: string) => (slot === AUTOSAVE ? 'Autosave' : slot === BEFORE_DEBT ? 'Before the debt' : slot === 'quick' ? 'Quick save' : slot)

export interface SaveMeta {
  slot: string
  company: string
  day: number
  cash: number
  savedAt: number
}
interface SaveFile {
  meta: SaveMeta
  state: GameState
}

export async function saveGame(slot: string, state: GameState): Promise<void> {
  const meta: SaveMeta = { slot, company: player(state).name, day: state.day, cash: state.cash, savedAt: Date.now() }
  await set(PREFIX + slot, { meta, state } satisfies SaveFile)
}

/** Save a copy of the game that is not the live one. */
export const saveSnapshot = (slot: string, state: GameState) => saveGame(slot, state)

export async function listSaves(): Promise<SaveMeta[]> {
  const all = (await keys()).filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX))
  const files = await Promise.all(all.map((k) => get<SaveFile>(k)))
  return files.filter((f): f is SaveFile => !!f).map((f) => f.meta).sort((a, b) => b.savedAt - a.savedAt)
}

export async function loadGame(slot: string): Promise<GameState | null> {
  const f = await get<SaveFile>(PREFIX + slot)
  return f ? validate(f.state) : null
}

export const deleteSave = (slot: string) => del(PREFIX + slot)

export function validate(state: unknown): GameState {
  const s = state as GameState
  if (!s || typeof s !== 'object' || !Array.isArray(s.companies) || !Array.isArray(s.products) || typeof s.day !== 'number') throw new Error('This file is not a Silicon Behemoths save')
  if (s.version > SAVE_VERSION) throw new Error('This save comes from a newer version of the game')
  return migrate(s)
}

export function exportGame(state: GameState) {
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${player(state).name.replace(/[^\w-]+/g, '_')}-day${state.day}.sbsave.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export async function importGame(file: File): Promise<GameState> {
  return validate(JSON.parse(await file.text()))
}
