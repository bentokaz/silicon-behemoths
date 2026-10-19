// UI and event sounds synthesised with the Web Audio API. No audio files.

let ctx: AudioContext | null = null
let volume = 0.5
try {
  const saved = localStorage.getItem('sb-volume')
  // (a damaged entry must not become a volume of NaN, which silences everything for good)
  if (saved !== null && Number.isFinite(Number(saved))) volume = Math.max(0, Math.min(1, Number(saved)))
} catch {
  /* storage unavailable */
}

export const getVolume = () => volume
export function setVolume(v: number) {
  volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5
  // the background sound of the place on screen follows the volume at once, not at the next change of screen
  ambient?.level()
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
  /** A new part of the company opens: a bolt drawn back, then an open fifth that hangs for a moment. */
  unlock() {
    noise(0.05, 0.12, 2200, 1.4)
    tone(180, 0.09, 'sine', 0.22, 0.02, 90)
    chord([523, 784], 0.22, 0.26, 0.12)
    chord([659, 988, 1319], 0.7, 0.3, 0.3)
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
  /** A house on its feet: applause with whistles and whoops over it, more of them for a bigger moment. */
  cheer(seconds = 3, strength = 1) {
    sfx.applause(seconds, strength)
    const calls = Math.round(seconds * 2.5 * strength)
    for (let i = 0; i < calls; i++) {
      const at = Math.random() * seconds * 0.8
      if (Math.random() < 0.5) {
        // a two-finger whistle: a quick rise and a long fall
        const f = 1700 + Math.random() * 900
        tone(f * 0.8, 0.12, 'sine', 0.035 * strength, at, f * 1.25)
        tone(f * 1.25, 0.45, 'sine', 0.03 * strength, at + 0.12, f * 0.9)
      } else {
        // a whoop: a voice-like buzz sweeping up through a vowel
        noise(0.35, 0.03 * strength, 700 + Math.random() * 300, 5, at, 'bandpass', 1400 + Math.random() * 500)
        tone(260 + Math.random() * 120, 0.35, 'sawtooth', 0.012 * strength, at, 420 + Math.random() * 200)
      }
    }
  },
  /** A deep hit under a reveal, with a shimmer on top. */
  impact() {
    tone(58, 1.4, 'sine', 0.5, 0, 34)
    noise(0.5, 0.14, 160, 0.7, 0, 'lowpass', 60)
    noise(1.6, 0.04, 7000, 0.5, 0.05, 'highpass')
  },
  /** A rising swell before a reveal. */
  riser(seconds = 1.6) {
    noise(seconds, 0.06, 400, 0.8, 0, 'bandpass', 5000)
    tone(110, seconds, 'sawtooth', 0.025, 0, 440)
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
//
// The background sound of each place, made in code. Every place has two or
// three beds of filtered noise that drift in level and colour on their own
// slow, unrelated clocks, and a handful of sound sources (keyboards, machines,
// tills, passing cars, birds, coughs) that each fire at random intervals,
// with their pitch, length, loudness and place in the stereo field drawn
// afresh every time, so the mix does not settle into a loop. The noise is
// several seconds long and starts at a random point, and comes in three
// colours: white, pink and brown.

export type Ambience = 'none' | 'office' | 'factory' | 'store' | 'venue' | 'outdoors'
let ambient: { kind: Ambience; stop: () => void; /** Bring its loudness into line with the volume and ambience settings. */ level: () => void } | null = null
let ambienceLevel = 0.5
export const setAmbienceLevel = (v: number) => {
  ambienceLevel = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5
  // turned off, the bed stops; otherwise the one that is playing is turned up or down, not started again
  if (ambienceLevel <= 0) setAmbience('none')
  else ambient?.level()
}

type Colour = 'white' | 'pink' | 'brown'
const colours = new Map<Colour, AudioBuffer>()
/** Six seconds of noise of a colour, made once. Long enough that its loop is not heard. */
function noiseOf(a: AudioContext, colour: Colour): AudioBuffer {
  const hit = colours.get(colour)
  if (hit) return hit
  const n = a.sampleRate * 6
  const buf = a.createBuffer(1, n, a.sampleRate)
  const d = buf.getChannelData(0)
  let b0 = 0
  let b1 = 0
  let b2 = 0
  let last = 0
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1
    if (colour === 'white') d[i] = w
    else if (colour === 'pink') {
      // Paul Kellet's economy filter
      b0 = 0.99765 * b0 + w * 0.099046
      b1 = 0.963 * b1 + w * 0.2965164
      b2 = 0.57 * b2 + w * 1.0526913
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22
    } else {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    }
  }
  // the loop's seam is faded across so it does not click
  const fade = Math.floor(a.sampleRate * 0.05)
  for (let i = 0; i < fade; i++) {
    const k = i / fade
    d[n - fade + i] = d[n - fade + i] * (1 - k) + d[i] * k
  }
  colours.set(colour, buf)
  return buf
}

const rand = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
/** Seconds until the next of something that happens `perMinute` times a minute on average, at random. */
const gap = (perMinute: number) => -Math.log(1 - Math.random() * 0.999) * (60 / perMinute)

interface Source {
  /** Times a minute, on average. */
  rate: number
  /** Plays one at audio time `t`. */
  play: (t: number) => void
  next: number
}

/** The background of a place: beds that drift, and sources that fire at random. */
export function setAmbience(kind: Ambience) {
  if (ambient?.kind === kind) return
  ambient?.stop()
  ambient = null
  const a = kind === 'none' || ambienceLevel <= 0 ? null : audio()
  if (!a) return
  const master = a.createGain()
  master.gain.setValueAtTime(0, a.currentTime)
  master.gain.linearRampToValueAtTime(volume * ambienceLevel, a.currentTime + 1.6)
  master.connect(a.destination)
  const running: AudioScheduledSourceNode[] = []
  const drifting: { param: AudioParam; lo: number; hi: number; every: [number, number]; at: number }[] = []

  /** Where a sound sits left to right, -1 to 1, and its own gain. */
  const out = (pan: number, gain: number) => {
    const amp = a.createGain()
    amp.gain.value = gain
    if (a.createStereoPanner) {
      const p = a.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan))
      amp.connect(p).connect(master)
    } else amp.connect(master)
    return amp
  }
  /** A looping bed: noise of a colour through a filter, its level and centre wandering between limits. */
  const bed = (colour: Colour, type: BiquadFilterType, freq: [number, number], q: number, gain: [number, number], pan = 0) => {
    const src = a.createBufferSource()
    src.buffer = noiseOf(a, colour)
    src.loop = true
    src.playbackRate.value = rand(0.94, 1.06)
    const f = a.createBiquadFilter()
    f.type = type
    f.frequency.value = (freq[0] + freq[1]) / 2
    f.Q.value = q
    const amp = out(pan, (gain[0] + gain[1]) / 2)
    src.connect(f).connect(amp)
    src.start(0, rand(0, 5.5))
    running.push(src)
    drifting.push({ param: f.frequency, lo: freq[0], hi: freq[1], every: [3, 9], at: 0 })
    drifting.push({ param: amp.gain, lo: gain[0], hi: gain[1], every: [2, 7], at: 0 })
    return { src, amp, f }
  }
  /**
   * Talk heard across a room: a band of pink noise opened and shut at the rate of syllables, the rate itself
   * wandering, so it reads as voices rather than as wind.
   */
  const murmur = (centre: number, gain: number, pan: number) => {
    const { amp } = bed('pink', 'bandpass', [centre * 0.75, centre * 1.3], 0.9, [gain * 0.6, gain * 1.2], pan)
    const lfo = a.createOscillator()
    const depth = a.createGain()
    lfo.frequency.value = rand(3, 5.5)
    depth.gain.value = gain * 0.45
    lfo.connect(depth).connect(amp.gain)
    lfo.start()
    running.push(lfo)
    drifting.push({ param: lfo.frequency, lo: 2.6, hi: 6.2, every: [0.6, 2.2], at: 0 })
  }
  /** One short sound: noise through a filter with a quick attack and a decay. */
  const hit = (t: number, colour: Colour, type: BiquadFilterType, freq: number, q: number, len: number, gain: number, pan: number, sweepTo?: number, attack = 0.003) => {
    const src = a.createBufferSource()
    src.buffer = noiseOf(a, colour)
    const f = a.createBiquadFilter()
    f.type = type
    f.frequency.setValueAtTime(freq, t)
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + len)
    f.Q.value = q
    const amp = out(pan, 0)
    amp.gain.setValueAtTime(0, t)
    amp.gain.linearRampToValueAtTime(gain, t + attack)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + len)
    src.connect(f).connect(amp)
    src.start(t, rand(0, 5.5), len + 0.05)
  }
  /** One short note. */
  const note = (t: number, freq: number, len: number, gain: number, pan: number, type: OscillatorType = 'sine', slideTo?: number) => {
    const o = a.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len)
    const amp = out(pan, 0)
    amp.gain.setValueAtTime(0, t)
    amp.gain.linearRampToValueAtTime(gain, t + 0.005)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + len)
    o.connect(amp)
    o.start(t)
    o.stop(t + len + 0.02)
  }
  /** A steady low tone, for mains hum and big machines, with a slow beat between two near partials. */
  const hum = (freq: number, gain: number) => {
    for (const [mul, g] of [
      [1, 1],
      [2.003, 0.45],
    ] as const) {
      const o = a.createOscillator()
      o.frequency.value = freq * mul
      const amp = out(0, gain * g)
      o.connect(amp)
      o.start()
      running.push(o)
      drifting.push({ param: amp.gain, lo: gain * g * 0.6, hi: gain * g * 1.1, every: [4, 10], at: 0 })
    }
  }

  const sources: Source[] = []
  const add = (rate: number, play: (t: number) => void) => sources.push({ rate, play, next: a.currentTime + gap(rate) })

  if (kind === 'office') {
    bed('brown', 'lowpass', [140, 220], 0.5, [0.05, 0.08])
    murmur(520, 0.02, -0.35)
    murmur(680, 0.014, 0.45)
    // a run of typing: a burst of keys at a typist's own pace, somewhere in the room
    add(9, (t) => {
      const pan = rand(-0.8, 0.8)
      const pace = rand(0.08, 0.16)
      const tone = rand(2200, 3800)
      let at = t
      for (let k = 0, n = Math.floor(rand(6, 34)); k < n; k++) {
        hit(at, 'white', 'bandpass', tone * rand(0.85, 1.15), 2.5, 0.02, rand(0.012, 0.024), pan)
        at += pace * rand(0.5, 1.6) + (Math.random() < 0.08 ? rand(0.2, 0.6) : 0)
      }
      // the space bar or return, heavier, at the end
      if (Math.random() < 0.6) hit(at, 'white', 'bandpass', tone * 0.6, 1.5, 0.04, 0.03, pan)
    })
    add(5, (t) => hit(t, 'white', 'bandpass', rand(3500, 5000), 3, 0.012, 0.018, rand(-0.7, 0.7)))
    add(1.2, (t) => hit(t, 'brown', 'lowpass', rand(240, 420), 1, rand(0.25, 0.5), 0.05, rand(-0.6, 0.6), rand(500, 800), 0.08))
    // a phone somewhere, two soft rings
    add(0.25, (t) => {
      const pan = rand(-0.9, 0.9)
      const f = rand(880, 1180)
      for (let k = 0; k < 2; k++) for (let r = 0; r < 6; r++) note(t + k * 1.6 + r * 0.05, r % 2 ? f * 1.25 : f, 0.05, 0.008, pan)
    })
    add(0.6, (t) => note(t, rand(600, 700), 0.6, 0.006, rand(-0.5, 0.5), 'triangle', rand(900, 1000)))
  } else if (kind === 'factory') {
    bed('brown', 'lowpass', [80, 140], 0.7, [0.12, 0.18])
    bed('pink', 'bandpass', [1100, 1800], 0.8, [0.012, 0.03], 0.3)
    hum(rand(48, 52), 0.025)
    // two or three machines, each pressing at its own pace
    for (let m = 0, n = 2 + Math.floor(Math.random() * 2); m < n; m++) {
      const pan = rand(-0.8, 0.8)
      const beat = rand(0.7, 1.8)
      const pitch = rand(60, 120)
      add(60 / beat, (t) => {
        note(t, pitch, 0.25, 0.06, pan, 'sine', pitch * 0.5)
        hit(t, 'brown', 'lowpass', rand(500, 900), 0.8, 0.12, 0.08, pan)
      })
    }
    // the hiss of a pneumatic arm
    add(7, (t) => hit(t, 'white', 'highpass', rand(3000, 5000), 0.7, rand(0.18, 0.45), 0.02, rand(-0.8, 0.8), undefined, 0.02))
    // a clank of metal on metal: noise through a sharp resonance
    add(5, (t) => {
      const f = rand(900, 2600)
      const pan = rand(-0.9, 0.9)
      hit(t, 'white', 'bandpass', f, 18, rand(0.2, 0.5), 0.05, pan)
      if (Math.random() < 0.5) hit(t + rand(0.08, 0.2), 'white', 'bandpass', f * rand(1.3, 1.6), 16, 0.2, 0.025, pan)
    })
    // the rattle of a conveyor
    add(3, (t) => {
      const pan = rand(-0.6, 0.6)
      for (let k = 0, n = Math.floor(rand(10, 30)); k < n; k++) hit(t + k * rand(0.045, 0.06), 'white', 'bandpass', rand(1800, 2600), 4, 0.02, 0.012, pan)
    })
    // a forklift backing up
    add(0.5, (t) => {
      const pan = rand(-0.9, 0.9)
      for (let k = 0; k < 5; k++) note(t + k * 0.9, 1040, 0.4, 0.012, pan, 'square')
    })
  } else if (kind === 'store') {
    bed('pink', 'lowpass', [300, 480], 0.5, [0.03, 0.05])
    murmur(760, 0.028, -0.3)
    murmur(1050, 0.018, 0.4)
    murmur(600, 0.014, 0)
    // footsteps going past: a few soft knocks in a row
    add(8, (t) => {
      const pan0 = rand(-1, 1)
      const pan1 = pan0 + rand(-0.6, 0.6)
      const pace = rand(0.42, 0.58)
      const f = rand(400, 900)
      for (let k = 0, n = Math.floor(rand(3, 9)); k < n; k++) hit(t + k * pace, 'brown', 'bandpass', f, 1.2, 0.06, 0.03, pan0 + ((pan1 - pan0) * k) / n)
    })
    // a till: a short beep, now and then a second
    add(2.5, (t) => {
      const pan = rand(-0.7, 0.7)
      note(t, rand(1900, 2400), 0.09, 0.012, pan)
      if (Math.random() < 0.4) note(t + 0.16, rand(1900, 2400), 0.09, 0.01, pan)
    })
    // a bag, a box on a counter
    add(3, (t) => hit(t, 'white', 'highpass', rand(2500, 5000), 0.6, rand(0.15, 0.35), 0.012, rand(-0.8, 0.8), rand(6000, 8000), 0.03))
    add(0.4, (t) => [1318, 1046].forEach((f, k) => note(t + k * 0.32, f, 0.9, 0.007, 0.6, 'triangle')))
  } else if (kind === 'venue') {
    bed('brown', 'lowpass', [120, 200], 0.6, [0.04, 0.07])
    murmur(480, 0.035, -0.5)
    murmur(620, 0.03, 0.5)
    murmur(820, 0.02, 0)
    // a cough, a laugh, a seat tipping up
    add(5, (t) => hit(t, 'pink', 'bandpass', rand(500, 1300), 2, rand(0.12, 0.22), 0.04, rand(-0.9, 0.9)))
    add(2, (t) => {
      const pan = rand(-0.8, 0.8)
      const f = rand(700, 1000)
      for (let k = 0, n = Math.floor(rand(3, 7)); k < n; k++) hit(t + k * rand(0.12, 0.18), 'pink', 'bandpass', f, 3, 0.1, 0.02, pan)
    })
    add(3, (t) => hit(t, 'brown', 'bandpass', rand(250, 450), 4, 0.09, 0.04, rand(-1, 1)))
    // a sound check on the stage, far off
    add(0.3, (t) => {
      note(t, 82, 0.6, 0.04, 0, 'sine', 70)
      hit(t + 0.8, 'white', 'highpass', 6000, 0.7, 0.12, 0.015, 0)
    })
  } else {
    // traffic: a low wash, and cars passing one side to the other with the sound opening as they come close
    bed('brown', 'lowpass', [200, 420], 0.4, [0.04, 0.08])
    bed('white', 'bandpass', [3000, 4800], 0.8, [0.002, 0.006], 0.2)
    add(11, (t) => {
      const len = rand(2.5, 5)
      const src = a.createBufferSource()
      src.buffer = noiseOf(a, 'brown')
      const f = a.createBiquadFilter()
      f.type = 'lowpass'
      f.frequency.setValueAtTime(260, t)
      f.frequency.linearRampToValueAtTime(rand(900, 1500), t + len / 2)
      f.frequency.linearRampToValueAtTime(260, t + len)
      const side = Math.random() < 0.5 ? -1 : 1
      const amp = a.createGain()
      const g = rand(0.04, 0.09)
      amp.gain.setValueAtTime(0.0001, t)
      amp.gain.exponentialRampToValueAtTime(g, t + len / 2)
      amp.gain.exponentialRampToValueAtTime(0.0001, t + len)
      let tail: AudioNode = amp
      if (a.createStereoPanner) {
        const p = a.createStereoPanner()
        p.pan.setValueAtTime(-side * 0.9, t)
        p.pan.linearRampToValueAtTime(side * 0.9, t + len)
        amp.connect(p)
        tail = p
      }
      tail.connect(master)
      src.connect(f).connect(amp)
      src.start(t, rand(0, 3), len + 0.05)
    })
    // birds: a few chirps rising or falling, each bird with its own song
    add(6, (t) => {
      const pan = rand(-1, 1)
      const base = rand(2800, 5200)
      const up = Math.random() < 0.5
      for (let k = 0, n = Math.floor(rand(2, 6)); k < n; k++) note(t + k * rand(0.09, 0.16), base * rand(0.95, 1.05), 0.07, 0.012, pan, 'sine', base * (up ? 1.3 : 0.75))
    })
    add(0.4, (t) => [0, 0.32].forEach((d) => note(t + d, rand(380, 440), 0.25, 0.006, rand(-1, 1), 'sawtooth')))
    // gusts of wind
    add(1.5, (t) => hit(t, 'pink', 'bandpass', rand(400, 800), 0.7, rand(2, 4), 0.03, rand(-0.5, 0.5), rand(1200, 1800), 1.2))
  }

  let stopped = false
  // one clock for everything: every 120 ms whatever is due in the next half second is put on the audio clock, and
  // the beds' levels and colours are given new places to drift to. Nothing piles up while the page is hidden.
  const timer = window.setInterval(() => {
    if (stopped || document.visibilityState !== 'visible') return
    const now = a.currentTime
    for (const s of sources) {
      if (s.next < now) s.next = now + gap(s.rate) * 0.5
      while (s.next < now + 0.5) {
        s.play(s.next)
        s.next += gap(s.rate)
      }
    }
    for (const d of drifting) {
      if (d.at > now) continue
      const span = rand(d.every[0], d.every[1])
      d.param.setTargetAtTime(rand(d.lo, d.hi), now, span / 3)
      d.at = now + span
    }
  }, 120)
  ambient = {
    kind,
    level() {
      master.gain.cancelScheduledValues(a.currentTime)
      master.gain.setTargetAtTime(volume * ambienceLevel, a.currentTime, 0.12)
    },
    stop() {
      stopped = true
      window.clearInterval(timer)
      master.gain.cancelScheduledValues(a.currentTime)
      master.gain.setTargetAtTime(0, a.currentTime, 0.25)
      // every source is told when to stop on the audio clock itself, so none is left running if the page is
      // hidden and its timers held back; the rest fall away with the master
      for (const node of running) {
        try {
          node.stop(a.currentTime + 1.2)
        } catch {
          /* already stopped */
        }
      }
      window.setTimeout(() => master.disconnect(), 1400)
    },
  }
}

/**
 * The house at a keynote, for the show to ride: a crowd's murmur that can be
 * brought up, hushed or swelled, and stopped. Follows the main volume.
 */
export function crowdBed(): { set: (level: number, seconds?: number) => void; stop: () => void } {
  const a = audio()
  if (!a) return { set: () => {}, stop: () => {} }
  const master = a.createGain()
  master.gain.value = 0
  master.connect(a.destination)
  const nodes: AudioScheduledSourceNode[] = []
  for (const [centre, pan] of [
    [460, -0.6],
    [640, 0.6],
    [820, 0],
    [300, 0.2],
  ] as const) {
    const src = a.createBufferSource()
    src.buffer = noiseOf(a, 'pink')
    src.loop = true
    src.playbackRate.value = rand(0.95, 1.05)
    const f = a.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = centre
    f.Q.value = 0.8
    const amp = a.createGain()
    amp.gain.value = 0.05
    const lfo = a.createOscillator()
    const depth = a.createGain()
    lfo.frequency.value = rand(3, 5.5)
    depth.gain.value = 0.025
    lfo.connect(depth).connect(amp.gain)
    let tail: AudioNode = amp
    if (a.createStereoPanner) {
      const p = a.createStereoPanner()
      p.pan.value = pan
      amp.connect(p)
      tail = p
    }
    tail.connect(master)
    src.connect(f).connect(amp)
    src.start(0, rand(0, 5))
    lfo.start()
    nodes.push(src, lfo)
  }
  return {
    set(level, seconds = 0.8) {
      master.gain.cancelScheduledValues(a.currentTime)
      master.gain.setTargetAtTime(Math.max(0, level) * volume, a.currentTime, seconds / 3)
    },
    stop() {
      master.gain.cancelScheduledValues(a.currentTime)
      master.gain.setTargetAtTime(0, a.currentTime, 0.2)
      for (const n of nodes)
        try {
          n.stop(a.currentTime + 1)
        } catch {
          /* already stopped */
        }
      window.setTimeout(() => master.disconnect(), 1200)
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
