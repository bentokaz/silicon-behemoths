// Sites, Stores: opening stores, one or many at once. One drawer: the kind of
// site, the layout, how many in each region and which regions (the best ones
// ticked to start with), with the total price and the month's expected profit,
// and a single button to open them all.
import { useState } from 'react'
import { sfx } from '../audio/sfx'
import { MAX_OPEN_AT_ONCE, canAfford, openStores, storeOpenCost, storeOutlook } from '../sim/game'
import { regionInfo } from '../sim/regions'
import { SITE_TIERS } from '../sim/sites'
import { useGame, useStore } from '../store/game'
import { signTone } from './SitesFigures'
import { Note } from './SitesParts'
import { Icon } from './icons'
import { Btn, Choice, Drawer, int, money } from './ui'

const TONE = { pos: 'text-pos', neg: 'text-neg' } as const

/** How many of the best regions start ticked. */
const SUGGEST = 3

export function OpenStoresDrawer({ tier: tier0, layout: layout0, onClose, onOpened }: { tier: number; layout: string; onClose: () => void; onOpened: (ids: string[]) => void }) {
  const g = useGame()
  const { act, say } = useStore.getState()
  const [tier, setTier] = useState(tier0)
  const [layout, setLayout] = useState(layout0)
  const [count, setCount] = useState(1)
  const model = g.stores.find((s) => s.id === layout)
  const outlook = storeOutlook(g, tier, model?.id)
  const best = outlook.filter((o) => o.profit > 0).slice(0, SUGGEST).map((o) => o.region)
  const [picked, setPicked] = useState<string[] | null>(null)
  const chosen = (picked ?? (best.length ? best : outlook.slice(0, 1).map((o) => o.region))).filter((r) => outlook.some((o) => o.region === r))
  const toggle = (r: string) => setPicked(chosen.includes(r) ? chosen.filter((x) => x !== r) : [...chosen, r])
  const each = storeOpenCost(g, tier, model?.id)
  const total = chosen.length * count
  const price = (each ?? 0) * total
  const profit = outlook.filter((o) => chosen.includes(o.region)).reduce((a, o) => a + o.profit, 0) * count
  const blocked =
    each === null ? `The layout of ${model?.name ?? 'that store'} does not fit a ${SITE_TIERS.store[tier].name.toLowerCase()}` : !total ? 'Tick at least one region' : total > MAX_OPEN_AT_ONCE ? `At most ${MAX_OPEN_AT_ONCE} stores at once` : !canAfford(g, price) ? `Not enough cash: ${money(price)} is needed` : null

  const open = () => {
    const before = new Set(useStore.getState().game!.stores.map((s) => s.id))
    const err = act((s) => openStores(s, tier, chosen, count, model?.id))
    if (err) return say(err, 'bad')
    sfx.confirm()
    const ids = useStore.getState().game!.stores.filter((s) => !before.has(s.id)).map((s) => s.id)
    say(ids.length === 1 ? 'The store is open.' : `${ids.length} new stores are open.`, 'ok')
    onOpened(ids)
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={480}
      title="Open stores"
      footer={
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3 gap-2 text-[11px] text-dim">
            <span>
              Stores <span className="num block text-sm text-fg">{int(total)}</span>
            </span>
            <span>
              Total price <span className="num block text-sm text-fg">{money(price)}</span>
            </span>
            <span title="A month's trade for all of them together, with the shelves kept stocked with what you sell today: revenue less what the devices cost, the rent, upkeep and wages">
              Profit a month <span className={`num block text-sm ${signTone(profit) ? TONE[signTone(profit)!] : 'text-fg'}`}>{money(profit)}</span>
            </span>
          </div>
          {blocked && <Note tone="warn">{blocked}</Note>}
          <Btn tone="primary" large icon="plus" disabled={!!blocked} onClick={open}>
            {total === 1 ? `Open the store: ${money(price)}` : `Open ${total} stores: ${money(price)}`}
          </Btn>
        </div>
      }
    >
      <div className="flex flex-col gap-1 border-b border-line px-4 py-3">
        <Choice label="Site" value={tier} options={SITE_TIERS.store.map((t, i) => ({ value: i, label: `${t.name}: ${int(t.traffic ?? 0)} passers-by, rent ${money(t.rent)}` }))} onChange={(v) => (setTier(v), setPicked(null))} />
        <Choice label="Layout" value={layout} options={[{ value: '', label: 'Standard fit-out' }, ...g.stores.map((s) => ({ value: s.id, label: `Copy of ${s.name}` }))]} onChange={(v) => (setLayout(v), setPicked(null))} />
        <Choice label="In each region" value={count} options={[1, 2, 3, 5].map((n) => ({ value: n, label: n === 1 ? '1 store' : `${n} stores` }))} onChange={setCount} />
        <div className="text-[11px] leading-snug text-faint">{each === null ? '' : `Each costs ${money(each)}: the plot and the ${model ? `fit-out of ${model.name}` : 'standard fit-out (tables, checkout, accessory walls, plants)'}.`}</div>
      </div>
      <div className="flex items-center justify-between px-4 pb-1 pt-3 text-[11px] text-dim">
        <span>Regions, best first</span>
        <span className="flex gap-3">
          <button type="button" className="text-accent hover:underline" onClick={() => setPicked(best)}>
            Suggested
          </button>
          <button type="button" className="text-accent hover:underline" onClick={() => setPicked(outlook.map((o) => o.region))}>
            All
          </button>
          <button type="button" className="text-accent hover:underline" onClick={() => setPicked([])}>
            None
          </button>
        </span>
      </div>
      <div className="px-2 pb-3" role="group" aria-label="Regions to open in">
        {outlook.map((o) => {
          const on = chosen.includes(o.region)
          const tone = signTone(o.profit)
          return (
            <button key={o.region} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(o.region)} className={`flex w-full items-center gap-2 border px-2 py-1.5 text-left text-xs ${on ? 'border-accent bg-raise' : 'border-transparent hover:bg-raise'}`}>
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center border ${on ? 'border-accent bg-accent text-carbon' : 'border-line2'}`}>{on && <Icon name="check" size={11} />}</span>
              <span className="min-w-0 flex-1 truncate text-fg">
                {regionInfo(o.region).name}
                {best.includes(o.region) && <span className="ml-2 text-2xs uppercase tracking-wide text-accent">Suggested</span>}
              </span>
              <span className="num w-[92px] shrink-0 text-right text-dim" title="Visitors a day">
                {int(o.visitors)} a day
              </span>
              <span className={`num w-[96px] shrink-0 text-right ${tone ? TONE[tone] : 'text-fg'}`} title="Expected profit a month for each store">
                {money(o.profit)}
              </span>
              <span className="num w-[64px] shrink-0 text-right text-faint" title="Months for each store's profit to pay back what it cost to open">
                {o.payback === null ? 'never' : o.payback < 1 ? '< 1 mo' : `${Math.ceil(o.payback)} mo`}
              </span>
            </button>
          )
        })}
        {!outlook.length && <div className="px-2 py-3 text-xs text-dim">You do not sell in any region yet.</div>}
      </div>
      <div className="px-4 pb-4 text-[11px] leading-snug text-faint">
        Profit is for a month at today's prices and devices, with the shelves stocked. Your stores are served from the warehouse before retailers, so keep enough stock to cover them. Regions where more people know your name, and with lower import duties, do better.
      </div>
    </Drawer>
  )
}
