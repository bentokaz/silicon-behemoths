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
let lastSnap = 0
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
  // ---- the device studio: parts handled on the model, and the short demonstrations
  /** A part lifted off the surface. */
  pick: () => tone(520, 0.05, 'triangle', 0.08, 0, 760),
  /** A part set down: a small, dry knock. */
  drop() {
    tone(210, 0.07, 'sine', 0.2, 0, 120)
    noise(0.04, 0.07, 1800, 1.1)
  },
  /** A part clicking onto a guide line. */
  snap() {
    const now = performance.now()
    if (now - lastSnap < 70) return
    lastSnap = now
    tone(1900, 0.022, 'square', 0.05)
    tone(2850, 0.03, 'sine', 0.04, 0.012)
  },
  /** The body stretched or squeezed by a handle. */
  stretch() {
    const now = performance.now()
    if (now - lastSnap < 55) return
    lastSnap = now
    tone(300, 0.03, 'triangle', 0.05, 0, 340)
  },
  /** A charger or cable making contact, then power flowing. */
  charge() {
    noise(0.03, 0.09, 2600, 1.4)
    tone(180, 0.05, 'sine', 0.18, 0, 110)
    tone(440, 0.5, 'sine', 0.07, 0.12, 880)
  },
  /** A radio link: contactless, satellite, a sensor reading. */
  ping() {
    tone(1480, 0.1, 'sine', 0.09)
    tone(1976, 0.22, 'sine', 0.08, 0.1)
  },
  /** Water beading and running off. */
  water() {
    noise(0.5, 0.05, 3200, 0.6, 0, 'bandpass', 900)
    for (let i = 0; i < 4; i++) tone(900 + i * 260, 0.05, 'sine', 0.04, 0.08 + i * 0.09, 1500 + i * 200)
  },
  /** The shell turning see-through to show what is inside. */
  scan() {
    noise(0.35, 0.04, 700, 0.9, 0, 'bandpass', 4200)
    tone(240, 0.3, 'sine', 0.06, 0, 520)
  },
  /** Speakers and drivers: a short low note with a ring. */
  thump() {
    tone(96, 0.22, 'sine', 0.26, 0, 62)
    tone(660, 0.16, 'triangle', 0.05, 0.03)
  },
  /** Air moving: fans, vents. */
  air: () => noise(0.7, 0.05, 500, 0.5, 0, 'bandpass', 1700),
  /** A feature taken off the device. */
  remove: () => tone(520, 0.12, 'triangle', 0.07, 0, 300),
}

// ---------------------------------------------------------------- ambience

export type Ambience = 'none' | 'office' | 'factory' | 'store' | 'venue' | 'outdoors'
let ambient: { kind: Ambience; stop: () => void } | null = null
let ambienceLevel = 0.5
export const setAmbienceLevel = (v: number) => {
  ambienceLevel = v
  const kind = ambient?.kind
  if (kind) {
    setAmbience('none')
    setAmbience(kind)
  }
}

/** A looping bed of filtered noise for a place, with small sounds scattered over it. */
export function setAmbience(kind: Ambience) {
  if (ambient?.kind === kind) return
  ambient?.stop()
  ambient = null
  const a = kind === 'none' || ambienceLevel <= 0 ? null : audio()
  if (!a) return
  if (!noiseBuffer) {
    noiseBuffer = a.createBuffer(1, a.sampleRate, a.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }
  const master = a.createGain()
  master.gain.setValueAtTime(0, a.currentTime)
  master.gain.linearRampToValueAtTime(volume * ambienceLevel, a.currentTime + 1.2)
  master.connect(a.destination)
  const bed = (freq: number, q: number, gain: number, type: BiquadFilterType, wobble = 0) => {
    const src = a.createBufferSource()
    src.buffer = noiseBuffer
    src.loop = true
    const filter = a.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const amp = a.createGain()
    amp.gain.value = gain
    if (wobble) {
      // a slow swell, so the bed never sounds like a held tone
      const lfo = a.createOscillator()
      const depth = a.createGain()
      lfo.frequency.value = wobble
      depth.gain.value = gain * 0.5
      lfo.connect(depth).connect(amp.gain)
      lfo.start()
    }
    src.connect(filter).connect(amp).connect(master)
    src.start(0, Math.random())
    return src
  }
  const blip = (freq: number, len: number, gain: number, type: BiquadFilterType = 'bandpass') => {
    const src = a.createBufferSource()
    src.buffer = noiseBuffer
    const filter = a.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = 2
    const amp = a.createGain()
    const now = a.currentTime
    amp.gain.setValueAtTime(gain, now)
    amp.gain.exponentialRampToValueAtTime(0.0001, now + len)
    src.connect(filter).connect(amp).connect(master)
    src.start(now, Math.random() * 0.5, len + 0.05)
  }
  const beds: AudioBufferSourceNode[] = []
  let every = 400
  let scatter = () => {}
  if (kind === 'office') {
    beds.push(bed(160, 0.6, 0.05, 'lowpass'), bed(900, 0.5, 0.012, 'bandpass', 0.07))
    every = 170
    // keys, the odd mouse click, a chair
    scatter = () => (Math.random() < 0.55 ? blip(2600 + Math.random() * 1800, 0.025, 0.02) : Math.random() < 0.04 ? blip(300, 0.2, 0.02, 'lowpass') : undefined)
  } else if (kind === 'factory') {
    beds.push(bed(90, 0.8, 0.14, 'lowpass'), bed(1400, 0.7, 0.02, 'bandpass', 0.4))
    every = 620
    scatter = () => (blip(420, 0.09, 0.07), Math.random() < 0.3 ? blip(3200, 0.05, 0.03) : undefined)
  } else if (kind === 'store') {
    beds.push(bed(520, 0.5, 0.05, 'bandpass', 0.13), bed(1700, 0.6, 0.014, 'bandpass', 0.21))
    every = 900
    scatter = () => (Math.random() < 0.3 ? blip(2100, 0.06, 0.025) : undefined)
  } else if (kind === 'venue') {
    beds.push(bed(450, 0.4, 0.07, 'bandpass', 0.1), bed(1500, 0.5, 0.03, 'bandpass', 0.17))
    every = 1400
    scatter = () => (Math.random() < 0.25 ? blip(1200, 0.4, 0.03) : undefined)
  } else {
    beds.push(bed(380, 0.3, 0.05, 'lowpass', 0.06), bed(3800, 0.8, 0.006, 'bandpass', 0.09))
    every = 2600
    // a bird now and then
    scatter = () => (Math.random() < 0.35 ? (blip(4200, 0.07, 0.02), window.setTimeout(() => blip(4700, 0.06, 0.018), 110)) : undefined)
  }
  const timer = window.setInterval(() => scatter(), every)
  ambient = {
    kind,
    stop() {
      window.clearInterval(timer)
      master.gain.cancelScheduledValues(a.currentTime)
      master.gain.setTargetAtTime(0, a.currentTime, 0.25)
      window.setTimeout(() => {
        for (const b of beds) b.stop()
        master.disconnect()
      }, 1200)
    },
  }
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
