// The free-form 3D device designer: body, parts and internals on the left,
// the studio in the middle, live readouts and the selected part on the right.
import { useEffect, useMemo, useState } from 'react'
import { DeviceView, type ViewName } from '../3d/DeviceView'
import { sfx } from '../audio/sfx'
import { CHARGE_W, CHIP_TIERS, EXTRAS, LENSES, MATERIALS, MIN_BEZEL, MIN_THICKNESS, PANEL_NAMES, RAM_OPTIONS, REFRESH, SEGMENTS, SENSOR_NAMES, STORAGE_OPTIONS, chipInfo, marketLevel, sensorInfo } from '../data/catalog'
import { RETAIL_CUT, canAfford, devPlan, player, startProduct } from '../sim/game'
import { ALLOWED_FACES, PART_LABELS, faceSize, isSide } from '../sim/geometry'
import { appeal, bestSegment } from '../sim/market'
import { evaluate, selfieMinDia } from '../sim/scoring'
import type { Face, Lens, PartKind, PlacedPart } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Btn, Choice, Meter, NumInput, Panel, Row, Slider, TextInput, money, num, pct } from './ui'

const SWATCHES = ['#17191d', '#2b2f36', '#5b6470', '#c9ccd1', '#ecebe6', '#c8b89a', '#2e4a3c', '#2f4f73', '#8c2f39', '#d98a3d']
const mm = (v: number) => `${v.toFixed(1)} mm`
const KINDS: PartKind[] = ['camera', 'island', 'flash', 'notch', 'fingerprint', 'button', 'port', 'grille', 'logo']

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
    <div className="border-b border-line px-2 pb-2 pt-1">
      <div className="label py-1 text-faint">{title}</div>
      {children}
    </div>
  )
}

function BodyTab() {
  const g = useGame()
  const body = useStore((s) => s.draft!.body)
  const wallpaper = useStore((s) => s.draft!.wallpaper)
  const { setBody, setDraft } = useStore.getState()
  const minBez = MIN_BEZEL[g.levels.design]
  const mats = (use: 'frame' | 'back') => MATERIALS.filter((m) => m.use === use || m.use === 'both').map((m) => ({ value: m.id, label: m.name, locked: m.level > g.levels.materials }))
  return (
    <>
      <Group title="Chassis">
        <Slider label="Width" value={body.width} min={58} max={92} step={0.5} format={mm} onChange={(v) => setBody({ width: v })} />
        <Slider label="Height" value={body.height} min={120} max={185} step={0.5} format={mm} onChange={(v) => setBody({ height: v })} />
        <Slider label="Thickness" value={body.thickness} min={MIN_THICKNESS[g.levels.design]} max={14} step={0.1} format={mm} onChange={(v) => setBody({ thickness: v })} hint="Thinner scores better on design but leaves less room for the battery" />
        <Slider label="Corner radius" value={body.corner} min={0} max={24} step={0.5} format={mm} onChange={(v) => setBody({ corner: v })} />
        <div className="flex items-center justify-between py-1">
          <span className="text-[11px] text-dim">Edge profile</span>
          <div className="flex">
            {(['flat', 'round'] as const).map((e) => (
              <Btn key={e} small active={body.edge === e} onClick={() => setBody({ edge: e })}>
                {e}
              </Btn>
            ))}
          </div>
        </div>
      </Group>
      <Group title="Screen bezels">
        <Slider label="Top" value={body.bezelTop} min={minBez} max={16} step={0.05} format={mm} onChange={(v) => setBody({ bezelTop: v })} />
        <Slider label="Bottom" value={body.bezelBottom} min={minBez} max={20} step={0.05} format={mm} onChange={(v) => setBody({ bezelBottom: v })} />
        <Slider label="Sides" value={body.bezelSide} min={minBez} max={10} step={0.05} format={mm} onChange={(v) => setBody({ bezelSide: v })} />
        <div className="text-[10px] text-faint">Minimum {minBez} mm at Industrial design level {g.levels.design}</div>
      </Group>
      <Group title="Frame">
        <Choice label="Material" value={body.frameMat} options={mats('frame')} onChange={(v) => setBody({ frameMat: v })} />
        <ColorPick label="Colour" value={body.frameColor} onChange={(v) => setBody({ frameColor: v })} />
      </Group>
      <Group title="Back">
        <Choice label="Material" value={body.backMat} options={mats('back')} onChange={(v) => setBody({ backMat: v })} />
        <ColorPick label="Colour" value={body.backColor} onChange={(v) => setBody({ backColor: v })} />
        <div className="flex items-center justify-between py-1">
          <span className="text-[11px] text-dim">Finish</span>
          <div className="flex">
            {(['gloss', 'matte'] as const).map((e) => (
              <Btn key={e} small active={body.backFinish === e} onClick={() => setBody({ backFinish: e })}>
                {e}
              </Btn>
            ))}
          </div>
        </div>
      </Group>
      <Group title="Wallpaper">
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Btn key={i} small className="flex-1" active={wallpaper === i} onClick={() => setDraft({ wallpaper: i })}>
              {i + 1}
            </Btn>
          ))}
        </div>
      </Group>
    </>
  )
}

function PartsTab() {
  const parts = useStore((s) => s.draft!.parts)
  const selected = useStore((s) => s.selectedPart)
  const { addPart, selectPart, removePart } = useStore.getState()
  return (
    <>
      <Group title="Add part">
        <div className="grid grid-cols-2 gap-1">
          {KINDS.map((k) => (
            <Btn key={k} small onClick={() => addPart(k)} className="truncate text-left">
              + {PART_LABELS[k]}
            </Btn>
          ))}
        </div>
        <div className="mt-2 text-[10px] leading-snug text-faint">New parts appear on the device. Drag them across any surface they fit on, or use the sliders on the right. Arrow keys nudge, Delete removes.</div>
      </Group>
      <Group title={`Placed parts (${parts.length})`}>
        {parts.map((p) => (
          <div key={p.id} onClick={() => selectPart(p.id)} role="button" className={`flex cursor-pointer items-center justify-between border-l-2 px-2 py-[3px] text-[11px] ${selected === p.id ? 'border-accent bg-accent/10 text-accent' : 'border-transparent text-fg hover:bg-hover'}`}>
            <span>
              {PART_LABELS[p.kind]}
              {p.kind === 'camera' && p.face === 'back' ? ` / ${p.lens}` : ''}
            </span>
            <span className="flex items-center gap-2">
              <span className="num text-faint">{p.face}</span>
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

function InternalsTab({ maxBattery }: { maxBattery: number }) {
  const g = useGame()
  const s = useStore((st) => st.draft!.specs)
  const { setSpecs } = useStore.getState()
  const lv = g.levels
  const toggle = (id: string) => setSpecs({ extras: s.extras.includes(id) ? s.extras.filter((x) => x !== id) : [...s.extras, id] })
  return (
    <>
      <Group title="Display">
        <Choice label="Panel" value={s.panel} options={PANEL_NAMES.map((n, i) => ({ value: i, label: n, locked: i > lv.display }))} onChange={(v) => setSpecs({ panel: v })} />
        <Choice label="Refresh rate" value={s.refresh} options={REFRESH.map((r) => ({ value: r.hz, label: `${r.hz} Hz`, locked: r.level > lv.display }))} onChange={(v) => setSpecs({ refresh: v })} />
      </Group>
      <Group title="Compute">
        <Choice label="Chip generation" value={s.chipGen} options={Array.from({ length: 9 }, (_, i) => ({ value: i, label: `Helix x${i}0`, locked: i > lv.chipset }))} onChange={(v) => setSpecs({ chipGen: v })} />
        <Choice label="Chip tier" value={s.chipTier} options={CHIP_TIERS.map((n, i) => ({ value: i, label: `${n} (${chipInfo(s.chipGen, i).name}, ${money(chipInfo(s.chipGen, i).cost)})` }))} onChange={(v) => setSpecs({ chipTier: v })} />
        <Choice label="RAM" value={s.ram} options={RAM_OPTIONS.map((r) => ({ value: r, label: `${r} GB` }))} onChange={(v) => setSpecs({ ram: v })} />
        <Choice label="Storage" value={s.storage} options={STORAGE_OPTIONS.map((r) => ({ value: r, label: r >= 1024 ? `${r / 1024} TB` : `${r} GB` }))} onChange={(v) => setSpecs({ storage: v })} />
      </Group>
      <Group title="Power">
        <Slider label="Battery" value={Math.min(s.battery, Math.max(maxBattery, 500))} min={500} max={Math.max(maxBattery, 500)} step={50} format={(v) => `${v} mAh`} onChange={(v) => setSpecs({ battery: v })} />
        <div className="text-[10px] text-faint">This body holds up to {maxBattery} mAh. A thicker or larger body holds more.</div>
        <Choice label="Charging" value={s.charging} options={CHARGE_W.map((w, i) => ({ value: i, label: `${w} W`, locked: i > lv.charging }))} onChange={(v) => setSpecs({ charging: v })} />
      </Group>
      <Group title="Extras">
        {EXTRAS.map((e) => {
          const locked = e.level > lv[e.track]
          return (
            <label key={e.id} className={`flex items-center justify-between py-[3px] text-[11px] ${locked ? 'text-faint' : 'text-fg'}`}>
              <span>
                <input type="checkbox" className="mr-2 accent-[#36c5d6]" disabled={locked} checked={s.extras.includes(e.id)} onChange={() => toggle(e.id)} />
                {e.name}
              </span>
              <span className="num text-dim">{locked ? 'locked' : `+${money(e.cost)}`}</span>
            </label>
          )
        })}
      </Group>
    </>
  )
}

function PartInspector({ part }: { part: PlacedPart }) {
  const g = useGame()
  const body = useStore((s) => s.draft!.body)
  const { patchPart, removePart, duplicatePart } = useStore.getState()
  const set = (patch: Partial<PlacedPart>) => patchPart(part.id, patch)
  const fs = faceSize(body, part.face)
  const round = part.kind === 'camera' || part.kind === 'flash' || (part.kind === 'fingerprint' && !isSide(part.face))
  const front = part.face === 'front'
  return (
    <Panel title={`Selected: ${PART_LABELS[part.kind]}`} className="shrink-0" bodyClass="px-2 py-1">
      <Choice label="Surface" value={part.face} options={ALLOWED_FACES[part.kind].map((f) => ({ value: f, label: f }))} onChange={(v: Face) => set({ face: v, x: 0, y: 0 })} />
      <Slider label={isSide(part.face) ? 'Along edge' : 'X'} value={part.x} min={-fs.w / 2} max={fs.w / 2} step={0.25} format={mm} onChange={(v) => set({ x: v })} />
      <Slider label={isSide(part.face) ? 'Across edge' : 'Y'} value={part.y} min={-fs.h / 2} max={fs.h / 2} step={0.25} format={mm} onChange={(v) => set({ y: v })} />
      {round ? (
        <Slider label="Diameter" value={part.w} min={part.kind === 'camera' ? (front ? 2.5 : 5) : 2} max={part.kind === 'camera' && !front ? 26 : 14} step={0.1} format={mm} onChange={(v) => set({ w: v, h: v })} />
      ) : (
        <>
          <Slider label="Width" value={part.w} min={1} max={isSide(part.face) ? 60 : body.width} step={0.25} format={mm} onChange={(v) => set({ w: v })} />
          <Slider label="Height" value={part.h} min={0.8} max={isSide(part.face) ? body.thickness : 80} step={0.1} format={mm} onChange={(v) => set({ h: v })} />
          <Slider label="Rotation" value={part.rot} min={0} max={345} step={15} format={(v) => `${v} deg`} onChange={(v) => set({ rot: v })} />
        </>
      )}
      {(part.kind === 'island' || part.kind === 'notch') && <Slider label="Corner radius" value={part.r ?? 0} min={0} max={Math.min(part.w, part.h) / 2} step={0.25} format={mm} onChange={(v) => set({ r: v })} />}
      {part.kind === 'island' && <Choice label="Finish" value={part.finish ?? 'back'} options={[{ value: 'back', label: 'Match back' }, { value: 'frame', label: 'Match frame' }, { value: 'black', label: 'Black glass' }]} onChange={(v) => set({ finish: v as PlacedPart['finish'] })} />}
      {part.kind === 'logo' && (
        <label className="flex items-center justify-between gap-2 py-1">
          <span className="text-[11px] text-dim">Text</span>
          <TextInput value={part.text ?? ''} maxLength={14} onChange={(v) => set({ text: v })} className="h-6 w-40" />
        </label>
      )}
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
          {!front && <Choice label="Lens" value={part.lens ?? 'wide'} options={(Object.keys(LENSES) as Lens[]).map((l) => ({ value: l, label: LENSES[l].name, locked: LENSES[l].level > g.levels.camera }))} onChange={(v) => set({ lens: v })} />}
          {front && (
            <label className={`flex items-center py-1 text-[11px] ${g.levels.design < 5 ? 'text-faint' : ''}`}>
              <input type="checkbox" className="mr-2 accent-[#36c5d6]" disabled={g.levels.design < 5} checked={!!part.underDisplay} onChange={(e) => set({ underDisplay: e.target.checked })} />
              Under-display {g.levels.design < 5 ? '(Industrial design 5)' : ''}
            </label>
          )}
          <div className="text-[10px] text-faint">Needs a lens of at least {front ? selfieMinDia(part.sensor ?? 0) : sensorInfo(part.sensor ?? 0).minDia} mm</div>
        </>
      )}
      <div className="mt-2 flex flex-wrap gap-1">
        {!isSide(part.face) && (
          <Btn small onClick={() => set({ x: 0 })}>
            Centre
          </Btn>
        )}
        {!isSide(part.face) && (
          <Btn small onClick={() => set({ x: -part.x })}>
            Mirror
          </Btn>
        )}
        <Btn small onClick={() => duplicatePart(part.id)}>
          Duplicate
        </Btn>
        <Btn small tone="danger" onClick={() => removePart(part.id)}>
          Delete
        </Btn>
      </div>
    </Panel>
  )
}

export function Designer() {
  const g = useGame()
  const draft = useStore((s) => s.draft!)
  const selected = useStore((s) => s.selectedPart)
  const { selectPart, patchPart, removePart, closeDesigner, act, say, setTab, setSpecs } = useStore.getState()
  const [tab, setTabLocal] = useState<'body' | 'parts' | 'internals'>('body')
  const [view, setView] = useState<ViewName>('back')
  const [nonce, setNonce] = useState(0)
  const [price, setPrice] = useState(399)
  const [launching, setLaunching] = useState(false)
  const [name, setName] = useState(`${player(g).name.split(' ')[0]} ${g.products.filter((p) => p.companyId === 'player').length + 1}`)
  const [quantity, setQuantity] = useState(10000)
  const [marketing, setMarketing] = useState(250e3)

  const ev = useMemo(() => evaluate(draft, g.levels, marketLevel(g.day)), [draft, g.levels, g.day])
  const part = draft.parts.find((p) => p.id === selected)
  const errors = ev.report.issues.filter((i) => i.level === 'error')
  const warns = ev.report.issues.filter((i) => i.level === 'warn')
  const probe = { raw: ev.raw, featureBonus: ev.featureBonus, price }
  const brand = player(g).brand
  const best = bestSegment(probe, brand, g.day)
  const plan = devPlan(draft)
  const total = plan.cost + quantity * ev.unitCost + marketing
  const margin = price * (1 - RETAIL_CUT) - ev.unitCost

  // keep the battery inside what the body can hold
  useEffect(() => {
    if (draft.specs.battery > ev.report.maxBattery && ev.report.maxBattery >= 500) setSpecs({ battery: ev.report.maxBattery })
  }, [draft.specs.battery, ev.report.maxBattery, setSpecs])

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return
      const st = useStore.getState()
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

  const drag = (face: Face, x: number, y: number) => {
    const st = useStore.getState()
    const p = st.draft?.parts.find((q) => q.id === st.selectedPart)
    if (!p || !ALLOWED_FACES[p.kind].includes(face)) return
    const snap = (v: number) => Math.round(v * 2) / 2
    patchPart(p.id, { face, x: !isSide(face) && Math.abs(x) < 1 ? 0 : snap(x), y: isSide(face) ? 0 : snap(y) })
  }

  const launch = () => {
    const err = act((game) => startProduct(game, { design: draft, name, price, quantity, marketing }))
    if (err) return say(err, 'bad')
    sfx.confirm()
    say(`${name} is in development. Release in ${plan.days} days.`)
    closeDesigner()
    setTab('products')
  }

  return (
    <div className="relative grid h-full min-h-0 grid-cols-[290px_minmax(0,1fr)_320px]">
      {/* left drawer */}
      <div className="flex min-h-0 flex-col border-r border-line bg-panel">
        <div className="flex shrink-0 border-b border-line">
          {(['body', 'parts', 'internals'] as const).map((t) => (
            <button key={t} onClick={() => setTabLocal(t)} className={`label h-8 flex-1 border-b-2 ${tab === t ? 'border-accent text-accent' : 'border-transparent hover:text-fg'}`}>
              {t}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tab === 'body' && <BodyTab />}
          {tab === 'parts' && <PartsTab />}
          {tab === 'internals' && <InternalsTab maxBattery={ev.report.maxBattery} />}
        </div>
      </div>

      {/* studio */}
      <div className="relative min-h-0 min-w-0">
        <DeviceView design={draft} selectedId={selected} view={view} viewNonce={nonce} onPick={selectPart} onDrag={drag} />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2">
          <div className="pointer-events-auto flex border border-line bg-panel/90">
            {(['back', 'front', 'side', 'bottom'] as ViewName[]).map((v) => (
              <Btn key={v} small tone="ghost" active={view === v} onClick={() => (setView(v), setNonce((n) => n + 1))}>
                {v}
              </Btn>
            ))}
          </div>
          <div className="label pointer-events-none border border-line bg-panel/90 px-2 py-1">Drag to orbit / scroll to zoom / drag a part to move it</div>
        </div>
        <div className="absolute inset-x-0 bottom-0 max-h-32 overflow-y-auto border-t border-line bg-panel/95">
          {errors.length + warns.length === 0 ? (
            <div className="num px-2 py-1 text-[11px] text-pos">NO ISSUES</div>
          ) : (
            [...errors, ...warns].map((i, n) => (
              <div key={n} role={i.partId ? 'button' : undefined} onClick={() => i.partId && selectPart(i.partId)} className={`flex gap-2 px-2 py-[2px] text-[11px] ${i.partId ? 'cursor-pointer hover:bg-hover' : ''}`}>
                <span className={`num w-12 shrink-0 ${i.level === 'error' ? 'text-neg' : 'text-warn'}`}>{i.level === 'error' ? 'BLOCK' : 'WARN'}</span>
                <span>{i.text}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* right drawer */}
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto border-l border-line bg-carbon p-2">
        {part && <PartInspector part={part} />}
        <Panel title="Readout" className="shrink-0" bodyClass="px-2 py-1">
          <Row k="Unit cost" v={money(ev.unitCost)} tone="text-accent" />
          <Row k="Screen" v={`${ev.report.diag.toFixed(2)}" / ${pct(ev.report.sbr)} of front`} />
          <Row k="Weight" v={`${Math.round(ev.report.weight)} g`} tone={ev.report.weight > 230 ? 'text-warn' : undefined} />
          <Row k="Battery life" v={`${ev.report.lifeHours.toFixed(1)} h`} />
          <Row k="Development" v={`${money(plan.cost)} / ${plan.days} days`} />
        </Panel>
        <Panel title="Design score" right={<span className="num text-sm text-accent">{Math.round(ev.report.pct)}</span>} className="shrink-0" bodyClass="px-2 py-1">
          {ev.report.breakdown.map((b) => (
            <div key={b.key} className="flex items-center gap-2 py-[3px]">
              <span className="w-36 text-[11px] text-dim">{b.label}</span>
              {b.max > 0 ? <Meter value={b.score} max={b.max} tone={b.score / b.max > 0.75 ? 'pos' : b.score / b.max > 0.4 ? 'accent' : 'warn'} /> : <div className="flex-1" />}
              <span className={`num w-12 text-right text-[11px] ${b.score < 0 ? 'text-neg' : ''}`}>{b.max > 0 ? `${b.score.toFixed(1)}/${b.max}` : b.score.toFixed(0)}</span>
            </div>
          ))}
        </Panel>
        <Panel title="Segment appeal" right={<span className="label">best: {best.seg.name}</span>} className="shrink-0" bodyClass="px-2 py-1">
          <div className="flex items-center justify-between py-1">
            <span className="text-[11px] text-dim">Test price</span>
            <NumInput value={price} onChange={setPrice} className="h-6 w-24 text-right" step={10} />
          </div>
          {SEGMENTS.map((seg) => {
            const a = appeal(probe, brand, seg, g.day)
            return (
              <div key={seg.id} className="flex items-center gap-2 py-[3px]">
                <span className="w-20 text-[11px] text-dim">{seg.name}</span>
                <Meter value={a} max={100} tone={a > 70 ? 'pos' : a > 40 ? 'accent' : 'dim'} />
                <span className="num w-8 text-right text-[11px]">{Math.round(a)}</span>
              </div>
            )
          })}
          <Row k="Margin per unit" v={money(margin)} tone={margin > 0 ? 'text-pos' : 'text-neg'} />
        </Panel>
        <div className="mt-auto flex shrink-0 gap-2">
          <Btn className="flex-1" onClick={closeDesigner}>
            Cancel
          </Btn>
          <Btn tone="primary" className="flex-[2]" disabled={errors.length > 0} onClick={() => setLaunching(true)}>
            {errors.length ? `${errors.length} blocking` : 'Proceed to launch'}
          </Btn>
        </div>
      </div>

      {launching && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-carbon/80">
          <Panel title="Launch plan" className="w-[420px]" bodyClass="p-3">
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">Device name</span>
              <TextInput value={name} onChange={setName} maxLength={28} className="w-56" />
            </label>
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">Retail price</span>
              <NumInput value={price} onChange={setPrice} step={10} className="w-56 text-right" />
            </label>
            <label className="flex items-center justify-between gap-2 py-1">
              <span className="text-[11px] text-dim">First production run</span>
              <NumInput value={quantity} onChange={setQuantity} step={1000} className="w-56 text-right" />
            </label>
            <Slider label="Launch marketing" value={marketing} min={0} max={20e6} step={50e3} format={(v) => money(v)} onChange={setMarketing} />
            <div className="mt-2 border-t border-line pt-2">
              <Row k="Development" v={money(plan.cost)} />
              <Row k={`Production (${num(quantity)} x ${money(ev.unitCost)})`} v={money(quantity * ev.unitCost)} />
              <Row k="Marketing" v={money(marketing)} />
              <Row k="Total due now" v={money(total)} tone={canAfford(g, total) ? 'text-accent' : 'text-neg'} />
              <Row k="Revenue if the run sells out" v={money(quantity * price * (1 - RETAIL_CUT))} />
              <Row k="Margin per unit (after 15% retail cut)" v={money(margin)} tone={margin > 0 ? 'text-pos' : 'text-neg'} />
              <Row k="Best-fit segment" v={best.seg.name} />
              <Row k="Release" v={`in ${plan.days} days`} />
            </div>
            <div className="mt-3 flex gap-2">
              <Btn className="flex-1" onClick={() => setLaunching(false)}>
                Back
              </Btn>
              <Btn tone="primary" className="flex-[2]" disabled={!canAfford(g, total)} onClick={launch}>
                {canAfford(g, total) ? 'Start development' : 'Not enough cash'}
              </Btn>
            </div>
          </Panel>
        </div>
      )}
    </div>
  )
}
