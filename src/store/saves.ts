// Save slots in IndexedDB, plus export/import as a JSON file.
//
// Everything that can go wrong here is said in words the player can act on:
// a file that is not a save, a save that is damaged, one from a newer version
// of the game, storage that is full or switched off. Nothing that fails ever
// replaces a save that was good.
import { del, get, keys, set } from 'idb-keyval'
import { SAVE_VERSION, migrate, player } from '../sim/game'
import type { GameState } from '../sim/types'
import { deleteRemote, listRemote, pushRemote } from './cloud'

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

// ---------------------------------------------------------------- what can go wrong, in words

export const NOT_A_SAVE = 'This file is not a Silicon Behemoths save. Choose a file that was exported from this game: its name ends in .sbsave.json.'
export const DAMAGED = 'This save is damaged or incomplete and cannot be loaded'
/** What to do about a damaged save, said after what is wrong with it. */
export const TRY_ANOTHER = 'Load an earlier save or the autosave instead.'
const damaged = (why: string) => new Error(`${DAMAGED}: ${why}. ${TRY_ANOTHER}`)
export const NEWER = 'This save comes from a newer version of the game. Update the game to load it.'
export const TOO_BIG = 'This file is far too large to be a Silicon Behemoths save. Choose a file that was exported from this game: its name ends in .sbsave.json.'
export const NO_STORAGE = 'The browser will not let the game store saves (private browsing or blocked site data). Use Export to keep a copy as a file.'
export const STORAGE_FULL = 'The browser’s storage for this site is full. Delete old saves, or use Export to keep a copy as a file.'
/** The largest file an import will read. A save is a few megabytes; nothing near this size is one. */
export const MAX_IMPORT_BYTES = 64 * 1024 * 1024
/** The longest a slot name can be. */
export const MAX_SLOT = 60

/** Why storage refused, as something to tell the player. */
function storageError(e: unknown): Error {
  const name = (e as { name?: string })?.name ?? ''
  const text = String((e as { message?: string })?.message ?? e)
  if (name === 'QuotaExceededError' || /quota|storage.*full|disk.*full/i.test(text)) return new Error(STORAGE_FULL)
  return new Error(NO_STORAGE)
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** True for something that has the outline of a game: enough to tell a save from any other JSON. Changes nothing. */
export function looksLikeSave(state: unknown): state is GameState {
  if (!isObject(state)) return false
  const s = state as unknown as GameState
  return Array.isArray(s.companies) && s.companies.length > 0 && isObject(s.companies[0]) && Array.isArray(s.products) && finite(s.day) && finite(s.cash) && isObject(s.config) && typeof s.config.companyName === 'string'
}

/** What is unusable about a game once it has been brought up to date, or null. Only what the game cannot run without. */
function unusable(s: GameState): string | null {
  if (!finite(s.day) || s.day < 0 || !finite(s.cash) || !finite(s.rng) || !finite(s.nextId)) return 'its clock or its accounts are not numbers'
  if (!s.companies[0]?.isPlayer || typeof s.companies[0].name !== 'string') return 'it has no player company'
  if (!isObject(s.office) || !Array.isArray(s.office.grid) || !Array.isArray(s.office.items) || !Array.isArray(s.office.rooms)) return 'its head office is missing'
  if (!isObject(s.levels) || !isObject(s.cur) || !Array.isArray(s.reports) || !Array.isArray(s.staff) || !Array.isArray(s.news) || !isObject(s.stock) || !isObject(s.regions) || !isObject(s.supply)) return 'part of the company is missing'
  for (const p of s.products) {
    if (!isObject(p) || typeof p.id !== 'string' || !isObject(p.design) || !isObject(p.design.body) || !isObject(p.design.specs) || !Array.isArray(p.design.parts) || !finite(p.price) || !finite(p.stock)) return 'one of its devices is incomplete'
  }
  for (const c of s.companies) if (!isObject(c) || typeof c.id !== 'string' || !finite(c.brand) || !Array.isArray(c.segments)) return 'one of its companies is incomplete'
  return null
}

/**
 * Checks that something is a save this version can load and brings it up to
 * date. Throws an Error whose message can be shown to the player as it is.
 * The object handed in is changed in place (as loading always has): pass a
 * copy to keep the original.
 */
export function validate(state: unknown): GameState {
  // a file from the sync folder wraps the game with its label: take the game out
  if (isObject(state) && isObject(state.meta) && isObject(state.state) && !('companies' in state)) state = state.state
  if (!looksLikeSave(state)) throw new Error(NOT_A_SAVE)
  if (!finite(state.version ?? 0) || (state.version ?? 0) < 0) throw damaged('it does not say which version of the game wrote it')
  if (state.version > SAVE_VERSION) throw new Error(NEWER)
  let s: GameState
  try {
    s = migrate(state)
  } catch (e) {
    void e
    throw damaged('part of the company is missing or is not what it should be')
  }
  const problem = unusable(s)
  if (problem) throw damaged(problem)
  return s
}

/** Reads the text of a save file. Throws an Error to show the player. */
export function parseSave(text: string): GameState {
  if (typeof text !== 'string' || !text.trim()) throw new Error('This file is empty. Choose a file that was exported from this game: its name ends in .sbsave.json.')
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    // cut short on the way (a failed download, a sync that stopped half way), or not JSON at all
    if (text.trimStart().startsWith('{')) throw damaged('the file ends before the save does, as after a download or a sync that stopped half way')
    throw new Error(NOT_A_SAVE)
  }
  return validate(data)
}

const cleanSlot = (slot: string) => (typeof slot === 'string' ? slot.trim().slice(0, MAX_SLOT) : '')
const metaOf = (slot: string, state: GameState): SaveMeta => ({ slot, company: player(state).name, day: state.day, cash: state.cash, savedAt: Date.now() })
const goodMeta = (m: unknown): m is SaveMeta => isObject(m) && typeof m.slot === 'string' && !!m.slot.trim() && m.slot.length <= MAX_SLOT && finite(m.savedAt) && finite(m.day) && finite(m.cash) && typeof m.company === 'string'

// ---------------------------------------------------------------- slots

/** Save to a slot. Throws an Error to show the player if the browser will not store it; the slot's old contents are then untouched. */
export async function saveGame(slot: string, state: GameState): Promise<void> {
  const name = cleanSlot(slot)
  if (!name) throw new Error('Give the save a name, then save again')
  const meta = metaOf(name, state)
  try {
    await set(PREFIX + name, { meta, state } satisfies SaveFile)
  } catch (e) {
    throw storageError(e)
  }
  // a copy goes to the sync folder and the online account, if either is set up
  void pushRemote(name, { meta, state })
}

/**
 * Bring in any save from the sync folder or online account that is newer than
 * the copy here. A remote copy that is not a save this version can load (cut
 * short by a sync, written by a newer version, somebody else's file) is left
 * where it is and never replaces a local one.
 */
async function pullRemote() {
  for (const r of await listRemote()) {
    try {
      if (!goodMeta(r.meta) || r.meta.slot !== r.slot) continue
      const mine = await get<SaveFile>(PREFIX + r.slot)
      if (mine && goodMeta(mine.meta) && mine.meta.savedAt >= r.meta.savedAt) continue
      const state = await r.load()
      if (!looksLikeSave(state) || !finite(state.version ?? 0) || (state.version ?? 0) > SAVE_VERSION) continue
      await set(PREFIX + r.slot, { meta: r.meta, state } satisfies SaveFile)
    } catch {
      /* one copy that cannot be fetched or stored does not stop the others */
    }
  }
}

/** Save a copy of the game that is not the live one. */
export const saveSnapshot = (slot: string, state: GameState) => saveGame(slot, state)

export async function listSaves(): Promise<SaveMeta[]> {
  await pullRemote().catch(() => {})
  let all: string[]
  try {
    all = (await keys()).filter((k): k is string => typeof k === 'string' && k.startsWith(PREFIX))
  } catch {
    // no storage at all: there are no saves to list
    return []
  }
  const files = await Promise.all(all.map((k) => get<SaveFile>(k).catch(() => undefined)))
  return files
    .filter((f): f is SaveFile => !!f && goodMeta(f.meta))
    .map((f) => f.meta)
    .sort((a, b) => b.savedAt - a.savedAt)
}

/** Load a slot: null if there is nothing in it. Throws an Error to show the player if what is there cannot be loaded; the slot is left as it is. */
export async function loadGame(slot: string): Promise<GameState | null> {
  let f: SaveFile | undefined
  try {
    f = await get<SaveFile>(PREFIX + slot)
  } catch (e) {
    throw storageError(e)
  }
  return f ? validate(f.state) : null
}

export const deleteSave = async (slot: string) => {
  try {
    await del(PREFIX + slot)
  } catch (e) {
    throw storageError(e)
  }
  await deleteRemote(slot)
}

// ---------------------------------------------------------------- files

/** The name an exported save is given: the company and the day, in characters every file system takes. */
export const exportName = (state: GameState) => `${(player(state).name.replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'company').slice(0, 60)}-day${state.day}.sbsave.json`

export function exportGame(state: GameState) {
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = exportName(state)
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** Read a save from a file the player picked. Throws an Error to show them. No slot is touched: the caller decides what to do with the game. */
export async function importGame(file: Pick<File, 'size' | 'text'>): Promise<GameState> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error(TOO_BIG)
  let text: string
  try {
    text = await file.text()
  } catch {
    throw new Error('The file could not be read. Check that it is still where it was, and choose it again.')
  }
  return parseSave(text)
}
