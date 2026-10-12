import { beforeEach, describe, expect, it } from 'vitest'
import { ACTIONS, DEFAULT_SETTINGS, actionFor, cleanBinds, cleanSettings, holdersOf, keyName, keysFor, useSettings } from './settings'

const press = (code: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ code, ctrlKey: false, metaKey: false, altKey: false, ...mods })

describe('settings as stored', () => {
  it('falls back to the default for anything missing, mistyped or out of range', () => {
    expect(cleanSettings({})).toEqual(DEFAULT_SETTINGS)
    expect(cleanSettings({ quality: 'ultra', cameraSpeed: 'fast', autosave: 'yes', ambience: NaN })).toEqual(DEFAULT_SETTINGS)
    expect(cleanSettings({ quality: 'high', cameraSpeed: 99, ambience: -3, walkers: false })).toEqual({ ...DEFAULT_SETTINGS, quality: 'high', cameraSpeed: 2.5, ambience: 0, walkers: false })
  })

  it('never lets a bad value through the store', () => {
    useSettings.getState().set({ quality: 'nope' as never, ambience: 7 })
    expect(useSettings.getState().settings.quality).toBe(DEFAULT_SETTINGS.quality)
    expect(useSettings.getState().settings.ambience).toBe(1)
    useSettings.getState().resetSettings()
  })

  it('keeps only real bindings: known actions, lists of key codes, two at most', () => {
    expect(cleanBinds({ pause: ['KeyP'], nonsense: ['KeyX'], speed1: 'Digit9', speed2: [1, null, 'KeyK', 'KeyK', 'KeyL', 'KeyM'] })).toEqual({ pause: ['KeyP'], speed2: ['KeyK', 'KeyL'] })
  })
})

describe('key bindings', () => {
  beforeEach(() => useSettings.getState().resetKeys())

  it('gives every action but the single pages a default key, and no key to two actions', () => {
    const seen = new Map<string, string>()
    for (const a of ACTIONS) {
      // single pages have no key until the player gives them one
      if (a.group !== 'Pages') expect(a.keys.length, a.id).toBeGreaterThan(0)
      for (const k of a.keys) {
        expect(seen.get(k), `${k} is on both ${seen.get(k)} and ${a.id}`).toBeUndefined()
        seen.set(k, a.id)
      }
    }
  })

  it('finds the action for a key within the groups asked for, and none with a modifier held', () => {
    expect(actionFor(press('Space'), ['Game'])).toBe('pause')
    expect(actionFor(press('Space'), ['Building'])).toBeNull()
    expect(actionFor(press('KeyW'), ['Building'])).toBe('camForward')
    expect(actionFor(press('Space', { ctrlKey: true }), ['Game'])).toBeNull()
    expect(actionFor(press('KeyZ'), ['Game', 'Screens', 'Building'])).toBeNull()
  })

  it('follows a rebinding: the new key works and the old one stops', () => {
    useSettings.getState().bind('pause', ['KeyP'])
    expect(keysFor('pause')).toEqual(['KeyP'])
    expect(actionFor(press('KeyP'), ['Game'])).toBe('pause')
    expect(actionFor(press('Space'), ['Game'])).toBeNull()
    useSettings.getState().resetKeys()
    expect(actionFor(press('Space'), ['Game'])).toBe('pause')
  })

  it('says who already holds a key', () => {
    expect(holdersOf('Space', 'speed1')).toEqual(['Pause or resume'])
    expect(holdersOf('Space', 'pause')).toEqual([])
    expect(holdersOf('KeyZ', 'pause')).toEqual([])
  })

  it('names keys the way a keyboard does', () => {
    expect(keyName('KeyW')).toBe('W')
    expect(keyName('Digit3')).toBe('3')
    expect(keyName('NumpadAdd')).toBe('Num +')
    expect(keyName('Numpad5')).toBe('Num 5')
    expect(keyName('Escape')).toBe('Esc')
    expect(keyName('F10')).toBe('F10')
    expect(keyName('Comma')).toBe(',')
    expect(keyName('Backspace')).toBe('Bksp')
  })

  it('gives the eight destinations F1 to F9 without the save key, and single pages no key until one is given', () => {
    const keys = ['tab:city', 'tab:dashboard', 'tab:products', 'tab:research', 'tab:office', 'tab:factory', 'tab:marketing', 'tab:system'].map((id) => keysFor(id)[0])
    expect(keys).toEqual(['F1', 'F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9'])
    for (const a of ACTIONS.filter((x) => x.group === 'Pages')) expect(keysFor(a.id), a.id).toEqual([])
    expect(holdersOf('F1', 'tab:finance')).toEqual(['City'])
  })

  it('lets a single page be given a key and have it taken away again, and keeps that through a reload', () => {
    useSettings.getState().bind('tab:finance', ['KeyK'])
    expect(actionFor(press('KeyK'), ['Pages'])).toBe('tab:finance')
    useSettings.getState().bind('tab:finance', [])
    expect(keysFor('tab:finance')).toEqual([])
    expect(cleanBinds({ 'tab:finance': [] })).toEqual({ 'tab:finance': [] })
  })

  it('has keys of its own for undo and redo in the builders', () => {
    expect(ACTIONS.find((a) => a.id === 'undo')?.group).toBe('Building')
    expect(ACTIONS.find((a) => a.id === 'redo')?.group).toBe('Building')
    expect(actionFor(press('KeyU'), ['Building'])).toBe('undo')
  })
})
