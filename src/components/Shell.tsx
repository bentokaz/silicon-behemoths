// In-game frame: top bar with the clock and speed controls, a grouped
// navigation rail that can collapse, the active screen, the news feed and the
// slide-over product inspector. Also runs the game loop.
import { useEffect, useRef, useState } from 'react'
import { type Ambience, setAmbience, setAmbienceLevel, sfx } from '../audio/sfx'
import { fmtDate, player } from '../sim/game'
import { factoryLine, pendingUnits } from '../sim/ops'
import { capOfTab, has, locked, lockedCaps, nearTabs, needText, vacantSeats } from '../sim/progress'
import { sealedRooms } from '../sim/sites'
import { staffEffects, unmanaged } from '../sim/staff'
import { stageOf } from '../sim/goals'
import { type GameState, type NewsItem, SUPPLY_CATS } from '../sim/types'
import { DAYS_PER_SECOND, type Speed, type Tab, useGame, useStore } from '../store/game'
import { saveGame } from '../store/saves'
import { actionFor, keyName, keysFor, useSettings } from '../store/settings'
import { CityScreen } from './City'
import { FeedbackButton } from './Feedback'
import { OfficeScreen, PersonCard, Staff } from './Company'
import { Designer } from './Designer'
import { CareScreen, SharesScreen, WorldScreen } from './Empire'
import { MarketingScreen, StoresScreen, VenueScreen } from './Growth'
import { Coach, Decision, YearEnd } from './Guide'
import { LaunchShow } from './Show'
import { ProductDrawer } from './Inspector'
import { LabsScreen } from './Labs'
import { GoalsHub } from './GoalsHub'
import { LockCard, UnlockBanner } from './Progress'
import { FactoryScreen } from './Operations'
import { ResearchScreen } from './Lines'
import { Dashboard, Finance, Market, Products, Rivals } from './Screens'
import { System } from './System'
import { Icon, type IconName, TAB_ICON } from './icons'
import { Btn, modalOpen, money, num, pressable, useLayer } from './ui'

interface NavItem {
  id: Tab
  label: string
  /** Three letters shown when the rail is collapsed. */
  code: string
  key?: string
}
const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Run',
    items: [
      { id: 'city', label: 'City', code: 'CTY' },
      { id: 'dashboard', label: 'Overview', code: 'OVR', key: 'F1' },
      { id: 'products', label: 'Devices', code: 'DEV', key: 'F2' },
      { id: 'research', label: 'Research', code: 'RES', key: 'F3' },
      { id: 'market', label: 'Market', code: 'MKT', key: 'F4' },
      { id: 'world', label: 'Regions', code: 'WLD' },
      { id: 'goals', label: 'Goals', code: 'GOL' },
    ],
  },
  {
    group: 'Build',
    items: [
      { id: 'factory', label: 'Factory', code: 'FAC', key: 'F5' },
      { id: 'stores', label: 'Stores', code: 'STO', key: 'F6' },
      { id: 'venue', label: 'Venue', code: 'VEN' },
      { id: 'marketing', label: 'Marketing', code: 'ADS', key: 'F7' },
      { id: 'care', label: 'After-sales', code: 'CAR' },
      { id: 'labs', label: 'Labs', code: 'LAB', key: 'F8' },
    ],
  },
  {
    group: 'Company',
    items: [
      { id: 'staff', label: 'Staff', code: 'STF', key: 'F9' },
      { id: 'office', label: 'Campus', code: 'HQ' },
      { id: 'finance', label: 'Finance', code: 'FIN' },
      { id: 'shares', label: 'Shares', code: 'SHR' },
      { id: 'rivals', label: 'Rivals', code: 'RIV' },
    ],
  },
]
const SPEEDS: { speed: Speed; label: string; icon: IconName }[] = [
  { speed: 0, label: 'Pause', icon: 'pause' },
  { speed: 1, label: 'Normal speed', icon: 'play' },
  { speed: 2, label: 'Fast', icon: 'fast' },
  { speed: 4, label: 'Fastest', icon: 'faster' },
]
const NEWS_TONE: Record<NewsItem['kind'], string> = { launch: 'text-accent', review: 'text-pos', research: 'text-accent', rival: 'text-faint', finance: 'text-dim', alert: 'text-neg', staff: 'text-dim', event: 'text-pos', goal: 'text-warn', unlock: 'text-accent' }
/** Screens that are a full 3D view; the feed stays out of their way. */
const WIDE: Tab[] = ['city', 'office', 'factory', 'stores', 'venue']

/** A count shown beside a nav item when something there needs attention. */
function badge(g: GameState, tab: Tab): number {
  if (tab === 'products') return g.products.filter((p) => p.companyId === 'player' && ((p.status === 'sale' && p.stock <= 0 && !pendingUnits(g, p.id)) || p.recall?.state === 'open')).length
  if (tab === 'staff') return g.staff.filter((e) => e.ask).length + (unmanaged(g) ? 1 : 0) + vacantSeats(g).length
  if (tab === 'office') return staffEffects(g).idle + sealedRooms(g.office).length
  if (tab === 'care') return g.products.filter((p) => p.companyId === 'player' && p.recall?.state === 'open').length
  if (tab === 'shares') return g.stock.lowDays > 0 ? 1 : 0
  if (tab === 'factory') return SUPPLY_CATS.filter((c) => g.supply.shockDays[c] > 0).length + (g.orders.some((o) => o.mode === 'factory') && !factoryLine(g)?.running ? 1 : 0)
  return 0
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
    () => st.say('Saving failed: the browser would not store it. Use Export to file under System to keep a copy.', 'bad'),
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
      const action = actionFor(e, ['Game', 'Screens'])
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
      else if (action === 'feed') st.toggleFeed()
      else if (action.startsWith('tab:')) {
        // a key for a screen that is not open yet says why, and goes nowhere
        const to = action.slice(4) as Tab
        const cap = capOfTab(to)
        const lock = cap ? locked(st.game, cap) : null
        if (lock) st.say(lock, 'bad')
        else st.setTab(to)
      }
    }
    window.addEventListener('keydown', key)
    window.addEventListener('keyup', up)
    window.addEventListener('pointerdown', pointed, true)
    return () => (window.removeEventListener('keydown', key), window.removeEventListener('keyup', up), window.removeEventListener('pointerdown', pointed, true))
  }, [])
}

/**
 * What the last thing the player did cost or brought in, shown for a moment
 * under the cash figure: placing a desk, hiring, selling a stake. Money that
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
    const t = window.setTimeout(() => setDelta(null), 1800)
    return () => window.clearTimeout(t)
  }, [delta])
  if (!delta || g.config.unlimitedMoney) return null
  return (
    <span role="status" className={`num pointer-events-none absolute bottom-0 right-3 text-[9px] leading-[11px] ${delta.amount < 0 ? 'text-neg' : 'text-pos'}`}>
      {delta.amount < 0 ? '-' : '+'}
      {money(Math.abs(delta.amount), 1)}
    </span>
  )
}

/** The end of the game: bankrupt, or removed by the board. */
function GameOver() {
  const g = useGame()
  const checkpoint = useStore((s) => s.checkpoint)
  const { quit, rewind } = useStore.getState()
  const box = useRef<HTMLDivElement>(null)
  useLayer(true, undefined, { modal: true, box })
  const me = player(g)
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-carbon/85 p-4">
      <div ref={box} role="alertdialog" aria-label={g.overReason === 'ousted' ? 'Removed by the board' : 'Bankrupt'} className="w-[420px] max-w-full border border-neg bg-panel p-4 outline-none">
        <div className="label text-neg">{g.overReason === 'ousted' ? 'Removed by the board' : 'Bankrupt'}</div>
        <div className="mt-2 text-lg text-fg">{g.overReason === 'ousted' ? `The board of ${me.name} has replaced you.` : `${me.name} has run out of credit.`}</div>
        <div className="num mt-2 text-[11px] text-dim">
          Survived until {fmtDate(g.day)}. Sold {num(me.unitsTotal)} devices for {money(me.revenueTotal)}.
        </div>
        {checkpoint && (
          <div className="mt-3 border border-line p-2">
            <div className="text-[11px] leading-snug text-dim">
              The game kept a copy from <span className="num text-fg">{fmtDate(checkpoint.day)}</span>, just before the company went into debt. You can pick it up from there and try a different path.
            </div>
            <Btn tone="primary" className="mt-2 h-9 w-full" onClick={() => (rewind(), sfx.confirm())}>
              Go back to {fmtDate(checkpoint.day)}
            </Btn>
          </div>
        )}
        <div className="mt-3 flex gap-2">
          <Btn className="flex-1" onClick={quit}>
            Main menu
          </Btn>
        </div>
        <div className="mt-2 text-[10px] text-faint">{checkpoint ? 'The same copy is in the load menu as "Before the debt", along with the monthly autosave.' : 'Your saves and the monthly autosave are in the load menu.'}</div>
      </div>
    </div>
  )
}

export function Shell() {
  const g = useGame()
  const tab = useStore((s) => s.tab)
  const speed = useStore((s) => s.speed)
  const designing = useStore((s) => s.designing)
  const railOpen = useStore((s) => s.railOpen)
  const feedOpen = useStore((s) => s.feedOpen)
  const showing = useStore((s) => s.showing)
  const freshTabs = useStore((s) => s.freshTabs)
  const lockCard = useStore((s) => s.lockCard)
  const kept = useStore((s) => s.kept)
  const { setTab, setSpeed, focus, toggleRail, toggleFeed, openDesigner, showLock, go } = useStore.getState()
  const stage = stageOf(g)
  useSettings((s) => s.binds)
  const keyOf = (tab: Tab) => {
    const k = keysFor(`tab:${tab}`)[0]
    return k ? keyName(k) : ''
  }
  useGameLoop()
  useHotkeys()
  // each place has its own background sound
  const ambience = useSettings((s) => s.settings.ambience)
  useEffect(() => {
    setAmbienceLevel(ambience)
    const place: Ambience = designing || showing ? 'none' : tab === 'office' || tab === 'staff' ? 'office' : tab === 'factory' ? 'factory' : tab === 'stores' ? 'store' : tab === 'venue' ? 'venue' : (tab as string) === 'city' || tab === 'world' ? 'outdoors' : 'none'
    // (two screens of the same place, Staff and Campus, share one bed: it plays on between them)
    setAmbience(place)
  }, [tab, designing, showing, ambience])
  // it stops when the game is left
  useEffect(() => () => setAmbience('none'), [])
  const me = player(g)
  const showFeed = feedOpen && !designing && !WIDE.includes(tab)
  const railW = railOpen ? 'w-[172px]' : 'w-[52px]'

  // what the navigation shows: screens that are open, the locked ones that are next, and a count of the rest
  const near = nearTabs(g)
  const lockOf = (t: NavItem) => {
    const cap = capOfTab(t.id)
    return cap && !has(g, cap) ? cap : undefined
  }
  const shown = (t: NavItem) => {
    const cap = lockOf(t)
    return !cap || near.includes(cap)
  }
  const later = lockedCaps(g).length - near.length

  const navButton = (t: NavItem) => {
    const on = !designing && tab === t.id
    const cap = lockOf(t)
    if (cap) {
      const open = lockCard?.cap === cap
      return (
        <button
          key={t.id}
          onClick={(e) => (open ? showLock(null) : showLock(cap, e.currentTarget.getBoundingClientRect().top))}
          title={`${t.label} is not open yet: ${needText(g, cap)}`}
          aria-label={`${t.label}, locked`}
          className={`relative flex h-8 w-full items-center justify-between border-l-2 text-left transition-colors ${railOpen ? 'px-3' : 'justify-center px-0'} ${open ? 'border-l-line2 bg-hover text-dim' : 'border-l-transparent text-faint hover:bg-hover hover:text-dim'}`}
        >
          <span className="flex items-center gap-2">
            <Icon name={TAB_ICON[t.id] ?? 'system'} size={railOpen ? 14 : 17} />
            {railOpen && <span className="text-xs uppercase tracking-wider">{t.label}</span>}
          </span>
          <Icon name="lock" size={railOpen ? 10 : 8} className={railOpen ? '' : 'absolute right-[6px] top-[5px]'} />
        </button>
      )
    }
    const n = badge(g, t.id)
    const isNew = freshTabs.includes(t.id)
    return (
      <button key={t.id} onClick={() => setTab(t.id)} title={railOpen ? undefined : `${t.label}${keyOf(t.id) ? ` (${keyOf(t.id)})` : ''}`} aria-label={n > 0 ? `${t.label}, ${n} need attention` : isNew ? `${t.label}, new` : t.label} aria-current={on ? 'page' : undefined} className={`relative flex h-8 w-full items-center justify-between border-l-2 text-left transition-colors ${railOpen ? 'px-3' : 'justify-center px-0'} ${on ? 'border-l-accent bg-accent/10 text-accent' : 'border-l-transparent text-dim hover:bg-hover hover:text-fg'}`}>
        <span className="flex items-center gap-2">
          <Icon name={TAB_ICON[t.id] ?? 'system'} size={railOpen ? 14 : 17} />
          {railOpen && <span className="text-xs uppercase tracking-wider">{t.label}</span>}
        </span>
        {n > 0 ? <span className={`num text-[10px] text-warn ${railOpen ? '' : 'absolute right-1 top-0'}`}>{n}</span> : isNew ? <span className={`num text-[9px] tracking-wider text-accent ${railOpen ? '' : 'absolute right-[3px] top-0'}`}>{railOpen ? 'NEW' : '+'}</span> : railOpen && keyOf(t.id) && <span className="num text-[9px] text-faint">{keyOf(t.id)}</span>}
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header data-chrome="top" className="flex h-10 shrink-0 items-stretch border-b border-line bg-panel">
        <div className={`flex ${railW} shrink-0 items-center border-r border-line px-3`}>
          <span className="truncate text-[11px] font-semibold tracking-[0.2em] text-fg">{railOpen ? <>SILICON<span className="text-accent">/</span>BEHEMOTHS</> : <>S<span className="text-accent">/</span>B</>}</span>
        </div>
        <div className="flex items-center gap-2 border-r border-line px-3">
          {me.logo ? <img src={me.logo} alt="" className="h-6 w-6 object-contain" /> : <span className="h-2 w-2" style={{ background: me.color }} />}
          <span className="text-xs text-dim">{me.name}</span>
          <button className="num hidden border border-line2 px-[5px] py-[1px] text-[9px] uppercase tracking-wider text-faint hover:text-fg xl:block" onClick={() => setTab('goals')} title={`${stage.done} of ${stage.total} goals reached`}>
            {stage.name}
          </button>
        </div>
        <div className="flex items-center gap-2 border-r border-line px-3">
          <Icon name="calendar" className="text-faint" />
          <span className="num text-sm font-semibold text-fg">{fmtDate(g.day)}</span>
        </div>
        <div className="relative flex items-center gap-2 border-r border-line px-3">
          <Icon name="cash" className="text-faint" />
          <span className={`num min-w-[4.5rem] text-sm font-semibold ${g.cash < 0 && !g.config.unlimitedMoney ? "text-neg" : "text-accent"}`}>{g.config.unlimitedMoney ? 'UNLIMITED' : money(g.cash)}</span>
          <CashDelta />
        </div>
        <div className="hidden items-center gap-2 border-r border-line px-3 lg:flex">
          <span className="label text-faint">This month</span>
          <span className="num text-xs text-dim">+{money(g.cur.revenue + g.cur.other, 1)}</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center border-l border-line px-2" title="Pause and speed keys can be changed under System, Keys.">
          <span className="label mr-2 hidden text-faint md:block">{designing ? 'Paused in designer' : speed ? 'Running' : 'Paused'}</span>
          {SPEEDS.map((s) => (
            <Btn key={s.speed} small disabled={designing} active={!designing && speed === s.speed} onClick={() => setSpeed(s.speed)} className="flex w-9 items-center justify-center !px-0" title={s.label}>
              <Icon name={s.icon} size={13} />
            </Btn>
          ))}
        </div>
        <div className="flex items-center border-l border-line px-2">
          <FeedbackButton small />
        </div>
        <div className="flex items-center gap-1 border-l border-line px-2">
          <Btn small className="flex items-center justify-center !px-2" title={`Quick save${keysFor('save')[0] ? ` (${keyName(keysFor('save')[0])})` : ''}`} onClick={quickSave}>
            <Icon name="save" />
          </Btn>
          <Btn small className="flex items-center justify-center !px-2" active={feedOpen} onClick={toggleFeed} title="Show or hide the news feed">
            <Icon name="feed" />
          </Btn>
        </div>
      </header>
      {!g.gameOver && !showing && <UnlockBanner />}

      <div className="flex min-h-0 flex-1">
        <nav data-chrome="nav" aria-label="Screens" className={`flex ${railW} shrink-0 flex-col border-r border-line bg-panel`}>
          <div className="border-b border-line p-2">
            <button
              onClick={() => openDesigner()}
              title={designing ? 'The designer is open' : kept ? 'Go back to the design you set aside' : 'Design a new device'}
              aria-label={designing ? 'Designing' : kept ? 'Resume design' : 'New device'}
              className={`flex h-11 w-full items-center border text-left text-[12px] font-semibold uppercase tracking-wider transition-colors ${railOpen ? 'justify-between px-3' : 'justify-center'} ${designing ? 'border-accent bg-transparent text-accent' : 'border-accent bg-accent text-carbon hover:bg-transparent hover:text-accent'}`}
            >
              {railOpen && (designing ? 'Designing' : kept ? 'Resume design' : 'New device')}
              <Icon name={kept && !designing ? 'design' : 'plus'} size={16} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {NAV.map((n) => ({ ...n, items: n.items.filter(shown) }))
              .filter((n) => n.items.length)
              .map((n) => (
                <div key={n.group} className="border-b border-line py-1">
                  {railOpen && <div className="px-3 pb-[2px] pt-1 text-[9px] uppercase tracking-[0.18em] text-faint">{n.group}</div>}
                  {n.items.map(navButton)}
                </div>
              ))}
            {later > 0 && (
              <button
                onClick={() => go({ tab: 'goals', view: 'growth' })}
                title={`${later} more ${later === 1 ? 'part' : 'parts'} of the company to open as it grows. See them all.`}
                aria-label={`More to unlock: ${later}`}
                className={`flex h-8 w-full items-center justify-between text-left text-faint transition-colors hover:bg-hover hover:text-fg ${railOpen ? 'px-3' : 'justify-center px-0'}`}
              >
                <span className="flex items-center gap-2">
                  <Icon name="branch" size={railOpen ? 14 : 17} />
                  {railOpen && <span className="text-[11px] uppercase tracking-wider">More to unlock</span>}
                </span>
                {railOpen && <span className="num text-[10px]">{later}</span>}
              </button>
            )}
          </div>
          <div className="border-t border-line py-1">
            {navButton({ id: 'system', label: 'System', code: 'SYS' })}
            <button onClick={toggleRail} className={`flex h-7 w-full items-center text-[10px] uppercase tracking-wider text-faint hover:text-fg ${railOpen ? 'px-3' : 'justify-center'}`} title={railOpen ? 'Collapse the menu' : 'Expand the menu'} aria-label={railOpen ? 'Collapse the menu' : 'Expand the menu'} aria-expanded={railOpen}>
              <Icon name={railOpen ? 'collapse' : 'expand'} size={12} />
              {railOpen && <span className="ml-2">Collapse</span>}
            </button>
          </div>
        </nav>

        <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden bg-carbon">
          {designing ? (
            <Designer />
          ) : (
            <>
              {tab === 'city' && <CityScreen />}
              {tab === 'dashboard' && <Dashboard />}
              {tab === 'products' && <Products />}
              {tab === 'research' && <ResearchScreen />}
              {tab === 'market' && <Market />}
              {tab === 'factory' && <FactoryScreen />}
              {tab === 'stores' && <StoresScreen />}
              {tab === 'marketing' && <MarketingScreen />}
              {tab === 'labs' && <LabsScreen />}
              {tab === 'staff' && <Staff />}
              {tab === 'office' && <OfficeScreen />}
              {tab === 'finance' && <Finance />}
              {tab === 'rivals' && <Rivals />}
              {tab === 'venue' && <VenueScreen />}
              {tab === 'care' && <CareScreen />}
              {tab === 'world' && <WorldScreen />}
              {tab === 'shares' && <SharesScreen />}
              {tab === 'goals' && <GoalsHub />}
              {tab === 'system' && <System />}
            </>
          )}
          {!designing && <ProductDrawer />}
          {!designing && <PersonCard />}
        </main>

        {showFeed && (
          <aside data-chrome="feed" aria-label="News feed" className="flex w-[236px] shrink-0 flex-col border-l border-line bg-panel">
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg">Feed</span>
              <button className="num text-[10px] text-faint hover:text-fg" onClick={toggleFeed}>
                HIDE
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {g.news.map((n) => (
                <div key={n.id} {...(n.productId ? { role: 'button', ...pressable(() => focus(n.productId!)) } : {})} className={`border-b border-line px-2 py-[5px] ${n.productId ? 'cursor-pointer hover:bg-hover' : ''}`}>
                  <div className="num flex justify-between text-[9px] text-faint">
                    <span>{fmtDate(n.day)}</span>
                    <span className={NEWS_TONE[n.kind]}>{n.kind.toUpperCase()}</span>
                  </div>
                  <div className={`text-[11px] leading-snug ${n.kind === 'rival' ? 'text-faint' : n.kind === 'alert' ? 'text-fg' : 'text-dim'}`}>{n.text}</div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      {!g.gameOver && !showing && <LockCard />}
      {showing && !g.gameOver && <LaunchShow eventId={showing} />}
      {!g.gameOver && !showing && <Coach />}
      {!g.gameOver && !showing && !designing && <Decision />}
      {!g.gameOver && !showing && <YearEnd />}

      {g.gameOver && <GameOver />}
    </div>
  )
}
