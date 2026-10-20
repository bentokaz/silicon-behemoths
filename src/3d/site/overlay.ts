// What the factory panels ask the 3D floor to point out: the rates on every
// joint, and the blocks that hold a line back. A tiny store of its own, so the
// panels can set it without threading props through the builder.
import { useSyncExternalStore } from 'react'

export interface FactoryOverlay {
  /** Rates on the joints and belts coloured by how full they run. */
  rates: boolean
  /** Blocks to mark as the bottleneck, and why. */
  focus: string[]
  why: string
}

let state: FactoryOverlay = { rates: false, focus: [], why: '' }
const subs = new Set<() => void>()

export function setFactoryOverlay(next: Partial<FactoryOverlay>) {
  state = { ...state, ...next }
  for (const f of subs) f()
}
export const factoryOverlay = () => state
export function useFactoryOverlay(): FactoryOverlay {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb)
      return () => subs.delete(cb)
    },
    () => state,
  )
}
