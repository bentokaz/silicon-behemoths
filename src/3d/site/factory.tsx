// Factory machinery and yard. One unit is one metre and one floor tile; each
// model is centred on its footprint with its front toward +Z. Belts run at
// 0.8 m so everything on the line meets at the same height.
import { ITEMS } from '../../sim/sites'
import { B, Baked, C, CHARCOAL, DARK, type PersonLook, Person, S, STEEL, Tree, WHITE, hash } from './kit'

export interface FactoryCtx {
  /** True when this item is on a working line that has orders. */
  running: boolean
  /** Conveyors: direction of travel in the item's own frame. */
  flow?: [number, number]
  glow: number
  seed: number
  /** Truck bays: the view draws this bay's lorry itself, coming and going, so only the markings are left here. */
  away?: boolean
  /** How full the warehouse is, 0-1: racks empty out as stock sells. */
  fill?: number
  /** The shift is drawn walking about, so nobody is modelled sitting at a bench. */
  live?: boolean
  /** Machines: tier 1-3, and how many modules are fitted. */
  tier?: number
  mods?: number
}

const BELT = 0.8
const YELLOW = '#e0b23a'
const BOX = '#b98b56'
const CREW: PersonLook[] = [
  { look: 211, color: '#e0812a' },
  { look: 1730, color: '#3a6ea8' },
  { look: 4099, color: '#e0812a' },
]

/** A length of belt on legs, running along X, centred on the origin. */
function BeltRun({ len, rail = YELLOW }: { len: number; rail?: string }) {
  return (
    <>
      {[-len / 2 + 0.12, len / 2 - 0.12].map((x) =>
        [-0.26, 0.26].map((z) => <B key={`${x}${z}`} p={[x, (BELT - 0.1) / 2, z]} s={[0.05, BELT - 0.1, 0.05]} c={STEEL} r={0.008} metal={0.7} rough={0.4} cast={false} />),
      )}
      <B p={[0, BELT - 0.07, 0]} s={[len, 0.1, 0.62]} c="#3a3d42" r={0.01} metal={0.5} rough={0.5} />
      <B p={[0, BELT - 0.012, 0]} s={[len, 0.02, 0.5]} c="#15171a" r={0} rough={0.9} cast={false} />
      {[-0.3, 0.3].map((z) => (
        <B key={z} p={[0, BELT + 0.02, z]} s={[len, 0.06, 0.03]} c={rail} r={0.006} rough={0.6} cast={false} />
      ))}
    </>
  )
}

/** Arrows painted on a belt, pointing the way it runs (+X). */
function Chevrons({ len }: { len: number }) {
  return (
    <>
      {Array.from({ length: Math.max(1, Math.round(len * 2)) }, (_, i) => {
        const x = -len / 2 + (i + 0.5) / Math.max(1, Math.round(len * 2)) * len
        return [1, -1].map((side) => <B key={`${i}${side}`} p={[x - 0.04, BELT + 0.002, side * 0.07]} s={[0.2, 0.004, 0.035]} rot={[0, side * 0.75, 0]} c="#8d9299" r={0} rough={0.8} cast={false} />)
      })}
    </>
  )
}

/** Input and output colours for the faces of line blocks. */
export const PORT_IN = '#3fe08a'
export const PORT_OUT = '#e0b23a'

/**
 * The opening on a face of a line block where parts go in (green frame, at
 * local -X) or come out (amber frame, at local +X), at belt height.
 */
function Hatch({ x, out, glow }: { x: number; out: boolean; glow: number }) {
  const side = Math.sign(x)
  const col = out ? PORT_OUT : PORT_IN
  return (
    <group position={[x - side * 0.02, BELT + 0.12, 0]}>
      <B p={[-side * 0.012, 0, 0]} s={[0.02, 0.4, 0.56]} c="#0b0c0e" r={0} cast={false} />
      {[-0.22, 0.22].map((y) => (
        <B key={y} p={[0, y, 0]} s={[0.05, 0.06, 0.66]} c={col} r={0} glow={col} glowPower={0.9 * glow} cast={false} />
      ))}
      {[-0.3, 0.3].map((z) => (
        <B key={z} p={[0, 0, z]} s={[0.05, 0.4, 0.06]} c={col} r={0} glow={col} glowPower={0.9 * glow} cast={false} />
      ))}
    </group>
  )
}

/** Input and output hatches on a line block's two ends. */
function Ports({ kind, glow }: { kind: string; glow: number }) {
  const def = ITEMS.factory[kind]
  if (!def?.stage || def.stage === 'belt' || def.stage === 'split') return null
  const half = def.w / 2
  return (
    <>
      {def.stage !== 'in' && <Hatch x={-half} out={false} glow={glow} />}
      {def.stage !== 'out' && <Hatch x={half} out glow={glow} />}
    </>
  )
}

/** A status beacon on a short mast. */
function Beacon({ p, on, glow }: { p: [number, number, number]; on: boolean; glow: number }) {
  return (
    <group position={p}>
      <C p={[0, 0.12, 0]} r={[0.015, 0.015]} h={0.24} c={STEEL} seg={8} cast={false} />
      <C p={[0, 0.29, 0]} r={[0.04, 0.04]} h={0.1} c={on ? '#103018' : '#301010'} glow={on ? '#3fe08a' : '#e5484d'} glowPower={(on ? 1.6 : 0.8) * glow} seg={10} cast={false} />
    </group>
  )
}

function Dock({ c, out }: { c: FactoryCtx; out: boolean }) {
  return (
    <>
      {/* roller door in a frame at the back, platform and a short belt out front */}
      <B p={[0, 1.4, -0.42]} s={[1.96, 2.8, 0.12]} c="#c9ccd0" r={0.01} rough={0.7} />
      <B p={[0, 1.2, -0.355]} s={[1.5, 2.2, 0.012]} c={out ? '#3d6a8c' : '#8c5a3d'} r={0} rough={0.6} metal={0.3} cast={false} />
      {Array.from({ length: 9 }, (_, i) => (
        <B key={i} p={[0, 0.25 + i * 0.24, -0.347]} s={[1.5, 0.02, 0.008]} c="#1f2226" r={0} cast={false} />
      ))}
      <B p={[0, 2.5, -0.35]} s={[1.5, 0.3, 0.016]} c={YELLOW} r={0} rough={0.6} cast={false} />
      <B p={[0, 0.3, 0.1]} s={[1.96, 0.6, 0.8]} c="#8c8e90" r={0.012} rough={0.9} />
      <B p={[0, 0.604, 0.44]} s={[1.96, 0.012, 0.12]} c={YELLOW} r={0} rough={0.7} cast={false} />
      {/* the bed stops a little under the belt that runs on it: with their tops level, the two flickered */}
      <B p={[0, 0.69, 0.1]} s={[1.2, 0.2, 0.62]} c="#3a3d42" r={0.01} metal={0.5} rough={0.5} />
      <B p={[0, BELT - 0.012, 0.1]} s={[1.2, 0.02, 0.5]} c="#15171a" r={0} rough={0.9} cast={false} />
      {[-0.7, 0.72].map((x, i) => (
        <B key={x} p={[x, 0.74 + i * 0.06, 0.14]} s={[0.3, 0.28 + i * 0.12, 0.34]} c={BOX} r={0.008} rough={0.85} cast={false} />
      ))}
      <Beacon p={[0.9, 2.8, -0.42]} on={c.running} glow={c.glow} />
    </>
  )
}

/** Where a lorry's wheels are: x of each side, z of each axle (the first is the one that steers), and their radius. */
export const LORRY_WHEELS = { x: [-0.95, 0.95], z: [3.0, -0.6, -1.7, -2.8], r: 0.48 }

/** One wheel of a lorry, lying along X: tyre, rim and a hub with a bar across it, so that it can be seen to turn. */
function LorryWheel({ side }: { side: number }) {
  return (
    <>
      <C p={[0, 0, 0]} r={[0.48, 0.48]} h={0.3} c="#15171a" seg={16} rot={[0, 0, Math.PI / 2]} />
      <C p={[side * 0.152, 0, 0]} r={[0.27, 0.27]} h={0.012} c="#8d9299" seg={14} rot={[0, 0, Math.PI / 2]} cast={false} />
      <B p={[side * 0.16, 0, 0]} s={[0.012, 0.42, 0.11]} c="#3a3d42" r={0} cast={false} />
      <B p={[side * 0.16, 0, 0]} s={[0.012, 0.11, 0.42]} c="#3a3d42" r={0} cast={false} />
    </>
  )
}

/** A wheel on its own, for a lorry on the move: the view turns and steers it. */
export function LiveWheel({ side }: { side: number }) {
  return (
    <Baked sig={`wheel${side}`}>
      <LorryWheel side={side} />
    </Baked>
  )
}

/** A lorry about 7.5 m long: cab toward +Z, box trailer behind. Parked in the yard, or driven up to a dock (then without its wheels, which are drawn turning). */
export function Lorry({ seed, wheels = true }: { seed: number; wheels?: boolean }) {
  const paint = ['#c9553d', '#2f5d8a', '#3f7d4d'][seed % 3]
  return (
    <>
      {wheels &&
        LORRY_WHEELS.x.map((x) =>
          LORRY_WHEELS.z.map((z) => (
            <group key={`${x}${z}`} position={[x, LORRY_WHEELS.r, z]}>
              <LorryWheel side={Math.sign(x)} />
            </group>
          )),
        )}
      <B p={[0, 0.72, -0.3]} s={[2.0, 0.24, 6.6]} c="#2b2d31" r={0.02} rough={0.7} />
      <B p={[0, 2.2, -1.0]} s={[2.4, 2.7, 5.4]} c="#e4e6e8" r={0.03} rough={0.6} />
      <B p={[1.206, 2.3, -1.0]} s={[0.012, 0.9, 3.4]} c={paint} r={0} cast={false} />
      <B p={[-1.206, 2.3, -1.0]} s={[0.012, 0.9, 3.4]} c={paint} r={0} cast={false} />
      <B p={[0, 1.75, 2.9]} s={[2.3, 1.9, 1.7]} c={paint} r={0.12} rough={0.4} metal={0.4} />
      <B p={[0, 2.2, 3.756]} s={[2.0, 0.7, 0.012]} c="#141a20" r={0} rough={0.1} metal={0.6} cast={false} />
      {[-0.8, 0.8].map((x) => (
        <B key={x} p={[x, 1.1, 3.756]} s={[0.36, 0.16, 0.012]} c="#f4f6f8" r={0} glow="#fff6e0" glowPower={0.3} cast={false} />
      ))}
      {/* the bumper stands a little proud of the cab at each side: flush with it, the two flickered */}
      <B p={[0, 0.82, 3.7]} s={[2.34, 0.3, 0.16]} c="#2b2d31" r={0.03} />
    </>
  )
}

/** Tier colours, I to III: plain steel, blue and gold, as a band round the machine's foot and a plate on its top. */
export const TIER_COLOUR = ['#8d9299', '#3a7bd5', '#e0b23a']

/** A machine's tier and modules, readable from above: a coloured kick plate round its foot, a pip per tier, a light per module. */
function TierMark({ kind, tier = 1, mods = 0 }: { kind: string; tier?: number; mods?: number }) {
  const def = ITEMS.factory[kind]
  if (!def?.cap) return null
  // the plates stand just inside the footprint's edge, clear of every machine's body (none comes closer than 3 cm)
  const w = def.w - 0.02
  const d = def.h - 0.02
  const col = TIER_COLOUR[Math.max(0, Math.min(2, tier - 1))]
  return (
    <>
      {[-1, 1].map((s) => (
        <B key={`x${s}`} p={[0, 0.05, (s * d) / 2]} s={[w, 0.1, 0.02]} c={col} r={0} rough={0.6} cast={false} />
      ))}
      {[-1, 1].map((s) => (
        <B key={`z${s}`} p={[(s * w) / 2, 0.05, 0]} s={[0.02, 0.1, d]} c={col} r={0} rough={0.6} cast={false} />
      ))}
      {Array.from({ length: tier }, (_, i) => (
        <B key={i} p={[-w / 2 + 0.12 + i * 0.14, 0.16, d / 2 + 0.006]} s={[0.1, 0.06, 0.012]} c={col} r={0} glow={col} glowPower={0.6} cast={false} />
      ))}
      {Array.from({ length: mods }, (_, i) => (
        <B key={`m${i}`} p={[w / 2 - 0.12 - i * 0.14, 0.16, d / 2 + 0.006]} s={[0.08, 0.08, 0.012]} c="#7fd1ff" r={0} glow="#7fd1ff" glowPower={1} cast={false} />
      ))}
    </>
  )
}

/** A long enclosed process machine W by D: base, hood with windows down its front, a stack of status lamps. */
function Enclosed({ W, D, body, hood, glass, h = 1.6, c, lamps = 3 }: { W: number; D: number; body: string; hood: string; glass: string; h?: number; c: FactoryCtx; lamps?: number }) {
  return (
    <>
      <B p={[0, 0.4, 0]} s={[W - 0.1, 0.8, D - 0.2]} c={body} r={0.015} rough={0.5} />
      <B p={[0, 0.8 + (h - 0.8) / 2, -0.05]} s={[W - 0.16, h - 0.8, D - 0.36]} c={hood} r={0.03} rough={0.4} />
      {Array.from({ length: lamps }, (_, i) => {
        const x = -W / 2 + ((i + 0.5) * W) / lamps
        return <B key={i} p={[x, 0.8 + (h - 0.8) / 2, D / 2 - 0.2]} s={[W / lamps - 0.3, (h - 0.8) * 0.55, 0.012]} c="#0c1622" r={0} glow={glass} glowPower={(c.running ? 0.9 : 0.25) * Math.max(0.5, c.glow)} rough={0.1} cast={false} />
      })}
      <Beacon p={[W / 2 - 0.3, h, -D / 2 + 0.3]} on={c.running} glow={c.glow} />
    </>
  )
}

/** The models for the machines a deep factory adds: component lines, logistics and power. */
function DeepModel({ kind, c }: { kind: string; c: FactoryCtx }) {
  switch (kind) {
    case 'conveyor_2':
    case 'conveyor_3':
      return (
        <>
          <BeltRun len={1} rail={kind === 'conveyor_2' ? '#c9553d' : '#3a7bd5'} />
          <Chevrons len={1} />
        </>
      )
    case 'splitter':
      return (
        <>
          <BeltRun len={1} rail="#9aa0a6" />
          <B p={[0, BELT + 0.16, 0]} s={[0.5, 0.3, 0.7]} c="#2b2d31" r={0.03} />
          {[-1, 1].map((z) => (
            <B key={z} p={[0.1, BELT + 0.16, z * 0.36]} s={[0.3, 0.12, 0.04]} c={YELLOW} r={0} glow={YELLOW} glowPower={0.4} cast={false} />
          ))}
          <B p={[0.26, BELT + 0.16, 0]} s={[0.04, 0.12, 0.3]} c={YELLOW} r={0} glow={YELLOW} glowPower={0.4} cast={false} />
        </>
      )
    case 'arm':
      return (
        <>
          <C p={[0, 0.3, 0]} r={[0.22, 0.28]} h={0.6} c="#2b2d31" seg={14} />
          <C p={[0, 0.66, 0]} r={[0.14, 0.14]} h={0.12} c="#e0812a" seg={12} />
          <group position={[0, 0.72, 0]} rotation={[0, 0, -0.5]}>
            <B p={[0, 0.3, 0]} s={[0.1, 0.6, 0.1]} c="#e0812a" r={0.03} rough={0.5} />
            <group position={[0, 0.6, 0]} rotation={[0, 0, 1.6]}>
              <B p={[0, 0.25, 0]} s={[0.08, 0.5, 0.08]} c="#e0812a" r={0.025} rough={0.5} />
              <B p={[0, 0.52, 0]} s={[0.14, 0.06, 0.14]} c={STEEL} r={0.01} metal={0.9} rough={0.3} cast={false} />
            </group>
          </group>
        </>
      )
    case 'buffer':
      return (
        <>
          {[-0.85, 0, 0.85].map((x) => [-0.3, 0.3].map((z) => <B key={`${x}${z}`} p={[x, 0.9, z]} s={[0.05, 1.8, 0.05]} c="#3a7bd5" r={0.006} cast={false} />))}
          {[0.3, 1.1, 1.75].map((y) => (
            <B key={y} p={[0, y, 0]} s={[1.84, 0.05, 0.66]} c="#e0812a" r={0.006} rough={0.6} />
          ))}
          {[-0.5, 0.2, 0.6].map((x, i) => (
            <B key={x} p={[x, 1.25 + (i % 2) * 0.1, 0]} s={[0.4, 0.26, 0.5]} c={BOX} r={0.01} rough={0.85} cast={false} />
          ))}
          <BeltRun len={1.9} rail="#9aa0a6" />
        </>
      )
    case 'chippack':
      // a clean-room line: white panels, a blue window run and filter units on the roof
      return (
        <>
          <Enclosed W={3} D={2} body="#e9ecef" hood="#f6f7f8" glass="#58a6ff" h={1.9} c={c} lamps={3} />
          {[-0.9, 0, 0.9].map((x) => (
            <B key={x} p={[x, 2.0, -0.2]} s={[0.6, 0.2, 0.9]} c="#cfd3d6" r={0.02} rough={0.5} cast={false} />
          ))}
        </>
      )
    case 'laminator':
      return (
        <>
          <Enclosed W={3} D={1} body="#2b2d31" hood="#3a3d42" glass="#9be7ff" h={1.3} c={c} lamps={2} />
          {/* rollers pressing a sheet */}
          {[-0.6, 0.6].map((x) => (
            <C key={x} p={[x, 1.38, 0]} r={[0.12, 0.12]} h={0.7} c={STEEL} seg={14} rot={[Math.PI / 2, 0, 0]} metal={0.8} rough={0.3} cast={false} />
          ))}
          <B p={[0, 1.31, 0]} s={[1.8, 0.01, 0.6]} c="#bfe0f2" glass={0.3} r={0} cast={false} />
        </>
      )
    case 'cellline':
      return (
        <>
          <Enclosed W={3} D={2} body="#3f4a3a" hood="#56634f" glass="#7cf29a" h={1.6} c={c} lamps={3} />
          {/* a rack of cells on top, standing like a tray of batteries */}
          {Array.from({ length: 10 }, (_, i) => (
            <C key={i} p={[-1.1 + (i % 5) * 0.55, 1.75, -0.3 + Math.floor(i / 5) * 0.4]} r={[0.1, 0.1]} h={0.3} c={i % 2 ? '#2b2d31' : '#3fae5a'} seg={10} cast={false} />
          ))}
        </>
      )
    case 'cnc':
      return (
        <>
          <B p={[0, 0.9, 0]} s={[1.9, 1.8, 1.7]} c="#d6d9dc" r={0.06} rough={0.45} />
          <B p={[0.15, 1.05, 0.856]} s={[1.1, 0.9, 0.012]} c="#bfe0f2" glass={0.25} r={0} cast={false} />
          <B p={[-0.75, 1.1, 0.86]} s={[0.3, 0.5, 0.02]} c="#15171a" r={0.01} glow="#55e39f" glowPower={0.5 * c.glow} cast={false} />
          <B p={[0, 1.86, 0]} s={[1.6, 0.12, 1.4]} c={YELLOW} r={0.02} rough={0.6} cast={false} />
          <Beacon p={[0.8, 1.92, -0.7]} on={c.running} glow={c.glow} />
        </>
      )
    case 'moulder':
      return (
        <>
          <B p={[0, 0.45, 0]} s={[1.9, 0.9, 0.8]} c="#2f5d8a" r={0.02} rough={0.5} />
          <C p={[-0.45, 1.2, 0]} r={[0.18, 0.18]} h={1.2} c={STEEL} seg={16} rot={[0, 0, Math.PI / 2]} metal={0.7} rough={0.3} />
          <C p={[-0.95, 1.45, 0]} r={[0.22, 0.12]} h={0.5} c="#c9ccd0" seg={14} />
          <B p={[0.5, 1.15, 0]} s={[0.7, 0.6, 0.7]} c="#d6a24f" r={0.02} rough={0.5} />
          <Beacon p={[0.85, 1.45, -0.3]} on={c.running} glow={c.glow} />
        </>
      )
    case 'cammod':
      return (
        <>
          <Enclosed W={2} D={1} body="#1f2226" hood="#2b2d31" glass="#ff9ec9" h={1.4} c={c} lamps={2} />
          <C p={[0.4, 1.5, 0]} r={[0.14, 0.14]} h={0.2} c="#0b0c0e" seg={16} cast={false} />
          <C p={[0.4, 1.61, 0]} r={[0.08, 0.08]} h={0.02} c="#1c2a44" glow="#5a7dff" glowPower={0.6} seg={16} cast={false} />
        </>
      )
    case 'psuline':
      return (
        <>
          <Enclosed W={2} D={1} body="#3a3d42" hood="#4a4e55" glass="#ffd166" h={1.3} c={c} lamps={2} />
          {[-0.5, 0, 0.5].map((x) => (
            <B key={x} p={[x, 1.38, 0]} s={[0.36, 0.16, 0.5]} c="#15171a" r={0.01} cast={false} />
          ))}
        </>
      )
    case 'workshop':
      return (
        <>
          <B p={[0, 0.45, -0.1]} s={[1.9, 0.08, 0.7]} c="#8a6a4a" r={0.01} rough={0.7} />
          {[-0.85, 0.85].map((x) => (
            <B key={x} p={[x, 0.22, -0.1]} s={[0.06, 0.44, 0.6]} c={STEEL} r={0.006} metal={0.7} />
          ))}
          <B p={[0, 1.2, -0.42]} s={[1.9, 1.0, 0.04]} c="#3a3d42" r={0.006} />
          {Array.from({ length: 6 }, (_, i) => (
            <B key={i} p={[-0.75 + i * 0.3, 1.25, -0.385]} s={[0.04, 0.3, 0.02]} c={i % 2 ? '#c9553d' : STEEL} r={0} cast={false} />
          ))}
          <B p={[0.6, 0.6, -0.1]} s={[0.3, 0.22, 0.3]} c="#c9553d" r={0.02} cast={false} />
        </>
      )
    case 'generator':
      return (
        <>
          <B p={[0, 0.9, 0]} s={[2.9, 1.8, 1.8]} c="#3f7d4d" r={0.04} rough={0.5} />
          {[-1, -0.3, 0.4].map((x) => (
            <B key={x} p={[x, 1.2, 0.906]} s={[0.5, 0.9, 0.012]} c="#2b2d31" r={0} cast={false} />
          ))}
          <C p={[1.1, 2.4, -0.4]} r={[0.14, 0.14]} h={1.2} c={STEEL} seg={12} metal={0.6} />
          <Beacon p={[-1.2, 1.8, -0.6]} on={c.running} glow={c.glow} />
        </>
      )
    case 'substation':
      return (
        <>
          <B p={[0, 0.05, 0]} s={[1.96, 0.1, 1.96]} c="#7d8388" r={0.006} rough={0.9} />
          {[-0.5, 0.5].map((x) => (
            <group key={x}>
              <B p={[x, 0.72, 0]} s={[0.6, 1.2, 0.8]} c="#9aa0a6" r={0.02} metal={0.4} rough={0.5} />
              {[-0.2, 0, 0.2].map((z) => (
                <C key={z} p={[x, 1.55, z]} r={[0.05, 0.08]} h={0.5} c="#c96b3d" seg={10} cast={false} />
              ))}
            </group>
          ))}
          {[-0.95, 0.95].map((x) => [-0.95, 0.95].map((z) => <B key={`${x}${z}`} p={[x, 0.9, z]} s={[0.04, 1.8, 0.04]} c={STEEL} r={0} cast={false} />))}
        </>
      )
    case 'solar':
      return (
        <>
          {[-1, 0, 1].map((z) => (
            <group key={z} position={[0, 0.9, z * 0.95]} rotation={[-0.45, 0, 0]}>
              <B p={[0, 0, 0]} s={[2.9, 0.05, 0.8]} c="#1c2a44" r={0.006} metal={0.4} rough={0.2} />
            </group>
          ))}
          {[-1.3, 1.3].map((x) => [-1, 0, 1].map((z) => <B key={`${x}${z}`} p={[x, 0.45, z * 0.95]} s={[0.05, 0.9, 0.05]} c={STEEL} r={0} cast={false} />))}
        </>
      )
  }
  return null
}

const DEEP = new Set(['conveyor_2', 'conveyor_3', 'splitter', 'arm', 'buffer', 'chippack', 'laminator', 'cellline', 'cnc', 'moulder', 'cammod', 'psuline', 'workshop', 'generator', 'substation', 'solar'])

/** The model for one factory item. */
export function FactoryItem({ kind, c }: { kind: string; c: FactoryCtx }) {
  return (
    <>
      {DEEP.has(kind) ? <DeepModel kind={kind} c={c} /> : <FactoryModel kind={kind} c={c} />}
      <Ports kind={kind} glow={Math.max(0.6, c.glow)} />
      <TierMark kind={kind} tier={c.tier} mods={c.mods} />
    </>
  )
}

function FactoryModel({ kind, c }: { kind: string; c: FactoryCtx }) {
  switch (kind) {
    case 'dock_in':
      return <Dock c={c} out={false} />
    case 'dock_out':
      return <Dock c={c} out />
    case 'conveyor':
      // a belt always runs along its own +X: turning it sets the way parts go. What rides on it is drawn by the line (factoryflow.tsx)
      return (
        <>
          <BeltRun len={1} />
          <Chevrons len={1} />
        </>
      )
    case 'smt':
      return (
        <>
          <B p={[0, 0.36, 0]} s={[2.9, 0.72, 0.9]} c="#d9dde1" r={0.015} rough={0.5} />
          <B p={[0, 1.12, 0]} s={[2.9, 0.8, 0.9]} c="#eceff2" r={0.02} rough={0.4} />
          {[-0.95, 0, 0.95].map((x, i) => (
            <group key={x}>
              <B p={[x, 1.14, 0.452]} s={[0.8, 0.5, 0.012]} c="#0c1622" r={0} glow="#3aa0ff" glowPower={(c.running ? 0.9 : 0.25) * c.glow} rough={0.1} cast={false} />
              <B p={[x, 0.5, 0.452]} s={[0.6, 0.3, 0.012]} c="#2b2d31" r={0} cast={false} />
              <B p={[x + 0.28, 0.5, 0.46]} s={[0.04, 0.2, 0.01]} c={STEEL} r={0} metal={0.9} rough={0.3} cast={false} />
              <B p={[x, 1.535, 0]} s={[0.5, 0.03, 0.5]} c="#3a3d42" r={0.006} cast={false} />
              <C p={[x, 1.62, 0]} r={[0.12, 0.16]} h={0.14} c={STEEL} seg={12} metal={0.6} rough={0.4} cast={false} />
              {i === 1 && <Beacon p={[x + 0.4, 1.52, -0.3]} on={c.running} glow={c.glow} />}
            </group>
          ))}
          <B p={[-1.455, 0.82, 0]} s={[0.012, 0.16, 0.56]} c="#0b0c0e" r={0} cast={false} />
          <B p={[1.455, 0.82, 0]} s={[0.012, 0.16, 0.56]} c="#0b0c0e" r={0} cast={false} />
        </>
      )
    case 'robot':
      return (
        <>
          {/* fenced cell with two arms working over a belt */}
          <B p={[0, 0.02, 0]} s={[1.96, 0.04, 1.96]} c="#2b2d31" r={0.006} rough={0.8} />
          {[-0.95, 0.95].map((x) => [-0.95, 0.95].map((z) => <B key={`${x}${z}`} p={[x, 0.92, z]} s={[0.06, 1.76, 0.06]} c={YELLOW} r={0.008} rough={0.6} />))}
          {[-0.95, 0.95].map((z) => (
            <group key={z}>
              <B p={[0, 1.77, z]} s={[1.84, 0.05, 0.05]} c={YELLOW} r={0.008} rough={0.6} cast={false} />
              <B p={[0, 0.98, z]} s={[1.84, 1.5, 0.012]} c="#bfe0f2" glass={0.16} r={0} cast={false} />
            </group>
          ))}
          {[-0.95, 0.95].map((x) => (
            <B key={x} p={[x, 1.77, 0]} s={[0.05, 0.05, 1.84]} c={YELLOW} r={0.008} rough={0.6} cast={false} />
          ))}
          <BeltRun len={1.84} />
          {[-0.45, 0.45].map((x, i) => (
            <group key={x} position={[x, 0.04, i ? 0.6 : -0.6]} rotation={[0, i ? Math.PI : 0, 0]}>
              <C p={[0, 0.15, 0]} r={[0.16, 0.2]} h={0.3} c="#2b2d31" seg={14} />
              <C p={[0, 0.4, 0]} r={[0.11, 0.11]} h={0.2} c="#e0812a" seg={12} rough={0.5} />
              <group position={[0, 0.5, 0]} rotation={[0.55, 0, 0]}>
                <B p={[0, 0.3, 0]} s={[0.13, 0.6, 0.13]} c="#e0812a" r={0.03} rough={0.5} />
                <group position={[0, 0.6, 0]} rotation={[0.9, 0, 0]}>
                  <S p={[0, 0, 0]} r={0.09} c="#2b2d31" detail={2} cast={false} />
                  <B p={[0, 0.24, 0]} s={[0.1, 0.48, 0.1]} c="#e0812a" r={0.025} rough={0.5} />
                  <B p={[0, 0.52, 0]} s={[0.14, 0.08, 0.06]} c={STEEL} r={0.01} metal={0.9} rough={0.3} cast={false} />
                </group>
              </group>
            </group>
          ))}
          <Beacon p={[0.95, 1.8, 0.95]} on={c.running} glow={c.glow} />
        </>
      )
    case 'manual':
      return (
        <>
          <B p={[0, 0.39, -0.16]} s={[0.05, 0.78, 0.5]} c={STEEL} r={0.008} metal={0.7} rough={0.4} cast={false} />
          {[-0.42, 0.42].map((x) => (
            <B key={x} p={[x, 0.39, -0.16]} s={[0.05, 0.78, 0.5]} c={STEEL} r={0.008} metal={0.7} rough={0.4} />
          ))}
          <B p={[0, BELT, -0.16]} s={[0.94, 0.04, 0.58]} c="#3d6a54" r={0.008} rough={0.6} />
          <B p={[0, 1.25, -0.42]} s={[0.94, 0.86, 0.03]} c={CHARCOAL} r={0.006} />
          <B p={[-0.2, 0.86, -0.12]} s={[0.2, 0.08, 0.14]} c="#101114" r={0.01} cast={false} />
          <B p={[0.25, 0.85, -0.2]} s={[0.22, 0.06, 0.16]} c={BOX} r={0.008} cast={false} />
          <C p={[0.3, 1.0, -0.38]} r={[0.012, 0.012]} h={0.36} c={STEEL} seg={8} cast={false} />
          <C p={[0.3, 1.2, -0.3]} r={[0.05, 0.09]} h={0.1} c={DARK} glow="#fff1d6" glowPower={0.6 * c.glow} seg={12} rot={[0.6, 0, 0]} cast={false} />
          <C p={[0, 0.015, 0.3]} r={[0.17, 0.19]} h={0.03} c={STEEL} seg={14} cast={false} />
          <C p={[0, 0.26, 0.3]} r={[0.02, 0.02]} h={0.46} c={STEEL} seg={8} cast={false} />
          <C p={[0, 0.5, 0.3]} r={[0.16, 0.16]} h={0.04} c={DARK} seg={14} />
          {c.running && !c.live && <Person who={CREW[c.seed % 3]} p={[0, 0.02, 0.3]} />}
        </>
      )
    case 'test':
      return (
        <>
          <B p={[0, 0.36, 0]} s={[0.94, 0.72, 0.9]} c="#d9dde1" r={0.012} rough={0.5} />
          <B p={[0, 1.3, -0.3]} s={[0.94, 1.16, 0.3]} c="#22262b" r={0.012} rough={0.5} />
          <B p={[0, 1.35, -0.146]} s={[0.7, 0.5, 0.008]} c="#06140c" r={0} glow="#55e39f" glowPower={(c.running ? 1 : 0.3) * c.glow} cast={false} />
          <B p={[0, 0.76, 0.1]} s={[0.952, 0.08, 0.6]} c="#3a3d42" r={0.008} metal={0.5} rough={0.5} />
          <B p={[0, 0.83, 0.1]} s={[0.4, 0.06, 0.4]} c="#101114" r={0.01} cast={false} />
          {[-0.3, 0.3].map((x) => (
            <C key={x} p={[x, 0.96, 0.1]} r={[0.02, 0.02]} h={0.32} c={STEEL} seg={8} metal={0.9} rough={0.3} cast={false} />
          ))}
          <B p={[0, 1.13, 0.1]} s={[0.7, 0.04, 0.3]} c={YELLOW} r={0.008} cast={false} />
          {/* a bin on the front for the units that fail */}
          <B p={[0.22, 0.03, 0.557]} s={[0.392, 0.06, 0.19]} c="#7a1f24" r={0.006} rough={0.7} cast={false} />
          {[-0.19, 0.19].map((x) => (
            <B key={x} p={[0.22 + x, 0.2, 0.56]} s={[0.02, 0.34, 0.2]} c="#a3262c" r={0.004} rough={0.7} cast={false} />
          ))}
          <B p={[0.22, 0.2, 0.65]} s={[0.4, 0.34, 0.02]} c="#a3262c" r={0.004} rough={0.7} cast={false} />
          <Beacon p={[0.36, 1.88, -0.3]} on={c.running} glow={c.glow} />
        </>
      )
    case 'pack':
      return (
        <>
          <B p={[0, 0.36, 0]} s={[1.92, 0.72, 0.9]} c="#d9dde1" r={0.012} rough={0.5} />
          <B p={[0, 0.76, 0]} s={[1.92, 0.08, 0.64]} c="#3a3d42" r={0.008} metal={0.5} rough={0.5} />
          <B p={[-0.4, 1.3, 0]} s={[0.9, 1.0, 0.86]} c="#2f5d8a" r={0.02} rough={0.5} />
          <B p={[-0.4, 1.3, 0.432]} s={[0.6, 0.6, 0.01]} c="#bfe0f2" glass={0.3} r={0} cast={false} />
          <B p={[-0.855, 0.95, 0]} s={[0.012, 0.28, 0.5]} c="#0b0c0e" r={0} cast={false} />
          <B p={[0.055, 0.95, 0]} s={[0.012, 0.28, 0.5]} c="#0b0c0e" r={0} cast={false} />
          {[0.35, 0.72].map((x, i) => (
            <B key={x} p={[x, 0.9 + i * 0.02, 0]} s={[0.24, 0.2 + i * 0.04, 0.26]} c={BOX} r={0.008} rough={0.85} cast={false} />
          ))}
          <C p={[0.9, 1.25, -0.38]} r={[0.02, 0.02]} h={0.9} c={STEEL} seg={8} cast={false} />
          <C p={[0.9, 1.6, -0.2]} r={[0.14, 0.14]} h={0.1} c="#c9b28a" seg={16} rot={[Math.PI / 2, 0, 0]} cast={false} />
          <Beacon p={[-0.4, 1.8, -0.3]} on={c.running} glow={c.glow} />
        </>
      )
    case 'rack':
      return (
        <>
          {[-0.92, 0, 0.92].map((x) => [-0.36, 0.36].map((z) => <B key={`${x}${z}`} p={[x, 1.5, z]} s={[0.06, 3.0, 0.06]} c="#2f5d8a" r={0.008} rough={0.5} />))}
          {[0.14, 1.1, 2.06].map((y, row) => (
            <group key={y}>
              <B p={[0, y, 0]} s={[1.884, 0.06, 0.8]} c="#e0812a" r={0.008} rough={0.6} />
              {[-0.62, -0.02, 0.56].map((x, i) => {
                if (hash(c.seed + row * 3 + i * 7) > 0.15 + (c.fill ?? 0.7) * 0.85) return null
                const h = 0.3 + hash(c.seed + row * 5 + i) * 0.4
                return <B key={x} p={[x, y + 0.03 + h / 2, 0]} s={[0.5, h, 0.6]} c={i === 1 ? '#8c8e90' : BOX} r={0.01} rough={0.85} />
              })}
            </group>
          ))}
        </>
      )
    case 'pallets':
      return (
        <>
          {[-0.36, 0, 0.36].map((x) => (
            <B key={x} p={[x, 0.05, 0]} s={[0.1, 0.1, 0.9]} c="#a5855f" r={0.006} rough={0.9} cast={false} />
          ))}
          <B p={[0, 0.115, 0]} s={[0.9, 0.03, 0.9]} c="#b6966e" r={0.006} rough={0.9} />
          {[[-0.21, 0.31, -0.2, 0.42, 0.36], [0.22, 0.29, -0.2, 0.4, 0.32], [-0.2, 0.3, 0.22, 0.42, 0.34], [0.22, 0.33, 0.22, 0.4, 0.4], [0, 0.68, 0, 0.5, 0.3]].map(([x, y, z, w, h], i) => (
            <B key={i} p={[x, y, z]} s={[w, h, 0.4]} c={i % 2 ? '#c49a62' : BOX} r={0.008} rough={0.85} />
          ))}
        </>
      )
    case 'ug_in':
    case 'ug_out':
      return (
        <>
          <BeltRun len={1} />
          <B p={[kind === 'ug_in' ? 0.3 : -0.3, 0.2, 0]} s={[0.4, 0.34, 0.9]} c="#3a3d42" r={0.02} rough={0.6} />
        </>
      )
    case 'lane':
      return <B p={[0, 0.008, 0]} s={[0.94, 0.012, 0.94]} c={YELLOW} r={0} rough={0.8} cast={false} />
    case 'forklift':
      return (
        <>
          {[-0.36, 0.36].map((x) => [-0.55, 0.3].map((z) => <C key={`${x}${z}`} p={[x, 0.2, z]} r={[0.2, 0.2]} h={0.16} c="#15171a" seg={14} rot={[0, 0, Math.PI / 2]} />))}
          <B p={[0, 0.5, -0.2]} s={[0.8, 0.5, 1.2]} c={YELLOW} r={0.04} rough={0.5} />
          <B p={[0, 0.72, -0.62]} s={[0.76, 0.4, 0.34]} c="#2b2d31" r={0.03} rough={0.6} />
          {[-0.36, 0.36].map((x) => [-0.42, 0.3].map((z) => <B key={`${x}${z}`} p={[x, 1.35, z]} s={[0.04, 1.2, 0.04]} c={DARK} r={0.008} cast={false} />))}
          <B p={[0, 1.97, -0.06]} s={[0.8, 0.04, 0.8]} c={DARK} r={0.008} />
          <B p={[0, 0.86, -0.12]} s={[0.42, 0.1, 0.42]} c="#15171a" r={0.03} cast={false} />
          <B p={[0, 1.05, -0.33]} s={[0.42, 0.44, 0.08]} c="#15171a" r={0.03} cast={false} />
          {[-0.2, 0.2].map((x) => (
            <group key={x}>
              <B p={[x, 1.1, 0.46]} s={[0.07, 2.0, 0.08]} c={DARK} r={0.008} />
              <B p={[x, 0.14, 0.786]} s={[0.1, 0.04, 0.708]} c={STEEL} r={0.006} metal={0.8} rough={0.4} />
            </group>
          ))}
          <B p={[0, 0.3, 0.52]} s={[0.56, 0.4, 0.04]} c={DARK} r={0.008} cast={false} />
        </>
      )
    case 'console':
      return (
        <>
          <B p={[0, 0.38, -0.12]} s={[1.92, 0.76, 0.6]} c="#2a3038" r={0.012} rough={0.5} />
          <B p={[0, 0.8, 0.02]} s={[1.92, 0.08, 0.4]} c="#3a424c" r={0.01} rot={[0.25, 0, 0]} />
          {[-0.62, 0, 0.62].map((x, i) => (
            <group key={x}>
              <B p={[x, 1.16, -0.34]} s={[0.58, 0.4, 0.03]} c="#0c0d0f" r={0.008} />
              <B p={[x, 1.16, -0.321]} s={[0.54, 0.36, 0.008]} c="#081420" r={0} glow={['#3aa0ff', '#55e39f', '#ffb347'][i]} glowPower={0.8 * c.glow} cast={false} />
              <B p={[x, 0.88, -0.34]} s={[0.05, 0.2, 0.022]} c={DARK} r={0.006} cast={false} />
            </group>
          ))}
          {[-0.4, 0.4].map((x) => (
            <group key={x} position={[x, 0, 0.5]}>
              <C p={[0, 0.03, 0]} r={[0.25, 0.27]} h={0.04} c={DARK} seg={5} />
              <C p={[0, 0.23, 0]} r={[0.03, 0.03]} h={0.36} c={STEEL} seg={8} cast={false} />
              <B p={[0, 0.45, 0]} s={[0.44, 0.08, 0.42]} c={CHARCOAL} r={0.03} />
              <B p={[0, 0.76, 0.2]} s={[0.42, 0.5, 0.06]} c={CHARCOAL} r={0.03} />
            </group>
          ))}
        </>
      )
    case 'qa':
      return (
        <>
          {[-0.88, 0.88].map((x) => (
            <B key={x} p={[x, 0.43, 0]} s={[0.06, 0.86, 0.7]} c={STEEL} r={0.008} metal={0.7} rough={0.4} />
          ))}
          <B p={[0, 0.88, 0]} s={[1.92, 0.04, 0.8]} c={WHITE} r={0.008} rough={0.4} />
          <B p={[-0.5, 1.02, -0.1]} s={[0.5, 0.24, 0.4]} c="#d9dde1" r={0.015} rough={0.4} />
          <C p={[-0.5, 1.24, -0.1]} r={[0.14, 0.14]} h={0.2} c="#bfe0f2" glass={0.3} seg={16} cast={false} />
          <C p={[0.2, 0.92, 0.1]} r={[0.09, 0.1]} h={0.04} c={DARK} seg={14} cast={false} />
          <C p={[0.2, 1.1, 0.1]} r={[0.012, 0.012]} h={0.32} c={STEEL} seg={8} cast={false} />
          <C p={[0.2, 1.28, 0.1]} r={[0.11, 0.11]} h={0.03} c="#fff6e0" glow="#fff1d6" glowPower={1.1 * c.glow} seg={16} cast={false} />
          {[0.55, 0.7].map((x) => (
            <B key={x} p={[x, 0.91, 0.1]} s={[0.08, 0.016, 0.16]} c="#26282c" r={0.006} cast={false} />
          ))}
        </>
      )
    case 'lockers':
      return (
        <>
          <B p={[0, 0.95, -0.2]} s={[1.92, 1.9, 0.5]} c="#4f7a8c" r={0.012} rough={0.5} metal={0.3} />
          {Array.from({ length: 6 }, (_, i) => (
            <group key={i}>
              <B p={[-0.8 + i * 0.32, 0.95, 0.052]} s={[0.012, 1.8, 0.008]} c="#22323a" r={0} cast={false} />
              <B p={[-0.7 + i * 0.32, 1.1, 0.056]} s={[0.03, 0.08, 0.012]} c={STEEL} r={0.004} metal={0.9} rough={0.3} cast={false} />
              <B p={[-0.64 + i * 0.32, 1.6, 0.052]} s={[0.18, 0.06, 0.008]} c="#22323a" r={0} cast={false} />
            </group>
          ))}
          <B p={[0, 0.2, 0.28]} s={[1.7, 0.05, 0.3]} c="#b28d66" r={0.01} />
          {[-0.75, 0.75].map((x) => (
            <B key={x} p={[x, 0.09, 0.28]} s={[0.05, 0.18, 0.26]} c={DARK} r={0.008} cast={false} />
          ))}
        </>
      )
    case 'canteen':
      return (
        <>
          {[-0.8, 0.8].map((x) => (
            <B key={x} p={[x, 0.36, 0]} s={[0.06, 0.72, 0.5]} c={DARK} r={0.008} />
          ))}
          <B p={[0, 0.74, 0]} s={[1.9, 0.04, 0.6]} c="#d9c3a0" r={0.01} rough={0.5} />
          {[-0.42, 0.42].map((z) => (
            <group key={z}>
              <B p={[0, 0.44, z]} s={[1.8, 0.04, 0.22]} c="#b28d66" r={0.01} rough={0.6} />
              {[-0.8, 0.8].map((x) => (
                <B key={x} p={[x, 0.21, z]} s={[0.05, 0.42, 0.2]} c={DARK} r={0.008} cast={false} />
              ))}
            </group>
          ))}
          <C p={[-0.4, 0.8, 0.05]} r={[0.035, 0.03]} h={0.08} c="#f4f4f4" seg={12} cast={false} />
          <B p={[0.3, 0.775, -0.05]} s={[0.3, 0.03, 0.2]} c="#c9553d" r={0.008} cast={false} />
        </>
      )
    case 'vending':
      return (
        <>
          <B p={[0, 0.92, -0.06]} s={[0.84, 1.84, 0.72]} c="#1f2a36" r={0.015} rough={0.5} metal={0.3} />
          <B p={[-0.1, 1.1, 0.304]} s={[0.52, 1.2, 0.008]} c="#0c1218" r={0} glow="#cfe6ff" glowPower={0.5 * c.glow} rough={0.1} cast={false} />
          {Array.from({ length: 12 }, (_, i) => (
            <B key={i} p={[-0.28 + (i % 4) * 0.12, 0.7 + Math.floor(i / 4) * 0.34, 0.31]} s={[0.07, 0.16, 0.006]} c={['#d65f7c', '#f2b631', '#58b98a', '#4f8fd6'][(i + c.seed) % 4]} r={0} cast={false} />
          ))}
          <B p={[0.29, 1.2, 0.304]} s={[0.14, 0.3, 0.008]} c="#2b2d31" r={0} cast={false} />
        </>
      )
    case 'tank':
      return (
        <>
          {[-0.6, 0.6].map((x) => [-0.6, 0.6].map((z) => <B key={`${x}${z}`} p={[x, 0.4, z]} s={[0.1, 0.8, 0.1]} c={STEEL} r={0.01} metal={0.7} rough={0.4} />))}
          <C p={[0, 2.0, 0]} r={[0.92, 0.92]} h={2.5} c="#c9ccd0" seg={24} metal={0.6} rough={0.4} />
          <C p={[0, 0.65, 0]} r={[0.92, 0.5]} h={0.3} c="#b6babe" seg={24} metal={0.6} rough={0.4} />
          <C p={[0, 3.35, 0]} r={[0.3, 0.92]} h={0.2} c="#b6babe" seg={24} metal={0.6} rough={0.4} />
          {[1.2, 2.0, 2.8].map((y) => (
            <C key={y} p={[0, y, 0]} r={[0.935, 0.935]} h={0.05} c="#8a8f95" seg={24} metal={0.7} rough={0.4} cast={false} />
          ))}
          <B p={[0.95, 1.8, 0]} s={[0.04, 3.0, 0.3]} c={YELLOW} r={0.006} cast={false} />
        </>
      )
    case 'truck':
      return (
        <>
          {[-1.42, 1.42].map((x) => (
            <B key={x} p={[x, 0.006, 0]} s={[0.1, 0.012, 7.9]} c={YELLOW} r={0} rough={0.9} cast={false} />
          ))}
          {!c.away && <Lorry seed={c.seed} />}
        </>
      )
    case 'otree':
      return <Tree seed={c.seed} />
    case 'lamp':
      return (
        <>
          <C p={[0, 0.06, 0]} r={[0.1, 0.13]} h={0.12} c={DARK} seg={12} />
          <C p={[0, 2.5, 0]} r={[0.04, 0.06]} h={4.76} c={STEEL} seg={8} metal={0.6} rough={0.4} />
          <B p={[0, 4.9, 0.3]} s={[0.16, 0.06, 0.8]} c={STEEL} r={0.012} metal={0.6} rough={0.4} />
          <B p={[0, 4.864, 0.45]} s={[0.12, 0.012, 0.4]} c="#fff6e0" r={0} glow="#ffe9c2" glowPower={0.3 + 2 * c.glow} cast={false} />
        </>
      )
  }
  return <B p={[0, 0.25, 0]} s={[0.8, 0.5, 0.8]} c="#ff00ff" />
}
