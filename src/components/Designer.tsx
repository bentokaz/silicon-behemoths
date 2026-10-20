// The device designer. The 3D studio fills the screen above a one-line strip
// (how the model is looked at, and the way on to the launch plan); the tools
// are a row along the top and a drawer at each side that opens when asked for.
// The launch plan itself is in DesignerPlan.tsx.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DeviceView, type ViewName, fourthView } from '../3d/DeviceView'
import { osLookOf } from '../3d/osLook'
import { useStudio } from '../3d/studio'
import { CHARGE_W, CHIP_TIERS, EXTRAS, LENSES, MATERIALS, PANEL_NAMES, RAM_OPTIONS, REFRESH, SENSOR_NAMES, STORAGE_OPTIONS, chipInfo, marketLevel, sensorInfo, toggleExtra } from '../data/catalog'
import { CASE_FEET, CASE_FRONTS, CASE_SIDES, PSUS, RGB_EFFECTS, TOWER_FORM_NAMES, caseOf, coolersFor, maxFans, rgbOf, rgbZones, towerForm, ANC, COOLERS, DRIVERS, FLIP, FLIP_COVERS, GPUS, HEAD_STRAPS, HINGES, INPUT_NAMES, MIC_ARRAYS, OPTICS, SPEAKERS, SPEAKER_DRIVERS, STRAPS, TYPES, headStrap, inputOptions, ioOptions, segmentsOf, sizeLimits, standInfo, standsFor, subLabel } from '../data/devices'
import { devPlan, isVariantOf, player, productName } from '../sim/game'
import { canTurn, faceLabel, facesFor, faceSize, isCoverCam, isEdge, isFlip, kindsFor, partLabel, speakerShape } from '../sim/geometry'
import { layoutInternals, specShares, weightShares } from '../sim/internals'
import { unitCostParts } from '../sim/insight'
import { lockTip } from '../sim/progress'
import { appeal, bestSegment, normalised } from '../sim/market'
import { costNow, factoryLine } from '../sim/ops'
import { type FingerprintStyle, type FrontStyle, LAYOUT_NAMES, NO_REFRESH } from '../sim/rivals'
import { batteryLabel, chargeWatts, evaluate, foldedThickness, lifeLabel, minBezel, minThickness, panelName, selfieMinDia, thermal } from '../sim/scoring'
import { type Colorway, DEVICE_TYPES, type DeviceType, type Face, type Lens, type PlacedPart, SUBS, type Track } from '../sim/types'
import { hasType } from '../sim/world'
import { useGame, useStore } from '../store/game'
import { LaunchPlan, type LaunchState, MarginRow } from './DesignerPlan'
import { FeatureList } from './FeatureList'
import { PART_NOTES, featurePart } from '../data/featureParts'
import { MAX_PRICE } from './format'
import { Icon, typeIcon } from './icons'
import { Btn, Choice, ColorField, ConfirmBtn,IconBtn, Key, Legend, Meter, Mini, NumInput, Row, Slider, Tabs, Tag, TextInput, modalOpen, money, pct, pressable, price, useKept, useLayer } from './ui'

const SWATCHES = ['#17191d', '#2b2f36', '#5b6470', '#c9ccd1', '#ecebe6', '#c8b89a', '#2e4a3c', '#2f4f73', '#8c2f39', '#d98a3d']
const GLOWS = ['#ffffff', '#5ab4ff', '#8dffa8', '#ff5a4a', '#ffb347', '#c78bff']
const mm = (v: number) => `${v.toFixed(1)} mm`
/** Sizes of large devices read better without decimals. */
const mmFor = (type: DeviceType) => (type === 'tv' || type === 'desktop' || type === 'monitor' || type === 'tower' || type === 'console' || type === 'headset' || type === 'speaker' || type === 'drone' ? (v: number) => `${Math.round(v)} mm` : mm)
const grams = (g: number) => (g >= 2000 ? `${(g / 1000).toFixed(1)} kg` : `${Math.round(g)} g`)
/** What the two body materials are called on each device type: [frame, back]. */
const SHELL_NAMES: Partial<Record<DeviceType, [string, string]>> = { tower: ['Chassis', 'Front panel'], monitor: ['Frame and stand', 'Back'], mouse: ['Shell', 'Underside'], laptop: ['Shell', 'Lid'], desktop: ['Shell and stand', 'Back and chin'], console: ['Shell', 'Front panel'], tv: ['Frame and stand', 'Back'], earbuds: ['Hinge and trim', 'Case and buds'], headset: ['Shell and band', 'Front plate'], speaker: ['Top and trim', 'Fabric'], handheld: ['Shell', 'Front plate'], ring: ['Band', 'Inner sleeve'], actioncam: ['Housing', 'Lens side'], drone: ['Body and arms', 'Top shell'] }
/** Where the simple editor puts the logo. */
const LOGO_PLACE: Partial<Record<DeviceType, string>> = { tower: 'front panel', monitor: 'back, and below the screen if the bezel has room', mouse: 'palm rest', laptop: 'lid', desktop: 'back, and on the chin if there is one', console: 'top, or the side of a tower', tv: 'back, and below the screen if the bezel allows', earbuds: 'front of the case', foldable: 'back, beside the cameras', headset: 'front of the visor', speaker: 'panel at the back', handheld: 'back, between the grips', ereader: 'back', ring: 'outside of the band, engraved', actioncam: 'left side', drone: 'top' }
/** What the body is called in the editor, where "chassis" does not fit. */
const BODY_NAMES: Partial<Record<DeviceType, string>> = { tower: 'Case size', mouse: 'Body', earbuds: 'Case', headset: 'Visor', speaker: 'Body', ring: 'Band', drone: 'Body' }
/** What the depth of the body costs and buys, for the types where the usual trade does not apply. */
const DEPTH_HINTS: Partial<Record<DeviceType, string>> = {
  tower: 'A deeper case takes longer graphics cards and radiators and holds more air, but is bigger on the desk',
  mouse: 'A longer mouse fills the hand and holds a bigger battery, but weighs more',
  earbuds: 'A slimmer case is easier to pocket but holds a smaller battery',
  foldable: 'Each half is this thick, so it closes to a little over twice that. Thinner scores better but leaves less room for the battery',
  headset: 'A slimmer visor sits closer to the face and is more comfortable, but holds a smaller battery. Simpler lenses need more depth',
  speaker: 'A bigger body holds more air, which means more bass, but takes up more of the shelf',
  handheld: 'Thinner scores better on design but leaves less room for the battery',
  ring: 'A thinner band is more comfortable and scores better on design, but holds a smaller cell',
  actioncam: 'A deeper body holds more battery for longer recording, but weighs more',
  drone: 'A longer body holds a bigger battery for longer flights, but spreads the arms and adds weight',
}
const storageLabel = (gb: number) => (gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`)

/** The label of an option that is stored in lower case. */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** A colour: a chip of what is chosen, which opens the swatches and the free picker in place. Once opened it stays open. */
function ColorPick({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useKept<boolean>(`designer:colour:${label}`, false)
  return (
    <div className="py-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-dim">{label}</span>
        <button type="button" aria-expanded={open} aria-label={`${label}: ${open ? 'hide the colours' : 'choose a colour'}`} title={open ? 'Hide the colours' : 'Choose a colour'} onClick={() => setOpen(!open)} className={`flex h-7 items-center gap-2 border px-2 text-xs ${open ? 'border-accent text-fg' : 'border-line2 text-dim hover:border-fg hover:text-fg'}`}>
          <span className="h-3 w-7 border border-line2" style={{ background: value }} />
          {open ? 'Done' : 'Change'}
        </button>
      </div>
      {open && (
        <div className="mt-1 flex items-center gap-[3px]">
          {SWATCHES.map((c) => (
            <button key={c} type="button" title={c} aria-label={`${label}: ${c}`} aria-pressed={value === c} onClick={() => onChange(c)} className={`h-6 flex-1 border ${value === c ? 'border-accent' : 'border-line2 hover:border-fg'}`} style={{ background: c }} />
          ))}
          <ColorField label={`${label}: any colour`} value={value} onChange={onChange} presets={SWATCHES} className="ml-1" />
        </div>
      )}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line px-3 pb-2 pt-1">
      <div className="label py-1">{title}</div>
      {children}
    </div>
  )
}

function Toggle<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11px] text-dim">{label}</span>
      <div className="flex">
        {options.map((o) => (
          <Btn key={o} small active={value === o} onClick={() => onChange(o)} className="-ml-px first:ml-0">
            {cap(o)}
          </Btn>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- body

/** A PC tower's form factor, side panel, front panel, fans and feet. */
function CaseGroups() {
  const d = useStore((s) => s.draft!)
  const { setBody } = useStore.getState()
  const b = d.body
  const pc = caseOf(b)
  const T = TYPES.tower
  const set = (patch: Partial<typeof pc>) => setBody({ pc: { ...pc, ...patch } })
  const sizes = T.sizes ?? []
  const fit = maxFans(b, pc.fanSize)
  const form = towerForm(b)
  return (
    <>
      <Group title="Form factor">
        <div className="grid grid-cols-3 gap-1">
          {sizes.map((z) => {
            const f = towerForm({ width: z.width, height: z.height, thickness: z.thickness ?? b.thickness })
            return (
              <Btn key={z.name} small active={form === f} title={`${z.width} x ${z.height} x ${z.thickness} mm`} onClick={() => setBody({ width: z.width, height: z.height, thickness: Math.max(z.thickness ?? b.thickness, minThickness('tower', 8, d.specs)) })}>
                {z.name}
              </Btn>
            )
          })}
        </div>
        <div className="mt-1 text-[11px] leading-snug text-faint">{TOWER_FORM_NAMES[form]}, {((b.width * b.height * b.thickness) / 1e6).toFixed(0)} L. A full tower takes the biggest parts and keeps them cool; small form factors and cubes are what compact buyers want, and a horizontal case lies under a television.</div>
      </Group>
      <Group title="Case">
        <Choice label="Side panel" value={pc.side} options={CASE_SIDES.map((x) => ({ value: x.id, label: `${x.name} (${money(x.cost)})` }))} onChange={(side) => set({ side })} />
        <Choice label="Front panel" value={pc.front} options={CASE_FRONTS.map((x) => ({ value: x.id, label: `${x.name} (${money(x.cost)})` }))} onChange={(front) => set({ front })} />
        <Slider label="Front fans" value={Math.min(pc.fans, fit)} min={0} max={Math.max(1, fit)} step={1} format={(v) => `${v}`} onChange={(fans) => set({ fans })} hint={`Up to ${fit} of this size fit behind the front`} />
        <Toggle label="Fan size" value={pc.fanSize === 140 ? '140 mm' : '120 mm'} options={['120 mm', '140 mm'] as const} onChange={(v) => set({ fanSize: v === '140 mm' ? 140 : 120, fans: Math.min(pc.fans, maxFans(b, v === '140 mm' ? 140 : 120)) })} />
        <Choice label="Feet" value={pc.feet} options={CASE_FEET.map((x) => ({ value: x.id, label: `${x.name} (${money(x.cost)})` }))} onChange={(feet) => set({ feet })} />
        <div className="text-[11px] leading-snug text-faint">Glass shows off the parts and their lighting, which gamers pay for; mesh breathes best. A closed front starves the fans of air.</div>
      </Group>
    </>
  )
}

/** RGB lighting: the zones that light, their colours and how they move. */
function LightingGroup() {
  const d = useStore((s) => s.draft!)
  const { setBody } = useStore.getState()
  const l = rgbOf(d.body)
  const zones = rgbZones(d.type)
  const set = (patch: Partial<typeof l>) => setBody({ rgb: { ...l, ...patch } })
  return (
    <Group title="RGB lighting">
      <Choice label="Effect" value={l.effect} options={RGB_EFFECTS.map((x) => ({ value: x.id, label: x.name }))} onChange={(effect) => set({ effect, zones: effect !== 'off' && !l.zones.length ? zones.slice(0, 2).map((z) => z.id) : l.zones })} />
      {l.effect !== 'off' && (
        <>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {zones.map((z) => {
              const on = l.zones.includes(z.id)
              return (
                <button key={z.id} type="button" role="checkbox" aria-checked={on} onClick={() => set({ zones: on ? l.zones.filter((x) => x !== z.id) : [...l.zones, z.id] })} className={`flex h-7 items-center justify-between border px-2 text-left text-[11px] ${on ? 'border-accent bg-accent/10 text-accent' : 'border-line2 text-dim hover:border-fg'}`}>
                  <span className="truncate">{z.name}</span>
                  <span className="num shrink-0 text-faint">{money(z.cost)}</span>
                </button>
              )
            })}
          </div>
          <ColorPick label="Colour" value={l.color} onChange={(color) => set({ color })} />
          {(l.effect === 'wave' || l.effect === 'cycle') && <ColorPick label="Second colour" value={l.color2} onChange={(color2) => set({ color2 })} />}
        </>
      )}
      <div className="text-[11px] leading-snug text-faint">Gamers want it, the more the better; professionals and office buyers would rather have none, and a rainbow puts them off.</div>
    </Group>
  )
}

function BodyPanel({ simple }: { simple: boolean }) {
  const g = useGame()
  const d = useStore((s) => s.draft!)
  const body = d.body
  const { setBody, setDraft } = useStore.getState()
  const type = d.type
  const T = TYPES[type]
  const minBez = minBezel(type, g.levels.design)
  const minThick = minThickness(type, g.levels.design, d.specs)
  const oneShell = !!T.oneShell
  const size = mmFor(type)
  const [dimW, dimH, dimT] = T.dims ?? ['Width', 'Height', 'Thickness']
  const [frameName, backName] = SHELL_NAMES[type] ?? ['Frame', 'Back']
  // an earbud case is moulded or machined in one of the all-round materials
  const mats = (use: 'frame' | 'back') =>
    MATERIALS.filter((m) => (type === 'earbuds' && use === 'back' ? m.use === 'both' : m.use === use || m.use === 'both' || (oneShell && m.use === 'frame'))).map((m) => ({ value: m.id, label: m.name, locked: m.level > g.levels.materials }))
  const lim = sizeLimits(type, body.fold)
  const sizes = T.sizes ?? [0.12, 0.42, 0.7, 0.95].map((f, i) => ({ name: ['Compact', 'Standard', 'Large', 'Max'][i], width: Math.round(lim.width[0] + (lim.width[1] - lim.width[0]) * f), height: Math.round(lim.height[0] + (lim.height[1] - lim.height[0]) * f), thickness: undefined as number | undefined }))
  /** Changing how a foldable folds changes its whole shape, so it starts from that form's usual size and its parts are laid out afresh. */
  const setFold = (fold: 'book' | 'flip') => {
    if ((body.fold ?? 'book') === fold) return
    const to = fold === 'flip' ? FLIP : TYPES.foldable
    setBody({ fold, width: to.width[2], height: to.height[2], cover: fold === 'flip' ? (body.cover ?? 1) : undefined })
    useStore.getState().setSimple({})
  }
  const sizeIndex = sizes.findIndex((z) => z.width === body.width && z.height === body.height)
  const pickSize = (i: number) => {
    const z = sizes[i]
    setBody({ width: z.width, height: z.height, ...(z.thickness ? { thickness: Math.max(z.thickness, minThick) } : {}) })
  }
  const maxCorner = type === 'watch' ? Math.min(body.width, body.height) / 2 : type === 'earbuds' ? body.thickness / 2 : type === 'console' || type === 'tower' ? Math.max(2, Math.min(40, Math.min(body.width, body.height) / 2 - 2)) : type === 'laptop' ? 20 : type === 'tv' || type === 'headset' ? 40 : type === 'speaker' ? Math.min(body.width, body.thickness) / 2 - 1 : 24
  const flank = T.flank ?? 0
  const coarse = type === 'console' || type === 'tower' || type === 'headset' || type === 'speaker'
  // a desktop's bottom bezel is its chin, set on its own; a laptop's and a TV's follow the sides
  const allSides = (v: number) => {
    if (type === 'laptop') return setBody({ bezelSide: v, bezelTop: Math.max(v, body.bezelTop > 5 ? 6 : v), bezelBottom: v * 2.2 })
    if (type === 'tv') return setBody({ bezelSide: v, bezelTop: v, bezelBottom: Math.round(v * 16) / 10 })
    if (type === 'desktop') return setBody({ bezelSide: v, bezelTop: v, bezelBottom: body.bezelBottom > body.bezelSide + 0.01 ? Math.max(v, body.bezelBottom) : v })
    // a handheld's side bezels also hold its controls
    setBody({ bezelSide: v + flank, bezelTop: v, bezelBottom: v })
  }
  return (
    <>
      <Group title={BODY_NAMES[type] ?? 'Chassis'}>
        {simple ? (
          <Choice label="Size" value={sizeIndex} options={[...(sizeIndex < 0 ? [{ value: -1, label: `Custom (${body.width} x ${body.height} mm)` }] : []), ...sizes.map((z, i) => ({ value: i, label: `${z.name} (${z.width} x ${z.height} mm)` }))]} onChange={(i) => i >= 0 && pickSize(i)} />
        ) : (
          <>
            <Slider label={dimW} value={body.width} min={lim.width[0]} max={lim.width[1]} step={0.5} format={size} onChange={(v) => setBody({ width: v })} />
            <Slider label={dimH} value={body.height} min={lim.height[0]} max={lim.height[1]} step={0.5} format={size} onChange={(v) => setBody({ height: v })} />
          </>
        )}
        <Slider
          label={dimT}
          value={Math.max(body.thickness, minThick)}
          min={minThick}
          max={T.maxThickness}
          step={coarse ? 1 : 0.1}
          format={size}
          onChange={(v) => setBody({ thickness: v })}
          hint={DEPTH_HINTS[type] ?? (T.mains ? 'A slimmer body scores better on design but has less room for cooling and speakers' : 'Thinner scores better on design but leaves less room for the battery')}
        />
        {(type !== 'speaker' || body.form === 'block') && <Slider label={type === 'earbuds' ? 'Roundness' : 'Corner radius'} value={Math.min(body.corner, maxCorner)} min={type === 'earbuds' ? 2 : 0} max={maxCorner} step={0.5} format={mm} onChange={(v) => setBody({ corner: v })} />}
        {(type !== 'speaker' || body.form !== 'orb') && <Toggle label={type === 'earbuds' ? 'Top and bottom' : type === 'speaker' ? 'Top edge' : 'Edge profile'} value={body.edge} options={['flat', 'round'] as const} onChange={(edge) => setBody({ edge })} />}
      </Group>
      {type === 'foldable' && (
        <Group title="Fold">
          <Toggle label="Form" value={body.fold ?? 'book'} options={['book', 'flip'] as const} onChange={setFold} />
          {isFlip(body) && <Choice label="Cover screen" value={body.cover ?? 1} options={FLIP_COVERS.map((x, i) => ({ value: i, label: x.name }))} onChange={(v) => (setBody({ cover: v }), useStore.getState().setSimple({}))} />}
          <div className="text-[11px] leading-snug text-faint">{isFlip(body) ? 'A flip is a tall phone that folds in half across the middle. Its cameras and its cover screen share the outside of the upper half; a larger cover screen costs more and uses a little more power.' : 'A book opens sideways to a screen the size of a small tablet, with a full cover screen on the outside.'}</div>
        </Group>
      )}
      {type === 'speaker' && (
        <Group title="Shape">
          <Toggle label="Form" value={body.form ?? 'column'} options={['column', 'orb', 'block'] as const} onChange={(form) => setBody({ form })} />
          <label className="flex items-center py-1 text-[11px]">
            <input type="checkbox" className="mr-2 accent-accent" checked={!!body.screen} onChange={(e) => setBody({ screen: e.target.checked })} />
            Touch screen in the front
          </label>
          <div className="text-[11px] leading-snug text-faint">A screen lets the assistant show its answers, and buyers of smart displays expect one. It is as large as the flat front allows, so a wider body gives a bigger screen. The panel is chosen under Internals.</div>
        </Group>
      )}
      {!T.noScreen && (
        <Group title="Screen bezels">
          {simple ? (
            <>
              <Slider label={type === 'desktop' ? 'Top and sides' : flank ? 'Around the screen' : 'All sides'} value={Math.max(minBez, body.bezelSide - flank)} min={minBez} max={minBez * 6 + 2} step={0.05} format={mm} onChange={allSides} />
              {type === 'desktop' && <Slider label="Chin" value={body.bezelBottom} min={minBez} max={90} step={0.5} format={mm} onChange={(v) => setBody({ bezelBottom: v })} hint="A chin below the screen gives the computer room in a thin body, at the cost of screen-to-body ratio" />}
            </>
          ) : (
            <>
              <Slider label="Top" value={body.bezelTop} min={minBez} max={minBez * 8 + 6} step={0.05} format={mm} onChange={(v) => setBody({ bezelTop: v })} />
              <Slider label={type === 'desktop' ? 'Bottom (chin)' : 'Bottom'} value={body.bezelBottom} min={minBez} max={type === 'desktop' ? 90 : minBez * 8 + 10} step={0.05} format={mm} onChange={(v) => setBody({ bezelBottom: v })} />
              <Slider label={flank ? 'Sides, with the controls' : 'Sides'} value={body.bezelSide} min={minBez + flank} max={minBez * 6 + 4 + flank} step={0.05} format={mm} onChange={(v) => setBody({ bezelSide: v })} />
            </>
          )}
          <div className="text-[11px] text-faint">
            Minimum {minBez} mm at Industrial design level {g.levels.design}
            {flank ? `, plus ${flank} mm each side for the controls` : ''}
          </div>
          {type === 'foldable' && <div className="mt-1 text-[11px] leading-snug text-faint">{isFlip(body) ? 'Use the Shut button under the model to see it folded.' : 'The cover screen on the outside follows the side bezel. Use the Shut button under the model to see it.'}</div>}
        </Group>
      )}
      <Group title={frameName}>
        <Choice label="Material" value={body.frameMat} options={mats('frame')} onChange={(v) => setBody(oneShell ? { frameMat: v, backMat: v } : { frameMat: v })} />
        <ColorPick label="Colour" value={body.frameColor} onChange={(v) => setBody({ frameColor: v })} />
      </Group>
      <Group title={backName}>
        {!oneShell && <Choice label="Material" value={body.backMat} options={mats('back')} onChange={(v) => setBody({ backMat: v })} />}
        <ColorPick label="Colour" value={body.backColor} onChange={(v) => setBody({ backColor: v })} />
        {type !== 'speaker' && <Toggle label="Finish" value={body.backFinish} options={['gloss', 'matte'] as const} onChange={(backFinish) => setBody({ backFinish })} />}
      </Group>
      {type === 'headset' && (
        <Group title="Head strap">
          <Choice label="Style" value={headStrap(body.strap).id} options={HEAD_STRAPS.map((s) => ({ value: s.id, label: `${s.name} (${money(s.cost)})`, locked: s.level > g.levels.materials }))} onChange={(v) => setBody({ strap: v })} />
          <ColorPick label="Strap and cushions" value={body.strapColor ?? '#2f3237'} onChange={(v) => setBody({ strapColor: v })} />
          <div className="text-[11px] leading-snug text-faint">A rigid band spreads the weight. One with the battery at the back also balances the visor and holds half as much charge again.</div>
        </Group>
      )}
      {type === 'watch' && (
        <Group title="Strap">
          <Choice label="Material" value={body.strap ?? 'silicone'} options={STRAPS.map((s) => ({ value: s.id, label: `${s.name} (${money(s.cost)})`, locked: s.level > g.levels.materials }))} onChange={(v) => setBody({ strap: v })} />
          <ColorPick label="Colour" value={body.strapColor ?? '#1b1d21'} onChange={(v) => setBody({ strapColor: v })} />
        </Group>
      )}
      {standsFor(type).length > 0 && (
        <Group title="Stand">
          <Choice label="Style" value={standInfo(type, body.stand).id} options={standsFor(type).map((s) => ({ value: s.id, label: `${s.name} (${money(s.cost)}+)` }))} onChange={(v) => setBody({ stand: v })} />
          <div className="text-[11px] leading-snug text-faint">It is made of the frame material. A better stand scores higher on design.</div>
        </Group>
      )}
      {type === 'earbuds' && (
        <Group title="Buds">
          <Toggle label="Shape" value={body.buds ?? 'stem'} options={['stem', 'bean'] as const} onChange={(buds) => setBody({ buds })} />
          <div className="text-[11px] leading-snug text-faint">Stems hold a larger battery. Beans are lighter and seal the ear better, which helps noise cancelling.</div>
        </Group>
      )}
      {type === 'tower' && <CaseGroups />}
      {(type === 'tower' || type === 'mouse') && <LightingGroup />}
      {type === 'mouse' && (
        <Group title="Shape">
          <Toggle label="Grip" value={body.grip ?? 'ergo'} options={['ergo', 'ambi'] as const} onChange={(grip) => setBody({ grip })} />
          <div className="text-[11px] leading-snug text-faint">A sculpted right-handed shape stands higher on the thumb side and suits office hands; an ambidextrous one is lighter to flick, as esports players like.</div>
        </Group>
      )}
      {(!T.noScreen || (type === 'speaker' && body.screen)) && (
        <Group title={type === 'watch' ? 'Watch face' : type === 'tv' || type === 'speaker' || type === 'handheld' ? 'On screen' : 'Wallpaper'}>
          <div className="flex gap-1">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Btn key={i} small className="flex-1" active={d.wallpaper === i} onClick={() => setDraft({ wallpaper: i })}>
                {i + 1}
              </Btn>
            ))}
          </div>
        </Group>
      )}
    </>
  )
}

// ---------------------------------------------------------------- parts

/** What the simple editor places by itself on the types that have little to choose. */
const AUTO_LAYOUT: Partial<Record<DeviceType, string>> = {
  tower: 'The power button and the front ports go on top at the front, the light strip and the badge on the front, the rear ports beside the board at the back with the card outputs and the power inlet. The parts inside follow from the specs.',
  monitor: 'The badge and a power light go in the bottom bezel, the inputs in a panel on the back, the menu button underneath.',
  mouse: 'The DPI button sits behind the wheel and the badge on the palm rest; thumb buttons go on the left, the port at the nose and the sensor window underneath.',
  watch: 'A watch gets a crown, a side button, a speaker and a sensor window on the back. Sensors and the strap are chosen under Internals and Body.',
  desktop: 'Ports go in a row along the bottom of the back, clear of the stand, with the power button opposite and speakers underneath. Ports are chosen under Internals.',
  console: 'The disc slot, power button and front ports go on the front, with vents on the top, sides and back. A tall, narrow box is laid out as a tower. The drive and ports are chosen under Internals.',
  tv: 'Inputs sit on a panel on the back with vents above them. Speakers and the power button are along the bottom edge. Inputs are chosen under Internals.',
  earbuds: 'The case gets a charging port underneath and a pairing button on the back. Drivers, noise cancelling and the shape of the buds are chosen under Internals and Body.',
  foldable: 'The cameras and the badge share the half of the back that is not the cover screen. The inner camera, the charging port and the speakers sit clear of the fold. The hinge is chosen under Internals.',
  headset: 'The cameras go on the front plate in mirrored pairs, with the power button and a vent on top and the charging port and volume underneath. Lenses, controllers and the strap are chosen under Internals and Body.',
  speaker: 'Three buttons go on top inside the light ring, and the power inlet and any sockets on the panel at the back. Drivers, microphones, the shape and the screen are chosen under Internals and Body.',
  handheld: 'The sticks, buttons, triggers and grips are part of the body. Volume, power and the exhaust go along the top between the shoulder buttons, with the charging port and speakers underneath and an intake on the back. Controls and ports are chosen under Internals.',
  ereader: 'The power key and the charging port go along the bottom edge, with the badge on the back. The front light, page-turn keys and a stylus are chosen under Internals.',
  ring: 'The sensor window goes inside the band, against the finger, and the name is engraved round the outside. Sensors are chosen under Internals; it charges on its dock.',
  actioncam: 'The lens sits in its housing on one side of the back, leaving room for a selfie screen beside it. The shutter is on top, the port and a button on the right and the badge down the left. Features are chosen under Internals.',
  drone: 'The camera hangs from the nose on its gimbal; the badge and the power button go on top, the charging port and the tail light at the back. Arms, motors and propellers follow from the size of the body. Flight features are chosen under Internals.',
}
/** What the simple editor's one light is called. */
const LIGHT_NAMES: Partial<Record<DeviceType, string>> = { tower: 'Light strip down the front', monitor: 'Power light', mouse: 'Battery light', console: 'Light bar on the front', tv: 'Standby light', earbuds: 'Status light on the case', headset: 'Status light on the front', speaker: 'Light on top', handheld: 'Charge light below the screen, if the bezel has room', ereader: 'Charge light below the screen, if the bezel has room', actioncam: 'Recording light beside the lens', drone: 'Tail light' }

/** Simple editor: choose from lists; the parts are placed for you. */
function LayoutPanel() {
  const g = useGame()
  const d = useStore((s) => s.draft!)
  const o = useStore((s) => s.simple)
  const hasLogo = !!player(g).logo
  const { setSimple } = useStore.getState()
  const owned = (id: string) => g.features.includes(id)
  const slab = d.type === 'phone' || d.type === 'tablet' || d.type === 'foldable'
  const webcam = d.type === 'laptop' || d.type === 'desktop'
  return (
    <>
      {d.type === 'headset' && (
        <Group title="Tracking cameras">
          <Slider label="Number of cameras" value={Math.max(2, Math.round(o.cams / 2) * 2)} min={2} max={6} step={2} onChange={(v) => setSimple({ cams: v })} />
          <Choice label="Sensor" value={o.sensor} options={SENSOR_NAMES.map((n, i) => ({ value: i, label: `${n} (${money(sensorInfo(i).cost * 0.6)} each)`, locked: i > g.levels.camera }))} onChange={(v) => setSimple({ sensor: v })} />
          <div className="text-[11px] leading-snug text-faint">Four cameras see everything around the wearer. A third pair, low down, keeps hold of hands in the lap. Sharper sensors track more steadily.</div>
        </Group>
      )}
      {slab && (
        <Group title="Rear cameras">
          <Choice label="Arrangement" value={o.layout} options={LAYOUT_NAMES.map((n, i) => ({ value: i, label: n }))} onChange={(v) => setSimple({ layout: v })} />
          <Slider label="Number of cameras" value={o.cams} min={d.type === 'tablet' ? 0 : 1} max={4} onChange={(v) => setSimple({ cams: v })} />
          <Choice label="Main sensor" value={o.sensor} options={SENSOR_NAMES.map((n, i) => ({ value: i, label: `${n} (${money(sensorInfo(i).cost)})`, locked: i > g.levels.camera }))} onChange={(v) => setSimple({ sensor: v })} />
          <label className="flex items-center py-1 text-[11px]">
            <input type="checkbox" className="mr-2 accent-accent" checked={o.flash} onChange={(e) => setSimple({ flash: e.target.checked })} />
            Flash
          </label>
          <div className="text-[11px] leading-snug text-faint">Extra cameras are added in this order: ultrawide, telephoto{owned('periscope') ? ' (periscope from 108 MP up)' : ''}, macro.</div>
        </Group>
      )}
      {slab && (
        <Group title="Front">
          <Choice<FrontStyle>
            label="Front camera"
            value={o.front}
            options={[
              { value: 'notch', label: 'Notch' },
              { value: 'drop', label: 'Waterdrop' },
              { value: 'pill', label: 'Pill', locked: !owned('punch') },
              { value: 'punch', label: 'Punch-hole', locked: !owned('punch') },
              { value: 'under', label: 'Under-display', locked: !owned('udc') },
            ]}
            onChange={(v) => setSimple({ front: v })}
          />
          <Choice<FingerprintStyle>
            label="Fingerprint"
            value={o.fingerprint}
            options={[
              { value: 'side', label: 'Side button' },
              { value: 'back', label: 'Back' },
              { value: 'display', label: 'Under display', locked: !owned('fpdisplay') },
              { value: 'none', label: 'None' },
            ]}
            onChange={(v) => setSimple({ fingerprint: v })}
          />
          <div className="text-[11px] leading-snug text-faint">With a thick enough top bezel the camera sits in the bezel instead.</div>
        </Group>
      )}
      {webcam && (
        <Group title="Webcam">
          <Choice label="Sensor" value={o.sensor} options={SENSOR_NAMES.map((n, i) => ({ value: i, label: `${n} (${money(sensorInfo(i).cost * 0.6)})`, locked: i > g.levels.camera }))} onChange={(v) => setSimple({ sensor: v })} />
          <div className="text-[11px] leading-snug text-faint">It sits in the top bezel, or in a small notch if the bezel is too thin.{d.type === 'laptop' ? ' Ports are chosen under Internals.' : ''}</div>
        </Group>
      )}
      {LIGHT_NAMES[d.type] && (
        <Group title="Details">
          <label className="flex items-center py-1 text-[11px]">
            <input type="checkbox" className="mr-2 accent-accent" checked={o.flash} onChange={(e) => setSimple({ flash: e.target.checked })} />
            {LIGHT_NAMES[d.type]}
          </label>
        </Group>
      )}
      {AUTO_LAYOUT[d.type] && <div className="border-b border-line px-3 py-2 text-[11px] leading-snug text-dim">{AUTO_LAYOUT[d.type]} Switch to Advanced to move anything.</div>}
      <Group title="Branding">
        {hasLogo ? (
          <div className="py-1 text-[11px] text-dim">Your uploaded company logo is placed on the {LOGO_PLACE[d.type] ?? 'back'}.</div>
        ) : d.type === 'watch' ? (
          <div className="py-1 text-[11px] text-dim">Upload a company logo under Save and settings, Company, to engrave it on the case back.</div>
        ) : (
          <>
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">Logo text</span>
              <TextInput value={o.logo} maxLength={14} onChange={(v) => setSimple({ logo: v })} className="w-40" />
            </label>
            {LOGO_PLACE[d.type] && <div className="text-[11px] leading-snug text-faint">It goes on the {LOGO_PLACE[d.type]}.</div>}
          </>
        )}
      </Group>
    </>
  )
}

function PartsPanel() {
  const d = useStore((s) => s.draft!)
  const selected = useStore((s) => s.selectedPart)
  const { addPart, selectPart, removePart } = useStore.getState()
  return (
    <>
      <Group title="Add part">
        <div className="grid grid-cols-2 gap-1">
          {kindsFor(d.type).map((k) => (
            <Btn key={k} small icon="plus" onClick={() => addPart(k)} className="!justify-start" title={`Add: ${partLabel({ kind: k, face: "back", crown: d.type === "watch" && k === "button" }, d.type)}`}>
              <span className="min-w-0 truncate">{partLabel({ kind: k, face: 'back', crown: d.type === 'watch' && k === 'button' }, d.type)}</span>
            </Btn>
          ))}
        </div>
        <div className="mt-2 text-[11px] leading-snug text-faint">
          Or work on the model itself: double-click a surface to add a part there, drag a part to move it, and pull the square handles to resize it or the round one to turn it. With nothing selected, the handles around the body resize the body. <Key>Arrows</Key> nudge, <Key>Delete</Key> removes, <Key>Ctrl</Key> <Key>Z</Key> undoes.
        </div>
      </Group>
      <Group title={`Placed parts: ${d.parts.length}`}>
        {d.parts.map((p) => (
          <div key={p.id} {...pressable(() => selectPart(p.id))} role="button" aria-pressed={selected === p.id} className={`flex h-7 cursor-pointer items-center justify-between border-l-2 pl-2 text-xs ${selected === p.id ? 'border-accent bg-accent/10 text-fg' : 'border-transparent text-fg hover:bg-hover'}`}>
            <span className="truncate">
              {isCoverCam(d, p) ? 'Cover camera' : partLabel(p, d.type)}
              {p.kind === 'camera' && p.face === 'back' && !isCoverCam(d, p) ? ` / ${p.lens}` : ''}
              {(p.kind === 'port' || p.kind === 'slot') && p.text ? <span className="text-dim"> / {socketName(d.type, p.text)}</span> : ''}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] text-dim">{cap(faceLabel(p.face, d.type))}</span>
              <IconBtn small tone="ghost" icon="bin" title={`Remove ${isCoverCam(d, p) ? 'the cover camera' : partLabel(p, d.type).toLowerCase()}`} onClick={(e) => (e.stopPropagation(), removePart(p.id))} />
            </span>
          </div>
        ))}
      </Group>
    </>
  )
}

/** Short name of the socket a port part stands for. */
const socketName = (type: DeviceType, id: string) => ({ power: 'power', hdmi: 'HDMI' })[id] ?? ioOptions(type).find((x) => x.id === id)?.name.toLowerCase() ?? id

// ---------------------------------------------------------------- internals

/**
 * A row of the Internals panel that stands for something inside the device. Pointing at it lights the component
 * up on the opened model, and picking the component there marks the row.
 */
function Spec({ k, children }: { k: string; children: React.ReactNode }) {
  const on = useStudio((s) => s.hover === k || !!s.pick?.specs.includes(k))
  return (
    <div data-spec={k} onMouseEnter={() => useStudio.setState({ hover: k })} onMouseLeave={() => useStudio.getState().hover === k && useStudio.setState({ hover: null })} className={`-mx-2 border-l-2 px-[6px] ${on ? 'border-accent bg-accent/10' : 'border-transparent'}`}>
      {children}
    </div>
  )
}

/** The headings extras are listed under, by the research track they come from. */
const EXTRA_GROUPS: Partial<Record<Track, string>> = { chipset: 'Radios and connectivity', design: 'Sound, touch and input', materials: 'Durability and cooling', charging: 'Charging', camera: 'Sensing' }

function InternalsPanel({ maxBattery }: { maxBattery: number }) {
  const g = useGame()
  const d = useStore((st) => st.draft!)
  const s = d.specs
  const { setSpecs } = useStore.getState()
  const lv = g.levels
  const type = d.type
  const T = TYPES[type]
  const flip = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  const chips = g.chips.filter((c) => c.status === 'ready')
  const io = s.io ?? []
  // small cells are chosen in finer steps
  const small = type === 'watch' || type === 'earbuds'
  const heat = thermal(d, g.chips)
  const speakers = SPEAKERS[s.speakers ?? 0]
  const shape = type === 'speaker' ? speakerShape(d.body) : null
  const woofer = SPEAKER_DRIVERS[s.driver ?? 0] ?? SPEAKER_DRIVERS[0]
  // picking a component on the opened device brings its row into view
  const pick = useStudio((st) => st.pick)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    for (const k of pick?.specs ?? []) {
      const row = box.current?.querySelector(`[data-spec="${k}"]`)
      if (!row) continue
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      break
    }
  }, [pick])
  return (
    <div ref={box}>
      {shape && (
        <Group title="Sound and voice">
          <Spec k="driver"><Choice label="Drivers" value={s.driver ?? 0} options={SPEAKER_DRIVERS.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.materials }))} onChange={(v) => setSpecs({ driver: v })} /></Spec>
          <Spec k="mics"><Choice label="Microphones" value={s.mics ?? 0} options={MIC_ARRAYS.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.chipset }))} onChange={(v) => setSpecs({ mics: v })} /></Spec>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <Mini label="Enclosure" value={`${shape.litres.toFixed(2)} L`} tone={shape.litres < woofer.litres ? 'text-neg' : undefined} />
            <Mini label="These drivers need" value={woofer.litres ? `${woofer.litres.toFixed(1)} L` : 'any size'} />
          </div>
          <div className="mt-1 text-[11px] leading-snug text-faint">Better drivers need Materials research and a bigger body; a bigger body also gives more bass on its own. More microphones need Chipset research and let the assistant hear across a noisy room.</div>
        </Group>
      )}
      {(shape && !d.body.screen) || type === 'ring' ? null : type === 'earbuds' ? (
        <Group title="Sound">
          <Spec k="driver"><Choice label="Driver" value={s.driver ?? 0} options={DRIVERS.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.materials }))} onChange={(v) => setSpecs({ driver: v })} /></Spec>
          <Spec k="anc"><Choice label="Noise cancelling" value={s.anc ?? 0} options={ANC.map((x, i) => ({ value: i, label: x.cost ? `${x.name} (${money(x.cost)})` : x.name, locked: x.level > lv.chipset }))} onChange={(v) => setSpecs({ anc: v })} /></Spec>
          <div className="text-[11px] leading-snug text-faint">Better drivers need Materials research, better noise cancelling needs Chipset research. Both use more power and add weight to each bud.</div>
        </Group>
      ) : (
        <Group title={type === 'console' || type === 'tower' ? 'Video output' : type === 'mouse' ? 'Sensor' : type === 'headset' ? 'Displays and lenses' : type === 'foldable' ? 'Display and hinge' : type === 'speaker' ? 'Screen' : type === 'ereader' ? 'E-ink screen' : type === 'drone' ? 'Video link' : type === 'actioncam' ? 'Screens' : 'Display'}>
          <Spec k="panel"><Choice label={type === 'console' || type === 'tower' ? 'Drives up to' : type === 'mouse' ? 'Sensor' : type === 'headset' ? 'Panels' : type === 'drone' ? 'Link' : 'Panel'} value={s.panel} options={PANEL_NAMES.map((_, i) => ({ value: i, label: panelName(type, i), locked: i > lv.display }))} onChange={(v) => setSpecs({ panel: v })} /></Spec>
          <Spec k="refresh">{type !== 'watch' && !NO_REFRESH.includes(type) && <Choice label="Refresh rate" value={s.refresh} options={REFRESH.map((r) => ({ value: r.hz, label: `${r.hz} Hz`, locked: !!r.feat && !g.features.includes(r.feat) }))} onChange={(v) => setSpecs({ refresh: v })} />}</Spec>
          {type === 'console' && <div className="text-[11px] leading-snug text-faint">A sharper output only pays off with the graphics card to drive it.</div>}
          {type === 'headset' && (
            <>
              <Spec k="optics"><Choice label="Lenses" value={s.optics ?? 0} options={OPTICS.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.display }))} onChange={(v) => setSpecs({ optics: v })} /></Spec>
              <div className="text-[11px] leading-snug text-faint">The picture reaches the eye through the lenses, so they count as much as the panels. Better ones are also thinner and lighter: these need {OPTICS[s.optics ?? 0].depth} mm of extra depth in the visor.</div>
            </>
          )}
          {type === 'foldable' && (
            <>
              <Spec k="hinge"><Choice label="Hinge" value={s.hinge ?? 0} options={HINGES.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.materials }))} onChange={(v) => setSpecs({ hinge: v })} /></Spec>
              <div className="text-[11px] leading-snug text-faint">A better hinge leaves a shallower crease in the screen and a smaller gap when shut. With this one it closes to {foldedThickness(d).toFixed(1)} mm.</div>
            </>
          )}
        </Group>
      )}
      <Group title="Compute">
        {chips.length > 0 && (
          <Choice
            label="Chip source"
            value={s.customChip ?? ''}
            options={[{ value: '', label: 'Helix (bought in)' }, ...chips.map((c) => ({ value: c.id, label: `${c.name} (yours)` }))]}
            onChange={(v) => setSpecs({ customChip: v || undefined })}
          />
        )}
        {!s.customChip && (
          <>
            <Spec k="chip"><Choice label="Generation" value={s.chipGen} options={Array.from({ length: 9 }, (_, i) => ({ value: i, label: `Helix x${i}0`, locked: i > lv.chipset }))} onChange={(v) => setSpecs({ chipGen: v })} /></Spec>
            <Spec k="chip"><Choice label="Tier" value={s.chipTier} options={CHIP_TIERS.map((n, i) => ({ value: i, label: `${n} (${chipInfo(s.chipGen, i).name}, ${money(chipInfo(s.chipGen, i).cost * T.chipCost)})` }))} onChange={(v) => setSpecs({ chipTier: v })} /></Spec>
          </>
        )}
        <Spec k="gpu">{T.gpu && <Choice label="Graphics" value={s.gpu ?? 0} options={GPUS.map((x, i) => ({ value: i, label: `${x.name}${x.cost ? ` (${money(x.cost * (T.gpuCost ?? 1))}+)` : ''}` }))} onChange={(v) => setSpecs({ gpu: v })} />}</Spec>
        {T.memory > 0 && (
          <>
            <Spec k="ram"><Choice label="RAM" value={s.ram} options={RAM_OPTIONS.map((r) => ({ value: r, label: `${r} GB` }))} onChange={(v) => setSpecs({ ram: v })} /></Spec>
            <Spec k="storage"><Choice label="Storage" value={s.storage} options={STORAGE_OPTIONS.map((r) => ({ value: r, label: storageLabel(r) }))} onChange={(v) => setSpecs({ storage: v })} /></Spec>
          </>
        )}
      </Group>
      {!T.mains && (
        <Group title="Power">
          <Spec k="battery"><Slider label={type === 'earbuds' ? 'Case battery' : 'Battery'} value={Math.min(s.battery, Math.max(maxBattery, 100))} min={type === 'ring' ? 5 : small ? 100 : 500} max={Math.max(maxBattery, type === 'ring' ? 5 : small ? 100 : 500)} step={type === 'ring' ? 1 : small ? 10 : 50} format={(v) => batteryLabel(type, v)} {...(type === 'laptop' ? { unit: 'Wh', scale: 3.85 / 1000 } : { unit: 'mAh' })} onChange={(v) => setSpecs({ battery: v })} /></Spec>
          <div className="text-[11px] text-faint">
            This {type === 'earbuds' ? 'case' : type === 'headset' ? 'headset' : 'body'} holds up to {batteryLabel(type, maxBattery)}. A thicker or larger {type === 'earbuds' ? 'case' : type === 'headset' ? 'visor' : 'body'} holds more.{type === 'earbuds' ? ' The case recharges the buds; each bud has a small cell of its own.' : type === 'headset' ? ' So does a band with the battery at the back.' : ''}
          </div>
          <Spec k="charging"><Choice label="Charging" value={s.charging} options={CHARGE_W.map((_, i) => ({ value: i, label: `${chargeWatts(type, i)} W`, locked: i > lv.charging }))} onChange={(v) => setSpecs({ charging: v })} /></Spec>
        </Group>
      )}
      {heat && (
        <Group title="Cooling">
          <Spec k="cooling"><Choice label={type === 'tower' ? 'Processor cooler' : 'System'} value={s.cooling ?? 0} options={coolersFor(type).map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.materials }))} onChange={(v) => setSpecs({ cooling: v })} /></Spec>
          {type === 'tower' && <Spec k="psu"><Choice label="Power supply" value={s.psu ?? 1} options={PSUS.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.charging }))} onChange={(v) => setSpecs({ psu: v })} /></Spec>}
          {type === 'tower' && <div className="text-[11px] leading-snug text-faint">The cooler carries the processor's heat away and the case fans (under Body) the air; a liquid cooler's radiator goes up under the top if the case is deep enough, else behind the front. The supply wants a fifth more than the {Math.round(heat.heat + 90)} W it feeds.</div>}
          <div className="mt-1 grid grid-cols-2 gap-1">
            <Mini label="Heat to shed" value={`${Math.round(heat.heat)} W`} />
            <Mini label="Headroom" value={`${Math.round(heat.headroom * 100)}%`} tone={heat.headroom < 0.5 ? 'text-neg' : heat.headroom < 0.8 ? 'text-warn' : 'text-pos'} />
          </div>
          <div className="mt-1 text-[11px] leading-snug text-faint">At 100% or more it runs cool and quiet. Below 80% it runs hot and loud, and below 50% it cannot be sold. A larger body or better cooling adds headroom.</div>
        </Group>
      )}
      {!!T.mains?.sound && (
        <Group title="Sound">
          <Spec k="speakers"><Choice label="Speakers" value={s.speakers ?? 0} options={SPEAKERS.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.design }))} onChange={(v) => setSpecs({ speakers: v })} /></Spec>
          {speakers.thick > 0 && <div className={`text-[11px] leading-snug ${d.body.thickness < speakers.thick ? 'text-neg' : 'text-faint'}`}>These need a body at least {speakers.thick} mm thick.</div>}
        </Group>
      )}
      {(T.input || ioOptions(type).length > 0) && (
        <Group title={T.input === 'keyboard' ? `Keyboard and ${(T.ioLabel ?? 'ports').toLowerCase()}` : T.input === 'controller' ? 'Controller, drive and ports' : T.input === 'wands' ? 'Controllers and sensing' : T.input === 'controls' ? 'Controls, ports and features' : (T.ioLabel ?? 'Features')}>
          <Spec k="input">{T.input && <Choice label={INPUT_NAMES[T.input]} value={s.keyboard ?? 0} options={inputOptions(type).map((k, i) => ({ value: i, label: `${k.name} (${money(k.cost)})`, locked: k.level > lv.design }))} onChange={(v) => setSpecs({ keyboard: v })} />}</Spec>
          <FeatureList label="features" wrap={(id, row) => <Spec key={id} k={`io:${id}`}>{row}</Spec>} items={ioOptions(type).map((p) => ({ id: p.id, name: p.name, cost: p.cost, locked: p.level > lv.chipset, group: p.size ? 'Ports and sockets' : 'Built in', note: PART_NOTES[featurePart(type, `io:${p.id}`)?.model ?? ''], score: p.value ? `+${p.value.toFixed(1)} pts` : undefined, why: p.level > lv.chipset ? `${p.name} needs Chipset level ${p.level}: research it under Research, Technology` : undefined }))} selected={io} onToggle={(id) => setSpecs({ io: flip(io, id) })} />
        </Group>
      )}
      {T.extras.length > 0 && (
        <Group title="Extras">
          <FeatureList label="extras" wrap={(id, row) => <Spec key={id} k={`extra:${id}`}>{row}</Spec>} items={EXTRAS.filter((e) => T.extras.includes(e.id)).map((e) => { const fans = segmentsOf(type).filter((sg) => (e.likes[sg.id] ?? 0) > 0); const best = Math.max(0, ...fans.map((sg) => e.likes[sg.id] ?? 0)); return { id: e.id, name: e.name, cost: e.cost, locked: !g.features.includes(e.id), group: EXTRA_GROUPS[e.track] ?? 'Other', note: e.note, score: best ? `up to +${(best * 100).toFixed(1)}%` : undefined, why: g.features.includes(e.id) ? `${e.note}${fans.length ? ` Wanted most by: ${fans.map((sg) => sg.name).join(', ')}.` : ''}${e.needs ? ` Needs ${EXTRAS.find((x) => x.id === e.needs)?.name}.` : ''}${e.group ? ' One water resistance grade at a time.' : ''}` : `${e.name} is not researched yet: find it under Research, Technology` } })} selected={s.extras} onToggle={(id) => setSpecs({ extras: toggleExtra(s.extras, id) })} />
        </Group>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- colours

function ColoursPanel({ preview, setPreview }: { preview: number; setPreview: (i: number) => void }) {
  const d = useStore((s) => s.draft!)
  const { setDraft } = useStore.getState()
  const colors = d.colors ?? []
  const update = (i: number, patch: Partial<Colorway>) => setDraft({ colors: colors.map((c, k) => (k === i ? { ...c, ...patch } : c)) })
  return (
    <>
      <Group title="Colourways">
        <div className="text-[11px] leading-snug text-dim">Sell the device in up to three extra colours. Each adds a little appeal and a little cost. Click one to see it on the model.</div>
        <button type="button" aria-pressed={preview === -1} title="Show the standard colour on the model" onClick={() => setPreview(-1)} className={`mt-2 flex h-7 w-full items-center gap-2 border px-2 text-left text-xs ${preview === -1 ? 'border-accent bg-accent/10 text-fg' : 'border-line2 text-fg hover:border-fg'}`}>
          <span className="h-4 w-4 border border-line2" style={{ background: d.body.backColor }} />
          Standard
        </button>
        {colors.map((c, i) => (
          <div key={i} className={`mt-1 border p-2 ${preview === i ? 'border-accent bg-accent/10' : 'border-line2'}`}>
            <div className="flex items-center gap-2">
              <button type="button" className="h-7 w-7 shrink-0 border border-line2 hover:border-fg" style={{ background: c.back }} aria-pressed={preview === i} onClick={() => setPreview(i)} title="Show this colour on the model" aria-label={`Show ${c.name || 'this colour'} on the model`} />
              <TextInput aria-label="Colour name" value={c.name} maxLength={16} onChange={(v) => update(i, { name: v })} className="min-w-0 flex-1" />
              <IconBtn tone="ghost" icon="bin" title={`Remove ${c.name || 'this colour'}`} onClick={() => (setPreview(-1), setDraft({ colors: colors.filter((_, k) => k !== i) }))} />
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <label className="flex items-center justify-between text-[11px] text-dim">
                Body <ColorField label={`${c.name || 'Colour'}: body`} value={c.back} presets={SWATCHES} onChange={(v) => (update(i, { back: v }), setPreview(i))} />
              </label>
              <label className="flex items-center justify-between text-[11px] text-dim">
                Frame <ColorField label={`${c.name || 'Colour'}: frame`} value={c.frame} presets={SWATCHES} onChange={(v) => (update(i, { frame: v }), setPreview(i))} />
              </label>
            </div>
          </div>
        ))}
        {colors.length < 3 && (
          <Btn small icon="plus" className="mt-2 w-full" onClick={() => (setDraft({ colors: [...colors, { name: ['Midnight', 'Sage', 'Sand'][colors.length], back: ['#1c2330', '#7d9482', '#d9c7a8'][colors.length], frame: ['#161b25', '#6b8070', '#c4b393'][colors.length] }] }), setPreview(colors.length))}>
            Add a colour
          </Btn>
        )}
      </Group>
    </>
  )
}

// ---------------------------------------------------------------- selected part

function PartInspector({ part }: { part: PlacedPart }) {
  const g = useGame()
  const d = useStore((s) => s.draft!)
  const body = d.body
  const { patchPart, removePart, duplicatePart, selectPart } = useStore.getState()
  const set = (patch: Partial<PlacedPart>) => patchPart(part.id, patch)
  useLayer(true, () => selectPart(null))
  const fs = faceSize(body, part.face, d.type)
  const edge = isEdge(part.face, d.type)
  const round = part.kind === 'camera' || part.kind === 'flash' || part.crown || (part.kind === 'fingerprint' && !edge && d.type !== 'laptop')
  const front = part.face === 'front'
  const faces = facesFor(part.kind, d.type)
  // sliders use whole millimetres on anything too big to hold in one hand
  const size = mmFor(d.type)
  const step = d.type === 'tv' || d.type === 'desktop' || d.type === 'console' ? 1 : 0.25
  return (
    <div className="pointer-events-auto flex min-h-0 w-[300px] flex-col border border-accent bg-panel">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-line pl-3 pr-1">
        <span className="t-title flex items-center gap-2">
          <span className="h-3 w-[3px] bg-accent" />
          {partLabel(part, d.type)}
        </span>
        <IconBtn small tone="ghost" icon="close" title="Close (Esc)" onClick={() => selectPart(null)} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-1">
        {faces.length > 1 && <Choice label="Surface" value={part.face} options={faces.map((f) => ({ value: f, label: cap(faceLabel(f, d.type)) }))} onChange={(v: Face) => set({ face: v, x: 0, y: 0 })} />}
        <Slider label={edge ? 'Along edge' : 'X'} value={part.x} min={-fs.w / 2} max={fs.w / 2} step={step} format={size} onChange={(v) => set({ x: v })} />
        {!edge && <Slider label="Y" value={part.y} min={-fs.h / 2} max={fs.h / 2} step={step} format={size} onChange={(v) => set({ y: v })} />}
        {round ? (
          <Slider label="Diameter" value={part.w} min={part.kind === 'camera' ? (front ? 2.5 : 5) : 2} max={part.kind === 'camera' && !front ? 26 : 14} step={0.1} format={mm} onChange={(v) => set({ w: v, h: v })} />
        ) : (
          <>
            <Slider label="Width" value={part.w} min={1} max={edge ? Math.min(fs.w, 200) : Math.max(fs.w, fs.h)} step={0.25} format={mm} onChange={(v) => set({ w: v })} />
            <Slider label="Height" value={part.h} min={0.8} max={edge ? fs.h : Math.min(fs.h, Math.max(120, fs.h * 0.6))} step={0.1} format={mm} onChange={(v) => set({ h: v })} />
            {canTurn(part, d.type) && <Slider label="Rotation" value={part.rot} min={0} max={345} step={15} format={(v) => `${v} deg`} onChange={(v) => set({ rot: v })} />}
          </>
        )}
        {(part.kind === 'island' || part.kind === 'notch') && <Slider label="Corner radius" value={part.r ?? 0} min={0} max={Math.min(part.w, part.h) / 2} step={0.25} format={mm} onChange={(v) => set({ r: v })} />}
        {part.kind === 'island' && <Choice label="Finish" value={part.finish ?? 'back'} options={[{ value: 'back', label: 'Match back' }, { value: 'frame', label: 'Match frame' }, { value: 'black', label: 'Black glass' }]} onChange={(v) => set({ finish: v as PlacedPart['finish'] })} />}
        {part.kind === 'light' && (
          <div className="py-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dim">Glow</span>
              <ColorField label="Glow colour" value={part.color ?? '#ffffff'} presets={GLOWS} onChange={(v) => set({ color: v })} />
            </div>
            <div className="mt-1 flex gap-[3px]">
              {GLOWS.map((c) => (
                <button key={c} title={c} aria-label={`Glow colour ${c}`} aria-pressed={(part.color ?? "#ffffff") === c} onClick={() => set({ color: c })} className={`h-4 flex-1 border ${(part.color ?? '#ffffff') === c ? 'border-accent' : 'border-line2'}`} style={{ background: c }} />
              ))}
            </div>
          </div>
        )}
        {part.kind === 'button' && d.type === 'watch' && (
          <label className="flex items-center py-1 text-[11px]">
            <input type="checkbox" className="mr-2 accent-accent" checked={!!part.crown} onChange={(e) => set(e.target.checked ? { crown: true, w: 6.5, h: 6.5 } : { crown: false, w: 8, h: 2.4 })} />
            Rotating crown
          </label>
        )}
        {part.kind === 'logo' && player(g).logo && (
          <label className="flex items-center py-1 text-[11px]">
            <input type="checkbox" className="mr-2 accent-accent" checked={!!part.useImage} onChange={(e) => set(e.target.checked ? { useImage: true, w: Math.max(part.w, part.h), h: Math.max(part.w, part.h) } : { useImage: false })} />
            Use the uploaded company logo
          </label>
        )}
        {part.kind === 'logo' && !part.useImage && (
          <label className="flex items-center justify-between gap-2 py-1">
            <span className="text-[11px] text-dim">Text</span>
            <TextInput value={part.text ?? ''} maxLength={14} onChange={(v) => set({ text: v })} className="w-40" />
          </label>
        )}
        {(part.kind === 'port' || part.kind === 'slot') && part.text && <div className="py-1 text-[11px] leading-snug text-faint">This is the socket for: {socketName(d.type, part.text)}. Ports are added and removed under Internals.</div>}
        {part.kind === 'camera' && (
          <>
            <Choice
              label="Sensor"
              value={part.sensor ?? 0}
              options={SENSOR_NAMES.map((n, i) => ({ value: i, label: `${n} (${money(sensorInfo(i).cost)})`, locked: i > g.levels.camera }))}
              onChange={(v) => {
                const need = front ? selfieMinDia(v) : sensorInfo(v).minDia
                set({ sensor: v, w: Math.max(part.w, need), h: Math.max(part.h, need) })
              }}
            />
            {!front && <Choice label="Lens" value={part.lens ?? 'wide'} options={(Object.keys(LENSES) as Lens[]).map((l) => ({ value: l, label: LENSES[l].name, locked: l === 'periscope' && !g.features.includes('periscope') }))} onChange={(v) => set({ lens: v })} />}
            {front && (
              <label className={`flex items-center py-1 text-[11px] ${g.features.includes('udc') ? '' : 'cursor-not-allowed text-faint'}`} title={g.features.includes('udc') ? undefined : 'An under-display camera is not researched yet: find it under Research, Technology'}>
                <input type="checkbox" className="mr-2 accent-accent" disabled={!g.features.includes('udc')} checked={!!part.underDisplay} onChange={(e) => set({ underDisplay: e.target.checked })} />
                Under-display {g.features.includes('udc') ? '' : '(not researched)'}
              </label>
            )}
            <div className="text-[11px] text-faint">Needs a lens of at least {front ? selfieMinDia(part.sensor ?? 0) : sensorInfo(part.sensor ?? 0).minDia} mm</div>
          </>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1 border-t border-line p-2">
        {!edge && (
          <>
            <Btn small title="Move it to the centre line" onClick={() => set({ x: 0 })}>
              Centre
            </Btn>
            <Btn small title="Move it to the same place on the other side" onClick={() => set({ x: -part.x })}>
              Mirror
            </Btn>
          </>
        )}
        <Btn small title="Make a copy beside it" onClick={() => duplicatePart(part.id)}>
          Duplicate
        </Btn>
        <Btn small tone="danger" title="Remove this part (Delete). Ctrl+Z brings it back." onClick={() => removePart(part.id)}>
          Delete
        </Btn>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- designer

/** Names what the studio is acting out, and explains anything that moved by itself. */
function StudioCaption() {
  const caption = useStudio((s) => s.caption)
  const hint = useStudio((s) => s.hint)
  if (!caption && !hint) return null
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center gap-1">
      {caption && (
        <div className="flex items-stretch border border-line2 bg-panel">
          <span className="w-[3px] bg-accent" />
          <span className="px-3 py-[5px]">
            <span className="block text-[11px] text-dim">{caption.note}</span>
            <span className="block text-xs font-semibold text-fg">{caption.title}</span>
          </span>
        </div>
      )}
      {hint && <div className="border border-warn bg-panel px-3 py-1 text-[11px] text-warn">{hint}</div>}
    </div>
  )
}

type LeftPanel = 'body' | 'parts' | 'internals' | 'colours' | null
type RightPanel = 'score' | 'market' | 'issues' | null

/** What the colours of the bars mean, in the Score and the Market panels alike. */
const BARS = [
  { label: 'Strong', tone: 'pos' },
  { label: 'Fair', tone: 'dim' },
  { label: 'Weak', tone: 'warn' },
] as const
const barTone = (share: number, strong: number, fair: number) => (share > strong ? 'pos' : share > fair ? 'dim' : 'warn')

/** A labelled group of controls in the strip under the model. */
function StripGroup({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={label} title={title} className="flex shrink-0 items-center gap-2">
      <span className="text-[11px] text-dim">{label}</span>
      <div className="flex items-center [&>button+button]:-ml-px">{children}</div>
    </div>
  )
}

/** The device type on one line. "Change" opens the types in place; the ones the company cannot make yet say where they open. */
function TypeLine({ type, worked }: { type: DeviceType; worked: boolean }) {
  const g = useGame()
  const [open, setOpen] = useState(false)
  const { setType, say } = useStore.getState()
  useLayer(open, () => setOpen(false))
  const anyClosed = DEVICE_TYPES.some((t) => !hasType(g, t))
  return (
    <div className="shrink-0 border-b border-line">
      <div className="flex h-10 items-center gap-2 pl-3 pr-2">
        <Icon name={typeIcon(type)} size={14} className="shrink-0 text-dim" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-fg">{TYPES[type].name}</span>
        <Btn small aria-expanded={open} title={open ? 'Keep this type' : 'Design another kind of device. Switching starts a fresh design.'} onClick={() => setOpen(!open)}>
          {open ? 'Close' : 'Change'}
        </Btn>
      </div>
      {open && (
        <div className="px-2 pb-2" data-type-picker>
          <div className="grid grid-cols-3 gap-1">
            {DEVICE_TYPES.map((t) => {
              const label = <span className="min-w-0 truncate">{TYPES[t].name}</span>
              if (!hasType(g, t))
                return (
                  <Btn key={t} small locked={`${TYPES[t].plural}: your company does not make these yet. They open under Research, Device lines.`} onLocked={() => say(`${TYPES[t].plural} open under Research, Device lines.`)} className="!justify-start !px-[6px]">
                    {label}
                  </Btn>
                )
              // switching throws the design away: once it has been worked on, that takes a second click
              if (worked && t !== type)
                return (
                  <ConfirmBtn key={t} small tone="default" icon={typeIcon(t)} confirm="Start over?" onClick={() => (setType(t), setOpen(false))} className="!justify-start !px-[6px]" title={`${TYPES[t].name}: switching starts a fresh design and discards this one`}>
                    {label}
                  </ConfirmBtn>
                )
              return (
                <Btn key={t} small icon={typeIcon(t)} active={type === t} onClick={() => (t !== type && setType(t), setOpen(false))} className="!justify-start !px-[6px]" title={t === type ? `${TYPES[t].name}: what you are designing` : `${TYPES[t].name}: switching starts a fresh design`}>
                  {label}
                </Btn>
              )
            })}
          </div>
          {anyClosed && (
            <div className="mt-2 flex items-start gap-[5px] px-1 text-[11px] leading-snug text-dim" data-lock-note>
              <Icon name="lock" size={11} className="mt-[2px] shrink-0" />
              <span>The locked ones open under Research, Device lines.</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** The designer, while there is a design to work on. The store can drop the draft a moment before this is unmounted (quitting, rewinding), so that is checked here and nothing below has to. */
export function Designer() {
  const ready = useStore((s) => !!s.draft && !!s.game)
  return ready ? <Workbench /> : null
}

const startPrice = (type: DeviceType) => segmentsOf(type)[1]?.priceRef ?? 399
/** Enter in a number field applies it: the figure is already taken as typed, so the field is left. */
const leave = () => (document.activeElement as HTMLElement | null)?.blur()

function Workbench() {
  const g = useGame()
  const draft = useStore((s) => s.draft!)
  const meta = useStore((s) => s.meta)
  const selected = useStore((s) => s.selectedPart)
  const editorMode = useStore((s) => s.editorMode)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const { selectPart, patchPart, removePart, closeDesigner, setSpecs, setEditorMode, undo, redo } = useStore.getState()
  const type = draft.type
  const T = TYPES[type]
  const simple = editorMode === 'simple'
  const heat = thermal(draft, g.chips)
  const folded = useStudio((s) => s.folded)
  const keepClosed = useStudio((s) => s.keepClosed)
  const explode = useStudio((s) => s.explode)
  const tour = useStudio((s) => s.tour)
  const tourSteps = useStudio((s) => s.tourSteps)

  const [left, setLeft] = useState<LeftPanel>('body')
  const [right, setRight] = useState<RightPanel>(null)
  const [view, setView] = useState<ViewName | undefined>(undefined)
  const [nonce, setNonce] = useState(0)
  const [preview, setPreview] = useState(-1)
  const [launching, setLaunching] = useState(false)
  // what has been decided on the launch plan so far: it outlives a trip back to the design
  const [plan, setPlan] = useState<LaunchState>(() => ({ price: startPrice(type), quantity: null, marketing: 250e3, mode: factoryLine(g)?.running ? 'factory' : 'contract', tiers: [], keynote: -1 }))
  const patch = useCallback((p: Partial<LaunchState>) => setPlan((x) => ({ ...x, ...p })), [])

  useEffect(() => {
    patch({ price: startPrice(type), tiers: [] })
    setView(undefined)
    setPreview(-1)
  }, [type, patch])

  const ev = useMemo(() => evaluate(draft, g.levels, marketLevel(g.day), g.features, g.chips), [draft, g.levels, g.day, g.features, g.chips])
  const part = simple ? undefined : draft.parts.find((p) => p.id === selected)
  const errors = ev.report.issues.filter((i) => i.level === 'error')
  const warns = ev.report.issues.filter((i) => i.level === 'warn')
  const issues = [...errors, ...warns]
  const me = player(g)
  const probe = { raw: ev.raw, featureBonus: ev.featureBonus, price: plan.price, type, design: draft }
  const best = bestSegment(probe, me, g.day)
  const variant = isVariantOf(g, meta.family, type)
  const dev = devPlan(draft, g, variant)
  const unitNow = costNow(g, ev.costParts)
  const mode = plan.mode === 'factory' && !factoryLine(g)?.running ? 'contract' : plan.mode
  // (the maker's share is only worked out while the Market panel shows the margin)
  const unit = useMemo(() => (right === 'market' ? unitCostParts(g, draft, mode) : null), [right, g, draft, mode])
  const n = normalised(ev.raw, g.day)
  // what the studio needs to open the device up, and to say what share of it each component is
  // (the layout is only worked out while the Internals panel is open: nothing else needs what each component weighs)
  const weights = useMemo(() => (left === 'internals' ? weightShares(draft, layoutInternals(draft, g.levels, g.chips)).comps : {}), [left, draft, g.levels, g.chips])
  const hot = heat && heat.headroom < 0.8 ? { bad: heat.headroom < 0.5, text: `${heat.headroom < 0.5 ? 'Overheats' : 'Runs hot'}: ${Math.round(heat.heat)} W, ${Math.round(heat.headroom * 100)}% cooling headroom` } : null
  const tear = useMemo(() => ({ levels: g.levels, chips: g.chips, shares: specShares(draft, ev, g.chips), unitCost: ev.unitCost, weight: ev.report.weight, costScale: ev.costScale, weights, hot }), [draft, ev, g.levels, g.chips, weights, hot?.bad, hot?.text])
  // the device opens while the Internals panel is, and shuts again when it is left
  useEffect(() => {
    useStudio.setState({ internals: left === 'internals', hover: null, pick: null, tour: -1 })
  }, [left])
  useEffect(() => () => useStudio.setState({ internals: false, hover: null, pick: null, tour: -1 }), [])
  // the opened device is framed clear of whichever drawers are out
  const rightOut = !!right || !!part
  useEffect(() => {
    useStudio.setState({ pad: [left ? 316 : 8, rightOut ? 316 : 8] })
  }, [left, rightOut])

  // keep the battery inside what the body can hold
  useEffect(() => {
    if (draft.specs.battery > ev.report.maxBattery && ev.report.maxBattery >= 100) setSpecs({ battery: ev.report.maxBattery })
  }, [draft.specs.battery, ev.report.maxBattery, setSpecs])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      // (the launch plan is a layer of its own: nothing here runs under it. Function keys are never ours: F5 saves.)
      if (modalOpen() || /^F\d+$/.test(e.code)) return
      const el = e.target as HTMLElement
      const tag = el.tagName
      const field = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'
      // a field that takes text has an undo of its own; a slider, a tick box or a list has none, so the design's applies there too
      const typing = tag === 'TEXTAREA' || el.isContentEditable || (tag === 'INPUT' && !['range', 'checkbox', 'radio', 'color', 'button'].includes((el as HTMLInputElement).type))
      const st = useStore.getState()
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !typing) {
        const k = e.key.toLowerCase()
        if (k === 'z') return (e.preventDefault(), e.shiftKey ? st.redo() : st.undo())
        if (k === 'y') return (e.preventDefault(), st.redo())
      }
      // the arrow keys and Delete belong to whatever field has them
      if (field || e.ctrlKey || e.metaKey || e.altKey) return
      const p = st.editorMode === 'advanced' ? st.draft?.parts.find((x) => x.id === st.selectedPart) : undefined
      if (!p) return
      const step = e.shiftKey ? 2 : 0.5
      const flip = p.face === 'back' ? -1 : 1
      if (e.key === 'Delete' || e.key === 'Backspace') removePart(p.id)
      else if (e.key === 'ArrowLeft') patchPart(p.id, { x: p.x - step * flip })
      else if (e.key === 'ArrowRight') patchPart(p.id, { x: p.x + step * flip })
      else if (e.key === 'ArrowUp') patchPart(p.id, { y: p.y + step })
      else if (e.key === 'ArrowDown') patchPart(p.id, { y: p.y - step })
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [patchPart, removePart])

  const toolTabs: { value: Exclude<LeftPanel, null>; label: string }[] = [
    { value: 'body', label: 'Body' },
    { value: 'parts', label: simple ? 'Layout' : 'Parts' },
    { value: 'internals', label: 'Internals' },
    { value: 'colours', label: 'Colours' },
  ]
  const advancedLock = lockTip(g, 'studio')
  const blockedBy = errors.length === 1 ? '1 blocking issue' : `${errors.length} blocking issues`
  const name = productName(meta.family, meta.variant) || 'Unnamed'

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0 isolate">
          <DeviceView design={draft} selectedId={simple ? null : selected} view={view} viewNonce={nonce} onPick={simple ? undefined : selectPart} logo={me.logo} colorIndex={preview} osLook={osLookOf(g, 'player')} studio={{ editable: !simple, hints: { maxBattery: ev.report.maxBattery }, tear }} />
        </div>
        {/* everything over the model stays mounted under the launch plan, so it is found as it was left */}
        <div className={launching ? 'hidden' : 'contents'}>
          <StudioCaption />

          {/* ---- top row: what to work on, how, and back a step; at the right, what it comes to */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
            <div className="pointer-events-auto flex min-w-0 items-center gap-2">
              <div className="border border-line2 bg-panel">
                <Tabs className="!border-b-0" value={(left ?? 'none') as Exclude<LeftPanel, null>} options={toolTabs} onChange={(v) => setLeft(left === v ? null : v)} />
              </div>
              <div className="flex bg-panel [&>button+button]:-ml-px">
                <Btn small active={simple} onClick={() => setEditorMode('simple')} title="Simple: choose from lists and the parts are placed for you">
                  Simple
                </Btn>
                <Btn small active={!simple} onClick={() => setEditorMode('advanced')} locked={advancedLock} onLocked={() => advancedLock && useStore.getState().say(advancedLock)} title="Advanced: place, move and size every part yourself">
                  Advanced
                </Btn>
              </div>
              <div className="flex bg-panel [&>button+button]:-ml-px">
                <IconBtn icon="undo" disabled={!canUndo} onClick={undo} title={canUndo ? 'Undo (Ctrl+Z)' : 'Undo: nothing has been changed yet'} />
                <IconBtn icon="redo" disabled={!canRedo} onClick={redo} title={canRedo ? 'Redo (Ctrl+Y)' : 'Redo: nothing has been undone'} />
              </div>
            </div>
            <div className="pointer-events-auto flex shrink-0 items-stretch border border-line2 bg-panel">
              <div className="flex items-baseline gap-2 self-center px-3" title="What one unit costs to build today. Whoever builds it adds or saves a little: see the launch plan.">
                <span className="text-[11px] text-dim">Unit cost</span>
                <span className="num text-[13px] font-semibold text-fg">{price(unitNow)}</span>
              </div>
              <Tabs
                className="border-l border-line !border-b-0"
                value={(right ?? 'none') as Exclude<RightPanel, null>}
                onChange={(v) => setRight(right === v ? null : v)}
                options={[
                  { value: 'score', label: 'Score', badge: Math.round(ev.report.pct) },
                  {
                    value: 'market',
                    label: (
                      <span title={`Best fit: ${best.seg.name} buyers`}>
                        Market<span className="ml-[6px] font-normal text-dim">{best.seg.name}</span>
                      </span>
                    ),
                  },
                  { value: 'issues', label: 'Issues', badge: issues.length > 0 ? issues.length : undefined, alert: true },
                ]}
              />
            </div>
          </div>

          {/* ---- left drawer */}
          {left && (
            <div className="absolute left-2 top-[54px] flex max-h-[calc(100%-62px)] w-[300px] flex-col border border-line2 bg-panel">
              {left === 'body' && !meta.variant && <TypeLine type={type} worked={canUndo} />}
              <div className="min-h-0 flex-1 overflow-y-auto">
                {left === 'body' && <BodyPanel simple={simple} />}
                {left === 'parts' && (simple ? <LayoutPanel /> : <PartsPanel />)}
                {left === 'internals' && <InternalsPanel maxBattery={ev.report.maxBattery} />}
                {left === 'colours' && <ColoursPanel preview={preview} setPreview={setPreview} />}
              </div>
            </div>
          )}

          {/* ---- right: the panel of the tab that is open, and the selected part under it */}
          <div className="pointer-events-none absolute bottom-2 right-2 top-[54px] flex w-[300px] flex-col gap-2">
            {right && (
              <div className="pointer-events-auto min-h-0 shrink overflow-y-auto border border-line2 bg-panel p-3">
                {right === 'score' && (
                  <>
                    <Legend items={[...BARS]} className="mb-2" />
                    {ev.report.breakdown.map((b) => (
                      <div key={b.key} className="flex items-center gap-2 py-[3px]">
                        <span className="w-32 shrink-0 truncate text-[11px] text-dim" title={b.label}>
                          {b.label}
                        </span>
                        {b.max > 0 ? <Meter value={b.score} max={b.max} tone={barTone(b.score / b.max, 0.75, 0.4)} /> : <div className="flex-1" />}
                        <span className={`num w-12 shrink-0 text-right text-[11px] ${b.score < 0 ? 'text-neg' : 'text-fg'}`}>{b.max > 0 ? `${b.score.toFixed(0)}/${b.max}` : b.score.toFixed(0)}</span>
                      </div>
                    ))}
                    <div className="mt-2 border-t border-line pt-1">
                      {type === 'speaker' ? (
                        <Row k="Enclosure" v={`${speakerShape(draft.body).litres.toFixed(2)} L`} />
                      ) : type === 'headset' ? (
                        <Row k="Visor depth" v={`${Math.round(draft.body.thickness)} mm`} />
                      ) : T.noScreen ? (
                        <Row k="Volume" v={type === 'console' ? `${((draft.body.width * draft.body.height * draft.body.thickness) / 1e6).toFixed(1)} L` : `${Math.round((draft.body.width * draft.body.height * draft.body.thickness) / 1000)} cm3`} />
                      ) : (
                        <Row k="Screen, and its share of the front" v={`${ev.report.diag.toFixed(type === 'watch' ? 2 : 1)}", ${pct(ev.report.sbr, 0)}`} />
                      )}
                      <Row k="Weight" v={grams(ev.report.weight)} tone={!T.weightByArea && ev.report.weight > T.weight[1] * 0.9 ? 'text-warn' : undefined} />
                      {heat ? (
                        <Row k="Cooling headroom" v={`${Math.round(heat.headroom * 100)}%`} tone={heat.headroom < 0.5 ? 'text-neg' : heat.headroom < 0.8 ? 'text-warn' : undefined} />
                      ) : type === 'speaker' ? (
                        <Row k="Screen" v={ev.report.diag ? `${ev.report.diag.toFixed(1)}"` : 'None'} />
                      ) : T.mains ? (
                        <div className="flex items-baseline justify-between gap-3 border-b border-line py-[3px] text-[11px]">
                          <span className="text-dim">Speakers</span>
                          <span className="text-fg">{SPEAKERS[draft.specs.speakers ?? 0].name}</span>
                        </div>
                      ) : (
                        <Row k={lifeLabel(type, ev.report.lifeHours).name} v={lifeLabel(type, ev.report.lifeHours).value} />
                      )}
                      {type === 'foldable' && <Row k="Thickness when shut" v={`${foldedThickness(draft).toFixed(1)} mm`} />}
                      <Row k="Development" v={`${money(dev.cost)}, ${dev.days} days`} />
                    </div>
                  </>
                )}
                {right === 'market' && (
                  <>
                    <Legend items={[...BARS]} className="mb-2" />
                    <label className="flex items-center justify-between gap-2 pb-2">
                      <span className="text-[11px] text-dim">Try a price</span>
                      <NumInput value={plan.price} onChange={(v) => patch({ price: v })} onEnter={leave} className="w-24 text-right" step={10} max={MAX_PRICE} aria-label="Try a price" />
                    </label>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="label">How buyers rate it at that price</span>
                    </div>
                    {segmentsOf(type).map((seg) => {
                      const a = appeal(probe, me, seg, g.day)
                      const fit = seg.id === best.seg.id
                      return (
                        <div key={seg.id} className="flex items-center gap-2 py-[3px]" title={fit ? `${seg.name}: the best fit` : seg.name}>
                          <span className={`w-32 shrink-0 truncate text-[11px] ${fit ? 'font-semibold text-fg' : 'text-dim'}`}>{seg.name}</span>
                          <Meter value={a} max={100} tone={barTone(a, 70, 40)} />
                          <span className="num w-7 shrink-0 text-right text-[11px] text-fg">{Math.round(a)}</span>
                        </div>
                      )
                    })}
                    <div className="label mb-1 mt-3">Against the best on sale today</div>
                    {SUBS.map((k) => (
                      <div key={k} className="flex items-center gap-2 py-[3px]">
                        <span className="w-32 shrink-0 truncate text-[11px] text-dim" title={subLabel(type, k)}>
                          {subLabel(type, k)}
                        </span>
                        <Meter value={n[k]} max={1.1} tone={barTone(n[k], 0.9, 0.6)} />
                        <span className="num w-7 shrink-0 text-right text-[11px] text-fg">{Math.round(n[k] * 100)}</span>
                      </div>
                    ))}
                    {unit && (
                      <div className="mt-2 border-t border-line pt-1">
                        <MarginRow price={plan.price} unit={unit.total} />
                      </div>
                    )}
                  </>
                )}
                {right === 'issues' &&
                  (issues.length === 0 ? (
                    <div className="text-xs leading-snug text-dim">Nothing stands in the way of this design.</div>
                  ) : (
                    issues.map((i, k) => {
                      const jump = !!i.partId && !simple
                      return (
                        <div key={k} {...(jump ? { role: 'button', title: 'Select the part this is about', ...pressable(() => selectPart(i.partId!)) } : {})} className={`flex items-start gap-2 py-1 text-xs leading-snug ${jump ? '-mx-1 cursor-pointer px-1 hover:bg-hover' : ''}`}>
                          <span className="mt-px shrink-0">
                            <Tag tone={i.level === 'error' ? 'neg' : 'warn'}>{i.level === 'error' ? 'Blocks' : 'Warning'}</Tag>
                          </span>
                          <span className="text-fg">{i.text}</span>
                        </div>
                      )
                    })
                  ))}
              </div>
            )}
            {part && <PartInspector part={part} />}
          </div>
        </div>
      </div>

      {/* ---- the strip under the model: how it is looked at, at the left; where it goes next, at the right */}
      {!launching && (
        <div className="flex h-10 shrink-0 items-center gap-4 border-t border-line bg-panel px-2">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <StripGroup label="View">
              {(['front', 'back', 'side', 'bottom'] as ViewName[]).map((v) => (
                <Btn key={v} small active={view === v} onClick={() => (setView(v), setNonce((x) => x + 1))} title={`Look at it from the ${v === 'bottom' ? (fourthView(type) === 'under' ? 'underside' : fourthView(type)) : v}`}>
                  {cap(v === 'bottom' ? fourthView(type) : v)}
                </Btn>
              ))}
            </StripGroup>
            {type === 'foldable' && left !== 'internals' && (
              <StripGroup label="Fold" title="Show it open, or folded shut with the cover screen outermost">
                {(['open', 'shut'] as const).map((v) => (
                  <Btn key={v} small active={folded === (v === 'shut')} onClick={() => useStudio.setState({ folded: v === 'shut' })}>
                    {cap(v)}
                  </Btn>
                ))}
              </StripGroup>
            )}
            {left === 'internals' && (
              <StripGroup label="Inside">
                <Btn small active={keepClosed} title="Keep the device shut while you work on what is inside" onClick={() => useStudio.setState({ keepClosed: true, tour: -1 })}>
                  Shut
                </Btn>
                <Btn small active={!keepClosed && explode < 0.5} title="Take the cover off and look in" onClick={() => useStudio.setState({ keepClosed: false, explode: 0, tour: -1 })}>
                  Lid off
                </Btn>
                <Btn small active={!keepClosed && explode >= 0.5} title="Pull the layers apart" onClick={() => useStudio.setState({ keepClosed: false, explode: 1, tour: -1 })}>
                  Exploded
                </Btn>
                <input type="range" aria-label="How far the layers are pulled apart" min={0} max={1} step={0.02} value={keepClosed ? 0 : explode} disabled={keepClosed} onChange={(e) => useStudio.setState({ explode: Number(e.target.value), tour: -1 })} className="mx-2 hidden w-16 xl:block" title={keepClosed ? 'The device is shut: take the lid off first' : 'How far the layers are pulled apart'} />
                {tour < 0 ? (
                  <Btn small icon="play" className="ml-2" disabled={tourSteps < 2 && !keepClosed} title={tourSteps < 2 && !keepClosed ? 'There is too little inside this device for a tour' : 'A short tour of what is inside: the camera stops at each of the main components in turn. Move the camera or click anything to end it.'} onClick={() => useStudio.setState({ keepClosed: false, tour: 0 })}>
                    Tour
                  </Btn>
                ) : (
                  <>
                    <span className="num ml-2 px-2 text-[11px] text-dim" title="Where the tour is">
                      {tour + 1} / {tourSteps}
                    </span>
                    <Btn small icon="arrowRight" title="Go to the next stop of the tour" onClick={() => useStudio.setState({ tour: tour + 1 < tourSteps ? tour + 1 : -1 })}>
                      Next
                    </Btn>
                    <Btn small icon="stop" title="End the tour" onClick={() => useStudio.setState({ tour: -1 })}>
                      End
                    </Btn>
                  </>
                )}
              </StripGroup>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden max-w-[240px] truncate text-xs text-dim xl:block" title={`${name}, a ${T.name.toLowerCase()}${variant ? ', on a platform it shares with a device you already make' : ''}`}>
              {name}
              {variant && <span className="ml-2"><Tag>Shared platform</Tag></span>}
            </span>
            {errors.length > 0 && (
              <Btn small tone="ghost" icon="alert" className="!text-neg [&_svg]:!text-neg" title="Show what stands in the way" onClick={() => setRight('issues')}>
                {blockedBy}
              </Btn>
            )}
            {canUndo ? (
              <ConfirmBtn tone="default" confirm="Discard the design?" title="Throw this design away. To keep it for later, go to another screen instead: New device picks it up again." onClick={() => closeDesigner(true)}>
                Cancel
              </ConfirmBtn>
            ) : (
              <Btn title="Close the designer" onClick={() => closeDesigner(true)}>
                Cancel
              </Btn>
            )}
            <Btn tone="primary" className="px-5" disabled={errors.length > 0} title={errors.length > 0 ? `Fix the ${blockedBy} first: they are listed under Issues` : 'Name it, price it and order the first run'} onClick={() => setLaunching(true)}>
              Launch plan
            </Btn>
          </div>
        </div>
      )}

      {launching && <LaunchPlan plan={plan} patch={patch} back={() => setLaunching(false)} />}
    </div>
  )
}
