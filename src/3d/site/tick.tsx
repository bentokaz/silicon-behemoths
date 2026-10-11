// One heartbeat for everything that moves on a site. Parts register a
// function; the view calls them all once a frame, in order. Keeping it in one
// place means the whole scene can also be stepped by hand in development.
import { useFrame } from '@react-three/fiber'
import { type ReactNode, createContext, useContext, useEffect, useMemo, useRef } from 'react'

/** Called with the seconds since the last beat and the seconds since the view opened. */
export type Ticker = (dt: number, now: number) => void

export interface Pulse {
  add(fn: Ticker, order: number): () => void
  /** Advances everything by `dt` seconds. */
  beat(dt: number): void
  now: number
}

function makePulse(): Pulse {
  let list: { fn: Ticker; order: number }[] = []
  const pulse: Pulse = {
    now: 0,
    add(fn, order) {
      const entry = { fn, order }
      list = [...list, entry].sort((a, b) => a.order - b.order)
      return () => {
        list = list.filter((e) => e !== entry)
      }
    },
    beat(dt) {
      pulse.now += dt
      for (const e of list) e.fn(dt, pulse.now)
    },
  }
  return pulse
}

const PulseCtx = createContext<Pulse | null>(null)

/** Goes inside the canvas, around everything that animates. */
export function Heartbeat({ children, onPulse }: { children: ReactNode; onPulse?: (p: Pulse) => void }) {
  const pulse = useMemo(makePulse, [])
  useEffect(() => onPulse?.(pulse), [pulse, onPulse])
  useFrame((_, dt) => pulse.beat(Math.min(0.1, dt)))
  return <PulseCtx.Provider value={pulse}>{children}</PulseCtx.Provider>
}

/** Runs `fn` every frame. Lower `order` runs first: the simulation at 0, things that draw it after. */
export function useTick(fn: Ticker, order = 10) {
  const pulse = useContext(PulseCtx)
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => pulse?.add((dt, now) => ref.current(dt, now), order), [pulse, order])
}

export const usePulse = () => useContext(PulseCtx)
