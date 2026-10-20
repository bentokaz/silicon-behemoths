// In-game frame. A top bar (company, date, cash, speed), a rail of seven
// destinations and System, one row of tabs for the pages of the destination
// that is open, the screen itself, the news feed, and along the bottom the
// messenger strip. Over that, never more than one of each: a drawer (at the
// right, over the feed), a dialog, a lock card. Also runs the game loop.
import { useEffect, useRef, useState } from 'react'
import { type Mood, setMusicMood } from '../audio/music'
import { type Ambience, setAmbience, setAmbienceLevel, sfx } from '../audio/sfx'
import { fmtDate, player } from '../sim/game'
import { factoryLine, pendingUnits } from '../sim/ops'
import { type CapId, capOfTab, has, isNear, locked, vacantSeats } from '../sim/progress'
import { sealedRooms } from '../sim/sites'
import { staffEffects, unmanaged } from '../sim/staff'
import { type GameState, type NewsItem, SUPPLY_CATS, monthCosts } from '../sim/types'
import { DAYS_PER_SECOND, type Speed, type Tab, useGame, useStore } from '../store/game'
import { DEST_KEY, type Destination, type Page as NavPage, RAIL, defaultView, destOf, destOfKey, destOfTab, pageOf, tabsOf, whereOf } from '../store/nav'
import { AUTOSAVE, type SaveMeta, listSaves, loadGame, saveGame } from '../store/saves'
import { actionFor, keyName, keysFor, useSettings } from '../store/settings'
import { CityScreen } from './City'
import { FeedbackButton } from './Feedback'
import { OfficeScreen } from './Campus'
import { PersonCard, Staff } from './Staff'
import { Designer } from './Designer'
import { CareScreen } from './Owners'
import { SharesScreen } from './Shares'
import { MarketingScreen } from './Marketing'
import { StoresScreen } from './Stores'
import { VenueScreen } from './Venue'
import { Decision, YearEnd } from './Guide'
import { LaunchShow } from './Show'
import { ProductDrawer } from './Inspector'
import { LabsScreen } from './Labs'
import { GoalsHub } from './GoalsHub'
import { LockCard } from './Progress'
import { FactoryScreen } from './Operations'
import { ResearchScreen } from './Lines'
import { GuideCard, Messenger, useGuideOpen } from './Messenger'
import { PAGE_INTRO } from './pageIntro'
import { Market, Products, Rivals } from './Devices'
import { Finance } from './Finance'
import { Dashboard } from './Overview'
import { System } from './System'
import { Icon, type IconName } from './icons'
import { Btn, IconBtn, Tabs, modalOpen, money, moneyDelta, num, pressable, useLayer } from './ui'

/** The mood of the music on each screen; anything not named is calm. */
const MOOD_OF: Partial<Record<Tab, Mood>> = { office: 'focus', staff: 'focus', research: 'focus', labs: 'focus', products: 'focus', factory: 'drive', market: 'drive', rivals: 'drive', stores: 'bright', marketing: 'bright', city: 'bright', world: 'bright', care: 'bright', venue: 'show' }

const SPEEDS: { speed: Speed; label: string; icon: IconName }[] = [
  { speed: 0, label: 'Pause', icon: 'pause' },
  { speed: 1, label: 'Normal speed', icon: 'play' },
  { speed: 2, label: 'Fast', icon: 'fast' },
  { speed: 4, label: 'Fastest', icon: 'faster' },
]
const NEWS_WORD: Record<NewsItem['kind'], string> = { launch: 'Launch', review: 'Review', research: 'Research', rival: 'Rival', finance: 'Finance', alert: 'Alert', staff: 'People', event: 'Event', goal: 'Goal', unlock: 'New' }
const NEWS_TONE: Record<NewsItem['kind'], string> = { launch: 'text-accent', review: 'text-pos', research: 'text-dim', rival: 'text-faint', finance: 'text-dim', alert: 'text-warn', staff: 'text-dim', event: 'text-pos', goal: 'text-pos', unlock: 'text-accent' }
/** Screens that are a full 3D view: the feed is never beside them. */
const WIDE: Tab[] = ['city', 'world', 'office', 'factory', 'stores', 'venue']
/** Screens with room to spare, where the feed is open unless the player closes it. Everywhere else it is closed unless they open it. */
const FEED_BY_DEFAULT: Tab[] = ['dashboard', 'goals']

/** A count shown beside a place when something there needs the player. */
function badge(g: GameState, tab: Tab): number {
  if (tab === 'products') return g.products.filter((p) => p.companyId === 'player' && ((p.status === 'sale' && p.stock <= 0 && !pendingUnits(g, p.id)) || p.recall?.state === 'open')).length
  if (tab === 'staff') return g.staff.filter((e) => e.ask).length + (unmanaged(g) ? 1 : 0) + vacantSeats(g).length
  if (tab === 'office') return staffEffects(g).idle + sealedRooms(g.office).length
  if (tab === 'care') return g.products.filter((p) => p.companyId === 'player' && p.recall?.state === 'open').length
  if (tab === 'shares') return g.stock.lowDays > 0 ? 1 : 0
  // (a component shortage is the company's business, not the factory's: it shows under Finance)
  if (tab === 'factory') return g.orders.some((o) => o.mode === 'factory') && !factoryLine(g)?.running ? 1 : 0
  if (tab === 'finance') return SUPPLY_CATS.filter((c) => g.supply.shockDays[c] > 0 && !g.supply.locks[c]).length
  return 0
}
/** The same count for one page: a screen with several pages shares its count out between them. */
function pageBadge(g: GameState, p: NavPage): number {
  if (p.tab === 'staff') return p.view === 'team' ? g.staff.filter((e) => e.ask).length + vacantSeats(g).length : p.view === 'teams' ? (unmanaged(g) ? 1 : 0) : 0
  // any other screen's count goes on its first page
  return p.view && p.view !== defaultView(p.tab) ? 0 : badge(g, p.tab)
}
/** The capability a page is waiting on, if it is not open yet. */
function pageLock(g: GameState, p: NavPage): CapId | undefined {
  const cap = capOfTab(p.tab)
  if (cap && !has(g, cap)) return cap
  return p.cap && !has(g, p.cap) ? p.cap : undefined
}

function useGameLoop() {
  useEffect(() => {
    let last = performance.now()
    let acc = 0
    const id = window.setInterval(() => {
      const now = performance.now()
      const dt = Math.min(0.5, (now - last) / 1000)
      last = now
      const st = useStore.getState()
      if (!st.speed || st.designing || !st.game || st.game.gameOver) return
      acc += dt * DAYS_PER_SECOND[st.speed]
      const days = Math.floor(acc)
      if (days > 0) {
        acc -= days
        st.advance(days)
      }
    }, 100)
    return () => window.clearInterval(id)
  }, [])
}

/** Save to the Quick slot and say how it went. */
function quickSave() {
  const st = useStore.getState()
  if (!st.game) return
  saveGame('quick', st.game).then(
    () => (sfx.confirm(), st.say('Saved to the Quick slot.')),
    () => st.say('Saving failed: the browser would not store it. Use Export to file under Save and settings to keep a copy.', 'bad'),
  )
}

function useHotkeys() {
  const lastSpeed = useRef<Speed>(1)
  useEffect(() => {
    // a key that pressed a game hotkey must not also press the button that happens to have focus when it comes up
    let eaten = ''
    const up = (e: KeyboardEvent) => {
      if (e.code === eaten) (e.preventDefault(), (eaten = ''))
    }
    // How focus got where it is: by Tab, or by a click. (The browser's own :focus-visible cannot say:
    // it starts matching a clicked button the moment any key goes down.)
    let tabbed = false
    const pointed = () => void (tabbed = false)
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab') tabbed = true
      const el = e.target as HTMLElement
      const tag = el.tagName
      // function keys are never typing, and left to the browser they reload or search the page
      const fn = /^F\d+$/.test(e.code)
      const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable
      if (typing && !fn) return
      const st = useStore.getState()
      if (!st.game) return
      const action = actionFor(e, ['Game', 'Screens', 'Pages'])
      if (!action) return
      if (fn) e.preventDefault()
      // saving is always allowed while there is a game to save: in a field, in the designer, behind a dialog, during a keynote
      if (action === 'save' && !st.game.gameOver && (fn || !typing)) {
        e.preventDefault()
        if (!e.repeat) quickSave()
        return
      }
      // nothing else runs while typing, behind a dialog that is waiting for an answer, or once the game is over
      if (typing || st.designing || st.showing || st.game.gameOver || st.yearEnd !== null || modalOpen()) return
      // someone moving through the controls with Tab presses them with Space and Enter: that press is theirs
      if ((e.code === 'Space' || e.code === 'Enter') && tabbed && (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || el.getAttribute('role') === 'button' || el.tabIndex === 0)) return
      e.preventDefault()
      if (e.repeat) return
      eaten = e.code
      if (action === 'pause') {
        if (st.speed) (lastSpeed.current = st.speed), st.setSpeed(0)
        else st.setSpeed(lastSpeed.current)
      } else if (action === 'speed1') st.setSpeed(1)
      else if (action === 'speed2') st.setSpeed(2)
      else if (action === 'speed3') st.setSpeed(4)
      else if (action === 'save') quickSave()
      else if (action === 'newDevice') st.openDesigner()
      else if (action === 'feed') toggleFeedHere()
      else if (action.startsWith('tab:')) {
        // eight of these keys are the destinations of the rail; the rest go straight to one page.
        // A place that is not open yet shows what it takes, and goes nowhere.
        const to = action.slice(4) as Tab
        const dest = destOfKey(to)
        if (dest) st.goDest(dest)
        else st.go({ tab: to })
      }
    }
    window.addEventListener('keydown', key)
    window.addEventListener('keyup', up)
    window.addEventListener('pointerdown', pointed, true)
    return () => (window.removeEventListener('keydown', key), window.removeEventListener('keyup', up), window.removeEventListener('pointerdown', pointed, true))
  }, [])
}

// ---------------------------------------------------------------- the feed

/** Whether the feed is open beside a screen: the player's own choice for that screen if they have made one. */
const feedShown = (choice: Partial<Record<Tab, boolean>>, tab: Tab) => !WIDE.includes(tab) && (choice[tab] ?? (FEED_BY_DEFAULT.includes(tab) && roomForFeed()))
/** The feed opens by itself only in a window wide enough that the page keeps its room beside it. */
const roomForFeed = () => typeof window === 'undefined' || window.innerWidth >= 1600
function toggleFeedHere() {
  const st = useStore.getState()
  if (WIDE.includes(st.tab) || st.designing) return st.say('The news feed is not shown beside a 3D view. The line at the bottom has the latest.')
  st.setFeed(st.tab, !feedShown(st.feedOn, st.tab))
}

export interface FeedRow {
  item: NewsItem
  count: number
}
/** The news with repeats folded together: the same line said ten times is one row with a count, dated by the latest. */
export function foldNews(news: readonly NewsItem[], rivals: boolean, limit = 80): FeedRow[] {
  const rows: FeedRow[] = []
  const seen = new Map<string, FeedRow>()
  for (const item of news) {
    if (!rivals && item.kind === 'rival') continue
    const key = `${item.kind}|${item.text}`
    const row = seen.get(key)
    if (row) row.count++
    else if (rows.length < limit) {
      const fresh = { item, count: 1 }
      seen.set(key, fresh)
      rows.push(fresh)
    }
  }
  return rows
}

function Feed() {
  const g = useGame()
  const tab = useStore((s) => s.tab)
  const { focus, setFeed } = useStore.getState()
  const [rivals, setRivals] = useState(false)
  const rows = foldNews(g.news, rivals)
  return (
    <aside data-chrome="feed" aria-label="News feed" className="flex w-[272px] shrink-0 flex-col border-l border-line bg-panel">
      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line pl-4 pr-2">
        <span className="t-title">News</span>
        <span className="flex items-center gap-1">
          <Btn small tone="ghost" active={rivals} onClick={() => setRivals(!rivals)} title="Show what rival companies launch as well">
            Rivals
          </Btn>
          <IconBtn icon="close" tone="ghost" title="Hide the news feed" onClick={() => setFeed(tab, false)} />
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 && <div className="px-4 py-5 text-xs text-dim">Nothing has happened yet.</div>}
        {rows.map(({ item: n, count }) => (
          <div key={n.id} {...(n.productId ? { role: 'button', ...pressable(() => focus(n.productId!)) } : {})} className={`border-b border-line px-4 py-2.5 ${n.productId ? 'cursor-pointer hover:bg-hover' : ''}`}>
            <div className="flex justify-between gap-2 text-2xs">
              <span className={NEWS_TONE[n.kind]}>{NEWS_WORD[n.kind]}</span>
              <span className="num text-faint">
                {count > 1 && `x${count}  `}
                {fmtDate(n.day)}
              </span>
            </div>
            <div className={`mt-0.5 text-xs leading-snug ${n.kind === 'rival' ? 'text-dim' : 'text-fg'}`}>{n.text}</div>
          </div>
        ))}
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------- top bar

/**
 * What the last thing the player did cost or brought in, shown for a moment
 * beside the cash figure: placing a desk, hiring, selling a stake. Money that
 * moves because time passed is not shown; the figure itself says that.
 */
function CashDelta() {
  const g = useGame()
  const prev = useRef({ game: g, cash: g.cash, day: g.day })
  const [delta, setDelta] = useState<{ amount: number; n: number } | null>(null)
  useEffect(() => {
    const was = prev.current
    prev.current = { game: g, cash: g.cash, day: g.day }
    // another game was loaded, or the clock moved: not something the player just paid for
    if (was.game !== g || was.day !== g.day) return
    const amount = g.cash - was.cash
    if (Math.abs(amount) >= 1) setDelta((d) => ({ amount, n: (d?.n ?? 0) + 1 }))
  })
  useEffect(() => {
    if (!delta) return
    const t = window.setTimeout(() => setDelta(null), 2200)
    return () => window.clearTimeout(t)
  }, [delta])
  if (!delta || g.config.unlimitedMoney) return <span className="w-14" />
  return (
    <span role="status" className={`num w-16 text-left text-2xs ${delta.amount < 0 ? 'text-neg' : 'text-pos'}`}>
      {moneyDelta(delta.amount)}
    </span>
  )
}

// ---------------------------------------------------------------- the end

const COSTS = ['salaries', 'production', 'marketing', 'rd', 'overhead', 'facilities', 'development', 'interest'] as const
const COST_WORDS: Record<(typeof COSTS)[number], string> = { salaries: 'salaries', production: 'production', marketing: 'marketing', rd: 'research', overhead: 'overheads', facilities: 'buildings', development: 'development', interest: 'interest on the debt' }

/** One line on what went wrong, from the last full month of accounts. */
export function whatWentWrong(g: GameState): string {
  if (g.overReason === 'ousted') return 'The board lost confidence after months of poor results. A run of profitable months, or holding more than half of the shares, would have kept the seat.'
  const r = g.reports[g.reports.length - 1]
  if (!r) return 'The company spent its starting cash before anything was on sale.'
  const biggest = COSTS.reduce<(typeof COSTS)[number]>((a, k) => (r[k] > r[a] ? k : a), 'salaries')
  return `In its last full month the company took in ${money(r.revenue + r.other)} and spent ${money(monthCosts(r))}, most of it on ${COST_WORDS[biggest]}. The debt was not cleared in time.`
}

/** The end of the game: bankrupt, or removed by the board. */
function GameOver() {
  const g = useGame()
  const checkpoint = useStore((s) => s.checkpoint)
  const { quit, rewind, resume, say } = useStore.getState()
  const box = useRef<HTMLDivElement>(null)
  useLayer(true, undefined, { modal: true, box })
  const [auto, setAuto] = useState<SaveMeta | null>(null)
  useEffect(() => {
    let live = true
    void listSaves().then(
      (all) => live && setAuto(all.find((s) => s.slot === AUTOSAVE) ?? null),
      () => {},
    )
    return () => void (live = false)
  }, [])
  const me = player(g)
  const title = g.overReason === 'ousted' ? 'Removed by the board' : 'Bankrupt'
  const loadAuto = () =>
    loadGame(AUTOSAVE).then(
      (state) => (state ? (resume(state), sfx.confirm()) : say('The autosave could not be read.', 'bad')),
      () => say('The autosave could not be read.', 'bad'),
    )
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-carbon/85 p-4">
      <div ref={box} role="alertdialog" aria-label={title} className="sb-rise w-[520px] max-w-full border border-neg bg-panel p-6 shadow-[0_24px_64px_rgb(0_0_0/0.6)] outline-none">
        <div className="flex items-center gap-2 text-xs font-semibold text-neg">
          <Icon name="alert" size={14} />
          {title}
        </div>
        <div className="t-page mt-2">{g.overReason === 'ousted' ? `The board of ${me.name} has replaced you.` : `${me.name} has run out of credit.`}</div>
        <div className="mt-3 text-sm leading-relaxed text-dim">{whatWentWrong(g)}</div>
        <div className="mt-2 text-sm text-dim">
          Lasted until <span className="num text-fg">{fmtDate(g.day)}</span> and sold <span className="num text-fg">{num(me.unitsTotal)}</span> devices for <span className="num text-fg">{money(me.revenueTotal)}</span>.
        </div>
        <div className="mt-6 flex flex-col gap-2">
          {checkpoint ? (
            <Btn tone="primary" large icon="load" autoFocus onClick={() => (rewind(), sfx.confirm())}>
              Go back to {fmtDate(checkpoint.day)}, before the debt
            </Btn>
          ) : auto ? (
            <Btn tone="primary" large icon="load" autoFocus onClick={loadAuto}>
              Load last autosave: {fmtDate(auto.day)}
            </Btn>
          ) : null}
          {checkpoint && auto && (
            <Btn icon="load" onClick={loadAuto}>
              Load last autosave: {fmtDate(auto.day)}
            </Btn>
          )}
          <Btn tone={checkpoint || auto ? 'ghost' : 'primary'} large={!checkpoint && !auto} onClick={quit}>
            Main menu
          </Btn>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the frame

export function Shell() {
  const g = useGame()
  const tab = useStore((s) => s.tab)
  const views = useStore((s) => s.views)
  const speed = useStore((s) => s.speed)
  const designing = useStore((s) => s.designing)
  const railOpen = useStore((s) => s.railOpen)
  const feedOn = useStore((s) => s.feedOn)
  const showing = useStore((s) => s.showing)
  const yearEnd = useStore((s) => s.yearEnd)
  const freshTabs = useStore((s) => s.freshTabs)
  const lockCard = useStore((s) => s.lockCard)
  const kept = useStore((s) => s.kept)
  const { setSpeed, toggleRail, openDesigner, showLock, go, goDest } = useStore.getState()
  useSettings((s) => s.binds)
  const [guideOpen] = useGuideOpen()
  // (the guide's card gives way to a drawer: it would lie over it)
  const drawerUp = useStore((s) => s.inspect !== null || s.person !== null)
  useGameLoop()
  useHotkeys()
  // each place has its own background sound
  const ambience = useSettings((s) => s.settings.ambience)
  useEffect(() => {
    setAmbienceLevel(ambience)
    const place: Ambience = designing || showing ? 'none' : tab === 'office' || tab === 'staff' ? 'office' : tab === 'factory' ? 'factory' : tab === 'stores' ? 'store' : tab === 'venue' ? 'venue' : tab === 'city' || tab === 'world' ? 'outdoors' : 'none'
    // (two pages of the same place, People and Build, share one bed: it plays on between them)
    setAmbience(place)
  }, [tab, designing, showing, ambience])
  // it stops when the game is left
  useEffect(() => () => setAmbience('none'), [])
  // and the music takes the mood of the screen (a keynote brings its own sound)
  useEffect(() => {
    const mood: Mood | 'none' = showing ? 'none' : designing ? 'focus' : MOOD_OF[tab] ?? 'calm'
    setMusicMood(mood)
  }, [tab, designing, showing])
  const me = player(g)
  const view = views[tab]
  const here = destOfTab(tab, view)
  const page = pageOf(tab, view)
  const showFeed = !designing && feedShown(feedOn, tab)
  const railW = railOpen ? 'w-[208px]' : 'w-[56px]'

  /** A page is in the row of tabs once it is open, or while it is the next thing to earn. */
  const pageShown = (p: NavPage) => {
    const lock = pageLock(g, p)
    return !lock || isNear(g, lock)
  }
  const keyOf = (d: Destination) => {
    const k = keysFor(`tab:${DEST_KEY[d.id]}`)[0]
    return k ? keyName(k) : ''
  }

  const railItem = (d: Destination) => {
    const on = !designing && here.id === d.id
    const locks = d.pages.map((p) => pageLock(g, p))
    const shut = locks.every(Boolean)
    const label = d.id === 'system' ? 'Save / settings' : d.label
    const base = `relative flex h-10 w-full items-center justify-between border-l-2 text-left ${railOpen ? 'pl-4 pr-3' : 'justify-center px-0'}`
    const name = (
      <span className="flex min-w-0 items-center gap-3">
        <Icon name={d.icon as IconName} size={railOpen ? 17 : 19} />
        {railOpen && <span className="truncate text-sm font-medium">{label}</span>}
      </span>
    )
    if (shut) {
      const cap = locks.find((c) => c && isNear(g, c)) ?? locks[0]!
      const open = lockCard?.cap === cap
      return (
        <button key={d.id} onClick={(e) => (open ? showLock(null) : showLock(cap, e.currentTarget.getBoundingClientRect().top))} title={locked(g, cap) ?? undefined} aria-label={`${d.label}, locked`} className={`${base} ${open ? 'border-l-line2 bg-hover text-dim' : 'border-l-transparent text-faint hover:bg-hover hover:text-dim'}`}>
          {name}
          <Icon name="lock" size={railOpen ? 12 : 9} className={railOpen ? 'text-mute' : 'absolute right-[7px] top-[7px]'} />
        </button>
      )
    }
    const n = tabsOf(d).reduce((sum, t) => sum + badge(g, t), 0)
    const isNew = tabsOf(d).some((t) => freshTabs.includes(t))
    const k = keyOf(d)
    return (
      <button
        key={d.id}
        onClick={() => goDest(d.id)}
        title={railOpen ? (d.id === 'system' ? 'Saves, company, settings and keys' : k ? `${d.label} (${k})` : undefined) : `${d.label}${k ? ` (${k})` : ''}`}
        aria-label={n > 0 ? `${d.label}, ${n} need attention` : isNew ? `${d.label}, new` : d.label}
        aria-current={on ? 'page' : undefined}
        className={`${base} ${on ? 'border-l-accent bg-accent/10 text-fg [&_svg]:text-accent' : designing ? 'border-l-transparent text-faint hover:bg-hover hover:text-fg' : 'border-l-transparent text-dim hover:bg-hover hover:text-fg'}`}
      >
        {name}
        {n > 0 ? <span className={`num min-w-5 bg-warn/15 px-1.5 text-center text-2xs font-semibold leading-[18px] text-warn ${railOpen ? '' : 'absolute right-1 top-0.5'}`}>{n}</span> : isNew ? <span className={`bg-accent/15 px-1.5 text-2xs font-semibold leading-[18px] text-accent ${railOpen ? '' : 'absolute right-1 top-0.5'}`}>{railOpen ? 'New' : '+'}</span> : null}
      </button>
    )
  }

  const pages = here.pages.filter(pageShown)
  // one dialog at a time, in this order; the others wait their turn behind it
  const dialog = g.gameOver ? 'over' : showing ? 'show' : yearEnd !== null ? 'year' : g.incidents.some((i) => !i.done) && !designing ? 'decision' : null

  return (
    <div className="flex h-full flex-col">
      <header data-chrome="top" className="flex h-12 shrink-0 items-stretch border-b border-line bg-panel">
        <div className={`flex ${railW} shrink-0 items-center border-r border-line ${railOpen ? 'px-4' : 'justify-center'}`}>
          <span className="font-display truncate text-sm font-semibold tracking-[0.08em] text-fg">{railOpen ? <>SILICON<span className="text-accent">/</span>BEHEMOTHS</> : <>S<span className="text-accent">/</span>B</>}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2.5 px-4">
          {me.logo ? <img src={me.logo} alt="" className="h-7 w-7 object-contain" /> : <span className="h-2.5 w-2.5 shrink-0" style={{ background: me.color }} />}
          <span className="truncate text-sm font-semibold text-fg">{me.name}</span>
        </div>
        <div className="my-2.5 w-px shrink-0 bg-line" />
        <div className="flex items-center gap-2 px-4" title="Today's date in the game">
          <Icon name="calendar" size={15} className="text-faint" />
          <span className="num whitespace-nowrap text-sm font-semibold text-fg">{fmtDate(g.day)}</span>
        </div>
        <button className="flex items-center gap-2 px-4 hover:bg-hover" onClick={() => go({ tab: has(g, 'finance') ? 'finance' : 'dashboard' })} title="Cash in the bank. Click for where it comes from and where it goes.">
          <Icon name="cash" size={15} className="text-faint" />
          <span className={`num text-base font-semibold ${g.cash < 0 && !g.config.unlimitedMoney ? 'text-neg' : 'text-accent'}`}>{g.config.unlimitedMoney ? 'Unlimited' : money(g.cash)}</span>
          <CashDelta />
        </button>
        <div className="flex-1" />
        <div className="flex items-center gap-3 px-3" title="Pause and speed keys can be changed under Save and settings, Keys.">
          <span className="hidden items-center gap-2 text-xs text-dim md:flex">
            <span aria-hidden className={`h-2 w-2 ${designing || !speed ? 'bg-warn' : 'bg-pos'}`} />
            {designing ? 'Paused in the designer' : speed ? 'Running' : 'Paused'}
          </span>
          <div role="group" aria-label="Game speed" className="flex border border-line2">
            {SPEEDS.map((s) => (
              <button key={s.speed} type="button" title={s.label} aria-label={s.label} aria-pressed={!designing && speed === s.speed} disabled={designing} onClick={() => setSpeed(s.speed)} className={`flex h-8 w-9 items-center justify-center border-l border-line first:border-l-0 disabled:cursor-not-allowed disabled:text-faint ${!designing && speed === s.speed ? 'bg-accent text-carbon' : 'text-dim enabled:hover:bg-hover enabled:hover:text-fg'}`}>
                <Icon name={s.icon} size={15} />
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 border-l border-line px-3">
          <FeedbackButton small />
          <IconBtn icon="save" title={`Quick save${keysFor('save')[0] ? ` (${keyName(keysFor('save')[0])})` : ''}`} onClick={quickSave} />
          <IconBtn icon="feed" title={`Show or hide the news feed${keysFor('feed')[0] ? ` (${keyName(keysFor('feed')[0])})` : ''}`} active={showFeed} onClick={toggleFeedHere} />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav data-chrome="nav" aria-label="Screens" className={`flex ${railW} shrink-0 flex-col border-r border-line bg-panel`}>
          <div className="p-3">
            <button
              onClick={() => openDesigner()}
              data-coach-target="new-device"
              title={designing ? 'The designer is open' : kept ? 'Go back to the design you set aside' : `Design a new device${keysFor('newDevice')[0] ? ` (${keyName(keysFor('newDevice')[0])})` : ''}`}
              aria-label={designing ? 'Designing' : kept ? 'Resume design' : 'New device'}
              className={`flex h-10 w-full items-center gap-2 border text-left text-sm font-semibold ${railOpen ? 'px-3' : 'justify-center'} ${designing ? 'border-accent bg-accent text-carbon' : 'border-accent bg-accent/10 text-accent hover:bg-accent hover:text-carbon'}`}
            >
              <Icon name={kept && !designing ? 'design' : 'plus'} size={17} />
              {railOpen && (designing ? 'Designing' : kept ? 'Resume design' : 'New device')}
            </button>
          </div>
          <div className="min-h-0 flex-1 py-1">{RAIL.map(railItem)}</div>
          <div className="border-t border-line py-2">
            {railItem(destOf('system'))}
            <button onClick={toggleRail} className={`flex h-8 w-full items-center text-xs text-faint hover:text-fg ${railOpen ? 'px-4' : 'justify-center'}`} title={railOpen ? 'Collapse the menu' : 'Expand the menu'} aria-label={railOpen ? 'Collapse the menu' : 'Expand the menu'} aria-expanded={railOpen}>
              <Icon name={railOpen ? 'collapse' : 'expand'} size={14} />
              {railOpen && <span className="ml-3">Collapse</span>}
            </button>
          </div>
        </nav>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {!designing && (pages.length > 1 || !WIDE.includes(tab)) && (
                <div className="flex h-11 shrink-0 items-stretch border-b border-line bg-panel">
                  <h1 className="t-section flex shrink-0 items-center pl-6 pr-4">{here.label}</h1>
                  {pages.length > 1 && <span aria-hidden className="my-3 w-px shrink-0 bg-line" />}
                  {pages.length > 1 && (
                <Tabs
                  className="min-w-0 flex-1 !border-b-0 pl-1"
                  value={page.id}
                  options={pages.map((p) => {
                    const lock = pageLock(g, p)
                    const n = lock ? 0 : pageBadge(g, p)
                    return { value: p.id, label: p.label, locked: lock ? locked(g, lock) : null, badge: n > 0 ? n : undefined, alert: true, fresh: !lock && freshTabs.includes(p.tab) && p.id !== page.id }
                  })}
                  onChange={(id) => go(whereOf(here.pages.find((p) => p.id === id)!))}
                  onLocked={(id) => showLock(pageLock(g, here.pages.find((p) => p.id === id)!) ?? null)}
                />
                  )}
                </div>
              )}
              {!designing && !WIDE.includes(tab) && PAGE_INTRO[page.id] && (
                <p data-page-intro className="w-full shrink-0 px-6 pt-4 text-sm text-dim">
                  {PAGE_INTRO[page.id]}
                </p>
              )}
              <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-carbon">
                {designing ? (
                  <Designer />
                ) : (
                  <>
                    {/* the regions are a layer of the city: one view for both ids, never rebuilt between them */}
                    {(tab === 'city' || tab === 'world') && <CityScreen />}
                    {tab === 'dashboard' && <Dashboard />}
                    {tab === 'finance' && <Finance />}
                    {tab === 'shares' && <SharesScreen />}
                    {tab === 'goals' && <GoalsHub />}
                    {tab === 'products' && <Products />}
                    {tab === 'market' && <Market />}
                    {tab === 'rivals' && <Rivals />}
                    {tab === 'research' && <ResearchScreen />}
                    {tab === 'labs' && <LabsScreen />}
                    {tab === 'office' && <OfficeScreen />}
                    {tab === 'staff' && <Staff />}
                    {tab === 'factory' && <FactoryScreen />}
                    {tab === 'stores' && <StoresScreen />}
                    {tab === 'venue' && <VenueScreen />}
                    {tab === 'marketing' && <MarketingScreen />}
                    {tab === 'care' && <CareScreen />}
                    {tab === 'system' && <System />}
                  </>
                )}
              </main>
            </div>
            {showFeed && <Feed />}
            {/* the one drawer: at the right-hand edge, over the feed, never over the strip below */}
            <div id="sb-drawer" className="pointer-events-none absolute inset-0 z-[35]" />
            {!designing && !showing && !g.gameOver && guideOpen && !drawerUp && <GuideCard />}
            {!designing && <ProductDrawer />}
            {!designing && <PersonCard />}
          </div>
          <Messenger />
        </div>
      </div>

      {!dialog && <LockCard />}
      {dialog === 'show' && <LaunchShow eventId={showing!} />}
      {dialog === 'year' && <YearEnd />}
      {dialog === 'decision' && <Decision />}
      {dialog === 'over' && <GameOver />}
    </div>
  )
}
