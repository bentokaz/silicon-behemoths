// Where things are. The rail has seven destinations and System; each has up
// to four pages, drawn as one row of tabs. Underneath, a page is still one of
// the screen ids the game has always had (`Tab`), sometimes with a view inside
// it: saves, key bindings and the guided progression all speak in those ids,
// so they are kept, and this file is the one place that says which
// destination and page each of them is now.
import type { CapId, Where } from '../sim/progress'

/** A screen id. These are what saves, key bindings and the progression rules name; they do not change. */
export type Tab = 'city' | 'dashboard' | 'products' | 'research' | 'labs' | 'factory' | 'stores' | 'venue' | 'marketing' | 'care' | 'staff' | 'office' | 'market' | 'world' | 'rivals' | 'finance' | 'shares' | 'goals' | 'system'

export const TABS: Tab[] = ['city', 'dashboard', 'products', 'research', 'labs', 'factory', 'stores', 'venue', 'marketing', 'care', 'staff', 'office', 'market', 'world', 'rivals', 'finance', 'shares', 'goals', 'system']

export type Dest = 'city' | 'company' | 'devices' | 'research' | 'campus' | 'sites' | 'marketing' | 'system'

export interface Page {
  /** `destination.page`, e.g. "campus.people". */
  id: string
  label: string
  tab: Tab
  /** The view of the screen this page is. A screen with one page has none. */
  view?: string
  /** Other views of the screen that are shown inside this page (Policies and Executives are inside People). */
  holds?: string[]
  /** A capability the page needs beyond its screen's own (Teams, Events). */
  cap?: CapId
}

export interface Destination {
  id: Dest
  label: string
  /** Three letters for the collapsed rail. */
  code: string
  /** Icon name from components/icons.tsx. */
  icon: string
  pages: Page[]
}

export const NAV: Destination[] = [
  { id: 'city', label: 'City', code: 'CTY', icon: 'city', pages: [{ id: 'city.city', label: 'City', tab: 'city' }] },
  {
    id: 'company',
    label: 'Company',
    code: 'CO',
    icon: 'company',
    pages: [
      { id: 'company.overview', label: 'Overview', tab: 'dashboard' },
      { id: 'company.finance', label: 'Finance', tab: 'finance' },
      { id: 'company.shares', label: 'Shares', tab: 'shares' },
      { id: 'company.growth', label: 'Growth', tab: 'goals' },
    ],
  },
  {
    id: 'devices',
    label: 'Devices',
    code: 'DEV',
    icon: 'devices',
    pages: [
      { id: 'devices.mine', label: 'Mine', tab: 'products' },
      { id: 'devices.market', label: 'Market', tab: 'market' },
      { id: 'devices.rivals', label: 'Rivals', tab: 'rivals' },
    ],
  },
  {
    id: 'research',
    label: 'Research',
    code: 'RES',
    icon: 'research',
    pages: [
      { id: 'research.tech', label: 'Technology', tab: 'research', view: 'tech' },
      { id: 'research.lines', label: 'Device lines', tab: 'research', view: 'lines' },
      { id: 'research.os', label: 'Operating system', tab: 'research', view: 'os' },
      { id: 'research.labs', label: 'Labs', tab: 'labs' },
    ],
  },
  {
    id: 'campus',
    label: 'Campus',
    code: 'HQ',
    icon: 'campus',
    pages: [
      { id: 'campus.build', label: 'Build', tab: 'office' },
      { id: 'campus.people', label: 'People', tab: 'staff', view: 'team', holds: ['policy', 'execs'] },
      { id: 'campus.teams', label: 'Teams', tab: 'staff', view: 'teams', cap: 'teams' },
      { id: 'campus.hiring', label: 'Hiring', tab: 'staff', view: 'hire' },
    ],
  },
  {
    id: 'sites',
    label: 'Sites',
    code: 'SIT',
    icon: 'sites',
    pages: [
      { id: 'sites.factory', label: 'Factory', tab: 'factory' },
      { id: 'sites.stores', label: 'Stores', tab: 'stores' },
      { id: 'sites.venue', label: 'Venue', tab: 'venue' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    code: 'MKT',
    icon: 'marketing',
    pages: [
      { id: 'marketing.campaigns', label: 'Campaigns', tab: 'marketing', view: 'campaigns' },
      { id: 'marketing.events', label: 'Events', tab: 'marketing', view: 'events', cap: 'events' },
      { id: 'marketing.owners', label: 'Owners', tab: 'care' },
    ],
  },
  {
    id: 'system',
    label: 'Save and settings',
    code: 'SYS',
    icon: 'system',
    pages: [
      { id: 'system.saves', label: 'Saves', tab: 'system', view: 'saves' },
      { id: 'system.company', label: 'Company', tab: 'system', view: 'company' },
      { id: 'system.settings', label: 'Settings', tab: 'system', view: 'settings' },
      { id: 'system.keys', label: 'Keys', tab: 'system', view: 'keys' },
    ],
  },
]

/**
 * The screen id whose key (`tab:<id>` in the key bindings) stands for each
 * whole destination: pressing it goes to the destination's last open page.
 * Every other screen id's key goes straight to that one page.
 */
export const DEST_KEY: Record<Dest, Tab> = { city: 'city', company: 'dashboard', devices: 'products', research: 'research', campus: 'office', sites: 'factory', marketing: 'marketing', system: 'system' }
/** The destination a key for this screen id opens as a whole, if it is one of the eight destination keys. */
export const destOfKey = (tab: Tab): Dest | undefined => (Object.keys(DEST_KEY) as Dest[]).find((d) => DEST_KEY[d] === tab)

/** The seven destinations of the rail, without System. */
export const RAIL = NAV.filter((d) => d.id !== 'system')
export const destOf = (id: Dest) => NAV.find((d) => d.id === id)!

/**
 * Older names for a place, as saves, bindings, the guide and the progression
 * rules may still give them, and where each is now. Regions are a layer of
 * the City; fans and feedback are part of Owners.
 */
export function resolve(where: Where): { tab: Tab; view?: string; role?: Where['role'] } {
  const tab = (TABS as string[]).includes(where.tab) ? (where.tab as Tab) : where.tab === 'overview' ? 'dashboard' : where.tab === 'devices' ? 'products' : where.tab === 'campus' ? 'office' : 'dashboard'
  if (tab === 'marketing' && where.view === 'fans') return { tab: 'care', role: where.role }
  // production orders are with the devices now, component supply with the company's finances; the factory page is its floor
  if (tab === 'factory' && where.view === 'orders') return { tab: 'products' }
  if (tab === 'factory' && where.view === 'supply') return { tab: 'finance' }
  if (tab === 'factory') return { tab }
  if (tab === 'staff' && (where.view === 'people' || where.view === 'staff')) return { tab, view: 'team', role: where.role }
  if (tab === 'staff' && where.view === 'applicants') return { tab, view: 'hire', role: where.role }
  if (tab === 'goals') return { tab, view: where.view === 'growth' || where.view === 'goals' ? where.view : undefined, role: where.role }
  return { tab, view: where.view, role: where.role }
}

/** The view a screen opens on when nothing has asked for another. */
export function defaultView(tab: Tab): string | undefined {
  for (const d of NAV) for (const p of d.pages) if (p.tab === tab && p.view) return p.view
  return undefined
}

/** The page a screen and view belong to. Every screen id has one. */
export function pageOf(tab: Tab, view?: string): Page {
  // the regions are a layer of the city, not a page of their own
  if (tab === 'world') return NAV[0].pages[0]
  const pages = NAV.flatMap((d) => d.pages).filter((p) => p.tab === tab)
  return pages.find((p) => p.view === view || p.holds?.includes(view ?? '')) ?? pages[0]
}

/** The destination a screen belongs to. */
export function destOfTab(tab: Tab, view?: string): Destination {
  const page = pageOf(tab, view)
  return NAV.find((d) => d.pages.includes(page))!
}

/** Where a page is, in the terms the store and the screens use. */
export const whereOf = (page: Page): Where => ({ tab: page.tab, view: page.view })

/** Every screen id a destination holds: what its badge and its "new" mark are counted over. */
export const tabsOf = (dest: Destination): Tab[] => [...new Set(dest.pages.map((p) => p.tab)), ...(dest.id === 'city' ? (['world'] as Tab[]) : [])]
