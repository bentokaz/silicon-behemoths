// Main menu and the new-game setup screen.
import { REGIONS } from '../sim/regions'
import { type ReactNode, useEffect, useState } from 'react'
import { sfx } from '../audio/sfx'
import { TRACK_INFO } from '../data/catalog'
import { TYPES, segmentsOf } from '../data/devices'
import { DIFFICULTY, defaultConfig, fmtDate } from '../sim/game'
import { ERAS, eraInfo } from '../data/eras'
import { startTypesIn } from '../sim/world'
import { type Difficulty, type GameConfig, TRACKS } from '../sim/types'
import { useStore } from '../store/game'
import { type SaveMeta, listSaves, slotName } from '../store/saves'
import { LogoPicker } from './LogoPicker'
import { ImportButton, SaveList, loadSlot, savedAgo } from './System'
import { FeedbackLinks } from './Safety'
import { KeysPanel, SettingsPanel } from './Settings'
import { Icon, type IconName, trackIcon, typeIcon } from './icons'
import { Btn, Choice, Fold, Head, NumInput, Panel, Row, Section, Slider, Tabs, TextInput, money, pct, useLayer } from './ui'

function Wordmark() {
  return (
    <div>
      <div className="text-xs font-medium text-accent">Tech company simulation / build 0.1</div>
      <h1 className="font-display mt-3 text-5xl font-semibold leading-[0.95] tracking-[0.01em] text-fg">
        SILICON<span className="text-accent">/</span>
        <br />
        BEHEMOTHS
      </h1>
      <div className="mt-6 h-px w-full bg-line2" />
    </div>
  )
}

const PILLARS: { icon: IconName; title: string; text: string }[] = [
  { icon: 'design', title: 'Design', text: 'Shape a device, choose what goes inside, and price it against the market.' },
  { icon: 'truck', title: 'Build and sell', text: 'Order a run, watch the reviews come in, and keep it in stock.' },
  { icon: 'campus', title: 'Grow', text: 'Hire, research, open factories and stores, and take on the giants.' },
]

const INTRO = 'You start as a small maker of one kind of device in 2026. More than twenty established companies already sell phones, tablets, watches, laptops, desktops, consoles, earbuds and TVs. Design a device, get it built, launch it, read the reviews, and put the money back into research, people and places.'

export function MainMenu() {
  const { setScreen } = useStore.getState()
  /** What the right-hand side shows: nothing, the saved games, or settings and keys. */
  const [open, setOpen] = useState<null | 'load' | 'settings'>(null)
  const [view, setView] = useState<'settings' | 'keys'>('settings')
  // the saves in this browser, newest first: the newest is what Continue picks up
  const [saves, setSaves] = useState<SaveMeta[] | null>(null)
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let live = true
    listSaves().then(
      (list) => live && setSaves(list),
      () => live && setSaves([]),
    )
    return () => void (live = false)
  }, [nonce])
  useLayer(open !== null, () => setOpen(null))
  const last = saves?.[0]
  const again = () => setNonce((n) => n + 1)
  return (
    <div className="grid h-full grid-cols-[minmax(360px,440px)_minmax(0,1fr)] bg-carbon">
      <div className="flex min-h-0 flex-col justify-between gap-6 border-r border-line bg-panel px-10 py-10">
        <Wordmark />
        <div className="flex flex-col gap-3">
          {last && (
            <div>
              <Btn tone="primary" large icon="play" className="w-full !justify-start" title={`Carry on with ${last.company} from ${slotName(last.slot)}`} onClick={() => void loadSlot(last.slot).then((ok) => !ok && again())}>
                <span className="min-w-0 truncate">
                  Continue: {last.company}, {fmtDate(last.day)}
                </span>
              </Btn>
              <div className="mt-1.5 truncate text-xs text-dim">
                {slotName(last.slot)}, <span className="num">{money(last.cash)}</span> in the bank, saved {savedAgo(last.savedAt)}
              </div>
            </div>
          )}
          {/* the one filled button is Continue when there is a game to continue, and New company when there is none */}
          <Btn tone={saves && !last ? 'primary' : 'default'} large icon="plus" className="!justify-start" onClick={() => setScreen('new')}>
            New company
          </Btn>
          <Btn large icon="folder" className="!justify-start" active={open === 'load'} onClick={() => setOpen(open === 'load' ? null : 'load')}>
            Load game
          </Btn>
          <Btn large icon="gear" className="!justify-start" active={open === 'settings'} onClick={() => setOpen(open === 'settings' ? null : 'settings')}>
            Settings and keys
          </Btn>
        </div>
        <FeedbackLinks />
      </div>
      <div className="relative flex min-h-0 flex-col gap-4 overflow-hidden p-10">
        {open === 'settings' ? (
          <>
            <Tabs
              value={view}
              onChange={setView}
              options={[
                { value: 'settings', label: 'Settings', icon: 'gear' },
                { value: 'keys', label: 'Keys', icon: 'keys' },
              ]}
            />
            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">{view === 'settings' ? <SettingsPanel theme /> : <KeysPanel />}</div>
          </>
        ) : open === 'load' ? (
          <Panel title="Load game" icon="folder" bodyClass="overflow-y-auto" className="max-h-full" right={<ImportButton label="Load from file" />}>
            <SaveList nonce={nonce} onChanged={again} />
          </Panel>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col justify-center">
            {/* a quiet field of lines behind the pitch, in the house hairline */}
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)', backgroundSize: '64px 64px', maskImage: 'radial-gradient(ellipse at 70% 60%, black, transparent 70%)', WebkitMaskImage: 'radial-gradient(ellipse at 70% 60%, black, transparent 70%)' }} />
            <div className="relative max-w-[640px]">
              <h2 className="font-display text-3xl font-semibold text-fg">Build a device company, from a garage to a giant.</h2>
              <p className="mt-4 text-base leading-relaxed text-dim">{INTRO}</p>
              <div className="mt-8 grid grid-cols-3 gap-3">
                {PILLARS.map((p) => (
                  <div key={p.title} className="border border-line bg-panel/80 p-4">
                    <Icon name={p.icon} size={20} className="text-accent" />
                    <div className="t-title mt-3">{p.title}</div>
                    <div className="mt-1 text-xs leading-snug text-dim">{p.text}</div>
                  </div>
                ))}
              </div>
              <p className="mt-8 text-xs leading-relaxed text-faint">Saves are kept in this browser; export one to keep a copy. A free game made for fun: the code, models and sounds were written by an AI (Claude) under one person's direction. Every company in it is made up.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const logMin = 6
const logMax = 9

/** One of a few choices, drawn as a tile: a name, an optional mark at the right, a line under it. */
function Option({ on, onClick, icon, name, tag, children, big, className = '' }: { on: boolean; onClick: () => void; icon?: IconName; name: string; tag?: string; children?: ReactNode; /** A 13px name, for a choice with no icon. */ big?: boolean; className?: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => (onClick(), sfx.toggle())} className={`min-w-0 border px-4 py-3 text-left ${on ? 'border-accent bg-accent/10' : 'border-line2 bg-raise hover:border-fg'} ${className}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`flex min-w-0 items-center gap-2.5 ${big ? 'text-base' : 'text-sm'} ${on ? 'font-semibold text-accent' : 'font-medium text-fg'}`}>
          {icon && <Icon name={icon} size={18} className={`shrink-0 ${on ? 'text-accent' : 'text-dim'}`} />}
          <span className="min-w-0 truncate">{name}</span>
        </span>
        {tag && <span className="shrink-0 text-xs text-dim">{tag}</span>}
      </div>
      {children !== undefined && <div className={`mt-1 text-xs leading-snug text-dim ${icon ? 'pl-[30px]' : ''}`}>{children}</div>}
    </button>
  )
}

/** The number of a step of the form, before its title. */
function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <span className="flex items-center gap-3">
      <span className="num flex h-6 w-6 items-center justify-center border border-line2 text-xs text-dim">{n}</span>
      {children}
    </span>
  )
}

/** A line of a form: what it is at the left, the control at the right. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-h-10 items-center justify-between gap-4">
      <span className="shrink-0 text-sm text-dim">{label}</span>
      {children}
    </label>
  )
}

const GROWTH = { guided: 'Start small', open: 'Everything open' } as const

export function NewGame() {
  const { begin, setScreen } = useStore.getState()
  const [cfg, setCfg] = useState<GameConfig>(() => {
    const era = ERAS.find((e) => e.recommended) ?? eraInfo()
    return { ...defaultConfig(), startType: 'phone', progression: 'guided', startYear: era.year, techLevel: era.techLevel, seed: Math.floor(Math.random() * 99999) + 1 }
  })
  const year = cfg.startYear ?? eraInfo().year
  const startTypes = startTypesIn(year)
  const up = (patch: Partial<GameConfig>) => setCfg((c) => ({ ...c, ...patch }))
  const d = DIFFICULTY[cfg.difficulty]
  const name = cfg.companyName.trim()
  const growth = cfg.progression === 'guided' ? 'guided' : 'open'
  const found = () => {
    if (!name) return
    sfx.confirm()
    begin({ ...cfg, companyName: name })
  }
  const back = () => setScreen('menu')
  // Esc goes back to the menu; a dialog on top of the form (the feedback form) takes Esc first
  useLayer(true, back)
  const makes = cfg.startType === 'all' ? 'Every kind of device' : TYPES[cfg.startType ?? 'phone'].plural
  const summary: ReactNode[] = [`From ${year}`, makes, GROWTH[growth], DIFFICULTY[cfg.difficulty].label, cfg.unlimitedMoney ? 'Unlimited money' : <><span className="num text-fg">{money(cfg.startCash)}</span> to start</>]
  return (
    <div className="flex h-full flex-col bg-carbon">
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
        <div className="flex min-h-0 flex-col gap-8 border-r border-line bg-panel px-10 py-10">
          <Wordmark />
          <p className="text-sm leading-relaxed text-dim">{INTRO}</p>
        </div>
        <div className="min-h-0 overflow-y-auto px-10 py-8">
          <div className="mx-auto flex max-w-[980px] flex-col gap-8">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-6">
              <Section title={<Step n={1}>Your company</Step>}>
                <div className="flex flex-col gap-1 border border-line bg-panel px-4 py-3">
                  <Field label="Name">
                    <TextInput autoFocus aria-label="Company name" value={cfg.companyName} maxLength={18} onChange={(v) => up({ companyName: v })} onEnter={found} className={`min-w-0 flex-1 !h-9 !text-sm ${name ? '' : '!border-warn'}`} placeholder="Name your company" />
                  </Field>
                  <Field label="Brand colour">
                    <input type="color" aria-label="Brand colour" value={cfg.color} onChange={(e) => up({ color: e.target.value })} />
                  </Field>
                </div>
              </Section>
              <Section title={<Step n={2}>How it grows</Step>}>
                <div className="grid grid-cols-2 gap-3">
                  <Option on={growth === 'guided'} onClick={() => up({ progression: 'guided' })} icon="lock" name={GROWTH.guided} tag="Recommended">
                    A garage and a few desks, with a guide. Everything else opens as you grow.
                  </Option>
                  <Option on={growth === 'open'} onClick={() => up({ progression: 'open' })} icon="unlock" name={GROWTH.open}>
                    Every screen and lever from the first day. Nothing to earn.
                  </Option>
                </div>
              </Section>
            </div>

            <Section title={<Step n={3}>When it starts</Step>} sub="Technology, prices and the kinds of device on sale follow the year.">
              <div className="grid grid-cols-4 gap-2">
                {ERAS.map((e) => (
                  <Option key={e.year} big on={year === e.year} onClick={() => up({ startYear: e.year, techLevel: e.techLevel, startType: cfg.startType === 'all' || startTypesIn(e.year).includes(cfg.startType ?? 'phone') ? cfg.startType : 'phone' })} name={`${e.year}`} tag={e.recommended ? 'Recommended' : e.name}>
                    {e.blurb}
                  </Option>
                ))}
              </div>
            </Section>

            <Section title={<Step n={4}>What it makes first</Step>} sub="Other kinds of device open under Research as you grow.">
              <div className="grid grid-cols-4 gap-2">
                {startTypes.map((type) => (
                  <Option key={type} on={cfg.startType === type} onClick={() => up({ startType: type })} icon={typeIcon(type)} name={TYPES[type].plural}>
                    <span className="num">{segmentsOf(type).length}</span> markets{['console', 'handheld', 'speaker'].includes(type) ? ', slow start' : ''}
                  </Option>
                ))}
                <Option on={cfg.startType === 'all'} onClick={() => up({ startType: 'all' })} icon="overview" name="Everything">
                  Every line open
                </Option>
              </div>
            </Section>

            <Section title={<Step n={5}>Difficulty</Step>}>
              <div className="grid grid-cols-3 gap-3">
                {(Object.keys(DIFFICULTY) as Difficulty[]).map((k) => (
                  <Option key={k} big on={cfg.difficulty === k} onClick={() => up({ difficulty: k, startCash: DIFFICULTY[k].startCash })} name={DIFFICULTY[k].label} tag={`${money(DIFFICULTY[k].startCash)} to start`}>
                    {DIFFICULTY[k].blurb}
                  </Option>
                ))}
              </div>
            </Section>

            <Fold title="Advanced" icon="system" open={false} bodyClass="p-3">
              <div className="grid grid-cols-2 gap-x-8">
                <div>
                  <Head icon="campus" className="mb-1">
                    Company and world
                  </Head>
                  <div className="flex min-h-14 items-center justify-between gap-3">
                    <span className="text-[11px] text-dim">Logo</span>
                    <LogoPicker value={cfg.logo} onChange={(logo) => up({ logo })} />
                  </div>
                  <Choice label="Home market" value={cfg.home ?? 'na'} options={REGIONS.map((r) => ({ value: r.id, label: r.name }))} onChange={(home) => up({ home })} />
                  <label className="flex items-center justify-between gap-2 py-1" title="The same seed gives the same rivals and the same world">
                    <span className="text-[11px] text-dim">World seed</span>
                    <NumInput aria-label="World seed" value={cfg.seed} min={1} max={2147483647} onChange={(seed) => up({ seed })} onEnter={found} className="w-40" />
                  </label>
                  <label className="flex min-h-7 items-center gap-2 text-[11px] text-dim">
                    <input type="checkbox" className="accent-accent" checked={!!cfg.parody} onChange={(e) => up({ parody: e.target.checked })} />
                    Joke names for rival companies
                  </label>
                </div>
                <div>
                  <Head icon="gauge" className="mb-1">
                    Custom rules
                  </Head>
                  <Slider label="Starting cash" value={Math.log10(cfg.startCash)} min={logMin} max={logMax} step={0.02} format={() => (cfg.unlimitedMoney ? 'Unlimited' : money(cfg.startCash))} onChange={(v) => up({ startCash: Math.round(Math.pow(10, v) / 1e5) * 1e5 })} disabled={cfg.unlimitedMoney} hint={cfg.unlimitedMoney ? 'Unlimited money is on, so starting cash does not matter' : undefined} />
                  <Slider label="Research speed" value={cfg.researchSpeed} min={0.5} max={4} step={0.25} format={(v) => pct(v, 0)} onChange={(v) => up({ researchSpeed: v })} />
                  <Slider label="Rival strength" value={cfg.rivalStrength} min={0.5} max={1.5} step={0.05} format={(v) => pct(v, 0)} onChange={(v) => up({ rivalStrength: v })} hint="Raises or lowers the tech level rivals build with" />
                  <Slider label="Starting tech level" value={cfg.techLevel} min={0} max={4} step={1} onChange={(v) => up({ techLevel: v })} hint="The level every technology track starts at. Leading rivals start around level 3." />
                  <label className="flex min-h-7 items-center gap-2 text-[11px] text-dim">
                    <input type="checkbox" className="accent-accent" checked={cfg.unlimitedMoney} onChange={(e) => up({ unlimitedMoney: e.target.checked })} />
                    Unlimited money (no bankruptcy; research still takes time)
                  </label>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-8 border-t border-line pt-3">
                <div>
                  <Head icon="gauge" className="mb-1">
                    What {d.label} sets
                  </Head>
                  <Row k="Overdraft" v={money(d.overdraft)} />
                  <Row k="Days in debt allowed" v={d.debtDays} />
                  <Row k="Overhead" v={pct(d.overhead, 0)} />
                  <Row k="Brand growth" v={pct(d.awareness, 0)} />
                </div>
                <div>
                  <Head icon="research" className="mb-1">
                    Technology you start with
                  </Head>
                  {TRACKS.map((t) => (
                    <Row key={t} icon={trackIcon(t)} k={TRACK_INFO[t].name} v={<span className="font-sans">{TRACK_INFO[t].unlocks[cfg.techLevel]}</span>} />
                  ))}
                </div>
              </div>
            </Fold>
          </div>
        </div>
      </div>
      <footer className="flex h-16 shrink-0 items-center gap-4 border-t border-line2 bg-panel px-6">
        <Btn tone="ghost" large icon="arrowLeft" title="Back to the main menu (Esc)" onClick={back}>
          Back
        </Btn>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-3 overflow-hidden whitespace-nowrap text-sm text-dim" aria-label="What you are about to start">
          <span className={`min-w-0 truncate font-semibold ${name ? 'text-fg' : 'text-warn'}`}>{name || 'No name yet'}</span>
          {summary.map((part, i) => (
            <span key={i} className="flex shrink-0 items-center gap-3">
              <span aria-hidden className="h-3 w-px bg-line2" />
              <span>{part}</span>
            </span>
          ))}
        </div>
        <Btn tone="primary" large icon="arrowRight" className="w-56 shrink-0" disabled={!name} title={name ? 'Start the game (Enter in the name field does the same)' : 'Give the company a name first'} onClick={found}>
          Found company
        </Btn>
      </footer>
    </div>
  )
}
