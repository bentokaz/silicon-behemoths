// Sites, Factory: the factory floor in 3D. One line of status floats over it
// (what the line is making, output, quality, upkeep); the queue, the stages of
// the line and the move to a bigger site sit behind that line. Production
// orders live with the devices (Orders.tsx) and component supply with the
// company's money (Supply.tsx): neither is about this building.
import { sfx } from '../audio/sfx'
import { useEffect, useState } from 'react'
import { autoLine, buildFactory, fixFactoryLayout, growPlant, openPlant, roomCost, zoneable } from '../sim/game'
import { setFactoryOverlay } from '../3d/site/overlay'
import { REGIONS, homeRegion, regionInfo } from '../sim/regions'
import { BlueprintsPanel, LinesPanel, MachinesPanel, PartsPanel, PlantPanel } from './FactoryPanels'
import { CONTRACT, FACTORY_SAVING, factoryLine } from '../sim/ops'
import { ITEMS, SITE_TIERS, lineStats, planFix, starterLine, tierOf } from '../sim/sites'
import { FactoryGuide, guideSeen, markGuideSeen } from './FactoryGuide'
import type { GameState } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { SiteBuilder } from './SiteBuilder'
import { aSite, factoryNow, factoryStatus } from './SitesFigures'
import { BarRow, Detail, Fact, Note, Sec, SiteIntro } from './SitesParts'
import { Btn, ConfirmBtn, Meter, Pick, money, num, pct, useKept } from './ui'

export function FactoryScreen() {
  const g = useGame()
  const { act, say, go } = useStore.getState()
  const line = factoryLine(g)
  const [guide, setGuide] = useState(() => !guideSeen())
  const [kept, setAt] = useKept<string>('factory:plant', 'factory')
  const [region, setRegion] = useState(() => REGIONS.find((r) => r.id !== homeRegion(g))?.id ?? REGIONS[0].id)
  const plant = kept.startsWith('plant:') ? g.plants?.find((p) => `plant:${p.id}` === kept) : undefined
  const at = plant ? kept : 'factory'
  // the marks on the floor belong to the factory they were set for
  useEffect(() => () => setFactoryOverlay({ focus: [], why: '' }), [at])
  const next = SITE_TIERS.factory[g.factory ? g.factory.tier + 1 : 0]
  const build = () => {
    const err = act((s) => buildFactory(s))
    if (err) say(err, 'bad')
    else sfx.confirm()
  }

  if (!g.factory) {
    return (
      <SiteIntro
        icon="factory"
        title="A factory of your own"
        facts={[
          { label: 'Site', value: `${next.name}, ${next.w} x ${next.h} m` },
          { label: 'Upkeep a month', value: <span className="num">{money(next.rent)}</span> },
        ]}
        action={
          <ConfirmBtn tone="primary" large icon="build" className="w-full" confirm={`Pay ${money(next.cost)}?`} onClick={build}>
            Build the factory for {money(next.cost)}
          </ConfirmBtn>
        }
      >
        A contract maker adds {pct(CONTRACT.premium - 1, 0)} to the cost of every unit and needs {CONTRACT.leadDays} days before the first one arrives. Your own line builds for {pct(1 - FACTORY_SAVING, 0)} under cost and starts the same day. The plot comes bare: you lay the line on it next.
      </SiteIntro>
    )
  }

  const site = plant?.site ?? g.factory
  const local = lineStats(site)
  const wealth = regionInfo(plant?.region ?? homeRegion(g)).wealth
  const grow = SITE_TIERS.factory[site.tier + 1]
  const now = factoryNow(g)
  const run = (f: (s: GameState) => string | null) => {
    const err = act(f)
    if (err) say(err, 'bad')
    else sfx.confirm()
  }
  const plan = starterLine(g.factory)
  const starterCost = plan ? plan.items.reduce((a, p) => a + ITEMS.factory[p.kind].cost, 0) + roomCost(g.factory, 'hall', zoneable(g.factory, ...plan.hall, 'rect').length) : 0
  const canFix = !!planFix(g.factory)
  const fix = () => {
    const err = act((s) => fixFactoryLayout(s))
    if (err) say(err, 'bad')
    else sfx.confirm()
  }
  const example = () => {
    const err = act((s) => autoLine(s))
    if (err) say(err, 'bad')
    else {
      sfx.confirm()
      closeGuide()
    }
  }
  const closeGuide = () => {
    markGuideSeen()
    setGuide(false)
  }
  const down = now.state === 'stopped' || now.state === 'none'

  return (
    <>
    <FactoryGuide open={guide} onClose={closeGuide} example={starterCost} onExample={example} fix={canFix} onFix={fix} />
    <SiteBuilder
      key={at}
      siteRef={at}
      site={site}
      busy={Math.min(1, g.products.filter((p) => p.companyId === 'player').reduce((a, p) => a + p.stock, 0) / 150e3)}
      line={local}
      producing={now.queue.length > 0}
      status={factoryStatus(g)}
      tools={
        <>
        {(g.plants?.length ?? 0) > 0 && (
          <Pick label="Factory" value={at} options={[{ value: 'factory', label: 'Main factory' }, ...(g.plants ?? []).map((p) => ({ value: `plant:${p.id}`, label: p.name }))]} onChange={(v) => setAt(v)} />
        )}
        <Btn small tone="ghost" icon="help" title="Input and output faces, transfer belts, the order of the stages and what sets the output" onClick={() => setGuide(true)}>
          How factories work
        </Btn>
        {starterCost > 0 && !line?.running ? (
          <ConfirmBtn
            small
            tone="default"
            icon="build"
            confirm={`Pay ${money(starterCost)}?`}
            title="Zones a production hall and lays one short working line in it: docks, board assembly, device assembly, packaging and a test station"
            onClick={() => {
              const err = act((s) => autoLine(s))
              if (err) say(err, 'bad')
              else sfx.confirm()
            }}
          >
            Lay a starter line for {money(starterCost)}
          </ConfirmBtn>
        ) : null}
        </>
      }
    >
     <Detail>
      <Sec
        title="On order"
        count={now.queue.length}
        right={
          <Btn small tone="ghost" icon="arrowRight" title="Orders are placed, changed and cancelled under Devices, Mine" onClick={() => go({ tab: 'products' })}>
            Devices
          </Btn>
        }
      >
        {now.queue.length === 0 ? (
          <Note>{now.state === 'idle' ? now.why : 'Nothing is on order for the factory.'}</Note>
        ) : (
          <>
            {now.state === 'stopped' && <Note tone="neg">{now.why}</Note>}
            {now.queue.map((o, i) => (
              <div key={o.id} className="flex h-6 items-center gap-2" title={`${num(o.done)} of ${num(o.quantity)} built${o.days !== null ? `, about ${o.days} ${o.days === 1 ? 'day' : 'days'} of the line left` : ''}`}>
                <span className={`min-w-0 flex-1 truncate text-xs ${i === 0 && !down ? 'text-fg' : 'text-dim'}`}>{o.name}</span>
                <Meter value={o.share} tone={down ? 'neg' : i === 0 ? 'accent' : 'dim'} className="!w-16 shrink-0" />
                <span className="num w-10 shrink-0 text-right text-[11px] text-fg">{pct(o.share, 0)}</span>
              </div>
            ))}
          </>
        )}
      </Sec>
      <LinesPanel g={g} at={at} site={site} line={local} onGuide={() => setGuide(true)} />
      {canFix && !plant && (
        <Btn small tone="primary" icon="turn" className="w-full" title="Turns blocks in place so each output faces the next input. Free: nothing moves." onClick={fix}>
          Fix layout: turn blocks to face the flow
        </Btn>
      )}
      <PlantPanel at={at} line={local} wealth={wealth} />
      <PartsPanel g={g} site={site} line={local} />
      <MachinesPanel at={at} site={site} />
      <BlueprintsPanel g={g} at={at} />
      <Sec title="Site">
        <Fact k="Size" v={`${tierOf(site).name}, ${site.w} x ${site.h} m`} />
        {plant && <Fact k="Region" v={regionInfo(plant.region).name} />}
        {grow ? (
          <ConfirmBtn small tone="default" icon="plot" className="mt-2 w-full" confirm={`Pay ${money(grow.cost)}?`} title={`${grow.blurb} ${grow.w} x ${grow.h} m, upkeep ${money(grow.rent)} a month. Everything built moves across as it stands.`} onClick={plant ? () => run((s) => growPlant(s, plant.id)) : build}>
            Move to {aSite(grow.name)} for {money(grow.cost)}
          </ConfirmBtn>
        ) : (
          <div className="mt-1 text-[11px] text-dim">This is the largest factory site.</div>
        )}
      </Sec>
      <Sec title="Plants in other regions" count={g.plants?.length || undefined}>
        <div className="mb-1 text-[11px] text-dim">Each plant has a floor of its own and works on every order; its wages follow its region.</div>
        <Pick label="Region" value={region} options={REGIONS.map((r) => ({ value: r.id, label: `${r.name}, wages x${r.wealth.toFixed(2)}` }))} onChange={(v) => setRegion(v)} />
        <ConfirmBtn small tone="default" icon="factory" className="mt-1 w-full" confirm={`Pay ${money(SITE_TIERS.factory[0].cost * 2)}?`} onClick={() => run((s) => openPlant(s, region))}>
          Open a plant for {money(SITE_TIERS.factory[0].cost * 2)}
        </ConfirmBtn>
      </Sec>
     </Detail>
    </SiteBuilder>
    </>
  )
}

