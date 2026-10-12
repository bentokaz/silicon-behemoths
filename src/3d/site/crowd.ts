// The people on a site, as a small simulation that only the 3D view sees:
// each employee walks in, sits at their own desk, breaks for coffee, lunch
// and the gym, meets their team and goes home, following the site's clock.
// Shoppers in a store and applicants in the lobby use the same bodies, and so
// does everyone at a venue (see venuecrowd.ts).
//
// People on their feet keep out of each other's way: they walk on the right,
// step round whoever is coming toward them or standing about, file behind
// someone going the same way, and take a doorway one at a time while the rest
// wait beside it. Nothing here is saved or read by the game's own simulation.
import type { OfficeLife } from '../../sim/life'
import { ROLE_INFO } from '../../sim/staff'
import type { Employee, Role, Site } from '../../sim/types'
import { dayOf, hourOf } from './clock'
import { type Nav, PATH_MAX } from './nav'
import { Pose, type Spot, USE } from './spots'

export const Act = { None: -1, Home: 0, Desk: 1, Station: 2, Meet: 3, Lunch: 4, Coffee: 5, Gym: 6, Wander: 7, Away: 8, Quit: 9, Visit: 10, Shop: 11, Watch: 12, Crew: 13, Host: 14 } as const
export const Mode = { Off: 0, In: 1, Walk: 2, Enter: 3, Do: 4, Exit: 5, Out: 6 } as const
export const Kind = { Staff: 0, Applicant: 1, Shopper: 2, Guest: 3, Crew: 4, Host: 5, Front: 6, Hand: 7 } as const
/** Something carried that is not decided by what the person is doing. */
export const Tool = { None: 0, Broom: 1, Clipboard: 2, Jack: 3 } as const

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

/** The length of one step at a walking speed, in metres: short when shuffling, long when striding out. */
export const strideFor = (speed: number) => Math.max(0.3, Math.min(0.74, 0.34 + 0.225 * speed))

const SHIRTS = ['#c9553d', '#31506b', '#e9e4da', '#3f7d4d', '#d6a24f', '#6a5a7a', '#2c3036', '#7a8f9c']
const WALK_SPEED = 1.6
const ENTER_TIME = 0.42
/** Speed up a flight of steps or across a stage, and shuffling sideways along a row of seats. */
const SIDLE_SPEED = 1.25
const ROW_SPEED = 0.8
/** The length of one sideways step along a row. */
const ROW_STEP = 0.27
/** How close two people on their feet may come, centre to centre. */
export const GAP = 0.42
/** How close someone may come to a person who is part-way into or out of a chair, and cannot step aside. */
export const GAP_FIXED = 0.32
/** How near the middle of a body may come to a wall or a piece of furniture. */
const WALL_GAP = 0.22
/** Half the clear width of a doorway that a body's middle may use. */
const DOOR_HALF = 0.2
const EDGE = 0.5 - WALL_GAP
const SCRATCH = new Int16Array(PATH_MAX)

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
  /** The way into or out of a spot from the floor, as x, y, z triples, with how far along it they are. */
  way: number[] = []
  wayLen = 0
  wayAt = 0
  /** True while they walk a longer way in or out (along a row, up the stage steps) rather than just sitting down. */
  striding = false
  pose: number = Pose.Stand
  hip = 0.86
  /** Phase of the walking or working motion, and how fast they are moving. */
  cycle = 0
  speed = 0
  /** Length of the step they are taking, in metres. */
  stride = 0.6
  /** The way a row of seats faces, while they are on their way along it or out of it: they shuffle sideways, facing the front. */
  crab = NaN
  /** 1 while stepping sideways to their right, -1 to their left, 0 walking forwards. */
  sidle = 0
  /** Seconds left of whatever they are doing, where that is timed. */
  wait = 0
  thinkIn = 0
  seat: Spot | null = null
  station: Spot | null = null
  /** What a factory hand is there to do (see factorycrowd.ts). */
  job = 0
  /** The reception desk they look after instead of sitting at their own, if they are the one on the front desk. */
  post: Spot | null = null
  /** Seconds left of a handshake across the reception desk, and who it is with. */
  shake = 0
  partner: Body | null = null
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
  /** An applicant who got the job: a handshake, then home until their first morning. */
  hired = false
  /** The first day on site (by the site's own clock) for someone newly taken on. */
  firstDay = -1e9
  sched = new Float32Array(12)
  schedDay = -1e9
  roams = 0
  /** Shoppers: 0 browsing, 1 queueing, 3 leaving; and stops left to make. Guests and crew use it for their own steps. */
  stage = 0
  browse = 0
  tool: number = Tool.None
  /** 0-1: how hard they are clapping. */
  clap = 0
  /** On their feet with their arms up. */
  cheer = false
  /** How far to the right of the middle of a corridor they walk. */
  lane = 0.17
  /** Below 1 while someone is close in front of them, so people file along rather than walk through each other. */
  slow = 1
  /** Seconds they have been held up by something they cannot get round, and seconds spent waiting behind someone. */
  still = 0
  patience = 0
  /** Where they stood when they last took a step, so that being pushed straight back by someone standing in the way is not mistaken for headway. */
  px = NaN
  pz = NaN
  /** True when the last step ended with someone who cannot step aside pushing them back. */
  shoved = false
  /** Which side they try to pass on: flips when the first choice turns out to be a wall. */
  pass = 1
  /** Seconds left of pushing straight through, when nothing else has worked. */
  ghost = 0
  rerouted = false
  /** The doorway they are going through, and the one they are waiting their turn for. */
  gate = -1
  waitGate = -1
  waited = 0
  /** The doorway coming up on their route, so a queue for it forms behind whoever is waiting. */
  nextGate = -1
  /** The busy doorway they last looked for a way round, so they only think about it once. */
  swerved = -1
  /** The tile someone standing about has to themselves. */
  claim = -1
  /** Smoothed joint angles, owned by the renderer; and what it last drew in their hands. */
  cur = new Float32Array(16)
  shown = false
  prop = -1

  get onSite() {
    return this.mode !== Mode.Off
  }
  get slump() {
    return this.kind === Kind.Staff && this.morale < 35
  }
  get walking() {
    return this.mode === Mode.Walk || this.mode === Mode.In || this.mode === Mode.Out
  }
}

export interface StaffEntry {
  e: Employee
  /** Id of the desk they sit at, if they have one. */
  seat?: string
}

/** What someone is up to, in a few words, for the label under the pointer. */
export function describe(b: Body): string {
  if (b.kind === Kind.Hand) {
    const going = b.walking || b.mode === Mode.Enter || b.mode === Mode.Exit
    if (b.leaving) return 'End of the shift: heading home'
    if (b.tool === Tool.Jack) return b.stage >= 2 ? 'Taking cartons to the shipping dock' : b.stage === 1 ? 'Loading up' : 'Fetching the next load'
    if (b.tool === Tool.Clipboard) return going ? 'Walking the line' : 'Checking on a station'
    if (b.spot && b.spot.use & USE.lunch) return 'On a break'
    return going ? 'On the way to their station' : b.pose === Pose.Type ? 'Watching the line from the control desk' : 'Working the line'
  }
  if (b.kind === Kind.Front) return b.shake > 0 ? 'Welcoming a new colleague' : b.walking ? 'On the way to the front desk' : b.pose === Pose.Meet ? 'Seeing to a visitor' : 'On reception'
  if (b.kind === Kind.Applicant) return b.hired ? 'Hired: starts in the morning' : 'Here about a job'
  if (b.kind === Kind.Shopper) return b.stage === 1 ? 'Queueing to pay' : b.bag ? 'Leaving with a new device' : 'Browsing'
  if (b.kind === Kind.Guest) return b.walking || b.striding ? (b.leaving ? 'On the way out' : 'Finding a seat') : b.cheer ? 'On their feet' : b.clap > 0.2 ? 'Applauding' : b.pose === Pose.Hold ? 'Trying the device' : 'In the audience'
  if (b.kind === Kind.Host) return b.walking || b.striding ? 'Heading for the stage' : 'Presenting'
  if (b.kind === Kind.Crew) return b.tool === Tool.Broom ? 'Sweeping up' : b.pose === Pose.Film ? 'On camera' : b.walking ? 'Crew, on the move' : 'Checking the rig'
  if (b.quit) return 'Packing up to leave'
  const going = b.mode === Mode.Walk || b.mode === Mode.In || b.mode === Mode.Exit
  switch (b.act) {
    case Act.Home:
      return 'Heading home'
    case Act.Desk:
      if (b.post && !b.carry) return going ? 'On the way to the front desk' : b.shake > 0 ? 'Welcoming a new colleague' : b.pose === Pose.Meet ? 'Seeing to a visitor' : 'On reception'
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

interface Gate {
  /** Middle of the opening. */
  x: number
  z: number
  holder: Body | null
}

export class Crowd {
  bodies: Body[] = []
  /** Bumped when the set of bodies changes, so colours are written again. */
  version = 0
  site!: Site
  nav!: Nav
  spots: Spot[] = []
  /** The site clock at the last step, in hours. */
  now = 0
  /** How often someone had to push straight through because nothing else worked. Stays at nought when all is well. */
  ghosts = 0
  protected byKey = new Map<string, Spot>()
  protected wanderTiles: number[] = []
  private tables: Spot[][] = []
  protected keepOff = (tile: number) => this.keepClear[tile] === 1
  private lobby = new Set<number>()
  /** The chairs behind the reception desks. */
  protected fronts: Spot[] = []
  private hours: OfficeLife['hours'] = 'standard'
  protected settled = false
  private counter = 0
  /** Stores: how many shoppers to keep on the floor and in the queue. */
  private shopTarget = 0
  private queueTarget = 0
  private spawnIn = 0
  private shopSeq = 0
  /** Everyone on their feet on open floor: the people who have to keep out of each other's way. */
  private foot: Body[] = []
  private gates: Gate[] = []
  /** For each tile, one more than the index of the doorway on its north edge, its west edge, or filling the tile itself. */
  private gateN = new Int16Array(0)
  private gateW = new Int16Array(0)
  private gateT = new Int16Array(0)
  private claims = new Map<number, Body>()
  /** Tiles nobody should stand about on: in front of furniture people use, and in and beside doorways. */
  private keepClear = new Uint8Array(0)
  private cx = 0
  private cz = 0
  /** Seconds the crowd has been running, and when the next person may set off for home. */
  private clock = 0
  private nextOut = 0
  /** Seconds between people setting off for home: shorter the more ways out of the building there are. */
  private outEvery = 1.25
  /** How many people are in or waiting at each doorway. */
  private gateLoad = new Int16Array(0)

  // ---------------------------------------------------------------- the site

  setSite(site: Site, nav: Nav, spots: Spot[]) {
    const first = !this.nav
    this.site = site
    this.nav = nav
    this.spots = spots
    this.byKey = new Map(spots.map((s) => [s.key, s]))
    this.lobby = new Set(site.rooms.filter((r) => r.type === 'lobby' || r.type === 'foyer').map((r) => r.n))
    const n = nav.w * nav.h
    const { w } = nav

    // ---- doorways: a door between two tiles, or a tile that is the way through a curved wall
    this.gates = []
    this.gateN = new Int16Array(n)
    this.gateW = new Int16Array(n)
    this.gateT = new Int16Array(n)
    this.keepClear = new Uint8Array(n)
    const clear = (x: number, y: number) => {
      if (x >= 0 && y >= 0 && x < nav.w && y < nav.h) this.keepClear[y * w + x] = 1
    }
    for (const d of nav.doors) {
      if (d.x < 0 || d.y < 0 || d.x >= nav.w || d.y >= nav.h) continue
      this.gates.push({ x: d.cx, z: d.cz, holder: null })
      if (d.side === 'n') this.gateN[d.y * w + d.x] = this.gates.length
      else this.gateW[d.y * w + d.x] = this.gates.length
      clear(d.x, d.y)
      if (d.side === 'n') clear(d.x, d.y - 1)
      else clear(d.x - 1, d.y)
    }
    for (let i = 0; i < n; i++) {
      if (!nav.narrow[i]) continue
      this.gates.push({ x: nav.cx(i), z: nav.cz(i), holder: null })
      this.gateT[i] = this.gates.length
      const x = i % w
      const y = (i / w) | 0
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) clear(x + dx, y + dy)
    }
    this.gateLoad = new Int16Array(this.gates.length)
    if (nav.entry >= 0) this.keepClear[nav.entry] = 1
    // routes keep off the floor where people stand at counters, tables and in queues, when there is another way
    for (const s of spots) {
      if (s.access >= 0) this.keepClear[s.access] = 1
      if (!s.open) continue
      const t = nav.tileAt(s.x, s.z)
      if (t >= 0) {
        this.keepClear[t] = 1
        nav.penalty[t] = Math.max(nav.penalty[t], 1.5)
      }
    }

    const social = new Set(site.rooms.filter((r) => ['lobby', 'lounge', 'atrium', 'foyer'].includes(r.type)).map((r) => r.n))
    this.wanderTiles = []
    for (let i = 0; i < nav.reach.length; i++) {
      if (!nav.reach[i] || this.keepClear[i]) continue
      const room = site.grid[i]
      if (social.has(room)) this.wanderTiles.push(i, i)
      else if (!room && this.nearBuilding(i)) this.wanderTiles.push(i)
    }
    if (!this.wanderTiles.length) for (let i = 0; i < nav.reach.length; i++) if (nav.reach[i] && !this.keepClear[i]) this.wanderTiles.push(i)
    if (!this.wanderTiles.length) for (let i = 0; i < nav.reach.length; i++) if (nav.reach[i]) this.wanderTiles.push(i)
    const tables = new Map<string, Spot[]>()
    for (const s of spots) {
      if (!(s.use & USE.meet)) continue
      let list = tables.get(s.item.id)
      if (!list) tables.set(s.item.id, (list = []))
      list.push(s)
    }
    this.tables = [...tables.values()]
    this.fronts = spots.filter((s) => s.use & USE.front && s.access >= 0).slice(0, 2)
    this.claims.clear()
    for (const b of this.bodies) {
      b.gate = b.waitGate = b.nextGate = -1
      const c = b.claim
      b.claim = -1
      if (c >= 0 && c < n && nav.walk[c] && !this.claims.has(c)) this.claimTile(b, c)
    }
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
      b.post = remap(b.post)
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
          else if (b.mode === Mode.Enter && b.goalSpot && b.way.length >= 6) {
            // the chair they are sitting down on may have been turned: finish where it now is
            const e = b.way.length - 3
            b.way[e] = b.goalSpot.x
            b.way[e + 1] = b.goalSpot.y
            b.way[e + 2] = b.goalSpot.z
          }
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

  /** Puts someone on their feet on the nearest free tile they can walk from, with nothing to do yet. */
  protected stand(b: Body) {
    const nav = this.nav
    this.freeGate(b)
    const here = nav.tileAt(b.x, b.z)
    let t = nav.nearest(here)
    // not on top of someone else who is standing about
    if (t >= 0 && this.claims.has(t) && this.claims.get(t) !== b) t = this.freeNear(t, b)
    if (t >= 0 && here !== t) {
      b.x = nav.cx(t)
      b.z = nav.cz(t)
    }
    if (b.goalSpot && b.goalSpot.taken === b) b.goalSpot.taken = null
    b.goalSpot = null
    b.y = 0
    b.mode = Mode.Do
    b.pose = Pose.Stand
    b.hip = 0.86
    b.act = Act.None
    b.thinkIn = 0
    b.striding = false
    if (t >= 0) this.claimTile(b, t)
  }

  // ---------------------------------------------------------------- standing room

  protected claimTile(b: Body, tile: number) {
    if (b.claim === tile) return
    this.unclaim(b)
    if (tile < 0 || this.claims.has(tile)) return
    this.claims.set(tile, b)
    b.claim = tile
    this.nav.penalty[tile] += 2
  }

  protected unclaim(b: Body) {
    if (b.claim < 0) return
    if (this.claims.get(b.claim) === b) {
      this.claims.delete(b.claim)
      this.nav.penalty[b.claim] = Math.max(0, this.nav.penalty[b.claim] - 2)
    }
    b.claim = -1
  }

  /** The nearest tile to `tile`, on the same stretch of floor, that nobody else is standing about on. */
  private freeNear(tile: number, b: Body): number {
    const nav = this.nav
    const { w, h } = nav
    const tx = tile % w
    const ty = (tile / w) | 0
    for (let r = 1; r < 8; r++) {
      let best = -1
      let bestD = Infinity
      for (let y = ty - r; y <= ty + r; y++) {
        for (let x = tx - r; x <= tx + r; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h || Math.max(Math.abs(x - tx), Math.abs(y - ty)) !== r) continue
          const j = y * w + x
          if (!nav.walk[j] || nav.zone[j] !== nav.zone[tile] || (this.claims.has(j) && this.claims.get(j) !== b)) continue
          const d = (x - tx) ** 2 + (y - ty) ** 2 + (this.keepClear[j] ? 3 : 0)
          if (d < bestD) {
            bestD = d
            best = j
          }
        }
      }
      if (best >= 0) return best
    }
    return tile
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
      if (!b) {
        const applicant = this.bodies.find((x) => x.kind === Kind.Applicant && x.id === e.id && !x.quit)
        if (applicant) {
          // hired from the lobby: a handshake and off home, to start in the morning
          applicant.hired = true
          applicant.quit = true
          applicant.thinkIn = 0
        }
        b = new Body()
        b.id = e.id
        b.kind = Kind.Staff
        b.look = e.look
        b.seed = e.look + 17
        b.lane = 0.15 + rnd(b.seed + 8) * 0.07
        if (fresh && (applicant || day - e.hiredDay <= 3)) {
          // someone new turns up on their first morning with a box of their things
          b.carry = true
          b.firstDay = hourOf(this.now) < 7 ? dayOf(this.now) : dayOf(this.now) + 1
        }
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
      this.manFronts(life.stationed.get('support') ?? [])
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

  /**
   * Who looks after each reception desk. Where the support team has someone to spare, the newest hand among those
   * drawn takes the first desk in place of their own; any other desk gets a receptionist who is only ever seen here.
   */
  protected manFronts(support: string[]) {
    const live = support.map((id) => this.bodies.find((x) => x.kind === Kind.Staff && x.id === id && !x.quit)).filter((b): b is Body => !!b && !!b.seat)
    // the best of them keep the support desks; with only one, nobody can be spared
    const spare = live.length >= 2 && this.fronts.length ? live[live.length - 1] : null
    for (const b of this.bodies) {
      if (b.kind !== Kind.Staff) continue
      const post = b === spare && this.fronts[0].access >= 0 && this.nav.zone[this.fronts[0].access] === this.nav.zone[b.seat!.access] ? this.fronts[0] : null
      if (b.post === post) continue
      b.post = post
      if (b.act === Act.Desk) b.act = Act.None
    }
    this.fronts.forEach((spot, k) => {
      const id = `front:${spot.key}`
      const have = this.bodies.find((x) => x.kind === Kind.Front && x.id === id)
      const staffed = this.bodies.some((x) => x.kind === Kind.Staff && x.post === spot)
      if (staffed) {
        if (have && !have.quit) {
          have.quit = true
          have.thinkIn = 0
        }
        return
      }
      if (have && !have.quit) {
        have.post = spot
        return
      }
      if (have) return
      const b = new Body()
      b.id = id
      b.kind = Kind.Front
      b.name = 'Receptionist'
      b.look = 2311 + k * 4177
      b.seed = b.look + 29
      b.lane = 0.15 + rnd(b.seed + 8) * 0.07
      b.shirt = '#3d4a5c'
      b.post = spot
      b.thinkIn = this.settled ? 0.5 : 0
      this.bodies.push(b)
      this.version++
    })
    for (const b of this.bodies) {
      if (b.kind !== Kind.Front || b.quit || (b.post && this.fronts.includes(b.post))) continue
      b.quit = true
      b.thinkIn = 0
    }
  }

  /** Whether the front desk is manned at this hour. */
  protected frontHours(hour: number): boolean {
    return hour >= 8.3 && hour < 17.7
  }

  /** The receptionist who is only a figure at the desk: in for the day, out at the end of it. */
  private thinkFront(b: Body, hour: number) {
    const on = !b.quit && !!b.post && this.frontHours(hour)
    if (!on) {
      if (b.mode === Mode.Off) {
        if (b.quit) b.dead = true
      } else if (b.mode === Mode.Do && !b.leaving && b.shake <= 0) this.leave(b)
      return
    }
    const spot = b.post!
    if (b.mode === Mode.Off) {
      if (spot.taken && spot.taken !== b) return
      b.act = Act.Desk
      if (this.nav.entry < 0 || !this.nav.reach[spot.access]) return this.place(b, spot)
      this.arriveOutside(b)
      this.aim(b, spot)
    } else if (b.mode === Mode.Do && b.spot !== spot && (!spot.taken || spot.taken === b)) {
      this.aim(b, spot)
      this.depart(b)
    }
  }

  /** Whoever is sitting behind a reception desk right now, ready to see to someone. */
  private receptionist(desk: Spot): Body | null {
    const r = desk.taken as Body | null
    return r && r.mode === Mode.Do && r.spot === desk && !r.quit ? r : null
  }

  /** A place to stand at a manned reception desk: the one they are at already if they are at one, else a free one they can walk to. */
  private mannedDesk(b: Body): { visit: Spot; who: Body } | null {
    const zone = this.zoneOf(b)
    let found: { visit: Spot; who: Body } | null = null
    for (const desk of this.fronts) {
      const who = this.receptionist(desk)
      if (!who || who.shake > 0) continue
      for (const s of this.spots) {
        if (s.item !== desk.item || !(s.use & USE.visit) || s.access < 0 || this.nav.zone[s.access] !== zone) continue
        if (s === b.spot) return { visit: s, who }
        if (!s.taken && !found) found = { visit: s, who }
      }
    }
    return found
  }

  /** The front desks: a look up for whoever walks up to the counter, and on their feet for a handshake. */
  private tendFronts(dt: number) {
    for (const desk of this.fronts) {
      const r = this.receptionist(desk)
      if (!r) continue
      let visitor: Body | null = r.shake > 0 ? r.partner : null
      if (r.shake > 0) {
        // they let go when the other does
        const p = r.partner
        r.shake = p && p.pose === Pose.Shake && p.mode === Mode.Do && !p.dead ? Math.max(0.05, r.shake - dt) : 0
        r.pose = Pose.Shake
        r.hip = 0.86
        if (r.shake <= 0) r.partner = null
      } else {
        for (const s of this.spots) {
          if (s.item !== desk.item || !(s.use & USE.visit)) continue
          const v = s.taken as Body | null
          if (v && v.mode === Mode.Do && v.spot === s) visitor = v
        }
        r.pose = visitor ? Pose.Meet : desk.pose
        r.hip = desk.hip
      }
      // turned toward whoever they are dealing with, and square to the counter otherwise
      const want = visitor ? Math.atan2(-(visitor.x - r.x), -(visitor.z - r.z)) : desk.face
      let diff = want - r.yaw
      diff -= Math.round(diff / (Math.PI * 2)) * Math.PI * 2
      r.yaw += diff * Math.min(1, dt * 5)
    }
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
      b.lane = 0.15 + rnd(b.seed + 8) * 0.07
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
    if (b.training || day < b.firstDay) return Act.Away
    this.plan(b, day)
    const s = b.sched
    if (hour < s[0] || hour >= s[1]) return Act.Home
    if (!b.seat) return Act.Wander
    // the first thing anyone does on their first morning is find their desk
    if (b.carry) return Act.Desk
    if (hour >= s[10] && hour < s[11]) return Act.Meet
    if (hour >= s[2] && hour < s[3]) return Act.Lunch
    if (hour >= s[8] && hour < s[9]) return Act.Gym
    if ((hour >= s[4] && hour < s[5]) || (hour >= s[6] && hour < s[7])) return Act.Coffee
    if (b.station && ((hour >= 9.9 && hour < 11.6) || (hour >= 14 && hour < 16.2))) return Act.Station
    return Act.Desk
  }

  /** The stretch of joined-up floor someone is on (or will come in by, if they are away). */
  protected zoneOf(b: Body): number {
    const nav = this.nav
    if (b.mode === Mode.Off) return nav.entry >= 0 ? nav.zone[nav.entry] : 0
    if (b.spot && b.spot.access >= 0) return nav.zone[b.spot.access]
    const t = nav.tileAt(b.x, b.z)
    return t >= 0 ? nav.zone[t] : nav.entry >= 0 ? nav.zone[nav.entry] : 0
  }

  /** The best free spot of a kind for someone, or null. Nearer ones win, with some variety. Only spots they can walk to count. */
  protected pick(b: Body, use: number, lobbyOnly = false): Spot | null {
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
    // whoever is on the front desk works there rather than at their own (once they have found their own, on a first day)
    return b.carry ? b.seat : (b.post ?? b.seat)
  }

  /** Bodies the office and the store do not know about: a venue's guests, crew and presenter. */
  protected thinkOther(_b: Body, _hour: number, _day: number) {}

  private think(b: Body, hour: number, day: number) {
    if (b.kind === Kind.Shopper) return this.thinkShopper(b, hour)
    if (b.kind === Kind.Front) return this.thinkFront(b, hour)
    if (b.kind > Kind.Shopper) return this.thinkOther(b, hour, day)
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
        } else if (b.hired && b.mode === Mode.Do) {
          // got the job: over to the front desk for a handshake with whoever is on it, then home
          const desk = this.mannedDesk(b)
          if (desk && desk.visit !== b.spot && b.stage === 0) {
            b.stage = 1
            b.act = Act.Visit
            this.aim(b, desk.visit)
            return this.depart(b)
          }
          if (desk && desk.visit === b.spot) {
            const r = desk.who
            r.shake = b.wait = 2.4
            r.partner = b
            b.pose = Pose.Shake
            b.yaw = Math.atan2(-(r.x - b.x), -(r.z - b.z))
          } else {
            // nobody on the desk just now: a quiet fist in the air instead
            b.cheer = true
            b.wait = 2.2
          }
        } else b.wait = 0
      } else if (b.wait <= 0 && !b.leaving) {
        b.cheer = false
        this.leave(b)
      }
      return
    }
    const away = want === Act.Home || want === Act.Away
    if (away) {
      if (b.mode === Mode.Off) {
        b.act = want
        return
      }
      if (!b.leaving) {
        // home time comes for everyone at once when the clock jumps or the hours change: they still go a few at a time,
        // so the way out never has the whole company standing at it
        if (b.kind === Kind.Staff && want === Act.Home && this.clock < this.nextOut) return
        if (b.kind === Kind.Staff && want === Act.Home) this.nextOut = this.clock + this.outEvery * (0.75 + rnd(b.seed + this.counter++) * 0.5)
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
      this.arriveOutside(b)
      if (spot) this.aim(b, spot)
      else this.aimTile(b, this.wanderTile(b))
      return
    }
    if (!spot) return this.roam(b)
    if (spot === b.spot) return
    this.aim(b, spot)
    this.depart(b)
  }

  /** Stands someone on the street beyond the way in, about to walk onto the site. */
  protected arriveOutside(b: Body) {
    const nav = this.nav
    // not on top of someone else who is just arriving or leaving
    for (let k = 0; k < 8; k++) {
      b.x = nav.outside[0] + (rnd(b.seed + 3 + k * 1.7) - 0.5) * (2.4 + k * 0.5)
      b.z = nav.outside[1] + (rnd(b.seed + 4 + k * 2.3) - 0.5) * (1.2 + k * 0.4)
      let free = true
      for (const o of this.bodies) if (o !== b && o.mode !== Mode.Off && (o.x - b.x) ** 2 + (o.z - b.z) ** 2 < 0.36) free = false
      if (free) break
    }
    b.y = 0
    b.yaw = Math.atan2(-(nav.cx(nav.entry) - b.x), -(nav.cz(nav.entry) - b.z))
    b.mode = Mode.In
    b.pose = Pose.Stand
    b.hip = 0.86
    b.leaving = false
    b.still = 0
    b.ghost = 0
  }

  protected wanderTile(b: Body): number {
    const list = this.wanderTiles
    if (!list.length) return this.nav.entry
    // somewhere nobody else is already standing about
    for (let k = 0; k < 6; k++) {
      const t = list[Math.floor(rnd(b.seed + ++b.roams * 5.3) * list.length)]
      const owner = this.claims.get(t)
      if (!owner || owner === b) return t
    }
    return list[Math.floor(rnd(b.seed + ++b.roams * 5.3) * list.length)]
  }

  /** Someone with nowhere to be drifts between the lobby, the lounge and the grounds. */
  private roam(b: Body) {
    b.wait = 5 + rnd(b.seed + b.roams) * 9
    const sit = rnd(b.seed + b.roams * 2.7) < 0.45 ? this.pick(b, USE.look | USE.wait | USE.coffee) : null
    if (sit && sit !== b.spot) this.aim(b, sit)
    else this.aimTile(b, this.wanderTile(b))
    this.depart(b)
  }

  protected release(b: Body, s: Spot | null) {
    if (s && s.taken === b) s.taken = null
  }

  protected aim(b: Body, spot: Spot) {
    if (b.goalSpot !== spot) this.release(b, b.goalSpot)
    this.unclaim(b)
    b.goalSpot = spot
    spot.taken = b
    b.goalTile = spot.access
    b.leaving = false
  }

  protected aimTile(b: Body, tile: number) {
    this.release(b, b.goalSpot)
    b.goalSpot = null
    b.goalTile = tile
    b.leaving = false
    // the place is theirs from the moment they set off for it
    this.claimTile(b, tile)
  }

  protected leave(b: Body) {
    this.release(b, b.goalSpot)
    this.unclaim(b)
    b.goalSpot = null
    b.goalTile = this.nav.entry
    b.leaving = true
    if (this.nav.entry < 0 || this.zoneOf(b) !== this.nav.zone[this.nav.entry]) return this.vanish(b)
    this.depart(b)
  }

  protected vanish(b: Body) {
    this.release(b, b.spot)
    this.release(b, b.goalSpot)
    this.unclaim(b)
    this.freeGate(b)
    b.spot = b.goalSpot = null
    b.mode = Mode.Off
    b.leaving = false
    b.striding = false
    // someone who has not started yet keeps their box for the morning
    if (b.firstDay <= dayOf(this.now)) b.carry = false
    if (b.quit || b.kind === Kind.Shopper || b.kind === Kind.Guest) b.dead = true
  }

  /** Sets off toward the goal: out of the chair first, if they are in one. */
  protected depart(b: Body) {
    if (b.mode === Mode.In) return
    b.cheer = false
    b.clap = 0
    if (b.spot) {
      const from = b.spot
      if (from !== b.goalSpot) this.release(b, from)
      b.spot = null
      if (from.access >= 0) {
        // back out the way they came in, to the tile they stepped in from
        const way = b.way
        way.length = 0
        way.push(b.x, b.y, b.z)
        if (from.via) for (let k = from.via.length - 3; k >= 0; k -= 3) way.push(from.via[k], from.via[k + 1], from.via[k + 2])
        way.push(this.nav.cx(from.access), 0, this.nav.cz(from.access))
        b.crab = from.row ? from.face : NaN
        this.startWay(b)
        b.mode = Mode.Exit
        b.pathLen = 0
        b.pose = Pose.Stand
        b.hip = 0.86
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

  protected startWay(b: Body) {
    const way = b.way
    let len = 0
    for (let k = 3; k < way.length; k += 3) len += Math.hypot(way[k] - way[k - 3], way[k + 1] - way[k - 2], way[k + 2] - way[k - 1])
    b.wayLen = len
    b.wayAt = 0
    b.striding = len > 1.3
    b.speed = 0
  }

  /** Works out the way to the goal tile from where they stand. */
  protected route(b: Body) {
    const nav = this.nav
    this.freeGate(b)
    b.swerved = -1
    let from = nav.tileAt(b.x, b.z)
    if (from < 0 || !nav.walk[from]) from = nav.nearest(from < 0 ? nav.entry : from)
    if (b.goalTile < 0 || from < 0) return this.arrive(b, true)
    if (from === b.goalTile) return this.arrive(b, false)
    b.pathLen = nav.find(from, b.goalTile, b.path)
    b.pathAt = 0
    if (!b.pathLen) return this.arrive(b, true)
    b.mode = Mode.Walk
    b.still = 0
    b.px = NaN
  }

  /** Looks for a way that does not use a busy doorway. True if one was found that is not much longer; otherwise the route is left as it was. */
  private routeRound(b: Body, g: number): boolean {
    const nav = this.nav
    const from = nav.tileAt(b.x, b.z)
    if (from < 0 || !nav.walk[from] || b.goalTile < 0) return false
    // the two tiles the door stands between, or the one it fills
    const tiles: number[] = []
    for (let k = b.pathAt; k < b.pathLen && k < b.pathAt + 4; k++) {
      const prev = k > 0 ? b.path[k - 1] : from
      if (this.gateBetween(prev, b.path[k]) === g) tiles.push(prev, b.path[k])
    }
    if (!tiles.length) return false
    for (const t of tiles) nav.penalty[t] += 5
    const n = nav.find(from, b.goalTile, SCRATCH)
    for (const t of tiles) nav.penalty[t] -= 5
    // only worth it for another door close by: a long way round is slower than waiting a turn
    if (!n || n > b.pathLen - b.pathAt + 4) return false
    for (let k = 0; k < n; k++) if (tiles.includes(SCRATCH[k]) && this.gateBetween(k ? SCRATCH[k - 1] : from, SCRATCH[k]) === g) return false
    b.path.set(SCRATCH.subarray(0, n))
    b.pathLen = n
    b.pathAt = 0
    return true
  }

  /** At the goal tile (or unable to walk there, and so simply put there). */
  private arrive(b: Body, jump: boolean) {
    this.freeGate(b)
    b.still = 0
    b.ghost = 0
    b.rerouted = false
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
      this.onStop(b)
      return
    }
    if (jump) return this.place(b, spot)
    const way = b.way
    way.length = 0
    way.push(b.x, b.y, b.z)
    if (spot.via) for (let k = 0; k < spot.via.length; k++) way.push(spot.via[k])
    way.push(spot.x, spot.y, spot.z)
    b.crab = spot.row ? spot.face : NaN
    this.startWay(b)
    b.mode = Mode.Enter
    if (!b.striding) {
      b.pose = spot.pose
      b.hip = spot.hip
    }
  }

  /** Puts someone straight into a spot, with no walk. */
  protected place(b: Body, spot: Spot) {
    if (b.spot !== spot) this.release(b, b.spot)
    this.unclaim(b)
    this.freeGate(b)
    b.goalSpot = spot
    spot.taken = b
    b.x = spot.x
    b.z = spot.z
    b.y = spot.y
    b.yaw = spot.face
    b.pose = spot.pose
    b.hip = spot.hip
    b.striding = false
    this.settle(b)
  }

  /** Arrived in the spot. */
  private settle(b: Body) {
    b.spot = b.goalSpot
    b.goalSpot = null
    b.mode = Mode.Do
    b.speed = 0
    b.leaving = false
    b.striding = false
    b.sidle = 0
    if (b.spot) {
      b.pose = b.spot.pose
      b.hip = b.spot.hip
    }
    if (b.spot === b.seat) b.carry = false
    if (b.kind === Kind.Applicant && b.hired) b.thinkIn = 0
    // someone standing on open floor is in the way of anyone walking through: routes go round where they can
    if (b.spot && b.spot.open) this.claimTile(b, this.nav.tileAt(b.spot.x, b.spot.z))
    if (b.kind === Kind.Shopper) b.wait = b.stage === 1 ? 2.2 + rnd(b.seed + b.browse) * 2 : 3 + rnd(b.seed + b.browse * 3) * 5
    this.onStop(b)
  }

  /** Someone has just come to rest, in a spot or on a tile of their own. */
  protected onStop(_b: Body) {}

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
    b.lane = 0.15 + rnd(b.seed + 8) * 0.07
    b.shirt = SHIRTS[n % SHIRTS.length]
    b.browse = 1 + Math.floor(rnd(n * 3.3) * 3)
    b.act = Act.Shop
    const s = this.pick(b, USE.browse)
    if (!s) return
    this.bodies.push(b)
    this.version++
    if (placed || this.nav.entry < 0) return this.place(b, s)
    this.arriveOutside(b)
    this.aim(b, s)
  }

  // ---------------------------------------------------------------- doorways

  /** The doorway between two neighbouring tiles, or -1. */
  private gateBetween(a: number, b: number): number {
    const w = this.nav.w
    let g = 0
    if (b === a - w) g = this.gateN[a]
    else if (b === a + w) g = this.gateN[b]
    else if (b === a - 1) g = this.gateW[a]
    else if (b === a + 1) g = this.gateW[b]
    return (g || this.gateT[b] || this.gateT[a]) - 1
  }

  /** True if someone else waiting for a free doorway is nearer to it: the front of the queue goes first. */
  private notMyTurn(g: number, b: Body): boolean {
    const gate = this.gates[g]
    const mine = (b.x - gate.x) ** 2 + (b.z - gate.z) ** 2 - 0.01
    for (const o of this.foot) if (o !== b && o.waitGate === g && (o.x - gate.x) ** 2 + (o.z - gate.z) ** 2 < mine) return true
    return false
  }

  private freeGate(b: Body) {
    if (b.gate >= 0 && this.gates[b.gate]?.holder === b) this.gates[b.gate].holder = null
    b.gate = b.waitGate = b.nextGate = -1
    b.waited = 0
  }

  /** Counts who is in or waiting at each doorway. */
  private countGates() {
    const load = this.gateLoad
    load.fill(0)
    for (const b of this.foot) {
      if (b.gate >= 0 && b.gate < load.length) load[b.gate]++
      if (b.waitGate >= 0 && b.waitGate < load.length) load[b.waitGate]++
    }
  }

  // ---------------------------------------------------------------- moving

  /**
   * Keeps a step on the floor: no walking through walls or furniture, no
   * brushing along them, and through a door only in the middle of it. The
   * place they may go is left in cx, cz.
   */
  private confine(b: Body, nx: number, nz: number) {
    const nav = this.nav
    const t0 = nav.tileAt(b.x, b.z)
    this.cx = nx
    this.cz = nz
    // off the plot, or stepping out of a chair: nothing to keep to yet
    if (t0 < 0 || !nav.walk[t0]) return
    let t1 = nav.tileAt(nx, nz)
    if (t1 !== t0) {
      if (!this.mayCross(t0, t1, nx, nz)) {
        // slide along whatever is in the way
        const tx = nav.tileAt(nx, b.z)
        const tz = nav.tileAt(b.x, nz)
        if (tx === t0 || this.mayCross(t0, tx, nx, b.z)) nz = b.z
        else if (tz === t0 || this.mayCross(t0, tz, b.x, nz)) nx = b.x
        else {
          nx = b.x
          nz = b.z
        }
        t1 = nav.tileAt(nx, nz)
      }
    }
    if (t1 < 0) {
      this.cx = b.x
      this.cz = b.z
      return
    }
    // and not too close to what stands at the tile's edges
    const mx = nav.cx(t1)
    const mz = nav.cz(t1)
    if (nx > mx + EDGE && !this.sideOpen(t1, 1, 0, nz - mz)) nx = mx + EDGE
    else if (nx < mx - EDGE && !this.sideOpen(t1, -1, 0, nz - mz)) nx = mx - EDGE
    if (nz > mz + EDGE && !this.sideOpen(t1, 0, 1, nx - mx)) nz = mz + EDGE
    else if (nz < mz - EDGE && !this.sideOpen(t1, 0, -1, nx - mx)) nz = mz - EDGE
    // a body in the corner of a tile must not poke through the corner of the wall beyond it
    if (Math.abs(nx - mx) > EDGE && Math.abs(nz - mz) > EDGE && !nav.step(t1, nx > mx ? 1 : -1, nz > mz ? 1 : -1)) {
      if (Math.abs(nx - mx) > Math.abs(nz - mz)) nz = mz + Math.sign(nz - mz) * EDGE
      else nx = mx + Math.sign(nx - mx) * EDGE
    }
    this.cx = nx
    this.cz = nz
  }

  /** Whether the side of a tile can be leaned across at a point `off` along it from its middle: open floor, or the clear middle of a doorway. */
  private sideOpen(t: number, dx: number, dy: number, off: number): boolean {
    if (!this.nav.step(t, dx, dy)) return false
    return !this.doorOn(t, dx, dy) || Math.abs(off) <= DOOR_HALF
  }

  /** Whether a step from one tile to another at this point is one a body could take. */
  private mayCross(t0: number, t1: number, nx: number, nz: number): boolean {
    const nav = this.nav
    if (t1 < 0) return false
    const w = nav.w
    const dx = (t1 % w) - (t0 % w)
    const dy = ((t1 / w) | 0) - ((t0 / w) | 0)
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || !nav.step(t0, dx, dy)) return false
    // round a corner only where no door frame stands at it
    if (dx !== 0 && dy !== 0) return !(this.doorOn(t0, dx, 0) || this.doorOn(t0, 0, dy) || this.doorOn(t1, -dx, 0) || this.doorOn(t1, 0, -dy))
    return this.sideOpen(t0, dx, dy, dx ? nz - nav.cz(t0) : nx - nav.cx(t0))
  }

  /** The door on one side of a tile, as one more than its index among the doorways, or 0. */
  private doorOn(t: number, dx: number, dy: number): number {
    const w = this.nav.w
    return (dy === -1 ? this.gateN[t] : dy === 1 ? this.gateN[t + w] : dx === -1 ? this.gateW[t] : this.gateW[t + 1]) || 0
  }

  /**
   * Walks toward a point, giving way to whoever is about; true once there.
   * `follow` is the doorway they are heading for, if any: people already
   * waiting for it are queued behind rather than overtaken.
   */
  private toward(b: Body, tx: number, tz: number, dt: number, near: number, bounded: boolean): boolean {
    const dx = tx - b.x
    const dz = tz - b.z
    const d = Math.hypot(dx, dz)
    if (d <= near) {
      b.speed = 0
      return true
    }
    const ux = dx / d
    const uz = dz / d
    // the right-hand side of the way they are going
    const rx = -uz
    const rz = ux
    const v = WALK_SPEED * (b.slump ? 0.68 : 1) * (0.92 + rnd(b.seed) * 0.2) * (b.carry ? 0.85 : 1)
    let slow = 1
    let side = 0
    let held = false
    if (b.ghost <= 0) {
      const foot = this.foot
      for (let i = 0; i < foot.length; i++) {
        const o = foot[i]
        if (o === b || o.ghost > 0) continue
        const ox = o.x - b.x
        const oz = o.z - b.z
        if (ox * ox + oz * oz > 2.9) continue
        const ahead = ox * ux + oz * uz
        if (ahead < -0.05) continue
        const lat = ox * rx + oz * rz
        const al = Math.abs(lat)
        if (al > 0.64) continue
        const same = o.walking && Math.cos(o.yaw - b.yaw) > 0.25
        if (same || (o.waitGate >= 0 && o.waitGate === b.nextGate && b.gate !== o.waitGate)) {
          // going the same way, or queueing for the same door: fall in behind. Of two people converging, the
          // one further along the way they share goes first, so the two never both wait for each other
          if (same) {
            const lead = ox * (ux - Math.sin(o.yaw)) + oz * (uz - Math.cos(o.yaw))
            if (lead < 0 || (lead < 0.02 && b.seed + b.look * 1e-4 < o.seed + o.look * 1e-4)) continue
          }
          if (al < 0.42 && ahead < 1) {
            const k = Math.max(0, (ahead - 0.52) / 0.48)
            if (k < slow) slow = k
            if (k < 0.3) held = true
          }
        } else {
          // coming the other way, crossing or standing there: step round, to the right unless they are well over that side
          const weight = (1.7 - ahead) / 1.7
          side += (lat < 0.14 ? 1 : -1) * weight * (al < 0.5 ? 1 : 0.4)
          if (ahead < 0.55 && al < 0.3 && slow > 0.45) slow = 0.45
        }
      }
    }
    // patience runs out in the end: whoever has stood behind someone for too long treats them as in the way
    if (held) {
      b.patience += dt
      if (b.patience > 30) held = false
    }
    b.slow += (slow - b.slow) * Math.min(1, dt * 12)
    side = Math.max(-1, Math.min(1, side * b.pass))
    const fwd = Math.min(d, v * b.slow * dt)
    const lateral = side * v * 0.75 * dt
    const nx = b.x + ux * fwd + rx * lateral
    const nz = b.z + uz * fwd + rz * lateral
    if (bounded) this.confine(b, nx, nz)
    else {
      this.cx = nx
      this.cz = nz
    }
    const mx = this.cx - b.x
    const mz = this.cz - b.z
    const moved = Math.hypot(mx, mz)
    // made no headway, and not because they are politely waiting behind someone: something is in the way. What counts
    // is where the last step really left them: a step forward that someone standing there pushed straight back is none
    const net = b.px === b.px ? (b.x - b.px) * ux + (b.z - b.pz) * uz : 1
    b.px = b.x
    b.pz = b.z
    const made = b.shoved ? Math.min(mx * ux + mz * uz, net) : mx * ux + mz * uz
    b.shoved = false
    if (made < v * dt * 0.25 && !held) b.still += dt
    else b.still = Math.max(0, b.still - dt * 3)
    // a queue that shuffles forward is a queue; one that never moves is a knot
    if (moved > 0) b.patience = Math.max(0, b.patience - moved * 24)
    b.x = this.cx
    b.z = this.cz
    b.speed = moved / Math.max(1e-6, dt)
    this.pace(b, moved, dt)
    // turn to face the way they are going, quickly but not instantly
    if (moved > 1e-5 || d > 0.2) {
      const want = moved > v * dt * 0.3 ? Math.atan2(-(mx + ux * moved), -(mz + uz * moved)) : Math.atan2(-ux, -uz)
      let diff = want - b.yaw
      diff -= Math.round(diff / (Math.PI * 2)) * Math.PI * 2
      b.yaw += diff * Math.min(1, dt * 10)
    }
    return Math.hypot(tx - b.x, tz - b.z) <= near
  }

  /** Moves the walking motion on by the ground just covered: a step is as long as the pace asks, so feet do not slide. */
  private pace(b: Body, moved: number, dt: number) {
    b.stride += ((b.sidle ? ROW_STEP : strideFor(b.speed)) - b.stride) * Math.min(1, dt * 5)
    b.cycle += (moved * Math.PI) / b.stride
  }

  /** Someone held up for a while tries the other side, then another route, and at the very last walks through. */
  private unstick(b: Body) {
    if (b.still > 0.7 && b.pass === 1) b.pass = -1
    if (b.still > 1.6 && !b.rerouted && b.mode === Mode.Walk) {
      b.rerouted = true
      const holding = b.gate
      this.route(b)
      if (b.mode === Mode.Walk && holding >= 0) b.still = 1.6
      return
    }
    if (b.still > 3.2) {
      b.ghost = 1.4
      b.still = 0
      b.pass = 1
      this.ghosts++
    }
  }

  private walk(b: Body, dt: number) {
    const nav = this.nav
    const tile = b.path[b.pathAt]
    const last = b.pathAt === b.pathLen - 1
    const cur = nav.tileAt(b.x, b.z)
    const mx = nav.cx(tile)
    const mz = nav.cz(tile)
    if (cur >= 0 && cur !== tile && nav.walk[cur]) {
      // jostled off the route, to a tile the next one cannot be stepped to from: find the way again from here
      const w = nav.w
      const dx = (tile % w) - (cur % w)
      const dy = ((tile / w) | 0) - ((cur / w) | 0)
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || !nav.step(cur, dx, dy)) {
        const still = b.still
        this.route(b)
        b.still = still
        return
      }
    }
    // ---- a doorway on this step: one at a time, the rest wait beside it
    const g = cur >= 0 && cur !== tile ? this.gateBetween(cur, tile) : cur >= 0 ? this.gateT[cur] - 1 : -1
    if (b.gate >= 0 && b.gate !== g) {
      const old = this.gates[b.gate]
      if (g >= 0 || (b.x - old.x) ** 2 + (b.z - old.z) ** 2 > 0.11) {
        if (old.holder === b) old.holder = null
        b.gate = -1
      }
    }
    // the door coming up within a couple of tiles, so a queue for it forms in good time
    b.nextGate = g
    for (let k = b.pathAt; b.nextGate < 0 && k < b.pathLen - 1 && k < b.pathAt + 2; k++) b.nextGate = this.gateBetween(b.path[k], b.path[k + 1])
    // a queue at that door, and they are not yet in it: a double door has another leaf, and a room may have another door
    if (b.nextGate >= 0 && b.gate !== b.nextGate && b.waitGate !== b.nextGate && b.swerved !== b.nextGate && this.gateLoad[b.nextGate] >= 2) {
      b.swerved = b.nextGate
      if (this.routeRound(b, b.nextGate)) return
    }
    if (g >= 0) {
      const gate = this.gates[g]
      const holder = gate.holder
      if (holder && holder !== b && (holder.gate !== g || holder.mode !== Mode.Walk)) gate.holder = null
      if (b.ghost <= 0 && b.waited <= 6 && (gate.holder ? gate.holder !== b : this.notMyTurn(g, b))) {
        // someone is in the doorway: stand to the right of it, out of their way
        b.waitGate = g
        b.waited += dt
        const cxm = nav.cx(cur)
        const czm = nav.cz(cur)
        let fx = gate.x - cxm
        let fz = gate.z - czm
        const fl = Math.hypot(fx, fz) || 1
        fx /= fl
        fz /= fl
        const there = this.toward(b, cxm - fz * 0.27 - fx * 0.12, czm + fx * 0.27 - fz * 0.12, dt, 0.06, true)
        if (there) {
          let diff = Math.atan2(-fx, -fz) - b.yaw
          diff -= Math.round(diff / (Math.PI * 2)) * Math.PI * 2
          b.yaw += diff * Math.min(1, dt * 6)
        }
        b.still = 0
        // nobody waits for ever: past six seconds the next lines take the door whoever has it
        return
      }
      gate.holder = b
      b.gate = g
      b.waitGate = -1
      b.waited = 0
      if (cur !== tile && !this.gateT[cur]) {
        // go through the middle of the opening, then on to the far side
        const along = (gate.x - b.x) * (mx - nav.cx(cur)) + (gate.z - b.z) * (mz - nav.cz(cur))
        if (along > 0.1) {
          this.toward(b, gate.x, gate.z, dt, 0.02, true)
          this.unstick(b)
          return
        }
      }
    } else b.waitGate = -1
    // ---- on toward the next tile, keeping to the right of the way
    let ox = 0
    let oz = 0
    if (!last && g < 0) {
      const prev = b.pathAt > 0 ? b.path[b.pathAt - 1] : cur
      if (prev >= 0 && prev !== tile) {
        const sx = mx - nav.cx(prev)
        const sz = mz - nav.cz(prev)
        const sl = Math.hypot(sx, sz) || 1
        ox = (-sz / sl) * b.lane
        oz = (sx / sl) * b.lane
      }
    }
    const there = this.toward(b, mx + ox, mz + oz, dt, last ? 0.07 : 0.3, true)
    // someone on the way out is through as soon as they set foot on the tile at the way out: nobody queues for its middle
    if (there || (!last && cur === tile && b.still > 0.3) || (last && b.leaving && cur === tile) || (last && b.still > 0.8 && (b.x - mx) ** 2 + (b.z - mz) ** 2 < 0.3)) {
      if (last) this.arrive(b, false)
      else {
        b.pathAt++
        b.pass = 1
      }
      return
    }
    this.unstick(b)
  }

  /** Follows the way into or out of a spot. True at the end of it. */
  private alongWay(b: Body, dt: number): boolean {
    const way = b.way
    if (!b.striding) {
      // a step and a turn: eased, over a fixed moment
      b.wayAt = Math.min(1, b.wayAt + dt / ENTER_TIME)
      const k = b.wayAt * b.wayAt * (3 - 2 * b.wayAt)
      const e = way.length - 3
      b.x = way[0] + (way[e] - way[0]) * k
      b.y = way[1] + (way[e + 1] - way[1]) * k
      b.z = way[2] + (way[e + 2] - way[2]) * k
      b.speed = 0
      return b.wayAt >= 1
    }
    const speed = b.sidle ? ROW_SPEED : SIDLE_SPEED
    const step = speed * dt
    b.wayAt = Math.min(b.wayLen, b.wayAt + step)
    let left = b.wayAt
    for (let k = 3; k < way.length; k += 3) {
      const len = Math.hypot(way[k] - way[k - 3], way[k + 1] - way[k - 2], way[k + 2] - way[k - 1])
      if (left <= len || k === way.length - 3) {
        const f = len > 1e-6 ? Math.min(1, left / len) : 1
        b.x = way[k - 3] + (way[k] - way[k - 3]) * f
        b.y = way[k - 2] + (way[k + 1] - way[k - 2]) * f
        b.z = way[k - 1] + (way[k + 2] - way[k - 1]) * f
        const hx = way[k] - way[k - 3]
        const hz = way[k + 2] - way[k - 1]
        const flat = Math.hypot(hx, hz)
        if (flat > 1e-2) {
          // along a row of seats they face the front and step sideways; the step back into the seat itself is taken facing the front too
          const rowed = b.crab === b.crab
          const along = rowed ? (hx * -Math.sin(b.crab) + hz * -Math.cos(b.crab)) / flat : 1
          const sideways = rowed && Math.abs(along) < 0.25 && Math.abs(way[k + 1] - way[k - 2]) < 0.05
          b.sidle = sideways ? (hx * Math.cos(b.crab) - hz * Math.sin(b.crab) > 0 ? 1 : -1) : 0
          let diff = (sideways || (rowed && len < 0.6) ? b.crab : Math.atan2(-hx, -hz)) - b.yaw
          diff -= Math.round(diff / (Math.PI * 2)) * Math.PI * 2
          b.yaw += diff * Math.min(1, dt * 9)
        }
        break
      }
      left -= len
    }
    b.speed = speed
    this.pace(b, step, dt)
    return b.wayAt >= b.wayLen
  }

  private move(b: Body, dt: number) {
    const nav = this.nav
    if (b.ghost > 0) b.ghost -= dt
    switch (b.mode) {
      case Mode.In:
        // onto the plot anywhere on the tile at the way in: nobody has to reach the very middle of it
        if (this.toward(b, nav.cx(nav.entry), nav.cz(nav.entry), dt, 0.25, false) || nav.tileAt(b.x, b.z) === nav.entry) this.route(b)
        break
      case Mode.Out:
        if (this.toward(b, nav.outside[0] + (rnd(b.seed + 3) - 0.5) * 2.4, nav.outside[1], dt, 0.15, false)) this.vanish(b)
        break
      case Mode.Walk:
        this.walk(b, dt)
        break
      case Mode.Enter: {
        const s = b.goalSpot
        if (!s) {
          this.stand(b)
          break
        }
        const done = this.alongWay(b, dt)
        // settle into the pose and turn to face the right way over the last of it
        if (!b.striding || b.wayLen - b.wayAt < 0.45) {
          b.pose = s.pose
          b.hip = s.hip
          let diff = s.face - b.yaw
          diff -= Math.round(diff / (Math.PI * 2)) * Math.PI * 2
          b.yaw += diff * Math.min(1, dt * 9)
        }
        if (done) {
          b.yaw = s.face
          this.settle(b)
        }
        break
      }
      case Mode.Exit:
        if (this.alongWay(b, dt)) {
          b.striding = false
          b.sidle = 0
          b.y = 0
          this.route(b)
        }
        break
      case Mode.Do:
        b.speed = 0
        b.cycle += dt
        if (b.wait > 0) b.wait -= dt
        // someone standing about who was nudged aside drifts back to their own patch
        if (!b.spot && b.claim >= 0) {
          const hx = nav.cx(b.claim) - b.x
          const hz = nav.cz(b.claim) - b.z
          const hd = Math.hypot(hx, hz)
          if (hd > 0.04) {
            const k = Math.min(hd, 0.35 * dt) / hd
            this.confine(b, b.x + hx * k, b.z + hz * k)
            b.x = this.cx
            b.z = this.cz
          }
        }
        break
    }
  }

  /** Whether a body on its feet can be pushed aside: a walker, or someone standing about with nowhere in particular to be. */
  private loose(b: Body): boolean {
    return b.mode === Mode.Walk || b.mode === Mode.In || b.mode === Mode.Out || (b.mode === Mode.Do && !b.spot)
  }

  /** Whether someone is standing in a spot on open floor: at a counter, in a queue, in front of a display. */
  private planted(b: Body): boolean {
    return b.mode === Mode.Do && !!b.spot && b.spot.open
  }

  /** Nobody ends a step standing inside anybody else. */
  private separate() {
    const foot = this.foot
    for (let i = 0; i < foot.length; i++) {
      const a = foot[i]
      if (a.ghost > 0) continue
      const al = this.loose(a)
      for (let j = i + 1; j < foot.length; j++) {
        const b = foot[j]
        if (b.ghost > 0) continue
        const bl = this.loose(b)
        if (!al && !bl) continue
        let dx = b.x - a.x
        let dz = b.z - a.z
        // someone standing at a counter or in a queue is given the same room as anyone else on their feet
        const min = (al || this.planted(a)) && (bl || this.planted(b)) ? GAP : GAP_FIXED
        const d2 = dx * dx + dz * dz
        if (d2 >= min * min) continue
        let d = Math.sqrt(d2)
        if (d < 1e-4) {
          // exactly on top of each other: part along a line that depends on who they are
          const ang = rnd(a.seed + b.seed) * 6.283
          dx = Math.cos(ang)
          dz = Math.sin(ang)
          d = 1
        }
        const push = min - d
        dx /= d
        dz /= d
        // walkers share the step; someone standing about gives way a little more than a walker does
        const wa = al ? (bl ? (a.walking === b.walking ? 0.5 : a.walking ? 0.4 : 0.6) : 1) : 0
        const wb = bl ? 1 - (al ? wa : 0) : 0
        if (!bl) a.shoved = true
        if (!al) b.shoved = true
        if (wa > 0) {
          this.confine(a, a.x - dx * push * wa, a.z - dz * push * wa)
          a.x = this.cx
          a.z = this.cz
        }
        if (wb > 0) {
          this.confine(b, b.x + dx * push * wb, b.z + dz * push * wb)
          b.x = this.cx
          b.z = this.cz
        }
      }
    }
  }

  /** Called once a step after everyone has moved, for kinds of site with more going on. */
  protected after(_step: number, _hour: number, _day: number) {}
  /** Called once, the first time the site is looked at, to put people where the hour says they would be. */
  protected populate(_hour: number, _day: number) {}

  /**
   * Advances everyone. `dt` is real seconds, `pace` how briskly people move
   * at the current game speed, `t` the site clock in hours.
   */
  step(dt: number, pace: number, t: number) {
    if (!this.nav) return
    this.now = t
    const hour = hourOf(t)
    const day = dayOf(t)
    if (!this.settled) {
      // first look at the site: everyone is already wherever the hour says they should be
      this.settled = true
      for (const b of this.bodies) this.drop(b, hour, day)
      const open = hour >= 9 && hour < 20
      for (let i = 0; open && i < Math.round(this.shopTarget * 0.8); i++) this.spawnShopper(true)
      this.populate(hour, day)
    }
    const step = dt * pace
    // everyone on their feet on open floor has to keep clear of everyone else who is
    const foot = this.foot
    foot.length = 0
    for (const b of this.bodies) {
      if (b.mode === Mode.Off) continue
      if (b.mode !== Mode.Do || !b.spot || b.spot.open) foot.push(b)
    }
    this.countGates()
    this.clock += step
    let dead = false
    for (let i = 0; i < this.bodies.length; i++) {
      const b = this.bodies[i]
      b.thinkIn -= dt
      if (b.thinkIn <= 0 && (b.mode === Mode.Do || b.mode === Mode.Off)) {
        b.thinkIn = 0.3 + rnd(b.seed + i) * 0.35
        this.think(b, hour, day)
      }
      else if (b.thinkIn <= 0 && b.mode === Mode.Walk && b.kind === Kind.Staff && !b.leaving && !b.quit) {
        // home time has come while they were on their way somewhere: no need to get there first
        b.thinkIn = 1.2 + rnd(b.seed + i) * 0.8
        if (this.desire(b, hour, day) === Act.Home && this.clock >= this.nextOut) {
          this.nextOut = this.clock + this.outEvery * (0.75 + rnd(b.seed + this.counter++) * 0.5)
          b.act = Act.Home
          this.leave(b)
        }
      }
      if (b.mode !== Mode.Off) this.move(b, step)
      if (b.dead) dead = true
    }
    // twice, so that three people who meet in a corner are all clear of each other
    this.separate()
    this.separate()
    if (this.fronts.length) this.tendFronts(step)
    if (dead) {
      for (const b of this.bodies) {
        if (!b.dead) continue
        this.release(b, b.spot)
        this.release(b, b.goalSpot)
        this.unclaim(b)
        this.freeGate(b)
      }
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
    this.after(step, hour, day)
  }

  /** Puts someone where the hour says they would be, without the walk. */
  private drop(b: Body, hour: number, day: number) {
    if (b.kind === Kind.Front) {
      if (b.post && !b.quit && this.frontHours(hour) && !b.post.taken) {
        b.act = Act.Desk
        this.place(b, b.post)
      }
      return
    }
    if (b.kind !== Kind.Staff && b.kind !== Kind.Applicant) return
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
    this.claimTile(b, t)
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

  /** How many people are in each room right now, by room number (0 is outdoors). */
  headcount(out: Map<number, number>) {
    out.clear()
    const { w, h, grid } = this.site
    for (const b of this.bodies) {
      if (b.mode === Mode.Off) continue
      const x = Math.floor(b.x + w / 2)
      const y = Math.floor(b.z + h / 2)
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      const room = grid[y * w + x]
      out.set(room, (out.get(room) ?? 0) + 1)
    }
  }

  /** The closest any two people on their feet are to each other right now, with who they are: for tests. */
  closest(): { d: number; a?: Body; b?: Body } {
    let best = Infinity
    let pa: Body | undefined
    let pb: Body | undefined
    const list = this.bodies.filter((b) => b.mode !== Mode.Off && b.ghost <= 0 && (b.mode !== Mode.Do || !b.spot || b.spot.open) && b.mode !== Mode.Enter && b.mode !== Mode.Exit)
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const d = Math.hypot(list[i].x - list[j].x, list[i].z - list[j].z)
        if (d < best) {
          best = d
          pa = list[i]
          pb = list[j]
        }
      }
    }
    return { d: best, a: pa, b: pb }
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
