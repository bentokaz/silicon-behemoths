// The panels behind a factory's status line: its lines and what holds each
// back, the plant (shifts, power, crew, servicing, faults), its machines by
// kind with tiers and modules, the components it makes for itself, and the
// blueprints that copy a line from one floor to another.
import { setFactoryOverlay, useFactoryOverlay } from '../3d/site/overlay'
import { sfx } from '../audio/sfx'
import { MAX_MODS, MODULES, type Module, PART_NAME, SHIFT_MULT, SHIFT_WAGE, TIER_NAME, partsFactor, partsFor, tierOf } from '../sim/factoryline'
import { assignLine, blueprintCost, clearModules, deleteBlueprint, fitModule, placeBlueprint, saveBlueprint, setShifts, upgradeCost, upgradeKind } from '../sim/game'
import { ITEMS, type LineStats } from '../sim/sites'
import type { GameState, Site } from '../sim/types'
import { useStore } from '../store/game'
import { BarRow, Fact, Note, Sec } from './SitesParts'
import { Btn, ConfirmBtn, IconBtn, Pick, money, num, pct } from './ui'

const run = (f: (s: GameState) => string | null, ok: () => void = sfx.confirm) => {
  const { act, say } = useStore.getState()
  const err = act(f)
  if (err) say(err, 'bad')
  else ok()
}

/** Each line: what it makes a day, what it is set to build, what holds it back. */
export function LinesPanel({ g, at, site, line, onGuide }: { g: GameState; at: string; site: Site; line: LineStats; onGuide: () => void }) {
  const overlay = useFactoryOverlay()
  const mine = g.products.filter((p) => p.companyId === 'player' && p.status !== 'ended')
  const lines = line.lines
  const help = <IconBtn small icon="help" tone="ghost" title="How factories work" onClick={onGuide} />
  if (!lines.length) {
    return (
      <Sec title="Lines" right={help}>
        <Note tone="warn">{line.problem ?? 'There is no line yet.'}</Note>
      </Sec>
    )
  }
  return (
    <Sec title="Lines" count={lines.length} right={<span className="flex gap-1">{help}<Btn small tone={overlay.rates ? 'primary' : 'ghost'} icon="eye" title="Show the kits a day on every joint, and colour the belts by how full they run" onClick={() => setFactoryOverlay({ rates: !overlay.rates })}>Rates</Btn></span>}>
      <div className="mb-1 text-[11px] text-dim">
        <span className="num text-fg">{num(line.throughput)}</span> a day, <span className="num text-fg">{num(line.throughput * 30)}</span> a month, {pct(1 - line.defectRate, 1)} fault-free
      </div>
      {lines.map((l, i) => {
        const focus = l.limit && overlay.focus.length > 0 && overlay.focus[0] === l.limit.ids[0]
        return (
          <div key={l.id} className="border-t border-line py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs text-fg">Line {i + 1}</span>
              <span className={`num ml-auto text-[11px] ${l.running ? 'text-fg' : 'text-warn'}`}>{l.running ? `${num(l.throughput)} a day` : 'stopped'}</span>
            </div>
            {l.running ? (
              <>
                {l.limit && (
                  <div className="mt-0.5 flex items-start gap-1">
                    <span className="flex-1 text-[11px] text-dim">{l.limit.reason}</span>
                    <Btn small tone={focus ? 'primary' : 'ghost'} icon="target" title="Mark what holds this line back on the floor" onClick={() => setFactoryOverlay(focus ? { focus: [], why: '' } : { focus: l.limit!.ids, why: l.limit!.reason })}>
                      {focus ? 'Hide' : 'Show'}
                    </Btn>
                  </div>
                )}
                <div className="mt-1 flex items-center gap-1">
                  <Pick
                    label="Builds"
                    className="flex-1"
                    value={site.assign?.[l.id] ?? ''}
                    options={[{ value: '', label: 'Whatever is on order' }, ...mine.map((p) => ({ value: p.id, label: p.name }))]}
                    onChange={(v) => run((s) => assignLine(s, at, l.id, v || null), sfx.click)}
                  />
                  <IconBtn small icon="save" tone="ghost" title="Save this line as a blueprint, to place it again here or in another factory" onClick={() => run((s) => saveBlueprint(s, at, l.id))} />
                </div>
              </>
            ) : (
              <div className="text-[11px] text-warn">{l.problem}</div>
            )}
          </div>
        )
      })}
      {line.loose.length > 0 && <Note tone="dim">{line.loose.length === 1 ? 'One block is' : `${line.loose.length} blocks are`} not joined to a receiving dock.</Note>}
    </Sec>
  )
}

/** Shifts, power, crew, servicing and faults: the plant around the lines. */
export function PlantPanel({ at, line, wealth }: { at: string; line: LineStats; wealth: number }) {
  const p = line.plant
  return (
    <Sec title="Plant">
      <Pick
        label="Shifts"
        value={p.shifts}
        options={[1, 2, 3].map((n) => ({ value: n, label: `${n} ${n === 1 ? 'shift' : 'shifts'}: ${pct(SHIFT_MULT[n - 1], 0)} output` }))}
        onChange={(v) => run((s) => setShifts(s, at, Number(v)), sfx.click)}
      />
      <BarRow label="Power" share={p.power} value={`${(p.demand / 1000).toFixed(1)} MW`} tone={p.power < 1 ? 'neg' : 'accent'} title={`${num(p.supply)} kW to be had against ${num(p.demand)} kW wanted. Short of power, every machine slows. A substation, a generator or solar arrays add more.${p.solar ? ` The solar roof gives ${num(p.solar)} kW.` : ''}`} />
      {p.solar > 0 && <Fact k="Solar roof" v={`${num(p.solar)} kW`} num />}
      <BarRow label="Crew rooms" share={p.crew ? Math.min(1, (p.housed + 12) / p.crew) : 1} value={`${num(p.crew)} a shift`} tone={p.crewEff < 1 ? 'warn' : 'accent'} title={`Workers a shift, and room for them: lockers and canteen tables in a crew room. Twelve can make do without. Each costs ${money(SHIFT_WAGE * wealth)} a shift.`} />
      <BarRow label="Uptime" share={p.uptime} value={pct(p.uptime, 1)} tone={p.uptime < 0.95 ? 'warn' : 'accent'} title={`Share of the time the machines run. ${num(p.serviced)} of ${num(p.machines)} machines are serviced by control desks and maintenance workshops; higher tiers break down less, and buffers ride out what is left.`} />
      <BarRow label="Fault-free" share={1 - line.defectRate} value={pct(1 - line.defectRate, 1)} tone={line.defectRate > 0.02 ? 'warn' : 'pos'} title={`Off the machines ${pct(p.rawDefect, 1)} of units are faulty; testing catches ${pct(p.caught, 0)} of them, ${pct(p.scrap, 1)} of output is scrapped and the rest reworked. Test stations, inspection benches and quality modules help.`} />
      <Fact k="Wages, power and fuel a day" v={money((p.wages * wealth + p.energy + p.fuel) || 0)} num />
    </Sec>
  )
}

/** Machines by kind: how many at each tier, raised a tier or fitted with modules all at once. */
export function MachinesPanel({ at, site }: { at: string; site: Site }) {
  const kinds = new Map<string, typeof site.items>()
  for (const it of site.items) {
    const def = ITEMS.factory[it.kind]
    if (!def || !(def.cap || def.stage === 'in')) continue
    kinds.set(it.kind, [...(kinds.get(it.kind) ?? []), it])
  }
  if (!kinds.size) return null
  return (
    <Sec title="Machines" count={site.items.filter((it) => ITEMS.factory[it.kind]?.cap).length}>
      {[...kinds].map(([kind, list]) => {
        const def = ITEMS.factory[kind]
        const tiers = [1, 2, 3].map((t) => list.filter((it) => tierOf(it) === t).length)
        const next = list.map((it) => upgradeCost(it)).filter((c): c is number => c !== null)
        const low = Math.min(...list.map(tierOf))
        const lowCount = list.filter((it) => tierOf(it) === low && upgradeCost(it) !== null).length
        const mods = list.flatMap((it) => it.mods ?? [])
        return (
          <div key={kind} className="border-t border-line py-1.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs text-fg">{def.name}</span>
              <span className="num text-[11px] text-dim">{tiers.map((n, i) => (n ? `${n} x ${TIER_NAME[i]}` : '')).filter(Boolean).join(', ')}</span>
            </div>
            {mods.length > 0 && <div className="text-[11px] text-dim">{(['speed', 'quality', 'eff'] as Module[]).map((m) => (mods.filter((x) => x === m).length ? `${mods.filter((x) => x === m).length} ${MODULES[m].name.toLowerCase()}s` : '')).filter(Boolean).join(', ')}</div>}
            <div className="mt-1 flex flex-wrap gap-1">
              {next.length > 0 && (
                <ConfirmBtn small tone="default" icon="raise" confirm={`Pay up to ${money(lowCount * Math.min(...next))}?`} title={`Raises every tier ${TIER_NAME[low - 1]} ${def.name.toLowerCase()} to tier ${TIER_NAME[low]}, in place: more output, fewer faults and breakdowns, more power.`} onClick={() => run((s) => upgradeKind(s, at, kind))}>
                  Tier {TIER_NAME[low]} for {money(Math.min(...next))} each
                </ConfirmBtn>
              )}
              {def.cap &&
                (['speed', 'quality', 'eff'] as Module[]).map((m) => (
                  <Btn key={m} small tone="ghost" disabled={list.every((it) => (it.mods?.length ?? 0) >= MAX_MODS)} title={`${MODULES[m].name}, ${money(MODULES[m].cost)} each: ${MODULES[m].note} Each machine takes ${MAX_MODS}.`} onClick={() => run((s) => fitModule(s, at, kind, m))}>
                    + {m === 'eff' ? 'Efficiency' : m === 'speed' ? 'Speed' : 'Quality'}
                  </Btn>
                ))}
              {mods.length > 0 && <IconBtn small icon="bin" tone="ghost" title="Take the modules out (they are not refunded)" onClick={() => run((s) => clearModules(s, at, kind), sfx.click)} />}
            </div>
          </div>
        )
      })}
    </Sec>
  )
}

/** The components the lines make for themselves for the device each builds, against what they buy in. */
export function PartsPanel({ g, site, line }: { g: GameState; site: Site; line: LineStats }) {
  const running = line.lines.filter((l) => l.running)
  if (!running.length) return null
  const product = g.products.find((p) => p.id === site.assign?.[running[0].id]) ?? g.products.find((p) => p.companyId === 'player' && p.status === 'sale')
  if (!product) return null
  const l = running[0]
  const raw = Math.max(1, Math.min(l.caps.smt, l.caps.assembly, l.caps.pack, l.logistics))
  const { factor, made } = partsFactor(product.type, l.parts, l.throughput, l.throughput / raw)
  return (
    <Sec title="Components">
      <div className="mb-1 text-[11px] text-dim">
        Line 1 building {product.name}: parts it does not make are bought in ready-made. Unit cost {factor >= 1 ? '+' : ''}
        {pct(factor - 1, 1)} against a line that buys nothing in and makes nothing.
      </div>
      {partsFor(product.type).map((part) => (
        <BarRow key={part} label={PART_NAME[part]} share={made[part]} value={pct(made[part], 0)} tone={made[part] >= 1 ? 'pos' : made[part] > 0 ? 'accent' : 'dim'} title={`Share of the ${PART_NAME[part].toLowerCase()} this line needs that it makes itself. Put the machine that makes them on the line, before device assembly.`} />
      ))}
    </Sec>
  )
}

/** Saved lines, placed again here in one go. */
export function BlueprintsPanel({ g, at }: { g: GameState; at: string }) {
  const list = g.blueprints ?? []
  return (
    <Sec title="Blueprints" count={list.length || undefined}>
      {!list.length ? (
        <Note>Save a line from the list of lines to place it again, here or in another factory, in one go.</Note>
      ) : (
        list.map((bp) => (
          <div key={bp.id} className="flex items-center gap-1 border-t border-line py-1">
            <span className="min-w-0 flex-1 truncate text-xs text-fg" title={`${bp.items.length} blocks, ${bp.w} by ${bp.h} m`}>
              {bp.name}
            </span>
            <span className="num text-[11px] text-dim">
              {bp.w}x{bp.h}
            </span>
            <ConfirmBtn small tone="default" icon="build" confirm={`Pay ${money(blueprintCost(bp))}?`} title="Places it in the first spot in a hall where it fits, or zones a hall for it on open ground" onClick={() => run((s) => placeBlueprint(s, at, bp.id), sfx.zone)}>
              Place
            </ConfirmBtn>
            <IconBtn small icon="bin" tone="ghost" title="Delete the blueprint" onClick={() => run((s) => deleteBlueprint(s, bp.id), sfx.click)} />
          </div>
        ))
      )}
    </Sec>
  )
}
