// The people in a factory. The game only knows the line and what it makes;
// the shift that runs it is made up here, for the 3D view: an operator at
// each machine of a working line, someone at every control desk and
// inspection bench, a supervisor who walks the line with a clipboard, and a
// hand with a pallet truck who takes cartons from the store to the shipping
// dock. They come in for the morning, break for lunch in the crew room if
// there is one, and go home at the end of the day. A line with no orders
// keeps a skeleton crew. None of it is saved or read by the game.
import type { Site } from '../../sim/types'
import { Act, Body, Crowd, Kind, Mode, Tool, rnd } from './crowd'
import type { Nav } from './nav'
import { Pose, type Spot, USE } from './spots'

/** What each of them is there to do. */
export const Job = { Operator: 0, Supervisor: 1, Hauler: 2 } as const

/** The working day, in hours on the site clock: when the first of the shift come in, and when the last have gone. */
export const SHIFT = { start: 6.7, end: 17.4 }
/** Machines a line worker stands at, and the desks of the control room. */
const LINE_KINDS = new Set(['smt', 'robot', 'manual', 'test', 'pack'])
const VESTS = ['#e0a030', '#d98a2b', '#e6b23a']

/** The roster a line of a given size keeps: how many of its stations are manned, and who else is about. */
export function rosterFor(stations: number, docks: number, running: boolean, cap: number): { operators: number; supervisors: number; haulers: number } {
  if (!stations) return { operators: 0, supervisors: 0, haulers: 0 }
  const room = Math.max(1, cap)
  // with no orders a skeleton crew keeps an eye on things: one in three, and nobody moving stock
  const operators = Math.min(room, running ? stations : Math.max(1, Math.ceil(stations / 3)))
  const supervisors = operators >= 3 && operators < room ? 1 : 0
  const haulers = running ? Math.min(2, docks, Math.max(0, room - operators - supervisors)) : 0
  return { operators, supervisors, haulers }
}

export class FactoryCrowd extends Crowd {
  /** Whether the line has work, and which items are on it. */
  running = false
  private linked: ReadonlySet<string> = new Set()
  private cap = 24
  /** Stations to man, the line's own first; places a pallet truck is loaded and unloaded; and tiles a supervisor stops at. */
  private stations: Spot[] = []
  private picks: Spot[] = []
  private drops: Spot[] = []
  private rounds: number[] = []
  private rosterKey = ''

  setSite(site: Site, nav: Nav, spots: Spot[]) {
    super.setSite(site, nav, spots)
    this.survey()
  }

  /** Tells the crowd what the line is doing. `cap` is how many people the view will draw. */
  setLine(linked: ReadonlySet<string> | undefined, running: boolean, cap: number) {
    this.linked = linked ?? new Set()
    this.running = running
    this.cap = cap
    if (this.nav) this.survey()
  }

  /** Works out who is needed, from the site as built and the line as it runs, and brings the cast into line with it. */
  private survey() {
    const usable = (s: Spot) => s.access >= 0
    const line = this.spots.filter((s) => s.use & USE.station && usable(s) && LINE_KINDS.has(s.item.kind) && this.linked.has(s.item.id))
    const control = this.spots.filter((s) => s.use & USE.station && usable(s) && !LINE_KINDS.has(s.item.kind))
    this.stations = this.linked.size ? [...line, ...control] : []
    this.drops = this.spots.filter((s) => s.use & USE.crew && usable(s) && this.linked.has(s.item.id))
    this.picks = this.spots.filter((s) => s.use & USE.press && usable(s))
    // the supervisor's round: the floor in front of each station on the line
    // a step back from where its operator stands, so as not to crowd them
    const stops = new Set<number>()
    const w = this.nav.w
    for (const s of line) {
      for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        if (!this.nav.step(s.access, dx, dy)) continue
        const t = s.access + dx + dy * w
        if (this.keepOff(t) || !this.nav.walk[t]) continue
        stops.add(t)
        break
      }
    }
    this.rounds = [...stops]
    const docks = this.drops.length && this.picks.length ? this.drops.length : 0
    const want = rosterFor(this.stations.length, docks, this.running, this.cap)
    const key = `${want.operators}|${want.supervisors}|${want.haulers}|${this.stations.map((s) => s.key).join(',')}`
    if (key === this.rosterKey) return
    this.rosterKey = key
    const keep = new Set<string>()
    const cast = (id: string, job: number, k: number): Body => {
      keep.add(id)
      let b = this.bodies.find((x) => x.kind === Kind.Hand && x.id === id && !x.quit)
      if (b) return b
      b = new Body()
      b.id = id
      b.kind = Kind.Hand
      b.job = job
      b.look = 1500 + k * 733 + job * 4001
      b.seed = b.look + 13
      b.lane = 0.15 + rnd(b.seed + 8) * 0.07
      b.name = job === Job.Supervisor ? 'Shift supervisor' : job === Job.Hauler ? 'Warehouse hand' : 'Line worker'
      b.shirt = job === Job.Supervisor ? '#e9e4da' : job === Job.Hauler ? '#3f7d6a' : VESTS[k % VESTS.length]
      b.tool = job === Job.Supervisor ? Tool.Clipboard : job === Job.Hauler ? Tool.Jack : Tool.None
      b.thinkIn = this.settled ? 0.3 + rnd(b.seed) * 2 : 0
      this.bodies.push(b)
      this.version++
      return b
    }
    for (let k = 0; k < want.operators; k++) cast(`op${k}`, Job.Operator, k).station = this.stations[k]
    for (let k = 0; k < want.supervisors; k++) cast(`sup${k}`, Job.Supervisor, k)
    for (let k = 0; k < want.haulers; k++) cast(`haul${k}`, Job.Hauler, k).station = this.drops[k % this.drops.length]
    // anyone the line no longer needs finishes what they are doing and goes home
    for (const b of this.bodies) {
      if (b.kind !== Kind.Hand || b.quit || keep.has(b.id)) continue
      b.quit = true
      b.thinkIn = 0
    }
  }

  /** When someone comes in, breaks for lunch and goes home on a given day: the shift arrives over half an hour and leaves over about as long. */
  private shiftHours(b: Body, day: number) {
    if (b.schedDay === day) return
    b.schedDay = day
    const r = (k: number) => rnd(b.seed * 5.71 + day * 2.9 + k * 13.1)
    b.sched[0] = SHIFT.start + r(1) * 0.55
    b.sched[1] = SHIFT.end - 0.65 + r(2) * 0.6
    b.sched[2] = 11.5 + r(3) * 1.3
    b.sched[3] = b.sched[2] + 0.45
  }

  private onShift(b: Body, hour: number, day: number): boolean {
    this.shiftHours(b, day)
    return !b.quit && hour >= b.sched[0] && hour < b.sched[1]
  }

  /** Where someone should be right now, if it is a spot: their station, or a seat in the crew room at lunch. */
  private placeFor(b: Body, hour: number): Spot | null {
    if (b.job === Job.Supervisor) return null
    const lunch = hour >= b.sched[2] && hour < b.sched[3]
    if (lunch && b.job === Job.Operator) {
      if (b.spot && b.spot.use & USE.lunch) return b.spot
      const seat = this.pick(b, USE.lunch)
      if (seat) return seat
    }
    if (b.job === Job.Hauler) return b.stage >= 2 ? b.station : (this.nearestPick(b) ?? b.station)
    return b.station
  }

  private nearestPick(b: Body): Spot | null {
    let best: Spot | null = null
    let bestD = Infinity
    const zone = this.zoneOf(b)
    for (const s of this.picks) {
      if ((s.taken && s.taken !== b) || this.nav.zone[s.access] !== zone) continue
      const d = Math.abs(s.x - b.x) + Math.abs(s.z - b.z) + rnd(b.seed + b.roams * 3.1 + s.x) * 4
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    return best
  }

  protected populate(hour: number, day: number) {
    this.survey()
    // a first look in working hours finds the shift already at it
    for (const b of this.bodies) {
      if (b.kind !== Kind.Hand || !this.onShift(b, hour, day)) continue
      b.act = Act.Station
      const spot = this.placeFor(b, hour)
      if (spot && (!spot.taken || spot.taken === b)) this.place(b, spot)
      else if (this.rounds.length) {
        const t = this.rounds[Math.floor(rnd(b.seed) * this.rounds.length)]
        this.claimTile(b, t)
        b.x = this.nav.cx(t)
        b.z = this.nav.cz(t)
        b.mode = Mode.Do
        b.pose = Pose.Look
        b.wait = 2 + rnd(b.seed) * 4
      }
    }
  }

  protected thinkOther(b: Body, hour: number, day: number) {
    if (b.kind !== Kind.Hand) return
    if (!this.onShift(b, hour, day)) {
      if (b.mode === Mode.Off) {
        if (b.quit) b.dead = true
      } else if (b.mode === Mode.Do && !b.leaving) {
        b.stage = 0
        this.leave(b)
      }
      return
    }
    if (b.mode === Mode.Off) {
      b.act = Act.Station
      const spot = this.placeFor(b, hour)
      // somewhere no door leads to from the street: simply there
      if (this.nav.entry < 0 || (spot && !this.nav.reach[spot.access])) {
        if (spot && (!spot.taken || spot.taken === b)) this.place(b, spot)
        return
      }
      this.arriveOutside(b)
      if (spot && (!spot.taken || spot.taken === b)) this.aim(b, spot)
      else this.aimTile(b, this.rounds.length ? this.rounds[Math.floor(rnd(b.seed + b.roams++) * this.rounds.length)] : this.wanderTile(b))
      return
    }
    if (b.mode !== Mode.Do) return
    if (b.job === Job.Supervisor) {
      // along the line, a stop at each station to see how it is going
      if (b.wait > 0) return
      b.wait = 3 + rnd(b.seed + b.roams) * 5
      const list = this.rounds.length ? this.rounds : this.wanderTiles
      if (!list.length) return
      this.aimTile(b, list[b.roams++ % list.length])
      return this.depart(b)
    }
    if (b.job === Job.Hauler) {
      // a load from the store to the dock, and back for the next: 0 on the way to fetch, 1 loading, 2 on the way to the dock, 3 setting down
      if (b.wait > 0) return
      if (b.spot && b.stage === 0) {
        b.stage = 1
        b.wait = 1.6
        return
      }
      if (b.spot && b.stage === 2) {
        b.stage = 3
        b.wait = 1.4
        return
      }
      b.stage = b.stage === 1 ? 2 : b.stage === 3 ? 0 : b.stage
      b.roams++
    }
    const spot = this.placeFor(b, hour)
    if (!spot || spot === b.spot || (spot.taken && spot.taken !== b)) return
    this.aim(b, spot)
    this.depart(b)
  }

  protected onStop(b: Body) {
    if (b.kind !== Kind.Hand) return
    if (b.job === Job.Supervisor && !b.spot) b.pose = Pose.Look
    if (b.job === Job.Hauler) b.thinkIn = 0
  }

  /** True while a hand's pallet truck has cartons on it. */
  static loaded(b: Body): boolean {
    return b.job === Job.Hauler && (b.stage === 2 || (b.stage === 1 && b.wait < 0.8) || (b.stage === 3 && b.wait > 0.7))
  }
}
