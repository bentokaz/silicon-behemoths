// The launch plan: the second of the designer's two screens. What the device
// is called and costs, how many to build first (against an estimate of how
// many will sell), and the one button that commits.
import { useDeferredValue, useMemo, useRef } from 'react'
import { deviceThumbnail } from '../3d/thumbnail'
import { sfx } from '../audio/sfx'
import { STORAGE_OPTIONS, marketLevel } from '../data/catalog'
import { TYPES } from '../data/devices'
import { RETAIL_CUT, canAfford, devPlan, fmtDate, isVariantOf, player, productName, startProduct } from '../sim/game'
import { EVENTS, hasStage } from '../sim/growth'
import { demandEstimate, unitCostParts } from '../sim/insight'
import { bestSegment } from '../sim/market'
import { CONTRACT, factoryLine } from '../sim/ops'
import { has, lockTip } from '../sim/progress'
import { evaluate } from '../sim/scoring'
import type { ProductionOrder, StorageTier } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { defaultRun, priceWords, runNote } from './DesignerRun'
import { MAX_PRICE, MAX_RUN } from './format'
import { Btn, Choice, Fold, Help, IconBtn, NumInput, Panel, Row, Slider, TextInput, int, money, num, pct, price, useLayer } from './ui'

/** What the player has decided on the plan so far. It outlives a trip back to the design. */
export interface LaunchState {
  price: number
  /** Units in the first run; null while the plan's own suggestion stands. */
  quantity: number | null
  marketing: number
  mode: ProductionOrder['mode']
  tiers: StorageTier[]
  /** Index of the keynote venue, or -1 for none. */
  keynote: number
}

/** A run that takes longer than this to build outlasts the three months the estimate covers. */
const BUILD_DAYS_LONG = 90
const storageLabel = (gb: number) => (gb >= 1024 ? `${gb / 1024} TB` : `${gb} GB`)
/** A short, stable key for the picture of a design that is still changing. */
const hashOf = (text: string) => {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}
/** Enter in a number field applies it: the figure is already taken as typed, so the field is left. */
const leave = () => (document.activeElement as HTMLElement | null)?.blur()

export function LaunchPlan({ plan, patch, back }: { plan: LaunchState; patch: (p: Partial<LaunchState>) => void; back: () => void }) {
  const g = useGame()
  const draft = useStore((s) => s.draft!)
  const meta = useStore((s) => s.meta)
  const { setMeta, act, say, closeDesigner, setTab } = useStore.getState()
  // Esc goes back to the design; Tab stays on the plan; nothing behind it takes keys
  const box = useRef<HTMLDivElement>(null)
  useLayer(true, back, { modal: true, box })

  const type = draft.type
  const T = TYPES[type]
  const me = player(g)
  const name = productName(meta.family, meta.variant)
  const ev = useMemo(() => evaluate(draft, g.levels, marketLevel(g.day), g.features, g.chips), [draft, g.levels, g.day, g.features, g.chips])
  const variant = isVariantOf(g, meta.family, type)
  const dev = devPlan(draft, g, variant)
  const line = factoryLine(g)
  const mode: ProductionOrder['mode'] = plan.mode === 'factory' && !line?.running ? 'contract' : plan.mode
  const cost = useMemo(() => unitCostParts(g, draft, mode), [g, draft, mode])
  const events = has(g, 'events')
  const keynote = events ? plan.keynote : -1
  const venue = keynote >= 0 ? EVENTS.keynote.venues[keynote] : undefined
  const dueNow = dev.cost + plan.marketing + (venue?.cost ?? 0)
  const cash = g.config.unlimitedMoney ? Infinity : g.cash

  // the estimate runs the sales model ahead of time: it follows the price and the budget a moment behind the typing
  const slowPrice = useDeferredValue(plan.price)
  const slowMarketing = useDeferredValue(plan.marketing)
  const est = useMemo(() => demandEstimate(g, draft, slowPrice, { marketing: slowMarketing, mode, variant }), [g, draft, slowPrice, slowMarketing, mode, variant])
  const suggested = defaultRun(est, cost.total, cash - dueNow)
  const quantity = plan.quantity ?? suggested
  const runCost = quantity * cost.total
  const note = runNote(quantity, est, cost.total, cash)
  // how long whoever builds it takes over the run
  const perDay = (mode === 'contract' ? CONTRACT.perDay : (line?.throughput ?? 0)) / T.capacity
  const buildDays = perDay > 0 ? Math.ceil(quantity / perDay) + (mode === 'contract' ? CONTRACT.leadDays : 0) : 0
  const slowBuild = buildDays > BUILD_DAYS_LONG
  const best = bestSegment({ raw: ev.raw, featureBonus: ev.featureBonus, price: plan.price, type, design: draft }, me, g.day)
  const words = priceWords(plan.price, est.typicalPrice)
  const margin = plan.price * (1 - RETAIL_CUT) - cost.total
  // the parts of the unit cost are written so that they add up as printed
  const build = Math.round(cost.build)
  const added = Math.round(cost.total) - build

  const nextTier = STORAGE_OPTIONS.find((o) => o > (plan.tiers.at(-1)?.storage ?? draft.specs.storage))
  const thumb = useMemo(() => deviceThumbnail(`plan:${hashOf(JSON.stringify(draft))}`, draft, me.logo), [draft, me.logo])

  const taken = g.products.some((p) => p.companyId === 'player' && p.name === name && p.status !== 'ended')
  const blocked = !meta.family.trim()
    ? 'Give the device a name first.'
    : taken
      ? `You already have a device called ${name}. Change the name or the variant label.`
      : plan.price <= 0
        ? 'Set a price first.'
        : plan.tiers.some((t) => t.price <= plan.price)
          ? 'Each storage option must cost more than the base model.'
          : !canAfford(g, dueNow)
            ? `You need ${money(dueNow)} now and have ${money(g.cash)}. Lower the launch budget${venue ? ' or drop the keynote' : ''}.`
            : null
  const onSale = fmtDate(g.day + dev.days)

  const launch = () => {
    const err = act((game) => startProduct(game, { design: draft, family: meta.family, variant: meta.variant, price: plan.price, tiers: plan.tiers, quantity, mode, marketing: plan.marketing, keynote: keynote >= 0 ? keynote : undefined }))
    if (err) return say(err, 'bad')
    sfx.confirm()
    say(`${name} is in development. It goes on sale on ${onSale}, in ${dev.days} days.`)
    closeDesigner(true)
    setTab('products')
  }

  return (
    <div ref={box} role="dialog" aria-label="Launch plan" className="absolute inset-0 z-20 flex flex-col bg-carbon outline-none">
      <header className="flex h-9 shrink-0 items-center gap-3 border-b border-line bg-panel pl-4 pr-2">
        <span className="t-title">Launch plan</span>
        <span className="min-w-0 flex-1 truncate text-xs text-dim">
          {name || 'Unnamed'}, a {T.name.toLowerCase()}
          {variant ? '. It shares a platform with a device you already make, so development is cheaper and faster.' : ''}
        </span>
        <Btn tone="ghost" icon="arrowLeft" title="Back to the design (Esc)" onClick={back}>
          Back to the design
        </Btn>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mx-auto grid max-w-[920px] grid-cols-2 items-start gap-2">
          <Panel title="Name and price" bodyClass="p-3">
            <div className="flex gap-3">
              {thumb && <img src={thumb} alt="" className="h-[76px] w-[62px] shrink-0 border border-line bg-carbon object-contain" />}
              <div className="min-w-0 flex-1">
                <div className="label mb-1">Name</div>
                <TextInput value={meta.family} onChange={(v) => setMeta({ family: v })} maxLength={24} className="w-full" placeholder="Product line" aria-label="Product line name" />
                <div className="label mb-1 mt-2">Price</div>
                <div className="flex items-center gap-2">
                  <NumInput value={plan.price} onChange={(v) => patch({ price: v })} onEnter={leave} step={10} max={MAX_PRICE} className="w-28 text-right" aria-label="Price" />
                  <span className={`text-[11px] ${margin > 0 ? 'text-dim' : 'text-neg'}`}>{margin > 0 ? `You keep ${price(margin)} on each one sold` : `Each one sold loses ${price(-margin)}`}</span>
                </div>
              </div>
            </div>
            <div className="mt-2 text-[11px] leading-snug text-dim">
              Best fit: {best.seg.name.toLowerCase()} buyers. Typical for this segment: {price(est.typicalPrice)}
              {words ? `; yours is ${words}.` : '.'} Shops keep {pct(RETAIL_CUT, 0)} of the price.
            </div>

            <div className="mt-3 border-t border-line pt-2">
              <Slider label="Launch marketing, paid once" value={plan.marketing} min={0} max={20e6} step={50e3} format={(v) => money(v)} onChange={(v) => patch({ marketing: v })} hint="A one-off budget that makes buyers aware of the device on the day it goes on sale" />
              {events && (
                <Choice
                  label="Launch keynote"
                  value={keynote}
                  lockNote={hasStage(g) ? null : `Your own venue: ${lockTip(g, 'venue') ?? (g.venue ? 'it needs a stage before it can hold a keynote.' : 'build one first, under Sites, Venue.')}`}
                  options={[{ value: -1, label: 'None' }, ...EVENTS.keynote.venues.map((v, i) => ({ value: i, label: `${v.name} (${money(v.cost)})`, locked: i === 3 && !hasStage(g) }))]}
                  onChange={(v) => patch({ keynote: v })}
                />
              )}
            </div>
          </Panel>

          <Panel
            title="First production run"
            bodyClass="p-3"
            right={
              <Help title="What the estimate is based on">
                {est.note} It is a range, not a promise: rivals that launch in the meantime and the luck of the reviews move it.
              </Help>
            }
          >
            {line && (
              <div className="mb-2 flex gap-1">
                {(['contract', 'factory'] as const).map((m) => (
                  <Btn key={m} small className="flex-1" active={mode === m} disabled={m === 'factory' && !line.running} onClick={() => patch({ mode: m })} title={m === 'factory' ? (line.running ? 'Build it on your own line' : 'Your factory has no working line yet: finish it under Sites, Factory') : 'Have a contract maker build it'}>
                    {m === 'contract' ? 'Contract maker' : 'Own factory'}
                  </Btn>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <NumInput value={quantity} onChange={(v) => patch({ quantity: v })} onEnter={leave} step={1000} max={MAX_RUN} className="w-28 text-right" aria-label="Units in the first production run" />
              <span className="text-xs text-dim">units</span>
              {plan.quantity === null ? (
                <span className="text-[11px] text-faint">suggested</span>
              ) : (
                quantity !== suggested && (
                  <Btn small tone="ghost" title="Go back to the size the plan suggests from the estimate and your cash" onClick={() => patch({ quantity: null })}>
                    Suggest {int(suggested)}
                  </Btn>
                )
              )}
            </div>
            <div className="mt-2 text-xs leading-snug text-fg" data-estimate>
              {est.high > 0 ? (
                <>
                  Likely to sell <span className="num">{num(est.low)}</span> to <span className="num">{num(est.high)}</span> in the first three months at this price.
                </>
              ) : (
                'Likely to sell almost none at this price.'
              )}
            </div>
            {note && (
              <div className={`mt-1 text-[11px] leading-snug ${note.tone === 'warn' ? 'text-warn' : 'text-dim'}`} data-run-note={note.kind}>
                {note.kind === 'cash'
                  ? `This run costs ${money(runCost)}, more than half of your ${money(g.cash)}. It is paid for as it is built.`
                  : note.kind === 'above'
                    ? 'That is far more than is likely to sell in three months. What does not sell waits in stock, already paid for.'
                    : plan.quantity === null
                      ? 'The suggestion is held to what half of your spare cash pays for. It is under the low end of the estimate, so expect to sell out and to order more as the money comes in.'
                      : 'That is under the low end of the estimate, so it will probably sell out. More can be ordered at any time.'}
              </div>
            )}
            <div className="mt-3 border-t border-line pt-2 text-[11px] leading-snug text-dim">
              <span className="num text-fg">{price(cost.total)}</span> each:{' '}
              {added > 0 ? (
                <>
                  <span className="num">{price(build)}</span> to build + <span className="num">{price(added)}</span> contract maker's margin ({pct(cost.premiumRate, 0)})
                </>
              ) : added < 0 ? (
                <>
                  <span className="num">{price(build)}</span> to build, less <span className="num">{price(-added)}</span> saved by building it yourself ({pct(-cost.premiumRate, 0)})
                </>
              ) : (
                'what it costs to build today'
              )}
              .
            </div>
            <div className="mt-1 text-[11px] leading-snug text-faint">
              {mode === 'contract' ? `A contract maker starts after ${CONTRACT.leadDays} days and delivers about ${num(perDay)} a day.` : `Your line builds about ${num(perDay)} a day.`} You pay for units as they are built, not up front.
            </div>
            {buildDays > 0 && (
              <div className={`mt-1 text-[11px] leading-snug ${slowBuild ? 'text-warn' : 'text-faint'}`} data-build-days>
                {slowBuild ? `This run takes about ${int(buildDays)} days to build, longer than the three months the estimate covers: the device will sell out between deliveries.` : `This run is built in about ${int(buildDays)} days.`}
              </div>
            )}
          </Panel>

          <Fold title="More options" keep="designer:plan:more" open={!!meta.variant || plan.tiers.length > 0} className="col-span-2" bodyClass="grid grid-cols-2 gap-x-6 p-3">
            <div>
              <div className="label mb-1">Variant label</div>
              <TextInput value={meta.variant} onChange={(v) => setMeta({ variant: v })} maxLength={10} className="w-32" placeholder="Pro, Lite" aria-label="Variant label" />
              <div className="mt-1 text-[11px] leading-snug text-faint">{variant ? 'This shares a platform with a device you already make in this line.' : 'Give it the name of a line you already make and a label such as Pro or Lite, and it shares that platform: development is cheaper and faster.'}</div>
            </div>
            {T.memory > 0 && (
              <div>
                <div className="label mb-1">Storage options</div>
                <div className="text-[11px] text-dim">Base model: {storageLabel(draft.specs.storage)}. Some buyers pay extra for more storage, which costs you little to add.</div>
                {plan.tiers.map((t, i) => (
                  <div key={t.storage} className="mt-1 flex items-center gap-2">
                    <span className="num w-16 text-xs text-fg">{storageLabel(t.storage)}</span>
                    <NumInput value={t.price} onChange={(v) => patch({ tiers: plan.tiers.map((x, k) => (k === i ? { ...x, price: v } : x)) })} onEnter={leave} step={10} max={MAX_PRICE} className="w-24 text-right" aria-label={`Price of the ${storageLabel(t.storage)} option`} />
                    <IconBtn small tone="ghost" icon="bin" title={i < plan.tiers.length - 1 ? `Remove the ${storageLabel(t.storage)} option and the larger ones after it` : `Remove the ${storageLabel(t.storage)} option`} onClick={() => patch({ tiers: plan.tiers.slice(0, i) })} />
                  </div>
                ))}
                {plan.tiers.length < 3 && nextTier && (
                  <Btn small icon="plus" className="mt-2" onClick={() => patch({ tiers: [...plan.tiers, { storage: nextTier, price: (plan.tiers.at(-1)?.price ?? plan.price) + (T.memory >= 2 ? 200 : 100) }] })}>
                    {storageLabel(nextTier)} option
                  </Btn>
                )}
              </div>
            )}
          </Fold>
        </div>
      </div>

      <footer className="flex shrink-0 items-center gap-4 border-t border-line bg-panel px-4 py-2">
        <div className="shrink-0">
          <div className="label">Due now</div>
          <div className={`t-headline ${blocked && !canAfford(g, dueNow) ? 'text-neg' : 'text-fg'}`}>{money(dueNow)}</div>
        </div>
        <div className="min-w-0 flex-1 text-[11px] leading-snug text-dim">
          <div>
            Development {money(dev.cost)}
            {plan.marketing > 0 ? `, launch marketing ${money(plan.marketing)}` : ''}
            {venue ? `, keynote ${money(venue.cost)}` : ''}. Then {money(runCost)} for the first run, as it is built.
          </div>
          {blocked ? (
            <div className="text-warn" data-blocked>
              {blocked}
            </div>
          ) : (
            <div>
              On sale {onSale}, after {dev.days} days of development.
            </div>
          )}
        </div>
        <Btn tone="primary" large className="min-w-[120px]" disabled={!!blocked} title={blocked ?? `Development takes about ${dev.days} days. The first run is ordered today and ${name} goes on sale on ${onSale}.`} onClick={launch}>
          Launch
        </Btn>
      </footer>
    </div>
  )
}

/** The rows of the Market panel and the plan read one margin: after the shops' cut and the maker's. */
export function MarginRow({ price: p, unit }: { price: number; unit: number }) {
  const margin = p * (1 - RETAIL_CUT) - unit
  return <Row k={`Margin per unit, after the ${pct(RETAIL_CUT, 0)} retail cut`} v={price(margin)} tone={margin > 0 ? 'text-pos' : 'text-neg'} />
}
