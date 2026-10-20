// Two small earners of their keep: a prototype test before launch (in the
// launch plan) and contract work for businesses (on the Devices page).
import { useState } from 'react'
import { sfx } from '../audio/sfx'
import { TYPES } from '../data/devices'
import { acceptContract, declineContract, fmtDate } from '../sim/game'
import { type SegmentVerdict, prototypeFee, prototypeVerdicts, testPrototype } from '../sim/prototype'
import { checkAll, reqLabel } from '../sim/contractReqs'
import { SECTORS, contractBlocked, contractChecks, daysLate, latePay, sectorOf, sectorRep } from '../sim/contracts'
import type { ContractJob, ContractReq, DeviceDesign, GameState } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Btn, Help, Meter, Panel, Pick, Tag, money, num } from './ui'

/** Pay a fee, and testers from each segment name what they like least about the design. */
export function PrototypeTest({ design, price }: { design: DeviceDesign; price: number }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const [result, setResult] = useState<{ key: string; verdicts: SegmentVerdict[] } | null>(null)
  const key = JSON.stringify(design) + price
  const fee = prototypeFee(g, design)
  const run = () => {
    const err = act((s) => testPrototype(s, design))
    if (err) return say(err, 'bad')
    sfx.confirm()
    setResult({ key, verdicts: prototypeVerdicts(useStore.getState().game!, design, price) })
  }
  const shown = result?.key === key ? result.verdicts : null
  return (
    <Panel
      title="Prototype test"
      bodyClass="p-3"
      className="col-span-2"
      right={<Help title="Testing a prototype">Early testers from every group of buyers try the design at this price and name the three things they like least. It costs a small share of the development budget. Change the design and test again to see whether it helped.</Help>}
    >
      {shown ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {shown.map((v) => (
            <div key={v.segment}>
              <div className="label mb-1">{v.name}</div>
              {v.weak.length ? (
                <ol className="list-decimal pl-4 text-[11px] leading-snug text-dim">
                  {v.weak.map((w) => (
                    <li key={w.key}>{w.text}</li>
                  ))}
                </ol>
              ) : (
                <div className="text-[11px] text-pos">No complaints worth the name.</div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-[11px] leading-snug text-dim">{result ? 'The design or price has changed since the last test.' : 'Find out what each group of buyers would like least, before paying to launch it.'}</span>
          <Btn icon="review" onClick={run}>
            Test it for {money(fee)}
          </Btn>
        </div>
      )}
    </Panel>
  )
}

function ReqList({ rows }: { rows: { req: ContractReq; ok: boolean; have: string }[] }) {
  return (
    <span className="mt-[2px] flex flex-wrap gap-x-3 gap-y-[1px]">
      {rows.map((x, i) => (
        <span key={i} className={`text-[11px] ${x.ok ? 'text-pos' : 'text-neg'}`}>
          {x.ok ? 'Pass' : 'Fail'}: {reqLabel(x.req)} <span className="text-dim">({x.have})</span>
        </span>
      ))}
    </span>
  )
}

function ContractRow({ g, c }: { g: GameState; c: ContractJob }) {
  const { act, say, openDesigner } = useStore.getState()
  const mine = g.products.filter((p) => p.companyId === 'player' && p.status === 'sale' && p.type === c.type)
  const fit = mine.filter((p) => !contractBlocked(g, c, p))
  const [pick, setPick] = useState(mine[0]?.id ?? '')
  const chosen = (fit.some((p) => p.id === pick) ? pick : fit[0]?.id) ?? (mine.some((p) => p.id === pick) ? pick : (mine[0]?.id ?? ''))
  const product = g.products.find((p) => p.id === c.productId)
  const preview = c.state === 'offer' ? mine.find((p) => p.id === chosen) : product
  const checks = preview ? contractChecks(c, preview).rows : (c.reqs ?? []).map((req) => ({ req, ok: false, have: 'No device chosen' }))
  const sector = sectorOf(c.sector)
  const late = c.state === 'active' ? daysLate(c, g.day) : 0
  return (
    <div className="flex items-center gap-3 border-b border-line px-3 py-[6px] last:border-0">
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-fg">
          <span className="num">{num(c.units)}</span> {TYPES[c.type].plural.toLowerCase()} for {c.client}
          {sector && <span className="text-dim"> ({sector.name}, tier {(c.tier ?? 0) + 1}, standing {Math.round(sectorRep(g, sector.id) * 100)}%)</span>}
        </span>
        <span className="block text-[11px] leading-snug text-dim">
          {money(c.perUnit)} each, {money(c.units * c.perUnit)} in all on delivery. Reviews of {c.minReview} or better.{' '}
          {c.state === 'offer' ? `${c.days} days to deliver, then ${c.grace ?? 0} of falling pay; offer open until ${fmtDate(c.expires)}.` : `From ${product?.name ?? 'a device no longer made'}, due ${fmtDate(c.due ?? g.day)}${late ? `; ${late} days late, paying ${Math.round(latePay(c, g.day) * 100)}%` : ''}.`}
        </span>
        {(c.reqs?.length ?? 0) > 0 && c.state !== 'done' && c.state !== 'failed' && <ReqList rows={checks} />}
      </span>
      {c.state === 'active' ? (
        <span className="flex w-40 shrink-0 items-center gap-2">
          <Meter value={c.delivered} max={c.units} />
          <span className="num text-[11px] text-dim">{Math.round((c.delivered / c.units) * 100)}%</span>
        </span>
      ) : c.state === 'offer' ? (
        <span className="flex shrink-0 items-center gap-2">
          {mine.length > 1 && <Pick label="Check" value={chosen} options={mine.map((p) => ({ value: p.id, label: p.name }))} onChange={setPick} />}
          <Btn
            small
            tone="primary"
            disabled={!chosen}
            title={mine.find((p) => p.id === chosen) ? (contractBlocked(g, c, mine.find((p) => p.id === chosen)) ?? 'Units are taken from its stock as they are built') : `You have no ${TYPES[c.type].plural.toLowerCase()} on sale`}
            onClick={() => {
              const err = act((s) => acceptContract(s, c.id, chosen))
              if (err) say(err, 'bad')
              else sfx.confirm()
            }}
          >
            Accept
          </Btn>
          <Btn
            small
            onClick={() => {
              useStore.setState({ brief: c.id })
              openDesigner({ type: c.type })
            }}
          >
            Design for this contract
          </Btn>
          <Btn small tone="ghost" onClick={() => act((s) => declineContract(s, c.id))}>
            Decline
          </Btn>
        </span>
      ) : (
        <Tag tone={c.state === 'done' ? 'pos' : 'neg'}>{c.state === 'done' ? 'Delivered' : 'Missed'}</Tag>
      )}
    </div>
  )
}

/** The brief of the contract the designer is working to, with live pass or fail against the design on the bench. */
export function ContractBrief({ design, lifeHours }: { design: DeviceDesign; lifeHours: number }) {
  const g = useGame()
  const id = useStore((s) => s.brief)
  const c = id ? g.contracts?.find((x) => x.id === id) : undefined
  if (!c) return null
  const { rows, met } = checkAll(c.reqs, design, { lifeHours })
  return (
    <div className="pointer-events-auto fixed bottom-3 left-3 z-30 w-72 rounded border border-line bg-panel p-2 shadow-lg">
      <div className="mb-1 flex items-center justify-between text-xs text-fg">
        <span>Brief: {c.client}</span>
        <Btn small tone="ghost" onClick={() => useStore.setState({ brief: null })}>
          Hide
        </Btn>
      </div>
      <div className="text-[11px] text-dim">
        {num(c.units)} {TYPES[c.type].plural.toLowerCase()} at {money(c.perUnit)}. Reviews of {c.minReview} or better. {design.type === c.type ? `${met} of ${rows.length} asks met.` : `This design is not a ${TYPES[c.type].name.toLowerCase()}.`}
      </div>
      <ReqList rows={rows} />
    </div>
  )
}

/** Contract offers and contracts under way. Nothing at all while there are none. */
export function Contracts() {
  const g = useGame()
  const list = (g.contracts ?? []).filter((c) => c.state === 'offer' || c.state === 'active' || g.day - (c.due ?? c.offered) < 60)
  if (!list.length) return null
  const seen = SECTORS.filter((x) => g.sectorRep?.[x.id] !== undefined)
  return (
    <Panel
      title="Contracts board"
      icon="briefcase"
      count={list.filter((c) => c.state !== 'done' && c.state !== 'failed').length}
      className="shrink-0"
      right={<Help title="Contract work">Named clients in several sectors order batches of devices to a brief: a look, a size, a noise or flight limit. Each ask is checked against the design and shown pass or fail. Deliver by the date for full pay; after it the price falls through a grace period, then they pay only part for what arrived. Each sector remembers how you did, and goodwill brings harder, richer work as you open more device lines.</Help>}
    >
      {seen.length > 0 && (
        <div className="flex flex-wrap gap-x-4 border-b border-line px-3 py-1 text-[11px] text-dim">
          {seen.map((x) => (
            <span key={x.id}>
              {x.name}: <span className="num text-fg">{Math.round(sectorRep(g, x.id) * 100)}%</span>
            </span>
          ))}
        </div>
      )}
      {list.map((c) => (
        <ContractRow key={c.id} g={g} c={c} />
      ))}
    </Panel>
  )
}
