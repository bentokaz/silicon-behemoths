// Sites, Factory: the factory floor in 3D. One line of status floats over it
// (what the line is making, output, quality, upkeep); the queue, the stages of
// the line and the move to a bigger site sit behind that line. Production
// orders live with the devices (Orders.tsx) and component supply with the
// company's money (Supply.tsx): neither is about this building.
import { sfx } from '../audio/sfx'
import { useState } from 'react'
import { autoLine, buildFactory, fixFactoryLayout, roomCost, zoneable } from '../sim/game'
import { CONTRACT, FACTORY_SAVING, factoryLine } from '../sim/ops'
import { ITEMS, type LineStats, SITE_TIERS, planFix, starterLine, tierOf } from '../sim/sites'
import { FactoryGuide, guideSeen, markGuideSeen } from './FactoryGuide'
import { useGame, useStore } from '../store/game'
import { SiteBuilder } from './SiteBuilder'
import { aSite, factoryNow, factoryStatus } from './SitesFigures'
import { BarRow, Detail, Fact, Note, Sec, SiteIntro } from './SitesParts'
import { Btn, ConfirmBtn, IconBtn, Legend, Meter, money, num, pct } from './ui'

export function FactoryScreen() {
  const g = useGame()
  const { act, say, go } = useStore.getState()
  const line = factoryLine(g)
  const [guide, setGuide] = useState(() => !guideSeen())
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
      siteRef="factory"
      site={g.factory}
      busy={Math.min(1, g.products.filter((p) => p.companyId === 'player').reduce((a, p) => a + p.stock, 0) / 150e3)}
      line={line}
      producing={now.queue.length > 0}
      status={factoryStatus(g)}
      tools={
        <>
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
      <LineSection line={line} onGuide={() => setGuide(true)} onFix={fix} canFix={canFix} />
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
    </>
  )
}

const STAGE_LABEL = { smt: 'Board assembly', assembly: 'Device assembly', pack: 'Packaging', test: 'Testing' } as const

/** What each line on the floor can do, what holds it back, and what stops the ones that do not run. */
function LineSection({ line, onGuide, onFix, canFix }: { line: LineStats | null; onGuide: () => void; onFix: () => void; canFix: boolean }) {
  const lines = line?.lines ?? []
  const help = <IconBtn small icon="help" tone="ghost" title="How factories work" onClick={onGuide} />
  const fixBtn = canFix && (
    <Btn small tone="primary" icon="turn" className="mt-1.5 w-full" title="Turns blocks in place so each output faces the next input. Free: nothing moves." onClick={onFix}>
      Fix layout: turn blocks to face the flow
    </Btn>
  )
  if (!line?.running) {
    return (
      <Sec title="Line" right={help}>
        <Note tone="warn">{line?.problem ?? 'There is no line yet.'}</Note>
        {lines.slice(1).map((l, i) => l.problem && (
          <Note key={l.id} tone="dim">
            Line {i + 2}: {l.problem}
          </Note>
        ))}
        {fixBtn}
        <div className="mt-1 text-[11px] text-dim">Parts run from a receiving dock to a shipping dock through board assembly, device assembly and packaging, each block's output face touching the next one's input.</div>
      </Sec>
    )
  }
  const stages = (['smt', 'assembly', 'pack', 'test'] as const).map((k) => [k, line.caps[k]] as const)
  const peak = Math.max(1, ...stages.map((s) => s[1]))
  const bottleneck = lines.find((l) => l.running)?.bottleneck
  const blocked = line.joints.filter((j) => !j.ok)
  return (
    <Sec title="Line" count={lines.length > 1 ? lines.length : undefined} right={help}>
      {stages.map(([k, cap]) => (
        <BarRow key={k} label={STAGE_LABEL[k]} share={cap / peak} value={num(cap)} tone={k === bottleneck ? 'warn' : 'accent'} title={k === 'test' ? 'Units a day the test stations can check. Testing never slows the line: it only lowers the share of faulty units.' : 'Units a day this stage can handle: blocks of one kind in a row add up'} />
      ))}
      <Legend className="mt-1" items={[{ label: 'Units a day', tone: 'accent' }, { label: 'Slowest stage: sets the output', tone: 'warn' }]} />
      <Fact k="Running cost a day, at full output" v={money(line.runCost)} num />
      {lines.length > 1 && lines.map((l, i) => <Fact key={l.id} k={`Line ${i + 1}`} v={l.running ? `${num(l.throughput)} a day` : 'stopped'} tone={l.running ? undefined : 'warn'} title={l.problem} />)}
      {blocked.length > 0 && (
        <Note tone="neg">
          {blocked.length === 1 ? 'One joint is' : `${blocked.length} joints are`} blocked. {blocked[0].why}
        </Note>
      )}
      {line.loose.length > 0 && <Note tone="dim">{line.loose.length === 1 ? 'One block is' : `${line.loose.length} blocks are`} not joined to a receiving dock.</Note>}
      {fixBtn}
    </Sec>
  )
}
