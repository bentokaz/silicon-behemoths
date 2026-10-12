// Split out of Growth.tsx for the interface redesign.
import { useEffect, useState } from 'react'
import { sfx } from '../audio/sfx'
import { TYPES, segmentsOf } from '../data/devices'
import { autoVenue, buildVenue, closeStore, copyLayout, fmtDate, layoutQuote, layoutValue, newLayoutQuote, openStore, player, scheduleEvent, setCampaignBudget, startCampaign, stopCampaign } from '../sim/game'
import { capOfChannel, has, lockTip } from '../sim/progress'
import { CHANNELS, EVENTS, EVENT_LEAD, OWN_VENUE, channelFit, dailyTickets, eventBlocked, hasStage, keynoteReach, nextFair } from '../sim/growth'
import { homeRegion, openRegions, regionInfo } from '../sim/regions'
import { SITE_TIERS, sitePrestige, storeStats, tierOf, upkeep, venueStats } from '../sim/sites'
import { staffEffects } from '../sim/staff'
import type { ChannelId, EventType, GameState, Store } from '../sim/types'
import { takeAim } from '../store/focus'
import { useGame, useStore, useView } from '../store/game'
import { LockedPane } from './Progress'
import { SiteBuilder } from './SiteBuilder'
import { Icon, channelIcon, eventIcon } from './icons'
import { Btn, Choice, ConfirmBtn, Drawer, Empty, Fold, Head, IconBtn, Kpi, Lead, Meter, Mini, Panel, Slider, Tabs, Tag, Th, money, num, pct, pressable, useKept } from "./ui"

// ------------------------------------------------------------------ venue

export function VenueScreen() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const [rehearse, setRehearse] = useState(false)
  const next = SITE_TIERS.venue[g.venue ? g.venue.tier + 1 : 0]
  const buy = () => {
    const err = act((s) => buildVenue(s))
    if (err) say(err, 'bad')
    else sfx.confirm()
  }
  if (!g.venue) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="w-[520px] border border-line bg-panel p-4">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-fg">
            <Icon name="venue" size={14} className="text-accent" />A venue of your own
          </div>
          <div className="mt-2 text-[12px] leading-relaxed text-dim">
            Hired theatres do the job, but the companies people remember launch on their own stage. Buy a plot and build it your way: an open-air amphitheatre or a hall with a foyer, the stage, the screen, the rigging and every block of seats. Keynotes held there cost a fraction of an arena, and the bigger and better equipped it is, the further each show carries.
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1">
            <Mini label="First plot" icon="pin" value={next.name} tone="text-fg" />
            <Mini label="Size" icon="plot" value={`${next.w} x ${next.h} m`} />
            <Mini label="Upkeep / month" icon="receipt" value={money(next.rent, 1)} />
          </div>
          <ConfirmBtn tone="primary" confirm={`Pay ${money(next.cost, 1)}?`} icon="plot" className="mt-3 h-9 w-full" onClick={buy}>
            Buy the plot for {money(next.cost, 1)}
          </ConfirmBtn>
        </div>
      </div>
    )
  }
  const st = venueStats(g.venue)
  const shows = g.events.filter((e) => e.done && e.type === 'keynote' && e.venue === OWN_VENUE)
  return (
    <SiteBuilder siteRef="venue" site={g.venue} products={g.products.filter((p) => p.companyId === 'player' && p.status === 'sale')} show={rehearse ? { crowd: 0.92, cheer: false, presenter: true } : undefined}>
      <Fold title="Venue" icon="venue" right={st.ready ? <Tag tone="pos" icon="check">ready</Tag> : <Tag tone="warn" icon="alert">not ready</Tag>} bodyClass="p-2">
        {st.problem && <div className="mb-2 text-[11px] text-warn">{st.problem}</div>}
        <div className="grid grid-cols-2 gap-1">
          <Mini label="Seats" icon="seat" value={num(st.seats)} tone="text-fg" />
          <Mini label="Shows held" icon="mic" value={shows.length} />
          <Mini label="Prestige" icon="brand" value={sitePrestige(g.venue).toFixed(0)} />
          <Mini label="Upkeep / month" icon="receipt" value={money(upkeep(g.venue), 1)} />
        </div>
        {(
          [
            ['Production', st.production, 'Screens, lights, sound and cameras for the size of the crowd.', 'camera'],
            ['Reach', st.reach / 1.1, 'How far a keynote here carries. A hired arena is the full bar.', 'target'],
          ] as const
        ).map(([label, v, note, icon]) => (
          <div key={label} className="mt-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-dim">
                <Lead icon={icon} />
                {label}
              </span>
              <span className="num text-[11px] text-fg">{pct(v, 0)}</span>
            </div>
            <Meter value={v} tone={v > 0.75 ? 'pos' : v > 0.4 ? 'accent' : 'warn'} />
            <div className="mt-1 text-[11px] leading-snug text-faint">{note}</div>
          </div>
        ))}
        <Btn small icon={rehearse ? 'stop' : 'mic'} className="mt-2 w-full" active={rehearse} onClick={() => setRehearse(!rehearse)}>
          {rehearse ? 'End the rehearsal' : 'Rehearse with a full house'}
        </Btn>
        {!g.venue.items.length && (
          <Btn
            small
            tone="primary"
            icon="build"
            className="mt-2 w-full"
            onClick={() => {
              const err = act((s) => autoVenue(s))
              if (err) say(err, 'bad')
              else sfx.zone()
            }}
          >
            Lay out a starter stage
          </Btn>
        )}
      </Fold>
      <Fold title="More land" icon="plot" open={false} bodyClass="p-2">
        {next ? (
          <>
            <div className="text-[13px] text-fg">{next.name}</div>
            <div className="text-[11px] leading-snug text-dim">{next.blurb}</div>
            <div className="num mt-1 text-[11px] text-faint">
              {next.w} x {next.h} m, upkeep {money(next.rent, 1)} / mo
            </div>
            <ConfirmBtn tone="primary" confirm={`Pay ${money(next.cost, 1)}?`} icon="truck" className="mt-2 w-full" onClick={buy}>
              Move for {money(next.cost, 1)}
            </ConfirmBtn>
            <div className="mt-1 text-[11px] text-faint">Everything you have built is moved across as it stands.</div>
          </>
        ) : (
          <div className="text-[11px] text-dim">This is the largest venue site there is.</div>
        )}
      </Fold>
    </SiteBuilder>
  )
}
