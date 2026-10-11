// Store fixtures. One unit is one metre and one floor tile; each model is
// centred on its footprint with its front toward +Z.
import type { Product } from '../../sim/types'
import { B, C, DARK, LivePerson, OAK_PALE, type PersonLook, Person, STEEL, Sign, WALNUT, WHITE, hash } from './kit'
import { OfficeItem } from './office'

export interface StoreCtx {
  /** Devices on sale, shown on the tables. */
  products: Product[]
  glow: number
  company: string
  logo?: string
  color: string
  seed: number
}

const STAFF: PersonLook[] = [
  { look: 311, color: '#2f6f8f' },
  { look: 2077, color: '#2f6f8f' },
  { look: 5120, color: '#2f6f8f' },
]

/** A device lying on a surface whose top is at y, roughly to scale. */
export function DeviceProp({ product, p, rotY = 0 }: { product?: Product; p: [number, number, number]; rotY?: number }) {
  const type = product?.type ?? 'phone'
  const color = product?.design.body.backColor ?? '#b9c7d8'
  const frame = product?.design.body.frameColor ?? '#8f959d'
  if (type === 'laptop') {
    return (
      <group position={p} rotation={[0, rotY, 0]}>
        <B p={[0, 0.008, 0]} s={[0.32, 0.016, 0.22]} c={color} r={0.006} metal={0.6} rough={0.4} cast={false} />
        <group position={[0, 0.016, -0.11]} rotation={[-0.3, 0, 0]}>
          <B p={[0, 0.105, 0]} s={[0.32, 0.21, 0.012]} c={color} r={0.006} metal={0.6} rough={0.4} cast={false} />
          <B p={[0, 0.105, 0.0075]} s={[0.3, 0.19, 0.004]} c="#102030" r={0} glow="#9ec3ea" glowPower={0.6} cast={false} />
        </group>
      </group>
    )
  }
  if (type === 'watch') {
    return (
      <group position={p} rotation={[0, rotY, 0]}>
        <C p={[0, 0.03, 0]} r={[0.035, 0.045]} h={0.06} c="#e9e6e0" seg={12} cast={false} />
        <B p={[0, 0.068, 0]} s={[0.045, 0.014, 0.05]} c={frame} r={0.008} metal={0.7} rough={0.35} cast={false} />
        <B p={[0, 0.077, 0]} s={[0.036, 0.004, 0.04]} c="#0a0f16" r={0} glow="#8fbdea" glowPower={0.5} cast={false} />
      </group>
    )
  }
  if (type === 'tv' || type === 'desktop') {
    const w = type === 'tv' ? 0.3 : 0.26
    return (
      <group position={p} rotation={[0, rotY, 0]}>
        <B p={[0, 0.006, 0]} s={[w * 0.5, 0.012, 0.09]} c={frame} r={0.004} metal={0.6} rough={0.4} cast={false} />
        <B p={[0, 0.03, -0.01]} s={[0.02, 0.05, 0.012]} c={frame} r={0.004} metal={0.6} rough={0.4} cast={false} />
        <B p={[0, 0.05 + w * 0.3, 0]} s={[w, w * 0.6, 0.012]} c={frame} r={0.004} metal={0.5} rough={0.4} cast={false} />
        <B p={[0, 0.05 + w * 0.3, 0.0075]} s={[w - 0.012, w * 0.6 - 0.012, 0.004]} c="#0a0f16" r={0} glow="#8fbdea" glowPower={0.5} cast={false} />
      </group>
    )
  }
  if (type === 'console') {
    return (
      <group position={p} rotation={[0, rotY, 0]}>
        <B p={[0, 0.03, 0]} s={[0.2, 0.06, 0.16]} c={color} r={0.012} rough={0.5} cast={false} />
        <B p={[0, 0.03, 0.081]} s={[0.12, 0.008, 0.004]} c="#0a0f16" r={0} glow="#8fbdea" glowPower={0.6} cast={false} />
      </group>
    )
  }
  if (type === 'earbuds') {
    return (
      <group position={p} rotation={[0, rotY, 0]}>
        <B p={[0, 0.014, 0]} s={[0.06, 0.028, 0.05]} c={color} r={0.012} rough={0.4} cast={false} />
        <B p={[0, 0.034, -0.02]} s={[0.06, 0.012, 0.05]} c={color} r={0.006} rough={0.4} rot={[-0.9, 0, 0]} cast={false} />
      </group>
    )
  }
  const big = type === 'tablet'
  // anything else (phones, and types added later) shows as a slab on a tilted stand
  const w = big ? 0.19 : 0.075
  const h = big ? 0.26 : 0.16
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <B p={[0, 0.012, 0]} s={[w + 0.02, 0.024, 0.08]} c="#e9e6e0" r={0.008} cast={false} />
      <group position={[0, 0.024, 0.01]} rotation={[-0.35, 0, 0]}>
        <B p={[0, h / 2, 0]} s={[w, h, 0.01]} c={frame} r={0.004} metal={0.6} rough={0.4} cast={false} />
        <B p={[0, h / 2, 0.0065]} s={[w - 0.008, h - 0.008, 0.004]} c="#0a0f16" r={0} glow="#8fbdea" glowPower={0.5} cast={false} />
        <B p={[0, h / 2, -0.0065]} s={[w - 0.004, h - 0.004, 0.004]} c={color} r={0} rough={0.5} cast={false} />
      </group>
    </group>
  )
}

/** A long oak table carrying a row of devices. */
export function DisplayTable({ products, seed }: { products: Product[]; seed: number }) {
  return (
    <>
      {[-0.8, 0.8].map((x) => (
        <B key={x} p={[x, 0.43, 0]} s={[0.08, 0.86, 0.7]} c={OAK_PALE} r={0.012} rough={0.55} />
      ))}
      <B p={[0, 0.89, 0]} s={[1.92, 0.06, 0.84]} c={OAK_PALE} r={0.016} rough={0.5} />
      {[-0.7, -0.35, 0, 0.35, 0.7].map((x, i) => (
        <DeviceProp key={x} product={products.length ? products[(i + seed) % products.length] : undefined} p={[x, 0.92, i % 2 ? -0.12 : 0.14]} rotY={i % 2 ? Math.PI : 0} />
      ))}
    </>
  )
}

/** The model for one store item. Kinds shared with the office use the office model. */
export function StoreItem({ kind, c }: { kind: string; c: StoreCtx }) {
  switch (kind) {
    case 'table':
      return <DisplayTable products={c.products} seed={c.seed} />
    case 'demo':
      return (
        <>
          <C p={[0, 0.02, 0]} r={[0.3, 0.32]} h={0.04} c={DARK} seg={20} />
          <C p={[0, 0.5, 0]} r={[0.05, 0.05]} h={0.92} c={STEEL} seg={10} metal={0.8} rough={0.35} />
          <C p={[0, 0.98, 0]} r={[0.36, 0.36]} h={0.04} c={WHITE} seg={24} rough={0.4} />
          <DeviceProp product={c.products.length ? c.products[c.seed % c.products.length] : undefined} p={[0, 1.0, 0]} />
          <C p={[0, 0.995, 0]} r={[0.3, 0.3]} h={0.012} c="#ffffff" glow="#fff1d6" glowPower={0.5 * c.glow} seg={24} cast={false} />
        </>
      )
    case 'shelf':
      return (
        <>
          <B p={[0, 1.2, -0.36]} s={[1.94, 2.4, 0.16]} c="#e9e6e0" r={0.01} rough={0.6} />
          {[0.5, 1.0, 1.5, 2.0].map((y, row) => (
            <group key={y}>
              <B p={[0, y, -0.2]} s={[1.86, 0.03, 0.2]} c={OAK_PALE} r={0.006} rough={0.5} />
              {Array.from({ length: 8 }, (_, i) => (
                <B key={i} p={[-0.8 + i * 0.23, y + 0.135, -0.2]} s={[0.15, 0.24, 0.05]} c={['#2f6f8f', '#e9e4da', '#c9553d', '#3a3d42', '#d6a24f'][(i + row + c.seed) % 5]} r={0.008} rough={0.6} cast={false} />
              ))}
            </group>
          ))}
          <B p={[0, 2.34, -0.27]} s={[1.86, 0.03, 0.03]} c="#ffffff" r={0} glow="#fff1d6" glowPower={c.glow} cast={false} />
        </>
      )
    case 'counter':
      return (
        <>
          <B p={[0, 0.5, -0.05]} s={[0.94, 1.0, 0.5]} c={WHITE} r={0.02} rough={0.4} />
          <B p={[0, 1.02, -0.05]} s={[0.98, 0.04, 0.56]} c={WALNUT} r={0.012} rough={0.35} />
          <B p={[0.2, 1.1, -0.1]} s={[0.26, 0.02, 0.18]} c="#17191c" r={0.006} rot={[-0.5, 0, 0]} cast={false} />
          <B p={[0.2, 1.06, -0.1]} s={[0.05, 0.05, 0.05]} c={DARK} r={0.008} cast={false} />
          <B p={[-0.25, 1.07, -0.05]} s={[0.1, 0.06, 0.16]} c="#26282c" r={0.01} cast={false} />
          <B p={[0, 0.1, 0.204]} s={[0.9, 0.03, 0.012]} c="#ffffff" r={0} glow="#ffd9a8" glowPower={1.2 * c.glow} cast={false} />
          <Person who={STAFF[c.seed % 3]} pose="stand" arms="down" p={[0, 0, -0.38]} rotY={Math.PI} />
        </>
      )
    case 'support':
      return (
        <>
          <B p={[0, 0.52, -0.1]} s={[1.92, 1.04, 0.5]} c={WALNUT} r={0.015} rough={0.4} />
          <B p={[0, 1.06, -0.08]} s={[1.96, 0.04, 0.6]} c="#e9e6e0" r={0.012} rough={0.3} />
          {[-0.5, 0.5].map((x) => (
            <group key={x}>
              <B p={[x, 1.09, -0.12]} s={[0.3, 0.016, 0.21]} c="#b9bcc0" r={0.006} metal={0.7} rough={0.35} cast={false} />
              <B p={[x, 1.2, -0.24]} s={[0.3, 0.2, 0.012]} c="#102030" r={0.004} glow="#9ec3ea" glowPower={0.6 * c.glow} rot={[-0.2, 0, 0]} cast={false} />
              <C p={[x, 0.015, 0.4]} r={[0.17, 0.19]} h={0.03} c={STEEL} seg={14} cast={false} />
              <C p={[x, 0.37, 0.4]} r={[0.02, 0.02]} h={0.68} c={STEEL} seg={8} cast={false} />
              <C p={[x, 0.735, 0.4]} r={[0.17, 0.17]} h={0.05} c={OAK_PALE} seg={14} />
            </group>
          ))}
          <Person who={STAFF[(c.seed + 1) % 3]} pose="stand" arms="down" p={[0, 0, -0.42]} rotY={Math.PI} />
        </>
      )
    case 'repair':
      return (
        <>
          {[-0.88, 0.88].map((x) => (
            <B key={x} p={[x, 0.43, -0.05]} s={[0.06, 0.86, 0.66]} c={STEEL} r={0.008} metal={0.7} rough={0.4} />
          ))}
          <B p={[0, 0.88, -0.05]} s={[1.92, 0.04, 0.76]} c="#3d6a54" r={0.008} rough={0.6} />
          <B p={[0, 1.4, -0.41]} s={[1.92, 1.0, 0.03]} c="#2c3036" r={0.006} />
          {Array.from({ length: 6 }, (_, i) => (
            <B key={i} p={[-0.75 + i * 0.3, 1.4 + (i % 2) * 0.2, -0.39]} s={[0.03, 0.26, 0.016]} c={i % 2 ? '#c9553d' : STEEL} r={0.004} cast={false} />
          ))}
          <DeviceProp p={[-0.4, 0.9, 0]} />
          <C p={[0.3, 0.92, -0.1]} r={[0.09, 0.1]} h={0.04} c={DARK} seg={14} cast={false} />
          <C p={[0.3, 1.1, -0.1]} r={[0.012, 0.012]} h={0.32} c={STEEL} seg={8} cast={false} />
          <C p={[0.3, 1.28, -0.1]} r={[0.11, 0.11]} h={0.03} c="#fff6e0" glow="#fff1d6" glowPower={1.1 * c.glow} seg={16} cast={false} />
          <B p={[0.7, 0.96, 0]} s={[0.3, 0.12, 0.22]} c="#c9553d" r={0.012} cast={false} />
        </>
      )
    case 'forum':
      return (
        <>
          <B p={[0, 1.5, -0.36]} s={[2.92, 3.0, 0.16]} c="#17191c" r={0.01} rough={0.6} />
          <B p={[0, 1.6, -0.276]} s={[2.76, 1.7, 0.012]} c="#0c1622" r={0} glow="#3a78c8" glowPower={0.8 * c.glow} rough={0.15} cast={false} />
          <Sign p={[0, 1.6, -0.266]} size={[1.8, 1.0]} name={c.company} logo={c.logo} glow={1.1 * c.glow} />
          <B p={[0, 0.06, -0.24]} s={[2.9, 0.03, 0.04]} c="#ffffff" r={0} glow="#ffd9a8" glowPower={1.4 * c.glow} cast={false} />
        </>
      )
    case 'stools':
      return (
        <>
          {[-0.7, -0.24, 0.24, 0.7].map((x, i) => (
            <B key={x} p={[x, 0.21, (i % 2 ? 0.08 : -0.08)]} s={[0.4, 0.42, 0.4]} c={i % 2 ? OAK_PALE : WALNUT} r={0.02} rough={0.55} />
          ))}
        </>
      )
    case 'stockrack':
      return (
        <>
          {[-0.92, 0.92].map((x) => [-0.3, 0.3].map((z) => <B key={`${x}${z}`} p={[x, 1.1, z]} s={[0.05, 2.2, 0.05]} c={STEEL} r={0.008} metal={0.7} rough={0.4} />))}
          {[0.15, 0.75, 1.35, 1.95].map((y, row) => (
            <group key={y}>
              <B p={[0, y, 0]} s={[1.9, 0.04, 0.66]} c={STEEL} r={0.006} metal={0.7} rough={0.4} />
              {Array.from({ length: 6 }, (_, i) => (
                <B key={i} p={[-0.75 + i * 0.3, y + 0.02 + 0.11 + hash(c.seed + row * 7 + i) * 0.06, 0]} s={[0.26, 0.22 + hash(c.seed + row * 7 + i) * 0.12, 0.5]} c={i % 3 === 0 ? '#e9e6e0' : '#d9d2c2'} r={0.008} rough={0.8} cast={false} />
              ))}
            </group>
          ))}
        </>
      )
    case 'bench':
      return (
        <>
          {[-0.36, 0.36].map((x) => (
            <B key={x} p={[x, 0.2, 0]} s={[0.06, 0.4, 0.4]} c={DARK} r={0.01} />
          ))}
          <B p={[0, 0.43, 0]} s={[0.94, 0.06, 0.46]} c={OAK_PALE} r={0.015} rough={0.5} />
        </>
      )
    case 'sign':
      return (
        <>
          <B p={[0, 0.08, 0]} s={[0.7, 0.16, 0.5]} c="#8c8e90" r={0.02} rough={0.9} />
          <B p={[0, 1.76, 0]} s={[0.56, 3.2, 0.2]} c="#17191c" r={0.02} rough={0.5} />
          <B p={[0, 2.6, 0.102]} s={[0.46, 1.2, 0.012]} c="#0c0d0f" r={0} glow={c.color} glowPower={0.5 * c.glow} cast={false} />
          <Sign p={[0, 2.6, 0.11]} size={[0.42, 0.42]} name={c.company.slice(0, 1)} logo={c.logo} glow={0.5 + 0.7 * c.glow} />
        </>
      )
  }
  return <OfficeItem kind={kind} c={{ glow: c.glow, company: c.company, logo: c.logo, color: c.color, seed: c.seed }} />
}

const SHIRTS = ['#c9553d', '#31506b', '#e9e4da', '#3f7d4d', '#d6a24f', '#6a5a7a', '#2c3036']

/** Shoppers browsing: standing figures on free floor near the fixtures. */
export function Shoppers({ spots, count }: { spots: [number, number][]; count: number }) {
  return (
    <>
      {spots.slice(0, count).map(([x, z], i) => (
        <LivePerson key={i} who={{ look: Math.floor(hash(i * 13 + 5) * 9000), color: SHIRTS[i % SHIRTS.length] }} p={[x, 0, z]} rotY={hash(i * 7) * 6.28} />
      ))}
    </>
  )
}
