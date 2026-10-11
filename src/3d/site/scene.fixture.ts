// Ready-made sites for the crowd's tests: built through the game's own
// actions, so they are laid out the way a player's would be.
import { autoTeams, defaultConfig, hire, newGame, placeItem, setEdge, upgradeOffice, zoneRoom } from '../../sim/game'
import { officeLife } from '../../sim/life'
import { refreshCandidates, seatedStaff } from '../../sim/staff'
import type { GameState } from '../../sim/types'
import { Crowd } from './crowd'
import { buildNav } from './nav'
import { seatOwners } from './seats'
import { buildSpots } from './spots'

const ok = (err: string | null) => {
  if (err) throw new Error(err)
}

/**
 * A business-park office for `people`: an open-plan room of desks in rows, a
 * lounge and a meeting room off a shared corridor, each behind a single door.
 */
export function bigOffice(people = 60, seed = 5): GameState {
  const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed })
  for (let i = 0; i < 2; i++) ok(upgradeOffice(s))
  // clear whatever the starter lot came with, so the layout below is the whole building
  s.office.items = []
  s.office.rooms = []
  s.office.walls = []
  s.office.grid = s.office.grid.map(() => 0)
  s.office.rev++
  ok(zoneRoom(s, 'office', 'work', 2, 2, 19, 11))
  ok(zoneRoom(s, 'office', 'lobby', 2, 12, 29, 13))
  ok(zoneRoom(s, 'office', 'lounge', 20, 2, 29, 6))
  ok(zoneRoom(s, 'office', 'meeting', 20, 7, 29, 11))
  for (const w of [...s.office.walls]) if (w.kind === 'door') ok(setEdge(s, 'office', w.x, w.y, w.side, 'wall'))
  ok(setEdge(s, 'office', 10, 12, 'n', 'door'))
  ok(setEdge(s, 'office', 24, 7, 'n', 'door'))
  ok(setEdge(s, 'office', 24, 12, 'n', 'door'))
  ok(setEdge(s, 'office', 15, 14, 'n', 'door'))
  let desks = 0
  for (let y = 2; y <= 10 && desks < people; y += 2) for (let x = 3; x <= 18 && desks < people; x++) if (x % 5 !== 0) (ok(placeItem(s, 'office', 'desk', x, y, 0)), desks++)
  for (let x = 21; x <= 27; x += 2) ok(placeItem(s, 'office', 'cafe', x, 3, 0))
  ok(placeItem(s, 'office', 'coffee', 21, 5, 0))
  ok(placeItem(s, 'office', 'sofa', 25, 5, 2))
  ok(placeItem(s, 'office', 'meeting', 21, 8, 0))
  ok(placeItem(s, 'office', 'meeting', 25, 8, 0))
  ok(placeItem(s, 'office', 'reception', 20, 12, 2))
  while (s.staff.length < people) {
    refreshCandidates(s)
    for (const c of [...s.candidates]) if (s.staff.length < people) ok(hire(s, c.id))
  }
  autoTeams(s)
  return s
}

export function crowdFor(s: GameState) {
  const site = s.office
  const nav = buildNav(site)
  const crowd = new Crowd()
  const spots = buildSpots(site, nav)
  crowd.setSite(site, nav, spots)
  const owners = seatOwners(site, seatedStaff(s))
  const entries = site.items.filter((i) => owners.has(i.id)).map((i) => ({ e: owners.get(i.id)!, seat: i.id }))
  crowd.setStaff(entries, officeLife(s), s.day, new Set(s.staff.map((e) => e.id)))
  return { crowd, nav, site, spots }
}
