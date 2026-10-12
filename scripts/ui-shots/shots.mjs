// UI shots: screenshots and density metrics of every screen, from a real headless browser.
// See README.md beside this file.
//
//   node scripts/ui-shots/shots.mjs --url http://localhost:5214 --out ui-after-shots
//
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { inflateSync } from 'node:zlib'

// ------------------------------------------------------------------ the screens
//
// One row per screen. Edit this table when the structure of the interface changes.
//   n       stable two-digit order index, the first part of the file name
//   name    the screen word in the file name
//   states  which game states the row is shot in (a state it cannot be reached in is skipped and listed)
//   seed    the sweep.js seed to restore first; defaults to the state. null = no game (the menus)
//   setup   JavaScript run in the page after the seed is up (an async function body). It may use:
//             sb, sbGame, sweep   what the dev build and the crawler put on window
//             H.st()              sb.getState()
//             H.tab(tab, views)   setTab(tab); `views` are kept sub-views ({'factory:view': 'orders'}) set first.
//                                 Throws "locked" when the screen is not open yet in this state.
//             H.go(tab, view)     sb.getState().go({ tab, view }) (the screens that read the store's hint), same check
//             H.press(label)      a real click on the visible button whose name is, or starts with, `label`
//             H.mine() / H.rival()  a device of the player's on sale / a rival's device
//             H.sleep(ms)
//   gl      true when the screen has a 3D view: the shot waits for the canvas to have drawn and settled
//
// Tab ids (old ones, still valid): city dashboard products research labs factory stores venue
// marketing care staff office market world rivals finance shares goals system

const FL = ['fresh', 'launched', 'late']
const L = ['late']
const EARLY = ['fresh', 'launched']
const DESIGNER = `H.st().setEditorMode('simple'); H.st().openDesigner(); await H.sleep(150);`

export const SCREENS = [
  { n: 1, name: 'menu', states: ['fresh'], seed: null, setup: `await H.menu(false)` },
  { n: 2, name: 'menu-saves', states: ['fresh', 'late'], setup: `await H.menu(true)` },
  { n: 3, name: 'menu-settings', states: ['fresh'], seed: null, setup: `await H.menu(false); await H.press('Settings and keys')` },
  { n: 4, name: 'newgame', states: ['fresh'], seed: null, setup: `await H.menu(false); H.st().setScreen('new')` },

  { n: 5, name: 'city', states: FL, gl: true, setup: `H.tab('city')` },
  { n: 6, name: 'lock-card', states: EARLY, gl: true, setup: `H.tab('city'); H.st().setTab('shares'); if (!H.st().lockCard) throw new Error('shares is not locked here')` },
  { n: 7, name: 'overview', states: FL, setup: `H.tab('dashboard')` },
  { n: 8, name: 'devices', states: FL, setup: `H.tab('products')` },
  { n: 9, name: 'inspector', states: FL, setup: `H.tab('products'); H.st().focus(H.mine().id)` },
  { n: 10, name: 'inspector-scores', states: FL, setup: `H.tab('products'); H.st().focus(H.mine().id); await H.press('Scores')` },
  { n: 11, name: 'inspector-specs', states: FL, setup: `H.tab('products'); H.st().focus(H.mine().id); await H.press('Specs')` },
  { n: 12, name: 'inspector-reviews', states: FL, setup: `H.tab('products'); H.st().focus(H.mine().id); await H.press('Reviews')` },
  { n: 13, name: 'rival-device', states: FL, setup: `try { H.tab('market') } catch { H.tab('products') } H.st().focus(H.rival().id)` },

  { n: 14, name: 'designer', states: FL, gl: true, setup: DESIGNER },
  { n: 15, name: 'designer-layout', states: FL, gl: true, setup: `${DESIGNER} await H.press('Layout')` },
  { n: 16, name: 'designer-internals', states: FL, gl: true, setup: `${DESIGNER} await H.press('Internals')` },
  { n: 17, name: 'designer-colours', states: FL, gl: true, setup: `${DESIGNER} await H.press('Colours')` },
  { n: 18, name: 'designer-score', states: FL, gl: true, setup: `${DESIGNER} await H.press('Score')` },
  { n: 19, name: 'designer-market', states: FL, gl: true, setup: `${DESIGNER} await H.press('Market')` },
  { n: 20, name: 'designer-advanced', states: L, gl: true, setup: `H.st().setEditorMode('advanced'); H.st().openDesigner(); await H.sleep(150); await H.press('Parts')` },
  { n: 21, name: 'launch-plan', states: FL, gl: true, setup: `${DESIGNER} await H.press('Launch plan')` },

  { n: 22, name: 'research', states: FL, setup: `H.go('research', 'tech')` },
  { n: 23, name: 'research-lines', states: FL, setup: `H.go('research', 'lines')` },
  { n: 24, name: 'labs', states: FL, setup: `H.tab('labs', { 'labs:view': 'chips' })` },
  { n: 25, name: 'labs-os', states: FL, setup: `H.tab('labs', { 'labs:view': 'os' })` },

  { n: 26, name: 'factory-floor', states: FL, gl: true, setup: `H.tab('factory')` },
  { n: 29, name: 'stores', states: FL, setup: `H.tab('stores', { 'stores:open': 'list' })` },
  { n: 30, name: 'store-single', states: FL, gl: true, setup: `const s = H.st().game.stores[0]; if (!s) throw new Error('no store yet'); H.tab('stores', { 'stores:open': s.id })` },
  { n: 31, name: 'venue', states: FL, gl: true, setup: `H.tab('venue')` },

  { n: 32, name: 'marketing', states: FL, setup: `H.go('marketing', 'campaigns')` },
  { n: 34, name: 'marketing-events', states: FL, setup: `H.go('marketing', 'events')` },
  { n: 35, name: 'owners', states: FL, setup: `H.tab('care')` },

  { n: 36, name: 'staff', states: FL, setup: `H.go('staff', 'team')` },
  { n: 37, name: 'staff-teams', states: FL, setup: `H.go('staff', 'teams')` },
  { n: 38, name: 'staff-policies', states: FL, setup: `H.go('staff', 'policy')` },
  { n: 39, name: 'staff-applicants', states: FL, setup: `H.go('staff', 'hire')` },
  { n: 40, name: 'staff-execs', states: FL, setup: `H.go('staff', 'execs')` },
  { n: 41, name: 'person', states: FL, setup: `const p = H.st().game.staff[0]; if (!p) throw new Error('nobody hired yet'); H.go('staff', 'team'); H.st().openPerson(p.id)` },
  { n: 42, name: 'campus', states: FL, gl: true, setup: `H.tab('office')` },

  { n: 43, name: 'market', states: FL, setup: `H.tab('market')` },
  { n: 44, name: 'regions', states: FL, gl: true, setup: `H.tab('world')` },
  { n: 45, name: 'rivals', states: FL, setup: `H.tab('rivals')` },
  { n: 46, name: 'finance', states: FL, setup: `H.tab('finance')` },
  { n: 47, name: 'shares', states: FL, setup: `H.tab('shares')` },
  { n: 48, name: 'growth', states: FL, setup: `H.go('goals', 'goals')` },
  // (the growth tree is only there in a guided game, which the late seed is not)
  { n: 49, name: 'company-growth', states: EARLY, setup: `H.go('goals', 'growth')` },

  { n: 50, name: 'system', states: FL, setup: `H.go('system', 'saves')` },
  { n: 58, name: 'system-company', states: FL, setup: `H.go('system', 'company')` },
  { n: 51, name: 'system-settings', states: FL, setup: `H.go('system', 'settings')` },
  { n: 52, name: 'system-keys', states: FL, setup: `H.go('system', 'keys')` },
  // the form is only opened. Nothing here presses Send, and H.press refuses to.
  { n: 53, name: 'feedback', states: FL, setup: `H.tab('dashboard'); (await sweep.mod('/src/store/trouble.ts')).useFeedback.getState().open('bug')` },

  { n: 54, name: 'decision', states: L, seed: 'latePending', setup: `sb.setState({ yearEnd: null }); H.tab('dashboard'); if (!H.st().game.incidents.some((i) => !i.done)) throw new Error('no decision waiting')` },
  { n: 55, name: 'year-end', states: L, seed: 'latePending', setup: `H.st().act((g) => g.incidents.filter((i) => !i.done).forEach((i) => sbGame.decide(g, i.id, 0))); H.tab('dashboard'); if (H.st().yearEnd === null) throw new Error('no year-end summary')` },
  // the late seed has a keynote booked two months out: run the clock until the show comes up by itself
  { n: 56, name: 'keynote', states: L, gl: true, setup: `H.tab('dashboard'); for (let i = 0; i < 60 && !H.st().showing; i++) { H.st().advance(3); if (H.st().yearEnd !== null) H.st().closeYear(); H.st().act((g) => g.incidents.filter((x) => !x.done).forEach((x) => sbGame.decide(g, x.id, 0))) } if (!H.st().showing) throw new Error('no keynote came up'); await H.sleep(2500)` },
  { n: 57, name: 'gameover', states: L, seed: 'bankrupt', setup: `if (!H.st().game.gameOver) throw new Error('the bankrupt seed did not go bankrupt')` },
]

// ------------------------------------------------------------------ what runs in the page

/** Helpers for the setups, installed as window.H. */
const HELPERS = String.raw`(() => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const frames = async (n) => { for (let i = 0; i < n; i++) await new Promise((r) => { requestAnimationFrame(() => r()); setTimeout(r, 120) }) }
  const st = () => window.sb.getState()
  const shown = (el) => {
    if (!el.isConnected || el.getClientRects().length === 0) return false
    const cs = getComputedStyle(el)
    if (cs.visibility !== 'visible') return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight
  }
  const nameOf = (el) => (el.getAttribute('aria-label') || (el.innerText ?? el.textContent ?? '') || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim()
  const H = (window.H = {
    sleep, frames, st, focus: null, saves: null, themeMod: null,
    async init() {
      H.focus = await window.sweep.mod('/src/store/focus.ts')
      H.saves = await window.sweep.mod('/src/store/saves.ts')
      H.themeMod = await window.sweep.mod('/src/store/theme.ts')
      return true
    },
    /** A screen by its tab id, with any kept sub-views set first. */
    tab(tab, views) {
      for (const [k, v] of Object.entries(views ?? {})) H.focus?.keepView?.(k, v)
      st().setTab(tab)
      if (st().tab !== tab) throw new Error('locked' + (st().lockCard ? ': needs ' + st().lockCard.cap : ''))
    },
    /** A screen and a view inside it, by the store's own "take me there". */
    go(tab, view) {
      st().go({ tab, view })
      if (st().tab !== tab) throw new Error('locked' + (st().lockCard ? ': needs ' + st().lockCard.cap : ''))
    },
    /** Click the visible control with this name (exact, else starting with it). Inside the top dialog when one is up. */
    async press(label, { wait = 120 } = {}) {
      if (/^send\b|sign in|create account/i.test(label)) throw new Error('H.press will not press "' + label + '"')
      await frames(2)
      const want = label.toLowerCase()
      let hit = null
      for (let i = 0; i < 20 && !hit; i++) {
        const all = Array.from(document.querySelectorAll('button, [role=button], [role=tab], summary')).filter((el) => shown(el) && !el.closest('[data-ruler]') && !el.hasAttribute('data-ruler'))
        const named = all.map((el) => ({ el, name: nameOf(el).toLowerCase(), title: (el.getAttribute('title') ?? '').toLowerCase() }))
        // with a dialog or a drawer up, what is in the top one comes first; the frame (top bar, rail, feed) comes last
        const top = Array.from(document.querySelectorAll('[role=dialog], [role=alertdialog]')).filter(shown).pop()
        const rank = (c) => (top && top.contains(c.el) ? 0 : c.el.closest('[data-chrome]') ? 2 : 1)
        named.sort((a, b) => rank(a) - rank(b))
        hit = named.find((c) => c.name === want) ?? named.find((c) => c.title === want) ?? named.find((c) => c.name.startsWith(want))
        if (!hit) await sleep(60)
      }
      if (!hit) throw new Error('no control named "' + label + '"')
      if (hit.el.disabled) throw new Error('"' + label + '" is disabled' + (hit.el.title ? ': ' + hit.el.title : ''))
      hit.el.click()
      await sleep(wait)
    },
    mine() {
      const g = st().game
      const p = g.products.find((x) => x.companyId === 'player' && x.status === 'sale') ?? g.products.find((x) => x.companyId === 'player')
      if (!p) throw new Error('no device of our own yet')
      return p
    },
    rival() {
      const g = st().game
      const p = g.products.find((x) => x.companyId !== 'player' && x.status === 'sale') ?? g.products.find((x) => x.companyId !== 'player')
      if (!p) throw new Error('no rival device')
      return p
    },
    /** The main menu, with no save in storage or with the current game saved to two slots. */
    async menu(withSave) {
      const game = st().game
      for (const s of await H.saves.listSaves()) await H.saves.deleteSave(s.slot)
      if (withSave) {
        if (!game) throw new Error('H.menu(true) needs a game to save: give the row a seed')
        await H.saves.saveGame('Slot 1', game)
        await H.saves.saveGame('autosave', game)
      }
      if (st().screen === 'game') st().quit()
      // the menu reads the list of saves as it opens: open it again
      st().setScreen('new')
      await sleep(60)
      st().setScreen('menu')
      await sleep(250)
    },
    theme(id) {
      H.themeMod.applyTheme(id)
      return document.documentElement.dataset.theme
    },
    /** The largest 3D view on the page, if there is one worth the name. */
    canvas() {
      let best = null
      for (const c of document.querySelectorAll('canvas')) {
        if (!shown(c)) continue
        const r = c.getBoundingClientRect()
        const x = Math.max(0, r.left), y = Math.max(0, r.top), w = Math.min(innerWidth, r.right) - x, h = Math.min(innerHeight, r.bottom) - y
        if (w < 200 || h < 150) continue
        if (!best || w * h > best.w * best.h) best = { x, y, w, h }
      }
      return best
    },
    /** Wait for the lazily loaded parts, fonts, images and the 3D loading mark. Says what it found. */
    async ready(gl = false, max = 15000) {
      const t0 = performance.now()
      try { await Promise.race([document.fonts.ready, sleep(2000)]) } catch {}
      const loading = () =>
        (st().screen === 'game' && !document.querySelector('[data-chrome=top]')) ||
        Array.from(document.querySelectorAll('[role=status]')).some((el) => { const r = el.getBoundingClientRect(); return r.width * r.height > innerWidth * innerHeight * 0.15 }) ||
        Array.from(document.images).some((img) => shown(img) && !img.complete)
      await frames(3)
      // a 3D view comes in its own piece of the app, a few frames after the screen
      if (gl) while (!H.canvas() && !document.querySelector('[data-3d=unavailable], [data-3d=broken]') && performance.now() - t0 < 8000) await sleep(50)
      while (loading() && performance.now() - t0 < max) await sleep(50)
      const stillLoading = loading()
      await frames(3)
      // nothing transient in the picture
      if (st().toast) window.sb.setState({ toast: null })
      await frames(2)
      const failed = document.querySelector('[data-3d=unavailable], [data-3d=broken], [data-3d=lost]')
      return { canvas: H.canvas(), waited: Math.round(performance.now() - t0), stillLoading, gl3d: failed ? failed.getAttribute('data-3d') : null, crash: !!Array.from(document.querySelectorAll('[role=alert] .t-title, [role=alertdialog] .t-title, .t-title')).find((e) => e.textContent === 'Something broke' && !e.closest('[role=dialog]')) }
    },
    gl() {
      try {
        const c = document.createElement('canvas')
        const gl = c.getContext('webgl2') || c.getContext('webgl')
        if (!gl) return null
        const ext = gl.getExtension('WEBGL_debug_renderer_info')
        const out = { version: gl.getParameter(gl.VERSION), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }
        gl.getExtension('WEBGL_lose_context')?.loseContext()
        return out
      } catch (e) { return null }
    },
  })
})()`

/** The measurements of the page as it stands. One function, run in the page; returns plain data. */
const METRICS = String.raw`(() => {
  const vw = innerWidth, vh = innerHeight
  const VIEW = { l: 0, t: 0, r: vw, b: vh }
  const styles = new Map()
  const cs = (el) => { let s = styles.get(el); if (!s) styles.set(el, (s = getComputedStyle(el))); return s }
  const meet = (a, b) => ({ l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) })
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } }
  // per element: is it hidden, how opaque, what it is clipped to, what its children are clipped to
  const infos = new Map()
  const ROOT = { hidden: false, opacity: 1, clip: VIEW, inner: VIEW }
  function info(el) {
    if (!el || el === document.documentElement || el.nodeType !== 1) return ROOT
    let i = infos.get(el)
    if (i) return i
    const s = cs(el)
    const up = info(el.parentElement)
    const hidden = up.hidden || s.display === 'none' || s.visibility !== 'visible'
    const opacity = up.opacity * Number(s.opacity || 1)
    // a fixed box is clipped by the window only; an absolute one by what holds it, not by what it merely sits inside
    const clip = s.position === 'fixed' ? VIEW : s.position === 'absolute' ? info(el.offsetParent && el.offsetParent !== document.body ? el.offsetParent : null).inner : up.inner
    const clips = s.display !== 'contents' && (s.overflowX !== 'visible' || s.overflowY !== 'visible')
    const inner = clips ? meet(clip, rectOf(el)) : clip
    infos.set(el, (i = { hidden, opacity, clip, inner }))
    return i
  }
  const area = (c) => Math.max(0, c.r - c.l) * Math.max(0, c.b - c.t)
  const seen = (rect, clip) => { const m = meet(rect, clip); return m.r - m.l >= 1 && m.b - m.t >= 1 }
  /**
   * Under something opaque: a drawer, a full-screen layer. Whatever is hit at the point is not the
   * element or a relative of it, and has a solid background between itself and what the two share.
   * (A dimmed backdrop is not solid: what is behind a modal still counts, and the modal's own
   * share is in regions.dialog. Text that takes no pointer cannot be tested this way and counts.)
   */
  const buried = (el, x, y) => {
    if (x < 0 || y < 0 || x >= vw || y >= vh || cs(el).pointerEvents === 'none') return false
    const hit = document.elementFromPoint(x, y)
    if (!hit || hit === el || el.contains(hit) || hit.contains(el)) return false
    for (let p = hit; p && !p.contains(el); p = p.parentElement) if (rgba(cs(p).backgroundColor).a >= 0.95) return true
    return false
  }
  const elVisible = (el, deep = true) => {
    const i = info(el)
    if (i.hidden || i.opacity < 0.02) return false
    const r = rectOf(el)
    if (!(r.r - r.l >= 1 && r.b - r.t >= 1 && seen(r, i.clip))) return false
    const m = meet(r, i.clip)
    return !deep || !buried(el, (m.l + m.r) / 2, (m.t + m.b) / 2)
  }
  const path = (el) => {
    const parts = []
    for (let p = el, n = 0; p && p !== document.body && n < 4; p = p.parentElement, n++) {
      let s = p.tagName.toLowerCase()
      if (p.id) s += '#' + p.id
      for (const a of ['data-chrome', 'data-coach', 'role']) if (p.getAttribute(a)) s += '[' + a + '=' + p.getAttribute(a) + ']'
      const cl = (typeof p.className === 'string' ? p.className : '').split(/\s+/).filter(Boolean).slice(0, 3).join('.')
      if (cl) s += '.' + cl
      parts.unshift(s)
    }
    return parts.join(' > ')
  }
  // any CSS colour, as the browser paints it
  const pad = document.createElement('canvas')
  pad.width = pad.height = 1
  const ctx = pad.getContext('2d', { willReadFrequently: true })
  const colours = new Map()
  const rgba = (c) => {
    let v = colours.get(c)
    if (v) return v
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = '#000'
    ctx.fillStyle = c
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    // (un-premultiplied by the canvas already)
    v = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }
    if (c === 'transparent' || /^rgba\(0, 0, 0, 0\)$/.test(c)) v = { r: 0, g: 0, b: 0, a: 0 }
    colours.set(c, v)
    return v
  }
  const over = (top, a, under) => ({ r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a) })
  const backs = new Map()
  function backdrop(el) {
    if (!el || el.nodeType !== 1) return { r: 255, g: 255, b: 255 }
    let b = backs.get(el)
    if (b) return b
    const under = backdrop(el.parentElement)
    const c = rgba(cs(el).backgroundColor)
    b = c.a > 0 ? over(c, c.a, under) : under
    backs.set(el, b)
    return b
  }
  const lum = ({ r, g, b }) => { const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')

  // ---- (a) (b) (d) (e): text
  // where it sits: a dialog or drawer, the frame (top, nav, feed), or the screen itself
  const regionOf = (el) => { if (el.closest('[role=dialog], [role=alertdialog]')) return 'dialog'; const c = el.closest('[data-chrome]'); return c ? c.getAttribute('data-chrome') : 'screen' }
  const regions = {}
  const reg = (name) => (regions[name] ??= { textNodes: 0, numerals: 0, controls: 0 })
  let textNodes = 0, numerals = 0, chars = 0
  const sizes = {}
  const small = {}
  const low = new Map()
  const range = document.createRange()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const raw = node.nodeValue
    if (!raw || !/\S/.test(raw)) continue
    const el = node.parentElement
    if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION)$/.test(el.tagName)) continue
    const i = info(el)
    if (i.hidden || i.opacity < 0.02) continue
    range.selectNodeContents(node)
    let on = null
    for (const r of range.getClientRects()) if (r.width > 0.5 && r.height > 0.5 && seen({ l: r.left, t: r.top, r: r.right, b: r.bottom }, i.inner)) { on = meet({ l: r.left, t: r.top, r: r.right, b: r.bottom }, i.inner); break }
    if (!on || buried(el, (on.l + on.r) / 2, (on.t + on.b) / 2)) continue
    const text = raw.replace(/\s+/g, ' ').trim()
    const n = text.replace(/\s/g, '').length
    const digits = (text.match(/\d/g) ?? []).length
    textNodes++
    chars += n
    numerals += digits
    const rg = reg(regionOf(el))
    rg.textNodes++
    rg.numerals += digits
    const s = cs(el)
    const px = Math.round(parseFloat(s.fontSize) * 2) / 2
    const bucket = (sizes[px] ??= { nodes: 0, chars: 0 })
    bucket.nodes++
    bucket.chars += n
    if (px < 11) {
      const list = (small[px] ??= [])
      if (list.length < 15) list.push({ text: text.slice(0, 60), path: path(el) })
    }
    // contrast against what is painted behind it
    const fg = rgba(s.color)
    const bg = backdrop(el)
    const alpha = fg.a * i.opacity
    const ink = over(fg, alpha, bg)
    const l1 = lum(ink), l2 = lum(bg)
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    if (ratio < 4.5) {
      const off = !!el.closest(':disabled, [aria-disabled=true]')
      const key = hex(ink) + ' on ' + hex(bg) + (off ? ' (disabled)' : '')
      let g = low.get(key)
      if (!g) low.set(key, (g = { fg: hex(ink), bg: hex(bg), disabled: off, ratio: +ratio.toFixed(2), count: 0, chars: 0, sizes: [], samples: [] }))
      g.count++
      g.chars += n
      if (!g.sizes.includes(px)) g.sizes.push(px)
      if (g.samples.length < 3) g.samples.push({ text: text.slice(0, 50), path: path(el) })
    }
  }

  // ---- (c) controls
  const controlSet = new Set()
  for (const el of document.querySelectorAll('button, a[href], input, select, textarea, summary, [role=button], [tabindex]:not([tabindex="-1"])')) {
    if (el.type === 'hidden' || !elVisible(el)) continue
    controlSet.add(el)
  }
  for (const el of controlSet) reg(regionOf(el)).controls++
  // the same without rows and cards that are merely focusable: buttons, links and fields only
  const widgets = Array.from(controlSet).filter((el) => el.matches('button, a[href], input, select, textarea, summary, [role=button]')).length
  // every digit in the page's text, scrolled-away lists included
  const numeralsAll = ((document.body.innerText ?? '').match(/\d/g) ?? []).length

  // ---- (f) (i): one pass over every element
  const overflow = []
  const layers = []
  for (const el of document.body.querySelectorAll('*')) {
    if (el.namespaceURI !== 'http://www.w3.org/1999/xhtml') continue
    const s = cs(el)
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1 && elVisible(el, false)) overflow.push({ path: path(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth })
    if ((s.position === 'fixed' || s.position === 'absolute') && Number(s.zIndex) >= 30 && el.id !== 'sb-drawer' && s.pointerEvents !== 'none' && elVisible(el, false)) layers.push({ el, z: Number(s.zIndex), rect: meet(rectOf(el), VIEW) })
  }
  const docOverflow = document.documentElement.scrollWidth > vw
  const overlaps = []
  for (let a = 0; a < layers.length; a++)
    for (let b = a + 1; b < layers.length; b++) {
      const A = layers[a], B = layers[b]
      if (A.el.contains(B.el) || B.el.contains(A.el)) continue
      const m = area(meet(A.rect, B.rect))
      if (m > 16) overlaps.push({ a: path(A.el), az: A.z, b: path(B.el), bz: B.z, area: Math.round(m) })
    }
  overlaps.sort((x, y) => y.area - x.area)

  const nav = document.querySelector('[data-chrome="nav"]')
  const railScrolls = nav ? [nav, ...nav.querySelectorAll('*')].some((el) => { const o = cs(el).overflowY; return (o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 1 }) : null

  // ---- (g) how much of the screen's area the 3D view keeps
  let coverage = null, canvasShare = null
  const main = document.querySelector('main') ?? document.body
  let canvas = null
  for (const c of document.querySelectorAll('canvas')) {
    if (!elVisible(c, false)) continue
    const r = c.getBoundingClientRect()
    if (r.width < 200 || r.height < 150) continue
    if (!canvas || r.width * r.height > canvas.getBoundingClientRect().width * canvas.getBoundingClientRect().height) canvas = c
  }
  if (canvas) {
    // (a 3D view that is not inside main, the designer's or the keynote's, is measured against its own layer)
    let box = main
    if (!main.contains(canvas)) for (let p = canvas.parentElement; p; p = p.parentElement) { const r = p.getBoundingClientRect(); if (r.width >= vw * 0.6 && r.height >= vh * 0.6) { box = p; break } }
    const m = meet(rectOf(box), VIEW)
    const COLS = 40, ROWS = 24
    let covered = 0, total = 0
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const px = m.l + ((x + 0.5) / COLS) * (m.r - m.l)
        const py = m.t + ((y + 0.5) / ROWS) * (m.b - m.t)
        const hit = document.elementFromPoint(px, py)
        total++
        if (hit !== canvas) covered++
      }
    coverage = +((covered / total) * 100).toFixed(1)
    canvasShare = +((area(meet(rectOf(canvas), m)) / Math.max(1, area(m))) * 100).toFixed(1)
  }

  // ---- (h) filled primary buttons
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;width:0;height:0;background-color:var(--color-accent)'
  document.body.appendChild(probe)
  const accent = getComputedStyle(probe).backgroundColor
  probe.remove()
  let primaries = 0
  const primaryNames = []
  for (const el of controlSet) {
    if (!el.matches('button, [role=button], a[href]')) continue
    if (cs(el).backgroundColor === accent) {
      primaries++
      if (primaryNames.length < 12) primaryNames.push((el.getAttribute('aria-label') || el.innerText || el.title || '').replace(/\s+/g, ' ').trim().slice(0, 40))
    }
  }

  const under11 = Object.keys(small).map(Number).sort((a, b) => a - b).map((px) => ({ px, nodes: sizes[px].nodes, chars: sizes[px].chars, samples: small[px] }))
  const smallNodes = under11.reduce((a, s) => a + s.nodes, 0)
  const smallChars = under11.reduce((a, s) => a + s.chars, 0)
  const s = window.sb?.getState?.()
  return {
    textNodes, numerals, controls: controlSet.size, chars, widgets, numeralsAll,
    sizes, under11,
    pctUnder11: { nodes: textNodes ? +((smallNodes / textNodes) * 100).toFixed(1) : 0, chars: chars ? +((smallChars / chars) * 100).toFixed(1) : 0 },
    lowContrast: Array.from(low.values()).sort((a, b) => b.count - a.count),
    overflow, docOverflow, railScrolls,
    coverage, canvasShare,
    primaries, primaryNames,
    overlaps: overlaps.slice(0, 30), overlapCount: overlaps.length,
    regions,
    where: s ? { screen: s.screen, tab: s.tab, designing: s.designing, inspect: s.inspect, person: s.person, lockCard: s.lockCard?.cap ?? null, yearEnd: s.yearEnd, showing: s.showing, staff: s.game?.staff.length ?? null, products: s.game ? s.game.products.filter((p) => p.companyId === 'player').length : null, day: s.game?.day ?? null } : null,
  }
})()`

// ------------------------------------------------------------------ command line

function parseArgs(argv) {
  const o = { url: 'http://localhost:5214', out: 'ui-after-shots', sizes: '1180x620,1280x720,1440x900,1920x1080', states: 'fresh,late', themes: 'ember', gl: 'auto', quality: 80 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
    const k = a.slice(2)
    if (['headed', 'clean', 'no-shots', 'list', 'help', 'verbose'].includes(k)) o[k] = true
    else o[k] = argv[++i]
  }
  return o
}
const HELP = `node scripts/ui-shots/shots.mjs [options]
  --url <base>            dev server to shoot (default http://localhost:5214)
  --out <dir>             where the JPEGs, metrics.json, summary.md and run.json go (default ui-after-shots)
  --sizes 1440x900,...    window sizes (default 1180x620,1280x720,1440x900,1920x1080)
  --states fresh,late     game states (also: launched)
  --themes ember,volt,ice,rose   (default ember)
  --only <regex>          only screens whose name matches
  --keep-shots <sizes>    save JPEGs only for these sizes; metrics are taken for all (default: all sizes)
  --no-shots              metrics only
  --clean                 forget the metrics already in --out instead of merging into them
  --gl auto|gpu|swiftshader   how WebGL is drawn (default auto: the GPU, else software)
  --chrome <path>         browser to launch
  --headed                show the browser window
  --quality <1-100>       JPEG quality (default 80)
  --list                  print the screen table and exit
  --compare <metrics.json>  no browser: print before -> after density, <file> being "before" and <out>/metrics.json "after"
  --script <file.mjs>     no screens: run "export default async function (page)" against the page (see README.md)`

// ------------------------------------------------------------------ browser

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const BROWSERS = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
const GL_FLAGS = {
  gpu: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=d3d11'],
  swiftshader: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
}

/** Browser processes still running on a profile folder (Windows: helpers can outlive the browser). */
function leftovers(profile) {
  if (process.platform !== 'win32') return []
  const name = profile.split(/[\\/]/).pop()
  const out = spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match '${name}' -and $_.Name -match 'chrome|msedge' } | ForEach-Object { $_.ProcessId }`], { encoding: 'utf8' })
  return (out.stdout ?? '').split(/\s+/).map(Number).filter(Boolean)
}

async function launch(opts, glMode) {
  const exe = opts.chrome ?? BROWSERS.find((p) => existsSync(p))
  if (!exe) throw new Error('No browser found. Pass --chrome <path>.')
  const profile = mkdtempSync(join(tmpdir(), 'ui-shots-'))
  const flags = [
    ...(opts.headed ? [] : ['--headless=new']),
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--window-size=1920,1200',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--disable-default-apps', '--disable-component-update', '--disable-background-networking', '--metrics-recording-only', '--mute-audio', '--hide-scrollbars',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion,Translate',
    '--force-device-scale-factor=1', '--force-color-profile=srgb',
    // nothing but this machine can be reached, whatever the page tries
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
    ...GL_FLAGS[glMode],
    'about:blank',
  ]
  const child = spawn(exe, flags, { stdio: 'ignore' })
  const portFile = join(profile, 'DevToolsActivePort')
  let port = 0
  for (let i = 0; i < 200 && !port; i++) {
    await sleep(100)
    if (existsSync(portFile)) port = Number(readFileSync(portFile, 'utf8').split('\n')[0]) || 0
  }
  if (!port) {
    child.kill()
    throw new Error('The browser did not open its DevTools port.')
  }
  let target
  for (let i = 0; i < 50 && !target; i++) {
    const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => [])
    target = list.find((t) => t.type === 'page')
    if (!target) await sleep(100)
  }
  if (!target) throw new Error('No page in the browser.')
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => ((ws.onopen = res), (ws.onerror = () => rej(new Error('DevTools socket failed')))))
  let id = 0
  const waiting = new Map()
  const listeners = new Set()
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data)
    if (msg.id && waiting.has(msg.id)) {
      const { res, rej, method } = waiting.get(msg.id)
      waiting.delete(msg.id)
      if (msg.error) rej(new Error(`${method}: ${msg.error.message}`))
      else res(msg.result)
    } else if (msg.method) for (const l of listeners) l(msg)
  }
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id
      waiting.set(n, { res, rej, method })
      ws.send(JSON.stringify({ id: n, method, params }))
    })
  const close = async () => {
    const gone = new Promise((r) => (child.exitCode !== null ? r() : child.once('exit', r)))
    try { await Promise.race([send('Browser.close'), sleep(2000)]) } catch {}
    await Promise.race([gone, sleep(4000)])
    // whatever is left of it, helpers included
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    else try { child.kill('SIGKILL') } catch {}
    for (const p of leftovers(profile)) try { process.kill(p) } catch {}
    for (let i = 0; i < 20; i++) {
      try { rmSync(profile, { recursive: true, force: true }); if (!existsSync(profile)) break } catch {}
      await sleep(300)
    }
  }
  return { send, close, listeners, exe, flags: flags.filter((f) => !f.startsWith('--user-data-dir') && f !== 'about:blank'), glMode }
}

/** Everything the runs and the scripts do to the page. */
function makePage(browser, opts) {
  const { send } = browser
  const consoleErrors = []
  browser.listeners.add((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(msg.params.exceptionDetails?.exception?.description?.split('\n')[0] ?? msg.params.exceptionDetails?.text)
  })
  const run = async (expression, { repl = false, timeout = 180000 } = {}) => {
    const call = send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, replMode: repl, userGesture: true })
    const res = await Promise.race([call, sleep(timeout).then(() => { throw new Error(`timed out after ${timeout} ms: ${expression.slice(0, 80)}`) })])
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description?.split('\n')[0] ?? res.exceptionDetails.text)
    return res.result?.value
  }
  /** Statements, as the body of an async function. */
  const body = (js, o) => run(`(async () => { ${js}\n })()`, o)
  const KEYS = { Escape: [27, 'Escape'], Enter: [13, 'Enter', '\r'], Tab: [9, 'Tab'], Space: [32, ' ', ' '], Backspace: [8, 'Backspace'], Delete: [46, 'Delete'], Home: [36, 'Home'], End: [35, 'End'], PageUp: [33, 'PageUp'], PageDown: [34, 'PageDown'], ArrowLeft: [37, 'ArrowLeft'], ArrowUp: [38, 'ArrowUp'], ArrowRight: [39, 'ArrowRight'], ArrowDown: [40, 'ArrowDown'], Minus: [189, '-', '-'], Equal: [187, '=', '='], NumpadAdd: [107, '+', '+'], NumpadSubtract: [109, '-', '-'], Comma: [188, ',', ','], Period: [190, '.', '.'], Slash: [191, '/', '/'], ShiftLeft: [16, 'Shift'], ControlLeft: [17, 'Control'], AltLeft: [18, 'Alt'] }
  const keyOf = (code) => {
    if (KEYS[code]) return { vk: KEYS[code][0], key: KEYS[code][1], text: KEYS[code][2] }
    if (/^Key[A-Z]$/.test(code)) return { vk: code.charCodeAt(3), key: code[3].toLowerCase(), text: code[3].toLowerCase() }
    if (/^Digit\d$/.test(code)) return { vk: 48 + Number(code[5]), key: code[5], text: code[5] }
    if (/^F\d+$/.test(code)) return { vk: 111 + Number(code.slice(1)), key: code }
    return { vk: 0, key: code }
  }
  const mods = (m) => (typeof m === 'number' ? m : (Array.isArray(m) ? m : m ? [m] : []).reduce((a, x) => a | ({ alt: 1, ctrl: 2, control: 2, meta: 4, cmd: 4, shift: 8 }[String(x).toLowerCase()] ?? 0), 0))
  let size = { w: 1440, h: 900 }
  let pointer = { x: 0, y: 0 }
  const page = {
    send,
    consoleErrors,
    get size() { return size },
    /** Evaluate in the page: an expression or several statements; top-level await works; the last value comes back. */
    eval: (js, o) => run(js, { repl: true, ...o }),
    body,
    wait: sleep,
    async resize(w, h) {
      size = { w, h }
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
      await sleep(120)
    },
    /** Load the app, the crawler (which blocks everything that leaves the machine) and the helpers. */
    async open(url = opts.url) {
      await send('Page.enable')
      await send('Runtime.enable')
      await send('Page.navigate', { url })
      for (let i = 0; i < 300; i++) {
        const ok = await run(`!!(window.sb && window.sbGame && document.getElementById('root')?.childElementCount)`).catch(() => false)
        if (ok) break
        if (i === 299) throw new Error(`The app did not come up at ${url} (is the dev server running? window.sb is only there in dev builds)`)
        await sleep(100)
      }
      await page.install()
    },
    async install() {
      await run(`import('/scripts/ui-sweep/sweep.js?' + Date.now()).then(() => true)`)
      await run(HELPERS)
      await run(`H.init()`)
    },
    /** True when the page was reloaded under us (a hot update) and had to be set up again. */
    async ensure() {
      const ok = await run(`!!(window.sweep && window.sweep.installed && window.H && window.H.focus && window.sb)`).catch(() => false)
      if (ok) return false
      for (let i = 0; i < 300; i++) {
        if (await run(`!!(window.sb && window.sbGame && document.readyState === 'complete')`).catch(() => false)) break
        await sleep(100)
      }
      await page.install()
      return true
    },
    seed: (name) => run(`sweep.seed(${JSON.stringify(name)}).then((log) => (log ?? []).length)`, { timeout: 600000 }),
    theme: (id) => run(`H.theme(${JSON.stringify(id)})`),
    metrics: () => run(METRICS),
    async move(x, y, { steps = 1, buttons = 0 } = {}) {
      for (let i = 1; i <= steps; i++) {
        const px = pointer.x + ((x - pointer.x) * i) / steps
        const py = pointer.y + ((y - pointer.y) * i) / steps
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, button: buttons ? 'left' : 'none', buttons })
      }
      pointer = { x, y }
    },
    async down(x = pointer.x, y = pointer.y, { button = 'left', modifiers } = {}) {
      pointer = { x, y }
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, buttons: button === 'right' ? 2 : button === 'middle' ? 4 : 1, clickCount: 1, modifiers: mods(modifiers) })
    },
    async up(x = pointer.x, y = pointer.y, { button = 'left', modifiers } = {}) {
      pointer = { x, y }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, buttons: 0, clickCount: 1, modifiers: mods(modifiers) })
    },
    async click(x, y, o = {}) {
      await page.move(x, y)
      await page.down(x, y, o)
      await sleep(o.hold ?? 30)
      await page.up(x, y, o)
    },
    /** Press, move in steps, release: a real drag, which the 3D views read on frames. */
    async drag(x1, y1, x2, y2, { steps = 12, button = 'left', pause = 16 } = {}) {
      await page.move(x1, y1)
      await page.down(x1, y1, { button })
      const buttons = button === 'right' ? 2 : button === 'middle' ? 4 : 1
      for (let i = 1; i <= steps; i++) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps, button, buttons })
        await sleep(pause)
      }
      await page.up(x2, y2, { button })
    },
    async wheel(x, y, deltaY, deltaX = 0) {
      await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY })
    },
    async key(code, modifiers) {
      const k = keyOf(code)
      const m = mods(modifiers)
      const base = { code, key: k.key, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers: m }
      const text = k.text && !(m & 7) ? (m & 8 ? k.text.toUpperCase() : k.text) : undefined
      await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text, unmodifiedText: k.text } : {}) })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
    },
    /** Type text into whatever has the focus. */
    type: (text) => send('Input.insertText', { text }),
    async capture({ format = 'jpeg', quality = Number(opts.quality) || 80, clip } = {}) {
      const res = await send('Page.captureScreenshot', { format, ...(format === 'jpeg' ? { quality } : {}), ...(clip ? { clip } : {}), captureBeyondViewport: false, optimizeForSpeed: format === 'png' })
      return Buffer.from(res.data, 'base64')
    },
    /** A JPEG in the output folder. `name` without the extension. */
    async shot(name) {
      const file = join(opts.outDir, `${name}.jpg`)
      writeFileSync(file, await page.capture())
      return file
    },
    /** A small copy of a part of the page, as pixels: for telling a drawn 3D view from a blank one. */
    async sample(rect, width = 96) {
      const png = await page.capture({ format: 'png', clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: width / rect.w } })
      return decodePng(png)
    },
    /** Wait for the page to be ready, and for its 3D view to have drawn and stopped moving. */
    async settle({ gl = false, max = 9000 } = {}) {
      const ready = await run(`H.ready(${gl ? 'true' : 'false'})`, { timeout: 60000 })
      const out = { ...ready, canvasStats: null }
      if (!ready.canvas) {
        await sleep(gl ? 400 : 150)
        return out
      }
      const t0 = Date.now()
      let prev = null
      let stats = null
      let stable = false
      await sleep(350)
      while (Date.now() - t0 < max) {
        const img = await page.sample(ready.canvas)
        stats = pixelStats(img)
        if (prev && !stats.blank && diff(prev, img) < 1.2 && Date.now() - t0 > 900) { stable = true; break }
        prev = img
        await sleep(280)
      }
      out.canvasStats = { ...stats, stable, settledMs: Date.now() - t0 }
      return out
    },
  }
  return page
}

// ------------------------------------------------------------------ pixels

/** 8-bit RGB or RGBA PNG, not interlaced: all that the browser hands back. */
function decodePng(buf) {
  let p = 8
  let width = 0, height = 0, type = 0
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const kind = buf.toString('latin1', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); type = data[9] }
    else if (kind === 'IDAT') idat.push(data)
    p += 12 + len
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : type === 0 ? 1 : 4
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * bpp
  const px = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0
      const b = y ? px[(y - 1) * stride + x] : 0
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0
      let v = line[x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const q = a + b - c; const pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      px[y * stride + x] = v & 255
    }
  }
  return { width, height, bpp, px }
}
function pixelStats(img) {
  const seen = new Set()
  let sum = 0, sq = 0, n = 0
  for (let i = 0; i < img.px.length; i += img.bpp) {
    const r = img.px[i], g = img.px[i + (img.bpp > 1 ? 1 : 0)], b = img.px[i + (img.bpp > 2 ? 2 : 0)]
    seen.add(((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3))
    const l = 0.299 * r + 0.587 * g + 0.114 * b
    sum += l
    sq += l * l
    n++
  }
  const mean = sum / n
  const spread = Math.sqrt(Math.max(0, sq / n - mean * mean))
  return { colours: seen.size, spread: +spread.toFixed(1), mean: +mean.toFixed(1), blank: seen.size < 12 || spread < 3 }
}
function diff(a, b) {
  if (a.px.length !== b.px.length) return 255
  let d = 0
  for (let i = 0; i < a.px.length; i++) d += Math.abs(a.px[i] - b.px[i])
  return d / a.px.length
}

// ------------------------------------------------------------------ reports

const pad2 = (n) => String(n).padStart(2, '0')
const keyOfRow = (m) => `${m.screen}|${m.state}|${m.size}|${m.theme ?? 'ember'}`
function flagsOf(m) {
  const f = []
  if (m.docOverflow) f.push('page scrolls sideways')
  if (m.overflow?.length) f.push(`${m.overflow.length} sideways scroller${m.overflow.length > 1 ? 's' : ''}`)
  if (m.railScrolls) f.push('rail scrolls')
  const lc = (m.lowContrast ?? []).filter((g) => !g.disabled).reduce((a, g) => a + g.count, 0)
  if (lc) f.push(`${lc} low-contrast`)
  if (m.overlapCount) f.push(`${m.overlapCount} layer overlap${m.overlapCount > 1 ? 's' : ''}`)
  const tiny = (m.under11 ?? []).filter((s) => s.px < 9).reduce((a, s) => a + s.nodes, 0)
  if (tiny) f.push(`${tiny} under 9px`)
  if (m.canvas?.blank) f.push('3D VIEW BLANK')
  if (m.gl && !m.canvas) f.push('NO 3D VIEW')
  if (m.canvas && !m.canvas.stable) f.push('3D moving')
  if (m.gl3d) f.push(`3D ${m.gl3d}`)
  if (m.crash) f.push('CRASH SCREEN')
  return f.join('; ')
}
function summaryMd(rows, run) {
  const out = [`# UI shots: ${run.url}`, '', `Taken ${run.date}. WebGL: ${run.webgl?.renderer ?? 'none'} (${run.glMode}).`, '', 'Text nodes, numerals and controls are what is actually visible in the window (clipped and scrolled-away content is not counted), frame and news feed included. "% text <11px" is by text node (by character in brackets). Coverage is the share of the screen area where a pointer does not land on the 3D view.', '']
  const sizes = [...new Set(rows.map((r) => r.size))]
  for (const size of sizes) {
    for (const theme of [...new Set(rows.filter((r) => r.size === size).map((r) => r.theme))]) {
      out.push(`## ${size}${theme !== 'ember' ? ` (${theme})` : ''}`, '', '| # | Screen | State | Text nodes | Numerals | Controls | % text <11px | Primaries | Coverage | Flags |', '|---|---|---|---|---|---|---|---|---|---|')
      for (const m of rows.filter((r) => r.size === size && r.theme === theme)) out.push(`| ${pad2(m.n)} | ${m.screen} | ${m.state} | ${m.textNodes} | ${m.numerals} | ${m.controls} | ${m.pctUnder11.nodes}% (${m.pctUnder11.chars}%) | ${m.primaries} | ${m.coverage === null ? '' : m.coverage + '%'} | ${flagsOf(m)} |`)
      out.push('')
    }
  }
  if (run.skipped?.length) {
    out.push('## Not reached', '', '| Screen | State | Why |', '|---|---|---|')
    const seen = new Set()
    for (const s of run.skipped) {
      const k = `${s.screen}|${s.state}|${s.why}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push(`| ${s.screen} | ${s.state} | ${s.why} |`)
    }
    out.push('')
  }
  return out.join('\n')
}
function compare(beforeFile, afterFile) {
  const before = JSON.parse(readFileSync(beforeFile, 'utf8'))
  const after = JSON.parse(readFileSync(afterFile, 'utf8'))
  const byKey = new Map(before.map((m) => [keyOfRow(m), m]))
  const d = (b, a) => `${b} -> ${a} (${a - b >= 0 ? '+' : ''}${b ? Math.round(((a - b) / b) * 100) : 0}%)`
  const lines = []
  const sizes = [...new Set(after.map((m) => m.size))]
  for (const size of sizes) {
    lines.push(`## ${size}`, '', '| Screen | State | Text nodes | Numerals | Controls | Primaries | Coverage |', '|---|---|---|---|---|---|---|')
    for (const a of after.filter((m) => m.size === size)) {
      const b = byKey.get(keyOfRow(a))
      if (!b) { lines.push(`| ${a.screen} | ${a.state} | new: ${a.textNodes} | ${a.numerals} | ${a.controls} | ${a.primaries} | ${a.coverage ?? ''} |`); continue }
      lines.push(`| ${a.screen} | ${a.state} | ${d(b.textNodes, a.textNodes)} | ${d(b.numerals, a.numerals)} | ${d(b.controls, a.controls)} | ${b.primaries} -> ${a.primaries} | ${b.coverage === null && a.coverage === null ? '' : `${b.coverage ?? '-'} -> ${a.coverage ?? '-'}`} |`)
    }
    const gone = before.filter((m) => m.size === size && !after.some((a) => keyOfRow(a) === keyOfRow(m)))
    for (const b of gone) lines.push(`| ${b.screen} | ${b.state} | only before: ${b.textNodes} | ${b.numerals} | ${b.controls} | ${b.primaries} | ${b.coverage ?? ''} |`)
    lines.push('')
  }
  return lines.join('\n')
}

// ------------------------------------------------------------------ the run

async function openBrowser(opts) {
  const order = opts.gl === 'auto' ? ['gpu', 'swiftshader'] : [opts.gl]
  let last
  for (const mode of order) {
    if (!GL_FLAGS[mode]) throw new Error(`--gl ${mode}: use auto, gpu or swiftshader`)
    const browser = await launch(opts, mode)
    const page = makePage(browser, opts)
    try {
      await page.resize(1440, 900)
      await page.open()
      const webgl = await page.eval('H.gl()')
      if (webgl || mode === order[order.length - 1]) return { browser, page, webgl }
      last = `no WebGL with ${mode}`
    } catch (e) {
      await browser.close()
      throw e
    }
    await browser.close()
  }
  throw new Error(last)
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) return console.log(HELP)
  opts.outDir = resolve(opts.out)
  if (opts.list) return console.log(SCREENS.map((s) => `${pad2(s.n)} ${s.name.padEnd(20)} ${s.states.join(',').padEnd(22)} ${s.gl ? '3D ' : '   '} ${s.setup.slice(0, 110)}`).join('\n'))
  if (opts.compare) return console.log(compare(resolve(opts.compare), join(opts.outDir, 'metrics.json')))
  mkdirSync(opts.outDir, { recursive: true })

  const { browser, page, webgl } = await openBrowser(opts)
  const log = (...a) => console.log(...a)
  log(`browser: ${browser.exe}`)
  log(`webgl:   ${webgl ? `${webgl.renderer} (${browser.glMode})` : 'NONE'}`)
  try {
    if (opts.script) {
      const mod = await import(pathToFileURL(resolve(opts.script)).href)
      const [w, h] = opts.sizes.split(',')[0].split('x').map(Number)
      await page.resize(w, h)
      await mod.default(page, opts)
      return
    }

    const sizes = opts.sizes.split(',').map((s) => s.trim().split('x').map(Number))
    const states = opts.states.split(',').map((s) => s.trim())
    const themes = opts.themes.split(',').map((s) => s.trim())
    const only = opts.only ? new RegExp(opts.only) : null
    const keep = opts['no-shots'] ? [] : opts['keep-shots'] ? opts['keep-shots'].split(',').map((s) => s.trim()) : sizes.map((s) => s.join('x'))
    const jobs = []
    for (const state of states) for (const s of SCREENS) if (s.states.includes(state) && (!only || only.test(s.name))) jobs.push({ ...s, state })
    jobs.sort((a, b) => states.indexOf(a.state) - states.indexOf(b.state) || a.n - b.n)

    const metricsFile = join(opts.outDir, 'metrics.json')
    const rows = new Map()
    if (!opts.clean && existsSync(metricsFile)) for (const m of JSON.parse(readFileSync(metricsFile, 'utf8'))) rows.set(keyOfRow(m), m)
    const skipped = []
    const t0 = Date.now()
    let done = 0
    const total = jobs.length * sizes.length * themes.length
    for (const [w, h] of sizes) {
      const size = `${w}x${h}`
      await page.resize(w, h)
      for (const theme of themes) {
        for (const job of jobs) {
          done++
          const label = `${pad2(job.n)}-${job.name}-${job.state}-${size}${theme !== 'ember' ? `-${theme}` : ''}`
          try {
            if (await page.ensure()) log('  (the page was reloaded: set up again)')
            await page.theme(theme)
            const seed = job.seed === undefined ? job.state : job.seed
            if (seed) await page.seed(seed)
            else await page.body(`if (H.st().screen === 'game') H.st().quit()`)
            await page.move(2, 2)
            try {
              await page.body(job.setup)
            } catch (e) {
              const why = String(e.message).replace(/^Error: /, '')
              skipped.push({ screen: job.name, state: job.state, size, why })
              rows.delete(`${job.name}|${job.state}|${size}|${theme}`)
              if (opts.verbose || !/^locked|not locked here|yet$/.test(why)) log(`  skip ${label}: ${why}`)
              continue
            }
            const ready = await page.settle({ gl: !!job.gl })
            const m = await page.metrics()
            const file = `${label}.jpg`
            const kept = keep.includes(size)
            if (kept) writeFileSync(join(opts.outDir, file), await page.capture())
            const row = { file: kept ? file : null, n: job.n, screen: job.name, state: job.state, size, theme, gl: !!job.gl, ...m, canvas: ready.canvasStats, gl3d: ready.gl3d, crash: ready.crash, stillLoading: ready.stillLoading }
            rows.set(keyOfRow(row), row)
            log(`[${done}/${total}] ${label}  text ${m.textNodes}  num ${m.numerals}  ctl ${m.controls}${m.coverage !== null ? `  cover ${m.coverage}%` : ''}${flagsOf(row) ? `  !! ${flagsOf(row)}` : ''}`)
          } catch (e) {
            skipped.push({ screen: job.name, state: job.state, size, why: `FAILED: ${e.message}` })
            log(`  FAILED ${label}: ${e.message}`)
          }
        }
      }
    }
    await page.theme('ember').catch(() => {})
    const stOrder = ['fresh', 'launched', 'late']
    const szOrder = (s) => Number(s.split('x')[0])
    const all = [...rows.values()].sort((a, b) => szOrder(a.size) - szOrder(b.size) || a.theme.localeCompare(b.theme) || stOrder.indexOf(a.state) - stOrder.indexOf(b.state) || a.n - b.n)
    const run = { url: opts.url, date: new Date().toISOString(), browser: browser.exe, flags: browser.flags, glMode: browser.glMode, webgl, sizes: sizes.map((s) => s.join('x')), states, themes, seconds: Math.round((Date.now() - t0) / 1000), skipped, pageErrors: [...new Set(page.consoleErrors)].slice(0, 40) }
    writeFileSync(metricsFile, JSON.stringify(all, null, 1))
    writeFileSync(join(opts.outDir, 'run.json'), JSON.stringify(run, null, 1))
    writeFileSync(join(opts.outDir, 'summary.md'), summaryMd(all, run))
    log(`\n${all.length} rows in ${metricsFile}; ${skipped.length} skipped; ${run.seconds}s`)
  } finally {
    await browser.close()
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e.stack ?? e)
    process.exit(1)
  },
)
