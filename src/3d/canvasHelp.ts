// The parts of the canvas wrapper (SafeCanvas) that are plain arithmetic and
// words, kept apart so they can be tested without a browser.

/** The longest step any animation takes in one frame, in seconds: a tab left in the background for an hour comes back as one frame. */
export const MAX_STEP = 0.1

/** A frame's time step, in seconds, with the pauses a hidden tab leaves taken out. */
export const stepOf = (dt: number, max = MAX_STEP) => (Number.isFinite(dt) && dt > 0 ? Math.min(dt, max) : 0)

interface XYZ {
  x: number
  y: number
  z: number
}

/**
 * Turns `position` about the upright line through `target` by `degPerSecond`
 * for `dt` seconds, in place. Height and distance are kept exactly.
 */
export function sweep(position: XYZ, target: XYZ, degPerSecond: number, dt: number): void {
  const a = ((degPerSecond * Math.PI) / 180) * stepOf(dt)
  if (!a) return
  const dx = position.x - target.x
  const dz = position.z - target.z
  const c = Math.cos(a)
  const s = Math.sin(a)
  position.x = target.x + dx * c + dz * s
  position.z = target.z - dx * s + dz * c
}

/** Keeps what the camera looks at within `span` of the middle on the ground, and never under it or above `top`. Returns true if it had to move. */
export function fence(target: XYZ, span: number, top: number, floor = 0): boolean {
  const x = Math.min(span, Math.max(-span, target.x))
  const y = Math.min(top, Math.max(floor, target.y))
  const z = Math.min(span, Math.max(-span, target.z))
  const moved = x !== target.x || y !== target.y || z !== target.z
  target.x = x
  target.y = y
  target.z = z
  return moved
}

/**
 * Watches how long frames take and says when the computer is not keeping up.
 * Frames are counted in windows; the first window is thrown away (it holds
 * the stalls of starting up) and so is any frame long enough to be a pause
 * rather than a slow frame. Returns true once a whole window has averaged
 * over the budget.
 */
export class Pace {
  private n = 0
  private sum = 0
  private warm: number
  constructor(
    private budget = 0.0215,
    private window = 120,
    warm = 45,
  ) {
    this.warm = warm
  }
  frame(dt: number): boolean {
    if (!(dt > 0) || dt > 0.25) return false
    if (this.warm > 0) {
      this.warm--
      return false
    }
    this.sum += dt
    if (++this.n < this.window) return false
    const slow = this.sum / this.n > this.budget
    this.n = 0
    this.sum = 0
    return slow
  }
}

/** The least of the full picture a view is ever drawn at when the computer cannot keep up. */
export const LEAST_SHARP = 0.6

/**
 * How sharply to draw, as a share of full sharpness, given how the last
 * stretch of frames went. A stretch that ran long (under about 46 frames a
 * second) takes a step down; one that ran with plenty to spare takes a step
 * back up. In between it is left alone, so the picture does not flicker
 * between two sizes.
 */
export function sharpness(now: number, averageFrame: number): number {
  if (averageFrame > 0.0215) return Math.max(LEAST_SHARP, +(now * 0.85).toFixed(3))
  // a step sharper is at worst 1.4 times the pixels: it is taken only when even that would still be comfortable
  if (averageFrame < 0.013 && now < 1) return Math.min(1, +(now / 0.85).toFixed(3))
  return now
}

/**
 * Adds up frame times and gives their average once a stretch of them is over:
 * so many frames, or a few seconds if the frames are so slow that that comes
 * first (a computer drawing two frames a second must not wait a minute to be
 * noticed). Pauses, and the first moments after starting, are left out.
 */
export class Meter {
  private n = 0
  private sum = 0
  private warmed = 0
  constructor(
    private window = 120,
    private warm = 45,
    private seconds = 3,
  ) {}
  frame(dt: number): number | null {
    // longer than this is the tab having been away, not a slow frame
    if (!(dt > 0) || dt > 2) return null
    if (this.warm > 0) {
      this.warm--
      this.warmed += dt
      if (this.warmed < 1.5) return null
      this.warm = 0
      return null
    }
    this.sum += dt
    this.n++
    if (this.n < this.window && (this.sum < this.seconds || this.n < 4)) return null
    const average = this.sum / this.n
    this.n = 0
    this.sum = 0
    return average
  }
}

/** True for the name of a renderer that draws on the processor alone, with no graphics card behind it. */
export const isSoftwareRenderer = (name: string) => /swiftshader|llvmpipe|software|softpipe|basic render/i.test(name)

/** What the player is told when a 3D view cannot be shown. `what` names the view, e.g. "campus view". */
export function lostCopy(what: string) {
  return {
    offTitle: '3D graphics are not available',
    off: `The ${what} needs WebGL, and this browser has it switched off or cannot use this computer's graphics.`,
    offHelp: 'Everything else in the game still works: every decision can be made from the panels and lists. To get the 3D views back, turn on hardware acceleration in the browser settings, update the graphics driver, or try another browser.',
    lostTitle: 'The 3D view was interrupted',
    lost: `The graphics driver dropped the ${what} (this happens when the computer wakes, or when many 3D tabs are open). It is being restored; your game is not affected.`,
    brokeTitle: 'The 3D view stopped',
    broke: `The ${what} ran into an error and was closed so that the rest of the game keeps working.`,
  }
}
