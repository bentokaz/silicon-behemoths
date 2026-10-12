// Saving and loading, with the browser's storage and the sync targets replaced
// by fakes: what is kept, what is refused and why, and that nothing which fails
// ever replaces a save that was good.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SAVE_VERSION, defaultConfig, newGame, tick } from '../sim/game'
import type { GameState } from '../sim/types'
import type { RemoteSave } from './cloud'

const h = vi.hoisted(() => ({
  db: new Map<string, unknown>(),
  /** When set, every storage call fails with it, as a browser with storage full or switched off does. */
  fail: null as Error | null,
  remote: [] as unknown[],
  pushed: [] as string[],
  deleted: [] as string[],
}))

vi.mock('idb-keyval', () => {
  const guard = () => {
    if (h.fail) throw h.fail
  }
  return {
    get: async (k: string) => (guard(), structuredClone(h.db.get(k))),
    set: async (k: string, v: unknown) => (guard(), void h.db.set(k, structuredClone(v))),
    del: async (k: string) => (guard(), void h.db.delete(k)),
    keys: async () => (guard(), [...h.db.keys()]),
  }
})
vi.mock('./cloud', () => ({
  listRemote: async () => h.remote,
  pushRemote: async (slot: string) => void h.pushed.push(slot),
  deleteRemote: async (slot: string) => void h.deleted.push(slot),
}))

import { AUTOSAVE, DAMAGED, MAX_IMPORT_BYTES, NEWER, NOT_A_SAVE, NO_STORAGE, STORAGE_FULL, TOO_BIG, deleteSave, exportName, importGame, listSaves, loadGame, looksLikeSave, parseSave, saveGame, slotName, validate } from './saves'

const KEY = 'sb-save:'
const game = (name = 'Behemoth Labs', days = 40): GameState => tick(newGame({ ...defaultConfig(), companyName: name, seed: 9 }), days)
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v))
const file = (text: string, size = text.length) => ({ size, text: async () => text })
const failing = async (p: Promise<unknown>) => p.then(() => 'did not fail', (e: Error) => e.message)

beforeEach(() => {
  h.db.clear()
  h.fail = null
  h.remote = []
  h.pushed = []
  h.deleted = []
})

describe('slots', () => {
  it('saves, lists and loads a game exactly as it was', async () => {
    const s = game()
    await saveGame('main', s)
    await saveGame(AUTOSAVE, tick(copy(s), 5))
    const list = await listSaves()
    expect(list.map((m) => m.slot).sort()).toEqual([AUTOSAVE, 'main'])
    expect(list.find((m) => m.slot === 'main')).toMatchObject({ company: 'Behemoth Labs', day: 40, cash: s.cash })
    expect(list[0].savedAt).toBeGreaterThanOrEqual(list[1].savedAt)
    expect(await loadGame('main')).toEqual(copy(s))
    expect(await loadGame('nothing here')).toBeNull()
    // a copy went to wherever the player keeps copies
    expect(h.pushed).toEqual(['main', AUTOSAVE])
    expect(slotName(AUTOSAVE)).toBe('Autosave')
  })

  it('wants a name for a save, and keeps it to a sensible length', async () => {
    expect(await failing(saveGame('   ', game()))).toBe('Give the save a name, then save again')
    await saveGame('  spaced  ', game())
    await saveGame('x'.repeat(500), game())
    expect([...h.db.keys()].sort()).toEqual([KEY + 'spaced', KEY + 'x'.repeat(60)].sort())
  })

  it('deletes a save here and wherever copies are kept', async () => {
    await saveGame('main', game())
    await deleteSave('main')
    expect(await listSaves()).toEqual([])
    expect(h.deleted).toEqual(['main'])
  })

  it('lists what is sound and passes over what is not', async () => {
    await saveGame('main', game())
    h.db.set(KEY + 'no label', { state: game() })
    h.db.set(KEY + 'junk', 'not a save file at all')
    h.db.set(KEY + 'bad label', { meta: { slot: 'bad label', savedAt: 'yesterday' }, state: {} })
    h.db.set('some-other-key', { meta: { slot: 'x', savedAt: 1, day: 1, cash: 1, company: 'x' } })
    expect((await listSaves()).map((m) => m.slot)).toEqual(['main'])
  })
})

describe('when the browser will not store', () => {
  it('says the storage is full, and leaves the old save in the slot', async () => {
    const old = game('Old', 10)
    await saveGame('main', old)
    h.fail = Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' })
    expect(await failing(saveGame('main', game('New', 90)))).toBe(STORAGE_FULL)
    h.fail = null
    expect((await loadGame('main'))!.config.companyName).toBe('Old')
    // nothing was sent on from a save that did not happen
    expect(h.pushed).toEqual(['main'])
  })

  it('says so when there is no storage at all', async () => {
    h.fail = new Error('A mutation operation was attempted on a database that did not allow mutations.')
    expect(await failing(saveGame('main', game()))).toBe(NO_STORAGE)
    expect(await failing(loadGame('main'))).toBe(NO_STORAGE)
    expect(await failing(deleteSave('main'))).toBe(NO_STORAGE)
    expect(await listSaves()).toEqual([])
  })
})

describe('files', () => {
  it('exports and imports a game without changing it', async () => {
    const s = game()
    const back = await importGame(file(JSON.stringify(s)))
    expect(back).toEqual(copy(s))
    // a file from the sync folder carries a label round the game: that is a save too
    const wrapped = await importGame(file(JSON.stringify({ meta: { slot: 'main', company: 'x', day: 1, cash: 1, savedAt: 1 }, state: s })))
    expect(wrapped).toEqual(copy(s))
    expect(exportName(s)).toBe('Behemoth_Labs-day40.sbsave.json')
    expect(exportName({ ...s, companies: [{ ...s.companies[0], name: '../../<evil> name?' }] })).toBe('evil_name-day40.sbsave.json')
    expect(exportName({ ...s, companies: [{ ...s.companies[0], name: '***' }] })).toBe('company-day40.sbsave.json')
  })

  it('refuses what is not a save, in words, without touching any slot', async () => {
    const s = game()
    await saveGame('main', s)
    const before = copy(h.db.get(KEY + 'main'))
    const text = JSON.stringify(s)
    const cases: [string, string | RegExp][] = [
      ['', /^This file is empty\. Choose a file/],
      ['   \n', /^This file is empty\. Choose a file/],
      ['hello', NOT_A_SAVE],
      ['<html><body>404</body></html>', NOT_A_SAVE],
      ['null', NOT_A_SAVE],
      ['42', NOT_A_SAVE],
      ['[]', NOT_A_SAVE],
      ['{}', NOT_A_SAVE],
      ['{"name":"silicon-behemoths","version":"0.1.0","dependencies":{}}', NOT_A_SAVE],
      [JSON.stringify({ companies: [], products: [], day: 3 }), NOT_A_SAVE],
      [JSON.stringify({ meta: { slot: 'x' }, state: { hello: 'world' } }), NOT_A_SAVE],
      // cut short on the way
      [text.slice(0, Math.floor(text.length / 2)), /^This save is damaged or incomplete and cannot be loaded: the file ends before the save does.*Load an earlier save or the autosave instead\.$/],
      [text.slice(0, text.length - 1), /^This save is damaged or incomplete/],
      // whole, but with pieces missing or of the wrong kind
      [JSON.stringify({ ...s, office: null }), /^This save is damaged or incomplete/],
      [JSON.stringify({ ...s, products: [null] }), /^This save is damaged or incomplete/],
      [JSON.stringify({ ...s, companies: [{ ...s.companies[0], isPlayer: false }] }), /^This save is damaged or incomplete/],
      [JSON.stringify({ ...s, stock: 7 }), /^This save is damaged or incomplete/],
      [JSON.stringify({ ...s, rng: null }), /^This save is damaged or incomplete/],
      [JSON.stringify({ ...s, version: 'five' }), /^This save is damaged or incomplete/],
      [JSON.stringify({ ...s, version: SAVE_VERSION + 1 }), NEWER],
      [JSON.stringify({ ...s, version: 999 }), NEWER],
    ]
    for (const [body, want] of cases) {
      const said = await failing(importGame(file(body)))
      if (typeof want === 'string') expect(said, body.slice(0, 40)).toBe(want)
      else expect(said, body.slice(0, 40)).toMatch(want)
      // every refusal says what to do next
      expect(said, body.slice(0, 40)).toMatch(/(Choose a file that was exported from this game|Load an earlier save or the autosave instead|Update the game to load it)/)
      // and is a sentence for the player, never a stack of code
      expect(said).not.toMatch(/undefined|TypeError|Unexpected token|JSON\.parse|at position/)
    }
    expect(h.db.get(KEY + 'main')).toEqual(before)
    expect([...h.db.keys()]).toEqual([KEY + 'main'])
    expect(DAMAGED).toMatch(/damaged/)
  })

  it('does not read a file far too large to be a save', async () => {
    let read = false
    const huge = { size: MAX_IMPORT_BYTES + 1, text: async () => ((read = true), '{}') }
    expect(await failing(importGame(huge))).toBe(TOO_BIG)
    expect(read).toBe(false)
    expect(await failing(importGame({ size: 10, text: async () => Promise.reject(new Error('NotReadableError')) }))).toMatch(/^The file could not be read\. Check that it is still where it was/)
  })

  it('tells a save from any other data without changing it', () => {
    const s = game()
    const frozen = JSON.stringify(s)
    expect(looksLikeSave(s)).toBe(true)
    expect(JSON.stringify(s)).toBe(frozen)
    for (const v of [null, undefined, 3, 'save', [], {}, { companies: [{}], products: [], day: 1 }]) expect(looksLikeSave(v)).toBe(false)
    expect(() => validate({ ...copy(s), version: SAVE_VERSION + 1 })).toThrow(NEWER)
    expect(() => parseSave('{"companies":')).toThrow(/damaged or incomplete/)
  })
})

describe('copies kept elsewhere', () => {
  const remote = (slot: string, state: unknown, savedAt: number, meta: Partial<RemoteSave['meta']> = {}): RemoteSave => ({ slot, meta: { slot, company: 'Remote Co', day: 99, cash: 5, savedAt, ...meta }, load: async () => state })

  it('brings in a newer copy, and keeps the local one when that is newer', async () => {
    await saveGame('main', game('Local', 10))
    const mine = (h.db.get(KEY + 'main') as { meta: { savedAt: number } }).meta.savedAt
    h.remote = [remote('main', game('Remote', 60), mine + 1000), remote('second', game('Second', 20), 5)]
    expect((await listSaves()).map((m) => m.slot).sort()).toEqual(['main', 'second'])
    expect((await loadGame('main'))!.config.companyName).toBe('Remote')
    h.remote = [remote('main', game('Stale', 5), mine - 1000)]
    await listSaves()
    expect((await loadGame('main'))!.config.companyName).toBe('Remote')
  })

  it('never lets a copy that cannot be loaded replace a save that can', async () => {
    await saveGame('main', game('Local', 10))
    const before = copy(h.db.get(KEY + 'main'))
    const later = Date.now() + 1e6
    const good = game('Remote', 60)
    h.remote = [
      remote('main', { ...copy(good), version: SAVE_VERSION + 3 }, later),
      remote('main', { hello: 'world' }, later),
      remote('main', undefined, later),
      remote('main', 'a string', later),
      remote('main', good, NaN),
      remote('main', good, later, { slot: 'other' }),
      { slot: 'main', meta: null as never, load: async () => good },
      { slot: 'main', meta: { slot: 'main', company: 'x', day: 1, cash: 1, savedAt: later }, load: async () => Promise.reject(new Error('offline')) },
    ]
    const list = await listSaves()
    expect(list.map((m) => m.slot)).toEqual(['main'])
    expect(h.db.get(KEY + 'main')).toEqual(before)
    // and one bad copy does not stop a good one after it
    h.remote = [...(h.remote as RemoteSave[]), remote('extra', good, later)]
    expect((await listSaves()).map((m) => m.slot).sort()).toEqual(['extra', 'main'])
  })
})
