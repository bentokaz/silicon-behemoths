// UI sounds synthesised with the Web Audio API. No audio files.

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

function tone(freq: number, duration: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number) {
  if (volume <= 0) return
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration)
    amp.gain.setValueAtTime(0, t)
    amp.gain.linearRampToValueAtTime(gain * volume, t + 0.004)
    amp.gain.exponentialRampToValueAtTime(0.0001, t + duration)
    osc.connect(amp).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + duration + 0.02)
  } catch {
    /* audio unavailable */
  }
}

let lastHover = 0
export const sfx = {
  hover() {
    const now = performance.now()
    if (now - lastHover < 45) return
    lastHover = now
    tone(2400, 0.018, 'square', 0.025)
  },
  click: () => tone(1250, 0.035, 'square', 0.07, 0, 700),
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
