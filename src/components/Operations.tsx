// Sites, Factory: the factory floor in 3D. One line of status floats over it
// (what the line is making, output, quality, upkeep); the queue, the stages of
// the line and the move to a bigger site sit behind that line. Production
// orders live with the devices (Orders.tsx) and component supply with the
// company's money (Supply.tsx): neither is about this building.
import { sfx } from '../audio/sfx'
import { autoLine, buildFactory, roomCost, zoneable } from '../sim/game'
import { CONTRACT, FACTORY_SAVING, factoryLine } from '../sim/ops'
import { ITEMS, SITE_TIERS, starterLine, tierOf } from '../sim/sites'
import { useGame, useStore } from '../store/game'
import { SiteBuilder } from './SiteBuilder'
import { aSite, factoryNow, factoryStatus } from './SitesFigures'
import { BarRow, Detail, Fact, Note, Sec, SiteIntro } from './SitesParts'
import { Btn, ConfirmBtn, Legend, Meter, money, num, pct } from './ui'

export function FactoryScreen() {
  const g = useGame()
  const { act, say, go } = useStore.getState()
  const line = factoryLine(g)
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

  const now = factoryNow(g)
  const plan = starterLine(g.factory)
  const starterCost = plan ? plan.items.reduce((a, p) => a + ITEMS.factory[p.kind].cost, 0) + roomCost(g.factory, 'hall', zoneable(g.factory, ...plan.hall, 'rect').length) : 0
  const stages: [string, number][] = line ? [['Board assembly', line.caps.smt], ['Device assembly', line.caps.assembly], ['Packaging', line.caps.pack], ['Testing', line.caps.test]] : []
  const peak = Math.max(1, ...stages.map((s) => s[1]))
  const down = now.state === 'stopped' || now.state === 'none'

  return (
    <SiteBuilder
      siteRef="factory"
      site={g.factory}
      busy={Math.min(1, g.products.filter((p) => p.companyId === 'player').reduce((a, p) => a + p.stock, 0) / 150e3)}
      line={line}
      producing={now.queue.length > 0}
      status={factoryStatus(g)}
      tools={
        starterCost > 0 && !line?.running ? (
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
        ) : undefined
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
      <Sec title="Line">
        {line?.running ? (
          <>
            {stages.map(([name, cap]) => (
              <BarRow key={name} label={name} share={cap / peak} value={num(cap)} tone={cap === line.throughput && name !== 'Testing' ? 'warn' : 'accent'} title={name === 'Testing' ? 'Units a day the test stations can check. Testing never slows the line: it only lowers the share of faulty units.' : `Units a day this stage can handle`} />
            ))}
            <Legend className="mt-1" items={[{ label: 'Units a day', tone: 'accent' }, { label: 'Slowest stage: sets the output', tone: 'warn' }]} />
            <Fact k="Running cost a day, at full output" v={money(line.runCost)} num />
          </>
        ) : (
          <Note tone="warn">{line?.problem ?? 'There is no line yet.'} A line runs from a receiving dock to a shipping dock through board assembly, device assembly and packaging, joined directly or by conveyors.</Note>
        )}
      </Sec>
      <Sec title="Site">
        <Fact k="Size" v={`${tierOf(g.factory).name}, ${g.factory.w} x ${g.factory.h} m`} />
        {next ? (
          <ConfirmBtn small tone="default" icon="plot" className="mt-2 w-full" confirm={`Pay ${money(next.cost)}?`} title={`${next.blurb} ${next.w} x ${next.h} m, upkeep ${money(next.rent)} a month. Everything built moves across as it stands.`} onClick={build}>
            Move to {aSite(next.name)} for {money(next.cost)}
          </ConfirmBtn>
        ) : (
          <div className="mt-1 text-[11px] text-dim">This is the largest factory site.</div>
        )}
      </Sec>
     </Detail>
    </SiteBuilder>
  )
}
