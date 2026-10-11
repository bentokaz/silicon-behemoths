// The device designer. The 3D studio fills the screen; everything else is a
// floating toolbar or a drawer that opens over it when asked for.
import { useEffect, useMemo, useState } from 'react'
import { DeviceView, type ViewName, fourthView } from '../3d/DeviceView'
import { useStudio } from '../3d/studio'
import { sfx } from '../audio/sfx'
import { CHARGE_W, CHIP_TIERS, EXTRAS, LENSES, MATERIALS, PANEL_NAMES, RAM_OPTIONS, REFRESH, SENSOR_NAMES, STORAGE_OPTIONS, chipInfo, marketLevel, sensorInfo } from '../data/catalog'
import { ANC, COOLERS, DRIVERS, GPUS, HEAD_STRAPS, HINGES, INPUT_NAMES, MIC_ARRAYS, OPTICS, SPEAKERS, SPEAKER_DRIVERS, STRAPS, TYPES, headStrap, inputOptions, ioOptions, segmentsOf, standInfo, standsFor, subLabel } from '../data/devices'
import { RETAIL_CUT, canAfford, devPlan, isVariantOf, player, productName, startProduct } from '../sim/game'
import { faceLabel, facesFor, faceSize, isEdge, kindsFor, partLabel, speakerShape } from '../sim/geometry'
import { EVENTS, hasStage } from '../sim/growth'
import { appeal, bestSegment, normalised } from '../sim/market'
import { CONTRACT, FACTORY_SAVING, costNow, factoryLine } from '../sim/ops'
import { type FingerprintStyle, type FrontStyle, LAYOUT_NAMES } from '../sim/rivals'
import { batteryLabel, chargeWatts, evaluate, foldedThickness, minBezel, minThickness, panelName, selfieMinDia, thermal } from '../sim/scoring'
import { type Colorway, DEVICE_TYPES, type DeviceType, type Face, type Lens, type PlacedPart, type ProductionOrder, SUBS, type StorageTier } from '../sim/types'
import { hasType } from '../sim/world'
import { useGame, useStore } from '../store/game'
import { Btn, Choice, Meter, Mini, NumInput, Row, Slider, Tabs, Tag, TextInput, money, num, pct } from './ui'

const SWATCHES = ['#17191d', '#2b2f36', '#5b6470', '#c9ccd1', '#ecebe6', '#c8b89a', '#2e4a3c', '#2f4f73', '#8c2f39', '#d98a3d']
const GLOWS = ['#ffffff', '#5ab4ff', '#8dffa8', '#ff5a4a', '#ffb347', '#c78bff']
const mm = (v: number) => `${v.toFixed(1)} mm`
/** Sizes of large devices read better without decimals. */
const mmFor = (type: DeviceType) => (type === 'tv' || type === 'desktop' || type === 'console' || type === 'headset' || type === 'speaker' ? (v: number) => `${Math.round(v)} mm` : mm)
const grams = (g: number) => (g >= 2000 ? `${(g / 1000).toFixed(1)} kg` : `${Math.round(g)} g`)
/** What the two body materials are called on each device type: [frame, back]. */
const SHELL_NAMES: Partial<Record<DeviceType, [string, string]>> = { laptop: ['Shell', 'Lid'], desktop: ['Shell and stand', 'Back and chin'], console: ['Shell', 'Front panel'], tv: ['Frame and stand', 'Back'], earbuds: ['Hinge and trim', 'Case and buds'], headset: ['Shell and band', 'Front plate'], speaker: ['Top and trim', 'Fabric'], handheld: ['Shell', 'Front plate'] }
/** Where the simple editor puts the logo. */
const LOGO_PLACE: Partial<Record<DeviceType, string>> = { laptop: 'lid', desktop: 'back, and on the chin if there is one', console: 'top, or the side of a tower', tv: 'back, and below the screen if the bezel allows', earbuds: 'front of the case', foldable: 'back, beside the cameras', headset: 'front of the visor', speaker: 'panel at the back', handheld: 'back, between the grips' }
/** What the body is called in the editor, where "chassis" does not fit. */
const BODY_NAMES: Partial<Record<DeviceType, string>> = { earbuds: 'Case', headset: 'Visor', speaker: 'Body' }
/** What the depth of the body costs and buys, for the types where the usual trade does not apply. */
const DEPTH_HINTS: Partial<Record<DeviceType, string>> = {
  earbuds: 'A slimmer case is easier to pocket but holds a smaller battery',
  foldable: 'Each half is this thick, so it closes to a little over twice that. Thinner scores better but leaves less room for the battery',
  headset: 'A slimmer visor sits closer to the face and is more comfortable, but holds a smaller battery. Simpler lenses need more depth',
  speaker: 'A bigger body holds more air, which means more bass, but takes up more of the shelf',
  handheld: 'Thinner scores better on design but leaves less room for the battery',
}
const storageLabel = (gb: number) => (gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`)

function ColorPick({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="py-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-dim">{label}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
      <div className="mt-1 flex gap-[3px]">
        {SWATCHES.map((c) => (
          <button key={c} title={c} onClick={() => onChange(c)} className={`h-4 flex-1 border ${value === c ? 'border-accent' : 'border-line2'}`} style={{ background: c }} />
        ))}
      </div>
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line px-3 pb-2 pt-1">
      <div className="label py-1 text-faint">{title}</div>
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
          <Btn key={o} small active={value === o} onClick={() => onChange(o)}>
            {o}
          </Btn>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- body

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
  const sizes = T.sizes ?? [0.12, 0.42, 0.7, 0.95].map((f, i) => ({ name: ['Compact', 'Standard', 'Large', 'Max'][i], width: Math.round(T.width[0] + (T.width[1] - T.width[0]) * f), height: Math.round(T.height[0] + (T.height[1] - T.height[0]) * f), thickness: undefined as number | undefined }))
  const sizeIndex = sizes.findIndex((z) => z.width === body.width && z.height === body.height)
  const pickSize = (i: number) => {
    const z = sizes[i]
    setBody({ width: z.width, height: z.height, ...(z.thickness ? { thickness: Math.max(z.thickness, minThick) } : {}) })
  }
  const maxCorner = type === 'watch' ? Math.min(body.width, body.height) / 2 : type === 'earbuds' ? body.thickness / 2 : type === 'console' ? Math.max(2, Math.min(body.width, body.height) / 2 - 2) : type === 'laptop' ? 20 : type === 'tv' || type === 'headset' ? 40 : type === 'speaker' ? Math.min(body.width, body.thickness) / 2 - 1 : 24
  const flank = T.flank ?? 0
  const coarse = type === 'console' || type === 'headset' || type === 'speaker'
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
            <Slider label={dimW} value={body.width} min={T.width[0]} max={T.width[1]} step={0.5} format={size} onChange={(v) => setBody({ width: v })} />
            <Slider label={dimH} value={body.height} min={T.height[0]} max={T.height[1]} step={0.5} format={size} onChange={(v) => setBody({ height: v })} />
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
      {type === 'speaker' && (
        <Group title="Shape">
          <Toggle label="Form" value={body.form ?? 'column'} options={['column', 'orb', 'block'] as const} onChange={(form) => setBody({ form })} />
          <label className="flex items-center py-1 text-[11px]">
            <input type="checkbox" className="mr-2 accent-accent" checked={!!body.screen} onChange={(e) => setBody({ screen: e.target.checked })} />
            Touch screen in the front
          </label>
          <div className="text-[10px] leading-snug text-faint">A screen lets the assistant show its answers, and buyers of smart displays expect one. It is as large as the flat front allows, so a wider body gives a bigger screen. The panel is chosen under Internals.</div>
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
          <div className="text-[10px] text-faint">
            Minimum {minBez} mm at Industrial design level {g.levels.design}
            {flank ? `, plus ${flank} mm each side for the controls` : ''}
          </div>
          {type === 'foldable' && <div className="mt-1 text-[10px] leading-snug text-faint">The cover screen on the outside follows the side bezel. Use the Shut button above the model to see it.</div>}
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
          <div className="text-[10px] leading-snug text-faint">A rigid band spreads the weight. One with the battery at the back also balances the visor and holds half as much charge again.</div>
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
          <div className="text-[10px] leading-snug text-faint">It is made of the frame material. A better stand scores higher on design.</div>
        </Group>
      )}
      {type === 'earbuds' && (
        <Group title="Buds">
          <Toggle label="Shape" value={body.buds ?? 'stem'} options={['stem', 'bean'] as const} onChange={(buds) => setBody({ buds })} />
          <div className="text-[10px] leading-snug text-faint">Stems hold a larger battery. Beans are lighter and seal the ear better, which helps noise cancelling.</div>
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
  watch: 'A watch gets a crown, a side button, a speaker and a sensor window on the back. Sensors and the strap are chosen under Internals and Body.',
  desktop: 'Ports go in a row along the bottom of the back, clear of the stand, with the power button opposite and speakers underneath. Ports are chosen under Internals.',
  console: 'The disc slot, power button and front ports go on the front, with vents on the top, sides and back. A tall, narrow box is laid out as a tower. The drive and ports are chosen under Internals.',
  tv: 'Inputs sit on a panel on the back with vents above them. Speakers and the power button are along the bottom edge. Inputs are chosen under Internals.',
  earbuds: 'The case gets a charging port underneath and a pairing button on the back. Drivers, noise cancelling and the shape of the buds are chosen under Internals and Body.',
  foldable: 'The cameras and the badge share the half of the back that is not the cover screen. The inner camera, the charging port and the speakers sit clear of the fold. The hinge is chosen under Internals.',
  headset: 'The cameras go on the front plate in mirrored pairs, with the power button and a vent on top and the charging port and volume underneath. Lenses, controllers and the strap are chosen under Internals and Body.',
  speaker: 'Three buttons go on top inside the light ring, and the power inlet and any sockets on the panel at the back. Drivers, microphones, the shape and the screen are chosen under Internals and Body.',
  handheld: 'The sticks, buttons, triggers and grips are part of the body. Volume, power and the exhaust go along the top between the shoulder buttons, with the charging port and speakers underneath and an intake on the back. Controls and ports are chosen under Internals.',
}
/** What the simple editor's one light is called. */
const LIGHT_NAMES: Partial<Record<DeviceType, string>> = { console: 'Light bar on the front', tv: 'Standby light', earbuds: 'Status light on the case', headset: 'Status light on the front', speaker: 'Light on top', handheld: 'Charge light below the screen, if the bezel has room' }

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
          <div className="text-[10px] leading-snug text-faint">Four cameras see everything around the wearer. A third pair, low down, keeps hold of hands in the lap. Sharper sensors track more steadily.</div>
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
          <div className="text-[10px] leading-snug text-faint">Extra cameras are added in this order: ultrawide, telephoto{owned('periscope') ? ' (periscope from 108 MP up)' : ''}, macro.</div>
        </Group>
      )}
      {slab && (
        <Group title="Front">
          <Choice<FrontStyle>
            label="Front camera"
            value={o.front}
            options={[
              { value: 'notch', label: 'Notch' },
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
          <div className="text-[10px] leading-snug text-faint">With a thick enough top bezel the camera sits in the bezel instead.</div>
        </Group>
      )}
      {webcam && (
        <Group title="Webcam">
          <Choice label="Sensor" value={o.sensor} options={SENSOR_NAMES.map((n, i) => ({ value: i, label: `${n} (${money(sensorInfo(i).cost * 0.6)})`, locked: i > g.levels.camera }))} onChange={(v) => setSimple({ sensor: v })} />
          <div className="text-[10px] leading-snug text-faint">It sits in the top bezel, or in a small notch if the bezel is too thin.{d.type === 'laptop' ? ' Ports are chosen under Internals.' : ''}</div>
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
          <div className="py-1 text-[11px] text-dim">Upload a company logo under System to engrave it on the case back.</div>
        ) : (
          <>
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">Logo text</span>
              <TextInput value={o.logo} maxLength={14} onChange={(v) => setSimple({ logo: v })} className="h-6 w-40" />
            </label>
            {LOGO_PLACE[d.type] && <div className="text-[10px] leading-snug text-faint">It goes on the {LOGO_PLACE[d.type]}.</div>}
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
            <Btn key={k} small onClick={() => addPart(k)} className="truncate text-left">
              + {partLabel({ kind: k, face: 'back', crown: d.type === 'watch' && k === 'button' }, d.type)}
            </Btn>
          ))}
        </div>
        <div className="mt-2 text-[10px] leading-snug text-faint">
          Or work on the model itself: double-click a surface to add a part there, drag a part to move it, and pull the square handles to resize it or the round one to turn it. With nothing selected, the handles around the body resize the body. Arrow keys nudge, Delete removes, Ctrl+Z undoes.
        </div>
      </Group>
      <Group title={`Placed parts (${d.parts.length})`}>
        {d.parts.map((p) => (
          <div key={p.id} onClick={() => selectPart(p.id)} role="button" className={`flex cursor-pointer items-center justify-between border-l-2 px-2 py-[3px] text-[11px] ${selected === p.id ? 'border-accent bg-accent/10 text-accent' : 'border-transparent text-fg hover:bg-hover'}`}>
            <span className="truncate">
              {partLabel(p, d.type)}
              {p.kind === 'camera' && p.face === 'back' ? ` / ${p.lens}` : ''}
              {(p.kind === 'port' || p.kind === 'slot') && p.text ? <span className="text-faint"> / {socketName(d.type, p.text)}</span> : ''}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className="num text-faint">{faceLabel(p.face, d.type)}</span>
              <button className="num px-1 text-dim hover:text-neg" title="Remove" onClick={(e) => (e.stopPropagation(), removePart(p.id))}>
                x
              </button>
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

function Checks({ items, selected, onToggle }: { items: { id: string; name: string; cost: number; locked: boolean; why?: string }[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <>
      {items.map((e) => (
        <label key={e.id} className={`flex items-center justify-between py-[3px] text-[11px] ${e.locked ? 'text-faint' : 'text-fg'}`} title={e.why}>
          <span>
            <input type="checkbox" className="mr-2 accent-accent" disabled={e.locked} checked={selected.includes(e.id)} onChange={() => onToggle(e.id)} />
            {e.name}
          </span>
          <span className="num text-dim">{e.locked ? 'locked' : `+${money(e.cost)}`}</span>
        </label>
      ))}
    </>
  )
}

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
  return (
    <>
      {shape && (
        <Group title="Sound and voice">
          <Choice label="Drivers" value={s.driver ?? 0} options={SPEAKER_DRIVERS.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.materials }))} onChange={(v) => setSpecs({ driver: v })} />
          <Choice label="Microphones" value={s.mics ?? 0} options={MIC_ARRAYS.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.chipset }))} onChange={(v) => setSpecs({ mics: v })} />
          <div className="mt-1 grid grid-cols-2 gap-1">
            <Mini label="Enclosure" value={`${shape.litres.toFixed(2)} L`} tone={shape.litres < woofer.litres ? 'text-neg' : undefined} />
            <Mini label="These drivers need" value={woofer.litres ? `${woofer.litres.toFixed(1)} L` : 'any size'} />
          </div>
          <div className="mt-1 text-[10px] leading-snug text-faint">Better drivers need Materials research and a bigger body; a bigger body also gives more bass on its own. More microphones need Chipset research and let the assistant hear across a noisy room.</div>
        </Group>
      )}
      {shape && !d.body.screen ? null : type === 'earbuds' ? (
        <Group title="Sound">
          <Choice label="Driver" value={s.driver ?? 0} options={DRIVERS.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.materials }))} onChange={(v) => setSpecs({ driver: v })} />
          <Choice label="Noise cancelling" value={s.anc ?? 0} options={ANC.map((x, i) => ({ value: i, label: x.cost ? `${x.name} (${money(x.cost)})` : x.name, locked: x.level > lv.chipset }))} onChange={(v) => setSpecs({ anc: v })} />
          <div className="text-[10px] leading-snug text-faint">Better drivers need Materials research, better noise cancelling needs Chipset research. Both use more power and add weight to each bud.</div>
        </Group>
      ) : (
        <Group title={type === 'console' ? 'Video output' : type === 'headset' ? 'Displays and lenses' : type === 'foldable' ? 'Display and hinge' : type === 'speaker' ? 'Screen' : 'Display'}>
          <Choice label={type === 'console' ? 'Drives up to' : type === 'headset' ? 'Panels' : 'Panel'} value={s.panel} options={PANEL_NAMES.map((_, i) => ({ value: i, label: panelName(type, i), locked: i > lv.display }))} onChange={(v) => setSpecs({ panel: v })} />
          {type !== 'watch' && <Choice label="Refresh rate" value={s.refresh} options={REFRESH.map((r) => ({ value: r.hz, label: `${r.hz} Hz`, locked: !!r.feat && !g.features.includes(r.feat) }))} onChange={(v) => setSpecs({ refresh: v })} />}
          {type === 'console' && <div className="text-[10px] leading-snug text-faint">A sharper output only pays off with the graphics card to drive it.</div>}
          {type === 'headset' && (
            <>
              <Choice label="Lenses" value={s.optics ?? 0} options={OPTICS.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.display }))} onChange={(v) => setSpecs({ optics: v })} />
              <div className="text-[10px] leading-snug text-faint">The picture reaches the eye through the lenses, so they count as much as the panels. Better ones are also thinner and lighter: these need {OPTICS[s.optics ?? 0].depth} mm of extra depth in the visor.</div>
            </>
          )}
          {type === 'foldable' && (
            <>
              <Choice label="Hinge" value={s.hinge ?? 0} options={HINGES.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.materials }))} onChange={(v) => setSpecs({ hinge: v })} />
              <div className="text-[10px] leading-snug text-faint">A better hinge leaves a shallower crease in the screen and a smaller gap when shut. With this one it closes to {foldedThickness(d).toFixed(1)} mm.</div>
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
            <Choice label="Generation" value={s.chipGen} options={Array.from({ length: 9 }, (_, i) => ({ value: i, label: `Helix x${i}0`, locked: i > lv.chipset }))} onChange={(v) => setSpecs({ chipGen: v })} />
            <Choice label="Tier" value={s.chipTier} options={CHIP_TIERS.map((n, i) => ({ value: i, label: `${n} (${chipInfo(s.chipGen, i).name}, ${money(chipInfo(s.chipGen, i).cost * T.chipCost)})` }))} onChange={(v) => setSpecs({ chipTier: v })} />
          </>
        )}
        {T.gpu && <Choice label="Graphics" value={s.gpu ?? 0} options={GPUS.map((x, i) => ({ value: i, label: `${x.name}${x.cost ? ` (${money(x.cost * (T.gpuCost ?? 1))}+)` : ''}` }))} onChange={(v) => setSpecs({ gpu: v })} />}
        {T.memory > 0 && (
          <>
            <Choice label="RAM" value={s.ram} options={RAM_OPTIONS.map((r) => ({ value: r, label: `${r} GB` }))} onChange={(v) => setSpecs({ ram: v })} />
            <Choice label="Storage" value={s.storage} options={STORAGE_OPTIONS.map((r) => ({ value: r, label: storageLabel(r) }))} onChange={(v) => setSpecs({ storage: v })} />
          </>
        )}
      </Group>
      {!T.mains && (
        <Group title="Power">
          <Slider label={type === 'earbuds' ? 'Case battery' : 'Battery'} value={Math.min(s.battery, Math.max(maxBattery, 100))} min={small ? 100 : 500} max={Math.max(maxBattery, small ? 100 : 500)} step={small ? 10 : 50} format={(v) => batteryLabel(type, v)} onChange={(v) => setSpecs({ battery: v })} />
          <div className="text-[10px] text-faint">
            This {type === 'earbuds' ? 'case' : type === 'headset' ? 'headset' : 'body'} holds up to {batteryLabel(type, maxBattery)}. A thicker or larger {type === 'earbuds' ? 'case' : type === 'headset' ? 'visor' : 'body'} holds more.{type === 'earbuds' ? ' The case recharges the buds; each bud has a small cell of its own.' : type === 'headset' ? ' So does a band with the battery at the back.' : ''}
          </div>
          <Choice label="Charging" value={s.charging} options={CHARGE_W.map((_, i) => ({ value: i, label: `${chargeWatts(type, i)} W`, locked: i > lv.charging }))} onChange={(v) => setSpecs({ charging: v })} />
        </Group>
      )}
      {heat && (
        <Group title="Cooling">
          <Choice label="System" value={s.cooling ?? 0} options={COOLERS.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.materials }))} onChange={(v) => setSpecs({ cooling: v })} />
          <div className="mt-1 grid grid-cols-2 gap-1">
            <Mini label="Heat to shed" value={`${Math.round(heat.heat)} W`} />
            <Mini label="Headroom" value={`${Math.round(heat.headroom * 100)}%`} tone={heat.headroom < 0.5 ? 'text-neg' : heat.headroom < 0.8 ? 'text-warn' : 'text-pos'} />
          </div>
          <div className="mt-1 text-[10px] leading-snug text-faint">At 100% or more it runs cool and quiet. Below 80% it runs hot and loud, and below 50% it cannot be sold. A larger body or better cooling adds headroom.</div>
        </Group>
      )}
      {!!T.mains?.sound && (
        <Group title="Sound">
          <Choice label="Speakers" value={s.speakers ?? 0} options={SPEAKERS.map((x, i) => ({ value: i, label: `${x.name} (${money(x.cost)})`, locked: x.level > lv.design }))} onChange={(v) => setSpecs({ speakers: v })} />
          {speakers.thick > 0 && <div className={`text-[10px] leading-snug ${d.body.thickness < speakers.thick ? 'text-neg' : 'text-faint'}`}>These need a body at least {speakers.thick} mm thick.</div>}
        </Group>
      )}
      {(T.input || ioOptions(type).length > 0) && (
        <Group title={T.input === 'keyboard' ? `Keyboard and ${(T.ioLabel ?? 'ports').toLowerCase()}` : T.input === 'controller' ? 'Controller, drive and ports' : T.input === 'wands' ? 'Controllers and sensing' : T.input === 'controls' ? 'Controls, ports and features' : (T.ioLabel ?? 'Features')}>
          {T.input && <Choice label={INPUT_NAMES[T.input]} value={s.keyboard ?? 0} options={inputOptions(type).map((k, i) => ({ value: i, label: `${k.name} (${money(k.cost)})`, locked: k.level > lv.design }))} onChange={(v) => setSpecs({ keyboard: v })} />}
          <Checks items={ioOptions(type).map((p) => ({ id: p.id, name: p.name, cost: p.cost, locked: p.level > lv.chipset, why: p.level > lv.chipset ? `Needs Chipset level ${p.level}` : undefined }))} selected={io} onToggle={(id) => setSpecs({ io: flip(io, id) })} />
        </Group>
      )}
      {T.extras.length > 0 && (
        <Group title="Extras">
          <Checks items={EXTRAS.filter((e) => T.extras.includes(e.id)).map((e) => ({ id: e.id, name: e.name, cost: e.cost, locked: !g.features.includes(e.id), why: g.features.includes(e.id) ? undefined : 'Research it in the technology tree' }))} selected={s.extras} onToggle={(id) => setSpecs({ extras: flip(s.extras, id) })} />
        </Group>
      )}
    </>
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
        <div className="text-[11px] leading-snug text-dim">Sell the device in up to three extra colours. Each adds a little appeal and a little cost. Click one to preview it.</div>
        <button onClick={() => setPreview(-1)} className={`mt-2 flex w-full items-center gap-2 border px-2 py-1 text-left text-[11px] ${preview === -1 ? 'border-accent text-accent' : 'border-line text-fg'}`}>
          <span className="h-4 w-4 border border-line2" style={{ background: d.body.backColor }} />
          Standard
        </button>
        {colors.map((c, i) => (
          <div key={i} className={`mt-1 border p-2 ${preview === i ? 'border-accent' : 'border-line'}`}>
            <div className="flex items-center gap-2">
              <button className="h-4 w-4 shrink-0 border border-line2" style={{ background: c.back }} onClick={() => setPreview(i)} title="Preview" />
              <TextInput value={c.name} maxLength={16} onChange={(v) => update(i, { name: v })} className="h-6 min-w-0 flex-1" />
              <button className="num px-1 text-dim hover:text-neg" onClick={() => (setPreview(-1), setDraft({ colors: colors.filter((_, k) => k !== i) }))}>
                x
              </button>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <label className="flex items-center justify-between text-[10px] text-dim">
                Body <input type="color" value={c.back} onChange={(e) => (update(i, { back: e.target.value }), setPreview(i))} />
              </label>
              <label className="flex items-center justify-between text-[10px] text-dim">
                Frame <input type="color" value={c.frame} onChange={(e) => (update(i, { frame: e.target.value }), setPreview(i))} />
              </label>
            </div>
          </div>
        ))}
        {colors.length < 3 && (
          <Btn small className="mt-2 w-full" onClick={() => (setDraft({ colors: [...colors, { name: ['Midnight', 'Sage', 'Sand'][colors.length], back: ['#1c2330', '#7d9482', '#d9c7a8'][colors.length], frame: ['#161b25', '#6b8070', '#c4b393'][colors.length] }] }), setPreview(colors.length))}>
            + Add a colour
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
  const fs = faceSize(body, part.face, d.type)
  const edge = isEdge(part.face, d.type)
  const round = part.kind === 'camera' || part.kind === 'flash' || part.crown || (part.kind === 'fingerprint' && !edge && d.type !== 'laptop')
  const front = part.face === 'front'
  const faces = facesFor(part.kind, d.type)
  // sliders use whole millimetres on anything too big to hold in one hand
  const size = mmFor(d.type)
  const step = d.type === 'tv' || d.type === 'desktop' || d.type === 'console' ? 1 : 0.25
  return (
    <div className="pointer-events-auto w-[280px] border border-line2 bg-panel/95">
      <div className="flex h-8 items-center justify-between border-b border-line px-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-fg">{partLabel(part, d.type)}</span>
        <button className="num text-[10px] text-dim hover:text-accent" onClick={() => selectPart(null)}>
          CLOSE
        </button>
      </div>
      <div className="max-h-[52vh] overflow-y-auto px-2 py-1">
        {faces.length > 1 && <Choice label="Surface" value={part.face} options={faces.map((f) => ({ value: f, label: faceLabel(f, d.type) }))} onChange={(v: Face) => set({ face: v, x: 0, y: 0 })} />}
        <Slider label={edge ? 'Along edge' : 'X'} value={part.x} min={-fs.w / 2} max={fs.w / 2} step={step} format={size} onChange={(v) => set({ x: v })} />
        {!edge && <Slider label="Y" value={part.y} min={-fs.h / 2} max={fs.h / 2} step={step} format={size} onChange={(v) => set({ y: v })} />}
        {round ? (
          <Slider label="Diameter" value={part.w} min={part.kind === 'camera' ? (front ? 2.5 : 5) : 2} max={part.kind === 'camera' && !front ? 26 : 14} step={0.1} format={mm} onChange={(v) => set({ w: v, h: v })} />
        ) : (
          <>
            <Slider label="Width" value={part.w} min={1} max={edge ? Math.min(fs.w, 200) : Math.max(fs.w, fs.h)} step={0.25} format={mm} onChange={(v) => set({ w: v })} />
            <Slider label="Height" value={part.h} min={0.8} max={edge ? fs.h : Math.min(fs.h, Math.max(120, fs.h * 0.6))} step={0.1} format={mm} onChange={(v) => set({ h: v })} />
            {!edge && <Slider label="Rotation" value={part.rot} min={0} max={345} step={15} format={(v) => `${v} deg`} onChange={(v) => set({ rot: v })} />}
          </>
        )}
        {(part.kind === 'island' || part.kind === 'notch') && <Slider label="Corner radius" value={part.r ?? 0} min={0} max={Math.min(part.w, part.h) / 2} step={0.25} format={mm} onChange={(v) => set({ r: v })} />}
        {part.kind === 'island' && <Choice label="Finish" value={part.finish ?? 'back'} options={[{ value: 'back', label: 'Match back' }, { value: 'frame', label: 'Match frame' }, { value: 'black', label: 'Black glass' }]} onChange={(v) => set({ finish: v as PlacedPart['finish'] })} />}
        {part.kind === 'light' && (
          <div className="py-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-dim">Glow</span>
              <input type="color" value={part.color ?? '#ffffff'} onChange={(e) => set({ color: e.target.value })} />
            </div>
            <div className="mt-1 flex gap-[3px]">
              {GLOWS.map((c) => (
                <button key={c} title={c} onClick={() => set({ color: c })} className={`h-4 flex-1 border ${(part.color ?? '#ffffff') === c ? 'border-accent' : 'border-line2'}`} style={{ background: c }} />
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
            <TextInput value={part.text ?? ''} maxLength={14} onChange={(v) => set({ text: v })} className="h-6 w-40" />
          </label>
        )}
        {(part.kind === 'port' || part.kind === 'slot') && part.text && <div className="py-1 text-[10px] leading-snug text-faint">This is the socket for: {socketName(d.type, part.text)}. Ports are added and removed under Internals.</div>}
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
              <label className={`flex items-center py-1 text-[11px] ${g.features.includes('udc') ? '' : 'text-faint'}`}>
                <input type="checkbox" className="mr-2 accent-accent" disabled={!g.features.includes('udc')} checked={!!part.underDisplay} onChange={(e) => set({ underDisplay: e.target.checked })} />
                Under-display {g.features.includes('udc') ? '' : '(not researched)'}
              </label>
            )}
            <div className="text-[10px] text-faint">Needs a lens of at least {front ? selfieMinDia(part.sensor ?? 0) : sensorInfo(part.sensor ?? 0).minDia} mm</div>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-1 border-t border-line p-2">
        {!edge && (
          <>
            <Btn small onClick={() => set({ x: 0 })}>
              Centre
            </Btn>
            <Btn small onClick={() => set({ x: -part.x })}>
              Mirror
            </Btn>
          </>
        )}
        <Btn small onClick={() => duplicatePart(part.id)}>
          Duplicate
        </Btn>
        <Btn small tone="danger" onClick={() => removePart(part.id)}>
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
    <div className="pointer-events-none absolute inset-x-0 bottom-16 flex flex-col items-center gap-1">
      {caption && (
        <div className="flex items-stretch border border-line2 bg-panel/95">
          <span className="w-[3px] bg-accent" />
          <span className="px-3 py-[5px]">
            <span className="num block text-[9px] uppercase tracking-[0.16em] text-faint">{caption.note}</span>
            <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-fg">{caption.title}</span>
          </span>
        </div>
      )}
      {hint && <div className="border border-warn/60 bg-panel/95 px-3 py-1 text-[11px] text-warn">{hint}</div>}
    </div>
  )
}

type LeftPanel = 'body' | 'parts' | 'internals' | 'colours' | null
type RightPanel = 'score' | 'market' | null

export function Designer() {
  const g = useGame()
  const draft = useStore((s) => s.draft!)
  const meta = useStore((s) => s.meta)
  const selected = useStore((s) => s.selectedPart)
  const editorMode = useStore((s) => s.editorMode)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const { selectPart, patchPart, removePart, closeDesigner, act, say, setTab, setSpecs, setEditorMode, setType, setMeta, undo, redo } = useStore.getState()
  const type = draft.type
  const T = TYPES[type]
  const simple = editorMode === 'simple'
  const heat = thermal(draft, g.chips)
  const folded = useStudio((s) => s.folded)

  const [left, setLeft] = useState<LeftPanel>('body')
  const [right, setRight] = useState<RightPanel>(null)
  const [issuesOpen, setIssuesOpen] = useState(false)
  const [view, setView] = useState<ViewName | undefined>(undefined)
  const [nonce, setNonce] = useState(0)
  const [preview, setPreview] = useState(-1)
  const [launching, setLaunching] = useState(false)
  const [price, setPrice] = useState(() => segmentsOf(type)[1]?.priceRef ?? 399)
  const [quantity, setQuantity] = useState(10000)
  const [marketing, setMarketing] = useState(250e3)
  const [mode, setMode] = useState<ProductionOrder['mode']>('contract')
  const [tiers, setTiers] = useState<StorageTier[]>([])
  const [keynote, setKeynote] = useState(-1)

  useEffect(() => {
    setPrice(segmentsOf(type)[1]?.priceRef ?? 399)
    setView(undefined)
    setPreview(-1)
    setTiers([])
  }, [type])

  const ev = useMemo(() => evaluate(draft, g.levels, marketLevel(g.day), g.features, g.chips), [draft, g.levels, g.day, g.features, g.chips])
  const part = draft.parts.find((p) => p.id === selected)
  const errors = ev.report.issues.filter((i) => i.level === 'error')
  const warns = ev.report.issues.filter((i) => i.level === 'warn')
  const me = player(g)
  const probe = { raw: ev.raw, featureBonus: ev.featureBonus, price, type }
  const best = bestSegment(probe, me, g.day)
  const variant = isVariantOf(g, meta.family, type)
  const plan = devPlan(draft, g, variant)
  const line = factoryLine(g)
  const unitNow = costNow(g, ev.costParts)
  const buildEach = unitNow * (mode === 'contract' ? CONTRACT.premium : FACTORY_SAVING)
  const venue = keynote >= 0 ? EVENTS.keynote.venues[keynote] : undefined
  const dueNow = plan.cost + marketing + (venue?.cost ?? 0)
  const margin = price * (1 - RETAIL_CUT) - buildEach
  const n = normalised(ev.raw, g.day)

  // keep the battery inside what the body can hold
  useEffect(() => {
    if (draft.specs.battery > ev.report.maxBattery && ev.report.maxBattery >= 100) setSpecs({ battery: ev.report.maxBattery })
  }, [draft.specs.battery, ev.report.maxBattery, setSpecs])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT') return
      const st = useStore.getState()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        return e.shiftKey ? st.redo() : st.undo()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') return (e.preventDefault(), st.redo())
      const p = st.draft?.parts.find((x) => x.id === st.selectedPart)
      if (!p) return
      const step = e.shiftKey ? 2 : 0.5
      const flip = p.face === 'back' ? -1 : 1
      if (e.key === 'Delete' || e.key === 'Backspace') removePart(p.id)
      else if (e.key === 'ArrowLeft') patchPart(p.id, { x: p.x - step * flip })
      else if (e.key === 'ArrowRight') patchPart(p.id, { x: p.x + step * flip })
      else if (e.key === 'ArrowUp') patchPart(p.id, { y: p.y + step })
      else if (e.key === 'ArrowDown') patchPart(p.id, { y: p.y - step })
      else if (e.key === 'Escape') selectPart(null)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [patchPart, removePart, selectPart])


  const launch = () => {
    const err = act((game) => startProduct(game, { design: draft, family: meta.family, variant: meta.variant, price, tiers, quantity, mode, marketing, keynote: keynote >= 0 ? keynote : undefined }))
    if (err) return say(err, 'bad')
    sfx.confirm()
    say(`${productName(meta.family, meta.variant)} is in development. Release in ${plan.days} days.`)
    closeDesigner()
    setTab('products')
  }

  const toolTabs: { value: Exclude<LeftPanel, null>; label: string }[] = [
    { value: 'body', label: 'Body' },
    { value: 'parts', label: simple ? 'Layout' : 'Parts' },
    { value: 'internals', label: 'Internals' },
    { value: 'colours', label: 'Colours' },
  ]
  const nextTier = STORAGE_OPTIONS.find((o) => o > (tiers.at(-1)?.storage ?? draft.specs.storage))

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div className="absolute inset-0 isolate">
        <DeviceView design={draft} selectedId={simple ? null : selected} view={view} viewNonce={nonce} onPick={simple ? undefined : selectPart} logo={me.logo} colorIndex={preview} studio={{ editable: !simple, hints: { maxBattery: ev.report.maxBattery } }} />
      </div>
      <StudioCaption />

      {/* ---- top toolbar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="flex border border-line2 bg-panel/95">
            {toolTabs.map((t) => (
              <Btn key={t.value} small tone="ghost" active={left === t.value} onClick={() => setLeft(left === t.value ? null : t.value)}>
                {t.label}
              </Btn>
            ))}
          </div>
          <div className="flex border border-line2 bg-panel/95" title="Simple: choose from lists. Advanced: drag every part.">
            {(['simple', 'advanced'] as const).map((m) => (
              <Btn key={m} small tone="ghost" active={editorMode === m} onClick={() => setEditorMode(m)}>
                {m}
              </Btn>
            ))}
          </div>
          <div className="flex border border-line2 bg-panel/95">
            <Btn small tone="ghost" disabled={!canUndo} onClick={undo} title="Undo (Ctrl+Z)">
              Undo
            </Btn>
            <Btn small tone="ghost" disabled={!canRedo} onClick={redo} title="Redo (Ctrl+Shift+Z)">
              Redo
            </Btn>
          </div>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          {type === 'foldable' && (
            <div className="flex border border-line2 bg-panel/95" title="Show it open, or folded shut with the cover screen outermost">
              {(['open', 'shut'] as const).map((v) => (
                <Btn key={v} small tone="ghost" active={folded === (v === 'shut')} onClick={() => useStudio.setState({ folded: v === 'shut' })}>
                  {v}
                </Btn>
              ))}
            </div>
          )}
          <div className="flex border border-line2 bg-panel/95">
            {(['front', 'back', 'side', 'bottom'] as ViewName[]).map((v) => (
              <Btn key={v} small tone="ghost" active={view === v} onClick={() => (setView(v), setNonce((x) => x + 1))}>
                {v === 'bottom' ? fourthView(type) : v}
              </Btn>
            ))}
          </div>
        </div>
      </div>

      {/* ---- left drawer */}
      {left && (
        <div className="absolute bottom-14 left-2 top-12 flex w-[300px] flex-col border border-line2 bg-panel/95">
          {left === 'body' && !meta.variant && (
            <div className="shrink-0 border-b border-line p-2">
              <div className="label mb-1 text-faint">Device type</div>
              <div className="grid grid-cols-3 gap-1">
                {DEVICE_TYPES.map((t) => {
                  const game = useStore.getState().game
                  const closed = !!game && !hasType(game, t)
                  return (
                    <Btn key={t} small active={type === t} onClick={() => setType(t)} className={closed ? 'opacity-40' : ''} title={closed ? 'Your company does not make these yet. Open the line under Research.' : t === type ? '' : 'Switching starts a fresh design'}>
                      {TYPES[t].name}
                    </Btn>
                  )
                })}
              </div>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {left === 'body' && <BodyPanel simple={simple} />}
            {left === 'parts' && (simple ? <LayoutPanel /> : <PartsPanel />)}
            {left === 'internals' && <InternalsPanel maxBattery={ev.report.maxBattery} />}
            {left === 'colours' && <ColoursPanel preview={preview} setPreview={setPreview} />}
          </div>
        </div>
      )}

      {/* ---- right: a compact status card that expands on request */}
      <div className="pointer-events-none absolute bottom-14 right-2 top-12 flex w-[300px] flex-col items-end gap-2">
        <div className="pointer-events-auto w-full border border-line2 bg-panel/95">
          <div className="grid grid-cols-3 gap-px bg-line">
            {[
              ['Unit cost', money(unitNow), 'text-accent'],
              ['Design', Math.round(ev.report.pct), 'text-fg'],
              ['Best fit', best.seg.name, 'text-fg'],
            ].map(([k, v, tone]) => (
              <div key={k} className="bg-panel px-2 py-[6px]">
                <div className="text-[9px] uppercase tracking-[0.12em] text-faint">{k}</div>
                <div className={`num truncate text-sm font-semibold ${tone}`}>{v}</div>
              </div>
            ))}
          </div>
          <Tabs value={right ?? ('none' as RightPanel & string)} onChange={(v) => setRight(right === v ? null : v)} options={[{ value: 'score', label: 'Score' }, { value: 'market', label: 'Market' }]} />
          {right === 'score' && (
            <div className="max-h-[48vh] overflow-y-auto p-2">
              {ev.report.breakdown.map((b) => (
                <div key={b.key} className="flex items-center gap-2 py-[3px]">
                  <span className="w-32 text-[11px] text-dim">{b.label}</span>
                  {b.max > 0 ? <Meter value={b.score} max={b.max} tone={b.score / b.max > 0.75 ? 'pos' : b.score / b.max > 0.4 ? 'accent' : 'warn'} /> : <div className="flex-1" />}
                  <span className={`num w-12 text-right text-[10px] ${b.score < 0 ? 'text-neg' : 'text-dim'}`}>{b.max > 0 ? `${b.score.toFixed(0)}/${b.max}` : b.score.toFixed(0)}</span>
                </div>
              ))}
              <div className="mt-2 grid grid-cols-2 gap-1">
                {type === 'speaker' ? (
                  <Mini label="Enclosure" value={`${speakerShape(draft.body).litres.toFixed(2)} L`} />
                ) : type === 'headset' ? (
                  <Mini label="Visor depth" value={`${Math.round(draft.body.thickness)} mm`} />
                ) : T.noScreen ? (
                  <Mini label="Volume" value={type === 'console' ? `${((draft.body.width * draft.body.height * draft.body.thickness) / 1e6).toFixed(1)} L` : `${Math.round((draft.body.width * draft.body.height * draft.body.thickness) / 1000)} cm3`} />
                ) : (
                  <Mini label="Screen" value={`${ev.report.diag.toFixed(type === 'watch' ? 2 : 1)}" / ${pct(ev.report.sbr, 0)}`} />
                )}
                <Mini label="Weight" value={grams(ev.report.weight)} tone={!T.weightByArea && ev.report.weight > T.weight[1] * 0.9 ? 'text-warn' : undefined} />
                {heat ? (
                  <Mini label="Cooling headroom" value={`${Math.round(heat.headroom * 100)}%`} tone={heat.headroom < 0.5 ? 'text-neg' : heat.headroom < 0.8 ? 'text-warn' : undefined} />
                ) : type === 'speaker' ? (
                  <Mini label="Screen" value={ev.report.diag ? `${ev.report.diag.toFixed(1)}"` : 'None'} />
                ) : T.mains ? (
                  <Mini label="Speakers" value={SPEAKERS[draft.specs.speakers ?? 0].name} />
                ) : (
                  <Mini label={type === 'earbuds' ? 'Listening, with case' : 'Battery life'} value={`${ev.report.lifeHours.toFixed(1)} h`} />
                )}
                <Mini label="Development" value={`${money(plan.cost, 1)} / ${plan.days} d`} />
                {type === 'foldable' && <Mini label="Thickness when shut" value={`${foldedThickness(draft).toFixed(1)} mm`} />}
              </div>
            </div>
          )}
          {right === 'market' && (
            <div className="max-h-[48vh] overflow-y-auto p-2">
              <div className="flex items-center justify-between pb-1">
                <span className="text-[11px] text-dim">Test price</span>
                <NumInput value={price} onChange={setPrice} className="h-6 w-24 text-right" step={10} />
              </div>
              {segmentsOf(type).map((seg) => {
                const a = appeal(probe, me, seg, g.day)
                return (
                  <div key={seg.id} className="flex items-center gap-2 py-[3px]">
                    <span className="w-28 truncate text-[11px] text-dim">{seg.name}</span>
                    <Meter value={a} max={100} tone={a > 70 ? 'pos' : a > 40 ? 'accent' : 'dim'} />
                    <span className="num w-7 text-right text-[11px] text-fg">{Math.round(a)}</span>
                  </div>
                )
              })}
              <div className="label mb-1 mt-2 text-faint">Against the best on sale today</div>
              {SUBS.map((k) => (
                <div key={k} className="flex items-center gap-2 py-[3px]">
                  <span className="w-28 truncate text-[11px] text-dim">{subLabel(type, k)}</span>
                  <Meter value={n[k]} max={1.1} tone={n[k] > 0.9 ? 'pos' : n[k] > 0.6 ? 'accent' : 'warn'} />
                  <span className="num w-7 text-right text-[11px] text-fg">{Math.round(n[k] * 100)}</span>
                </div>
              ))}
              <Row k="Margin per unit" v={money(price * (1 - RETAIL_CUT) - unitNow * CONTRACT.premium)} tone={margin > 0 ? 'text-pos' : 'text-neg'} />
            </div>
          )}
        </div>
        {part && !simple && <PartInspector part={part} />}
      </div>

      {/* ---- bottom bar */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-2">
        <div className="pointer-events-auto max-w-[46%] border border-line2 bg-panel/95">
          {issuesOpen && errors.length + warns.length > 0 && (
            <div className="max-h-40 overflow-y-auto border-b border-line py-1">
              {[...errors, ...warns].map((i, k) => (
                <div key={k} role={i.partId ? 'button' : undefined} onClick={() => i.partId && !simple && selectPart(i.partId)} className={`flex gap-2 px-2 py-[2px] text-[11px] ${i.partId && !simple ? 'cursor-pointer hover:bg-hover' : ''}`}>
                  <span className={`num w-12 shrink-0 ${i.level === 'error' ? 'text-neg' : 'text-warn'}`}>{i.level === 'error' ? 'BLOCK' : 'WARN'}</span>
                  <span className="text-fg">{i.text}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setIssuesOpen(!issuesOpen)} className="num flex h-8 items-center gap-3 px-3 text-[11px]">
            {errors.length + warns.length === 0 ? (
              <span className="text-pos">NO ISSUES</span>
            ) : (
              <>
                {errors.length > 0 && <span className="text-neg">{errors.length} BLOCKING</span>}
                {warns.length > 0 && <span className="text-warn">{warns.length} WARNINGS</span>}
                <span className="text-faint">{issuesOpen ? 'HIDE' : 'SHOW'}</span>
              </>
            )}
          </button>
        </div>
        <div className="pointer-events-auto flex items-center gap-2">
          <span className="num hidden border border-line2 bg-panel/95 px-2 py-[7px] text-[11px] text-dim xl:block">
            {productName(meta.family, meta.variant) || 'Unnamed'} <span className="text-faint">/ {T.name}</span>
            {variant && <span className="ml-2"><Tag tone="accent">shared platform</Tag></span>}
          </span>
          <Btn onClick={closeDesigner}>Cancel</Btn>
          <Btn tone="primary" className="h-9 px-6" disabled={errors.length > 0} onClick={() => setLaunching(true)}>
            {errors.length ? `${errors.length} blocking` : 'Proceed to launch'}
          </Btn>
        </div>
      </div>

      {/* ---- launch plan */}
      {launching && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-carbon/85 p-4">
          <div className="flex max-h-full w-[760px] max-w-full flex-col border border-line2 bg-panel">
            <div className="flex h-9 shrink-0 items-center border-b border-line px-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg">Launch plan</div>
            <div className="grid min-h-0 flex-1 grid-cols-2 overflow-y-auto">
              <div className="border-r border-line p-3">
                <div className="label mb-1 text-faint">Name</div>
                <div className="flex gap-1">
                  <TextInput value={meta.family} onChange={(v) => setMeta({ family: v })} maxLength={24} className="min-w-0 flex-1" placeholder="Product line" />
                  <TextInput value={meta.variant} onChange={(v) => setMeta({ variant: v })} maxLength={10} className="w-24" placeholder="Variant" />
                </div>
                <div className="mt-1 text-[10px] leading-snug text-faint">{variant ? 'Shares a platform with a device you already make in this line, so development is cheaper and faster.' : 'Reuse an existing line name with a variant label (Pro, Lite) to share its platform.'}</div>

                <div className="label mb-1 mt-3 text-faint">Price</div>
                <div className="flex items-center gap-2">
                  <NumInput value={price} onChange={setPrice} step={10} className="w-28 text-right" />
                  <span className="text-[11px] text-dim">
                    best fit {best.seg.name} (typical {money(best.seg.priceRef)})
                  </span>
                </div>
                {T.memory > 0 && (
                  <>
                    <div className="label mb-1 mt-3 text-faint">Storage options</div>
                    <div className="text-[11px] text-dim">Base model: {storageLabel(draft.specs.storage)}</div>
                    {tiers.map((t, i) => (
                      <div key={t.storage} className="mt-1 flex items-center gap-2">
                        <span className="num w-16 text-[11px] text-fg">{storageLabel(t.storage)}</span>
                        <NumInput value={t.price} onChange={(v) => setTiers(tiers.map((x, k) => (k === i ? { ...x, price: v } : x)))} step={10} className="h-6 w-24 text-right" />
                        <button className="num text-[10px] text-dim hover:text-neg" onClick={() => setTiers(tiers.slice(0, i))}>
                          REMOVE
                        </button>
                      </div>
                    ))}
                    {tiers.length < 3 && nextTier && (
                      <Btn small className="mt-1" onClick={() => setTiers([...tiers, { storage: nextTier, price: (tiers.at(-1)?.price ?? price) + (T.memory >= 2 ? 200 : 100) }])}>
                        + {storageLabel(nextTier)} option
                      </Btn>
                    )}
                    <div className="mt-1 text-[10px] leading-snug text-faint">Some buyers pay extra for more storage, which costs you little to add.</div>
                  </>
                )}

                <div className="label mb-1 mt-3 text-faint">Launch marketing</div>
                <Slider label="One-off launch budget" value={marketing} min={0} max={20e6} step={50e3} format={(v) => money(v)} onChange={setMarketing} />
                <Choice label="Launch keynote" value={keynote} options={[{ value: -1, label: 'None' }, ...EVENTS.keynote.venues.map((v, i) => ({ value: i, label: `${v.name} (${money(v.cost, 1)})`, locked: i === 3 && !hasStage(g) }))]} onChange={setKeynote} />
              </div>
              <div className="p-3">
                <div className="label mb-1 text-faint">First production run</div>
                <div className="flex gap-1">
                  {(['contract', 'factory'] as const).map((m) => (
                    <Btn key={m} small className="flex-1" active={mode === m} disabled={m === 'factory' && !line?.running} onClick={() => setMode(m)} title={m === 'factory' && !line?.running ? 'Needs a working line in your factory' : ''}>
                      {m === 'contract' ? 'Contract maker' : 'Own factory'}
                    </Btn>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <NumInput value={quantity} onChange={setQuantity} step={1000} className="w-28 text-right" />
                  <span className="num text-[11px] text-dim">units at {money(buildEach)} each</span>
                </div>
                <div className="mt-1 text-[10px] leading-snug text-faint">
                  {mode === 'contract' ? `A contractor starts after ${CONTRACT.leadDays} days and delivers about ${num(CONTRACT.perDay / T.capacity)} a day.` : `Your line builds about ${num((line?.throughput ?? 0) / T.capacity)} a day.`} You pay for units as they are built, not up front.
                </div>

                <div className="mt-3 border-t border-line pt-2">
                  <Row k="Development" v={money(plan.cost)} />
                  <Row k="Launch marketing" v={money(marketing)} />
                  {venue && <Row k={`Keynote: ${venue.name}`} v={money(venue.cost)} />}
                  <Row k="Due now" v={money(dueNow)} tone={canAfford(g, dueNow) ? 'text-accent' : 'text-neg'} />
                  <Row k="Production, paid as built" v={money(quantity * buildEach)} />
                  <Row k="Income if the run sells out" v={money(quantity * price * (1 - RETAIL_CUT))} />
                  <Row k="Margin per unit after the 15% retail cut" v={money(margin)} tone={margin > 0 ? 'text-pos' : 'text-neg'} />
                  <Row k="Release" v={`in ${plan.days} days`} />
                </div>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 border-t border-line p-2">
              <Btn className="flex-1" onClick={() => setLaunching(false)}>
                Back to the design
              </Btn>
              <Btn tone="primary" className="flex-[2]" disabled={!canAfford(g, dueNow)} onClick={launch}>
                {canAfford(g, dueNow) ? `Start development of ${productName(meta.family, meta.variant) || 'this device'}` : 'Not enough cash'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
