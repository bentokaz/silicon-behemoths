// Research, page "Labs", operating system: the systems that can be licensed, and the designer for the look of the
// company's own system, with a live preview of the screen of every kind of device it runs on (a phone, a tablet, a
// computer, a watch, a television, a console, a handheld, an e-reader, a smart display), home or lock screen,
// painted by paintOsLook (src/3d/osLook.ts): the same painting the devices' screens show in 3D.
import { useEffect, useRef, useState } from 'react'
import { sfx } from '../audio/sfx'
import { OS_SCREEN_NAMES, type OsScreen, motionPeriod, paintOsLook } from '../3d/osLook'
import { yearAt } from '../data/eras'
import { canAfford, setOsLicence, setOsLook } from '../sim/game'
import { DEFAULT_OS_LOOK, OS_LICENCES, OS_LOOK_CHOICES, OS_WIDGETS, cleanLook, lookFor, industryOs, licenceBlocked, licenceInfo, licenceOpen, licenceSwitchCost } from '../sim/tech'
import type { OsLook } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Btn, Choice, ColorField, Filters, Fold, Help, Panel, Row, Tag, int, money, reducedMotion, useKept } from './ui'

/** Size of the preview of each kind of screen, in CSS pixels, and the bezel round it. */
const PREVIEW: Record<OsScreen, { w: number; h: number; bezel: number; round: number }> = {
  phone: { w: 176, h: 370, bezel: 6, round: 22 },
  tablet: { w: 380, h: 270, bezel: 9, round: 14 },
  desktop: { w: 440, h: 275, bezel: 7, round: 3 },
  watch: { w: 168, h: 200, bezel: 10, round: 40 },
  tv: { w: 440, h: 248, bezel: 4, round: 2 },
  console: { w: 440, h: 248, bezel: 4, round: 2 },
  handheld: { w: 360, h: 203, bezel: 8, round: 6 },
  ereader: { w: 230, h: 306, bezel: 14, round: 6 },
  display: { w: 380, h: 238, bezel: 10, round: 8 },
}
const KINDS = Object.keys(PREVIEW) as OsScreen[]
const ANIMATED: OsLook['wallStyle'][] = ['aurora', 'waves', 'grid', 'rings']

/** A screen showing a look, repainted whenever the look changes, and moving at the look's speed. */
export function OsPreview({ look, kind = 'phone', screen = 'home', scale = 1 }: { look: OsLook; kind?: OsScreen; screen?: 'home' | 'lock'; scale?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const size = PREVIEW[kind]
  const width = Math.round(size.w * scale)
  const height = Math.round(size.h * scale)
  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const k = Math.min(2, window.devicePixelRatio || 1)
    c.width = width * k
    c.height = height * k
    const period = motionPeriod(look)
    const moves = period > 0 && !reducedMotion() && (ANIMATED.includes(cleanLook(look).wallStyle) || cleanLook(look).lock === 'analog')
    let frame = 0
    const start = performance.now()
    const paint = (now: number) => {
      ctx.setTransform(k, 0, 0, k, 0, 0)
      ctx.clearRect(0, 0, width, height)
      paintOsLook(ctx, look, width, height, kind, screen, moves ? (now - start) / 1000 / period : 0)
      if (moves) frame = requestAnimationFrame(paint)
    }
    paint(start)
    return () => cancelAnimationFrame(frame)
  }, [look, kind, screen, width, height])
  return (
    <canvas
      ref={ref}
      role="img"
      aria-label={`${OS_SCREEN_NAMES[kind]} ${screen === 'lock' ? 'lock' : 'home'} screen preview`}
      style={{ width: width + size.bezel * 2, height: height + size.bezel * 2, borderWidth: size.bezel, borderRadius: kind === 'watch' ? size.round : 0 }}
      className="block border-solid border-[#0b0c0e] bg-carbon"
    />
  )
}

const NAMES: Record<string, string> = {
  solid: 'One colour', linear: 'Linear gradient', radial: 'Glow', aurora: 'Aurora', waves: 'Waves', grid: 'Grid', dots: 'Halftone dots', rings: 'Rings', facets: 'Low-poly facets',
  circle: 'Circle', squircle: 'Squircle', square: 'Square', hexagon: 'Hexagon', leaf: 'Leaf',
  small: 'Small', medium: 'Medium', large: 'Large',
  filled: 'Filled', outline: 'Outline', glyph: 'Glyph only', duotone: 'Duotone',
  bottom: 'Bottom', top: 'Top', left: 'Left', right: 'Right', none: 'Floating',
  grid_: 'Grid', list: 'List', tiles: 'Live tiles',
  sans: 'Sans', mono: 'Mono', serif: 'Serif', rounded: 'Rounded', condensed: 'Condensed',
  light: 'Light', regular: 'Regular', bold: 'Bold',
  big: 'Big clock', stacked: 'Stacked hours', analog: 'Analogue', minimal: 'Minimal',
  off: 'Off', calm: 'Calm', normal: 'Normal', brisk: 'Brisk',
  sharp: 'Sharp', soft: 'Soft', round: 'Round',
  digital: 'Digital', analog_: 'Hands', rings_: 'Activity rings', modular: 'Modular',
  wide: 'Wide cards', posters: 'Posters', icons: 'Round icons',
  full: 'Edge to edge', floating: 'Floating', centred: 'Centred apps',
}
/** What the dock is on each kind of screen. */
const DOCK_LABEL: Partial<Record<OsScreen, string>> = { phone: 'Dock', tablet: 'Dock', desktop: 'Taskbar edge', tv: 'Home row', console: 'Home row', handheld: 'Quick buttons', ereader: 'Toolbar', display: 'App row' }
const nameOf = (k: string, v: string) => (k === 'layout' && v === 'grid' ? NAMES.grid_ : k === 'watchFace' && (v === 'analog' || v === 'rings') ? NAMES[`${v}_`] : (NAMES[v] ?? v))

/** Wallpaper presets: two colours and how they are drawn. Gradients belong to the system's artwork, not the game's. */
const WALL_PRESETS: { name: string; look: Partial<OsLook> }[] = [
  { name: 'Harbour', look: { wallpaper: '#1d4f7a', wallpaper2: '#0a1018', wallStyle: 'radial' } },
  { name: 'Ember', look: { wallpaper: '#ff7a3d', wallpaper2: '#3b0d2e', wallStyle: 'linear' } },
  { name: 'Lagoon', look: { wallpaper: '#2fd6c5', wallpaper2: '#0b2a4a', wallStyle: 'waves' } },
  { name: 'Polar', look: { wallpaper: '#5df2a6', wallpaper2: '#060c1c', wallStyle: 'aurora' } },
  { name: 'Dune', look: { wallpaper: '#f0c27b', wallpaper2: '#4b1248', wallStyle: 'facets' } },
  { name: 'Paper', look: { wallpaper: '#ece8df', wallpaper2: '#cfc9bb', wallStyle: 'dots' } },
  { name: 'Circuit', look: { wallpaper: '#12233b', wallpaper2: '#05070c', wallStyle: 'grid' } },
  { name: 'Orbit', look: { wallpaper: '#8e6cf0', wallpaper2: '#120a2a', wallStyle: 'rings' } },
]
const SWATCHES = ['#16324a', '#0a1018', '#ff8a3d', '#ff4d6d', '#34c77b', '#2f9bf0', '#8e6cf0', '#f5d43c', '#ece8df', '#10141b', '#ffffff', '#000000']

/** The look of the company's own system: every choice changes the preview at once. */
export function OsLookDesigner() {
  const g = useGame()
  const { act } = useStore.getState()
  const base = cleanLook(g.os.look)
  const [kind, setKind] = useKept<OsScreen>('os-preview-kind', 'phone')
  const [screen, setScreen] = useState<'home' | 'lock'>('home')
  const shown = KINDS.includes(kind) ? kind : 'phone'
  // a kind of screen with a look of its own is edited on its own: every control below then changes that kind only
  const own = !!base.kinds[shown]
  const look = own ? lookFor(base, shown) : base
  const setBase = (patch: Partial<OsLook>) => act((s) => setOsLook(s, patch))
  const setKinds = (kinds: OsLook['kinds']) => act((s) => setOsLook(s, { kinds }))
  const set = (patch: Partial<OsLook>) => (own ? setKinds({ ...base.kinds, [shown]: { ...base.kinds[shown], ...patch } }) : setBase(patch))
  const choice = <K extends keyof typeof OS_LOOK_CHOICES>(k: K, label: string) => (
    <Choice label={label} value={look[k] as string} options={(OS_LOOK_CHOICES[k] as readonly string[]).map((v) => ({ value: v, label: nameOf(k, v) }))} onChange={(v) => set({ [k]: v } as Partial<OsLook>)} />
  )
  const colour = (k: 'wallpaper' | 'wallpaper2' | 'accent' | 'surface', label: string) => (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-dim">{label}</span>
      <ColorField label={label} showHex value={look[k]} presets={SWATCHES} onChange={(v) => set({ [k]: v })} />
    </label>
  )
  const toggleWidget = (id: string) => set({ widgets: look.widgets.includes(id) ? look.widgets.filter((w) => w !== id) : [...look.widgets, id].slice(0, 4) })
  const kindName = OS_SCREEN_NAMES[shown].toLowerCase()
  const others = KINDS.filter((k) => k !== shown && base.kinds[k]).map((k) => OS_SCREEN_NAMES[k])
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-2">
      <Panel
        title={`Design ${g.os.own ? g.os.name : 'your system'}`}
        icon="design"
        bodyClass="overflow-y-auto px-3 py-2"
        right={
          <>
            <Btn small icon="refresh" title="Back to the default look" onClick={() => set(DEFAULT_OS_LOOK)}>
              Reset
            </Btn>
            <Help title="The look of your system">How your own operating system looks on the screens of everything you sell that has one: phones, tablets and foldables, laptops and desktops, watches, televisions, consoles and handhelds, e-readers and smart displays. Each kind of screen gets its own interface in the same look. {g.os.own ? '' : 'It is shown once your devices run your own system.'}</Help>
          </>
        }
      >
        <Fold title={`${OS_SCREEN_NAMES[shown]} screen`} icon="phone" keep="os-kind" bodyClass="pb-2">
          <Choice
            label="Look"
            value={own ? 'own' : 'shared'}
            options={[{ value: 'shared', label: 'Shared look' }, { value: 'own', label: `Customise for the ${kindName}` }]}
            onChange={(v) => {
              if (v === 'own') setKinds({ ...base.kinds, [shown]: { accent: base.accent } })
              else {
                const next = { ...base.kinds }
                delete next[shown]
                setKinds(next)
              }
            }}
          />
          <div className="pb-1 text-[11px] leading-snug text-faint">
            {own ? `Every choice below now changes the ${kindName} only; the other screens keep the shared look.` : `The ${kindName} shows the shared look. Customise it to give this kind of screen choices of its own.`}
            {others.length > 0 && ` Set apart: ${others.join(', ')}.`}
          </div>
          {shown === 'watch' && choice('watchFace', 'Watch face')}
          {(shown === 'tv' || shown === 'console') && choice('tvRow', 'Home row tiles')}
          {shown === 'desktop' && choice('taskbar', 'Taskbar')}
        </Fold>
        <Fold title="Theme" icon="design" keep="os-theme" bodyClass="pb-2">
          <Choice label="Panels" value={look.dark ? 'dark' : 'light'} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} onChange={(v) => set({ dark: v === 'dark' })} />
          {colour('accent', 'Accent')}
          {colour('surface', 'Panels and dock')}
          {choice('corners', 'Corners')}
        </Fold>
        <Fold title="Wallpaper" icon="look" keep="os-wall" bodyClass="pb-2">
          {choice('wallStyle', 'Style')}
          {colour('wallpaper', 'First colour')}
          {look.wallStyle !== 'solid' && colour('wallpaper2', 'Second colour')}
          <div className="mt-1 text-[11px] text-faint">Presets</div>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {WALL_PRESETS.map((w) => (
              <button key={w.name} type="button" title={w.name} onClick={() => set(w.look)} className="flex flex-col items-stretch gap-[3px] border border-line2 p-[3px] text-left hover:border-fg">
                <span aria-hidden className="h-6" style={{ background: w.look.wallStyle === 'solid' ? w.look.wallpaper : `linear-gradient(135deg, ${w.look.wallpaper}, ${w.look.wallpaper2})` }} />
                <span className="truncate text-[11px] text-dim">{w.name}</span>
              </button>
            ))}
          </div>
        </Fold>
        <Fold title="Icons" icon="fill" keep="os-icons" bodyClass="pb-2">
          {choice('iconShape', 'Shape')}
          {choice('iconSize', 'Size')}
          {choice('iconStyle', 'Style')}
        </Fold>
        <Fold title="Home screen" icon="home" keep="os-home" bodyClass="pb-2">
          {choice('layout', 'Apps')}
          {shown !== 'watch' && choice('dock', DOCK_LABEL[shown] ?? 'Dock and taskbar')}
          <div className="mt-1 text-xs text-dim">Widgets, up to four</div>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {OS_WIDGETS.map((w) => {
              const on = look.widgets.includes(w.id)
              return (
                <button key={w.id} type="button" role="checkbox" aria-checked={on} disabled={!on && look.widgets.length >= 4} onClick={() => toggleWidget(w.id)} className={`h-7 border px-2 text-left text-[11px] disabled:opacity-40 ${on ? 'border-accent bg-accent/10 text-accent' : 'border-line2 text-dim hover:border-fg'}`}>
                  {w.name}
                </button>
              )
            })}
          </div>
        </Fold>
        <Fold title="Type" icon="doc" keep="os-type" bodyClass="pb-2">
          {choice('font', 'Typeface')}
          {choice('weight', 'Weight')}
        </Fold>
        <Fold title="Lock screen" icon="lock" keep="os-lock" bodyClass="pb-2">
          {choice('lock', 'Clock')}
          <Choice label="Notifications" value={look.lockNotes ? 'show' : 'hide'} options={[{ value: 'show', label: 'Shown' }, { value: 'hide', label: 'Hidden' }]} onChange={(v) => set({ lockNotes: v === 'show' })} />
        </Fold>
        <Fold title="Motion" icon="play" keep="os-motion" bodyClass="pb-2">
          {choice('motion', 'Animation speed')}
          <div className="text-[11px] leading-snug text-faint">How fast the system moves: the moving wallpapers and the analogue clock in the preview run at this speed.</div>
        </Fold>
      </Panel>
      <Panel
        title="Preview"
        icon="phone"
        bodyClass="flex min-h-0 flex-col gap-2 overflow-y-auto p-3"
        right={<Filters label="Screen" value={screen} options={[{ value: 'home', label: 'Home' }, { value: 'lock', label: 'Lock' }]} onChange={setScreen} />}
      >
        <div className="flex flex-wrap gap-1">
          <Filters label="Device" value={shown} options={KINDS.map((k) => ({ value: k, label: OS_SCREEN_NAMES[k] }))} onChange={setKind} />
        </div>
        <div className="flex flex-1 items-center justify-center py-2">
          <OsPreview look={look} kind={shown} screen={screen} />
        </div>
      </Panel>
    </div>
  )
}

/** The systems on offer to license, with what each costs and how it compares. */
export function OsLicences() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const current = g.os.own ? null : licenceInfo(g.os.licence)
  const year = Math.floor(yearAt(g.day))
  const shown = OS_LICENCES.filter((l) => l.from <= year + 3 && (l.until === undefined || l.until >= year - 2))
  return (
    <Panel
      title="Licensed systems"
      icon="os"
      bodyClass="overflow-y-auto"
      right={<Help title="Licensing a system">Until you build your own, your devices run a licensed system. The free one is weak and costs sales; better ones charge a royalty on every device that runs them (not consoles, earbuds or speakers). Quality is against what buyers expect of a system today: above it lifts every device you sell and its reviews, below it drags them down. Systems are discontinued in time and age after that.</Help>}
    >
      {shown.map((l) => {
        const open = licenceOpen(l, g.day)
        const cost = licenceSwitchCost(l)
        const blocked = licenceBlocked(g, l.id) ?? (!canAfford(g, cost) ? `Not enough cash: ${money(cost)} is needed` : null)
        const on = current?.id === l.id
        return (
          <div key={l.id} className="flex items-center gap-3 border-b border-line px-3 py-[6px] last:border-0">
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-fg">
                {l.name} {on && <Tag tone="accent">Running</Tag>} {!open && <Tag tone="dim">{year < l.from ? `From ${l.from}` : 'Discontinued'}</Tag>}
              </span>
              <span className="block text-[11px] leading-snug text-dim">
                From {l.vendor}. {l.note}
              </span>
            </span>
            <span className="num w-14 shrink-0 text-right text-[11px]" title="Quality against what buyers expect today">
              <span className={l.quality >= 0 ? 'text-pos' : 'text-neg'}>
                {l.quality >= 0 ? '+' : ''}
                {int(l.quality)}
              </span>
            </span>
            <span className="num w-20 shrink-0 text-right text-[11px] text-dim" title="Royalty per device sold">
              {l.royalty ? `${money(l.royalty)}/unit` : 'Free'}
            </span>
            {!on && !g.os.own && (
              <Btn
                small
                disabled={!!blocked}
                title={blocked ?? (cost ? `Moving every device over costs ${money(cost)}` : undefined)}
                onClick={() => {
                  const err = act((s) => setOsLicence(s, l.id))
                  if (err) say(err, 'bad')
                  else (sfx.confirm(), say(`Your devices now run ${l.name}.`))
                }}
              >
                Switch{cost ? ` (${money(cost)})` : ''}
              </Btn>
            )}
          </div>
        )
      })}
      <div className="px-3 py-2">
        <Row k="Buyers expect a system of quality" v={int(industryOs(g.day))} />
      </div>
    </Panel>
  )
}
