// Two small earners of their keep: a prototype test before launch (in the
// launch plan) and contract work for businesses (on the Devices page).
import { useState } from 'react'
import { sfx } from '../audio/sfx'
import { TYPES } from '../data/devices'
import { acceptContract, declineContract, fmtDate } from '../sim/game'
import { type SegmentVerdict, prototypeFee, prototypeVerdicts, testPrototype } from '../sim/prototype'
import type { ContractJob, DeviceDesign, GameState } from '../sim/types'
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

function ContractRow({ g, c }: { g: GameState; c: ContractJob }) {
  const { act, say } = useStore.getState()
  const mine = g.products.filter((p) => p.companyId === 'player' && p.status === 'sale' && p.type === c.type)
  const fit = mine.filter((p) => p.reviewAvg >= c.minReview)
  const [pick, setPick] = useState(fit[0]?.id ?? '')
  const chosen = fit.some((p) => p.id === pick) ? pick : (fit[0]?.id ?? '')
  const product = g.products.find((p) => p.id === c.productId)
  return (
    <div className="flex items-center gap-3 border-b border-line px-3 py-[6px] last:border-0">
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-fg">
          <span className="num">{num(c.units)}</span> {TYPES[c.type].plural.toLowerCase()} for {c.client}
        </span>
        <span className="block text-[11px] leading-snug text-dim">
          {money(c.perUnit)} each, {money(c.units * c.perUnit)} in all on delivery. Reviews of {c.minReview} or better. {c.state === 'offer' ? `${c.days} days to deliver; offer open until ${fmtDate(c.expires)}.` : `From ${product?.name ?? 'a device no longer made'}, due ${fmtDate(c.due ?? g.day)}.`}
        </span>
      </span>
      {c.state === 'active' ? (
        <span className="flex w-40 shrink-0 items-center gap-2">
          <Meter value={c.delivered} max={c.units} />
          <span className="num text-[11px] text-dim">{Math.round((c.delivered / c.units) * 100)}%</span>
        </span>
      ) : c.state === 'offer' ? (
        <span className="flex shrink-0 items-center gap-2">
          {fit.length > 1 && <Pick label="From" value={chosen} options={fit.map((p) => ({ value: p.id, label: p.name }))} onChange={setPick} />}
          <Btn
            small
            tone="primary"
            disabled={!chosen}
            title={chosen ? 'Units are taken from its stock as they are built' : mine.length ? `None of your ${TYPES[c.type].plural.toLowerCase()} is reviewed well enough` : `You have no ${TYPES[c.type].plural.toLowerCase()} on sale`}
            onClick={() => {
              const err = act((s) => acceptContract(s, c.id, chosen))
              if (err) say(err, 'bad')
              else sfx.confirm()
            }}
          >
            Accept
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

/** Contract offers and contracts under way. Nothing at all while there are none. */
export function Contracts() {
  const g = useGame()
  const list = (g.contracts ?? []).filter((c) => c.state === 'offer' || c.state === 'active' || g.day - (c.due ?? c.offered) < 60)
  if (!list.length) return null
  return (
    <Panel
      title="Contract work"
      icon="briefcase"
      count={list.filter((c) => c.state !== 'done' && c.state !== 'failed').length}
      className="shrink-0"
      right={<Help title="Contract work">Businesses order batches of devices at a bulk price, paid in full when the last unit arrives. The units come out of the chosen device's stock as it is built, before shops get any. Miss the date and they pay half for what arrived, and your brand suffers.</Help>}
    >
      {list.map((c) => (
        <ContractRow key={c.id} g={g} c={c} />
      ))}
    </Panel>
  )
}
