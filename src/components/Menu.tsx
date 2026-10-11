// Main menu and the new-game setup screen.
import { REGIONS } from '../sim/regions'
import { useState } from 'react'
import { sfx } from '../audio/sfx'
import { TRACK_INFO } from '../data/catalog'
import { DIFFICULTY, defaultConfig } from '../sim/game'
import { type Difficulty, type GameConfig, TRACKS } from '../sim/types'
import { useStore } from '../store/game'
import { LogoPicker } from './Company'
import { ImportButton, SaveList, ThemePicker } from './System'
import { Btn, Panel, Row, Slider, TextInput, money } from './ui'

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
  return (
    <div className="grid h-full grid-cols-[420px_minmax(0,1fr)] bg-carbon">
      <div className="flex flex-col justify-between border-r border-line bg-panel p-8">
        <Wordmark />
        <div className="flex flex-col gap-2">
          <Btn tone="primary" className="h-10 text-left" onClick={() => setScreen('new')}>
            New company
          </Btn>
          <ImportButton label="Load from file" />
          <div className="mt-4">
            <div className="label mb-1">Interface colours</div>
            <ThemePicker />
          </div>
        </div>
        <div className="num text-[10px] leading-relaxed text-faint">
          DESIGN / LAUNCH / OUTSELL / REINVEST
          <br />
          Saves are stored in this browser. Export them to keep a copy.
        </div>
      </div>
      <div className="flex min-h-0 flex-col p-8">
        <Panel title="Continue" bodyClass="overflow-auto" className="max-h-full">
          <SaveList />
        </Panel>
      </div>
    </div>
  )
}

const logMin = 6
const logMax = 9

export function NewGame() {
  const { begin, setScreen } = useStore.getState()
  const [cfg, setCfg] = useState<GameConfig>(() => ({ ...defaultConfig(), seed: Math.floor(Math.random() * 99999) + 1 }))
  const up = (patch: Partial<GameConfig>) => setCfg((c) => ({ ...c, ...patch }))
  const d = DIFFICULTY[cfg.difficulty]
  return (
    <div className="grid h-full grid-cols-[420px_minmax(0,1fr)] bg-carbon">
      <div className="flex flex-col justify-between border-r border-line bg-panel p-8">
        <Wordmark />
        <div className="text-[12px] leading-relaxed text-dim">
          You start as a small device maker in {2026}. More than twenty established companies already sell phones, tablets, watches, laptops, desktops, consoles, earbuds and TVs. Design a device, get it built, launch it, read the reviews, and put the money back into research, people and places.
        </div>
        <Btn onClick={() => setScreen('menu')}>Back</Btn>
      </div>
      <div className="min-h-0 overflow-y-auto p-8">
        <div className="grid max-w-[900px] grid-cols-2 gap-2">
          <Panel title="Company" bodyClass="p-3">
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">Name</span>
              <TextInput value={cfg.companyName} maxLength={18} onChange={(v) => up({ companyName: v })} className="w-48" />
            </label>
            <div className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">Logo</span>
              <LogoPicker value={cfg.logo} onChange={(logo) => up({ logo })} />
            </div>
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">Brand colour</span>
              <input type="color" value={cfg.color} onChange={(e) => up({ color: e.target.value })} />
            </label>
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">Home market</span>
              <select value={cfg.home ?? 'na'} onChange={(e) => up({ home: e.target.value })} className="h-7 w-48 rounded-none border border-line2 bg-raise px-2 text-xs text-fg outline-none focus:border-accent">
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">World seed</span>
              <input type="number" value={cfg.seed} onChange={(e) => up({ seed: Math.max(1, Math.floor(Number(e.target.value)) || 1) })} className="num h-7 w-48 rounded-none border border-line2 bg-raise px-2 text-xs outline-none focus:border-accent" />
            </label>
          </Panel>

          <Panel title="Mode" bodyClass="p-3">
            <div className="flex gap-2">
              <Btn active className="flex-1">
                Sandbox
              </Btn>
              <Btn disabled className="flex-1" title="Planned for a later build">
                Timeline 1970+
              </Btn>
            </div>
            <div className="mt-2 text-[11px] leading-snug text-dim">Sandbox starts in the present day. Every technology exists and is unlocked through research. Timeline mode is not built yet.</div>
          </Panel>

          <Panel title="Difficulty" bodyClass="p-3" className="col-span-2">
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((k) => (
                <button key={k} onClick={() => up({ difficulty: k, startCash: DIFFICULTY[k].startCash })} className={`border p-3 text-left transition-colors ${cfg.difficulty === k ? 'border-accent bg-accent/10' : 'border-line2 bg-raise hover:border-accent'}`}>
                  <div className={`text-sm uppercase tracking-wider ${cfg.difficulty === k ? 'text-accent' : 'text-fg'}`}>{DIFFICULTY[k].label}</div>
                  <div className="mt-1 text-[11px] leading-snug text-dim">{DIFFICULTY[k].blurb}</div>
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-x-6">
              <Row k="Overdraft" v={money(d.overdraft, 1)} />
              <Row k="Days in debt allowed" v={d.debtDays} />
              <Row k="Overhead" v={`${d.overhead}x`} />
              <Row k="Brand growth" v={`${d.awareness}x`} />
            </div>
          </Panel>

          <Panel title="Sandbox settings" bodyClass="p-3" className="col-span-2">
            <div className="grid grid-cols-2 gap-x-8">
              <Slider label="Starting cash" value={Math.log10(cfg.startCash)} min={logMin} max={logMax} step={0.02} format={() => money(cfg.startCash, 1)} onChange={(v) => up({ startCash: Math.round(Math.pow(10, v) / 1e5) * 1e5 })} disabled={cfg.unlimitedMoney} />
              <Slider label="Research speed" value={cfg.researchSpeed} min={0.5} max={4} step={0.25} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => up({ researchSpeed: v })} />
              <Slider label="Rival strength" value={cfg.rivalStrength} min={0.5} max={1.5} step={0.05} format={(v) => `${v.toFixed(2)}x`} onChange={(v) => up({ rivalStrength: v })} hint="Raises or lowers the tech level rivals build with" />
              <Slider label="Starting tech level" value={cfg.techLevel} min={0} max={4} step={1} format={(v) => `L${v} on every track`} onChange={(v) => up({ techLevel: v })} hint="Leading rivals start around level 3" />
            </div>
            <label className="mt-1 flex items-center text-[11px]">
              <input type="checkbox" className="mr-2 accent-accent" checked={cfg.unlimitedMoney} onChange={(e) => up({ unlimitedMoney: e.target.checked })} />
              Unlimited money (no bankruptcy; research still takes time)
            </label>
            <div className="mt-3 border-t border-line pt-2">
              <div className="label mb-1">You start with</div>
              <div className="grid grid-cols-2 gap-x-8">
                {TRACKS.map((t) => (
                  <Row key={t} k={TRACK_INFO[t].name} v={TRACK_INFO[t].unlocks[cfg.techLevel]} />
                ))}
              </div>
            </div>
          </Panel>

          <div className="col-span-2 flex justify-end">
            <Btn tone="primary" className="h-10 w-64" disabled={!cfg.companyName.trim()} onClick={() => (sfx.confirm(), begin({ ...cfg, companyName: cfg.companyName.trim() }))}>
              Found company
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
