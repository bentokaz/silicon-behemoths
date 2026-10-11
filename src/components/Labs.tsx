// Labs: design your own chips and build your own operating system.
import { useState } from 'react'
import { sfx } from '../audio/sfx'
import { chipInfo, refScore } from '../data/catalog'
import { setLicenceFee, startChip, startOs } from '../sim/game'
import { chipFor } from '../sim/scoring'
import { staffEffects } from '../sim/staff'
import { CHIP_BUDGET, OS_FEATURES, OS_FEATURES_PER_VERSION, STOCK_OS, chipAdoption, chipProjectCost, chipProjectDays, industryOs, osFeaturePoints, osProjectCost, osProjectDays, osShipQuality, servicesPerMonth, softwareBonus } from '../sim/tech'
import type { CustomChip } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Icon, type IconName } from './icons'
import { Btn, Empty, Kpi, Lead, Meter, Mini, Panel, Row, Slider, Tabs, Tag, TextInput, money, pct } from './ui'

/** The icon for each operating-system feature. */
const FEATURE_ICON: Record<string, IconName> = { fluid: 'swap', privacy: 'lock', assistant: 'mic', gaming: 'gamepad', continuity: 'social', updates: 'refresh', store: 'bag', pro: 'briefcase' }

function Chips() {
  const g = useGame()
  const { act, say, setTab } = useStore.getState()
  const [name, setName] = useState(`B${g.chips.length + 1}`)
  const [power, setPower] = useState(0.7)
  const [graphics, setGraphics] = useState(0.5)
  const [efficiency, setEfficiency] = useState(0.7)
  const gen = g.levels.chipset
  const used = power + graphics + efficiency
  const draft: CustomChip = { id: 'preview', name, gen, power, graphics, efficiency, status: 'ready', devDaysLeft: 0, quality: 1, licenceFee: 0, licenceIncome: 0 }
  const mine = chipFor({ customChip: 'preview' } as never, [draft])
  const helix = chipInfo(gen, 2)
  const fx = staffEffects(g)
  const busy = g.chips.some((c) => c.status === 'dev')
  const rel = (a: number, b: number) => `${a >= b ? '+' : ''}${pct(a / b - 1, 0)}`
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-2">
      <Panel title={`Design a chip on the x${gen}0 process`} icon="chip" bodyClass="overflow-y-auto p-3">
        <label className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-dim">
            <Lead icon="edit" />
            Name
          </span>
          <TextInput value={name} onChange={setName} maxLength={14} className="w-44" />
        </label>
        <div className="mt-2">
          <Slider label="Performance cores" icon="gauge" value={power} min={0} max={1} step={0.05} format={(v) => pct(v, 0)} onChange={setPower} />
          <Slider label="Graphics" icon="gamepad" value={graphics} min={0} max={1} step={0.05} format={(v) => pct(v, 0)} onChange={setGraphics} />
          <Slider label="Efficiency" icon="battery" value={efficiency} min={0} max={1} step={0.05} format={(v) => pct(v, 0)} onChange={setEfficiency} />
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="w-28 whitespace-nowrap text-[11px] text-dim">
            <Lead icon="chip" />
            Silicon budget
          </span>
          <Meter value={used} max={CHIP_BUDGET} tone={used > CHIP_BUDGET + 1e-6 ? 'neg' : 'accent'} />
          <span className={`num w-16 text-right text-[11px] ${used > CHIP_BUDGET + 1e-6 ? 'text-neg' : 'text-fg'}`}>
            {pct(used / CHIP_BUDGET, 0)}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1">
          <Mini label={`Speed vs ${helix.name}`} icon="gauge" value={rel(mine.perf, helix.perf)} tone={mine.perf >= helix.perf ? 'text-pos' : 'text-warn'} />
          <Mini label="Battery efficiency" icon="battery" value={rel(mine.eff, helix.eff)} tone={mine.eff >= helix.eff ? 'text-pos' : 'text-warn'} />
          <Mini label="Cost per chip" icon="tag" value={`${money(mine.cost)} (${rel(mine.cost, helix.cost)})`} tone={mine.cost <= helix.cost ? 'text-pos' : 'text-warn'} />
        </div>
        <div className="mt-2 text-[10px] leading-snug text-faint">Shown for an average team. A strong hardware team finishes sooner and can lift the result by up to 8%; a weak one loses up to 12%. Research the Chipset track first to design on a newer process.</div>
        <div className="mt-3 border-t border-line pt-2">
          <Row icon="cash" k="Project cost" v={money(chipProjectCost(gen))} />
          <Row icon="hourglass" k="Time with your hardware team" v={`${chipProjectDays(g)} days`} />
          <Row icon="wrench" k="Hardware team strength" v={fx.hardware.toFixed(1)} tone={fx.hardware > 0 ? undefined : 'text-warn'} />
        </div>
        {fx.hardware <= 0 ? (
          <Btn icon="hire" className="mt-3 w-full" onClick={() => setTab('staff')}>
            Hire a hardware engineer first
          </Btn>
        ) : (
          <Btn
            tone="primary"
            icon="play"
            className="mt-3 h-9 w-full"
            disabled={busy || used > CHIP_BUDGET + 1e-6}
            onClick={() => {
              const err = act((s) => startChip(s, name, power, graphics, efficiency))
              if (err) say(err, 'bad')
              else (sfx.confirm(), say(`${name} is in development.`), setName(`B${g.chips.length + 1}`))
            }}
          >
            {busy ? 'A chip is already in development' : `Start the ${name} project`}
          </Btn>
        )}
      </Panel>
      <Panel title={`Your chips (${g.chips.length})`} icon="labs" bodyClass="overflow-y-auto">
        {g.chips.length === 0 && <Empty icon="chip" text="Your own chip costs less per unit than buying one in, and you choose what it is good at. Once it is ready it appears in the designer under Internals, and you can license it to rivals." />}
        {[...g.chips].reverse().map((c) => {
          const spec = chipFor({ customChip: c.id } as never, [{ ...c, status: 'ready' }])
          const ref = chipInfo(c.gen, 2)
          const adoption = chipAdoption(g, c)
          return (
            <div key={c.id} className="border-b border-line p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-fg">
                  {c.name} <span className="num text-[10px] font-normal text-faint">x{c.gen}0 process</span>
                </span>
                {c.status === 'dev' ? <Tag tone="warn" icon="hourglass">{c.devDaysLeft} days left</Tag> : <Tag tone="pos" icon="check">ready</Tag>}
              </div>
              {c.status === 'ready' && (
                <>
                  <div className="mt-2 grid grid-cols-4 gap-1">
                    <Mini label="Speed" icon="gauge" value={`${Math.round((spec.perf / refScore(c.gen)) * 100)}`} tone="text-fg" />
                    <Mini label="Efficiency" icon="battery" value={`${Math.round((spec.eff / ref.eff) * 100)}`} />
                    <Mini label="Cost" icon="tag" value={money(spec.cost)} />
                    <Mini label="Build quality" icon="medal" value={pct(c.quality, 0)} tone={c.quality >= 1 ? 'text-pos' : 'text-warn'} />
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex-1">
                      <Slider label="Licence fee per rival device" icon="doc" value={c.licenceFee} min={0} max={40} format={(v) => (v ? money(v) : 'not offered')} onChange={(v) => act((s) => setLicenceFee(s, c.id, v))} />
                    </div>
                    <div className="w-40">
                      <div className="num text-[11px] text-fg">{c.licenceFee ? `${pct(adoption)} of rival devices` : '--'}</div>
                      <div className="num text-[10px] text-faint">earned so far {money(c.licenceIncome, 1)}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </Panel>
    </div>
  )
}

function Software() {
  const g = useGame()
  const { act, say, setTab } = useStore.getState()
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
  const toggle = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="grid shrink-0 grid-cols-4 gap-2">
        <Kpi label="Your devices run" icon="os" value={os.own ? `${os.name} ${os.version}` : STOCK_OS} sub={os.own ? 'your own operating system' : 'the stock system everyone licenses'} tone={os.own ? 'accent' : undefined} />
        <Kpi label="Quality" icon="medal" value={os.own ? Math.round(os.quality) : Math.round(industry)} sub={`buyers expect ${Math.round(industry)} today, and more each year`} tone={os.own ? (os.quality >= industry ? 'pos' : 'neg') : undefined} />
        <Kpi label="Effect on device appeal" icon="heart" value={`${bonus >= 0 ? '+' : ''}${pct(bonus)}`} tone={bonus > 0 ? 'pos' : bonus < 0 ? 'neg' : undefined} sub="applies to everything you sell" />
        <Kpi label="Services income" icon="coins" value={`${money(servicesPerMonth(g), 1)} / mo`} sub={os.features.includes('store') ? `from ${Math.round(g.owners).toLocaleString()} owners` : 'needs an app store'} />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,6fr)_minmax(0,5fr)] gap-2">
        <Panel title={first ? 'Features for version 1' : `Features for version ${os.version + 1}`} icon="feed" bodyClass="overflow-y-auto">
          {OS_FEATURES.map((f) => {
            const have = os.features.includes(f.id)
            const on = have || picked.includes(f.id)
            return (
              <button key={f.id} disabled={have || !!os.project} onClick={() => toggle(f.id)} className={`flex w-full items-start gap-3 border-b border-line px-3 py-2 text-left ${have ? 'opacity-60' : 'hover:bg-hover'}`}>
                <span className={`mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center border ${on ? 'border-accent bg-accent text-carbon' : 'border-line2 text-transparent'}`}>
                  <Icon name="check" size={10} />
                </span>
                <span className="flex-1">
                  <span className="text-[12px] text-fg">
                    <Lead icon={FEATURE_ICON[f.id]} size={12} />
                    {f.name}
                  </span>
                  <span className="block text-[11px] leading-snug text-dim">{f.note}</span>
                </span>
                {have ? <Tag tone="pos" icon="check">shipped</Tag> : <span className="num text-[10px] text-faint">+{f.points}</span>}
              </button>
            )
          })}
        </Panel>
        <Panel title={os.project ? 'In development' : first ? 'Build your own operating system' : 'Next version'} icon={os.project ? 'hourglass' : 'os'} bodyClass="overflow-y-auto p-3">
          {os.project ? (
            <>
              <div className="text-sm text-fg">
                {os.name} {os.version + 1}
              </div>
              <Meter value={os.project.total - os.project.daysLeft} max={os.project.total} className="mt-2" />
              <div className="num mt-1 text-[11px] text-dim">
                <Lead icon="hourglass" />
                {os.project.daysLeft} days left
              </div>
              <div className="mt-2 text-[11px] leading-snug text-dim">It ships to every device you sell the day it is finished. Its quality depends on your software team on that day.</div>
            </>
          ) : (
            <>
              {first && (
                <>
                  <div className="text-[11px] leading-snug text-dim">Today your devices run {STOCK_OS}, which is free and exactly as good as buyers expect. Your own system can be better than that, which lifts every device you sell, and with an app store it earns money from everyone who owns one. It can also be worse, if the team is weak or you let it age.</div>
                  <label className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-dim">
                      <Lead icon="edit" />
                      Name
                    </span>
                    <TextInput value={name} onChange={setName} maxLength={16} className="w-44" />
                  </label>
                </>
              )}
              <div className="mt-3 grid grid-cols-2 gap-1">
                <Mini label="Would ship at quality" icon="medal" value={Math.round(osShipQuality(g, all))} tone={osShipQuality(g, all) >= industry ? 'text-pos' : 'text-neg'} />
                <Mini label="Buyers expect" icon="target" value={Math.round(industry)} />
                <Mini label="From features" icon="feed" value={`+${osFeaturePoints(g, all)}`} />
                <Mini label="Software team strength" icon="code" value={fx.software.toFixed(1)} tone={fx.software > 0 ? undefined : 'text-warn'} />
              </div>
              <div className="mt-3 border-t border-line pt-2">
                <Row icon="feed" k="New features in this version" v={`${fresh.length} of ${OS_FEATURES_PER_VERSION}`} tone={fresh.length > OS_FEATURES_PER_VERSION ? 'text-neg' : undefined} />
                <Row icon="cash" k="Project cost" v={money(cost)} />
                <Row icon="hourglass" k="Time with your software team" v={`${osProjectDays(g, first)} days`} />
              </div>
              {fx.software <= 0 ? (
                <Btn icon="hire" className="mt-3 w-full" onClick={() => setTab('staff')}>
                  Hire a software engineer first
                </Btn>
              ) : (
                <Btn
                  tone="primary"
                  icon="play"
                  className="mt-3 h-9 w-full"
                  disabled={fresh.length > OS_FEATURES_PER_VERSION}
                  onClick={() => {
                    const err = act((s) => startOs(s, name, picked))
                    if (err) say(err, 'bad')
                    else (sfx.confirm(), setPicked([]), say(first ? `${name} is in development.` : 'The next version is in development.'))
                  }}
                >
                  {first ? `Start building ${name || 'it'}` : `Start version ${os.version + 1}`}
                </Btn>
              )}
              {!first && <div className="mt-2 text-[10px] leading-snug text-faint">Even with no new features, a new version brings the system back up to date. Expectations rise by about two points a year.</div>}
            </>
          )}
        </Panel>
      </div>
    </div>
  )
}

export function LabsScreen() {
  const g = useGame()
  const [view, setView] = useState<'chips' | 'os'>('chips')
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <Tabs value={view} onChange={setView} options={[{ value: 'chips', label: 'Chips', icon: 'chip', badge: g.chips.length || undefined }, { value: 'os', label: 'Operating system', icon: 'os', badge: g.os.own ? `v${g.os.version}` : undefined }]} />
      <div className="min-h-0 flex-1">{view === 'chips' ? <Chips /> : <Software />}</div>
    </div>
  )
}
