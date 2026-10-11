import { it } from 'vitest'
import { autoVenue, buildVenue, defaultConfig, newGame } from '../../sim/game'
import { Kind } from './crowd'
import { buildNav } from './nav'
import { buildSpots } from './spots'
import { SHOW, VenueCrowd } from './venuecrowd'

it('dbg', () => {
  const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed: 4 })
  buildVenue(s)
  autoVenue(s)
  const site = s.venue!
  const nav = buildNav(site)
  const crowd = new VenueCrowd()
  crowd.setSite(site, nav, buildSpots(site, nav))
  crowd.setProgramme({ booked: true, live: false, draw: 0.9 })
  crowd.walkers = 30
  for (let t = SHOW.doors - 0.2; t < SHOW.cleared + 0.6; t += 1 / 30 / 45) crowd.step(1 / 30, 1, t)
  for (const b of crowd.bodies.filter((x) => x.kind === Kind.Guest))
    console.log(`${b.id} m${b.mode} stage=${b.stage} (${b.x.toFixed(1)},${b.z.toFixed(1)}) tile=${nav.tileAt(b.x, b.z)} path ${b.pathAt}/${b.pathLen} still=${b.still.toFixed(1)} pat=${b.patience.toFixed(1)} slow=${b.slow.toFixed(2)} leaving=${b.leaving} gate=${b.gate}/${b.waitGate} ghost=${b.ghost.toFixed(1)}`)
  console.log(`entry=${nav.entry} (${nav.cx(nav.entry)},${nav.cz(nav.entry)}) outside=${nav.outside} ghosts=${crowd.ghosts} phase=${crowd.phase}`)
})
