// Background music, composed as it plays with the Web Audio API: no audio
// files. A handful of tracks, each a key, a tempo, a chord sequence and a few
// patterns for pads, bass, arpeggio, a bell lead and soft drums, grouped by
// mood. The screen on show picks the mood; within a mood the tracks take
// turns, crossfading every couple of minutes, and the arpeggio and the lead
// are varied as they go, so no two passes through a track are the same.
//
// The notes are scheduled a little ahead on the audio clock by a timer that
// runs a few times a second: cheap, and the game loop never waits on it.
import { audioContext, getVolume, onVolume } from './sfx'

export type Mood = 'calm' | 'focus' | 'drive' | 'bright' | 'show'

interface Track {
  name: string
  moods: Mood[]
  bpm: number
  /** MIDI note of the key's root, around middle C. */
  root: number
  /** Semitones of the scale above the root. */
  scale: number[]
  /** Each chord as scale degrees (they may run past the octave). */
  chords: number[][]
  /** Bars each chord lasts. */
  barsPer: number
  /** Sixteen steps a bar each: x the chord's root, o its fifth, . nothing. */
  bass: string
  /** x a chord tone, ? one half the time. */
  arp: string
  kick?: string
  hat?: string
  /** Notes of the bell lead per eighth, 0-1; none for no lead. */
  lead?: number
  /** Delay of every other sixteenth, as a share of one. */
  swing?: number
  pad: OscillatorType
  pluck: OscillatorType
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const MINOR = [0, 2, 3, 5, 7, 8, 10]
const DORIAN = [0, 2, 3, 5, 7, 9, 10]
const LYDIAN = [0, 2, 4, 6, 7, 9, 11]
const MIXO = [0, 2, 4, 5, 7, 9, 10]

export const TRACKS: Track[] = [
  { name: 'Morning Commit', moods: ['calm'], bpm: 84, root: 60, scale: MAJOR, chords: [[0, 2, 4, 6], [5, 7, 9], [3, 5, 7, 9], [4, 6, 8]], barsPer: 2, bass: 'x.......o.......', arp: 'x..?..x...?..x..', lead: 0.25, pad: 'triangle', pluck: 'triangle' },
  { name: 'Quiet Floor', moods: ['calm', 'focus'], bpm: 72, root: 57, scale: DORIAN, chords: [[0, 2, 4], [3, 5, 7], [0, 2, 4, 6], [6, 8, 10]], barsPer: 2, bass: 'x...............', arp: 'x...?...x...?...', lead: 0.3, pad: 'sine', pluck: 'sine' },
  { name: 'Boardroom', moods: ['calm'], bpm: 78, root: 58, scale: MAJOR, chords: [[0, 2, 4, 6], [1, 3, 5, 7], [4, 6, 8, 10], [0, 2, 4, 6]], barsPer: 2, bass: 'x.....o...x.....', arp: '?.x.?.x.?.x.?.x.', hat: '....x.......x...', pad: 'triangle', pluck: 'sine', swing: 0.12 },
  { name: 'Deep Work', moods: ['focus'], bpm: 96, root: 62, scale: MINOR, chords: [[0, 2, 4], [5, 7, 9], [2, 4, 6], [6, 8, 10]], barsPer: 2, bass: 'x.....x...o.....', arp: 'x.x.x.x.x.x.x.x.', hat: '..x...x...x...x.', pad: 'sawtooth', pluck: 'triangle' },
  { name: 'Blueprint', moods: ['focus', 'bright'], bpm: 104, root: 64, scale: LYDIAN, chords: [[0, 2, 4], [1, 3, 5], [6, 8, 10], [0, 2, 4, 6]], barsPer: 2, bass: 'x...x...x...o...', arp: 'x.?x.?x.?x.?x.?.', kick: 'x.......x.......', hat: '..x...x...x...x.', lead: 0.2, pad: 'triangle', pluck: 'square' },
  { name: 'Assembly Line', moods: ['drive'], bpm: 118, root: 55, scale: MINOR, chords: [[0, 2, 4], [6, 8, 10], [5, 7, 9], [6, 8, 10]], barsPer: 1, bass: 'x.x.x.x.x.x.o.x.', arp: 'x?x?x?x?x?x?x?x?', kick: 'x...x...x...x...', hat: '..x...x...x...xx', pad: 'sawtooth', pluck: 'square' },
  { name: 'Night Shift', moods: ['drive', 'focus'], bpm: 110, root: 53, scale: MINOR, chords: [[0, 2, 4], [1, 3, 5], [0, 2, 4], [5, 7, 9]], barsPer: 2, bass: 'x..x..x...x..o..', arp: '..x...x?..x...x?', kick: 'x.....x...x.....', hat: 'x.x.x.x.x.x.x.x.', lead: 0.15, pad: 'sawtooth', pluck: 'triangle' },
  { name: 'High Street', moods: ['bright'], bpm: 112, root: 65, scale: MAJOR, chords: [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7]], barsPer: 1, bass: 'x...x.o.x...x.o.', arp: 'x.x?x.x?x.x?x.x?', kick: 'x.......x.......', hat: '..x...x...x...x.', lead: 0.3, pad: 'triangle', pluck: 'triangle', swing: 0.1 },
  { name: 'Launch Day', moods: ['show', 'bright'], bpm: 124, root: 60, scale: MIXO, chords: [[0, 2, 4], [6, 8, 10], [3, 5, 7], [0, 2, 4]], barsPer: 1, bass: 'x.x...x.x.x...o.', arp: 'xxx?xxx?xxx?xxx?', kick: 'x...x...x...x...', hat: '..x...x...x...x.', lead: 0.35, pad: 'sawtooth', pluck: 'square' },
  { name: 'Open Market', moods: ['bright', 'calm'], bpm: 92, root: 62, scale: MIXO, chords: [[0, 2, 4], [3, 5, 7], [6, 8, 10], [3, 5, 7]], barsPer: 2, bass: 'x.....x.....o...', arp: 'x..x..x..x..x.?.', hat: '......x.......x.', lead: 0.25, pad: 'triangle', pluck: 'triangle', swing: 0.14 },
]

/** Bars a track plays before the next one in the mood takes over. */
const TRACK_BARS = 48
const LOOKAHEAD = 0.5
const FADE = 2.5

const freq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)
const note = (t: Track, degree: number) => t.root + t.scale[((degree % t.scale.length) + t.scale.length) % t.scale.length] + 12 * Math.floor(degree / t.scale.length)

/** The tracks that suit a mood, in order. */
export const tracksFor = (mood: Mood) => TRACKS.filter((t) => t.moods.includes(mood))

interface Engine {
  a: AudioContext
  out: GainNode
  send: GainNode
  noise: AudioBuffer
  track: Track
  /** Index of the next sixteenth, from the start of the track. */
  step: number
  /** Audio-clock time of that sixteenth. */
  at: number
  timer: number
  arp: number
  lead: number
  seed: number
  /** When a crossfade to another track is under way: the time to switch at, and the track. */
  next: { at: number; track: Track } | null
}

let engine: Engine | null = null
let mood: Mood | 'none' = 'none'
let level = 0.5
let played = new Map<Mood, number>()

const gainNow = () => getVolume() * level * 0.32

/** A small, fast, repeatable dice for the variations. */
function dice(e: Engine) {
  e.seed = (e.seed * 1664525 + 1013904223) >>> 0
  return e.seed / 4294967296
}

function env(e: Engine, t: number, peak: number, attack: number, hold: number, release: number, to: AudioNode) {
  const g = e.a.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + attack)
  g.gain.setValueAtTime(peak, t + attack + hold)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release)
  g.connect(to)
  return g
}

function voice(e: Engine, t: number, type: OscillatorType, hz: number, end: number, to: AudioNode, detune = 0) {
  const o = e.a.createOscillator()
  o.type = type
  o.frequency.setValueAtTime(hz, t)
  o.detune.value = detune
  o.connect(to)
  o.start(t)
  o.stop(end + 0.05)
}

function pad(e: Engine, t: number, notes: number[], dur: number) {
  const f = e.a.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(700, t)
  f.frequency.linearRampToValueAtTime(1300, t + dur * 0.5)
  f.frequency.linearRampToValueAtTime(800, t + dur)
  const g = env(e, t, 0.12 / notes.length, Math.min(1.2, dur * 0.3), dur * 0.55, Math.min(1.6, dur * 0.4), e.out)
  f.connect(g)
  for (const n of notes) {
    voice(e, t, e.track.pad, freq(n), t + dur + 1.6, f, -7)
    voice(e, t, e.track.pad, freq(n), t + dur + 1.6, f, 7)
  }
}

function bass(e: Engine, t: number, n: number, dur: number) {
  const f = e.a.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.value = 420
  const g = env(e, t, 0.2, 0.01, dur * 0.6, 0.18, e.out)
  f.connect(g)
  voice(e, t, 'triangle', freq(n), t + dur + 0.2, f)
  voice(e, t, 'sine', freq(n - 12), t + dur + 0.2, f)
}

function pluck(e: Engine, t: number, n: number, peak = 0.07) {
  const f = e.a.createBiquadFilter()
  f.type = 'lowpass'
  f.frequency.setValueAtTime(3200, t)
  f.frequency.exponentialRampToValueAtTime(500, t + 0.35)
  const g = env(e, t, peak, 0.005, 0.02, 0.38, e.out)
  g.connect(e.send)
  f.connect(g)
  voice(e, t, e.track.pluck, freq(n), t + 0.45, f)
}

function bell(e: Engine, t: number, n: number) {
  const g = env(e, t, 0.06, 0.008, 0.05, 1.1, e.out)
  g.connect(e.send)
  voice(e, t, 'sine', freq(n), t + 1.2, g)
  const h = env(e, t, 0.015, 0.004, 0.01, 0.4, e.out)
  voice(e, t, 'sine', freq(n) * 3, t + 0.5, h)
}

function kick(e: Engine, t: number) {
  const o = e.a.createOscillator()
  o.frequency.setValueAtTime(110, t)
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12)
  o.connect(env(e, t, 0.32, 0.003, 0.02, 0.24, e.out))
  o.start(t)
  o.stop(t + 0.3)
}

function hat(e: Engine, t: number, accent: boolean) {
  const src = e.a.createBufferSource()
  src.buffer = e.noise
  const f = e.a.createBiquadFilter()
  f.type = 'highpass'
  f.frequency.value = 7200
  src.connect(f).connect(env(e, t, accent ? 0.05 : 0.03, 0.002, 0.005, 0.05, e.out))
  src.start(t, dice(e) * 0.4)
  src.stop(t + 0.1)
}

/** Lays down one sixteenth of the track. */
function play(e: Engine, t: number) {
  const tr = e.track
  const s = e.step % 16
  const bar = Math.floor(e.step / 16)
  const sixteenth = 60 / tr.bpm / 4
  const chord = tr.chords[Math.floor(bar / tr.barsPer) % tr.chords.length]
  // the last bars of a pass thin out, the first build in
  const intro = bar < 2
  if (s === 0 && bar % tr.barsPer === 0) pad(e, t, chord.map((d) => note(tr, d)), sixteenth * 16 * tr.barsPer)
  const b = tr.bass[s]
  if (!intro && b !== '.') bass(e, t, note(tr, chord[0] + (b === 'o' ? 4 : 0)) - 24, sixteenth * 1.8)
  const p = tr.arp[s]
  if (p === 'x' || (p === '?' && dice(e) < 0.5)) {
    // up the chord, and now and then an octave higher
    const d = chord[e.arp++ % chord.length]
    pluck(e, t, note(tr, d) + (dice(e) < 0.18 ? 24 : 12), intro ? 0.04 : 0.07)
  }
  if (!intro && tr.kick?.[s] === 'x') kick(e, t)
  if (!intro && tr.hat?.[s] === 'x') hat(e, t, s % 4 === 2)
  // the lead answers every other four bars, on the eighths, walking the scale
  if (tr.lead && Math.floor(bar / 4) % 2 === 1 && s % 2 === 0 && dice(e) < tr.lead) {
    e.lead = Math.max(-2, Math.min(9, e.lead + Math.round((dice(e) - 0.5) * 4)))
    bell(e, t, note(tr, e.lead) + 12)
  }
}

function pick(m: Mood, not?: Track): Track {
  const list = tracksFor(m)
  const turn = (played.get(m) ?? -1) + 1
  played.set(m, turn)
  const t = list[turn % list.length]
  return t === not && list.length > 1 ? list[(turn + 1) % list.length] : t
}

function pump() {
  const e = engine
  if (!e) return
  // a hidden tab gets its timers held back: rather than notes in a heap, nothing until it is back
  if (typeof document !== 'undefined' && document.hidden) {
    e.at = e.a.currentTime + 0.1
    return
  }
  if (e.a.state !== 'running') {
    void e.a.resume().catch(() => {})
    e.at = e.a.currentTime + 0.1
    return
  }
  if (e.at < e.a.currentTime) e.at = e.a.currentTime + 0.05
  while (e.at < e.a.currentTime + LOOKAHEAD) {
    if (e.next && e.at >= e.next.at) {
      e.track = e.next.track
      e.next = null
      e.step = 0
      e.out.gain.cancelScheduledValues(e.at)
      e.out.gain.setValueAtTime(0, e.at)
      e.out.gain.linearRampToValueAtTime(gainNow(), e.at + FADE)
    }
    const tr = e.track
    const sixteenth = 60 / tr.bpm / 4
    play(e, e.at + (e.step % 2 ? (tr.swing ?? 0) * sixteenth : 0))
    e.step++
    e.at += sixteenth
    if (!e.next && e.step >= TRACK_BARS * 16 && mood !== 'none') crossfade(pick(mood, tr))
  }
}

function crossfade(track: Track) {
  const e = engine
  if (!e) return
  const now = Math.max(e.a.currentTime, e.at)
  e.out.gain.cancelScheduledValues(now)
  e.out.gain.setValueAtTime(e.out.gain.value, now)
  e.out.gain.linearRampToValueAtTime(0, now + FADE)
  e.next = { at: now + FADE, track }
}

function start(m: Mood) {
  const a = audioContext()
  if (!a || level <= 0) return
  const out = a.createGain()
  out.gain.value = 0
  const comp = a.createDynamicsCompressor()
  comp.threshold.value = -18
  comp.ratio.value = 3
  out.connect(comp).connect(a.destination)
  // a soft echo for the plucks and the lead
  const send = a.createGain()
  send.gain.value = 0.28
  const delay = a.createDelay(1)
  const track = pick(m)
  delay.delayTime.value = (60 / track.bpm) * 0.75
  const back = a.createGain()
  back.gain.value = 0.32
  const tone = a.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 2400
  send.connect(delay).connect(tone).connect(back).connect(delay)
  tone.connect(out)
  const noise = a.createBuffer(1, a.sampleRate >> 1, a.sampleRate)
  const data = noise.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  engine = { a, out, send, noise, track, step: 0, at: a.currentTime + 0.15, timer: 0, arp: 0, lead: 2, seed: (Math.random() * 2 ** 32) >>> 0, next: null }
  out.gain.linearRampToValueAtTime(gainNow(), a.currentTime + FADE)
  engine.timer = window.setInterval(pump, 150)
  pump()
}

function stop() {
  const e = engine
  if (!e) return
  engine = null
  window.clearInterval(e.timer)
  const now = e.a.currentTime
  e.out.gain.cancelScheduledValues(now)
  e.out.gain.setValueAtTime(e.out.gain.value, now)
  e.out.gain.linearRampToValueAtTime(0, now + 1.2)
  window.setTimeout(() => e.out.disconnect(), 1800)
}

/** The music for the screen on show: a mood, or none. Changing mood crossfades to one of its tracks. */
export function setMusicMood(next: Mood | 'none') {
  if (next === mood && (engine || next === 'none' || level <= 0)) return
  const was = mood
  mood = next
  if (next === 'none') return stop()
  if (!engine) return start(next)
  if (was !== next && !engine.track.moods.includes(next)) crossfade(pick(next, engine.track))
}

/** Music loudness, 0-1, under the main volume. Off stops it; back on starts it again. */
export function setMusicLevel(v: number) {
  level = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.5
  if (level <= 0) return stop()
  if (!engine && mood !== 'none') return start(mood)
  relevel()
}

function relevel() {
  const e = engine
  if (!e || e.next) return
  if (getVolume() <= 0) return stop()
  e.out.gain.cancelScheduledValues(e.a.currentTime)
  e.out.gain.setTargetAtTime(gainNow(), e.a.currentTime, 0.15)
}

onVolume(() => {
  if (!engine && getVolume() > 0 && mood !== 'none' && level > 0) start(mood)
  else relevel()
})

/** What is playing, for the settings: the track's name, or null. */
export const nowPlaying = () => (engine ? (engine.next?.track ?? engine.track).name : null)

/** Skips to the next track of the mood. */
export function nextTrack() {
  if (engine && mood !== 'none') crossfade(pick(mood, engine.track))
}

// (for the tests: forget which track each mood played last)
export const resetMusic = () => {
  played = new Map()
}
