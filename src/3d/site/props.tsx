// Small stand-ins for the company's devices, shown on tables, benches and in cases.
import type { Product } from '../../sim/types'
import { B, C } from './kit'

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

