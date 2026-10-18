// Sites, Venue: the company's own stage in 3D. One line of status floats over
// it (the next show, seats, whether a keynote can be held); how far a show
// carries, the rehearsal and the move to a bigger site sit behind that line.
// Shows themselves are booked under Marketing, Events.
import { useMemo, useState } from 'react'
import { sfx } from '../audio/sfx'
import { applyVenuePreset, autoVenue, buildVenue, lookCost, raiseVenueRoof, venuePresetQuote } from '../sim/game'
import { EVENTS, OWN_VENUE } from '../sim/growth'
import { SITE_TIERS, VENUE_PRESETS, type VenuePreset, rigFloors, tierOf, upkeep, venueStats } from '../sim/sites'
import { useGame, useStore } from '../store/game'
import { SiteBuilder } from './SiteBuilder'
import { aSite, nextEvent, starterStageCost, venueStatus } from './SitesFigures'
import { BarRow, Detail, Fact, Note, Sec, SiteIntro } from './SitesParts'
import { Btn, ConfirmBtn, money } from './ui'

export function VenueScreen() {
  const g = useGame()
  const { act, say, go } = useStore.getState()
  const [rehearse, setRehearse] = useState(false)
  // laying out three whole venues to price them is not free: done again only when the plot or the cash moves
  const cashKey = Math.round(g.cash / 1e5)
  const quotes = useMemo(
    () => Object.fromEntries((Object.keys(VENUE_PRESETS) as VenuePreset[]).map((k) => [k, venuePresetQuote(g, k)])) as Record<VenuePreset, ReturnType<typeof venuePresetQuote>>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [g.venue, g.venue?.rev, g.venue?.tier, cashKey],
  )
  const next = SITE_TIERS.venue[g.venue ? g.venue.tier + 1 : 0]
  const buy = () => {
    const err = act((s) => buildVenue(s))
    if (err) say(err, 'bad')
    else sfx.confirm()
  }
  const hire = EVENTS.keynote.venues

  if (!g.venue) {
    return (
      <SiteIntro
        icon="venue"
        title="A venue of your own"
        facts={[
          { label: 'Site', value: `${next.name}, ${next.w} x ${next.h} m` },
          { label: 'Upkeep a month', value: <span className="num">{money(next.rent)}</span> },
        ]}
        action={
          <ConfirmBtn tone="primary" large icon="build" className="w-full" confirm={`Pay ${money(next.cost)}?`} onClick={buy}>
            Build the venue for {money(next.cost)}
          </ConfirmBtn>
        }
      >
        A keynote on your own stage costs {money(hire[OWN_VENUE].cost)}, where a hired theatre is {money(hire[1].cost)} and an arena {money(hire[2].cost)}, and the more seats and equipment it has the further each show carries. The plot comes bare: you build the stage and the seating on it next.
      </SiteIntro>
    )
  }

  const st = venueStats(g.venue)
  const event = nextEvent(g)
  const held = g.events.filter((e) => e.done && e.type === 'keynote' && e.venue === OWN_VENUE).length
  const toEvents = () => go({ tab: 'marketing', view: 'events' })
  const empty = !g.venue.items.length
  const starter = starterStageCost()
  const roof = rigFloors(g.venue)
  const roofCost = roof ? lookCost(g.venue, { floors: roof }) : 0
  const raise = () => {
    const err = act((s) => raiseVenueRoof(s))
    if (err) say(err, 'bad')
    else sfx.confirm()
  }
  const preset = (k: VenuePreset) => {
    const err = act((s) => applyVenuePreset(s, k))
    if (err) say(err, 'bad')
    else sfx.zone()
  }

  return (
    <SiteBuilder
      siteRef="venue"
      site={g.venue}
      products={g.products.filter((p) => p.companyId === 'player' && p.status === 'sale')}
      show={rehearse ? { crowd: 0.92, cheer: false, presenter: true } : undefined}
      status={venueStatus(g, toEvents)}
      tools={
        empty ? (
          <ConfirmBtn
            small
            tone="default"
            icon="build"
            confirm={`Pay ${money(starter)}?`}
            title="An open-air stage with a screen, lights, speakers and twelve blocks of seats: enough to hold a keynote"
            onClick={() => {
              const err = act((s) => autoVenue(s))
              if (err) say(err, 'bad')
              else sfx.zone()
            }}
          >
            Lay out a starter stage for {money(starter)}
          </ConfirmBtn>
        ) : undefined
      }
    >
     <Detail>
      <Sec
        title="Events"
        right={
          <Btn small tone="ghost" icon="arrowRight" title="Keynotes are booked under Marketing, Events, for a device still in development" onClick={toEvents}>
            Events
          </Btn>
        }
      >
        {!st.ready && <Note tone="warn">{st.problem} Until then a keynote cannot be booked here.</Note>}
        {roof > 0 && (
          <>
            <Note tone="warn">The roof is too low for the rig: screens and lights are cut down to fit under it.</Note>
            <ConfirmBtn small tone="default" icon="raise" className="mt-1 w-full" confirm={`Pay ${money(roofCost)}?`} title={`Raises the building to ${roof} storeys, so the rig stands at full height`} onClick={raise}>
              Raise the roof for {money(roofCost)}
            </ConfirmBtn>
          </>
        )}
        <Fact k="Next event" v={event ? `${event.name}, ${event.date}` : 'Nothing booked'} title={event?.where} />
        <Fact k="Shows held here" v={held} num />
        <Btn small icon={rehearse ? 'stop' : 'mic'} className="mt-1 w-full" active={rehearse} disabled={!st.ready && !rehearse} title={st.ready || rehearse ? 'Fills the seats and puts a presenter on stage, to see the venue as it will be on the night. Nothing is charged.' : `There is nothing to rehearse yet. ${st.problem ?? ''}`} onClick={() => setRehearse(!rehearse)}>
          {rehearse ? 'End the rehearsal' : 'Rehearse with a full house'}
        </Btn>
      </Sec>
      <Sec title="Ready-made venues">
        <div className="mb-1 text-[11px] text-dim">Clears the plot (its fittings sell for half) and builds a whole venue: hall, stage, screen, lights and seats.</div>
        {(Object.keys(VENUE_PRESETS) as VenuePreset[]).map((k) => {
          const def = VENUE_PRESETS[k]
          const q = quotes[k]
          return (
            <ConfirmBtn key={k} small tone="default" icon="venue" className="mt-1 w-full" disabled={!!q.error || q.same} confirm={q.cost > 0 ? `Pay ${money(q.cost)}?` : 'Rebuild it?'} title={q.error ?? def.note} onClick={() => preset(k)}>
              {def.name}{q.error ? '' : q.same ? ': built' : `, ${money(Math.max(0, q.cost))}`}
            </ConfirmBtn>
          )
        })}
      </Sec>
      <Sec title="How far a show carries">
        <BarRow label="Production" share={st.production} tone={st.production > 0.4 ? 'accent' : 'warn'} title="Screens, lights, sound and cameras for the size of the crowd. More seats need more of them." />
        <BarRow label="Reach" share={st.reach / 1.1} tone={st.reach / 1.1 > 0.4 ? 'accent' : 'warn'} title="How far a keynote here carries: seats first, then production and the prestige of the building. A hired arena is the full bar." />
      </Sec>
      <Sec title="Site">
        <Fact k="Size" v={`${tierOf(g.venue).name}, ${g.venue.w} x ${g.venue.h} m`} />
        <Fact k="Upkeep a month" v={money(upkeep(g.venue))} num />
        {next ? (
          <ConfirmBtn small tone="default" icon="plot" className="mt-1 w-full" confirm={`Pay ${money(next.cost)}?`} title={`${next.blurb} ${next.w} x ${next.h} m, upkeep ${money(next.rent)} a month. Everything built moves across as it stands.`} onClick={buy}>
            Move to {aSite(next.name)} for {money(next.cost)}
          </ConfirmBtn>
        ) : (
          <div className="mt-1 text-[11px] text-dim">This is the largest venue site.</div>
        )}
      </Sec>
     </Detail>
    </SiteBuilder>
  )
}
