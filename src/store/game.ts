// Zustand store: holds the live GameState, the designer draft and UI state.
// The simulation mutates GameState in place; `rev` is bumped to re-render.
import { create } from 'zustand'
import { sfx } from '../audio/sfx'
import { DAYS_PER_MONTH } from '../data/catalog'
import { setEra, startYear } from '../data/eras'
import { TYPES } from '../data/devices'
import { clampPart, isCoverCam, newPart, nextPartId } from '../sim/geometry'
import { migrate, newGame, player, starterDesign, tick } from '../sim/game'
import { type CapId, type Where, capOf, capOfTab, has, isNear, locked, stepProgress } from '../sim/progress'
import { monthCosts } from '../sim/types'
import { hasType } from '../sim/world'
import { type FingerprintStyle, type FrontStyle, type VariantId, deriveVariant, layoutParts, syncSockets } from '../sim/rivals'
import type { Body, DeviceDesign, DeviceType, Face, GameConfig, GameState, PartKind, PlacedPart, Product, Specs } from '../sim/types'
import { forgetViews } from './focus'
import { type Dest, type Tab, defaultView, destOf, destOfTab, pageOf, resolve, whereOf } from './nav'
import { type NewNote, type Note, dropNote, dropNotes, pushNote } from './notes'
import { AUTOSAVE, BEFORE_DEBT, saveGame, saveSnapshot } from './saves'
import { useSettings } from './settings'

/** News that marks a moment worth an autosave. */
const BIG_NEWS = /is on sale\.|now sells in|listed on the stock market|You bought|moved to a bigger|bought land|new store opened|invested \$|Goal reached|Now open: /

export type { Dest, Tab } from './nav'

/** A copy of the game from a little earlier, kept so a doomed company can be rewound. */
export interface Checkpoint {
  day: number
  json: string
}
/** The most recent copy taken while the company still had money in the bank. */
let rolling: Checkpoint | null = null
/** A copy of a game to come back to, if it has money in the bank and money matters in it. */
const copyOf = (g: GameState): Checkpoint | null => (g.cash >= 0 && !g.config.unlimitedMoney && !g.gameOver ? { day: g.day, json: JSON.stringify(g) } : null)
/** True once the player has been told that autosaving is failing, so that they are told once and not every month. */
let autosaveWarned = false
export type Speed = 0 | 1 | 2 | 4
/** Simulated days per real second at each speed. */
export const DAYS_PER_SECOND: Record<Speed, number> = { 0: 0, 1: 1, 2: 3, 4: 10 }
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

/** What the device being designed will be called and what it derives from. */
export interface DraftMeta {
  family: string
  variant: string
}

function saved(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable */
  }
}

function savedFeed(): Partial<Record<Tab, boolean>> {
  try {
    const raw = JSON.parse(saved('sb-feed-by-screen', '{}')) as unknown
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    return Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'boolean')) as Partial<Record<Tab, boolean>>
  } catch {
    return {}
  }
}

/** Name offered for a new product line, e.g. "Acme Tab 2". */
const defaultName = (company: string, type: DeviceType, count: number) => `${company} ${TYPES[type].series ? TYPES[type].series + ' ' : ''}${count}`

/**
 * A name for a new device that is not already taken: the one proposed, or the
 * next number after it that is free. "Acme 2" when Acme 2 and 3 exist is "Acme 4".
 * A name counts as taken while any of the company's devices, on sale or not,
 * carries it with the same variant label.
 */
export function freeFamily(g: GameState, propose: string, variant = ''): string {
  const taken = new Set(g.products.filter((p) => p.companyId === 'player' && (p.variant ?? '') === variant).map((p) => p.family.trim().toLowerCase()))
  let name = propose.trim()
  for (let i = 0; i < 500 && taken.has(name.trim().toLowerCase()); i++) {
    const m = /^(.*?)(\d+)$/.exec(name)
    name = m ? `${m[1]}${Number(m[2]) + 1}` : `${name} 2`
  }
  return name
}

function relayout(d: DeviceDesign, o: SimpleLayout, g: GameState): PlacedPart[] {
  return layoutParts(d.body, { ...o, type: d.type, periscope: g.features.includes('periscope') && o.sensor >= 3, stereo: d.specs.extras.includes('stereo'), logoImage: !!player(g).logo, io: d.specs.io })
}

/** Read the simple editor's choices back from an existing set of parts. */
function readLayout(d: DeviceDesign, g: GameState): SimpleLayout {
  const rear = d.parts.filter((p) => p.kind === 'camera' && p.face === 'back' && !isCoverCam(d, p))
  const selfie = d.parts.find((p) => p.kind === 'camera' && p.face === 'front')
  const fp = d.parts.find((p) => p.kind === 'fingerprint')
  const logo = d.parts.find((p) => p.kind === 'logo')
  return {
    layout: 1,
    // a headset's cameras are the tracking cameras on its front
    cams: d.type === 'headset' ? d.parts.filter((p) => p.kind === 'camera').length : Math.min(4, Math.max(d.type === 'phone' || d.type === 'foldable' ? 1 : 0, rear.length)),
    sensor: d.parts.filter((p) => p.kind === 'camera' && !isCoverCam(d, p)).reduce((m, p) => Math.max(m, p.sensor ?? 0), 0),
    front: selfie?.underDisplay ? 'under' : d.parts.some((p) => p.kind === 'notch') ? 'notch' : g.features.includes('punch') ? 'punch' : 'notch',
    fingerprint: !fp ? 'none' : fp.face === 'front' ? 'display' : fp.face === 'back' ? 'back' : 'side',
    flash: d.parts.some((p) => p.kind === 'flash' || p.kind === 'light'),
    logo: logo?.text ?? player(g).name.split(' ')[0].slice(0, 10).toUpperCase(),
  }
}

interface Store {
  screen: 'menu' | 'new' | 'game'
  tab: Tab
  game: GameState | null
  rev: number
  speed: Speed
  /** Product shown in the slide-over inspector. */
  inspect: string | null
  railOpen: boolean
  /** The player's own choice of whether the news feed is open beside each screen. A screen with no entry follows its default. */
  feedOn: Partial<Record<Tab, boolean>>
  setFeed(tab: Tab, open: boolean): void
  /** The last thing said in answer to the player (see `say`). What is on screen is the messenger's queue, `notes`. */
  toast: { text: string; tone: 'ok' | 'bad' } | null
  /** The messenger's queue: everything waiting to be said in the one strip. */
  notes: Note[]
  /** Queue a line for the strip. */
  note(add: NewNote): void
  /** Take a line out of the strip: dismissed, acted on, or timed out. */
  dismiss(id: number): void
  /** The view each screen is showing, for the screens that have several pages. */
  views: Partial<Record<Tab, string>>
  setView(tab: Tab, view: string): void
  /** The page of each destination that was last open, so the rail goes back to it. */
  lastPage: Partial<Record<Dest, string>>
  /** Go to a destination of the rail: its page that was last open, or the first that is. */
  goDest(dest: Dest): void
  /** The game as it stood just before cash last went negative. */
  checkpoint: Checkpoint | null
  /** Id of the keynote being replayed, if any. */
  showing: string | null
  /** Employee whose card is open, from any screen. */
  person: string | null
  /** The locked capability whose card is open, and how far down the screen it was asked for. */
  lockCard: { cap: CapId; y?: number } | null
  /** Screens that opened this session and have not been visited. */
  freshTabs: Tab[]
  /** A view inside a screen to show when it next opens ("take me there"). */
  hint: Where | null
  /** Open the card for a locked capability (null closes it). */
  showLock(cap: CapId | null, y?: number): void
  /** Go to where something can be done: a screen, and a view inside it. */
  go(where: Where): void
  takeHint(): void
  /** The year whose summary is on screen, if any. */
  yearEnd: number | null
  closeYear(): void
  openPerson(id: string | null): void

  designing: boolean
  editorMode: EditorMode
  simple: SimpleLayout
  draft: DeviceDesign | null
  meta: DraftMeta
  selectedPart: string | null
  past: DeviceDesign[]
  future: DeviceDesign[]

  setScreen(s: Store['screen']): void
  setTab(t: Tab): void
  setSpeed(s: Speed): void
  begin(cfg: GameConfig): void
  resume(state: GameState): void
  quit(): void
  advance(days: number): void
  act<T>(fn: (g: GameState) => T): T
  say(text: string, tone?: 'ok' | 'bad'): void
  focus(productId: string | null): void
  /** Go back to the save taken before the company went into debt. */
  rewind(): void
  watch(eventId: string | null): void
  toggleRail(): void

  /**
   * True while a design that was being worked on is set aside: the designer
   * was left for another screen with changes made. "New device" picks it up
   * again instead of starting over.
   */
  kept: boolean
  /** Open the designer. With no options it picks up a design that was set aside, if there is one. */
  openDesigner(opts?: { type?: DeviceType; from?: Product; variant?: VariantId | 'next' }): void
  /** Leave the designer. The design is set aside if it has changes, unless it is being thrown away or has just been launched. */
  closeDesigner(discard?: boolean): void
  setType(type: DeviceType): void
  setMeta(patch: Partial<DraftMeta>): void
  setEditorMode(m: EditorMode): void
  setSimple(patch: Partial<SimpleLayout>): void
  selectPart(id: string | null): void
  setBody(patch: Partial<Body>): void
  setSpecs(patch: Partial<Specs>): void
  setDraft(patch: Partial<DeviceDesign>): void
  /** Add a part with sensible defaults, or at a given spot on a face. */
  addPart(kind: PartKind, at?: { face: Face; x: number; y: number }): void
  patchPart(id: string, patch: Partial<PlacedPart>): void
  removePart(id: string): void
  duplicatePart(id: string): void
  undo(): void
  redo(): void
}

let lastEdit = 0

export const useStore = create<Store>((set, get) => {
  /** Replace the draft, remembering the previous one for undo. Rapid edits (a slider drag) count as one step. */
  const edit = (draft: DeviceDesign, extra: Partial<Store> = {}) => {
    const cur = get().draft
    const now = performance.now()
    const merge = now - lastEdit < 450
    lastEdit = now
    set({ draft, future: [], past: cur && !merge ? [...get().past.slice(-59), cur] : get().past, ...extra })
  }
  // everything that belongs to one game and must not follow the player into another
  const reset = { designing: false, kept: false, draft: null, inspect: null, person: null, yearEnd: null, toast: null, notes: [], views: {}, lastPage: {}, past: [], future: [], selectedPart: null, lockCard: null, freshTabs: [], hint: null }
  /** Whether the design on the bench is worth setting aside: it has been changed since it was opened. */
  const worthKeeping = () => get().designing && !!get().draft && get().past.length > 0
  /** Capabilities open before a step of the simulation, to tell which ones it opened. */
  const openBefore = (g: GameState) => new Set(Object.keys(g.unlocks ?? {}))
  /** Autosave, and say so once if the browser will not take it: a player who thinks the game is being saved must know when it is not. */
  const autosave = (g: GameState) =>
    void saveGame(AUTOSAVE, g).then(
      () => void (autosaveWarned = false),
      (e: Error) => {
        if (autosaveWarned) return
        autosaveWarned = true
        get().say(`Autosave is not working. ${e.message}`, 'bad')
      },
    )
  /** Announce whatever opened: a sound, a line in the strip each, and a "new" mark on any new screen. */
  const announce = (g: GameState, before: Set<string>) => {
    const opened = Object.keys(g.unlocks ?? {}).filter((id) => !before.has(id)) as CapId[]
    if (!opened.length) return false
    sfx.unlock()
    let notes = get().notes
    for (const id of opened) {
      const cap = capOf(id)
      const where = cap.home ?? (cap.tabs?.[0] ? { tab: cap.tabs[0] } : undefined)
      notes = pushNote(notes, { kind: 'unlock', tone: 'new', key: `unlock:${id}`, text: `Now open: ${capName(id)}. ${cap.now}`, action: where ? { label: 'Show me', where } : undefined })
    }
    set({ notes, freshTabs: [...get().freshTabs, ...opened.flatMap((id) => (capOf(id).tabs ?? []) as Tab[])], lockCard: null })
    return true
  }
  /** A screen the company has not earned yet: the capability that would open it. */
  const lockOf = (g: GameState | null, tab: Tab, view?: string): CapId | undefined => {
    if (!g) return undefined
    const cap = capOfTab(tab)
    if (cap && !has(g, cap)) return cap
    const extra = pageOf(tab, view).cap
    return extra && !has(g, extra) ? extra : undefined
  }

  return {
    screen: 'menu',
    tab: 'city',
    game: null,
    rev: 0,
    speed: 0,
    inspect: null,
    railOpen: saved('sb-rail', '1') === '1',
    feedOn: savedFeed(),
    setFeed(tab, open) {
      const feedOn = { ...get().feedOn, [tab]: open }
      remember('sb-feed-by-screen', JSON.stringify(feedOn))
      set({ feedOn })
    },
    toast: null,
    notes: [],
    note: (add) => set({ notes: pushNote(get().notes, add) }),
    dismiss: (id) => set({ notes: dropNote(get().notes, id) }),
    views: {},
    setView(tab, view) {
      set({ views: { ...get().views, [tab]: view } })
      if (get().tab === tab) set({ lastPage: { ...get().lastPage, [destOfTab(tab, view).id]: pageOf(tab, view).id } })
    },
    lastPage: {},
    goDest(dest) {
      const g = get().game
      const d = destOf(dest)
      const open = d.pages.filter((p) => !lockOf(g, p.tab, p.view))
      const last = open.find((p) => p.id === get().lastPage[dest])
      const to = last ?? open[0]
      // nothing in it is open yet: say what the nearest part takes
      if (!to) {
        const caps = d.pages.map((p) => lockOf(g, p.tab, p.view)!).filter(Boolean)
        return set({ lockCard: { cap: (g && caps.find((c) => isNear(g, c))) ?? caps[0] } })
      }
      get().go(whereOf(to))
    },
    checkpoint: null,
    showing: null,
    person: null,
    // one drawer at a time: a person's card takes the place of a device's
    openPerson: (person) => set(person ? { person, inspect: null, lockCard: null } : { person }),
    yearEnd: null,
    closeYear: () => set({ yearEnd: null }),
    lockCard: null,
    freshTabs: [],
    hint: null,
    showLock: (cap, y) => set({ lockCard: cap ? { cap, y } : null }),
    go(where) {
      const to = resolve(where)
      const view = to.view ?? get().views[to.tab]
      // a page that is not open yet shows what it takes, and nothing moves
      const lock = lockOf(get().game, to.tab, view)
      if (lock) return set({ lockCard: { cap: lock } })
      set({ hint: { ...where, tab: to.tab, view: to.view }, lockCard: null, views: to.view ? { ...get().views, [to.tab]: to.view } : get().views })
      get().setTab(to.tab)
    },
    takeHint: () => set({ hint: null }),

    designing: false,
    kept: false,
    editorMode: saved('sb-editor', 'simple') === 'advanced' ? 'advanced' : 'simple',
    simple: { layout: 1, cams: 3, sensor: 0, front: 'notch', fingerprint: 'side', flash: true, logo: '' },
    draft: null,
    meta: { family: '', variant: '' },
    selectedPart: null,
    past: [],
    future: [],

    setScreen: (screen) => set({ screen }),
    setTab(tab) {
      // a screen the company has not earned yet shows what it takes instead
      const g = get().game
      const cap = capOfTab(tab)
      if (g && cap && !has(g, cap)) return set({ lockCard: { cap } })
      // going to another screen from the designer sets the design aside rather than losing it
      const keep = worthKeeping()
      const view = get().views[tab] ?? defaultView(tab)
      const page = pageOf(tab, view)
      set({
        tab,
        designing: false,
        kept: keep || get().kept,
        selectedPart: null,
        person: null,
        inspect: null,
        lockCard: null,
        freshTabs: get().freshTabs.filter((t) => t !== tab),
        lastPage: { ...get().lastPage, [destOfTab(tab, view).id]: page.id },
        // what was announced as new here has now been seen
        notes: dropNotes(get().notes, (n) => n.kind === 'unlock' && resolve(n.action?.where ?? { tab: '' }).tab === tab && !!n.action?.where),
      })
      if (keep) get().say('Your design is set aside. New device picks it up again.')
    },
    setSpeed: (speed) => set({ speed }),
    begin(cfg) {
      const game = newGame(cfg)
      // a copy from the first moment: a company can be spent into debt before a single day has passed
      rolling = copyOf(game)
      forgetViews()
      set({ game, screen: 'game', tab: 'city', speed: 0, rev: 0, checkpoint: null, showing: null, ...reset })
    },
    resume(state) {
      // the calendar and the market follow the year this company started in
      setEra(state.config.startYear)
      rolling = copyOf(state)
      forgetViews()
      // one home: a loaded game opens on the city, as a new one does
      set({ game: state, screen: 'game', tab: 'city', speed: 0, rev: 0, checkpoint: null, showing: null, ...reset })
    },
    quit() {
      rolling = null
      forgetViews()
      set({ game: null, screen: 'menu', speed: 0, checkpoint: null, showing: null, ...reset })
    },
    rewind() {
      const cp = get().checkpoint
      if (!cp) return
      const game = migrate(JSON.parse(cp.json))
      rolling = copyOf(game)
      forgetViews()
      set({ game, tab: 'city', speed: 0, rev: get().rev + 1, showing: null, ...reset })
    },
    watch: (showing) => set({ showing, speed: showing ? 0 : get().speed }),

    advance(days) {
      const g = get().game
      if (!g || g.gameOver || days <= 0) return
      const lastNews = g.news[0]?.id ?? 0
      const month = Math.floor(g.day / DAYS_PER_MONTH)
      const startDay = g.day
      const year = Math.floor(g.day / (DAYS_PER_MONTH * 12))
      // while there is money in the bank, keep a recent copy of the game: every
      // couple of days when cash is running low, less often when it is not
      const solvent = g.cash >= 0
      if (solvent && !g.config.unlimitedMoney) {
        const burn = Math.max(1, monthCosts(g.reports[g.reports.length - 1] ?? g.cur))
        const every = g.cash < burn * 3 ? 2 : 12
        if (!rolling || g.day - rolling.day >= every || g.day < rolling.day) rolling = { day: g.day, json: JSON.stringify(g) }
      }
      const shown = new Set(g.events.filter((e) => e.done).map((e) => e.id))
      const open = openBefore(g)
      tick(g, days)
      let checkpoint = get().checkpoint
      if (solvent && g.cash < 0 && rolling) {
        // the company just went into debt: this is the copy to come back to
        checkpoint = rolling
        void saveSnapshot(BEFORE_DEBT, JSON.parse(rolling.json)).catch(() => {})
      }
      const fresh = g.news.filter((n) => n.id > lastNews && n.kind !== 'rival')
      if (announce(g, open)) void 0
      else if (fresh.some((n) => n.kind === 'goal')) sfx.goal()
      else if (fresh.some((n) => n.kind === 'alert')) sfx.alert()
      else if (fresh.some((n) => n.kind === 'review')) sfx.launch()
      else if (fresh.some((n) => n.kind === 'research')) sfx.research()
      else if (fresh.some((n) => n.kind === 'event')) sfx.confirm()
      else if (fresh.some((n) => n.kind === 'staff')) sfx.hire()
      else if (fresh.length) sfx.notify()
      const prefs = useSettings.getState().settings
      const big = fresh.some((n) => BIG_NEWS.test(n.text))
      if (prefs.autosave && (Math.floor(g.day / DAYS_PER_MONTH) !== month || big)) autosave(g)
      const halt = prefs.pauseOnAlert && fresh.some((n) => n.kind === 'alert')
      // what needs the player is said once in the strip; the same thing said again is counted on the line already there
      const alerts = fresh.filter((n) => n.kind === 'alert')
      if (alerts.length) {
        let notes = get().notes
        for (const n of alerts.reverse()) notes = pushNote(notes, { kind: 'alert', tone: 'warn', text: n.text, action: n.productId ? { label: 'Open', productId: n.productId } : undefined })
        set({ notes })
      }
      // a keynote that just happened plays out on screen
      const keynote = g.events.find((e) => e.done && e.type === 'keynote' && !shown.has(e.id) && e.beats)
      // the calendar turned: stop and look back on the year
      const turned = Math.floor(g.day / (DAYS_PER_MONTH * 12)) !== year && g.reports.length >= 6
      // something new needs a decision: stop once, when it arrives. It may then wait (a month, after which it settles
      // itself), and time can go on while it does: stopping on every tick would leave the player unable to let it wait
      const decision = g.incidents.some((i) => !i.done && i.day > startDay)
      set({ rev: get().rev + 1, speed: g.gameOver || keynote || halt || turned || decision ? 0 : get().speed, checkpoint, showing: keynote ? keynote.id : get().showing, yearEnd: turned ? startYear() + year : get().yearEnd })
    },

    act(fn) {
      const g = get().game!
      const lastNews = g.news[0]?.id ?? 0
      const open = openBefore(g)
      const solvent = g.cash >= 0
      const out = fn(g)
      // hiring, building and the like can earn a capability on the spot
      stepProgress(g)
      announce(g, open)
      if (useSettings.getState().settings.autosave && g.news.some((n) => n.id > lastNews && BIG_NEWS.test(n.text))) autosave(g)
      // spent into debt in one go (a plot, a factory, a takeover): the copy to come back to is the last one taken with money in the bank
      let checkpoint = get().checkpoint
      if (solvent && g.cash < 0 && !g.config.unlimitedMoney && rolling) {
        checkpoint = rolling
        void saveSnapshot(BEFORE_DEBT, JSON.parse(rolling.json)).catch(() => {})
      }
      set({ rev: get().rev + 1, checkpoint })
      return out
    },

    say(text, tone = 'ok') {
      set({ toast: { text, tone }, notes: pushNote(get().notes, { kind: 'say', tone, text }) })
      if (tone === 'bad') sfx.error()
    },

    // one drawer at a time: a device's details take the place of a person's card
    focus: (inspect) => set(inspect ? { inspect, person: null, lockCard: null } : { inspect }),
    toggleRail() {
      remember('sb-rail', get().railOpen ? '0' : '1')
      set({ railOpen: !get().railOpen })
    },

    openDesigner(opts = {}) {
      const g = get().game
      if (!g) return
      const plain = !opts.type && !opts.from
      // already at the bench: asking for the designer again must not wipe the design on it
      if (plain && get().designing && get().draft) return
      // a design set aside earlier is picked up where it was left, undo history and all
      if (plain && get().kept && get().draft) {
        set({ designing: true, kept: false, selectedPart: null, speed: 0, inspect: null, person: null, lockCard: null })
        return get().say('Picked up the design you set aside.')
      }
      // a company starts on one kind of device and opens the others under Research
      const wanted = opts.from?.type ?? opts.type
      if (wanted && !hasType(g, wanted)) return get().say(`Your company does not make ${TYPES[wanted].plural.toLowerCase()} yet. Open that line under Research.`, 'bad')
      if (!wanted && g.types?.length && !g.types.includes('phone')) opts = { ...opts, type: g.types[0] }
      // the advanced editor comes with the design studio
      if (get().editorMode === 'advanced' && !has(g, 'studio')) set({ editorMode: 'simple' })
      const from = opts.from
      const own = g.products.filter((p) => p.companyId === 'player')
      let draft: DeviceDesign
      let meta: DraftMeta
      if (from && opts.variant && opts.variant !== 'next') {
        // a Pro / Lite / Max of an existing device, sharing its family
        draft = deriveVariant(from.design, opts.variant, g.levels, g.features)
        meta = { family: from.family, variant: opts.variant }
      } else if (from) {
        draft = JSON.parse(JSON.stringify(from.design))
        // the next generation: bump a trailing number if the name has one
        const m = /^(.*?)(\d+)$/.exec(from.family)
        meta = opts.variant === 'next' ? { family: freeFamily(g, m ? `${m[1]}${Number(m[2]) + 1}` : `${from.family} 2`, from.variant), variant: from.variant } : { family: freeFamily(g, `${from.family} copy`), variant: "" }
      } else {
        const type = opts.type ?? 'phone'
        draft = starterDesign(g, type)
        const base = player(g).name.split(' ')[0]
        const count = own.filter((p) => p.type === type && !p.variant).length + 1
        meta = { family: freeFamily(g, defaultName(base, type, count)), variant: '' }
      }
      lastEdit = 0
      set({ designing: true, kept: false, draft, meta, simple: readLayout(draft, g), selectedPart: null, speed: 0, past: [], future: [], inspect: null, person: null, lockCard: null })
    },
    closeDesigner(discard = false) {
      const keep = !discard && worthKeeping()
      set({ designing: false, selectedPart: null, kept: keep })
      if (keep) get().say('Your design is set aside. New device picks it up again.')
    },

    setType(type) {
      const g = get().game
      if (!g || get().draft?.type === type) return
      if (!hasType(g, type)) return get().say(`Your company does not make ${TYPES[type].plural.toLowerCase()} yet. Open that line under Research.`, 'bad')
      const draft = starterDesign(g, type)
      const base = player(g).name.split(' ')[0]
      const count = g.products.filter((p) => p.companyId === 'player' && p.type === type && !p.variant).length + 1
      set({ draft, simple: readLayout(draft, g), selectedPart: null, past: [], future: [], meta: { family: freeFamily(g, defaultName(base, type, count)), variant: '' } })
    },
    setMeta: (patch) => set({ meta: { ...get().meta, ...patch } }),

    setEditorMode(editorMode) {
      const g = get().game
      const lock = editorMode === 'advanced' && g ? locked(g, 'studio') : null
      if (lock) return get().say(lock, 'bad')
      remember('sb-editor', editorMode)
      set({ editorMode, selectedPart: null })
    },
    setSimple(patch) {
      const { draft: d, game: g } = get()
      if (!d || !g) return
      const simple = { ...get().simple, ...patch }
      edit({ ...d, parts: relayout(d, simple, g) }, { simple, selectedPart: null })
    },
    selectPart: (selectedPart) => set({ selectedPart }),

    setBody(patch) {
      const d = get().draft
      const g = get().game
      if (!d) return
      const body = { ...d.body, ...patch }
      // the simple editor owns the layout, so it follows the body as it changes shape
      if (get().editorMode === 'simple' && g) edit({ ...d, body, parts: relayout({ ...d, body }, get().simple, g) })
      else edit({ ...d, body, parts: d.parts.map((p) => clampPart(body, p, d.type)) })
    },
    setSpecs(patch) {
      const d = get().draft
      const g = get().game
      if (!d) return
      const next = { ...d, specs: { ...d.specs, ...patch } }
      // ports are parts on the body, so they follow the port list
      if (patch.io && g) next.parts = get().editorMode === 'simple' ? relayout(next, get().simple, g) : syncSockets(next, d.specs.io ?? [])
      edit(next)
    },
    setDraft(patch) {
      const d = get().draft
      if (d) edit({ ...d, ...patch })
    },
    addPart(kind, at) {
      const d = get().draft
      const g = get().game
      if (!d || !g) return
      const made = newPart(kind, d, kind === 'camera' ? g.levels.camera : 0)
      const p = at ? clampPart(d.body, { ...made, face: at.face, x: at.x, y: at.y }, d.type) : made
      edit({ ...d, parts: [...d.parts, p] }, { selectedPart: p.id })
    },
    patchPart(id, patch) {
      const d = get().draft
      if (!d) return
      edit({ ...d, parts: d.parts.map((p) => (p.id === id ? clampPart(d.body, { ...p, ...patch }, d.type) : p)) })
    },
    removePart(id) {
      const d = get().draft
      if (d) edit({ ...d, parts: d.parts.filter((p) => p.id !== id) }, { selectedPart: null })
    },
    duplicatePart(id) {
      const d = get().draft
      const src = d?.parts.find((p) => p.id === id)
      if (!d || !src) return
      const copy = clampPart(d.body, { ...src, id: nextPartId(d), x: src.x + (src.w + 2), y: src.y }, d.type)
      edit({ ...d, parts: [...d.parts, copy] }, { selectedPart: copy.id })
    },

    undo() {
      const { past, draft, future } = get()
      if (!past.length || !draft) return
      lastEdit = 0
      set({ draft: past[past.length - 1], past: past.slice(0, -1), future: [draft, ...future].slice(0, 60), selectedPart: null })
    },
    redo() {
      const { past, draft, future } = get()
      if (!future.length || !draft) return
      lastEdit = 0
      set({ draft: future[0], future: future.slice(1), past: [...past, draft], selectedPart: null })
    },
  }
})

/**
 * What a part of the company is called on screen. The progression rules name
 * a few of them as they were before the screens were regrouped; this is the
 * one name each has now.
 */
const CAP_NAMES: Partial<Record<CapId, string>> = { care: 'Owners', world: 'Regions', carePolicy: 'Warranty and support policy', execs: 'Executives' }
export const capName = (id: CapId) => CAP_NAMES[id] ?? capOf(id).name

/** The view a screen with several pages is showing, and a way to change it. */
export function useView<T extends string>(tab: Tab, fallback: T): [T, (v: T) => void] {
  const view = useStore((s) => s.views[tab]) as T | undefined
  return [view ?? (defaultView(tab) as T | undefined) ?? fallback, (v) => useStore.getState().setView(tab, v)]
}

/** The live game. Re-renders the caller whenever the simulation changes. */
export function useGame(): GameState {
  useStore((s) => s.rev)
  return useStore((s) => s.game)!
}
