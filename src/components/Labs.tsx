// Research, page "Labs": design your own chips and build your own operating system.
import { useState } from 'react'
import { sfx } from '../audio/sfx'
import { chipInfo, refScore } from '../data/catalog'
import { canAfford, setLicenceFee, startChip, startOs } from '../sim/game'
import { chipFor } from '../sim/scoring'
import { staffEffects } from '../sim/staff'
import { CHIP_BUDGET, OS_FEATURES, OS_FEATURES_PER_VERSION, STOCK_OS, chipAdoption, chipProjectCost, chipProjectDays, industryOs, osProjectCost, osProjectDays, osShipQuality, servicesPerMonth, softwareBonus } from '../sim/tech'
import type { CustomChip } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Icon, type IconName } from './icons'
import { timeSpan } from './researchNow'
import { Btn, type Column, Empty, Filters, Help, Lead, Meter, Mini, Panel, Row, Slider, Strip, Table, Tag, TextInput, int, money, pct, price, useKept } from './ui'

/** The icon for each operating-system feature. */
const FEATURE_ICON: Record<string, IconName> = { fluid: 'swap', privacy: 'lock', assistant: 'mic', gaming: 'gamepad', continuity: 'social', updates: 'refresh', store: 'bag', pro: 'briefcase' }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
/** A difference from a reference, as a signed percentage. */
const rel = (a: number, b: number) => `${a >= b ? '+' : ''}${pct(a / b - 1, 0)}`

function Chips() {
  const g = useGame()
  const { act, say, go } = useStore.getState()
  const [name, setName] = useState(`B${g.chips.length + 1}`)
  const [power, setPower] = useState(0.7)
  const [graphics, setGraphics] = useState(0.5)
  const [efficiency, setEfficiency] = useState(0.7)
  const [picked, setPicked] = useKept<string | null>('labs:chip', null)
  const gen = g.levels.chipset
  const used = power + graphics + efficiency
  const over = used > CHIP_BUDGET + 1e-6
  const draft: CustomChip = { id: 'preview', name, gen, power, graphics, efficiency, status: 'ready', devDaysLeft: 0, quality: 1, licenceFee: 0, licenceIncome: 0 }
  const mine = chipFor({ customChip: 'preview' } as never, [draft])
  const helix = chipInfo(gen, 2)
  const fx = staffEffects(g)
  const busy = g.chips.some((c) => c.status === 'dev')
  const cost = chipProjectCost(gen)
  // what the team would make of it, as the simulation works it out on the day the chip is finished (give or take two points of luck)
  const quality = 0.9 + Math.min(0.14, 0.035 * fx.hardware)
  const why = busy ? 'Wait for the chip in development to finish' : over ? 'The design is over its silicon budget: lower one of the three sliders' : !name.trim() ? 'Give the chip a name' : !canAfford(g, cost) ? `Not enough cash: the project costs ${money(cost)}` : undefined

  const chips = [...g.chips].reverse()
  const specOf = (c: CustomChip) => chipFor({ customChip: c.id } as never, [{ ...c, status: 'ready' }])
  const ready = chips.filter((c) => c.status === 'ready')
  const sel = ready.find((c) => c.id === picked) ?? ready[0]
  const cols: Column<CustomChip>[] = [
    {
      id: 'name',
      head: 'Chip',
      sort: (c) => c.name,
      cell: (c) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-fg">{c.name}</span>
          {c.status === 'dev' && (
            <Tag tone="warn" icon="hourglass">
              {timeSpan(c.devDaysLeft)} left
            </Tag>
          )}
        </span>
      ),
    },
    { id: 'gen', head: 'Process', min: 72, drop: 4, sort: (c) => c.gen, cell: (c) => <span className="num text-dim">x{c.gen}0</span> },
    { id: 'speed', head: 'Speed', title: 'Speed, where 100 is what a top chip of its process reaches', num: true, min: 64, sort: (c) => specOf(c).perf / refScore(c.gen), cell: (c) => int((specOf(c).perf / refScore(c.gen)) * 100) },
    { id: 'eff', head: 'Efficiency', title: 'Battery efficiency, where 100 is the bought-in chip of its process', num: true, min: 84, drop: 3, sort: (c) => specOf(c).eff / chipInfo(c.gen, 2).eff, cell: (c) => int((specOf(c).eff / chipInfo(c.gen, 2).eff) * 100) },
    { id: 'cost', head: 'Cost', title: 'What one chip costs you to make', num: true, min: 64, sort: (c) => specOf(c).cost, cell: (c) => price(specOf(c).cost) },
    { id: 'quality', head: 'Quality', title: 'How well the team built it', num: true, min: 72, drop: 2, sort: (c) => c.quality, cell: (c) => (c.status === 'ready' ? <span className={c.quality >= 1 ? 'text-pos' : 'text-warn'}>{pct(c.quality, 0)}</span> : '') },
    { id: 'fee', head: 'Licence', title: 'What rivals pay you for each device that uses it', num: true, min: 72, sort: (c) => c.licenceFee, cell: (c) => (c.status !== 'ready' ? '' : c.licenceFee ? price(c.licenceFee) : <span className="font-sans text-dim">none</span>) },
    { id: 'earned', head: 'Earned', title: 'Licence income so far', num: true, min: 72, drop: 1, sort: (c) => c.licenceIncome, cell: (c) => (c.licenceIncome ? money(c.licenceIncome) : '') },
  ]

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-2">
      <Panel
        title={`Design a chip on the x${gen}0 process`}
        icon="chip"
        bodyClass="overflow-y-auto px-3 py-2"
        right={
          <Help title="How chip design works">
            <p>The three sliders share one silicon budget: more of one leaves less for the others. The figures under them compare your design with the chip you would otherwise buy in.</p>
            <p className="mt-2">A strong hardware team finishes sooner and builds it better; a weak one loses up to 12%. Research the Chipset track, under Research, Technology, to design on a newer process.</p>
            <p className="mt-2">A finished chip appears in the designer under Internals, and can be licensed to rivals.</p>
          </Help>
        }
      >
        <label className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-dim">Name</span>
          <TextInput value={name} onChange={setName} maxLength={14} className="w-44" />
        </label>
        <div className="mt-1">
          <Slider label="Performance cores" icon="gauge" value={power} min={0} max={1} step={0.05} format={(v) => pct(v, 0)} onChange={setPower} />
          <Slider label="Graphics" icon="gamepad" value={graphics} min={0} max={1} step={0.05} format={(v) => pct(v, 0)} onChange={setGraphics} />
          <Slider label="Efficiency" icon="battery" value={efficiency} min={0} max={1} step={0.05} format={(v) => pct(v, 0)} onChange={setEfficiency} />
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="w-28 shrink-0 whitespace-nowrap text-[11px] text-dim">Silicon budget</span>
          <Meter value={used} max={CHIP_BUDGET} tone={over ? 'neg' : 'accent'} />
          <span className={`num w-12 shrink-0 text-right text-[11px] ${over ? 'text-neg' : 'text-fg'}`}>{pct(used / CHIP_BUDGET, 0)}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1">
          <Mini label="Speed" title={`Against the ${helix.name} you would buy in`} value={rel(mine.perf, helix.perf)} tone={mine.perf >= helix.perf ? 'text-pos' : 'text-warn'} />
          <Mini label="Battery life" title={`Against the ${helix.name} you would buy in`} value={rel(mine.eff, helix.eff)} tone={mine.eff >= helix.eff ? 'text-pos' : 'text-warn'} />
          <Mini label="Cost per chip" title={`The ${helix.name} costs ${price(helix.cost)}`} value={price(mine.cost)} tone={mine.cost <= helix.cost ? 'text-pos' : 'text-warn'} />
        </div>
        <div className="mt-1 text-[11px] text-dim">Speed and battery life are against the {helix.name} you would buy in.</div>
        <div className="mt-2 border-t border-line pt-1">
          <Row k="Project cost" v={money(cost)} />
          <Row k="Time with your hardware team" v={<span className="font-sans">{timeSpan(chipProjectDays(g))}</span>} />
          {fx.hardware > 0 && <Row k="Build quality your team reaches" v={`about ${pct(clamp(quality, 0.88, 1.08), 0)}`} tone={quality >= 1 ? 'text-pos' : 'text-warn'} />}
        </div>
        {fx.hardware <= 0 ? (
          <>
            <div className="mt-2 text-xs text-warn">
              <Lead icon="lock" />A chip needs at least one hardware engineer at a desk.
            </div>
            <Btn icon="hire" className="mt-2 w-full" onClick={() => go({ tab: 'staff', view: 'hire', role: 'engineer' })}>
              Go to Campus, Hiring
            </Btn>
          </>
        ) : (
          <Btn
            tone="primary"
            large
            icon="play"
            className="mt-3 w-full"
            disabled={!!why}
            title={why}
            onClick={() => {
              const err = act((s) => startChip(s, name, power, graphics, efficiency))
              if (err) say(err, 'bad')
              else (sfx.confirm(), say(`${name} is in development. It cost ${money(cost)}.`), setName(`B${g.chips.length + 2}`))
            }}
          >
            {busy ? 'A chip is already in development' : `Start the ${name.trim() || 'chip'} project`}
          </Btn>
        )}
      </Panel>

      <Panel title="Your chips" icon="labs" count={g.chips.length || undefined} bodyClass="flex flex-col">
        {g.chips.length === 0 ? (
          <Empty icon="chip" text="Your own chip costs less per unit than buying one in, and you choose what it is good at. Once it is ready it appears in the designer under Internals, and you can license it to rivals." />
        ) : (
          <>
            <Table label="Your chips" className="min-h-0 flex-1 overflow-y-auto" cols={cols} rows={chips} rowKey={(c) => c.id} keep="labs:chips" firstMin={130} selected={sel?.id ?? null} onRow={(c) => c.status === 'ready' && setPicked(c.id)} rowTitle={(c) => (c.status === 'ready' ? 'Set its licence fee below' : 'Still in development')} />
            {sel && (
              <div className="shrink-0 border-t border-line px-3 py-2">
                <Slider label={`Licence ${sel.name} to rivals, per device`} icon="doc" value={sel.licenceFee} min={0} max={40} format={(v) => price(v)} onChange={(v) => act((s) => setLicenceFee(s, sel.id, v))} />
                <div className="text-[11px] text-dim">{sel.licenceFee ? `At this fee ${pct(chipAdoption(g, sel))} of rival devices would use it. A lower fee is taken up by more of them.` : 'At $0 it is not offered. Set a fee and rivals take it up when it is good value against the chip they buy in.'}</div>
              </div>
            )}
          </>
        )}
      </Panel>
    </div>
  )
}

function Software() {
  const g = useGame()
  const { act, say, go } = useStore.getState()
  const os = g.os
  const [name, setName] = useState('BehemothOS')
  const [picked, setPicked] = useState<string[]>([])
  const fx = staffEffects(g)
  const industry = industryOs(g.day)
  const fresh = picked.filter((f) => !os.features.includes(f))
  const all = [...new Set([...os.features, ...picked])]
  const first = !os.own
  const cost = osProjectCost(first, fresh.length)
  const bonus = softwareBonus(g)
  const ship = osShipQuality(g, all)
  const services = servicesPerMonth(g)
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  const tooMany = fresh.length > OS_FEATURES_PER_VERSION
  const why = tooMany ? `A version can add ${OS_FEATURES_PER_VERSION} new features at most: untick some` : first && !name.trim() ? 'Give the system a name' : !canAfford(g, cost) ? `Not enough cash: the project costs ${money(cost)}` : undefined
  return (
    <>
      <Strip
        items={[
          { label: 'Your devices run', icon: 'os', value: <span className="font-sans">{os.own ? `${os.name} ${os.version}` : `${STOCK_OS}, the stock system`}</span> },
          ...(os.own ? [{ label: 'Quality', value: int(os.quality), tone: os.quality >= industry ? ('pos' as const) : ('neg' as const), title: 'Against what buyers expect of a system today' }] : []),
          { label: 'Buyers expect', value: int(industry), title: 'It rises by about two points a year' },
          ...(os.own ? [{ label: 'Device appeal', value: `${bonus >= 0 ? '+' : ''}${pct(bonus)}`, tone: bonus > 0 ? ('pos' as const) : bonus < 0 ? ('neg' as const) : undefined, title: 'Applies to everything you sell' }] : []),
          ...(os.features.includes('store') ? [{ label: 'Services, a month', value: money(services), title: `From ${int(g.owners)} owners` }] : []),
        ]}
      />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,6fr)_minmax(0,5fr)] gap-2">
        <Panel title={`Features for version ${os.version + 1}: pick up to ${OS_FEATURES_PER_VERSION}`} icon="feed" bodyClass="overflow-y-auto">
          {OS_FEATURES.map((f) => {
            const have = os.features.includes(f.id)
            const on = have || picked.includes(f.id)
            const off = have ? 'Already in your system' : os.project ? 'Wait for the version in development to ship' : undefined
            return (
              <button key={f.id} type="button" role="checkbox" aria-checked={on} disabled={!!off} title={off} onClick={() => toggle(f.id)} className="flex w-full items-center gap-3 border-b border-line px-3 py-[6px] text-left last:border-0 enabled:hover:bg-hover">
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center border ${have ? 'border-line2 text-dim' : on ? 'border-accent bg-accent text-carbon' : 'border-line2 text-transparent'}`}>
                  <Icon name="check" size={10} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-xs ${have ? 'text-dim' : 'text-fg'}`}>
                    <Lead icon={FEATURE_ICON[f.id]} size={12} />
                    {f.name}
                  </span>
                  <span className="block text-[11px] leading-snug text-dim">{f.note}</span>
                </span>
                {have ? (
                  <Tag tone="pos" icon="check">
                    Shipped
                  </Tag>
                ) : (
                  <span className="num shrink-0 text-[11px] text-dim" title="Points of quality it adds">
                    +{f.points}
                  </span>
                )}
              </button>
            )
          })}
        </Panel>
        <Panel
          title={os.project ? `${os.name} ${os.version + 1} in development` : first ? 'Build your own operating system' : `Version ${os.version + 1}`}
          icon={os.project ? 'hourglass' : 'os'}
          bodyClass="overflow-y-auto px-3 py-2"
          right={
            <Help title="How your own system works">
              <p>
                Until you build one your devices run {STOCK_OS}, which is free and exactly as good as buyers expect. Your own system can be better than that, which lifts every device you sell, and with an app store it earns money from everyone who owns one.
              </p>
              <p className="mt-2">It can also be worse, if the software team is weak or you let it age: what buyers expect rises by about two points a year. A new version brings it back up to date even with no new features.</p>
            </Help>
          }
        >
          {os.project ? (
            <>
              <div className="flex items-center gap-2">
                <Meter value={os.project.total - os.project.daysLeft} max={os.project.total} />
                <span className="shrink-0 whitespace-nowrap text-[11px] text-dim">{timeSpan(os.project.daysLeft)} left</span>
              </div>
              <div className="mt-2 text-xs leading-snug text-dim">It ships to every device you sell the day it is finished. Its quality depends on your software team on that day.</div>
            </>
          ) : (
            <>
              {first && (
                <label className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-dim">Name</span>
                  <TextInput value={name} onChange={setName} maxLength={16} className="w-44" />
                </label>
              )}
              <Row k="Would ship at quality" v={int(ship)} tone={ship >= industry ? 'text-pos' : 'text-neg'} />
              <Row k="Project cost" v={money(cost)} />
              <Row k="Time with your software team" v={<span className="font-sans">{timeSpan(osProjectDays(g, first))}</span>} />
              {fx.software <= 0 ? (
                <>
                  <div className="mt-2 text-xs text-warn">
                    <Lead icon="lock" />A system needs at least one software engineer at a desk.
                  </div>
                  <Btn icon="hire" className="mt-2 w-full" onClick={() => go({ tab: 'staff', view: 'hire', role: 'software' })}>
                    Go to Campus, Hiring
                  </Btn>
                </>
              ) : (
                <Btn
                  tone="primary"
                  large
                  icon="play"
                  className="mt-3 w-full"
                  disabled={!!why}
                  title={why}
                  onClick={() => {
                    const err = act((s) => startOs(s, name, picked))
                    if (err) say(err, 'bad')
                    else (sfx.confirm(), setPicked([]), say(`${first ? name : `Version ${os.version + 1}`} is in development. It cost ${money(cost)}.`))
                  }}
                >
                  {first ? `Start building ${name.trim() || 'it'}` : `Start version ${os.version + 1}`}
                </Btn>
              )}
              {tooMany && (
                <div className="mt-2 text-[11px] text-neg">
                  <Lead icon="alert" />A version can add {OS_FEATURES_PER_VERSION} new features at most. Untick {int(fresh.length - OS_FEATURES_PER_VERSION)}.
                </div>
              )}
            </>
          )}
        </Panel>
      </div>
    </>
  )
}

export function LabsScreen() {
  const g = useGame()
  const [view, setView] = useKept<'chips' | 'os'>('labs:view', 'chips')
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-4">
      <div className="shrink-0">
        <Filters label="Lab" value={view} onChange={setView} options={[{ value: 'chips', label: 'Chips', count: g.chips.length || undefined }, { value: 'os', label: 'Operating system' }]} />
      </div>
      {view === 'chips' ? <Chips /> : <Software />}
    </div>
  )
}
