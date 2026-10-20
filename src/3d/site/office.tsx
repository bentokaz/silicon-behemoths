// Office furniture and campus grounds. One unit is one metre and one floor
// tile. Each model is centred on its footprint with its front toward +Z, and
// every part rests on the floor or on another part.
import type { Product } from '../../sim/types'
import { DeviceProp } from './props'
import { B, C, CHARCOAL, Car, Chair, Ring, DARK, FABRIC, LEAF, OAK_PALE, type PersonLook, Person, Plant, S, STEEL, Sign, Tree, WALNUT, WHITE, WOOD, hash } from './kit'

export interface OfficeCtx {
  /** Who sits here, if anyone. */
  who?: PersonLook
  /** How strongly screens and lamps glow (higher at night). */
  glow: number
  company: string
  logo?: string
  /** Company colour, for flags and accents. */
  color: string
  /** The devices to show on this item: prototypes on the benches, the latest in the showcase. */
  devices?: Product[]
  seed: number
  /** Someone works here but is drawn by the view, walking about: the chair is left empty, and the screen and lamp are left dark for the view to light while they are in (see lights.tsx). */
  on?: boolean
  /** The view draws this item's lights, screen or turning device itself. */
  live?: boolean
  /** How far along the device shown here is, 0-1, while it is in development. */
  progress?: number
  /** Work is going on here right now. */
  busy?: boolean
}

type V3 = [number, number, number]

/** A monitor standing on a surface at height y. */
function Monitor({ x = 0, z = -0.34, y, w = 0.52, glow, on }: { x?: number; z?: number; y: number; w?: number; glow: number; on: boolean }) {
  return (
    <group position={[x, y, z]}>
      <C p={[0, 0.008, 0]} r={[0.09, 0.1]} h={0.016} c={DARK} seg={16} cast={false} />
      <B p={[0, 0.12, 0.012]} s={[0.035, 0.22, 0.03]} c={DARK} r={0.008} cast={false} />
      <B p={[0, 0.32, 0]} s={[w, 0.31, 0.024]} c="#0c0d0f" r={0.008} rough={0.35} />
      <B p={[0, 0.32, 0.0135]} s={[w - 0.024, 0.286, 0.006]} c="#0f1b2a" r={0} glow={on ? '#8fbdea' : undefined} glowPower={0.75 * glow} rough={0.2} cast={false} />
    </group>
  )
}

/** An open laptop resting on a surface at p. */
function Laptop({ p, glow }: { p: V3; glow: number }) {
  return (
    <group position={p}>
      <B p={[0, 0.008, 0]} s={[0.3, 0.016, 0.21]} c="#b9bcc0" r={0.006} metal={0.7} rough={0.35} cast={false} />
      <group position={[0, 0.016, -0.105]} rotation={[-0.25, 0, 0]}>
        <B p={[0, 0.1, 0]} s={[0.3, 0.2, 0.012]} c="#b9bcc0" r={0.006} metal={0.7} rough={0.35} cast={false} />
        <B p={[0, 0.1, 0.0075]} s={[0.28, 0.18, 0.004]} c="#102030" r={0} glow="#9ec3ea" glowPower={0.7 * glow} cast={false} />
      </group>
    </group>
  )
}

/** A desk with a screen, keyboard and drawer unit. `height` is the top surface. */
function Desk({ c, top = WOOD, height = 0.74, chair = true, wide = false }: { c: OfficeCtx; top?: string; height?: number; chair?: boolean; wide?: boolean }) {
  const w = wide ? 0.96 : 0.94
  return (
    <>
      <B p={[0, height - 0.02, -0.16]} s={[w, 0.04, 0.56]} c={top} r={0.012} rough={0.5} />
      {[-0.42, 0.42].map((x) => (
        <group key={x}>
          <B p={[x, (height - 0.04) / 2 + 0.015, -0.16]} s={[0.045, height - 0.07, 0.06]} c={WHITE} r={0.008} metal={0.5} rough={0.4} />
          <B p={[x, 0.015, -0.16]} s={[0.06, 0.03, 0.52]} c={WHITE} r={0.008} metal={0.5} rough={0.4} cast={false} />
        </group>
      ))}
      <B p={[0, height - 0.16, -0.41]} s={[0.795, 0.24, 0.018]} c={CHARCOAL} r={0.004} cast={false} />
      <Monitor y={height} glow={c.glow} on={!!c.who} />
      <B p={[-0.02, height + 0.009, -0.09]} s={[0.32, 0.018, 0.11]} c="#26282c" r={0.006} cast={false} />
      <B p={[0.25, height + 0.012, -0.08]} s={[0.055, 0.024, 0.09]} c="#26282c" r={0.01} cast={false} />
      <C p={[-0.34, height + 0.045, -0.04]} r={[0.035, 0.03]} h={0.09} c={hash(c.seed) > 0.5 ? '#e9e4da' : '#c9553d'} seg={12} cast={false} />
      {height < 0.9 && <B p={[0.26, 0.27, -0.2]} s={[0.26, 0.5, 0.42]} c={WHITE} r={0.01} metal={0.3} rough={0.5} />}
      {chair && <Chair />}
    </>
  )
}

function Sofa({ w = 1.84, color = FABRIC }: { w?: number; color?: string }) {
  const seats = Math.max(1, Math.round(w / 0.8))
  const inner = w - 0.36
  return (
    <>
      {[-1, 1].map((sx) => [-1, 1].map((sz) => <C key={`${sx}${sz}`} p={[sx * (w / 2 - 0.1), 0.05, sz * 0.3]} r={[0.025, 0.02]} h={0.1} c={WALNUT} seg={8} cast={false} />))}
      <B p={[0, 0.2, 0]} s={[w, 0.2, 0.8]} c={color} r={0.05} rough={1} />
      <B p={[0, 0.5, 0.31]} s={[w, 0.5, 0.18]} c={color} r={0.06} rough={1} />
      <B p={[-w / 2 + 0.09, 0.42, -0.04]} s={[0.18, 0.34, 0.72]} c={color} r={0.06} rough={1} />
      <B p={[w / 2 - 0.09, 0.42, -0.04]} s={[0.18, 0.34, 0.72]} c={color} r={0.06} rough={1} />
      {Array.from({ length: seats }, (_, i) => (
        <B key={i} p={[-inner / 2 + ((i + 0.5) * inner) / seats, 0.36, -0.06]} s={[inner / seats - 0.02, 0.13, 0.56]} c={color} r={0.05} rough={1} cast={false} />
      ))}
    </>
  )
}

/** A small lit gauge: how far along the thing beside it is. Stands upright, or lies flat on a table. */
function Progress({ p, w, value, glow, flat = false }: { p: V3; w: number; value: number; glow: number; flat?: boolean }) {
  const v = Math.min(1, Math.max(0.04, value))
  const h = 0.05
  return (
    <group position={p} rotation={[flat ? -Math.PI / 2 : 0, 0, 0]}>
      <B p={[0, 0, 0]} s={[w, h, 0.012]} c="#14171b" r={0} cast={false} />
      <B p={[-(w * (1 - v)) / 2, 0, 0.008]} s={[w * v, h * 0.62, 0.006]} c="#2a1608" r={0} glow="#ff8a3c" glowPower={0.9 + 0.3 * glow} cast={false} />
    </group>
  )
}

const RUGS = ['#8c3b3b', '#31506b', '#5a6b3f', '#6a5a7a']
const BOOKS = ['#c9553d', '#2f6f8f', '#e9e4da', '#3f7d4d', '#d6a24f', '#4a5568', '#8a5a44']

/** The model for one office item. */
export function OfficeItem({ kind, c }: { kind: string; c: OfficeCtx }) {
  switch (kind) {
    case 'desk':
      return (
        <>
          <Desk c={c} />
          {c.who && <Person who={c.who} p={[0, 0, 0.24]} />}
        </>
      )
    case 'standing':
      return (
        <>
          <Desk c={c} top={OAK_PALE} height={1.1} chair={false} />
          <B p={[0, 0.012, 0.28]} s={[0.6, 0.024, 0.4]} c="#2b2f36" r={0.01} rough={1} cast={false} />
          {c.who && <Person who={c.who} pose="stand" arms="desk" p={[0, 0.024, 0.22]} />}
        </>
      )
    case 'helpdesk':
      return (
        <>
          <Desk c={c} top="#e9e6e0" wide />
          <Monitor x={0.3} z={-0.33} y={0.74} w={0.3} glow={c.glow} on={!!c.who} />
          <B p={[-0.33, 0.8, -0.3]} s={[0.1, 0.12, 0.1]} c={DARK} r={0.02} cast={false} />
          {!c.live && <C p={[-0.33, 0.9, -0.3]} r={[0.02, 0.02]} h={0.08} c="#3fe08a" glow="#3fe08a" glowPower={0.8 * c.glow} seg={8} cast={false} />}
          {c.who && <Person who={c.who} p={[0, 0, 0.24]} />}
        </>
      )
    case 'exec':
      return (
        <>
          <B p={[0, 0.74, -0.12]} s={[1.9, 0.05, 0.74]} c={WALNUT} r={0.02} rough={0.35} />
          <B p={[-0.86, 0.3575, -0.12]} s={[0.06, 0.715, 0.7]} c={WALNUT} r={0.008} rough={0.4} />
          <B p={[0.62, 0.3575, -0.12]} s={[0.54, 0.715, 0.7]} c={WALNUT} r={0.008} rough={0.4} />
          <B p={[-0.12, 0.48, -0.455]} s={[1.42, 0.47, 0.022]} c={WALNUT} r={0.004} rough={0.4} cast={false} />
          {[0.2, 0.45].map((y) => (
            <B key={y} p={[0.62, y, 0.235]} s={[0.18, 0.02, 0.014]} c="#c9a25a" r={0.004} metal={0.9} rough={0.3} cast={false} />
          ))}
          <Monitor x={-0.25} z={-0.3} y={0.765} w={0.7} glow={c.glow} on={!!c.who} />
          <Laptop p={[0.5, 0.765, -0.14]} glow={c.glow} />
          <C p={[-0.78, 0.775, -0.34]} r={[0.07, 0.08]} h={0.02} c={STEEL} metal={0.9} rough={0.3} seg={12} cast={false} />
          <C p={[-0.78, 0.94, -0.34]} r={[0.012, 0.012]} h={0.31} c={STEEL} metal={0.9} rough={0.3} seg={8} cast={false} />
          <C p={[-0.78, 1.15, -0.34]} r={[0.08, 0.13]} h={0.14} c="#e8dcc0" glow={c.on ? undefined : '#ffe2a8'} glowPower={0.8 * c.glow} seg={16} cast={false} />
          <Chair color="#3a2a22" x={-0.2} z={0.3} />
          {c.who && <Person who={c.who} p={[-0.2, 0, 0.3]} />}
        </>
      )
    case 'bench':
      return (
        <>
          {[-0.88, 0.88].map((x) => (
            <B key={x} p={[x, 0.435, -0.02]} s={[0.06, 0.87, 0.72]} c={STEEL} r={0.008} metal={0.8} rough={0.35} />
          ))}
          <B p={[0, 0.3, -0.02]} s={[1.7, 0.03, 0.66]} c={STEEL} r={0.006} metal={0.8} rough={0.35} cast={false} />
          <B p={[0, 0.89, -0.02]} s={[1.92, 0.04, 0.8]} c="#d9dde1" r={0.01} metal={0.5} rough={0.3} />
          {/* reagent shelf on uprights at the back */}
          {[-0.9, 0.9].map((x) => (
            <B key={x} p={[x, 1.18, -0.38]} s={[0.03, 0.54, 0.03]} c={STEEL} r={0.006} metal={0.8} rough={0.35} cast={false} />
          ))}
          <B p={[0, 1.465, -0.33]} s={[1.86, 0.03, 0.2]} c="#d9dde1" r={0.006} metal={0.5} rough={0.3} />
          {[-0.6, -0.48, 0.66, 0.78].map((x, i) => (
            <C key={x} p={[x, 1.55, -0.33]} r={[0.035, 0.045]} h={0.14} c={['#9fe3c4', '#f2b631', '#7fb6ea', '#e58fb0'][i]} glass={0.6} seg={12} cast={false} />
          ))}
          {/* analyser, sample tray and a microscope */}
          <B p={[-0.5, 1.06, -0.12]} s={[0.46, 0.3, 0.38]} c="#eceff2" r={0.02} rough={0.4} />
          <B p={[-0.5, 1.08, 0.073]} s={[0.26, 0.17, 0.008]} c="#06140c" r={0} glow="#55e39f" glowPower={(c.busy === false ? 0.2 : c.busy ? 1.4 : 0.9) * c.glow} cast={false} />
          {c.busy && <B p={[0.08, 0.975, 0.06]} s={[0.3, 0.03, 0.24]} c="#0d2a1c" r={0.004} glow="#55e39f" glowPower={0.7 * c.glow} cast={false} />}
          <B p={[0.08, 0.935, 0.06]} s={[0.36, 0.05, 0.3]} c="#2f6b4c" r={0.006} rough={0.5} cast={false} />
          <C p={[0.55, 0.945, 0.08]} r={[0.08, 0.1]} h={0.07} c={DARK} seg={16} cast={false} />
          <B p={[0.55, 1.1, 0.03]} s={[0.05, 0.26, 0.05]} c={STEEL} r={0.01} metal={0.9} rough={0.3} cast={false} />
          <C p={[0.55, 1.2, 0.1]} r={[0.03, 0.04]} h={0.14} c={DARK} seg={12} rot={[0.5, 0, 0]} cast={false} />
          {/* stool */}
          <C p={[0.1, 0.015, 0.56]} r={[0.17, 0.19]} h={0.03} c={STEEL} metal={0.8} rough={0.35} seg={16} cast={false} />
          <C p={[0.1, 0.3, 0.56]} r={[0.022, 0.022]} h={0.54} c={STEEL} metal={0.8} rough={0.35} seg={8} cast={false} />
          <C p={[0.1, 0.595, 0.56]} r={[0.17, 0.17]} h={0.05} c={CHARCOAL} seg={16} />
        </>
      )
    case 'devrig':
      return (
        <>
          <B p={[0, 0.45, -0.08]} s={[0.92, 0.9, 0.6]} c={WHITE} r={0.012} rough={0.5} />
          <B p={[0, 0.915, -0.08]} s={[0.94, 0.03, 0.64]} c="#2b2d31" r={0.008} rough={0.3} />
          <B p={[0, 1.36, -0.37]} s={[0.92, 0.86, 0.04]} c={CHARCOAL} r={0.006} />
          {Array.from({ length: 6 }, (_, i) => (
            <group key={i} position={[-0.28 + (i % 3) * 0.28, 1.17 + Math.floor(i / 3) * 0.36, -0.34]}>
              <B p={[0, 0, 0]} s={[0.13, 0.26, 0.02]} c="#101114" r={0.01} cast={false} />
              <B p={[0, 0, 0.012]} s={[0.115, 0.24, 0.006]} c="#101820" r={0} glow={['#7fd1ff', '#ffd27f', '#9dffb0'][i % 3]} glowPower={0.7 * c.glow} cast={false} />
            </group>
          ))}
          <Laptop p={[-0.15, 0.93, 0.02]} glow={c.glow} />
          {c.devices?.[0] && <DeviceProp product={c.devices[0]} p={[0.05, 0.93, 0.2]} rotY={0.3} />}
          {c.progress !== undefined && <Progress p={[0, 0.985, -0.345]} w={0.8} value={c.progress} glow={c.glow} />}
          <B p={[0.3, 0.965, 0.0]} s={[0.2, 0.07, 0.26]} c="#3a3d42" r={0.01} metal={0.5} rough={0.4} cast={false} />
          <B p={[0.3, 1.003, 0.05]} s={[0.12, 0.006, 0.1]} c="#081410" r={0} glow="#ffb347" glowPower={0.9 * c.glow} cast={false} />
        </>
      )
    case 'printer3d':
      return (
        <>
          <B p={[0, 0.36, 0]} s={[0.76, 0.72, 0.7]} c="#e4e6e8" r={0.012} rough={0.5} />
          {[-1, 1].map((sx) => [-1, 1].map((sz) => <B key={`${sx}${sz}`} p={[sx * 0.34, 1.07, sz * 0.31]} s={[0.04, 0.7, 0.04]} c={DARK} r={0.006} cast={false} />))}
          <B p={[0, 1.44, 0]} s={[0.76, 0.04, 0.7]} c={DARK} r={0.008} />
          <B p={[0, 0.74, 0]} s={[0.56, 0.02, 0.5]} c="#2b2d31" r={0.004} metal={0.6} rough={0.3} cast={false} />
          <B p={[0, 1.07, -0.33]} s={[0.66, 0.68, 0.01]} c="#bfe0f2" glass={0.25} r={0} cast={false} />
          <B p={[0, 1.3, 0]} s={[0.64, 0.03, 0.03]} c={STEEL} r={0.006} metal={0.9} rough={0.3} cast={false} />
          <B p={[0.08, 1.25, 0]} s={[0.1, 0.1, 0.1]} c="#c9553d" r={0.01} cast={false} />
          <B p={[0.02, 0.8, 0.03]} s={[0.12, 0.1, 0.2]} c="#e9a23a" r={0.02} rough={0.6} cast={false} />
          <B p={[0, 0.5, 0.352]} s={[0.3, 0.12, 0.008]} c="#081018" r={0} glow="#7fd1ff" glowPower={0.8 * c.glow} cast={false} />
        </>
      )
    case 'server':
      return (
        <>
          <B p={[0, 1.0, 0]} s={[0.62, 2.0, 0.86]} c="#15171a" r={0.012} rough={0.45} metal={0.5} />
          <B p={[0, 1.0, 0.433]} s={[0.54, 1.9, 0.008]} c="#0a0c0e" r={0} rough={0.15} metal={0.3} cast={false} />
          {!c.live &&
            Array.from({ length: 12 }, (_, i) => (
              <B key={i} p={[-0.1 + (i % 2) * 0.2, 0.22 + i * 0.145, 0.44]} s={[0.16, 0.016, 0.008]} c="#06140a" r={0} glow={hash(c.seed + i) > 0.82 ? '#ffb347' : '#3fe08a'} glowPower={1.3 * c.glow} cast={false} />
            ))}
          <B p={[0, 2.03, 0]} s={[0.5, 0.06, 0.7]} c={STEEL} r={0.008} metal={0.8} rough={0.4} cast={false} />
        </>
      )
    case 'design':
      return (
        <>
          {[-0.84, 0.84].map((x) => [-0.34, 0.34].map((z) => <B key={`${x}${z}`} p={[x, 0.445, z]} s={[0.06, 0.89, 0.06]} c={DARK} r={0.008} />))}
          <B p={[0, 0.3, 0]} s={[1.68, 0.03, 0.68]} c={OAK_PALE} r={0.006} rough={0.6} cast={false} />
          <B p={[0, 0.915, 0]} s={[1.92, 0.05, 0.86]} c={OAK_PALE} r={0.014} rough={0.55} />
          {/* device mock-ups, a drawing and colour chips on the table */}
          {c.devices?.length
            ? [-0.6, -0.3].map((x, i) => <DeviceProp key={x} product={c.devices![i % c.devices!.length]} p={[x, 0.94, 0.05]} rotY={i ? 0.2 : -0.2} />)
            : [['#e8e4dc', -0.6, 0.1, 0.07], ['#3b3d42', -0.42, 0.14, 0.075], ['#c8b89a', -0.24, 0.08, 0.07], ['#2e4a3c', 0.5, -0.15, 0.16]].map(([col, x, z, w], i) => (
                <B key={i} p={[x as number, 0.948, z as number]} s={[w as number, 0.016, (w as number) * 2.1]} c={col as string} r={0.006} rough={0.3} metal={0.3} cast={false} />
              ))}
          <B p={[0.1, 0.944, 0.18]} s={[0.42, 0.008, 0.3]} c="#f4f1ea" r={0} cast={false} />
          {c.progress !== undefined && <Progress p={[-0.45, 0.955, 0.33]} w={0.6} value={c.progress} glow={c.glow} flat />}
          {['#d65f7c', '#d6a24f', '#4f8fd6', '#58b98a', '#e9e9e9'].map((col, i) => (
            <B key={col} p={[0.6 + i * 0.07, 0.95, 0.26]} s={[0.055, 0.02, 0.1]} c={col} r={0.004} cast={false} />
          ))}
          <C p={[0.8, 0.95, -0.32]} r={[0.07, 0.08]} h={0.02} c={DARK} seg={12} cast={false} />
          <C p={[0.8, 1.16, -0.32]} r={[0.012, 0.012]} h={0.4} c={STEEL} metal={0.9} rough={0.3} seg={8} cast={false} />
          <C p={[0.76, 1.38, -0.27]} r={[0.05, 0.09]} h={0.1} c={DARK} glow="#ffe9c2" glowPower={0.5 * c.glow} seg={16} rot={[0.5, 0, 0.3]} cast={false} />
          {[-0.4, 0.4].map((x) => (
            <group key={x}>
              <C p={[x, 0.015, 0.62]} r={[0.16, 0.18]} h={0.03} c={STEEL} metal={0.8} rough={0.35} seg={16} cast={false} />
              <C p={[x, 0.33, 0.62]} r={[0.02, 0.02]} h={0.6} c={STEEL} metal={0.8} rough={0.35} seg={8} cast={false} />
              <C p={[x, 0.655, 0.62]} r={[0.16, 0.16]} h={0.05} c={WALNUT} seg={16} />
            </group>
          ))}
        </>
      )
    case 'media':
      return (
        <>
          {/* backdrop on a stand, sweeping out across the floor */}
          {[-0.82, 0.42].map((x) => (
            <group key={x}>
              <C p={[x, 1.1, -0.42]} r={[0.02, 0.02]} h={2.2} c={DARK} seg={8} />
              <B p={[x, 0.015, -0.42]} s={[0.3, 0.03, 0.3]} c={DARK} r={0.008} cast={false} />
            </group>
          ))}
          <C p={[-0.2, 2.2, -0.42]} r={[0.035, 0.035]} h={1.3} c={DARK} seg={10} rot={[0, 0, Math.PI / 2]} cast={false} />
          <B p={[-0.2, 1.09, -0.4]} s={[1.18, 2.18, 0.012]} c="#dfe3e8" r={0} rough={0.95} />
          <B p={[-0.2, 0.008, 0.05]} s={[1.18, 0.016, 0.9]} c="#dfe3e8" r={0} rough={0.95} cast={false} />
          {/* softbox and a camera on a tripod */}
          <B p={[0.74, 0.015, 0.12]} s={[0.26, 0.03, 0.26]} c={DARK} r={0.008} cast={false} />
          <C p={[0.74, 0.86, 0.12]} r={[0.018, 0.018]} h={1.66} c={DARK} seg={8} />
          <group position={[0.7, 1.72, 0.1]} rotation={[0, 0.5, 0]}>
            <B p={[0, 0, 0]} s={[0.1, 0.5, 0.5]} c={DARK} r={0.02} />
            <B p={[-0.053, 0, 0]} s={[0.008, 0.44, 0.44]} c="#fff6e6" r={0} glow="#fff1d6" glowPower={1.1 * c.glow} cast={false} />
          </group>
          <C p={[0.2, 0.6, 0.38]} r={[0.014, 0.014]} h={1.2} c={DARK} seg={8} />
          {[0, 2.1, 4.2].map((a) => (
            <B key={a} p={[0.2 + Math.sin(a) * 0.14, 0.012, 0.38 + Math.cos(a) * 0.14]} s={[0.03, 0.024, 0.3]} c={DARK} r={0.006} rot={[0, a, 0]} cast={false} />
          ))}
          <B p={[0.2, 1.25, 0.38]} s={[0.14, 0.1, 0.1]} c="#16181b" r={0.01} />
          <C p={[0.2, 1.25, 0.3]} r={[0.035, 0.04]} h={0.08} c="#0b0c0e" seg={14} rot={[Math.PI / 2, 0, 0]} cast={false} />
          <C p={[-0.2, 0.416, -0.05]} r={[0.2, 0.2]} h={0.8} c={WHITE} seg={24} rough={0.4} />
        </>
      )
    case 'meeting':
      return (
        <>
          {[-0.5, 0.5].map((x) => (
            <B key={x} p={[x, 0.36, 0]} s={[0.1, 0.72, 0.5]} c={DARK} r={0.02} />
          ))}
          <B p={[0, 0.745, 0]} s={[1.5, 0.05, 0.86]} c={WALNUT} r={0.03} rough={0.35} />
          <C p={[0, 0.795, 0]} r={[0.07, 0.11]} h={0.05} c={DARK} seg={3} cast={false} />
          {[-0.5, 0, 0.5].map((x) => (
            <group key={x}>
              <Chair x={x} z={0.72} />
              <Chair x={x} z={-0.72} rotY={Math.PI} />
            </group>
          ))}
        </>
      )
    case 'screen':
      return (
        <>
          {[-0.6, 0.6].map((x) => (
            <group key={x}>
              <B p={[x, 0.02, -0.3]} s={[0.08, 0.04, 0.5]} c={DARK} r={0.01} cast={false} />
              {/* thinner than the panel they hold, so that where they run up into it no two faces lie in one plane */}
              <B p={[x, 0.55, -0.34]} s={[0.05, 1.02, 0.04]} c={DARK} r={0.008} />
            </group>
          ))}
          <B p={[0, 1.45, -0.34]} s={[1.8, 1.04, 0.05]} c="#0c0d0f" r={0.01} rough={0.35} />
          <B p={[0, 1.45, -0.311]} s={[1.74, 0.98, 0.008]} c="#0f1b2a" r={0} glow="#6fa3d8" glowPower={0.8 * c.glow} rough={0.2} cast={false} />
          {!c.live &&
            [[-0.5, 1.6, 0.5, 0.3, '#9ec3ea'], [0.35, 1.55, 0.7, 0.4, '#f2b631'], [-0.3, 1.2, 0.9, 0.22, '#58b98a']].map(([x, y, w, h, col], i) => (
              <B key={i} p={[x as number, y as number, -0.305]} s={[w as number, h as number, 0.006]} c="#101820" r={0} glow={col as string} glowPower={0.5 * c.glow} cast={false} />
            ))}
        </>
      )
    case 'booth':
      return (
        <>
          <B p={[0, 0.02, 0]} s={[0.94, 0.04, 0.94]} c="#22272d" r={0.008} />
          <B p={[0, 1.1, -0.44]} s={[0.94, 2.12, 0.06]} c="#2f3a44" r={0.008} rough={0.9} />
          <B p={[-0.44, 1.1, 0.03]} s={[0.06, 2.12, 0.88]} c="#2f3a44" r={0.008} rough={0.9} />
          <B p={[0.44, 1.1, 0.03]} s={[0.06, 2.12, 0.88]} c="#2f3a44" r={0.008} rough={0.9} />
          <B p={[0, 2.19, 0]} s={[0.94, 0.06, 0.94]} c="#2f3a44" r={0.008} rough={0.9} />
          <B p={[0, 1.1, 0.455]} s={[0.82, 2.12, 0.02]} c="#bfe0f2" glass={0.22} r={0} cast={false} />
          <B p={[0, 2.15, 0]} s={[0.5, 0.02, 0.5]} c="#fff4dc" r={0} glow="#ffe9c2" glowPower={1.2 * c.glow} cast={false} />
          <B p={[0, 0.9, -0.3]} s={[0.82, 0.03, 0.22]} c={OAK_PALE} r={0.006} cast={false} />
          <C p={[0, 0.27, 0.05]} r={[0.02, 0.14]} h={0.46} c={STEEL} metal={0.8} rough={0.35} seg={8} cast={false} />
          <C p={[0, 0.525, 0.05]} r={[0.16, 0.16]} h={0.05} c={FABRIC} seg={16} cast={false} />
        </>
      )
    case 'whiteboard':
      return (
        <>
          {[-0.42, 0.42].map((x) => (
            <group key={x}>
              <B p={[x, 0.02, -0.3]} s={[0.05, 0.04, 0.44]} c={STEEL} r={0.008} metal={0.8} rough={0.4} cast={false} />
              <B p={[x, 0.9, -0.3]} s={[0.035, 1.72, 0.035]} c={STEEL} r={0.006} metal={0.8} rough={0.4} cast={false} />
            </group>
          ))}
          <B p={[0, 1.27, -0.3]} s={[0.94, 0.95, 0.03]} c={STEEL} r={0.006} metal={0.8} rough={0.4} />
          <B p={[0, 1.27, -0.282]} s={[0.88, 0.89, 0.008]} c="#fafafa" r={0} rough={0.25} cast={false} />
          <B p={[0, 0.8, -0.26]} s={[0.6, 0.02, 0.06]} c={STEEL} r={0.004} metal={0.8} rough={0.4} cast={false} />
          {[['#d6455a', -0.2, 1.45, 0.3], ['#2f6fd6', 0.1, 1.3, 0.42], ['#1f9d6b', -0.1, 1.12, 0.36], ['#222222', 0.2, 1.55, 0.2]].map(([col, x, y, w], i) => (
            <B key={i} p={[x as number, y as number, -0.275]} s={[w as number, 0.014, 0.006]} c={col as string} r={0} rot={[0, 0, (hash(c.seed + i) - 0.5) * 0.3]} cast={false} />
          ))}
        </>
      )
    case 'reception':
      return (
        <>
          <B p={[0, 0.55, 0.12]} s={[1.9, 1.1, 0.12]} c={WHITE} r={0.03} rough={0.4} />
          <B p={[-0.9, 0.55, -0.16]} s={[0.1, 1.1, 0.44]} c={WHITE} r={0.03} rough={0.4} />
          <B p={[0.9, 0.55, -0.16]} s={[0.1, 1.1, 0.44]} c={WHITE} r={0.03} rough={0.4} />
          <B p={[0, 1.12, -0.06]} s={[1.94, 0.04, 0.5]} c={WALNUT} r={0.015} rough={0.35} />
          <B p={[0, 0.72, -0.12]} s={[1.7, 0.03, 0.42]} c={WALNUT} r={0.008} rough={0.4} cast={false} />
          <B p={[0, 0.1, 0.184]} s={[1.86, 0.03, 0.012]} c="#ffffff" r={0} glow="#ffd9a8" glowPower={1.4 * c.glow} cast={false} />
          <Sign p={[0, 0.62, 0.184]} size={[1.1, 0.5]} name={c.company} logo={c.logo} glow={0.6 * c.glow} color="#2c3036" />
          <Monitor x={0.4} z={-0.2} y={0.735} w={0.4} glow={c.glow} on />
          {/* whoever is on the desk is drawn by the view, on their feet behind the counter: then only a stool stands by, at the end */}
          {c.live ? (
            <>
              <C p={[-0.62, 0.3, -0.4]} r={[0.02, 0.02]} h={0.6} c={STEEL} seg={8} cast={false} />
              <C p={[-0.62, 0.62, -0.4]} r={[0.15, 0.15]} h={0.05} c={DARK} seg={14} />
              <C p={[-0.62, 0.02, -0.4]} r={[0.16, 0.18]} h={0.03} c={STEEL} seg={14} cast={false} />
            </>
          ) : (
            <Chair z={-0.45} rotY={Math.PI} />
          )}
        </>
      )
    case 'logowall':
      return (
        <>
          <B p={[0, 1.2, -0.38]} s={[1.94, 2.4, 0.12]} c="#191b1f" r={0.01} rough={0.7} />
          <B p={[0, 1.3, -0.316]} s={[1.6, 0.9, 0.012]} c="#101114" r={0} glow="#3a2a1a" glowPower={0.6 * c.glow} cast={false} />
          <Sign p={[0, 1.3, -0.308]} size={[1.5, 0.8]} name={c.company} logo={c.logo} glow={1.3 * c.glow} />
          <B p={[0, 0.06, -0.3]} s={[1.9, 0.03, 0.04]} c="#ffffff" r={0} glow="#ffd9a8" glowPower={1.5 * c.glow} cast={false} />
        </>
      )
    case 'showcase':
      return (
        <>
          <B p={[0, 0.5, 0]} s={[0.6, 1.0, 0.6]} c="#e9e6e0" r={0.012} rough={0.35} />
          <B p={[0, 1.02, 0]} s={[0.52, 0.04, 0.52]} c={DARK} r={0.008} cast={false} />
          {c.live ? null : c.devices?.[0] ? <DeviceProp product={c.devices[0]} p={[0, 1.04, 0]} rotY={0.4} /> : <B p={[0, 1.13, 0]} s={[0.08, 0.18, 0.012]} c="#b9bcc0" r={0.01} metal={0.8} rough={0.3} rot={[-0.2, 0.4, 0]} cast={false} />}
          <B p={[0, 1.33, 0]} s={[0.54, 0.58, 0.54]} c="#bfe0f2" glass={0.18} r={0.006} cast={false} />
          <B p={[0, 1.63, 0]} s={[0.56, 0.02, 0.56]} c={DARK} r={0.004} cast={false} />
          <B p={[0, 1.615, 0]} s={[0.3, 0.012, 0.3]} c="#ffffff" r={0} glow="#fff1d6" glowPower={1.2 * c.glow} cast={false} />
        </>
      )
    case 'coffee':
      return (
        <>
          <B p={[0, 0.45, -0.14]} s={[1.9, 0.9, 0.56]} c="#ece6da" r={0.015} rough={0.6} />
          <B p={[0, 0.92, -0.12]} s={[1.96, 0.04, 0.64]} c="#2b2d31" r={0.012} rough={0.25} />
          <B p={[-0.5, 1.13, -0.2]} s={[0.4, 0.38, 0.36]} c="#17191c" r={0.03} rough={0.3} metal={0.7} />
          <B p={[-0.5, 1.22, -0.017]} s={[0.24, 0.05, 0.008]} c="#201008" r={0} glow="#ff9a3c" glowPower={1.2 * c.glow} cast={false} />
          <C p={[-0.56, 0.975, 0.08]} r={[0.03, 0.025]} h={0.07} c="#f4f4f4" seg={12} cast={false} />
          <B p={[0.0, 1.07, -0.24]} s={[0.16, 0.26, 0.16]} c="#b9bcc0" r={0.02} metal={0.8} rough={0.3} />
          <C p={[0.0, 1.26, -0.24]} r={[0.07, 0.05]} h={0.12} c="#3b2a1e" glass={0.5} seg={12} cast={false} />
          {[0.42, 0.52, 0.62].map((x) => (
            <C key={x} p={[x, 1.0, -0.18]} r={[0.035, 0.03]} h={0.12} c="#f4f4f4" seg={12} cast={false} />
          ))}
          <B p={[0.78, 1.02, -0.22]} s={[0.2, 0.16, 0.28]} c={OAK_PALE} r={0.01} cast={false} />
          {[-0.4, 0.4].map((x) => (
            <group key={x}>
              <C p={[x, 0.015, 0.36]} r={[0.17, 0.19]} h={0.03} c={STEEL} metal={0.9} rough={0.3} seg={16} cast={false} />
              <C p={[x, 0.36, 0.36]} r={[0.02, 0.02]} h={0.66} c={STEEL} metal={0.9} rough={0.3} seg={8} cast={false} />
              <C p={[x, 0.715, 0.36]} r={[0.17, 0.17]} h={0.05} c={WALNUT} seg={16} />
            </group>
          ))}
        </>
      )
    case 'cafe':
      return (
        <>
          <C p={[0, 0.015, 0]} r={[0.2, 0.22]} h={0.03} c={DARK} seg={16} cast={false} />
          <C p={[0, 0.37, 0]} r={[0.025, 0.025]} h={0.68} c={DARK} seg={8} cast={false} />
          <C p={[0, 0.725, 0]} r={[0.3, 0.3]} h={0.03} c={OAK_PALE} seg={24} rough={0.5} />
          <C p={[0.08, 0.775, 0.05]} r={[0.03, 0.025]} h={0.07} c="#f4f4f4" seg={12} cast={false} />
          {[-1, 1].map((sx) => (
            <group key={sx} position={[sx * 0.36, 0, 0]} rotation={[0, (sx * Math.PI) / 2, 0]}>
              {[-0.1, 0.1].map((x) => [-0.1, 0.1].map((z) => <C key={`${x}${z}`} p={[x, 0.22, z]} r={[0.012, 0.012]} h={0.44} c={DARK} seg={6} cast={false} />))}
              <B p={[0, 0.455, 0]} s={[0.26, 0.03, 0.26]} c={['#c9553d', '#31506b', '#3f7d4d'][c.seed % 3]} r={0.01} />
              <B p={[0, 0.62, 0.115]} s={[0.26, 0.3, 0.03]} c={['#c9553d', '#31506b', '#3f7d4d'][c.seed % 3]} r={0.01} cast={false} />
            </group>
          ))}
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
          <B p={[0.29, 1.28, 0.31]} s={[0.08, 0.05, 0.006]} c="#081410" r={0} glow="#3fe08a" glowPower={0.9 * c.glow} cast={false} />
          <B p={[-0.1, 0.3, 0.304]} s={[0.5, 0.16, 0.008]} c="#0b0c0e" r={0} cast={false} />
        </>
      )
    case 'sofa':
      return <Sofa color={['#4a5568', '#6b5a4a', '#3f5a52', '#5a4a68'][c.seed % 4]} />
    case 'armchair':
      return (
        <>
          {[-1, 1].map((sx) => [-1, 1].map((sz) => <C key={`${sx}${sz}`} p={[sx * 0.3, 0.06, sz * 0.28]} r={[0.022, 0.018]} h={0.12} c={WALNUT} seg={8} cast={false} />))}
          <B p={[0, 0.22, 0]} s={[0.76, 0.2, 0.74]} c="#8a5a44" r={0.05} rough={0.85} />
          <B p={[0, 0.52, 0.28]} s={[0.76, 0.5, 0.18]} c="#8a5a44" r={0.06} rough={0.85} />
          <B p={[-0.31, 0.42, -0.04]} s={[0.14, 0.3, 0.66]} c="#8a5a44" r={0.05} rough={0.85} />
          <B p={[0.31, 0.42, -0.04]} s={[0.14, 0.3, 0.66]} c="#8a5a44" r={0.05} rough={0.85} />
          <B p={[0, 0.37, -0.05]} s={[0.46, 0.12, 0.52]} c="#946450" r={0.05} rough={0.9} cast={false} />
        </>
      )
    case 'pingpong':
      return (
        <>
          {[-0.7, 0.7].map((x) => [-0.36, 0.36].map((z) => <B key={`${x}${z}`} p={[x, 0.37, z]} s={[0.04, 0.74, 0.04]} c={DARK} r={0.006} cast={false} />))}
          <B p={[0, 0.755, 0]} s={[1.86, 0.03, 0.92]} c="#1d5c8f" r={0.006} rough={0.5} />
          <B p={[0, 0.772, 0]} s={[1.84, 0.006, 0.014]} c="#ffffff" r={0} cast={false} />
          <B p={[0, 0.845, 0]} s={[0.012, 0.15, 0.98]} c="#f4f4f4" r={0} glass={0.55} cast={false} />
          {[-0.49, 0.49].map((z) => (
            <B key={z} p={[0, 0.84, z]} s={[0.03, 0.16, 0.02]} c={DARK} r={0.004} cast={false} />
          ))}
          <C p={[0.5, 0.776, 0.2]} r={[0.07, 0.07]} h={0.012} c="#c0392b" seg={16} cast={false} />
          <B p={[0.5, 0.776, 0.31]} s={[0.025, 0.012, 0.1]} c={WOOD} r={0.004} cast={false} />
          <S p={[-0.4, 0.79, -0.15]} r={0.02} c="#ff8a3d" cast={false} />
        </>
      )
    case 'arcade':
      return (
        <>
          <B p={[0, 0.5, 0]} s={[0.62, 1.0, 0.66]} c="#1b1d22" r={0.015} rough={0.6} />
          <B p={[0, 1.38, -0.1]} s={[0.62, 0.78, 0.46]} c="#1b1d22" r={0.015} rough={0.6} />
          <B p={[0, 1.36, 0.134]} s={[0.5, 0.42, 0.012]} c="#081018" r={0} glow="#3ad0ff" glowPower={1.1 * c.glow} cast={false} />
          <B p={[0, 1.68, 0.134]} s={[0.56, 0.12, 0.012]} c="#200820" r={0} glow="#ff4fa3" glowPower={1.3 * c.glow} cast={false} />
          <B p={[0, 1.02, 0.24]} s={[0.6, 0.06, 0.2]} c="#2a2d33" r={0.01} cast={false} />
          <C p={[-0.14, 1.09, 0.24]} r={[0.012, 0.012]} h={0.09} c={STEEL} seg={8} cast={false} />
          <S p={[-0.14, 1.15, 0.24]} r={0.03} c="#e5484d" cast={false} />
          {[0.06, 0.16].map((x, i) => (
            <C key={x} p={[x, 1.058, 0.25]} r={[0.025, 0.025]} h={0.02} c={['#f2b631', '#36c5d6'][i]} seg={12} cast={false} />
          ))}
        </>
      )
    case 'treadmill':
      return (
        <>
          <B p={[0, 0.09, 0.05]} s={[0.7, 0.18, 1.7]} c="#1f2226" r={0.03} rough={0.6} />
          <B p={[0, 0.186, 0.1]} s={[0.5, 0.012, 1.4]} c="#0c0d0f" r={0} rough={0.95} cast={false} />
          {[-0.33, 0.33].map((x) => (
            <B key={x} p={[x, 0.72, -0.66]} s={[0.05, 1.1, 0.07]} c={STEEL} r={0.01} metal={0.8} rough={0.35} rot={[0.12, 0, 0]} />
          ))}
          <B p={[0, 1.27, -0.72]} s={[0.72, 0.26, 0.08]} c="#17191c" r={0.02} rot={[0.5, 0, 0]} />
          <B p={[0, 1.285, -0.685]} s={[0.4, 0.14, 0.008]} c="#081018" r={0} glow="#7fd1ff" glowPower={0.9 * c.glow} rot={[0.5, 0, 0]} cast={false} />
          {[-0.33, 0.33].map((x) => (
            <B key={x} p={[x, 1.1, -0.4]} s={[0.04, 0.04, 0.56]} c={DARK} r={0.012} cast={false} />
          ))}
        </>
      )
    case 'weights':
      return (
        <>
          {/* dumbbell rack */}
          {[-0.82, -0.1].map((x) => (
            <B key={x} p={[x, 0.42, -0.22]} s={[0.05, 0.84, 0.36]} c={DARK} r={0.008} />
          ))}
          {[0.34, 0.7].map((y) => (
            <group key={y}>
              <B p={[-0.46, y, -0.22]} s={[0.72, 0.03, 0.3]} c={STEEL} r={0.006} metal={0.8} rough={0.4} cast={false} />
              {[-0.68, -0.46, -0.24].map((x) => (
                <group key={x} position={[x, y + 0.075, -0.22]}>
                  <C p={[0, 0, 0]} r={[0.018, 0.018]} h={0.2} c={STEEL} seg={8} rot={[Math.PI / 2, 0, 0]} metal={0.9} rough={0.3} cast={false} />
                  <C p={[0, 0, -0.09]} r={[0.06, 0.06]} h={0.06} c="#15171a" seg={10} rot={[Math.PI / 2, 0, 0]} cast={false} />
                  <C p={[0, 0, 0.09]} r={[0.06, 0.06]} h={0.06} c="#15171a" seg={10} rot={[Math.PI / 2, 0, 0]} cast={false} />
                </group>
              ))}
            </group>
          ))}
          {/* bench */}
          {[-0.3, 0.3].map((z) => (
            <B key={z} p={[0.5, 0.2, z]} s={[0.3, 0.4, 0.05]} c={DARK} r={0.008} />
          ))}
          <B p={[0.5, 0.435, 0]} s={[0.32, 0.07, 0.9]} c="#2c3036" r={0.03} rough={0.9} />
        </>
      )
    case 'yoga':
      return (
        <>
          <B p={[-0.46, 0.006, 0]} s={[0.62, 0.012, 0.92]} c="#6a8f8a" r={0.004} rough={1} cast={false} />
          <B p={[0.46, 0.006, 0]} s={[0.62, 0.012, 0.92]} c="#b58a6a" r={0.004} rough={1} cast={false} />
          <C p={[0.46, 0.07, -0.34]} r={[0.058, 0.058]} h={0.56} c="#5a6b8f" seg={12} rot={[0, 0, Math.PI / 2]} cast={false} />
          <B p={[-0.46, 0.047, -0.36]} s={[0.22, 0.07, 0.12]} c="#8d8f6a" r={0.015} rough={1} cast={false} />
        </>
      )
    case 'plant':
      return <Plant seed={c.seed} />
    case 'tree':
      return (
        <>
          <B p={[0, 0.25, 0]} s={[0.7, 0.5, 0.7]} c="#d8d2c6" r={0.04} rough={0.85} />
          <B p={[0, 0.495, 0]} s={[0.6, 0.03, 0.6]} c="#3b2e25" r={0} rough={1} cast={false} />
          <C p={[0, 1.1, 0]} r={[0.035, 0.06]} h={1.2} c="#6b5444" seg={8} rough={0.95} />
          {[[0, 2.0, 0, 0.5], [0.3, 1.75, 0.15, 0.36], [-0.28, 1.8, -0.12, 0.38], [0.05, 2.4, -0.1, 0.32], [-0.1, 1.6, 0.28, 0.3]].map(([x, y, z, r], i) => (
            <S key={i} p={[x, y, z]} r={r} c={LEAF[(i + c.seed) % LEAF.length]} rough={0.95} flat />
          ))}
        </>
      )
    case 'stairs':
      // a straight flight rising to the north, up to the floor above, with a rail on each side
      return (
        <>
          {Array.from({ length: 10 }, (_, i) => {
            const top = (i + 1) * 0.29
            return <B key={i} p={[0, top / 2, 1.5 - (i + 0.5) * 0.3]} s={[0.86, top, 0.3]} c={i % 2 ? '#8d9095' : '#979a9e'} r={0.004} rough={0.7} />
          })}
          {[-0.45, 0.45].map((x) => (
            <B key={x} p={[x, 2.0, 0]} s={[0.04, 0.05, 3.1]} c="#2a2d31" r={0} rough={0.4} cast={false} />
          ))}
        </>
      )
    case 'lift':
      // a glass car in a steel frame, its doors to the south
      return (
        <>
          <B p={[0, 1.45, 0]} s={[1.76, 2.9, 1.76]} c="#5a6068" r={0.01} rough={0.35} />
          <B p={[0, 1.2, 0.885]} s={[1.0, 2.2, 0.02]} c="#c9ced3" r={0} rough={0.25} cast={false} />
          <B p={[0, 1.2, 0.895]} s={[0.012, 2.2, 0.01]} c="#2a2d31" r={0} cast={false} />
          <B p={[0.62, 1.4, 0.89]} s={[0.08, 0.16, 0.01]} c="#ffb866" r={0} cast={false} />
        </>
      )
    case 'bookshelf':
      return (
        <>
          <B p={[0, 1.0, -0.3]} s={[0.94, 2.0, 0.36]} c={WALNUT} r={0.008} rough={0.5} />
          {Array.from({ length: 5 }, (_, row) => (
            <group key={row}>
              <B p={[0, 0.235 + row * 0.38, -0.125]} s={[0.86, 0.31, 0.012]} c="#221a15" r={0} cast={false} />
              {Array.from({ length: 7 }, (_, i) => {
                const h = 0.18 + hash(c.seed + row * 9 + i) * 0.1
                return <B key={i} p={[-0.36 + i * 0.12, 0.08 + row * 0.38 + h / 2, -0.11]} s={[0.09, h, 0.03]} c={BOOKS[(i + row * 3) % 7]} r={0.004} cast={false} />
              })}
            </group>
          ))}
        </>
      )
    case 'rug':
      return (
        <>
          <B p={[0, 0.008, 0]} s={[1.9, 0.016, 1.9]} c={RUGS[c.seed % 4]} r={0.006} rough={1} cast={false} />
          <B p={[0, 0.019, 0]} s={[1.6, 0.006, 1.6]} c="#e6dccb" r={0} rough={1} cast={false} />
          <B p={[0, 0.025, 0]} s={[1.4, 0.006, 1.4]} c={RUGS[c.seed % 4]} r={0} rough={1} cast={false} />
        </>
      )
    case 'aquarium':
      return (
        <>
          <B p={[0, 0.35, 0]} s={[1.9, 0.7, 0.6]} c={WALNUT} r={0.012} rough={0.4} />
          <B p={[0, 0.735, 0]} s={[1.8, 0.07, 0.5]} c="#d9cdb2" r={0} rough={1} cast={false} />
          {[-0.6, -0.1, 0.5].map((x, i) => (
            <S key={x} p={[x, 0.9, 0.05 - i * 0.06]} r={0.1 + i * 0.02} c={LEAF[i]} scale={[0.6, 1.6, 0.6]} flat cast={false} />
          ))}
          {['#ff8a3d', '#ffd166', '#5ec8e8', '#ff5d73', '#f4f4f4'].map((col, i) => (
            <S key={col} p={[-0.6 + i * 0.3, 0.95 + hash(c.seed + i) * 0.3, (hash(c.seed + i * 3) - 0.5) * 0.3]} r={0.035} c={col} scale={[1.8, 0.9, 0.6]} glow={col} glowPower={0.25} cast={false} />
          ))}
          <B p={[0, 1.05, 0]} s={[1.86, 0.7, 0.56]} c="#6fc3e8" glass={0.3} r={0.01} cast={false} />
          <B p={[0, 1.43, 0]} s={[1.9, 0.06, 0.6]} c={DARK} r={0.012} />
          <B p={[0, 1.392, 0]} s={[1.7, 0.012, 0.4]} c="#ffffff" r={0} glow="#bfe9ff" glowPower={1.4 * c.glow} cast={false} />
        </>
      )
    case 'sculpture':
      return (
        <>
          <B p={[0, 0.4, 0]} s={[0.5, 0.8, 0.5]} c="#e9e6e0" r={0.01} rough={0.35} />
          <C p={[0, 0.84, 0]} r={[0.03, 0.05]} h={0.08} c="#c9a25a" seg={10} metal={1} rough={0.25} cast={false} />
          <mesh position={[0, 1.2, 0]} rotation={[0.4, c.seed, 0.2]} castShadow userData={{ live: true }}>
            <torusKnotGeometry args={[0.24, 0.07, 96, 12, 2, 3]} />
            <meshStandardMaterial color="#c9a25a" metalness={1} roughness={0.22} />
          </mesh>
        </>
      )
    // ---- grounds
    case 'planter':
      return (
        <>
          <B p={[0, 0.2, 0]} s={[1.9, 0.4, 0.7]} c="#b9b4a8" r={0.02} rough={0.8} />
          <B p={[0, 0.395, 0]} s={[1.78, 0.03, 0.58]} c="#3b2e25" r={0} rough={1} cast={false} />
          {Array.from({ length: 7 }, (_, i) => (
            <S key={i} p={[-0.75 + i * 0.25, 0.52 + hash(c.seed + i) * 0.08, (hash(c.seed + i * 5) - 0.5) * 0.25]} r={0.2 + hash(c.seed + i * 3) * 0.06} c={i % 3 === 1 ? ['#d98fa6', '#e6c04f', '#b58fd9'][c.seed % 3] : LEAF[(i + c.seed) % 4]} rough={0.95} flat cast={false} />
          ))}
        </>
      )
    case 'gbench':
      return (
        <>
          {[-0.75, 0.75].map((x) => (
            <B key={x} p={[x, 0.21, 0]} s={[0.07, 0.42, 0.44]} c={DARK} r={0.01} />
          ))}
          {[-0.15, 0, 0.15].map((z) => (
            <B key={z} p={[0, 0.445, z]} s={[1.8, 0.05, 0.13]} c={WOOD} r={0.012} rough={0.7} />
          ))}
        </>
      )
    case 'fountain':
      return (
        <>
          <C p={[0, 0.2, 0]} r={[1.4, 1.42]} h={0.4} c="#c9c4b8" seg={32} rough={0.6} />
          <C p={[0, 0.405, 0]} r={[1.24, 1.24]} h={0.014} c="#3f8fb0" seg={32} rough={0.05} metal={0.3} cast={false} />
          <C p={[0, 0.6, 0]} r={[0.2, 0.28]} h={0.4} c="#c9c4b8" seg={16} rough={0.6} />
          <C p={[0, 0.82, 0]} r={[0.5, 0.2]} h={0.08} c="#c9c4b8" seg={20} rough={0.6} />
          <C p={[0, 1.26, 0]} r={[0.03, 0.06]} h={0.8} c="#cfe8f2" glass={0.5} seg={8} cast={false} />
          <S p={[0, 1.66, 0]} r={0.13} c="#e6f4fa" glass={0.5} cast={false} />
        </>
      )
    case 'otree':
      return <Tree seed={c.seed} />
    case 'hedge':
      return <B p={[0, 0.45, 0]} s={[1.0, 0.9, 0.7]} c={LEAF[c.seed % 2 === 0 ? 1 : 3]} r={0.08} rough={1} flat />
    case 'lamp':
      return (
        <>
          <C p={[0, 0.06, 0]} r={[0.1, 0.13]} h={0.12} c={DARK} seg={12} />
          <C p={[0, 1.75, 0]} r={[0.035, 0.05]} h={3.26} c={DARK} seg={8} />
          <B p={[0, 3.4, 0.16]} s={[0.12, 0.05, 0.5]} c={DARK} r={0.012} />
          <B p={[0, 3.369, 0.24]} s={[0.09, 0.012, 0.28]} c="#fff6e0" r={0} glow="#ffe9c2" glowPower={0.3 + 2 * c.glow} cast={false} />
        </>
      )
    case 'parking':
      return (
        <>
          <B p={[0, 0.004, 0]} s={[2.96, 0.008, 4.96]} c="#3d4045" r={0} rough={0.9} cast={false} />
          {[-1.42, 1.42].map((x) => (
            <B key={x} p={[x, 0.012, 0]} s={[0.1, 0.01, 4.9]} c="#e9e6dc" r={0} rough={0.9} cast={false} />
          ))}
          <B p={[0, 0.012, -2.4]} s={[2.74, 0.01, 0.1]} c="#e9e6dc" r={0} rough={0.9} cast={false} />
          <B p={[0, 0.07, -2.05]} s={[1.7, 0.14, 0.18]} c="#8c8e90" r={0.03} rough={0.9} />
          {hash(c.seed + 2) > 0.2 && <Car seed={c.seed} p={[0, 0, 0.1]} rotY={Math.PI} glow={c.glow > 1.2 ? 0.3 : 0} />}
        </>
      )
    case 'bikes':
      return (
        <>
          <B p={[0, 0.02, 0]} s={[1.9, 0.04, 0.5]} c="#8c8e90" r={0.008} rough={0.9} cast={false} />
          {[-0.75, -0.25, 0.25, 0.75].map((x, i) => (
            <group key={x} position={[x, 0, 0]}>
              <B p={[0, 0.42, -0.14]} s={[0.035, 0.76, 0.035]} c={STEEL} r={0.01} metal={0.9} rough={0.3} cast={false} />
              <B p={[0, 0.42, 0.14]} s={[0.035, 0.76, 0.035]} c={STEEL} r={0.01} metal={0.9} rough={0.3} cast={false} />
              <B p={[0, 0.8, 0]} s={[0.035, 0.035, 0.315]} c={STEEL} r={0.01} metal={0.9} rough={0.3} cast={false} />
              {i % 2 === c.seed % 2 && (
                <group position={[0.12, 0, 0]}>
                  {[-0.52, 0.52].map((z) => (
                    <group key={z}>
                      <Ring p={[0, 0.33, z]} R={0.31} r={0.022} c="#15171a" rot={[0, Math.PI / 2, 0]} rough={0.9} />
                      <C p={[0, 0.33, z]} r={[0.03, 0.03]} h={0.05} c={STEEL} seg={8} rot={[0, 0, Math.PI / 2]} metal={0.8} rough={0.4} cast={false} />
                      <B p={[0, 0.33, z]} s={[0.008, 0.6, 0.008]} c={STEEL} r={0} cast={false} />
                      <B p={[0, 0.33, z]} s={[0.008, 0.008, 0.6]} c={STEEL} r={0} cast={false} />
                    </group>
                  ))}
                  <B p={[0, 0.62, 0]} s={[0.035, 0.035, 1.0]} c={['#c9553d', '#31506b', '#e0a23a'][(c.seed + i) % 3]} r={0.01} cast={false} />
                  <B p={[0, 0.48, -0.2]} s={[0.03, 0.34, 0.03]} c={['#c9553d', '#31506b', '#e0a23a'][(c.seed + i) % 3]} r={0.008} rot={[0.5, 0, 0]} cast={false} />
                  <B p={[0, 0.82, -0.32]} s={[0.1, 0.04, 0.2]} c={DARK} r={0.015} cast={false} />
                  <B p={[0, 0.84, 0.5]} s={[0.36, 0.03, 0.03]} c={DARK} r={0.01} cast={false} />
                  <B p={[0, 0.72, -0.32]} s={[0.03, 0.2, 0.03]} c={STEEL} r={0.008} cast={false} />
                  <B p={[0, 0.72, 0.5]} s={[0.03, 0.24, 0.03]} c={STEEL} r={0.008} cast={false} />
                </group>
              )}
            </group>
          ))}
        </>
      )
    case 'flag':
      return (
        <>
          <C p={[0, 0.08, 0]} r={[0.16, 0.2]} h={0.16} c="#b9b4a8" seg={12} rough={0.8} />
          <C p={[0, 3.6, 0]} r={[0.03, 0.045]} h={6.9} c="#d9dde1" seg={8} metal={0.7} rough={0.35} />
          <S p={[0, 7.08, 0]} r={0.06} c="#c9a25a" metal={1} rough={0.3} cast={false} />
          <B p={[0.68, 6.45, 0]} s={[1.3, 0.8, 0.02]} c={c.color} r={0} rough={0.9} />
          <Sign p={[0.68, 6.45, 0.013]} size={[1.0, 0.6]} name={c.company} logo={c.logo} glow={0.2} />
        </>
      )
    case 'sign':
      return (
        <>
          <B p={[0, 0.08, 0]} s={[2.9, 0.16, 0.7]} c="#8c8e90" r={0.02} rough={0.9} />
          <B p={[0, 0.76, 0]} s={[2.7, 1.2, 0.36]} c="#e4e1da" r={0.02} rough={0.6} />
          <B p={[0, 0.76, 0.182]} s={[2.4, 0.9, 0.012]} c="#17191c" r={0} rough={0.5} cast={false} />
          <Sign p={[0, 0.76, 0.19]} size={[2.1, 0.75]} name={c.company} logo={c.logo} glow={0.4 + 0.6 * c.glow} />
          <B p={[0, 0.176, 0.3]} s={[2.5, 0.03, 0.06]} c="#ffffff" r={0} glow="#ffe9c2" glowPower={0.5 + c.glow} cast={false} />
        </>
      )
  }
  return <B p={[0, 0.25, 0]} s={[0.8, 0.5, 0.8]} c="#ff00ff" />
}

export { Sofa }
