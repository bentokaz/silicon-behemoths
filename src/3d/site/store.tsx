// Store fixtures. Display tables show the devices the company actually sells.
import type { Product } from '../../sim/types'
import { Plant } from './office'
import { B, C, DARK, LEAF, OAK_PALE, Person, S, STEEL, Sign, WHITE, hash } from './kit'

export interface StoreCtx {
  /** Devices currently on sale, shown on tables and demo pods. */
  products: Product[]
  glow: number
  company: string
  logo?: string
  seed: number
  /** True if a member of staff should stand here. */
  staffed: boolean
}

/** A small stand-in for a device: a slab in the product's colours with a lit screen. */
function MiniDevice({ product, p, rotY = 0, glow }: { product: Product; p: [number, number, number]; rotY?: number; glow: number }) {
  const b = product.design.body
  // millimetres to metres, slightly enlarged so devices read from across the room
  const k = product.type === 'watch' ? 0.0022 : 0.0016
  const w = b.width * k
  const h = b.height * k
  const t = Math.max(0.008, b.thickness * k)
  if (product.type === 'laptop') {
    return (
      <group position={p} rotation={[0, rotY, 0]}>
        <B p={[0, t / 2, 0]} s={[w, t, h]} c={b.frameColor} r={0.004} metal={0.6} rough={0.4} cast={false} />
        <B p={[0, t + h * 0.47, -h / 2 - 0.004]} s={[w, h, 0.008]} c={b.backColor} r={0.004} metal={0.6} rough={0.4} rot={[-0.28, 0, 0]} cast={false} />
        <B p={[0, t + h * 0.47, -h / 2 + 0.003]} s={[w * 0.94, h * 0.9, 0.002]} c="#122033" r={0} glow="#8fbdea" glowPower={0.8 * glow} rot={[-0.28, 0, 0]} cast={false} />
      </group>
    )
  }
  const tilt = -1.15
  return (
    <group position={p} rotation={[0, rotY, 0]}>
      <B p={[0, 0.012, 0.01]} s={[w * 0.5, 0.024, h * 0.3]} c={STEEL} r={0.004} metal={0.8} rough={0.35} cast={false} />
      <group position={[0, 0.03 + (h / 2) * Math.cos(-tilt), 0]} rotation={[tilt, 0, 0]}>
        <B p={[0, 0, 0]} s={[w, h, t]} c={b.frameColor} r={Math.min(0.012, w / 4)} metal={0.5} rough={0.4} cast={false} />
        <B p={[0, 0, t / 2 + 0.001]} s={[w * 0.92, h * 0.94, 0.001]} c="#122033" r={0} glow={['#7fd1ff', '#ffd27f', '#9dffb0', '#ff9ec4'][product.design.wallpaper % 4]} glowPower={0.7 * glow} cast={false} />
      </group>
    </group>
  )
}

function Table({ c, w = 1.9 }: { c: StoreCtx; w?: number }) {
  const slots = c.products.length ? 4 : 0
  return (
    <>
      <B p={[0, 0.86, 0]} s={[w, 0.07, 0.88]} c={OAK_PALE} r={0.02} rough={0.5} />
      {[-w / 2 + 0.14, w / 2 - 0.14].map((x) => (
        <B key={x} p={[x, 0.42, 0]} s={[0.1, 0.83, 0.78]} c={OAK_PALE} r={0.02} rough={0.5} />
      ))}
      {Array.from({ length: slots }, (_, i) => {
        const product = c.products[(i + c.seed) % c.products.length]
        return <MiniDevice key={i} product={product} p={[-w / 2 + 0.32 + (i * (w - 0.64)) / 3, 0.9, i % 2 ? -0.12 : 0.14]} rotY={i % 2 ? Math.PI : 0} glow={c.glow} />
      })}
    </>
  )
}

/** The model for one store item. */
export function StoreItem({ kind, c }: { kind: string; c: StoreCtx }) {
  switch (kind) {
    case 'table':
      return <Table c={c} />
    case 'demo': {
      const product = c.products.length ? c.products[c.seed % c.products.length] : undefined
      return (
        <>
          <C p={[0, 0.5, 0]} r={[0.26, 0.32]} h={1.0} c={WHITE} seg={32} rough={0.35} />
          <C p={[0, 1.01, 0]} r={[0.3, 0.3]} h={0.03} c={OAK_PALE} seg={32} rough={0.5} />
          <C p={[0, 0.03, 0]} r={[0.36, 0.36]} h={0.01} c="#fff" glow="#ffe2b8" glowPower={1.2 * c.glow} seg={32} cast={false} />
          {product && <MiniDevice product={product} p={[0, 1.03, 0]} glow={c.glow} />}
        </>
      )
    }
    case 'shelf':
      return (
        <>
          <B p={[0, 1.2, -0.36]} s={[1.94, 2.4, 0.16]} c={WHITE} r={0.01} rough={0.5} />
          {[0.5, 1.0, 1.5, 2.0].map((y, row) => (
            <group key={y}>
              <B p={[0, y, -0.2]} s={[1.86, 0.03, 0.26]} c={OAK_PALE} r={0.006} rough={0.5} cast={false} />
              <B p={[0, y - 0.02, -0.08]} s={[1.8, 0.008, 0.01]} c="#fff" r={0} glow="#fff1d6" glowPower={1.1 * c.glow} cast={false} />
              {Array.from({ length: 8 }, (_, i) => (
                <B key={i} p={[-0.8 + i * 0.228, y + 0.13, -0.2]} s={[0.15, 0.22, 0.05]} c={['#22262b', '#e9e4da', '#c9553d', '#2f6f8f', '#d6a24f', '#3f7d4d'][(i + row * 2 + c.seed) % 6]} r={0.008} rough={0.5} cast={false} />
              ))}
            </group>
          ))}
        </>
      )
    case 'counter':
      return (
        <>
          <B p={[0, 0.5, 0]} s={[0.92, 1.0, 0.6]} c={WHITE} r={0.02} rough={0.4} />
          <B p={[0, 1.02, 0]} s={[0.96, 0.04, 0.66]} c={OAK_PALE} r={0.012} rough={0.5} />
          <B p={[0.2, 1.15, -0.05]} s={[0.22, 0.2, 0.02]} c={DARK} r={0.008} rot={[-0.3, 0, 0]} cast={false} />
          <B p={[0.2, 1.15, -0.038]} s={[0.2, 0.18, 0.002]} c="#102030" r={0} glow="#9ec3ea" glowPower={0.8 * c.glow} rot={[-0.3, 0, 0]} cast={false} />
          <B p={[-0.2, 1.06, 0.1]} s={[0.1, 0.03, 0.16]} c={DARK} r={0.008} cast={false} />
          <B p={[0, 0.12, 0.305]} s={[0.88, 0.02, 0.006]} c="#fff" r={0} glow="#ffd9a8" glowPower={1.3 * c.glow} cast={false} />
          {c.staffed && <Person who={{ look: c.seed * 53 + 7, color: '#22262b' }} pose="stand" p={[0, 0, -0.55]} rotY={Math.PI} />}
        </>
      )
    case 'support':
      return (
        <>
          <B p={[0, 1.02, 0]} s={[1.9, 0.07, 0.66]} c={OAK_PALE} r={0.02} rough={0.5} />
          <B p={[0, 0.5, -0.2]} s={[1.8, 1.0, 0.2]} c={WHITE} r={0.02} rough={0.4} />
          {[-0.6, 0.6].map((x) => (
            <group key={x}>
              <B p={[x, 1.2, -0.15]} s={[0.3, 0.22, 0.02]} c={DARK} r={0.008} rot={[-0.25, 0, 0]} cast={false} />
              <B p={[x, 1.2, -0.138]} s={[0.28, 0.2, 0.002]} c="#102030" r={0} glow="#9ec3ea" glowPower={0.8 * c.glow} rot={[-0.25, 0, 0]} cast={false} />
              <C p={[x, 0.72, 0.55]} r={[0.17, 0.17]} h={0.05} c={OAK_PALE} seg={16} />
              <C p={[x, 0.36, 0.55]} r={[0.02, 0.02]} h={0.7} c={STEEL} metal={0.9} rough={0.3} seg={8} cast={false} />
              <C p={[x, 0.015, 0.55]} r={[0.17, 0.19]} h={0.03} c={STEEL} metal={0.9} rough={0.3} seg={16} cast={false} />
            </group>
          ))}
          {c.staffed && <Person who={{ look: c.seed * 71 + 3, color: '#2f6f8f' }} pose="stand" p={[0, 0, -0.6]} rotY={Math.PI} />}
        </>
      )
    case 'bench':
      return (
        <>
          <B p={[0, 0.24, 0]} s={[0.9, 0.48, 0.9]} c={OAK_PALE} r={0.03} rough={0.55} />
          <B p={[0, 0.5, 0]} s={[0.8, 0.05, 0.8]} c="#4a5568" r={0.03} rough={1} cast={false} />
        </>
      )
    case 'plant':
      return <Plant seed={c.seed} />
    case 'tree':
      return (
        <>
          <C p={[0, 0.3, 0]} r={[0.36, 0.3]} h={0.6} c={WHITE} seg={24} rough={0.4} />
          <C p={[0, 0.6, 0]} r={[0.33, 0.33]} h={0.02} c="#3b2e25" seg={24} rough={1} cast={false} />
          <C p={[0, 1.3, 0]} r={[0.04, 0.07]} h={1.4} c="#6b5444" seg={8} rough={0.95} />
          {[[0, 2.3, 0, 0.55], [0.34, 2.0, 0.16, 0.4], [-0.3, 2.05, -0.14, 0.42], [0.05, 2.75, -0.1, 0.34]].map(([x, y, z, r], i) => (
            <S key={i} p={[x, y, z]} r={r} c={LEAF[(i + c.seed) % LEAF.length]} rough={0.95} flat />
          ))}
        </>
      )
    case 'logowall':
      return (
        <>
          <B p={[0, 1.3, -0.4]} s={[1.94, 2.6, 0.1]} c={WHITE} r={0.01} rough={0.5} />
          <Sign p={[0, 1.5, -0.345]} size={[1.5, 0.9]} name={c.company} logo={c.logo} glow={0.2 + c.glow} />
          <B p={[0, 0.06, -0.33]} s={[1.9, 0.02, 0.02]} c="#fff" r={0} glow="#ffd9a8" glowPower={1.5 * c.glow} cast={false} />
        </>
      )
    case 'rug':
      return <B p={[0, 0.012, 0]} s={[1.9, 0.02, 1.9]} c={['#b9b1a3', '#5c6470', '#8a7560'][c.seed % 3]} r={0.008} rough={1} cast={false} />
  }
  return <S p={[0, 0.4, 0]} r={0.3} c="#ff00ff" />
}

/** Shoppers standing around the floor; how many depends on how busy the store is. */
export function Shoppers({ spots, count }: { spots: [number, number][]; count: number }) {
  const COLORS = ['#c9553d', '#2f6f8f', '#d6a24f', '#3f7d4d', '#8f7ad6', '#e9e4da', '#4a5568']
  return (
    <>
      {spots.slice(0, count).map(([x, z], i) => (
        <Person key={i} who={{ look: Math.floor(hash(i * 13 + 5) * 9999), color: COLORS[i % COLORS.length] }} pose="stand" p={[x, 0, z]} rotY={hash(i + 3) * 6.28} />
      ))}
    </>
  )
}
