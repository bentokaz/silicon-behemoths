// Seeded RNG (mulberry32). The state lives on the object passed in, so the
// simulation stays deterministic and the RNG position is saved with the game.

export interface RngHolder {
  rng: number
}

export function rand(s: RngHolder): number {
  s.rng = (s.rng + 0x6d2b79f5) | 0
  let t = s.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export const range = (s: RngHolder, min: number, max: number) => min + rand(s) * (max - min)
export const int = (s: RngHolder, min: number, max: number) => Math.floor(range(s, min, max + 1))
export const pick = <T>(s: RngHolder, arr: readonly T[]): T => arr[Math.floor(rand(s) * arr.length)]
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
