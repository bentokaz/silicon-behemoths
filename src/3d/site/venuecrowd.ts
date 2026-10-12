// The people at a venue. On an ordinary day a small crew looks after the
// place: technicians check the rig, a cleaner sweeps the aisles, and now and
// then someone rehearses on stage. When a keynote is booked the day has a
// show in it: the crew sets up, the presenter runs through it in the morning,
// the doors open after lunch, the house fills, applauds at the right moments,
// gets to its feet at the end and files out, some by way of the demo tables.
// All of it follows the site's clock and none of it is saved.
import { Act, Body, Crowd, Kind, Mode, Tool, rnd } from './crowd'
import type { Nav } from './nav'
import { Pose, type Spot, USE, seatRank } from './spots'
import type { Site } from '../../sim/types'

export interface Programme {
  /** A keynote is booked for this stage: the day has a show in it. */
  booked: boolean
  /** The show is on now, whatever the clock says (the rehearse switch). */
  live: boolean
  /** Share of the seats that will be taken, 0-1. */
  draw: number
}

export type Phase = 'closed' | 'crew' | 'rehearsal' | 'doors' | 'show' | 'ovation' | 'out'

/** The run of a show day, in hours on the site clock. */
export const SHOW = { crewIn: 7.6, rehearse: 10, rehearseEnd: 11.4, doors: 12.6, start: 14, ovation: 15.6, end: 15.8, cleared: 16.8, crewOut: 18.4 }
/** Moments in the show that get a round of applause, in hours after it starts, and how long each lasts. */
const BEATS = [0.28, 0.62, 0.96, 1.28]
const BEAT_LEN = 0.075
const SHIRTS = ['#c9553d', '#31506b', '#e9e4da', '#3f7d4d', '#d6a24f', '#6a5a7a', '#2c3036', '#8a5a44', '#4f8fd6', '#7a8f9c']

export function phaseAt(hour: number, day: number, p: Programme): Phase {
  if (p.live) return 'show'
  if (p.booked) {
    if (hour < SHOW.crewIn || hour >= SHOW.crewOut) return 'closed'
    if (hour >= SHOW.rehearse && hour < SHOW.rehearseEnd) return 'rehearsal'
    if (hour >= SHOW.doors && hour < SHOW.start) return 'doors'
    if (hour >= SHOW.start && hour < SHOW.ovation) return 'show'
    if (hour >= SHOW.ovation && hour < SHOW.end) return 'ovation'
    if (hour >= SHOW.end && hour < SHOW.cleared) return 'out'
    return 'crew'
  }
  if (hour < 8.8 || hour >= 17.2) return 'closed'
  // with nothing booked, someone still runs through a talk every other morning
  return day % 2 === 0 && hour >= 10.4 && hour < 11.3 ? 'rehearsal' : 'crew'
}

/** How loudly the house is clapping at an hour of a show day, 0-1. `now` is in seconds, for the loop the rehearse switch runs. */
export function applauseAt(hour: number, p: Programme, now: number): number {
  if (p.live) {
    // on a loop while the switch is held: a round of applause every so often
    const k = (now / 9) % 1
    return k > 0.72 ? Math.sin(((k - 0.72) / 0.28) * Math.PI) : 0
  }
  if (!p.booked) return 0
  if (hour >= SHOW.ovation && hour < SHOW.end) return 1
  for (const b of BEATS) {
    const k = (hour - SHOW.start - b) / BEAT_LEN
    if (k > 0 && k < 1) return Math.sin(k * Math.PI) ** 0.6
  }
  return 0
}

export class VenueCrowd extends Crowd {
  programme: Programme = { booked: false, live: false, draw: 0.85 }
  phase: Phase = 'closed'
  /** Share of all the seats that are taken right now, 0-1: the seated audience is drawn from it. */
  house = 0
  /** 0-1: how hard the house is clapping; and whether it is on its feet. */
  applause = 0
  ovation = false
  /** Every audience seat, by its spot key. */
  seats: Spot[] = []
  /** Seats kept for the guests who walk in, so the seated audience is not drawn into them. */
  reserved = new Set<string>()
  /** How many guests are drawn walking in and out; the rest of the house is drawn only once seated. */
  walkers = 36
  /** Seats taken by someone who is drawn only in their seat: the seated audience is exactly these. */
  seated = new Set<string>()
  /** The seats in the order the house fills (front rows first) and empties (back rows first), and each seat's place in it. */
  private order: Spot[] = []
  private rank = new Map<string, number>()
  /** How many seats, in that order, have been given to someone so far. */
  private given = 0
  private hostSpots: Spot[] = []
  private aisles: number[] = []
  private seq = 0
  private guestIn = 0
  private sold = 0

  setSite(site: Site, nav: Nav, spots: Spot[]) {
    super.setSite(site, nav, spots)
    this.seats = spots.filter((s) => s.use & USE.guest)
    const rank = seatRank(this.seats)
    this.order = this.seats.slice().sort((a, b) => rank[this.seats.indexOf(a)] - rank[this.seats.indexOf(b)])
    this.rank = new Map(this.order.map((s, k) => [s.key, k]))
    this.given = Math.min(this.given, this.order.length)
    for (const key of [...this.seated]) if (!this.byKey.has(key)) this.seated.delete(key)
    this.hostSpots = spots.filter((s) => s.use & USE.host && s.access >= 0)
    // the floor a cleaner works over: the aisles and the foyer, clear of doors and of where people stand
    const rooms = new Set(site.rooms.filter((r) => r.type === 'hall' || r.type === 'foyer').map((r) => r.n))
    this.aisles = []
    for (let i = 0; i < nav.reach.length; i++) if (nav.reach[i] && !this.keepOff(i) && (rooms.has(site.grid[i]) || (!site.grid[i] && this.byStage(i)))) this.aisles.push(i)
    for (const key of [...this.reserved]) if (!this.byKey.has(key)) this.reserved.delete(key)
  }

  /** Open ground within a few tiles of the stage or the seating, for venues with no hall round them. */
  private byStage(tile: number): boolean {
    const { w, h } = this.site
    const x = tile % w
    const y = (tile / w) | 0
    for (const it of this.site.items) {
      if (it.kind !== 'stage' && !it.kind.startsWith('seats')) continue
      if (x >= it.x - 3 && x <= it.x + 8 && y >= it.y - 3 && y <= it.y + 6 && x < w && y < h) return true
    }
    return false
  }

  setProgramme(p: Programme) {
    this.programme = p
  }

  // ---------------------------------------------------------------- the cast

  private ensureCast() {
    const want = this.programme.booked || this.programme.live ? 4 : 3
    const crew = this.bodies.filter((b) => b.kind === Kind.Crew)
    for (let k = crew.length; k < want; k++) {
      const b = new Body()
      b.id = `crew${k}`
      b.kind = Kind.Crew
      b.name = k === 0 ? 'Cleaner' : 'Stage crew'
      b.look = 700 + k * 977
      b.seed = b.look + 3
      b.lane = 0.15 + rnd(b.seed + 8) * 0.07
      b.shirt = k === 0 ? '#5a6b72' : '#22262b'
      b.tool = k === 0 ? Tool.Broom : k === 1 ? Tool.Clipboard : Tool.None
      b.thinkIn = rnd(k * 3.3) * 2
      this.bodies.push(b)
      this.version++
    }
    if (!this.bodies.some((b) => b.kind === Kind.Host) && this.hostSpots.length) {
      const b = new Body()
      b.id = 'host'
      b.kind = Kind.Host
      b.name = 'Presenter'
      b.look = 4242
      b.seed = 4259
      b.shirt = '#1c1e22'
      this.bodies.push(b)
      this.version++
    }
    // someone on the welcome desk on a show day
    this.manFronts([])
  }

  protected frontHours(hour: number): boolean {
    return this.programme.live || (this.programme.booked && hour >= SHOW.doors - 0.5 && hour < SHOW.cleared)
  }

  private guests(): number {
    let n = 0
    for (const b of this.bodies) if (b.kind === Kind.Guest) n++
    return n
  }

  private spawnGuest(placed: boolean, seat: Spot) {
    const n = ++this.seq
    const b = new Body()
    b.id = `guest${n}`
    b.kind = Kind.Guest
    b.name = 'Guest'
    b.look = Math.floor(rnd(n * 13.7 + 5) * 9000)
    b.seed = b.look + n
    b.lane = 0.15 + rnd(b.seed + 8) * 0.07
    b.shirt = SHIRTS[n % SHIRTS.length]
    b.act = Act.Watch
    b.seat = seat
    this.reserved.add(seat.key)
    this.bodies.push(b)
    this.version++
    if (placed || this.nav.entry < 0 || seat.access < 0 || !this.nav.reach[seat.access]) return this.place(b, seat)
    this.arriveOutside(b)
    // a few stop at the welcome desk on the way in
    const desk = rnd(b.seed) < 0.3 ? this.pick(b, USE.visit) : null
    if (desk) {
      b.stage = 1
      this.aim(b, desk)
    } else {
      b.stage = 2
      this.aim(b, seat)
    }
  }

  protected populate(hour: number, day: number) {
    this.phase = phaseAt(hour, day, this.programme)
    this.ensureCast()
    // a first look in the middle of a show finds the house already in
    if (this.phase === 'show' || this.phase === 'ovation') {
      this.sold = Math.round(this.seats.length * this.programme.draw)
      this.house = this.programme.draw
      this.fill(this.sold, true, 0)
    }
  }

  /**
   * Gives out seats, in the order the house fills, until `target` of them are taken, or takes them back from the
   * other end. A share of the people given one walk in from the street, as many as the view will draw, spread
   * through the whole house so the stream keeps coming while the rows fill; the rest are simply seen in their seats.
   */
  private fill(target: number, placed: boolean, step: number) {
    this.guestIn -= step
    const share = Math.min(1, (this.walkers * 1.15) / Math.max(1, this.sold))
    let live = this.guests()
    while (this.given < target && this.given < this.order.length) {
      const seat = this.order[this.given++]
      if (seat.taken || this.reserved.has(seat.key)) continue
      const walks = live < this.walkers && rnd(this.given * 5.3 + 0.7) < share && (placed || this.guestIn <= 0)
      if (walks) {
        if (!placed) this.guestIn = this.programme.live ? 0.2 : 0.3
        this.spawnGuest(placed, seat)
        live++
      } else this.seated.add(seat.key)
    }
    // on the way out the back rows go first: the walkers among them get up when their seat is taken back
    while (this.given > target && this.given > 0) this.seated.delete(this.order[--this.given].key)
  }

  protected after(step: number, hour: number, day: number) {
    const p = this.programme
    const phase = phaseAt(hour, day, p)
    this.phase = phase
    this.ensureCast()
    this.applause = applauseAt(hour, p, this.now * 45)
    this.ovation = phase === 'ovation'
    // ---- how full the house is
    const seats = this.seats.length
    let want = 0
    // the last guests are let in a while before the start, so that everyone has reached their seat when it does
    if (phase === 'doors') want = p.draw * Math.min(1, (hour - SHOW.doors) / (SHOW.start - SHOW.doors - 0.4))
    else if (phase === 'show' || phase === 'ovation') want = p.draw
    else if (phase === 'out') want = p.draw * Math.max(0, 1 - (hour - SHOW.end) / 0.55)
    // the house fills and empties smoothly even when the switch is thrown mid-day
    this.house += Math.max(-step * 0.5, Math.min(step * 0.5, want - this.house))
    this.sold = Math.round(seats * p.draw)
    this.fill(Math.round(seats * this.house), false, step)
    if (this.house <= 0.001 && !this.guests() && this.reserved.size) this.reserved.clear()
    // ---- everyone in their seat claps with the house, and most get to their feet at the end
    for (const b of this.bodies) {
      if (b.kind !== Kind.Guest || b.mode !== Mode.Do || !b.seat || b.spot !== b.seat) continue
      b.clap = this.applause
      const up = this.ovation && rnd(b.seed + 2) > 0.3
      b.cheer = up
      b.hip = up ? 0.86 : b.seat.hip
      b.pose = up ? Pose.Stand : Pose.Sit
    }
  }

  // ---------------------------------------------------------------- what each of them does

  protected thinkOther(b: Body, hour: number, _day: number) {
    if (b.kind === Kind.Guest) return this.thinkGuest(b, hour)
    if (b.kind === Kind.Host) return this.thinkHost(b)
    this.thinkCrew(b)
  }

  private thinkGuest(b: Body, hour: number) {
    if (b.mode !== Mode.Do) return
    const phase = this.phase
    const seated = b.spot === b.seat
    if (b.stage === 1) {
      // done at the welcome desk: on to the seat
      if (b.wait > 0) return
      b.stage = 2
      if (b.seat) {
        this.aim(b, b.seat)
        return this.depart(b)
      }
    }
    if (b.stage === 3) {
      // had a go on the demo table: home
      if (b.wait > 0) return
      b.stage = 4
      return this.leave(b)
    }
    const over = phase === 'out' || phase === 'crew' || phase === 'closed' || phase === 'rehearsal'
    // out with the row: a guest in their seat stays until the emptying house has reached it
    void hour
    if (over && b.stage < 3 && (!seated || phase !== 'out' || (this.rank.get(b.seat!.key) ?? 0) >= this.given)) {
      b.cheer = false
      b.clap = 0
      const demo = rnd(b.seed + 9) < 0.3 ? this.pick(b, USE.browse) : null
      if (demo) {
        b.stage = 3
        b.wait = 5 + rnd(b.seed) * 5
        this.aim(b, demo)
        return this.depart(b)
      }
      b.stage = 4
      this.leave(b)
    }
  }

  private thinkHost(b: Body) {
    // in good time: on stage well before the house has finished coming in
    const hour = ((this.now % 24) + 24) % 24
    const on = this.phase === 'rehearsal' || this.phase === 'show' || this.phase === 'ovation' || (this.phase === 'doors' && hour > SHOW.doors + 0.2)
    if (!on || !this.hostSpots.length) {
      if (b.mode === Mode.Do && !b.leaving) {
        b.cheer = false
        this.leave(b)
      }
      return
    }
    if (b.mode === Mode.Off) {
      const spot = this.hostSpots[0]
      b.act = Act.Host
      b.wait = 9 + rnd(this.seq + b.roams++) * 10
      // a show never starts without its presenter: if it is already under way, they are on stage
      const late = this.phase === 'ovation' || (this.phase === 'show' && hour > SHOW.start + 0.03)
      if (this.nav.entry < 0 || !this.nav.reach[spot.access] || this.programme.live || late) return this.place(b, spot)
      this.arriveOutside(b)
      this.aim(b, spot)
      return
    }
    if (b.mode !== Mode.Do || !b.spot) return
    b.clap = 0
    // takes the applause with a wave
    b.cheer = this.ovation
    if (b.wait > 0 || this.hostSpots.length < 2 || this.ovation) return
    // across the boards to the other mark, without going down the steps and up again
    const next = this.hostSpots.find((s) => s !== b.spot && !s.taken)
    if (!next) return
    b.wait = 10 + rnd(b.seed + b.roams++) * 12
    this.release(b, b.spot)
    b.spot = null
    b.goalSpot = next
    next.taken = b
    b.way.length = 0
    b.way.push(b.x, b.y, b.z, next.x, next.y, next.z)
    this.startWay(b)
    b.striding = true
    b.mode = Mode.Enter
    b.pose = Pose.Stand
  }

  private thinkCrew(b: Body) {
    const phase = this.phase
    if (phase === 'closed') {
      if (b.mode === Mode.Do && !b.leaving) this.leave(b)
      return
    }
    const cleaner = b.tool === Tool.Broom
    const showtime = phase === 'doors' || phase === 'show' || phase === 'ovation'
    if (b.mode === Mode.Off) {
      // the cleaner keeps out of sight while the house is in
      if (cleaner && showtime) return
      if (this.nav.entry < 0) return
      b.act = Act.Crew
      this.arriveOutside(b)
      this.assign(b, showtime)
      return
    }
    if (b.mode !== Mode.Do) return
    if (cleaner && showtime) {
      if (!b.leaving) this.leave(b)
      return
    }
    if (b.wait > 0) return
    if (this.assign(b, showtime)) this.depart(b)
  }

  /** Gives one of the crew the next thing to see to. False if they are to stay where they are. */
  private assign(b: Body, showtime: boolean): boolean {
    b.wait = 5 + rnd(b.seed + b.roams) * 9
    if (b.tool === Tool.Broom) {
      const list = this.aisles.length ? this.aisles : this.wanderTiles
      b.wait = 3 + rnd(b.seed + b.roams) * 3
      this.aimTile(b, list.length ? list[Math.floor(rnd(b.seed + ++b.roams * 5.3) * list.length)] : this.nav.entry)
      return true
    }
    // during a show the cameras are manned; otherwise the round of the rig
    if (showtime && b.spot && b.spot.use & USE.press) return false
    const spot = (showtime ? this.pick(b, USE.press) : null) ?? this.pick(b, USE.crew | (rnd(b.seed + b.roams++) < 0.3 ? USE.press : 0))
    if (spot === b.spot && spot) return false
    if (spot) this.aim(b, spot)
    else this.aimTile(b, this.wanderTile(b))
    return true
  }

  protected onStop(b: Body) {
    if (b.kind === Kind.Crew && b.tool === Tool.Broom && !b.spot) b.pose = Pose.Sweep
    if (b.kind === Kind.Guest && b.stage === 1) b.wait = 1.5 + rnd(b.seed) * 2.5
    if (b.kind === Kind.Guest && b.spot === b.seat) b.thinkIn = 0
  }
}
