// A low, slowly breathing chord for the minutes before a keynote: a few detuned
// voices through a soft filter that opens and closes. Cheap, and stops cleanly.
import { audioContext, getVolume } from './sfx'

/** Starts the pre-show bed. `key` picks the chord, so each company's room sounds a little its own. */
export function ambientPad(key = 0): {
  set: (level: number, seconds?: number) => void
  stop: () => void
} {
  const a = audioContext()
  if (!a) return { set: () => {}, stop: () => {} }
  const master = a.createGain()
  master.gain.value = 0
  const filter = a.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 700
  filter.Q.value = 0.7
  filter.connect(master).connect(a.destination)
  // a slow sweep on the filter, the room breathing
  const sweep = a.createOscillator()
  const sweepDepth = a.createGain()
  sweep.frequency.value = 0.07
  sweepDepth.gain.value = 380
  sweep.connect(sweepDepth).connect(filter.frequency)
  const root = 55 * 2 ** ((Math.abs(Math.round(key)) % 7) / 12)
  const nodes: OscillatorNode[] = [sweep]
  for (const [ratio, type, gain] of [
    [1, 'sine', 0.22],
    [1.5, 'triangle', 0.07],
    [2, 'sine', 0.09],
    [2.38, 'triangle', 0.05],
    [3, 'sine', 0.035],
  ] as const) {
    for (const cents of [-7, 7]) {
      const o = a.createOscillator()
      o.type = type
      o.frequency.value = root * ratio
      o.detune.value = cents
      const g = a.createGain()
      g.gain.value = gain / 2
      o.connect(g).connect(filter)
      o.start()
      nodes.push(o)
    }
  }
  sweep.start()
  return {
    set(level, seconds = 2) {
      master.gain.cancelScheduledValues(a.currentTime)
      master.gain.setTargetAtTime(Math.max(0, level) * 0.5 * getVolume(), a.currentTime, seconds / 3)
    },
    stop() {
      master.gain.cancelScheduledValues(a.currentTime)
      master.gain.setTargetAtTime(0, a.currentTime, 0.4)
      for (const n of nodes)
        try {
          n.stop(a.currentTime + 2)
        } catch {
          /* already stopped */
        }
    },
  }
}
