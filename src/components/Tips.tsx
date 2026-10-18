// Tooltips. Every control that explains itself does so with a plain `title`;
// the browser's own tooltip for that is slow, unstyled and never shown to
// someone using the keyboard. This draws the same words in the game's own
// style, after a short pause under the pointer and at once on keyboard focus.
// There is one of it for the whole page, and nothing else has to change:
// while a tip is up the element's title is set aside so the browser does not
// draw a second one, and put back as soon as the tip goes.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface Tip {
  text: string
  /** The element's box when the tip came up. */
  box: DOMRect
}

const HOVER_MS = 300

export function Tips() {
  const [tip, setTip] = useState<Tip | null>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let host: HTMLElement | null = null
    let timer = 0
    // (keys are in use: focus is being moved with Tab, not by a click)
    let keys = false
    const restore = () => {
      if (host && host.dataset.tip !== undefined) {
        if (!host.hasAttribute('title')) host.setAttribute('title', host.dataset.tip)
        delete host.dataset.tip
      }
      host = null
    }
    const hide = () => {
      window.clearTimeout(timer)
      restore()
      setTip(null)
      setAt(null)
    }
    const show = (el: HTMLElement, delay: number) => {
      if (el === host) return
      hide()
      // its own title, or, for text that is cut short with nothing to say it in full, the text itself
      const own = el.getAttribute('title')
      const text = own ?? (el.textContent ?? '').trim()
      if (!text?.trim()) return
      host = el
      if (own === null) {
        timer = window.setTimeout(() => host === el && el.isConnected && setTip({ text, box: el.getBoundingClientRect() }), delay)
        return
      }
      el.dataset.tip = text
      el.removeAttribute('title')
      timer = window.setTimeout(() => host === el && el.isConnected && setTip({ text, box: el.getBoundingClientRect() }), delay)
    }
    /** Text cut short by an ellipsis: the element itself, if it is one that hides what does not fit. */
    const cut = (t: Element) => {
      const el = t.closest('.truncate, td, th') as HTMLElement | null
      return el && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === 'ellipsis' ? el : null
    }
    const titled = (t: EventTarget | null) => (t instanceof Element ? ((t.closest('[title], [data-tip]') as HTMLElement | null) ?? cut(t)) : null)
    const over = (e: MouseEvent) => {
      const el = titled(e.target)
      if (el) show(el, HOVER_MS)
      else if (host) hide()
    }
    const focus = (e: FocusEvent) => {
      const el = titled(e.target)
      // only for someone moving with the keyboard: a click already has the pointer's own tip
      if (el && keys && el === e.target) show(el, 0)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab') keys = true
      else hide()
    }
    const down = () => ((keys = false), hide())
    document.addEventListener('mouseover', over)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', hide)
    document.addEventListener('keydown', key, true)
    document.addEventListener('pointerdown', down, true)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      hide()
      document.removeEventListener('mouseover', over)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('pointerdown', down, true)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // under the element, or over it when there is no room; kept inside the window
  useLayoutEffect(() => {
    const el = ref.current
    if (!tip || !el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    const left = Math.max(6, Math.min(window.innerWidth - w - 6, tip.box.left + tip.box.width / 2 - w / 2))
    const below = tip.box.bottom + 6
    setAt({ left, top: below + h > window.innerHeight - 6 ? Math.max(6, tip.box.top - h - 6) : below })
  }, [tip])

  if (!tip) return null
  return (
    <div ref={ref} role="tooltip" className="pointer-events-none fixed z-[200] max-w-[360px] whitespace-pre-line border border-line2 bg-raise px-2.5 py-1.5 text-xs leading-snug text-fg shadow-[0_8px_24px_rgb(0_0_0/0.45)]" style={at ? { left: at.left, top: at.top } : { left: 0, top: 0, visibility: 'hidden' }}>
      {tip.text}
    </div>
  )
}
