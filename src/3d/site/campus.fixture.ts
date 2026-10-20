// A late-game campus for timing tests: the largest office plot, built over
// with a grid of rooms off corridors and filled with furniture, the way a
// player who has been at it for years would have it.
import { defaultConfig, newGame, placeItems, setEdge, upgradeOffice, zoneRoom } from '../../sim/game'
import type { GameState } from '../../sim/types'

const ok = (err: string | null) => {
  if (err) throw new Error(err)
}

/** Rooms 9 x 6 in rows along east-west corridors, every one with a door and desks wall to wall. */
export function bigCampus(seed = 7): GameState {
  const s = newGame({ ...defaultConfig(), unlimitedMoney: true, seed })
  for (let i = 0; i < 4; i++) ok(upgradeOffice(s))
  const o = s.office
  o.items = []
  o.rooms = []
  o.walls = []
  o.grid = o.grid.map(() => 0)
  o.rev++
  const types = ['work', 'soft', 'eng', 'lab', 'lounge', 'meeting', 'work', 'support']
  let t = 0
  for (let y0 = 2; y0 + 13 < o.h; y0 += 15) {
    // a corridor, then rooms north and south of it
    ok(zoneRoom(s, 'office', 'lobby', 2, y0 + 6, o.w - 3, y0 + 7))
    for (let x0 = 2; x0 + 8 < o.w - 2; x0 += 10) {
      for (const [ya, yb] of [[y0, y0 + 5], [y0 + 8, y0 + 13]] as const) {
        const type = types[t++ % types.length]
        ok(zoneRoom(s, 'office', type, x0, ya, x0 + 8, yb, 'rect', undefined, undefined, true))
        ok(setEdge(s, 'office', x0 + 4, ya === y0 ? y0 + 6 : y0 + 8, 'n', 'door'))
        const kind = type === 'lounge' ? 'sofa' : type === 'meeting' ? 'plant' : type === 'lab' ? 'desk' : 'desk'
        for (let y = ya + 1; y < yb; y += 2) placeItems(s, 'office', kind, x0 + 1, y, x0 + 7, y, 0)
      }
    }
  }
  return s
}
