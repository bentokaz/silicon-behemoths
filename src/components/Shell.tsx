// In-game frame: top bar with clock and speed controls, navigation rail,
// the active screen, and a toggleable news drawer. Also runs the game loop.
import { useEffect, useRef, useState } from 'react'
import { sfx } from '../audio/sfx'
import { fmtDate, player } from '../sim/game'
import type { NewsItem } from '../sim/types'
import { DAYS_PER_SECOND, type Speed, type Tab, useGame, useStore } from '../store/game'
import { saveGame } from '../store/saves'
import { Designer } from './Designer'
import { OfficeScreen, Staff } from './Company'
import { Research } from './ResearchTree'
import { Dashboard, Finance, Market, Products, Rivals } from './Screens'
import { System } from './System'
import { Btn, money } from './ui'

const TABS: { id: Tab; label: string; key: string }[] = [
  { id: 'dashboard', label: 'Overview', key: 'F1' },
  { id: 'products', label: 'Devices', key: 'F2' },
  { id: 'market', label: 'Market', key: 'F3' },
  { id: 'rivals', label: 'Rivals', key: 'F4' },
  { id: 'research', label: 'Research', key: 'F5' },
  { id: 'staff', label: 'Staff', key: 'F6' },
  { id: 'office', label: 'Office', key: 'F7' },
  { id: 'finance', label: 'Finance', key: 'F8' },
  { id: 'system', label: 'System', key: 'F9' },
]
const SPEEDS: { speed: Speed; label: string }[] = [
  { speed: 0, label: 'II' },
  { speed: 1, label: '1x' },
  { speed: 2, label: '2x' },
  { speed: 4, label: '4x' },
]
const NEWS_TONE: Record<NewsItem['kind'], string> = { launch: 'text-accent', review: 'text-pos', research: 'text-accent', rival: 'text-dim', finance: 'text-fg', alert: 'text-neg' }

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
      if (st.designing) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (st.speed) (lastSpeed.current = st.speed), st.setSpeed(0)
        else st.setSpeed(lastSpeed.current)
      } else if (e.key === '1') st.setSpeed(1)
      else if (e.key === '2') st.setSpeed(2)
      else if (e.key === '3' || e.key === '4') st.setSpeed(4)
      else {
        const tab = TABS.find((t) => t.key === e.key)
        if (!tab) return
        e.preventDefault()
        st.setTab(tab.id)
      }
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
  const { setTab, setSpeed, focus, say, quit } = useStore.getState()
  const [news, setNews] = useState(true)
  useGameLoop()
  useHotkeys()
  const me = player(g)

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-10 shrink-0 items-stretch border-b border-line bg-panel">
        <div className="flex w-[184px] shrink-0 items-center border-r border-line px-3">
          <span className="text-[11px] font-semibold tracking-[0.22em] text-fg">
            SILICON<span className="text-accent">/</span>BEHEMOTHS
          </span>
        </div>
        <div className="flex items-center gap-2 border-r border-line px-3">
          {me.logo ? <img src={me.logo} alt="" className="h-6 w-6 object-contain" /> : <span className="h-2 w-2" style={{ background: me.color }} />}
          <span className="text-xs font-semibold">{me.name}</span>
        </div>
        <div className="flex items-center gap-2 border-r border-line px-3">
          <span className="label">Date</span>
          <span className="num text-xs">{fmtDate(g.day)}</span>
        </div>
        <div className="flex items-center gap-2 border-r border-line px-3">
          <span className="label">Cash</span>
          <span className={`num text-xs ${g.cash < 0 && !g.config.unlimitedMoney ? 'text-neg' : 'text-accent'}`}>{g.config.unlimitedMoney ? 'UNLIMITED' : money(g.cash)}</span>
        </div>
        <div className="flex items-center gap-2 border-r border-line px-3">
          <span className="label">Month</span>
          <span className="num text-xs text-pos">+{money(g.cur.revenue, 1)}</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center border-l border-line px-2" title="Space pauses. 1, 2 and 3 set the speed.">
          <span className="label mr-2">{designing ? 'Paused in designer' : speed ? 'Running' : 'Paused'}</span>
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
          <Btn small active={news} onClick={() => setNews(!news)}>
            Feed
          </Btn>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-[184px] shrink-0 flex-col border-r border-line bg-panel">
          <div className="border-b border-line p-2">
            <button
              onClick={() => useStore.getState().openDesigner()}
              className={`flex h-12 w-full items-center justify-between border px-3 text-left text-[13px] font-semibold uppercase tracking-wider transition-colors ${designing ? 'border-accent bg-transparent text-accent' : 'border-accent bg-accent text-carbon hover:bg-transparent hover:text-accent'}`}
            >
              {designing ? 'Designing' : 'New device'}
              <span className="num text-lg leading-none">+</span>
            </button>
          </div>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => (useStore.getState().closeDesigner(), setTab(t.id))}
              className={`flex h-9 items-center justify-between border-b border-l-2 border-b-line px-3 text-left text-xs uppercase tracking-wider transition-colors ${!designing && tab === t.id ? 'border-l-accent bg-accent/10 text-accent' : 'border-l-transparent text-dim hover:bg-hover hover:text-fg'}`}
            >
              {t.label}
              <span className="num text-[9px] text-faint">{t.key}</span>
            </button>
          ))}
          <div className="flex-1" />
          <div className="border-t border-line p-3 text-[10px] leading-relaxed text-faint">
            <div className="label mb-1">Sandbox</div>
            <div className="num">{g.config.difficulty.toUpperCase()}</div>
            <div className="num">SEED {g.config.seed}</div>
          </div>
        </nav>

        <main className="min-h-0 min-w-0 flex-1 bg-carbon">
          {designing ? (
            <Designer />
          ) : (
            <>
              {tab === 'dashboard' && <Dashboard />}
              {tab === 'products' && <Products />}
              {tab === 'market' && <Market />}
              {tab === 'rivals' && <Rivals />}
              {tab === 'research' && <Research />}
              {tab === 'staff' && <Staff />}
              {tab === 'office' && <OfficeScreen />}
              {tab === 'finance' && <Finance />}
              {tab === 'system' && <System />}
            </>
          )}
        </main>

        {news && !designing && (
          <aside className="flex w-[250px] shrink-0 flex-col border-l border-line bg-panel">
            <div className="label flex h-7 shrink-0 items-center border-b border-line px-2">Feed</div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {g.news.map((n) => (
                <div key={n.id} role={n.productId ? 'button' : undefined} onClick={() => n.productId && focus(n.productId, g.products.find((p) => p.id === n.productId)?.companyId === 'player' ? 'products' : 'market')} className={`border-b border-line px-2 py-[5px] ${n.productId ? 'cursor-pointer hover:bg-hover' : ''}`}>
                  <div className="num flex justify-between text-[9px] text-faint">
                    <span>{fmtDate(n.day)}</span>
                    <span className={NEWS_TONE[n.kind]}>{n.kind.toUpperCase()}</span>
                  </div>
                  <div className={`text-[11px] leading-snug ${n.kind === 'rival' ? 'text-dim' : 'text-fg'}`}>{n.text}</div>
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>

      {g.gameOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-carbon/85">
          <div className="w-[380px] border border-neg bg-panel p-4">
            <div className="label text-neg">Bankrupt</div>
            <div className="mt-2 text-lg">{me.name} has run out of credit.</div>
            <div className="num mt-2 text-[11px] text-dim">
              Survived until {fmtDate(g.day)}. Sold {me.unitsTotal.toLocaleString()} devices for {money(me.revenueTotal)}.
            </div>
            <div className="mt-4 flex gap-2">
              <Btn className="flex-1" onClick={quit}>
                Main menu
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
