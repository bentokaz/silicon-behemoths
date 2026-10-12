// Main menu and the new-game setup screen.
import { REGIONS } from '../sim/regions'
import { useState } from 'react'
import { sfx } from '../audio/sfx'
import { TRACK_INFO } from '../data/catalog'
import { TYPES, segmentsOf } from '../data/devices'
import { DIFFICULTY, defaultConfig } from '../sim/game'
import { START_TYPES } from '../sim/world'
import { type Difficulty, type GameConfig, TRACKS } from '../sim/types'
import { useStore } from '../store/game'
import { LogoPicker } from './Company'
import { ImportButton, SaveList, ThemePicker } from './System'
import { FeedbackLinks } from './Safety'
import { KeysPanel, SettingsPanel } from './Settings'
import { Icon, trackIcon, typeIcon } from './icons'
import { Btn, Head, Lead, NumInput, Panel, Row, Slider, Tabs, TextInput, money } from './ui'

function Wordmark() {
  return (
    <div>
      <div className="label text-accent">Tech company simulation / build 0.1</div>
      <h1 className="mt-2 text-5xl font-semibold leading-none tracking-[0.18em] text-fg">
        SILICON<span className="text-accent">/</span>
        <br />
        BEHEMOTHS
      </h1>
      <div className="mt-4 h-px w-full bg-line2" />
    </div>
  )
}

export function MainMenu() {
  const { setScreen } = useStore.getState()
  const [prefs, setPrefs] = useState(false)
  const [view, setView] = useState<'settings' | 'keys'>('settings')
  return (
    <div className="grid h-full grid-cols-[420px_minmax(0,1fr)] bg-carbon">
      <div className="flex flex-col justify-between border-r border-line bg-panel p-8">
        <Wordmark />
        <div className="flex flex-col gap-2">
          <Btn tone="primary" icon="plus" className="h-10 !justify-start text-left" onClick={() => setScreen('new')}>
            New company
          </Btn>
          <ImportButton label="Load from file" />
          <Btn icon="gear" active={prefs} onClick={() => setPrefs(!prefs)}>
            Settings and keys
          </Btn>
          <div className="mt-4">
            <Head icon="theme" className="mb-1">
              Interface colours
            </Head>
            <ThemePicker />
          </div>
        </div>
        <div className="num text-[10px] leading-relaxed text-faint">
          DESIGN / LAUNCH / OUTSELL / REINVEST
          <br />
          Saves are stored in this browser. Export them to keep a copy.
          <br />
          <br />
          A free game made for fun. The code, models and sounds were written by an AI (Claude) under one person's direction. Every company in it is made up.
          <FeedbackLinks className="mt-3" />
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-2 p-8">
        {prefs ? (
          <>
            <Tabs value={view} onChange={setView} options={[{ value: 'settings', label: 'Settings', icon: 'gear' }, { value: 'keys', label: 'Keys', icon: 'keys' }]} />
            <div className="min-h-0 flex-1">{view === 'settings' ? <SettingsPanel /> : <KeysPanel />}</div>
          </>
        ) : (
          <Panel title="Continue" icon="folder" bodyClass="@container overflow-auto" className="max-h-full">
            <SaveList />
          </Panel>
        )}
      </div>
    </div>
  )
}

const logMin = 6
const logMax = 9

export function NewGame() {
  const { begin, setScreen } = useStore.getState()
  const [cfg, setCfg] = useState<GameConfig>(() => ({ ...defaultConfig(), startType: 'phone', progression: 'guided', seed: Math.floor(Math.random() * 99999) + 1 }))
  const up = (patch: Partial<GameConfig>) => setCfg((c) => ({ ...c, ...patch }))
  const d = DIFFICULTY[cfg.difficulty]
  const name = cfg.companyName.trim()
  const found = () => {
    if (!name) return
    sfx.confirm()
    begin({ ...cfg, companyName: name })
  }
  return (
    <div className="grid h-full grid-cols-[420px_minmax(0,1fr)] bg-carbon">
      <div className="flex flex-col justify-between border-r border-line bg-panel p-8">
        <Wordmark />
        <div className="text-[12px] leading-relaxed text-dim">
          You start as a small maker of one kind of device in {2026}. More than twenty established companies already sell phones, tablets, watches, laptops, desktops, consoles, earbuds and TVs, and a few are trying their hand at foldables, headsets, smart speakers and handhelds. Design a device, get it built, launch it, read the reviews, and put the money back into research, people and places.
        </div>
        <Btn icon="arrowLeft" onClick={() => setScreen('menu')}>
          Back
        </Btn>
      </div>
      <div className="min-h-0 overflow-y-auto p-8">
        <div className="grid max-w-[900px] grid-cols-2 gap-2">
          <Panel title="Company" icon="campus" bodyClass="p-3">
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">
                <Lead icon="edit" />
                Name
              </span>
              <TextInput value={cfg.companyName} maxLength={18} onChange={(v) => up({ companyName: v })} onEnter={found} className={`w-48 ${name ? '' : '!border-warn'}`} placeholder="Name your company" />
            </label>
            <div className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">
                <Lead icon="brand" />
                Logo
              </span>
              <LogoPicker value={cfg.logo} onChange={(logo) => up({ logo })} />
            </div>
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">
                <Lead icon="theme" />
                Brand colour
              </span>
              <input type="color" aria-label="Brand colour" value={cfg.color} onChange={(e) => up({ color: e.target.value })} />
            </label>
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">
                <Lead icon="home" />
                Home market
              </span>
              <select aria-label="Home market" value={cfg.home ?? "na"} onChange={(e) => up({ home: e.target.value })} className="h-7 w-48 rounded-none border border-line2 bg-raise px-2 text-xs text-fg outline-none focus:border-accent">
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">
                <Lead icon="dice" />
                World seed
              </span>
              <NumInput aria-label="World seed" value={cfg.seed} min={1} max={2147483647} onChange={(seed) => up({ seed })} onEnter={found} className="w-48" title="The same seed gives the same rivals and the same world" />
            </label>
          </Panel>

          <Panel title="How the company grows" icon="branch" bodyClass="flex flex-col gap-2 p-3">
            {(
              [
                ['guided', 'Start small', 'recommended', 'lock', 'A garage, a designer and a few desks. Research, marketing, finance, a factory, stores and the rest open one by one as you hire, build and sell.'],
                ['open', 'Everything open', 'sandbox', 'unlock', 'Every screen and every lever from the first day, as in earlier builds. Nothing to earn.'],
              ] as const
            ).map(([id, name, tag, icon, note]) => {
              const on = (cfg.progression ?? 'open') === id
              return (
                <button key={id} onClick={() => (up({ progression: id }), sfx.toggle())} className={`flex-1 border px-3 py-2 text-left transition-colors ${on ? 'border-accent bg-accent/10' : 'border-line2 bg-raise hover:border-accent'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`flex items-center gap-2 text-xs uppercase tracking-wider ${on ? 'text-accent' : 'text-fg'}`}>
                      <Icon name={icon} size={14} className={on ? '' : 'text-dim'} />
                      {name}
                    </span>
                    <span className="num text-[9px] uppercase tracking-wider text-faint">{tag}</span>
                  </div>
                  <div className="mt-1 text-[11px] leading-snug text-dim">{note}</div>
                </button>
              )
            })}
          </Panel>

          <Panel title="What your company makes" icon="devices" bodyClass="p-3" className="col-span-2">
            <div className="grid grid-cols-4 gap-1">
              {START_TYPES.map((type) => (
                <button key={type} onClick={() => (up({ startType: type }), sfx.toggle())} className={`border px-2 py-2 text-left transition-colors ${cfg.startType === type ? 'border-accent bg-accent/10' : 'border-line2 bg-raise hover:border-accent'}`}>
                  <div className={`flex items-center gap-2 text-xs uppercase tracking-wider ${cfg.startType === type ? 'text-accent' : 'text-fg'}`}>
                    <Icon name={typeIcon(type)} size={18} className={cfg.startType === type ? '' : 'text-dim'} />
                    <span className="min-w-0 truncate">{TYPES[type].plural}</span>
                  </div>
                  <div className="num pl-[26px] text-[10px] text-faint">{segmentsOf(type).length} markets{['console', 'handheld', 'speaker'].includes(type) ? ' / slow start' : ''}</div>
                </button>
              ))}
              <button onClick={() => (up({ startType: 'all' }), sfx.toggle())} className={`border px-2 py-2 text-left transition-colors ${cfg.startType === 'all' ? 'border-accent bg-accent/10' : 'border-line2 bg-raise hover:border-accent'}`}>
                <div className={`flex items-center gap-2 text-xs uppercase tracking-wider ${cfg.startType === 'all' ? 'text-accent' : 'text-fg'}`}>
                  <Icon name="overview" size={18} className={cfg.startType === 'all' ? '' : 'text-dim'} />
                  <span className="min-w-0 truncate">Everything</span>
                </div>
                <div className="num pl-[26px] text-[10px] text-faint">nothing to unlock</div>
              </button>
            </div>
            <div className="mt-2 text-[11px] leading-snug text-dim">You begin as a maker of one kind of device and open other lines under Research as you grow. Related lines are cheaper to open; the most demanding need your technology to be far enough along. "Everything" starts with every line open.</div>
            <label className="mt-2 flex items-center gap-2 text-[11px] text-dim">
              <input type="checkbox" className="accent-accent" checked={!!cfg.parody} onChange={(e) => up({ parody: e.target.checked })} />
              Use joke names for rival companies instead of invented ones
            </label>
          </Panel>

          <Panel title="Mode" icon="box" bodyClass="p-3">
            <div className="flex gap-2">
              {/* the only mode there is yet: shown as chosen, with nothing to press */}
              <div className="flex h-7 flex-1 items-center justify-center gap-[6px] border border-accent bg-accent/10 px-3 text-xs uppercase tracking-wider text-accent">
                <Icon name="box" size={13} />
                Sandbox
              </div>
              <Btn disabled icon="clock" className="flex-1" title="Planned for a later build">
                Timeline 1970+
              </Btn>
            </div>
            <div className="mt-2 text-[11px] leading-snug text-dim">Sandbox starts in the present day. Every technology exists and is unlocked through research. Timeline mode is not built yet.</div>
          </Panel>

          <Panel title="Difficulty" icon="gauge" bodyClass="p-3" className="col-span-2">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((k) => (
                <button key={k} onClick={() => up({ difficulty: k, startCash: DIFFICULTY[k].startCash })} className={`border p-3 text-left transition-colors ${cfg.difficulty === k ? 'border-accent bg-accent/10' : 'border-line2 bg-raise hover:border-accent'}`}>
                  <div className={`text-sm uppercase tracking-wider ${cfg.difficulty === k ? 'text-accent' : 'text-fg'}`}>{DIFFICULTY[k].label}</div>
                  <div className="mt-1 text-[11px] leading-snug text-dim">{DIFFICULTY[k].blurb}</div>
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-x-6">
              <Row icon="bank" k="Overdraft" v={money(d.overdraft, 1)} />
              <Row icon="hourglass" k="Days in debt allowed" v={d.debtDays} />
              <Row icon="receipt" k="Overhead" v={`${d.overhead}x`} />
              <Row icon="brand" k="Brand growth" v={`${d.awareness}x`} />
            </div>
          </Panel>

          <Panel title="Sandbox settings" icon="system" bodyClass="p-3" className="col-span-2">
            <div className="grid grid-cols-2 gap-x-8">
              <Slider label="Starting cash" icon="cash" value={Math.log10(cfg.startCash)} min={logMin} max={logMax} step={0.02} format={() => money(cfg.startCash, 1)} onChange={(v) => up({ startCash: Math.round(Math.pow(10, v) / 1e5) * 1e5 })} disabled={cfg.unlimitedMoney} />
              <Slider label="Research speed" icon="research" value={cfg.researchSpeed} min={0.5} max={4} step={0.25} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => up({ researchSpeed: v })} />
              <Slider label="Rival strength" icon="rivals" value={cfg.rivalStrength} min={0.5} max={1.5} step={0.05} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => up({ rivalStrength: v })} hint="Raises or lowers the tech level rivals build with" />
              <Slider label="Starting tech level" icon="layers" value={cfg.techLevel} min={0} max={4} step={1} format={(v) => `L${v} on every track`} onChange={(v) => up({ techLevel: v })} hint="Leading rivals start around level 3" />
            </div>
            <label className="mt-1 flex items-center text-[11px]">
              <input type="checkbox" className="mr-2 accent-accent" checked={cfg.unlimitedMoney} onChange={(e) => up({ unlimitedMoney: e.target.checked })} />
              Unlimited money (no bankruptcy; research still takes time)
            </label>
            <div className="mt-3 border-t border-line pt-2">
              <Head icon="research" className="mb-1">
                You start with
              </Head>
              <div className="grid grid-cols-2 gap-x-8">
                {TRACKS.map((t) => (
                  <Row key={t} icon={trackIcon(t)} k={TRACK_INFO[t].name} v={TRACK_INFO[t].unlocks[cfg.techLevel]} />
                ))}
              </div>
            </div>
          </Panel>

          <div className="col-span-2 flex justify-end">
            <Btn tone="primary" icon="arrowRight" className="h-10 w-64" disabled={!name} title={name ? undefined : 'Give the company a name first'} onClick={found}>
              Found company
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
