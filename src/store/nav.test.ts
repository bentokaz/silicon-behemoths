// The map from the screen ids the game has always used (in saves, key
// bindings, the guide and the progression rules) to the seven destinations
// and their pages.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { defaultConfig } from '../sim/game'
import { CAPS, capOfTab } from '../sim/progress'
import { STEPS } from '../components/Guide'
import { useStore } from './game'
import { DEST_KEY, NAV, RAIL, TABS, type Tab, defaultView, destOfKey, destOfTab, pageOf, resolve, tabsOf } from './nav'
import { ACTIONS } from './settings'

const st = () => useStore.getState()

beforeAll(() => {
  ;(globalThis as { window?: unknown }).window ??= globalThis
})

describe('the navigation map', () => {
  it('has seven destinations and System, none with more than four pages', () => {
    expect(RAIL.map((d) => d.label)).toEqual(['City', 'Company', 'Devices', 'Research', 'Campus', 'Sites', 'Marketing'])
    expect(NAV[NAV.length - 1].id).toBe('system')
    for (const d of NAV) expect(d.pages.length, d.id).toBeLessThanOrEqual(4)
  })

  it('gives every old screen id a destination and a page', () => {
    for (const tab of TABS) {
      const page = pageOf(tab)
      expect(page, tab).toBeDefined()
      expect(NAV.some((d) => d.pages.includes(page)), tab).toBe(true)
      expect(destOfTab(tab).pages).toContain(page)
    }
    const where = (tab: Tab, view?: string) => `${destOfTab(tab, view).label} > ${pageOf(tab, view).label}`
    expect(where('dashboard')).toBe('Company > Overview')
    expect(where('finance')).toBe('Company > Finance')
    expect(where('shares')).toBe('Company > Shares')
    expect(where('goals')).toBe('Company > Growth')
    expect(where('products')).toBe('Devices > Mine')
    expect(where('market')).toBe('Devices > Market')
    expect(where('rivals')).toBe('Devices > Rivals')
    expect(where('research')).toBe('Research > Technology')
    expect(where('research', 'lines')).toBe('Research > Device lines')
    expect(where('labs')).toBe('Research > Labs')
    expect(where('office')).toBe('Campus > Build')
    expect(where('staff')).toBe('Campus > People')
    expect(where('staff', 'teams')).toBe('Campus > Teams')
    expect(where('staff', 'hire')).toBe('Campus > Hiring')
    expect(where('factory')).toBe('Sites > Factory')
    expect(where('stores')).toBe('Sites > Stores')
    expect(where('venue')).toBe('Sites > Venue')
    expect(where('marketing')).toBe('Marketing > Campaigns')
    expect(where('marketing', 'events')).toBe('Marketing > Events')
    expect(where('care')).toBe('Marketing > Owners')
    expect(where('world')).toBe('City > City')
    expect(where('system', 'keys')).toBe('Save and settings > Keys')
  })

  it('keeps Policies and Executives inside People', () => {
    expect(pageOf('staff', 'policy').label).toBe('People')
    expect(pageOf('staff', 'execs').label).toBe('People')
  })

  it('puts no page in two places and names each page once', () => {
    const ids = NAV.flatMap((d) => d.pages.map((p) => p.id))
    expect(new Set(ids).size).toBe(ids.length)
    const places = NAV.flatMap((d) => d.pages.map((p) => `${p.tab}/${p.view ?? ''}`))
    expect(new Set(places).size).toBe(places.length)
  })

  it('resolves the older names for a place', () => {
    expect(resolve({ tab: 'marketing', view: 'fans' })).toMatchObject({ tab: 'care' })
    expect(resolve({ tab: 'overview' })).toMatchObject({ tab: 'dashboard' })
    expect(resolve({ tab: 'staff', view: 'hire', role: 'engineer' })).toEqual({ tab: 'staff', view: 'hire', role: 'engineer' })
    expect(resolve({ tab: 'nonsense' })).toMatchObject({ tab: 'dashboard' })
    expect(defaultView('staff')).toBe('team')
    expect(defaultView('research')).toBe('tech')
    expect(defaultView('finance')).toBeUndefined()
  })

  it('still knows every screen the progression rules and the guide speak of', () => {
    const known = new Set<string>(TABS)
    for (const cap of CAPS) {
      for (const t of cap.tabs ?? []) expect(known.has(t), `${cap.id} opens ${t}`).toBe(true)
      if (cap.home) expect(known.has(cap.home.tab), `${cap.id} home`).toBe(true)
      for (const r of cap.reqs) if (r.where) expect(known.has(r.where.tab), `${cap.id}: ${r.label}`).toBe(true)
    }
    for (const step of STEPS) {
      if (step.tab) expect(known.has(step.tab), step.title).toBe(true)
      if (step.where) expect(known.has(step.where.tab), step.title).toBe(true)
    }
    // and every capability that locks a screen still locks a page that exists
    for (const tab of TABS) {
      const cap = capOfTab(tab)
      if (cap) expect(pageOf(tab), `${cap} > ${tab}`).toBeDefined()
    }
  })

  it('counts a destination over every screen it holds', () => {
    expect(tabsOf(NAV.find((d) => d.id === 'campus')!).sort()).toEqual(['office', 'staff'])
    expect(tabsOf(NAV.find((d) => d.id === 'city')!).sort()).toEqual(['city', 'world'])
  })
})

describe('keys for screens', () => {
  it('has a key action for every old screen id, so a key bound long ago still resolves', () => {
    const ids = new Set(ACTIONS.map((a) => a.id))
    for (const tab of TABS) expect(ids.has(`tab:${tab}`), tab).toBe(true)
  })

  it('gives the eight destination keys a default and marks them as whole destinations', () => {
    for (const d of NAV) {
      const action = ACTIONS.find((a) => a.id === `tab:${DEST_KEY[d.id]}`)!
      expect(action.group, d.id).toBe('Screens')
      expect(action.keys.length, d.id).toBe(1)
      expect(destOfKey(DEST_KEY[d.id])).toBe(d.id)
    }
    expect(ACTIONS.find((a) => a.id === 'tab:city')!.keys).toEqual(['F1'])
    expect(destOfKey('finance')).toBeUndefined()
  })
})

describe('going places', () => {
  beforeEach(() => st().begin({ ...defaultConfig(), seed: 7, startType: 'phone', progression: 'open' }))

  it('opens a new game and a loaded game on the city', () => {
    expect(st().tab).toBe('city')
    const game = st().game!
    st().setTab('finance')
    st().resume(game)
    expect(st().tab).toBe('city')
  })

  it('lands on the page asked for, and a destination goes back to its page that was last open', () => {
    st().go({ tab: 'staff', view: 'hire', role: 'engineer' })
    expect(st().tab).toBe('staff')
    expect(st().views.staff).toBe('hire')
    expect(st().hint?.role).toBe('engineer')
    st().goDest('company')
    expect(st().tab).toBe('dashboard')
    st().go({ tab: 'finance' })
    st().goDest('devices')
    st().goDest('company')
    expect(st().tab).toBe('finance')
    st().goDest('campus')
    expect(st().tab).toBe('staff')
    expect(st().views.staff).toBe('hire')
  })

  it('sends fans and feedback to Owners', () => {
    st().go({ tab: 'marketing', view: 'fans' })
    expect(st().tab).toBe('care')
  })

  it('shows what a locked page takes instead of going to it', () => {
    st().begin({ ...defaultConfig(), seed: 7, startType: 'phone', progression: 'guided' })
    st().go({ tab: 'finance' })
    expect(st().tab).toBe('city')
    expect(st().lockCard?.cap).toBe('finance')
    st().showLock(null)
    st().goDest('research')
    expect(st().tab).toBe('city')
    expect(st().lockCard?.cap).toBe('research')
    st().showLock(null)
    // Teams is a page of an open screen with a lock of its own
    st().go({ tab: 'staff', view: 'teams' })
    expect(st().lockCard?.cap).toBe('teams')
    expect(st().tab).toBe('city')
    // the campus is open from the first minute: the destination goes to a page that is
    st().showLock(null)
    st().goDest('campus')
    expect(st().tab).toBe('office')
  })

  it('opens one drawer at a time', () => {
    st().focus('p1')
    st().openPerson('e1')
    expect(st().inspect).toBeNull()
    expect(st().person).toBe('e1')
    st().focus('p1')
    expect(st().person).toBeNull()
  })

  it('says things through the one queue', () => {
    st().say('Saved.')
    st().say('Not enough cash.', 'bad')
    expect(st().notes.filter((n) => n.kind === 'say')).toHaveLength(1)
    expect(st().notes[0].text).toBe('Not enough cash.')
    st().dismiss(st().notes[0].id)
    expect(st().notes).toHaveLength(0)
  })
})
