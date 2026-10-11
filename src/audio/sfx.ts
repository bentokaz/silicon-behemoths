// UI and event sounds synthesised with the Web Audio API. No audio files.

let ctx: AudioContext | null = null
let volume = 0.5
try {
  const saved = localStorage.getItem('sb-volume')
  if (saved !== null) volume = Number(saved)
} catch {
  /* storage unavailable */
}

export const getVolume = () => volume
export function setVolume(v: number) {
  volume = v
  try {
    localStorage.setItem('sb-volume', String(v))
  } catch {
    /* storage unavailable */
  }
}

function audio(): AudioContext | null {
  if (volume <= 0) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, duration: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + delay
  const osc = a.createOscillator()
  const amp = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration)
  amp.gain.setValueAtTime(0, t)
  amp.gain.linearRampToValueAtTime(gain * volume, t + 0.004)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  osc.connect(amp).connect(a.destination)
  osc.start(t)
  osc.stop(t + duration + 0.02)
}

let noiseBuffer: AudioBuffer | null = null
/** A burst of filtered noise: thuds, hisses, claps. */
function noise(duration: number, gain: number, freq: number, q = 1, delay = 0, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
  const a = audio()
  if (!a) return
  if (!noiseBuffer) {
    noiseBuffer = a.createBuffer(1, a.sampleRate, a.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const t = a.currentTime + delay
  const src = a.createBufferSource()
  src.buffer = noiseBuffer
  src.loop = true
  const filter = a.createBiquadFilter()
  filter.type = type
  filter.frequency.setValueAtTime(freq, t)
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + duration)
  filter.Q.value = q
  const amp = a.createGain()
  amp.gain.setValueAtTime(0, t)
  amp.gain.linearRampToValueAtTime(gain * volume, t + 0.006)
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration)
  src.connect(filter).connect(amp).connect(a.destination)
  src.start(t, Math.random() * 0.5)
  src.stop(t + duration + 0.05)
}

const chord = (freqs: number[], duration: number, gain: number, delay = 0, type: OscillatorType = 'triangle') => freqs.forEach((f) => tone(f, duration, type, gain / freqs.length, delay))

let lastHover = 0
let lastBuild = 0
export const sfx = {
  hover() {
    const now = performance.now()
    if (now - lastHover < 45) return
    lastHover = now
    tone(2400, 0.018, 'square', 0.025)
  },
  click: () => tone(1250, 0.035, 'square', 0.07, 0, 700),
  toggle: () => tone(900, 0.03, 'square', 0.05, 0, 1400),
  confirm() {
    tone(660, 0.09, 'triangle', 0.16)
    tone(990, 0.14, 'triangle', 0.16, 0.07)
  },
  cash() {
    tone(1568, 0.07, 'triangle', 0.14)
    tone(2093, 0.16, 'triangle', 0.14, 0.06)
  },
  notify: () => tone(880, 0.16, 'sine', 0.14, 0, 1320),
  error: () => tone(190, 0.18, 'sawtooth', 0.1, 0, 120),
  /** Something heavy set down: furniture, machines. */
  build() {
    const now = performance.now()
    if (now - lastBuild < 60) return
    lastBuild = now
    tone(150, 0.12, 'sine', 0.3, 0, 70)
    noise(0.08, 0.14, 900, 0.8)
  },
  /** Walls going up: a longer rumble with a ring at the end. */
  zone() {
    noise(0.35, 0.16, 300, 0.7, 0, 'lowpass', 900)
    tone(110, 0.3, 'sine', 0.25, 0, 60)
    tone(1320, 0.12, 'triangle', 0.06, 0.28)
  },
  demolish() {
    noise(0.45, 0.2, 1200, 0.5, 0, 'lowpass', 150)
    tone(90, 0.35, 'sawtooth', 0.12, 0, 40)
  },
  /** A drawer or panel sliding. */
  whoosh: () => noise(0.16, 0.06, 500, 0.6, 0, 'bandpass', 3200),
  research() {
    tone(784, 0.1, 'sine', 0.12)
    tone(1175, 0.1, 'sine', 0.12, 0.09)
    tone(1568, 0.3, 'sine', 0.12, 0.18)
  },
  hire() {
    tone(523, 0.08, 'triangle', 0.14)
    tone(784, 0.16, 'triangle', 0.14, 0.08)
  },
  /** A product goes on sale: a short rising fanfare. */
  launch() {
    chord([392, 494, 587], 0.16, 0.3, 0, 'sawtooth')
    chord([523, 659, 784], 0.16, 0.3, 0.16, 'sawtooth')
    chord([659, 784, 988, 1319], 0.6, 0.34, 0.32, 'triangle')
    noise(0.5, 0.05, 6000, 0.5, 0.32, 'highpass')
  },
  /** A goal reached: bright and a little longer than a notification. */
  goal() {
    ;[784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, i * 0.07))
    tone(2093, 0.5, 'sine', 0.08, 0.3)
  },
  alert() {
    tone(440, 0.12, 'square', 0.07)
    tone(330, 0.2, 'square', 0.07, 0.13)
  },
  /** The opening bell. */
  bell() {
    for (let i = 0; i < 3; i++) {
      tone(1760, 0.5, 'sine', 0.12, i * 0.22)
      tone(2637, 0.3, 'sine', 0.05, i * 0.22)
    }
  },
  /** A crowd clapping for `seconds`; louder for a better show. */
  applause(seconds = 2.5, strength = 1) {
    const claps = Math.round(seconds * 26)
    for (let i = 0; i < claps; i++) {
      const at = (i / claps) * seconds + Math.random() * 0.05
      const swell = Math.sin((Math.PI * i) / claps)
      noise(0.05, 0.035 * strength * (0.4 + swell), 1400 + Math.random() * 1800, 1.2, at)
    }
    noise(seconds, 0.03 * strength, 2500, 0.3, 0, 'bandpass')
  },
  /** House lights down. */
  hush: () => noise(0.9, 0.06, 2400, 0.4, 0, 'lowpass', 200),
  drum() {
    tone(120, 0.5, 'sine', 0.4, 0, 45)
    noise(0.12, 0.1, 200, 0.8)
  },
}

/** Tick on hover and click for every interactive control on the page. */
export function installUiSounds(): () => void {
  const sel = 'button, select, [role="button"], input[type="range"], input[type="checkbox"]'
  const over = (e: Event) => {
    const el = (e.target as Element | null)?.closest?.(sel)
    const from = ((e as PointerEvent).relatedTarget as Element | null)?.closest?.(sel)
    if (el && el !== from) sfx.hover()
  }
  const down = (e: Event) => {
    if ((e.target as Element | null)?.closest?.(sel)) sfx.click()
  }
  document.addEventListener('pointerover', over)
  document.addEventListener('pointerdown', down)
  return () => {
    document.removeEventListener('pointerover', over)
    document.removeEventListener('pointerdown', down)
  }
}
