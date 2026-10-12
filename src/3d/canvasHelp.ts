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
