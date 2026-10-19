// The colour picker: a swatch that opens a small panel with a saturation and
// brightness square, a hue strip, a hex field, presets and the colours chosen
// last. The square and the strip are the colours themselves, so they are the
// one place a gradient is drawn; the chrome around them is flat.
import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type Hsv, hexToHsv, hsvToHex, parseHex, pushRecent } from './colorMath'
import { useLayer } from './ui'

const RECENT_KEY = 'sb-recent-colours'
const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && parseHex(x) !== null).slice(0, 8) : []
  } catch {
    return []
  }
}
const writeRecent = (list: string[]) => {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    /* private window: the list lives for this session only */
  }
}

const SQ_W = 196
const SQ_H = 120
const POP_W = 214

function Chip({ color, label, on, onPick }: { color: string; label: string; on: boolean; onPick: () => void }) {
  return <button type="button" title={color} aria-label={`${label} ${color}`} aria-pressed={on} onClick={onPick} className={`h-5 min-w-0 flex-1 border ${on ? 'border-accent' : 'border-line2 hover:border-fg'}`} style={{ background: color, maxWidth: 24 }} />
}

/**
 * A colour. `onChange` is called as the colour moves (dragging in the square
 * does not wait for the mouse to come up); `onCommit`, if given, once the
 * colour has been settled on (the mouse comes up, Enter in the hex field, a
 * swatch). `showHex` puts the hex code beside the swatch.
 */
export function ColorField({ value, onChange, onCommit, label, presets, showHex = false, className = '', disabled }: { value: string; onChange: (hex: string) => void; onCommit?: (hex: string) => void; /** What the colour is, for the tooltip and screen readers. */ label: string; presets?: readonly string[]; showHex?: boolean; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const current = parseHex(value) ?? '#000000'
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(current))
  const [hexText, setHexText] = useState<string | null>(null)
  const [recent, setRecent] = useState<string[]>([])
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const opened = useRef(current)
  const latest = useRef(current)
  latest.current = current
  // (a drag keeps calling the handler it started with: let that always be the newest one)
  const changeRef = useRef(onChange)
  changeRef.current = onChange
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit

  // the colour from outside, unless it is the one the square already shows (hue is kept through greys)
  useEffect(() => {
    if (hsvToHex(hsv) !== current) setHsv(hexToHsv(current))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current])

  const remember = (hex: string) => {
    const next = pushRecent(readRecent(), hex)
    writeRecent(next)
    setRecent(next)
  }
  const close = (refocus = true) => {
    setOpen(false)
    setHexText(null)
    if (latest.current !== opened.current) remember(latest.current)
    if (refocus) btn.current?.focus({ preventScroll: true })
  }
  const toggle = () => {
    if (open) return close()
    opened.current = current
    setHsv(hexToHsv(current))
    setRecent(readRecent())
    setOpen(true)
  }
  useLayer(open, close)

  // placed under the swatch (over it when there is no room below), inside the window
  useLayoutEffect(() => {
    if (!open || !btn.current) return
    const place = () => {
      const r = btn.current!.getBoundingClientRect()
      const h = pop.current?.offsetHeight ?? 240
      const below = r.bottom + 4 + h <= window.innerHeight - 4
      setPos({ left: Math.max(4, Math.min(window.innerWidth - POP_W - 4, r.right - POP_W)), top: below ? r.bottom + 4 : Math.max(4, r.top - 4 - h) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => (window.removeEventListener('resize', place), window.removeEventListener('scroll', place, true))
  }, [open])

  // a click anywhere else closes it
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) close(false)
    }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  })

  const set = (next: Hsv) => {
    setHsv(next)
    setHexText(null)
    const hex = hsvToHex(next)
    if (hex !== latest.current) changeRef.current(hex)
  }
  const pick = (hex: string) => {
    const c = parseHex(hex)
    if (!c) return
    setHsv(hexToHsv(c))
    setHexText(null)
    if (c !== latest.current) changeRef.current(c)
    commitRef.current?.(c)
    remember(c)
  }

  const drag = (e: ReactPointerEvent<HTMLDivElement>, at: (x: number, y: number) => Hsv) => {
    if (e.button !== 0) return
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    el.focus({ preventScroll: true })
    const move = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect()
      set(at(Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (ev.clientY - r.top) / r.height))))
    }
    move(e)
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      commitRef.current?.(latest.current)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }
  const nudge = (e: ReactKeyboardEvent, keys: Partial<Record<string, (k: number) => Hsv>>) => {
    const f = keys[e.key]
    if (!f) return
    e.preventDefault()
    set(f(e.shiftKey ? 10 : 1))
  }
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n))

  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 })
  const hexCommit = () => {
    if (hexText === null) return
    const c = parseHex(hexText)
    if (c) pick(c)
    else setHexText(null)
  }

  return (
    <>
      <button
        ref={btn}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${label}: ${current}. Choose a colour`}
        title={label}
        onClick={toggle}
        className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-none border bg-raise px-1 text-xs disabled:cursor-not-allowed disabled:border-dashed ${open ? 'border-accent' : 'border-line2 hover:border-fg'} ${className}`}
      >
        <span aria-hidden className="h-[18px] w-7 border border-line2" style={{ background: current }} />
        {showHex && <span className="num pr-1 text-fg">{current}</span>}
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            role="dialog"
            aria-label={label}
            className="fixed z-[80] border border-line2 bg-panel p-2 text-xs"
            style={{ width: POP_W, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <div className="t-title mb-2 truncate text-[11px]">{label}</div>
            <div
              role="slider"
              tabIndex={0}
              aria-label="Saturation and brightness"
              aria-valuetext={`saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`}
              aria-valuenow={Math.round(hsv.s * 100)}
              className="relative cursor-crosshair touch-none border border-line2 outline-none focus-visible:border-accent"
              style={{ width: SQ_W, height: SQ_H, background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${pure})` }}
              onPointerDown={(e) => drag(e, (x, y) => ({ h: hsv.h, s: x, v: 1 - y }))}
              onKeyDown={(e) =>
                nudge(e, {
                  ArrowLeft: (k) => ({ ...hsv, s: clamp01(hsv.s - k / 100) }),
                  ArrowRight: (k) => ({ ...hsv, s: clamp01(hsv.s + k / 100) }),
                  ArrowUp: (k) => ({ ...hsv, v: clamp01(hsv.v + k / 100) }),
                  ArrowDown: (k) => ({ ...hsv, v: clamp01(hsv.v - k / 100) }),
                })
              }
            >
              <span aria-hidden className="pointer-events-none absolute h-[9px] w-[9px] border border-white outline outline-1 outline-black" style={{ left: hsv.s * (SQ_W - 2) - 4.5, top: (1 - hsv.v) * (SQ_H - 2) - 4.5 }} />
            </div>
            <div
              role="slider"
              tabIndex={0}
              aria-label="Hue"
              aria-valuemin={0}
              aria-valuemax={359}
              aria-valuenow={Math.round(hsv.h)}
              className="relative mt-2 h-3 cursor-ew-resize touch-none border border-line2 outline-none focus-visible:border-accent"
              style={{ width: SQ_W, background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
              onPointerDown={(e) => drag(e, (x) => ({ ...hsv, h: Math.min(359.9, x * 360) }))}
              onKeyDown={(e) =>
                nudge(e, {
                  ArrowLeft: (k) => ({ ...hsv, h: (hsv.h - k + 360) % 360 }),
                  ArrowDown: (k) => ({ ...hsv, h: (hsv.h - k + 360) % 360 }),
                  ArrowRight: (k) => ({ ...hsv, h: (hsv.h + k) % 360 }),
                  ArrowUp: (k) => ({ ...hsv, h: (hsv.h + k) % 360 }),
                })
              }
            >
              <span aria-hidden className="pointer-events-none absolute -top-[2px] h-[14px] w-[5px] border border-white outline outline-1 outline-black" style={{ left: (hsv.h / 360) * (SQ_W - 2) - 2.5 }} />
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span aria-hidden className="h-7 w-7 shrink-0 border border-line2" style={{ background: current }} />
              <input
                type="text"
                aria-label="Hex code"
                spellCheck={false}
                autoComplete="off"
                maxLength={7}
                value={hexText ?? current}
                onChange={(e) => setHexText(e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                onBlur={hexCommit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.preventDefault(), hexCommit()                }}
                className={`num h-7 min-w-0 flex-1 rounded-none border bg-raise px-2 text-xs outline-none focus:border-accent ${hexText !== null && !parseHex(hexText) ? 'border-warn' : 'border-line2'}`}
                style={{ userSelect: 'text' }}
              />
            </div>
            {presets && presets.length > 0 && (
              <div className="mt-2">
                <div className="mb-1 text-[11px] text-faint">Presets</div>
                <div className="flex flex-wrap gap-[3px]">
                  {presets.map((c) => (
                    <Chip key={c} color={c} label="Preset" on={parseHex(c) === current} onPick={() => pick(c)} />
                  ))}
                </div>
              </div>
            )}
            {recent.length > 0 && (
              <div className="mt-2">
                <div className="mb-1 text-[11px] text-faint">Recent</div>
                <div className="flex gap-[3px]">
                  {recent.map((c) => (
                    <Chip key={c} color={c} label="Recent" on={c === current} onPick={() => pick(c)} />
                  ))}
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
