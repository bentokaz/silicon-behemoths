// Sites, Venue: the company's own stage in 3D. One line of status floats over
// it (the next show, seats, whether a keynote can be held); how far a show
// carries, the rehearsal and the move to a bigger site sit behind that line.
// Shows themselves are booked under Marketing, Events.
import { useState } from 'react'
import { sfx } from '../audio/sfx'
import { autoVenue, buildVenue } from '../sim/game'
import { EVENTS, OWN_VENUE } from '../sim/growth'
import { SITE_TIERS, tierOf, upkeep, venueStats } from '../sim/sites'
import { useGame, useStore } from '../store/game'
import { SiteBuilder } from './SiteBuilder'
import { aSite, nextEvent, starterStageCost, venueStatus } from './SitesFigures'
import { BarRow, Detail, Fact, Note, Sec, SiteIntro } from './SitesParts'
import { Btn, ConfirmBtn, money } from './ui'

export function VenueScreen() {
  const g = useGame()
  const { act, say, go } = useStore.getState()
  const [rehearse, setRehearse] = useState(false)
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
        <Fact k="Next event" v={event ? `${event.name}, ${event.date}` : 'Nothing booked'} title={event?.where} />
        <Fact k="Shows held here" v={held} num />
        <Btn small icon={rehearse ? 'stop' : 'mic'} className="mt-1 w-full" active={rehearse} disabled={!st.ready && !rehearse} title={st.ready || rehearse ? 'Fills the seats and puts a presenter on stage, to see the venue as it will be on the night. Nothing is charged.' : `There is nothing to rehearse yet. ${st.problem ?? ''}`} onClick={() => setRehearse(!rehearse)}>
          {rehearse ? 'End the rehearsal' : 'Rehearse with a full house'}
        </Btn>
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
