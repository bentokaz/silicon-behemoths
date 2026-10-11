// In-game frame: top bar with the clock and speed controls, a grouped
// navigation rail that can collapse, the active screen, the news feed and the
// slide-over product inspector. Also runs the game loop.
import { useEffect, useRef } from 'react'
import { sfx } from '../audio/sfx'
import { fmtDate, player } from '../sim/game'
import { factoryLine, pendingUnits } from '../sim/ops'
import { sealedRooms } from '../sim/sites'
import { staffEffects, unmanaged } from '../sim/staff'
import { stageOf } from '../sim/goals'
import { type GameState, type NewsItem, SUPPLY_CATS } from '../sim/types'
import { DAYS_PER_SECOND, type Speed, type Tab, useGame, useStore } from '../store/game'
import { saveGame } from '../store/saves'
import { actionFor, keyName, keysFor, useSettings } from '../store/settings'
import { OfficeScreen, PersonCard, Staff } from './Company'
import { Designer } from './Designer'
import { CareScreen, GoalsScreen, SharesScreen, WorldScreen } from './Empire'
import { MarketingScreen, StoresScreen, VenueScreen } from './Growth'
import { LaunchShow } from './Show'
import { ProductDrawer } from './Inspector'
import { LabsScreen } from './Labs'
import { FactoryScreen } from './Operations'
import { Research } from './ResearchTree'
import { Dashboard, Finance, Market, Products, Rivals } from './Screens'
import { System } from './System'
import { Btn, money } from './ui'

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
const SPEEDS: { speed: Speed; label: string }[] = [
  { speed: 0, label: 'II' },
  { speed: 1, label: '1x' },
  { speed: 2, label: '2x' },
  { speed: 4, label: '4x' },
]
const NEWS_TONE: Record<NewsItem['kind'], string> = { launch: 'text-accent', review: 'text-pos', research: 'text-accent', rival: 'text-faint', finance: 'text-dim', alert: 'text-neg', staff: 'text-dim', event: 'text-pos', goal: 'text-warn' }
/** Screens that are a full 3D view; the feed stays out of their way. */
const WIDE: Tab[] = ['office', 'factory', 'stores', 'venue']

/** A count shown beside a nav item when something there needs attention. */
function badge(g: GameState, tab: Tab): number {
  if (tab === 'products') return g.products.filter((p) => p.companyId === 'player' && ((p.status === 'sale' && p.stock <= 0 && !pendingUnits(g, p.id)) || p.recall?.state === 'open')).length
  if (tab === 'staff') return g.staff.filter((e) => e.ask).length + (unmanaged(g) ? 1 : 0)
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

function useHotkeys() {
  const lastSpeed = useRef<Speed>(1)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      const st = useStore.getState()
      if (st.designing || st.showing || !st.game) return
      const action = actionFor(e, ['Game', 'Screens'])
      if (!action) return
      e.preventDefault()
      if (action === 'pause') {
        if (st.speed) (lastSpeed.current = st.speed), st.setSpeed(0)
        else st.setSpeed(lastSpeed.current)
      } else if (action === 'speed1') st.setSpeed(1)
      else if (action === 'speed2') st.setSpeed(2)
      else if (action === 'speed3') st.setSpeed(4)
      else if (action === 'save') void saveGame('quick', st.game).then(() => (sfx.confirm(), st.say('Saved to the Quick slot.')))
      else if (action === 'newDevice') st.openDesigner()
      else if (action === 'feed') st.toggleFeed()
      else if (action.startsWith('tab:')) st.setTab(action.slice(4) as Tab)
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
}

export function Shell() {
  const g = useGame()
  const tab = useStore((s) => s.tab)
  const speed = useStore((s) => s.speed)
  const designing = useStore((s) => s.designing)
  const railOpen = useStore((s) => s.railOpen)
  const feedOpen = useStore((s) => s.feedOpen)
  const checkpoint = useStore((s) => s.checkpoint)
  const showing = useStore((s) => s.showing)
  const { setTab, setSpeed, focus, say, quit, toggleRail, toggleFeed, openDesigner, rewind } = useStore.getState()
  const stage = stageOf(g)
  useSettings((s) => s.binds)
  const keyOf = (tab: Tab) => {
    const k = keysFor(`tab:${tab}`)[0]
    return k ? keyName(k) : ''
  }
  useGameLoop()
  useHotkeys()
  const me = player(g)
  const showFeed = feedOpen && !designing && !WIDE.includes(tab)
  const railW = railOpen ? 'w-[172px]' : 'w-[52px]'

  const navButton = (t: NavItem) => {
    const on = !designing && tab === t.id
    const n = badge(g, t.id)
    return (
      <button key={t.id} onClick={() => setTab(t.id)} title={railOpen ? undefined : t.label} className={`relative flex h-8 w-full items-center justify-between border-l-2 text-left transition-colors ${railOpen ? 'px-3' : 'justify-center px-0'} ${on ? 'border-l-accent bg-accent/10 text-accent' : 'border-l-transparent text-dim hover:bg-hover hover:text-fg'}`}>
        <span className={railOpen ? 'text-xs uppercase tracking-wider' : 'num text-[10px]'}>{railOpen ? t.label : t.code}</span>
        {n > 0 ? <span className={`num text-[10px] text-warn ${railOpen ? '' : 'absolute right-1 top-0'}`}>{n}</span> : railOpen && keyOf(t.id) && <span className="num text-[9px] text-faint">{keyOf(t.id)}</span>}
      </button>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-stretch border-b border-line bg-panel">
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
          <span className="label text-faint">Date</span>
          <span className="num text-sm font-semibold text-fg">{fmtDate(g.day)}</span>
        </div>
        <div className="flex items-center gap-2 border-r border-line px-3">
          <span className="label text-faint">Cash</span>
          <span className={`num text-sm font-semibold ${g.cash < 0 && !g.config.unlimitedMoney ? 'text-neg' : 'text-accent'}`}>{g.config.unlimitedMoney ? 'UNLIMITED' : money(g.cash)}</span>
        </div>
        <div className="hidden items-center gap-2 border-r border-line px-3 lg:flex">
          <span className="label text-faint">This month</span>
          <span className="num text-xs text-dim">+{money(g.cur.revenue + g.cur.other, 1)}</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center border-l border-line px-2" title="Pause and speed keys can be changed under System, Keys.">
          <span className="label mr-2 hidden text-faint md:block">{designing ? 'Paused in designer' : speed ? 'Running' : 'Paused'}</span>
          {SPEEDS.map((s) => (
            <Btn key={s.speed} small disabled={designing} active={!designing && speed === s.speed} onClick={() => setSpeed(s.speed)} className="num w-9 !px-0">
              {s.label}
            </Btn>
          ))}
        </div>
        <div className="flex items-center gap-1 border-l border-line px-2">
          <Btn small onClick={() => void saveGame('quick', g).then(() => (sfx.confirm(), say('Saved to the Quick slot.')))}>
            Save
          </Btn>
          <Btn small active={feedOpen} onClick={toggleFeed} title="Show or hide the news feed">
            Feed
          </Btn>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className={`flex ${railW} shrink-0 flex-col border-r border-line bg-panel`}>
          <div className="border-b border-line p-2">
            <button
              onClick={() => openDesigner()}
              title="Design a new device"
              className={`flex h-11 w-full items-center border text-left text-[12px] font-semibold uppercase tracking-wider transition-colors ${railOpen ? 'justify-between px-3' : 'justify-center'} ${designing ? 'border-accent bg-transparent text-accent' : 'border-accent bg-accent text-carbon hover:bg-transparent hover:text-accent'}`}
            >
              {railOpen && (designing ? 'Designing' : 'New device')}
              <span className="num text-lg leading-none">+</span>
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {NAV.map((n) => (
              <div key={n.group} className="border-b border-line py-1">
                {railOpen && <div className="px-3 pb-[2px] pt-1 text-[9px] uppercase tracking-[0.18em] text-faint">{n.group}</div>}
                {n.items.map(navButton)}
              </div>
            ))}
          </div>
          <div className="border-t border-line py-1">
            {navButton({ id: 'system', label: 'System', code: 'SYS' })}
            <button onClick={toggleRail} className={`flex h-7 w-full items-center text-[10px] uppercase tracking-wider text-faint hover:text-fg ${railOpen ? 'px-3' : 'justify-center'}`} title={railOpen ? 'Collapse the menu' : 'Expand the menu'}>
              {railOpen ? '<< Collapse' : '>>'}
            </button>
          </div>
        </nav>

        <main className="relative min-h-0 min-w-0 flex-1 bg-carbon">
          {designing ? (
            <Designer />
          ) : (
            <>
              {tab === 'dashboard' && <Dashboard />}
              {tab === 'products' && <Products />}
              {tab === 'research' && <Research />}
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
              {tab === 'goals' && <GoalsScreen />}
              {tab === 'system' && <System />}
            </>
          )}
          {!designing && <ProductDrawer />}
          {!designing && <PersonCard />}
        </main>

        {showFeed && (
          <aside className="flex w-[236px] shrink-0 flex-col border-l border-line bg-panel">
            <div className="flex h-8 shrink-0 items-center justify-between border-b border-line px-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg">Feed</span>
              <button className="num text-[10px] text-faint hover:text-fg" onClick={toggleFeed}>
                HIDE
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {g.news.map((n) => (
                <div key={n.id} role={n.productId ? 'button' : undefined} onClick={() => n.productId && focus(n.productId)} className={`border-b border-line px-2 py-[5px] ${n.productId ? 'cursor-pointer hover:bg-hover' : ''}`}>
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

      {showing && !g.gameOver && <LaunchShow eventId={showing} />}

      {g.gameOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-carbon/85">
          <div className="w-[420px] border border-neg bg-panel p-4">
            <div className="label text-neg">{g.overReason === 'ousted' ? 'Removed by the board' : 'Bankrupt'}</div>
            <div className="mt-2 text-lg text-fg">{g.overReason === 'ousted' ? `The board of ${me.name} has replaced you.` : `${me.name} has run out of credit.`}</div>
            <div className="num mt-2 text-[11px] text-dim">
              Survived until {fmtDate(g.day)}. Sold {me.unitsTotal.toLocaleString()} devices for {money(me.revenueTotal)}.
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
            <div className="mt-2 text-[10px] text-faint">The same copy is in the load menu as "Before the debt", along with the monthly autosave.</div>
          </div>
        </div>
      )}
    </div>
  )
}
