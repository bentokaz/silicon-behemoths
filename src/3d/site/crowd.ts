// The people on a site, as a small simulation that only the 3D view sees:
// each employee walks in, sits at their own desk, breaks for coffee, lunch
// and the gym, meets their team and goes home, following the site's clock.
// Shoppers in a store and applicants in the lobby use the same bodies.
// Nothing here is saved or read by the game's own simulation.
import type { OfficeLife } from '../../sim/life'
import { ROLE_INFO } from '../../sim/staff'
import type { Employee, Role, Site } from '../../sim/types'
import { dayOf, hourOf } from './clock'
import { type Nav, PATH_MAX } from './nav'
import { Pose, type Spot, USE } from './spots'

export const Act = { None: -1, Home: 0, Desk: 1, Station: 2, Meet: 3, Lunch: 4, Coffee: 5, Gym: 6, Wander: 7, Away: 8, Quit: 9, Visit: 10, Shop: 11 } as const
export const Mode = { Off: 0, In: 1, Walk: 2, Enter: 3, Do: 4, Exit: 5, Out: 6 } as const
export const Kind = { Staff: 0, Applicant: 1, Shopper: 2 } as const

/** Deterministic pseudo-random number in [0, 1) from a number. */
export function rnd(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** When a team meets and at which table: teams take the tables in turn, a few slots in the morning and the rest after lunch. */
export function meetingSlot(team: number, tables: number): { table: number; start: number; end: number } {
  const slot = Math.floor(team / Math.max(1, tables))
  const start = slot < 2 ? 9.9 + slot * 0.85 : 13.6 + ((slot - 2) % 4) * 0.85
  return { table: team % Math.max(1, tables), start, end: start + 0.7 }
}

const SHIRTS = ['#c9553d', '#31506b', '#e9e4da', '#3f7d4d', '#d6a24f', '#6a5a7a', '#2c3036', '#7a8f9c']
const WALK_SPEED = 1.8
const ENTER_TIME = 0.42

export class Body {
  id = ''
  kind: number = Kind.Staff
  name = ''
  role?: Role
  look = 0
  shirt = '#ffffff'
  seed = 0
  x = 0
  y = 0
  z = 0
  yaw = 0
  mode: number = Mode.Off
  act: number = Act.None
  /** The spot they are at, and the one they are heading for. */
  spot: Spot | null = null
  goalSpot: Spot | null = null
  goalTile = -1
  leaving = false
  path = new Int16Array(PATH_MAX)
  pathLen = 0
  pathAt = 0
  fromX = 0
  fromZ = 0
  fromY = 0
  lerp = 0
  pose: number = Pose.Stand
  hip = 0.86
  /** Phase of the walking or working motion, and how fast they are moving. */
  cycle = 0
  speed = 0
  /** Seconds left of whatever they are doing, where that is timed. */
  wait = 0
  thinkIn = 0
  seat: Spot | null = null
  station: Spot | null = null
  team = -1
  teamIndex = 0
  morale = 70
  ask = false
  shining = false
  training = false
  carry = false
  bag = false
  quit = false
  dead = false
  sched = new Float32Array(12)
  schedDay = -1e9
  roams = 0
  /** Shoppers: 0 browsing, 1 queueing, 3 leaving; and stops left to make. */
  stage = 0
  browse = 0
  /** Below 1 while someone is close in front of them, so people file along rather than walk through each other. */
  slow = 1
  /** Smoothed joint angles, owned by the renderer. */
  cur = new Float32Array(11)
  shown = false

  get onSite() {
    return this.mode !== Mode.Off
  }
  get slump() {
    return this.kind === Kind.Staff && this.morale < 35
  }
}

export interface StaffEntry {
  e: Employee
  /** Id of the desk they sit at, if they have one. */
  seat?: string
}

/** What someone is up to, in a few words, for the label under the pointer. */
export function describe(b: Body): string {
  if (b.kind === Kind.Applicant) return 'Here about a job'
  if (b.kind === Kind.Shopper) return b.stage === 1 ? 'Queueing to pay' : b.bag ? 'Leaving with a new device' : 'Browsing'
  if (b.quit) return 'Packing up to leave'
  const going = b.mode === Mode.Walk || b.mode === Mode.In || b.mode === Mode.Exit
  switch (b.act) {
    case Act.Home:
      return 'Heading home'
    case Act.Desk:
      return going ? (b.carry ? 'First day: finding their desk' : 'Walking to their desk') : b.slump ? 'At their desk, struggling' : 'Working at their desk'
    case Act.Station:
      return going ? 'On the way to their station' : 'Working at their station'
    case Act.Meet:
      return going ? 'Going to a team meeting' : 'In a team meeting'
    case Act.Lunch:
      return going ? 'Off to lunch' : 'At lunch'
    case Act.Coffee:
      return going ? 'Taking a break' : 'On a break'
    case Act.Gym:
      return going ? 'Off to the gym' : 'Working out'
    case Act.Wander:
      return 'No desk: nowhere to work'
  }
  return ''
}

export class Crowd {
  bodies: Body[] = []
  /** Bumped when the set of bodies changes, so colours are written again. */
  version = 0
  site!: Site
  nav!: Nav
  spots: Spot[] = []
  private byKey = new Map<string, Spot>()
  private wanderTiles: number[] = []
  private tables: Spot[][] = []
  private lobby = new Set<number>()
  private hours: OfficeLife['hours'] = 'standard'
  private settled = false
  private counter = 0
  /** Stores: how many shoppers to keep on the floor and in the queue. */
  private shopTarget = 0
  private queueTarget = 0
  private spawnIn = 0
  private shopSeq = 0
  private movers: Body[] = []

  // ---------------------------------------------------------------- the site

  setSite(site: Site, nav: Nav, spots: Spot[]) {
    const first = !this.nav
    this.site = site
    this.nav = nav
    this.spots = spots
    this.byKey = new Map(spots.map((s) => [s.key, s]))
    this.lobby = new Set(site.rooms.filter((r) => r.type === 'lobby' || r.type === 'foyer').map((r) => r.n))
    const social = new Set(site.rooms.filter((r) => ['lobby', 'lounge', 'atrium'].includes(r.type)).map((r) => r.n))
    this.wanderTiles = []
    for (let i = 0; i < nav.reach.length; i++) {
      if (!nav.reach[i]) continue
      const room = site.grid[i]
      if (social.has(room)) this.wanderTiles.push(i, i)
      else if (!room && this.nearBuilding(i)) this.wanderTiles.push(i)
    }
    if (!this.wanderTiles.length) for (let i = 0; i < nav.reach.length; i++) if (nav.reach[i]) this.wanderTiles.push(i)
    const tables = new Map<string, Spot[]>()
    for (const s of spots) {
      if (!(s.use & USE.meet)) continue
      let list = tables.get(s.item.id)
      if (!list) tables.set(s.item.id, (list = []))
      list.push(s)
    }
    this.tables = [...tables.values()]
    if (first) return
    // the building changed under people's feet: keep them where they still can be
    const remap = (s: Spot | null) => (s ? (this.byKey.get(s.key) ?? null) : null)
    for (const b of this.bodies) {
      const had = b.spot
      const goal = b.goalSpot
      b.spot = remap(b.spot)
      b.goalSpot = remap(b.goalSpot)
      b.seat = remap(b.seat)
      b.station = remap(b.station)
      if (b.spot) b.spot.taken = b
      if (b.goalSpot) b.goalSpot.taken = b
      if (!b.onSite) continue
      const lostSpot = (had && !b.spot) || (b.spot && (Math.abs(b.spot.x - b.x) > 0.01 || Math.abs(b.spot.z - b.z) > 0.01) && b.mode === Mode.Do)
      const lostGoal = goal && !b.goalSpot
      if (lostSpot) {
        // their chair was sold or moved: stand where they are and think again
        if (b.spot) b.spot.taken = null
        b.spot = null
        this.stand(b)
      } else if (b.mode === Mode.Walk || b.mode === Mode.Enter || b.mode === Mode.Exit) {
        if (lostGoal) this.stand(b)
        else {
          if (b.goalSpot) b.goalTile = b.goalSpot.access
          else if (b.leaving) b.goalTile = nav.entry
          if (b.mode === Mode.Walk) this.route(b)
        }
      } else if (b.mode === Mode.Do && !b.spot) this.stand(b)
    }
  }

  private nearBuilding(tile: number): boolean {
    const { w, h, grid } = this.site
    const x = tile % w
    const y = (tile / w) | 0
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < w && y + dy < h && grid[(y + dy) * w + x + dx]) return true
    return false
  }

  /** Puts someone on their feet on the nearest tile they can walk from, with nothing to do yet. */
  private stand(b: Body) {
    const t = this.nav.nearest(this.nav.tileAt(b.x, b.z))
    if (t >= 0 && this.nav.tileAt(b.x, b.z) !== t) {
      b.x = this.nav.cx(t)
      b.z = this.nav.cz(t)
    }
    if (b.goalSpot && b.goalSpot.taken === b) b.goalSpot.taken = null
    b.goalSpot = null
    b.y = 0
    b.mode = Mode.Do
    b.pose = Pose.Stand
    b.hip = 0.86
    b.act = Act.None
    b.thinkIn = 0
  }

  // ---------------------------------------------------------------- who is here

  /** Tells the crowd who works here now. People who have gone pack up and walk out; new ones walk in. */
  setStaff(list: StaffEntry[], life: OfficeLife | undefined, day: number, employed: Set<string>) {
    const fresh = this.settled
    const seen = new Set<string>()
    this.hours = life?.hours ?? 'standard'
    let changed = false
    for (const { e, seat } of list) {
      seen.add(e.id)
      let b = this.bodies.find((x) => x.kind === Kind.Staff && x.id === e.id && !x.quit)
      const applicant = b ? undefined : this.bodies.find((x) => x.kind === Kind.Applicant && x.id === e.id && !x.quit)
      if (applicant) {
        // hired from the lobby: the same person now goes to find their desk
        b = applicant
        b.kind = Kind.Staff
        b.act = Act.None
        b.carry = true
        b.thinkIn = 0.6
        changed = true
      }
      if (!b) {
        b = new Body()
        b.id = e.id
        b.kind = Kind.Staff
        b.look = e.look
        b.seed = e.look + 17
        b.carry = fresh && day - e.hiredDay <= 3
        b.thinkIn = fresh ? 0.4 + rnd(e.look) * 1.5 : 0
        this.bodies.push(b)
        changed = true
      }
      const shirt = ROLE_INFO[e.role].color
      if (b.shirt !== shirt) changed = true
      b.shirt = shirt
      b.name = e.name
      b.role = e.role
      b.morale = e.morale
      b.ask = !!e.ask
      b.training = e.trainingUntil !== undefined && e.trainingUntil > day
      b.shining = !!life?.shining.has(e.id)
      const seatSpot = seat ? (this.byKey.get(`${seat}:0`) ?? null) : null
      if (b.seat !== seatSpot) {
        // moved desks: go and find the new one
        if (b.seat && b.seat.taken === b && b.spot !== b.seat) b.seat.taken = null
        b.seat = seatSpot
        if (b.act === Act.Desk || b.act === Act.Wander) b.act = Act.None
      }
      b.station = null
      b.team = -1
      b.schedDay = -1e9
    }
    if (life) {
      // the best of each role work at its stations
      for (const [role, ids] of life.stationed) {
        const stations = this.spots.filter((s) => s.use & USE.station && s.role === role && s.access >= 0)
        const used = new Set<Spot>()
        let k = 0
        for (const id of ids) {
          if (k++ >= stations.length) break
          const b = this.bodies.find((x) => x.kind === Kind.Staff && x.id === id && !x.quit)
          if (!b || !b.seat) continue
          // the nearest free station they can walk to from their own desk
          let best: Spot | null = null
          let bestD = Infinity
          for (const s of stations) {
            if (used.has(s) || b.seat.access < 0 || this.nav.zone[s.access] !== this.nav.zone[b.seat.access]) continue
            const d = Math.abs(s.x - b.seat.x) + Math.abs(s.z - b.seat.z)
            if (d < bestD) {
              bestD = d
              best = s
            }
          }
          if (best) {
            used.add(best)
            b.station = best
          }
        }
      }
      let n = 0
      for (const t of life.teams) {
        if (!t.leadId || t.members.length < 2) continue
        t.members.forEach((id, i) => {
          const b = this.bodies.find((x) => x.kind === Kind.Staff && x.id === id && !x.quit)
          if (b) {
            b.team = n
            b.teamIndex = id === t.leadId ? 0 : i + 1
          }
        })
        n++
      }
    }
    for (const b of this.bodies) {
      if (b.kind !== Kind.Staff || b.quit || seen.has(b.id)) continue
      // gone from the company: pack up and walk out. Still employed but no longer drawn live: just step out of the picture.
      if (employed.has(b.id)) {
        this.vanish(b)
        b.dead = true
      } else b.quit = true
      b.thinkIn = 0
      changed = true
    }
    if (changed) this.version++
  }

  /** People waiting in the lobby to be interviewed. */
  setApplicants(list: Employee[]) {
    const want = this.spots.some((s) => s.use & USE.visit) ? list.slice(0, 3) : []
    const ids = new Set(want.map((e) => e.id))
    let changed = false
    for (const b of this.bodies) {
      if (b.kind === Kind.Applicant && !ids.has(b.id) && !b.quit) {
        b.quit = true
        b.thinkIn = 0
      }
    }
    for (const e of want) {
      if (this.bodies.some((b) => b.kind === Kind.Applicant && b.id === e.id && !b.quit)) continue
      const b = new Body()
      b.id = e.id
      b.kind = Kind.Applicant
      b.name = e.name
      b.role = e.role
      b.look = e.look
      b.seed = e.look + 91
      b.shirt = '#8d9299'
      b.thinkIn = this.settled ? 1 + rnd(e.look) * 4 : 0
      this.bodies.push(b)
      changed = true
    }
    if (changed) this.version++
  }

  /** Stores: how busy the floor is (people to keep browsing) and how long the checkout queue should be. */
  setShop(shoppers: number, queue: number) {
    this.shopTarget = shoppers
    this.queueTarget = queue
  }

  // ---------------------------------------------------------------- the day

  private plan(b: Body, day: number) {
    if (b.schedDay === day) return
    b.schedDay = day
    const r = (k: number) => rnd(b.seed * 7.13 + day * 3.7 + k * 11.9)
    const s = b.sched
    const late = this.hours === 'crunch' ? 1.6 : this.hours === 'relaxed' ? -0.9 : 0
    s[0] = 7.5 + r(1) * 1.3 + (this.hours === 'relaxed' ? 0.4 : 0)
    // one in a dozen stays on into the evening
    s[1] = 17.1 + r(2) * 1.3 + late + (r(12) < 0.08 ? 2.4 : 0)
    s[2] = 11.7 + r(3) * 1.5
    s[3] = s[2] + 0.7 + r(4) * 0.3
    s[4] = 9.5 + r(5) * 1.6
    s[5] = s[4] + 0.22 + r(6) * 0.14
    s[6] = 14.4 + r(7) * 2
    s[7] = s[6] + 0.22 + r(8) * 0.14
    // about a third of people use the gym on a given day, before going home or instead of a long lunch
    const gym = r(9) < 0.34
    s[8] = gym ? (r(10) < 0.5 ? s[3] : 16 + r(11) * 0.8) : 99
    s[9] = s[8] + 0.55
    if (b.team >= 0 && this.tables.length) {
      const slot = meetingSlot(b.team, this.tables.length)
      s[10] = slot.start
      s[11] = slot.end
    } else s[10] = s[11] = 99
  }

  private desire(b: Body, hour: number, day: number): number {
    if (b.quit) return Act.Quit
    if (b.kind === Kind.Applicant) return hour >= 9.1 + rnd(b.seed) * 0.6 && hour < 16.8 ? Act.Visit : Act.Home
    if (b.training) return Act.Away
    this.plan(b, day)
    const s = b.sched
    if (hour < s[0] || hour >= s[1]) return Act.Home
    if (!b.seat) return Act.Wander
    if (hour >= s[10] && hour < s[11]) return Act.Meet
    if (hour >= s[2] && hour < s[3]) return Act.Lunch
    if (hour >= s[8] && hour < s[9]) return Act.Gym
    if ((hour >= s[4] && hour < s[5]) || (hour >= s[6] && hour < s[7])) return Act.Coffee
    if (b.station && ((hour >= 9.9 && hour < 11.6) || (hour >= 14 && hour < 16.2))) return Act.Station
    return Act.Desk
  }

  /** The stretch of joined-up floor someone is on (or will come in by, if they are away). */
  private zoneOf(b: Body): number {
    const nav = this.nav
    if (b.mode === Mode.Off) return nav.entry >= 0 ? nav.zone[nav.entry] : 0
    if (b.spot && b.spot.access >= 0) return nav.zone[b.spot.access]
    const t = nav.tileAt(b.x, b.z)
    return t >= 0 ? nav.zone[t] : 0
  }

  /** The best free spot of a kind for someone, or null. Nearer ones win, with some variety. Only spots they can walk to count. */
  private pick(b: Body, use: number, lobbyOnly = false): Spot | null {
    let best: Spot | null = null
    let bestScore = Infinity
    const salt = b.seed + ++this.counter
    const zone = this.zoneOf(b)
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i]
      if (!(s.use & use) || s.access < 0 || (s.taken && s.taken !== b) || this.nav.zone[s.access] !== zone) continue
      if (lobbyOnly && !(s.use & USE.visit) && !this.lobby.has(s.room)) continue
      const d = Math.abs(s.x - b.x) + Math.abs(s.z - b.z)
      const score = (d + 6) * (0.45 + rnd(salt + i * 3.1))
      if (score < bestScore) {
        bestScore = score
        best = s
      }
    }
    return best
  }

  private chair(b: Body): Spot | null {
    if (b.team < 0 || !this.tables.length) return null
    const table = this.tables[b.team % this.tables.length]
    // the lead takes the first chair; anyone past the last chair, or with no way to walk there, stays at their desk
    const s = table[b.teamIndex]
    return s && s.access >= 0 && this.nav.zone[s.access] === this.zoneOf(b) ? s : null
  }

  private spotFor(b: Body, want: number): Spot | null {
    switch (want) {
      case Act.Station:
        return b.station ?? b.seat
      case Act.Meet:
        return this.chair(b) ?? b.seat
      case Act.Lunch:
        return this.pick(b, USE.lunch) ?? b.seat
      case Act.Coffee:
        return this.pick(b, USE.coffee) ?? b.seat
      case Act.Gym:
        return this.pick(b, USE.gym) ?? b.seat
      case Act.Visit:
        return this.pick(b, USE.visit | USE.wait, true)
    }
    return b.seat
  }

  private think(b: Body, hour: number, day: number) {
    if (b.kind === Kind.Shopper) return this.thinkShopper(b, hour)
    const want = this.desire(b, hour, day)
    if (want === Act.Quit) {
      if (b.mode === Mode.Off) b.dead = true
      else if (b.act !== Act.Quit) {
        b.act = Act.Quit
        b.carry = b.kind === Kind.Staff
        if (b.kind === Kind.Staff && b.spot) {
          b.pose = Pose.Pack
          b.hip = 0.86
          b.wait = 2.8
        } else b.wait = 0
      } else if (b.wait <= 0 && !b.leaving) this.leave(b)
      return
    }
    const away = want === Act.Home || want === Act.Away
    if (away) {
      if (b.mode === Mode.Off) {
        b.act = want
        return
      }
      if (!b.leaving) {
        b.act = Act.Home
        this.leave(b)
      }
      return
    }
    if (want === b.act && b.mode !== Mode.Off && (b.spot || b.wait > 0 || want === Act.Wander)) {
      if (want === Act.Wander && b.wait <= 0) this.roam(b)
      return
    }
    const spot = want === Act.Wander ? null : this.spotFor(b, want)
    b.act = want
    if (b.mode === Mode.Off) {
      // walking in from the street, unless their desk is somewhere no door leads to from outside
      if (this.nav.entry < 0 || (spot && (spot.access < 0 || !this.nav.reach[spot.access]))) {
        if (spot) this.place(b, spot)
        return
      }
      b.x = this.nav.outside[0] + (rnd(b.seed + 3) - 0.5) * 2.4
      b.z = this.nav.outside[1] + (rnd(b.seed + 4) - 0.5) * 1.2
      b.y = 0
      b.yaw = Math.atan2(-(this.nav.cx(this.nav.entry) - b.x), -(this.nav.cz(this.nav.entry) - b.z))
      b.mode = Mode.In
      b.pose = Pose.Stand
      b.hip = 0.86
      b.leaving = false
      if (spot) this.aim(b, spot)
      else this.aimTile(b, this.wanderTile(b))
      return
    }
    if (!spot) return this.roam(b)
    if (spot === b.spot) return
    this.aim(b, spot)
    this.depart(b)
  }

  private wanderTile(b: Body): number {
    return this.wanderTiles.length ? this.wanderTiles[Math.floor(rnd(b.seed + ++b.roams * 5.3) * this.wanderTiles.length)] : this.nav.entry
  }

  /** Someone with nowhere to be drifts between the lobby, the lounge and the grounds. */
  private roam(b: Body) {
    b.wait = 5 + rnd(b.seed + b.roams) * 9
    const sit = rnd(b.seed + b.roams * 2.7) < 0.45 ? this.pick(b, USE.look | USE.wait | USE.coffee) : null
    if (sit && sit !== b.spot) this.aim(b, sit)
    else this.aimTile(b, this.wanderTile(b))
    this.depart(b)
  }

  private release(b: Body, s: Spot | null) {
    if (s && s.taken === b) s.taken = null
  }

  private aim(b: Body, spot: Spot) {
    if (b.goalSpot !== spot) this.release(b, b.goalSpot)
    b.goalSpot = spot
    spot.taken = b
    b.goalTile = spot.access
    b.leaving = false
  }

  private aimTile(b: Body, tile: number) {
    this.release(b, b.goalSpot)
    b.goalSpot = null
    b.goalTile = tile
    b.leaving = false
  }

  private leave(b: Body) {
    this.release(b, b.goalSpot)
    b.goalSpot = null
    b.goalTile = this.nav.entry
    b.leaving = true
    if (this.nav.entry < 0 || this.zoneOf(b) !== this.nav.zone[this.nav.entry]) return this.vanish(b)
    this.depart(b)
  }

  private vanish(b: Body) {
    this.release(b, b.spot)
    this.release(b, b.goalSpot)
    b.spot = b.goalSpot = null
    b.mode = Mode.Off
    b.leaving = false
    b.carry = false
    if (b.quit || b.kind === Kind.Shopper) b.dead = true
  }

  /** Sets off toward the goal: out of the chair first, if they are in one. */
  private depart(b: Body) {
    if (b.mode === Mode.In) return
    if (b.spot) {
      const from = b.spot
      if (from !== b.goalSpot) this.release(b, from)
      b.spot = null
      if (from.access >= 0) {
        b.fromX = b.x
        b.fromZ = b.z
        b.fromY = b.y
        b.lerp = 0
        b.mode = Mode.Exit
        b.pathLen = 0
        b.pose = Pose.Stand
        b.hip = 0.86
        // step back out to the tile they came in by
        b.path[0] = from.access
        return
      }
      const t = this.nav.nearest(this.nav.tileAt(b.x, b.z))
      if (t >= 0) {
        b.x = this.nav.cx(t)
        b.z = this.nav.cz(t)
      }
      b.y = 0
    }
    b.pose = Pose.Stand
    b.hip = 0.86
    this.route(b)
  }

  /** Works out the way to the goal tile from where they stand. */
  private route(b: Body) {
    const nav = this.nav
    let from = nav.tileAt(b.x, b.z)
    if (from < 0 || !nav.walk[from]) from = nav.nearest(from < 0 ? nav.entry : from)
    if (b.goalTile < 0 || from < 0) return this.arrive(b, true)
    if (from === b.goalTile) return this.arrive(b, false)
    b.pathLen = nav.find(from, b.goalTile, b.path)
    b.pathAt = 0
    if (!b.pathLen) return this.arrive(b, true)
    b.mode = Mode.Walk
  }

  /** At the goal tile (or unable to walk there, and so simply put there). */
  private arrive(b: Body, jump: boolean) {
    if (b.leaving) {
      if (jump) return this.vanish(b)
      b.mode = Mode.Out
      return
    }
    const spot = b.goalSpot
    if (!spot) {
      if (jump && b.goalTile >= 0) {
        b.x = this.nav.cx(b.goalTile)
        b.z = this.nav.cz(b.goalTile)
      }
      b.mode = Mode.Do
      b.pose = Pose.Look
      b.hip = 0.86
      b.speed = 0
      return
    }
    if (jump) return this.place(b, spot)
    b.fromX = b.x
    b.fromZ = b.z
    b.fromY = b.y
    b.lerp = 0
    b.mode = Mode.Enter
    b.pose = spot.pose
    b.hip = spot.hip
  }

  /** Puts someone straight into a spot, with no walk. */
  private place(b: Body, spot: Spot) {
    if (b.spot !== spot) this.release(b, b.spot)
    b.goalSpot = spot
    spot.taken = b
    b.x = spot.x
    b.z = spot.z
    b.y = spot.y
    b.yaw = spot.face
    b.pose = spot.pose
    b.hip = spot.hip
    this.settle(b)
  }

  /** Arrived in the spot. */
  private settle(b: Body) {
    b.spot = b.goalSpot
    b.goalSpot = null
    b.mode = Mode.Do
    b.speed = 0
    b.leaving = false
    if (b.spot === b.seat) b.carry = false
    if (b.kind === Kind.Shopper) b.wait = b.stage === 1 ? 2.2 + rnd(b.seed + b.browse) * 2 : 3 + rnd(b.seed + b.browse * 3) * 5
  }

  // ---------------------------------------------------------------- shoppers

  private queueLength(): number {
    let n = 0
    for (const b of this.bodies) if (b.kind === Kind.Shopper && b.stage === 1) n++
    return n
  }

  /** The back of the shortest checkout queue, or null when the queues are full or shut. */
  private queueSpot(): Spot | null {
    let best: Spot | null = null
    for (const s of this.spots) {
      if (!(s.use & USE.queue) || s.taken || s.access < 0) continue
      // the first free place in each line, provided everyone ahead is in place
      let ahead = true
      for (const o of this.spots) if (o.item === s.item && o.use & USE.queue && o.q < s.q && !o.taken) ahead = false
      if (ahead && (!best || s.q < best.q)) best = s
    }
    return best
  }

  private thinkShopper(b: Body, hour: number) {
    if (b.mode !== Mode.Do) return
    const shut = hour < 8.8 || hour >= 20.2
    if (b.stage === 1 && b.spot) {
      if (b.spot.q === 0) {
        if (b.wait > 0) return
        b.bag = true
        b.stage = 3
        return this.leave(b)
      }
      // shuffle forward as the line moves
      const next = this.spots.find((s) => s.item === b.spot!.item && s.use & USE.queue && s.q === b.spot!.q - 1)
      if (next && !next.taken) {
        this.aim(b, next)
        this.depart(b)
      }
      return
    }
    if (b.wait > 0 && !shut) return
    if (b.browse > 0 && !shut) {
      b.browse--
      const s = this.pick(b, USE.browse | (rnd(b.seed + b.browse) < 0.2 ? USE.help : 0))
      if (s && s !== b.spot) {
        this.aim(b, s)
        return this.depart(b)
      }
    }
    if (!shut && this.queueLength() < this.queueTarget) {
      const q = this.queueSpot()
      if (q) {
        b.stage = 1
        this.aim(b, q)
        return this.depart(b)
      }
    }
    b.stage = 3
    this.leave(b)
  }

  private spawnShopper(placed: boolean) {
    const b = new Body()
    const n = ++this.shopSeq
    b.id = `shopper${n}`
    b.kind = Kind.Shopper
    b.look = Math.floor(rnd(n * 13.7 + 5) * 9000)
    b.seed = b.look + n
    b.shirt = SHIRTS[n % SHIRTS.length]
    b.browse = 1 + Math.floor(rnd(n * 3.3) * 3)
    b.act = Act.Shop
    const s = this.pick(b, USE.browse)
    if (!s) return
    this.bodies.push(b)
    this.version++
    if (placed || this.nav.entry < 0) return this.place(b, s)
    b.x = this.nav.outside[0] + (rnd(n) - 0.5) * 3
    b.z = this.nav.outside[1]
    b.mode = Mode.In
    this.aim(b, s)
  }

  // ---------------------------------------------------------------- moving

  /** Moves toward a point; true once there. */
  private toward(b: Body, tx: number, tz: number, dt: number, near: number): boolean {
    const dx = tx - b.x
    const dz = tz - b.z
    const d = Math.hypot(dx, dz)
    if (d <= near) return true
    const v = WALK_SPEED * (b.slump ? 0.68 : 1) * (0.92 + rnd(b.seed) * 0.2) * (b.carry ? 0.85 : 1) * b.slow
    const stepLen = Math.min(d, v * dt)
    b.x += (dx / d) * stepLen
    b.z += (dz / d) * stepLen
    b.speed = v
    b.cycle += v * dt * 4.2
    // turn to face the way they are going, quickly but not instantly
    const want = Math.atan2(-dx, -dz)
    let diff = want - b.yaw
    diff -= Math.round(diff / (Math.PI * 2)) * Math.PI * 2
    b.yaw += diff * Math.min(1, dt * 11)
    return d - stepLen <= near
  }

  private move(b: Body, dt: number) {
    const nav = this.nav
    switch (b.mode) {
      case Mode.In:
        if (this.toward(b, nav.cx(nav.entry), nav.cz(nav.entry), dt, 0.1)) this.route(b)
        break
      case Mode.Out:
        if (this.toward(b, nav.outside[0] + (rnd(b.seed + 3) - 0.5) * 2.4, nav.outside[1], dt, 0.15)) this.vanish(b)
        break
      case Mode.Walk: {
        const tile = b.path[b.pathAt]
        const last = b.pathAt === b.pathLen - 1
        // everyone keeps a little to their own side of the tile, so a corridor is not a single file line
        const ox = last ? 0 : (rnd(b.seed + 1) - 0.5) * 0.3
        const oz = last ? 0 : (rnd(b.seed + 2) - 0.5) * 0.3
        if (this.toward(b, nav.cx(tile) + ox, nav.cz(tile) + oz, dt, last ? 0.06 : 0.3)) {
          if (last) this.arrive(b, false)
          else b.pathAt++
        }
        break
      }
      case Mode.Enter: {
        const s = b.goalSpot
        if (!s) {
          this.stand(b)
          break
        }
        b.lerp = Math.min(1, b.lerp + dt / ENTER_TIME)
        const k = b.lerp * b.lerp * (3 - 2 * b.lerp)
        b.x = b.fromX + (s.x - b.fromX) * k
        b.z = b.fromZ + (s.z - b.fromZ) * k
        b.y = b.fromY + (s.y - b.fromY) * k
        let diff = s.face - b.yaw
        diff -= Math.round(diff / (Math.PI * 2)) * Math.PI * 2
        b.yaw += diff * Math.min(1, dt * 9)
        b.speed = 0
        if (b.lerp >= 1) {
          b.yaw = s.face
          this.settle(b)
        }
        break
      }
      case Mode.Exit: {
        const t = b.path[0]
        b.lerp = Math.min(1, b.lerp + dt / ENTER_TIME)
        const k = b.lerp * b.lerp * (3 - 2 * b.lerp)
        b.x = b.fromX + (nav.cx(t) - b.fromX) * k
        b.z = b.fromZ + (nav.cz(t) - b.fromZ) * k
        b.y = b.fromY * (1 - k)
        b.speed = 0
        if (b.lerp >= 1) this.route(b)
        break
      }
      case Mode.Do:
        b.speed = 0
        b.cycle += dt
        if (b.wait > 0) b.wait -= dt
        break
    }
  }

  /**
   * Advances everyone. `dt` is real seconds, `pace` how briskly people move
   * at the current game speed, `t` the site clock in hours.
   */
  step(dt: number, pace: number, t: number) {
    if (!this.nav) return
    const hour = hourOf(t)
    const day = dayOf(t)
    if (!this.settled) {
      // first look at the site: everyone is already wherever the hour says they should be
      this.settled = true
      for (const b of this.bodies) this.drop(b, hour, day)
      const open = hour >= 9 && hour < 20
      for (let i = 0; open && i < Math.round(this.shopTarget * 0.8); i++) this.spawnShopper(true)
    }
    const step = dt * pace
    // anyone walking close behind someone going the same way eases off
    const movers = this.movers
    movers.length = 0
    for (const b of this.bodies) if (b.mode === Mode.Walk || b.mode === Mode.In || b.mode === Mode.Out) movers.push(b)
    for (let i = 0; i < movers.length; i++) {
      const b = movers[i]
      const fx = -Math.sin(b.yaw)
      const fz = -Math.cos(b.yaw)
      let slow = 1
      for (let j = 0; j < movers.length; j++) {
        if (j === i) continue
        const o = movers[j]
        const dx = o.x - b.x
        const dz = o.z - b.z
        const d2 = dx * dx + dz * dz
        if (d2 > 0.5 || Math.cos(o.yaw - b.yaw) < 0.2) continue
        const ahead = dx * fx + dz * fz
        // two people on the very same spot: one of them waits
        if (ahead > 0.12 || (d2 < 0.03 && j < i)) slow = Math.min(slow, d2 < 0.2 ? 0.2 : 0.55)
      }
      b.slow = slow
    }
    let dead = false
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i]
      b.thinkIn -= dt
      if (b.thinkIn <= 0 && (b.mode === Mode.Do || b.mode === Mode.Off)) {
        b.thinkIn = 0.3 + rnd(b.seed + i) * 0.35
        this.think(b, hour, day)
      }
      if (b.mode !== Mode.Off) this.move(b, step)
      if (b.dead) dead = true
    }
    if (dead) {
      for (const b of this.bodies) if (b.dead) (this.release(b, b.spot), this.release(b, b.goalSpot))
      this.bodies = this.bodies.filter((b) => !b.dead)
      this.version++
    }
    if (this.shopTarget > 0 || this.bodies.some((b) => b.kind === Kind.Shopper)) {
      this.spawnIn -= step
      const open = hour >= 9 && hour < 20
      let n = 0
      for (const b of this.bodies) if (b.kind === Kind.Shopper && b.stage !== 3) n++
      if (open && this.spawnIn <= 0 && n < this.shopTarget) {
        this.spawnIn = 1.2 + rnd(this.shopSeq) * 2.5
        this.spawnShopper(false)
      }
    }
  }

  /** Puts someone where the hour says they would be, without the walk. */
  private drop(b: Body, hour: number, day: number) {
    if (b.kind === Kind.Shopper) return
    const want = this.desire(b, hour, day)
    b.thinkIn = rnd(b.seed) * 0.6
    if (want === Act.Home || want === Act.Away || want === Act.Quit) {
      b.act = want === Act.Quit ? Act.None : want
      b.mode = Mode.Off
      return
    }
    b.act = want
    const spot = want === Act.Wander ? null : this.spotFor(b, want)
    if (spot) return this.place(b, spot)
    const t = this.wanderTile(b)
    if (t < 0) return
    b.x = this.nav.cx(t)
    b.z = this.nav.cz(t)
    b.yaw = rnd(b.seed) * 6.28
    b.mode = Mode.Do
    b.pose = Pose.Look
    b.wait = 2 + rnd(b.seed) * 8
  }

  // ---------------------------------------------------------------- questions

  /** True if anyone on foot is within `r` of a point: doors use it to know when to swing. */
  near(x: number, z: number, r: number): boolean {
    for (const b of this.bodies) {
      if (b.mode !== Mode.Walk && b.mode !== Mode.In && b.mode !== Mode.Out) continue
      const dx = b.x - x
      const dz = b.z - z
      if (dx * dx + dz * dz < r * r) return true
    }
    return false
  }

  /** The body a ray passes through first, with how far along the ray it is. */
  hit(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): { body: Body; t: number } | null {
    let best: Body | null = null
    let bestT = Infinity
    for (const b of this.bodies) {
      if (b.mode === Mode.Off) continue
      const top = b.y + b.hip + 0.72
      for (let k = 0; k < 3; k++) {
        const cy = k === 0 ? top : k === 1 ? b.y + b.hip + 0.25 : b.y + b.hip * 0.45
        const px = b.x - ox
        const py = cy - oy
        const pz = b.z - oz
        const along = px * dx + py * dy + pz * dz
        if (along <= 0 || along >= bestT) continue
        const d2 = px * px + py * py + pz * pz - along * along
        if (d2 < 0.3 * 0.3) {
          bestT = along
          best = b
        }
      }
    }
    return best ? { body: best, t: bestT } : null
  }
}
