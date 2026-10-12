// UI sweep: a page-side crawler for the dev build. See README.md beside this file.
// Load it in the dev server's page:  await import('/scripts/ui-sweep/sweep.js?' + Date.now())
// Everything hangs off window.sweep.
/* eslint-disable */

const W = window
// Timers in a background page are throttled, after a few minutes to one wake-up a minute; messages are not.
const sleep = async (ms) => {
  const until = performance.now() + ms
  while (performance.now() < until) {
    await new Promise((r) => {
      const c = new MessageChannel()
      c.port1.onmessage = () => r()
      c.port2.postMessage(0)
    })
  }
}
// a frame, or 20 ms when the page is in the background and frames come once a second
const frame = () => new Promise((r) => (requestAnimationFrame(() => r()), setTimeout(r, 20)))
/** Let React render and its effects run. A background page gets a frame a second, so this does not wait on one. */
const yieldNow = () =>
  new Promise((r) => {
    const c = new MessageChannel()
    c.port1.onmessage = () => r()
    c.port2.postMessage(0)
  })
const settle = async (ms = 12) => {
  await yieldNow()
  await sleep(S.slow ? ms * 4 : ms)
  await yieldNow()
}
const st = () => W.sb.getState()
const G = () => W.sbGame

// ------------------------------------------------------------------ recording

const S = (W.sweep = W.sweep && W.sweep.installed ? W.sweep : { installed: false, log: [], seen: new Set(), ctx: '', counters: { clicks: 0, typed: 0, keys: 0, stops: 0, audits: 0, tabSwitches: 0, designerOpens: 0 }, native: {}, audio: 0, mutations: 0, blocked: [] })

function note(kind, what, extra) {
  const key = `${kind}|${what}`
  if (S.seen.has(key)) return
  S.seen.add(key)
  S.log.push({ kind, what, where: S.ctx, ...(extra ? { extra } : {}) })
  // kept through a reload of the page, which editing any source file causes
  try {
    sessionStorage.setItem('sweep-log', JSON.stringify(S.log.slice(-2000)))
  } catch {}
}

function install() {
  if (S.installed) return
  S.installed = true
  const N = S.native
  for (const level of ['error', 'warn']) {
    N[level] = console[level]
    console[level] = (...a) => {
      const text = a.map((x) => (x instanceof Error ? `${x.name}: ${x.message}` : typeof x === 'string' ? x : JSON.stringify(x)?.slice(0, 200))).join(' ').slice(0, 400)
      // three.js and vite chatter that is not about the game
      if (!/\[vite\]|Download the React DevTools|THREE\.Clock|sweep:/.test(text)) note(`console.${level}`, text)
      N[level].apply(console, a)
    }
  }
  W.addEventListener('error', (e) => note('uncaught', `${e.message} (${(e.filename || '').split('/').pop()}:${e.lineno})`))
  W.addEventListener('unhandledrejection', (e) => note('rejection', String(e.reason?.message ?? e.reason).slice(0, 300)))
  // nothing leaves the machine, nothing opens a native dialog, nothing navigates away
  N.fetch = W.fetch
  W.fetch = (input, init) => {
    const url = String(input?.url ?? input)
    const local = url.startsWith('/') || url.startsWith(location.origin) || url.startsWith('data:') || url.startsWith('blob:')
    if (!local && !S.allowNetwork) {
      S.blocked.push(url.slice(0, 120))
      return Promise.reject(new TypeError('sweep: network blocked'))
    }
    return N.fetch.call(W, input, init).then((res) => {
      if (!res.ok) note('network', `${res.status} ${url.slice(0, 120)}`)
      return res
    })
  }
  N.open = W.open
  W.open = (url) => (S.blocked.push(`open ${url}`), null)
  N.inputClick = HTMLInputElement.prototype.click
  HTMLInputElement.prototype.click = function () {
    if (this.type === 'file') return void S.blocked.push('file dialog')
    return N.inputClick.call(this)
  }
  N.anchorClick = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) return void (S.blocked.push(`download ${this.download}`), (S.lastDownload = { name: this.download, href: this.href }))
    return void S.blocked.push(`link ${this.href}`)
  }
  document.addEventListener(
    'click',
    (e) => {
      const a = e.target.closest?.('a[href]')
      if (a) (e.preventDefault(), S.blocked.push(`link ${a.href}`), S.mutations++)
    },
    true,
  )
  if ('showDirectoryPicker' in W) {
    N.picker = W.showDirectoryPicker
    W.showDirectoryPicker = () => (S.blocked.push('folder dialog'), Promise.reject(new DOMException('sweep', 'AbortError')))
  }
  for (const k of ['alert', 'confirm', 'prompt']) {
    N[k] = W[k]
    W[k] = (m) => (note('native-dialog', `${k}: ${String(m).slice(0, 80)}`), k === 'confirm' ? true : k === 'prompt' ? '' : undefined)
  }
  try {
    N.reload = Location.prototype.reload
    Location.prototype.reload = function () {
      S.blocked.push('reload')
    }
  } catch {}
  // sound is an effect too: count what gets played
  const AC = W.AudioContext || W.webkitAudioContext
  if (AC) {
    for (const name of ['createOscillator', 'createBufferSource', 'createGain', 'createBiquadFilter']) {
      const orig = AC.prototype[name]
      AC.prototype[name] = function (...a) {
        S.audio++
        return orig.apply(this, a)
      }
    }
  }
  // leak accounting: listeners on window/document, timers, WebGL contexts
  const live = (S.live = { listeners: new Map(), intervals: new Set(), timeouts: new Set(), gl: [] })
  for (const target of [W, document]) {
    const add = target.addEventListener
    const rem = target.removeEventListener
    const tag = target === W ? 'window' : 'document'
    target.addEventListener = function (type, fn, opts) {
      const k = `${tag}:${type}`
      if (!live.listeners.has(k)) live.listeners.set(k, new Set())
      live.listeners.get(k).add(fn)
      return add.call(this, type, fn, opts)
    }
    target.removeEventListener = function (type, fn, opts) {
      live.listeners.get(`${tag}:${type}`)?.delete(fn)
      return rem.call(this, type, fn, opts)
    }
  }
  const si = W.setInterval
  const ci = W.clearInterval
  W.setInterval = (...a) => {
    const id = si(...a)
    live.intervals.add(id)
    return id
  }
  W.clearInterval = (id) => (live.intervals.delete(id), ci(id))
  const gc = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...a) {
    const ctx = gc.call(this, type, ...a)
    if (ctx && /webgl/.test(type) && !live.gl.some((r) => r.deref() === ctx)) live.gl.push(new WeakRef(ctx))
    return ctx
  }
  new MutationObserver((list) => (S.mutations += list.length)).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
}

/** Counts of the things that should not grow over a long session. */
function vitals() {
  const live = S.live
  let listeners = 0
  const byType = {}
  for (const [k, set] of live.listeners) {
    listeners += set.size
    if (set.size) byType[k] = set.size
  }
  const gl = live.gl.map((r) => r.deref()).filter((c) => c && !c.isContextLost())
  return { heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, dom: document.getElementsByTagName('*').length, listeners, byType, intervals: live.intervals.size, glLive: gl.length, canvases: document.querySelectorAll('canvas').length, audioNodes: S.audio }
}

// ------------------------------------------------------------------ game states

const cfg = (patch) => ({ ...G().defaultConfig(), companyName: 'Sweep Works', seed: 7, ...patch })
const tryAll = (g, log, name, fn) => {
  try {
    const out = fn()
    if (typeof out === 'string') log.push(`${name}: ${out}`)
    return out
  } catch (e) {
    log.push(`${name} threw: ${e.message}`)
    note('seed-threw', `${name}: ${e.message}`)
  }
}
const mine = (g) => g.products.filter((p) => p.companyId === 'player')
function launch(g, log, type, family, patch = {}) {
  const design = G().starterDesign(g, type)
  const price = Math.round((mineLike(g, type) || 400) * 1)
  return tryAll(g, log, `launch ${type}`, () => G().startProduct(g, { design, family, variant: '', price, tiers: [], quantity: 20000, mode: 'contract', marketing: 200e3, ...patch }))
}
/** A sensible price: the median of rivals' devices of the kind. */
function mineLike(g, type) {
  const ps = g.products.filter((p) => p.type === type && p.status === 'sale').map((p) => p.price).sort((a, b) => a - b)
  return ps[Math.floor(ps.length / 2)]
}
const campaign = (g, log, monthly) => mine(g)[0] && tryAll(g, log, 'campaign', () => G().startCampaign(g, 'online', mine(g)[0].id, monthly))
function hireSome(g, log, n) {
  for (let i = 0; i < n; i++) {
    if (!g.candidates.length) tryAll(g, log, 'headhunt', () => G().headhunt(g))
    if (!g.candidates.length) break
    const err = tryAll(g, log, 'hire', () => G().hire(g, g.candidates[0].id))
    if (err) break
  }
}

const SEEDS = {
  /** Guided game, first day: a garage and the coach on its first step. */
  fresh: () => st().begin(cfg({ startType: 'phone', progression: 'guided' })),
  /** Guided game a little after the first device went on sale. */
  launched() {
    st().begin(cfg({ startType: 'phone', progression: 'guided' }))
    const log = []
    st().act((g) => {
      hireSome(g, log, 2)
      launch(g, log, 'phone', 'Sweep One', { quantity: 8000, marketing: 50e3 })
    })
    for (let i = 0; i < 12 && !mine(st().game).some((p) => p.status === 'sale'); i++) st().advance(15)
    st().advance(20)
    return log
  },
  /** Open game about a year and a half in: a few devices, a dozen people, research under way. */
  mid() {
    st().begin(cfg({ startType: 'phone', progression: 'open', startCash: 60e6 }))
    const log = []
    st().act((g) => {
      g.guide = -1
      hireSome(g, log, 8)
      launch(g, log, 'phone', 'Sweep One')
    })
    for (let i = 0; i < 36; i++) {
      st().advance(15)
      const s = st()
      if (s.yearEnd) s.closeYear()
      if (s.showing) s.watch(null)
      if (i === 12) s.act((g) => (launch(g, log, 'phone', 'Sweep Two'), hireSome(g, log, 4), campaign(g, log, 100e3)))
      s.act((g) => g.incidents.filter((x) => !x.done).forEach((x) => tryAll(g, log, 'decide', () => G().decide(g, x.id, 0))))
    }
    return log
  },
  /** Open game, everything built: every device line, 40 staff, executives, factory, venue, stores abroad, listed shares. */
  late() {
    st().begin(cfg({ startType: 'all', progression: 'open', startCash: 1e9, techLevel: 4 }))
    const log = []
    const types = Object.keys(G().starterDesign ? { phone: 1, tablet: 1, watch: 1, laptop: 1, desktop: 1, console: 1, earbuds: 1, tv: 1, foldable: 1, headset: 1, speaker: 1, handheld: 1 } : {})
    st().act((g) => {
      g.guide = -1
      for (let i = 0; i < 3; i++) tryAll(g, log, 'upgradeOffice', () => G().upgradeOffice(g))
      hireSome(g, log, 40)
      tryAll(g, log, 'autoTeams', () => G().autoTeams(g))
      for (let i = 0; i < 4 && g.execPool.length; i++) if (tryAll(g, log, 'hireExec', () => G().hireExec(g, g.execPool[0].id))) break
      tryAll(g, log, 'buildFactory', () => G().buildFactory(g))
      tryAll(g, log, 'autoLine', () => G().autoLine(g))
      tryAll(g, log, 'buildVenue', () => G().buildVenue(g))
      tryAll(g, log, 'autoVenue', () => G().autoVenue(g))
      types.forEach((t, i) => launch(g, log, t, `Sweep ${t[0].toUpperCase()}${t.slice(1)}`, { quantity: 30000 }))
      tryAll(g, log, 'store', () => G().openStore(g, 1))
    })
    for (let i = 0; i < 40; i++) {
      st().advance(15)
      const s = st()
      if (s.yearEnd) s.closeYear()
      if (s.showing) s.watch(null)
      s.act((g) => {
        if (i === 8) {
          campaign(g, log, 300e3)
          for (const r of Object.keys(g.regions)) if (!g.regions[r].open) tryAll(g, log, `enter ${r}`, () => G().enterRegion(g, r))
          for (const r of Object.keys(g.regions).slice(0, 3)) tryAll(g, log, `store ${r}`, () => G().openStore(g, 2, r))
          tryAll(g, log, 'funding', () => G().fundingRound(g, 0.1))
          hireSome(g, log, 40 - g.staff.length)
        }
        if (i === 27) tryAll(g, log, 'list', () => G().listCompany(g, 0.25))
        if (i === 16) {
          const rival = g.companies[3]
          tryAll(g, log, 'stake', () => G().buyRivalStake(g, rival.id, 0.05))
          const p = mine(g).find((x) => x.status === 'sale')
          if (p) tryAll(g, log, 'factory order', () => G().orderProduction(g, p.id, 20000, 'factory'))
          tryAll(g, log, 'chip', () => G().startChip(g, 'Sweep S1', 0.5, 0.4, 0.5))
          tryAll(g, log, 'os', () => G().startOs(g, 'SweepOS', []))
        }
        // settle decisions so the clock keeps going, except at the very end
        // a device still in development at the end, with a keynote booked
        if (i === 38) launch(g, log, 'phone', 'Sweep Next', { keynote: 0 })
        if (i < 38) g.incidents.filter((x) => !x.done).forEach((x) => tryAll(g, log, 'decide', () => G().decide(g, x.id, 0)))
      })
    }
    return log
  },
  /** The late game with a decision waiting and the year-end summary up. */
  latePending() {
    const log = SEEDS.late()
    for (let i = 0; i < 80 && !st().game.incidents.some((x) => !x.done); i++) {
      st().advance(10)
      if (st().showing) st().watch(null)
    }
    for (let i = 0; i < 40 && !st().yearEnd; i++) {
      st().advance(10)
      if (st().showing) st().watch(null)
    }
    return log
  },
  /** A company that ran out of credit, with the before-debt copy to go back to. */
  bankrupt() {
    st().begin(cfg({ startType: 'phone', progression: 'open', startCash: 2e6, difficulty: 'tough' }))
    const log = []
    st().act((g) => {
      hireSome(g, log, 6)
      launch(g, log, 'phone', 'Doomed', { quantity: 1000, marketing: 100e3, price: 4999 })
    })
    for (let i = 0; i < 200 && !st().game.gameOver; i++) {
      st().advance(10)
      const s = st()
      if (s.yearEnd) s.closeYear()
      if (s.showing) s.watch(null)
      s.act((g) => (hireSome(g, log, 2), g.incidents.filter((x) => !x.done).forEach((x) => G().decide(g, x.id, 0))))
    }
    if (!st().game.gameOver) log.push('never went bankrupt')
    return log
  },
  /** Open game with unlimited money. */
  sandbox() {
    st().begin(cfg({ startType: 'all', progression: 'open', unlimitedMoney: true }))
    const log = []
    st().act((g) => ((g.guide = -1), hireSome(g, log, 5), launch(g, log, 'laptop', 'Sweep Book')))
    st().advance(60)
    return log
  },
}
const START_TYPES = ['phone', 'tablet', 'watch', 'laptop', 'desktop', 'console', 'earbuds', 'tv', 'foldable', 'headset', 'speaker', 'handheld']
for (const t of START_TYPES) SEEDS[`type:${t}`] = () => st().begin(cfg({ startType: t, progression: 'guided' }))

/**
 * One of the app's own modules, the very instance the app is running. After a
 * hot update Vite serves a module under a new address (?t=...), and importing
 * the plain path would hand back a second, separate copy with its own state.
 */
async function mod(path) {
  const hits = performance.getEntriesByType('resource').map((r) => r.name).filter((n) => n.includes(path))
  return import(/* @vite-ignore */ hits.filter((n) => n.includes('?t=')).pop() ?? hits[0] ?? path)
}

const snapshots = {}
/** Put the named state on screen. Built once, then restored from a copy. */
async function seed(name, { tab, rebuild } = {}) {
  S.ctx = `seed ${name}`
  // leave the game so every screen's own state (sub-tabs, folds, tools) starts over
  if (st().screen === 'game') (st().quit(), await settle(10))
  if (!snapshots[name] || rebuild) {
    const log = SEEDS[name]() || []
    const s = st()
    snapshots[name] = { json: JSON.stringify(s.game), yearEnd: s.yearEnd, checkpoint: s.checkpoint, log }
    s.quit()
    await settle(10)
  }
  const snap = snapshots[name]
  const fb = (S.feedback ??= (await mod('/src/store/trouble.ts')).useFeedback)
  fb.setState({ form: null, ask: null, flagged: false })
  // all in one go, so the screen wanted is the only one drawn
  st().resume(G().migrate(JSON.parse(snap.json)))
  W.sb.setState({ yearEnd: snap.yearEnd, checkpoint: snap.checkpoint, railOpen: true, feedOpen: true })
  if (typeof tab === 'function') tab()
  else if (tab) st().setTab(tab)
  // the game's frame is on screen once the lazily loaded parts are in
  for (let i = 0; i < 200 && !document.querySelector('[data-chrome=top]'); i++) await sleep(15)
  await settle(20)
  return snap.log
}

// ------------------------------------------------------------------ what is on the page

const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [role=button], [role=tab], [tabindex]:not([tabindex="-1"]):not(svg):not([role=dialog]):not(aside)'
const isShown = (el) => {
  // (no boxes at all: it, or something above it, is not displayed)
  if (!el.isConnected || el.getClientRects().length === 0) return false
  const cs = getComputedStyle(el)
  if (cs.display === 'none' || cs.visibility !== 'visible') return false
  for (let p = el; p; p = p.parentElement) if (p.getAttribute?.('aria-hidden') === 'true' || p.hasAttribute?.('inert')) return false
  return true
}
const textOf = (el) => (el.innerText ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
function nameOf(el) {
  const own = el.getAttribute('aria-label') || textOf(el) || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('alt')
  if (own) return own.slice(0, 60)
  if (el.id) {
    const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`)
    if (l) return textOf(l).slice(0, 60)
  }
  const wrap = el.closest('label')
  if (wrap) return textOf(wrap).slice(0, 60)
  return ''
}
/** Where an element sits, in words: the nearest heading above it. */
function regionOf(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p.getAttribute('role') === 'dialog') return (p.getAttribute('aria-label') || 'dialog').slice(0, 30)
    if (!p.matches('section, aside')) continue
    const h = p.querySelector(':scope > header')
    if (h) return textOf(h).replace(/\d[\d.,]*[KMB%]?/g, '#').slice(0, 30)
  }
  return el.closest('nav') ? 'nav' : el.closest('#root > div > div > header') ? 'top bar' : ''
}
/** The frame around every screen: top bar, navigation, news feed. Crawled once, as its own stop. */
const inChrome = (el) => !!el.closest('[data-chrome]')
function describe(el) {
  const tag = el.tagName.toLowerCase() + (el.type && el.tagName === 'INPUT' ? `[${el.type}]` : '')
  return `${tag} "${nameOf(el)}"${regionOf(el) ? ` in ${regionOf(el)}` : ''}`
}
function controls() {
  const out = []
  // with a dialog or a drawer up, only what is in the top one can be reached
  const top = Array.from(document.querySelectorAll('[role=dialog], [role=alertdialog]')).filter(isShown).pop()
  for (const el of document.querySelectorAll(INTERACTIVE)) {
    if (!isShown(el) || el.closest('[data-ruler]') || el.hasAttribute('data-ruler')) continue
    if (S.scope === 'screen' && inChrome(el)) continue
    if (S.scope === 'chrome' && !inChrome(el)) continue
    if (top && !top.contains(el)) continue
    out.push(el)
  }
  return out
}
function signature(el, counts) {
  const base = describe(el)
  const n = (counts[base] = (counts[base] ?? 0) + 1)
  return `${base} #${n}`
}
function listControls() {
  const counts = {}
  return controls().map((el) => ({ el, sig: signature(el, counts) }))
}

// ------------------------------------------------------------------ audit of the screen as drawn

const RAW = /\bNaN\b|\bundefined\b|\bnull\b|Infinity|\[object |(?<![\w.])-0(?![\w.,])|\de[+-]?\d{2}\b|\$-|--\d/
const EMOJI = /\p{Extended_Pictographic}/u
const lum = (r, g, b) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const rgba = (c) => {
  const m = /rgba?\(([^)]+)\)/.exec(c)
  if (!m) return null
  const p = m[1].split(/[, /]+/).map(Number)
  return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined || Number.isNaN(p[3]) ? 1 : p[3] }
}
function backdrop(el) {
  // paint the backgrounds from the page down to the element
  const chain = []
  for (let p = el; p; p = p.parentElement) chain.unshift(p)
  let cur = { r: 10, g: 9, b: 8 }
  for (const p of chain) {
    const c = rgba(getComputedStyle(p).backgroundColor)
    if (c && c.a > 0) cur = { r: c.r * c.a + cur.r * (1 - c.a), g: c.g * c.a + cur.g * (1 - c.a), b: c.b * c.a + cur.b * (1 - c.a) }
  }
  return cur
}
function contrast(el) {
  const cs = getComputedStyle(el)
  const fg = rgba(cs.color)
  if (!fg) return 21
  const bg = backdrop(el)
  let op = 1
  for (let p = el; p; p = p.parentElement) op *= Number(getComputedStyle(p).opacity)
  const a = fg.a * op
  const mix = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) }
  const l1 = lum(mix.r, mix.g, mix.b)
  const l2 = lum(bg.r, bg.g, bg.b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}
function clipParent(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p)
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return p
  }
  return null
}
const scrolls = (p, axis) => {
  const o = getComputedStyle(p)[axis === 'x' ? 'overflowX' : 'overflowY']
  return o === 'auto' || o === 'scroll'
}
function hasTip(el) {
  for (let p = el, i = 0; p && i < 4; p = p.parentElement, i++) if (p.getAttribute('title') || p.getAttribute('aria-label')) return true
  return false
}

/** Look over the page as it stands and note anything that is off. `only` narrows the checks. */
function audit(label, { colours = true } = {}) {
  const was = S.ctx
  if (label) S.ctx = label
  S.counters.audits++
  const vw = innerWidth
  const vh = innerHeight
  if (document.documentElement.scrollWidth > vw + 1 || document.documentElement.scrollHeight > vh + 1) note('page-overflow', `document is ${document.documentElement.scrollWidth}x${document.documentElement.scrollHeight} in a ${vw}x${vh} window`)
  if (/Something broke/.test(document.body.innerText)) note('crash-screen', document.querySelector('pre')?.innerText.slice(0, 300) ?? 'crash screen is up')
  // ids
  const ids = {}
  for (const el of document.querySelectorAll('[id]')) if (el.id && !el.closest('svg')) ids[el.id] = (ids[el.id] ?? 0) + 1
  for (const [id, n] of Object.entries(ids)) if (n > 1) note('duplicate-id', `#${id} x${n}`)
  // controls
  const list = controls()
  for (const el of list) {
    const r = el.getBoundingClientRect()
    const d = describe(el)
    if (el.tagName === 'INPUT' && el.type === 'file') continue
    if (r.width < 1 || r.height < 1) {
      note('zero-size', d)
      continue
    }
    if (!nameOf(el) && !(el.tagName === 'INPUT' && ['range', 'checkbox', 'color', 'radio'].includes(el.type) && el.closest('label'))) note('no-name', `${d} at ${Math.round(r.x)},${Math.round(r.y)} ${el.className?.toString().slice(0, 60)}`)
    if (el.tagName === 'BUTTON' && !textOf(el) && !el.getAttribute('aria-label')) note('icon-button-no-aria-label', `${d} title="${el.getAttribute('title') ?? ''}"`)
    if (el.tagName === 'BUTTON' && !textOf(el) && !el.getAttribute('title')) note('icon-button-no-title', d)
    // off screen, and nothing to scroll to reach it
    const clip = clipParent(el)
    const cr = clip ? clip.getBoundingClientRect() : { left: 0, top: 0, right: vw, bottom: vh }
    const box = { left: Math.max(0, cr.left), top: Math.max(0, cr.top), right: Math.min(vw, cr.right), bottom: Math.min(vh, cr.bottom) }
    const outX = r.right > box.right + 1.5 || r.left < box.left - 1.5
    const outY = r.bottom > box.bottom + 1.5 || r.top < box.top - 1.5
    let reach = false
    for (let p = el.parentElement; p; p = p.parentElement) if ((outX && scrolls(p, 'x') && p.scrollWidth > p.clientWidth) || (outY && scrolls(p, 'y') && p.scrollHeight > p.clientHeight)) reach = true
    if ((outX || outY) && !reach) note('control-clipped', `${d}: ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} outside ${Math.round(box.left)},${Math.round(box.top)}-${Math.round(box.right)},${Math.round(box.bottom)}`)
    // something else on top of it
    if (!outX && !outY && !el.disabled && getComputedStyle(el).pointerEvents !== 'none') {
      const x = Math.min(vw - 1, Math.max(0, r.left + r.width / 2))
      const y = Math.min(vh - 1, Math.max(0, r.top + r.height / 2))
      const top = document.elementFromPoint(x, y)
      if (top && top !== el && !el.contains(top) && !top.contains(el)) {
        const other = top.closest(INTERACTIVE)
        const label = el.closest('label')
        // a dialog or a drawer is meant to lie over what is behind it
        const over = other?.closest('[role=dialog], [role=alertdialog]')
        if (other && other !== el && !(label && label.contains(top)) && !el.contains(other) && !(over && !over.contains(el))) note('control-covered', `${d} is under ${describe(other)}`)
      }
    }
    if (r.width < 16 && r.height < 16 && !['INPUT'].includes(el.tagName)) note('tiny-target', `${d} is ${Math.round(r.width)}x${Math.round(r.height)}`)
  }
  // everything drawn
  const all = document.body.querySelectorAll('*')
  for (const el of all) {
    if (el.closest('svg') && el.tagName !== 'svg') continue
    if (el.closest('.recharts-wrapper') || el.closest('[aria-hidden=true]')) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility !== 'visible') continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    // house style
    if (parseFloat(cs.borderTopLeftRadius) > 0.5 && el.tagName !== 'INPUT') note('house-rounded', `${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 50)} radius ${cs.borderTopLeftRadius}`)
    if (/gradient/.test(cs.backgroundImage)) note('house-gradient', `${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 50)}`)
    if (cs.boxShadow !== 'none' && / \d+px \d+px [1-9]\d*px/.test(cs.boxShadow)) note('house-shadow', `${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 50)} ${cs.boxShadow.slice(0, 50)}`)
    // scroll boxes
    const sy = scrolls(el, 'y')
    const sx = scrolls(el, 'x')
    if (sy && el.scrollHeight - el.clientHeight > 0 && el.scrollHeight - el.clientHeight <= 3) note('one-pixel-scroll', `${regionOf(el) || el.className?.toString().slice(0, 40)} scrolls ${el.scrollHeight - el.clientHeight}px down`)
    if (sx && el.scrollWidth - el.clientWidth > 0 && el.tagName !== 'PRE' && !/TECHNOLOGY TREE/i.test(regionOf(el))) note('sideways-scroll', `${regionOf(el) || el.className?.toString().slice(0, 40)} scrolls ${el.scrollWidth - el.clientWidth}px sideways: "${textOf(el).slice(0, 40)}"`)
    // text
    const ownText = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    if (!ownText) continue
    if (RAW.test(ownText) && !el.closest('pre, textarea')) note('raw-value', `"${ownText.slice(0, 60)}" in ${regionOf(el)}`)
    if (EMOJI.test(ownText) && !el.closest('textarea, pre') && !ownText.includes(String.fromCodePoint(0x1f600))) note('emoji', `"${ownText.slice(0, 40)}"`)
    if (/\d{7,}/.test(ownText.replace(/[\d,]*\.\d+/g, '')) && !/9{9}/.test(ownText) && !el.closest('pre, textarea') && !/seed/i.test(textOf(el.parentElement ?? el))) note('unformatted-number', `"${ownText.slice(0, 50)}" in ${regionOf(el)}`)
    // cut off: by its own box, or by a parent that hides what runs over
    const cut = el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible' && !sx
    if (cut && !hasTip(el) && el.tagName !== 'SELECT' && el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') note('text-cut-no-tooltip', `"${ownText.slice(0, 50)}" in ${regionOf(el)} (${el.clientWidth}px of ${el.scrollWidth}px)`)
    if (el.scrollHeight > el.clientHeight + 3 && cs.overflowY === 'hidden' && cs.display !== 'inline' && !hasTip(el)) note('text-cut-vertical', `"${ownText.slice(0, 50)}" in ${regionOf(el)}`)
    const clip = clipParent(el)
    if (clip && !cut) {
      const cr = clip.getBoundingClientRect()
      const hidesX = getComputedStyle(clip).overflowX === 'hidden' || getComputedStyle(clip).overflowX === 'clip'
      if (hidesX && (r.right > cr.right + 2 || r.left < cr.left - 2) && cr.width > 4 && !hasTip(el) && cs.position !== 'fixed') note('runs-out-of-box', `"${ownText.slice(0, 50)}" in ${regionOf(el)} by ${Math.round(Math.max(r.right - cr.right, cr.left - r.left))}px`)
    }
    if (r.right > vw + 2 || r.bottom > vh + 2 || r.left < -2 || r.top < -2) {
      let reach = false
      for (let p = el.parentElement; p; p = p.parentElement) if ((scrolls(p, 'x') && p.scrollWidth > p.clientWidth) || (scrolls(p, 'y') && p.scrollHeight > p.clientHeight)) reach = true
      if (!reach) note('off-window', `"${ownText.slice(0, 50)}" at ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    if (colours && parseFloat(cs.fontSize) > 0 && !el.closest(':disabled, [aria-disabled=true]')) {
      const c = contrast(el)
      if (c < 2.6) note('low-contrast', `"${ownText.slice(0, 40)}" ${c.toFixed(2)}:1 ${cs.color} theme ${document.documentElement.dataset.theme} .${el.className?.toString().slice(0, 40)}`)
    }
  }
  for (const img of document.images) if (img.complete && !img.naturalWidth && isShown(img)) note('broken-image', img.src.slice(0, 80))
  for (const svg of document.querySelectorAll('svg')) {
    if (!isShown(svg) || svg.closest('.recharts-wrapper')) continue
    const r = svg.getBoundingClientRect()
    if (r.width && r.height && !svg.childElementCount) note('empty-icon', describe(svg.closest('button') ?? svg.parentElement))
  }
  S.ctx = was
}

/** Rows whose boxes should line up: siblings in a flex row or grid with different heights. */
function auditRows(label) {
  const was = S.ctx
  if (label) S.ctx = label
  for (const el of document.querySelectorAll('button')) {
    if (!isShown(el)) continue
    const p = el.parentElement
    const cs = getComputedStyle(p)
    if (cs.display !== 'flex' || cs.flexDirection !== 'row' || cs.alignItems === 'stretch') continue
    const sibs = Array.from(p.children).filter((c) => c.tagName === 'BUTTON' && isShown(c))
    if (sibs.length < 2 || sibs[0] !== el) continue
    const hs = [...new Set(sibs.map((c) => Math.round(c.getBoundingClientRect().height)))]
    if (hs.length > 1 && Math.max(...hs) - Math.min(...hs) <= 6) note('uneven-row', `buttons ${sibs.map((c) => `"${nameOf(c).slice(0, 14)}"`).join(' ')} are ${hs.join('/')}px tall in ${regionOf(el)}`)
  }
  S.ctx = was
}

// ------------------------------------------------------------------ poking at things

function fire(el, type, init = {}) {
  const r = el.getBoundingClientRect()
  const base = { bubbles: true, cancelable: true, composed: true, view: W, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: type.endsWith('down') ? 1 : 0, pointerId: 1, pointerType: 'mouse', isPrimary: true, ...init }
  const Ev = type.startsWith('pointer') ? PointerEvent : MouseEvent
  return el.dispatchEvent(new Ev(type, base))
}
function click(el, init) {
  S.counters.clicks++
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  fire(el, 'pointerover', init)
  fire(el, 'pointermove', init)
  fire(el, 'pointerdown', init)
  fire(el, 'mousedown', init)
  if (el.focus && el.matches('button, input, select, textarea, a, [tabindex]')) el.focus({ preventScroll: true })
  fire(el, 'pointerup', init)
  fire(el, 'mouseup', init)
  fire(el, 'click', init)
}
function setValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
  S.counters.typed++
}
function key(code, opts = {}) {
  S.counters.keys++
  const keyOf = code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code === 'Space' ? ' ' : code
  const target = opts.target ?? (document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body)
  const init = { key: keyOf, code, bubbles: true, cancelable: true, composed: true, ...opts }
  const down = new KeyboardEvent('keydown', init)
  target.dispatchEvent(down)
  target.dispatchEvent(new KeyboardEvent('keyup', init))
  return down.defaultPrevented
}

/** Controls the crawler must not press: they leave the page, send something, or open a native dialog. */
const NEVER = /^(send|sign in|create account|use this project|choose a folder|change folder|reconnect|stop using it|sign out|change project|reload|report it|post on github|itch\.io|github issues)/i
const forbidden = (el) => NEVER.test(nameOf(el)) || el.tagName === 'A' || (el.tagName === 'INPUT' && (el.type === 'file' || el.type === 'password'))

/** A fingerprint of everything a click could have changed. */
function stamp() {
  const s = st()
  const ui = {}
  for (const [k, v] of Object.entries(s)) if (typeof v !== 'function' && k !== 'game' && k !== 'draft' && k !== 'past' && k !== 'future' && k !== 'checkpoint') ui[k] = v
  let ls = ''
  try {
    ls = JSON.stringify(Object.entries(localStorage))
  } catch {}
  return JSON.stringify(ui) + '|' + (s.draft ? JSON.stringify(s.draft).length + ':' + s.past.length : '') + '|' + ls.length + '|' + S.mutations + '|' + S.audio + '|' + S.blocked.length
}
const gameStamp = () => {
  const g = st().game
  return g ? `${g.day}|${g.cash}|${g.nextId}|${g.news[0]?.id}|${g.staff.length}|${g.products.length}|${JSON.stringify(g.office).length}|${JSON.stringify([g.policy, g.care, g.campaigns, g.orders, g.stock, g.regions, g.activeResearch, g.guide, g.incidents.map((i) => i.done), g.teams, g.stores.length, g.events.length]).length}` : 'none'
}
const TEXT_PROBES = ['', 'x'.repeat(400), '-5', '1.5', 'abc', '\u{1F600}\u{1F680}', 'مرحبا שלום', '<b onclick=alert(1)>bold</b><script>1</script>', '   ', '9'.repeat(25)]
const NUM_PROBES = ['', '-5', '1.5', '0', '999999999999', '1e30', 'abc']

/** Type every awkward thing into a field, watching for errors and raw values, then put it back. */
async function probeField(el, label) {
  const start = el.value
  if (el.tagName === 'SELECT') {
    for (const o of Array.from(el.options)) {
      if (o.disabled) continue
      setValue(el, o.value)
      await settle(15)
      audit(`${label} > select ${describe(el)} = ${o.label.slice(0, 20)}`)
      if (!el.isConnected) return
    }
    setValue(el, start)
  } else if (el.type === 'range') {
    for (const v of [el.min, el.max, start]) {
      setValue(el, v)
      await settle(15)
      audit(`${label} > slider ${describe(el)} = ${v}`)
      if (!el.isConnected) return
    }
  } else if (el.type === 'checkbox' || el.type === 'radio') {
    click(el)
    await settle(15)
    audit(`${label} > tick ${describe(el)}`)
    if (el.isConnected && el.type === 'checkbox') click(el)
  } else if (el.type === 'color') {
    setValue(el, '#00ff88')
    await settle(15)
    setValue(el, start)
  } else {
    for (const v of el.type === 'number' ? NUM_PROBES : TEXT_PROBES) {
      if (!el.isConnected) return
      el.focus()
      // what a person could actually get into the field: typing and pasting both stop at its length limit
      setValue(el, el.maxLength > 0 ? v.slice(0, el.maxLength) : v)
      await settle(15)
      audit(`${label} > type ${JSON.stringify(v.slice(0, 12))} into ${describe(el)}`)
      // game keys must not fire while typing
      const before = stamp().split('|').slice(0, 1).join('')
      for (const code of ['Space', 'Digit3', 'KeyN', 'KeyF', 'KeyG', 'KeyC', 'F2', 'Delete', 'KeyB', 'KeyV', 'KeyR']) if (el.isConnected) key(code, { target: el })
      await settle(10)
      if (stamp().split('|').slice(0, 1).join('') !== before) note('hotkey-while-typing', `${describe(el)} at ${label}`)
      const ml = el.maxLength > 0 ? el.maxLength : Infinity
      if (el.isConnected && el.type !== 'number' && v.length > 300 && el.value.length > 300 && ml === Infinity) note('no-length-limit', describe(el))
    }
    if (el.isConnected) {
      setValue(el, start)
      key('Enter', { target: el })
      await settle(10)
      if (el.isConnected) el.blur()
    }
  }
  await settle(10)
}

/**
 * Visit one stop: `setup` puts the screen up; then every control on it is pressed in turn,
 * putting the stop back whenever the press changed the game or took the control away.
 * Controls that reveal more controls become stops of their own, `depth` levels down.
 */
async function crawl(name, setup, { depth = 2, path = [], skip, budget = { left: 4000 }, fields = true, scope = 'screen', known = new Set() } = {}) {
  S.scope = scope
  const label = [name, ...path.map((p) => p.replace(/ in .*/, ''))].join(' > ')
  S.ctx = label
  S.counters.stops++
  const open = async () => {
    await setup()
    for (const sig of path) {
      const hit = listControls().find((c) => c.sig === sig)
      if (!hit) return false
      click(hit.el)
      await settle()
    }
    return true
  }
  if (!(await open())) return note('stop-unreachable', label)
  audit(label)
  auditRows(label)
  // controls met anywhere in this stop are not new when met again further in
  const first = listControls().filter((c) => path.length === 0 || !known.has(c.sig) || true)
  const mine = first.filter((c) => !known.has(c.sig))
  for (const c of first) known.add(c.sig)
  const base = gameStamp()
  const baseUi = uiStamp()
  let dirty = false
  // rows of one table all do the same thing: two of them are enough
  const rowsSeen = {}
  for (const { sig } of mine) {
    if (/^tr /.test(sig)) {
      const table = sig.replace(/"[^"]*"/, '').replace(/ #\d+$/, '')
      if ((rowsSeen[table] = (rowsSeen[table] ?? 0) + 1) > 2) continue
    } else {
      // and so do buttons that repeat down a list ("Take Ana off this team", "Take Ravi off this team", "Hire", "Hire"): four of a kind
      const m = /^([\w[\]]+) "([^"]*)"(.*?)( #\d+)?$/.exec(sig)
      if (m && /^input/.test(m[1])) {
        // a column of fields of one kind in one panel (twenty-four company names): four
        const kind = `${m[1]} ${m[2].split(/\s+/).slice(0, 2).join(' ')}${m[3]}`
        if ((rowsSeen[kind] = (rowsSeen[kind] ?? 0) + 1) > 4) continue
      } else if (m && (m[1] === 'button' || m[1] === 'select')) {
        const kind = `${m[1]} ${m[2].split(/\s+/).slice(0, 1).join(' ')} ${m[2].split(/\s+/).length > 3 ? m[2].split(/\s+/).slice(-2).join(' ') : ''}${m[3]}`
        if ((rowsSeen[kind] = (rowsSeen[kind] ?? 0) + 1) > 4) continue
      }
    }
    if (budget.left-- <= 0) return note('budget-spent', label)
    if (skip?.(sig)) continue
    if (dirty) {
      if (!(await open())) return note('stop-unreachable', `${label} (on the way back)`)
      dirty = false
    }
    S.ctx = label
    const hit = listControls().find((c) => c.sig === sig)
    if (!hit) {
      // it went away because of an earlier press that did not count as a change: put the stop back and look again
      if (!(await open())) return
      const again = listControls().find((c) => c.sig === sig)
      if (!again) {
        note('control-unstable', `${sig} at ${label}`)
        continue
      }
    }
    const el = (hit ?? listControls().find((c) => c.sig === sig)).el
    if (forbidden(el)) continue
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') {
      if (el.getAttribute('aria-disabled') === 'true') click(el)
      else if (!hasTip(el)) note('disabled-no-reason', `${sig} at ${label}`)
      continue
    }
    S.ctx = `${label} > ${sig}`
    if (el.matches('input, select, textarea')) {
      if (fields) await probeField(el, label)
    } else {
      const before = stamp()
      const nameBefore = nameOf(el) + el.getAttribute('title')
      click(el)
      await settle()
      // a button that asks to be pressed again (something that cannot be undone) is pressed again
      if (el.isConnected && nameOf(el) + el.getAttribute('title') !== nameBefore && /!bg-neg/.test(el.className)) {
        S.counters.confirms = (S.counters.confirms ?? 0) + 1
        click(el)
        await settle()
      }
      if (stamp() === before && gameStamp() === base) note('dead-control', `${sig} at ${label}`)
      audit()
    }
    const now = listControls()
    const fresh = now.filter((c) => !known.has(c.sig))
    const changed = gameStamp() !== base || uiStamp() !== baseUi || fresh.length > 0 || now.length !== first.length
    // going somewhere else (another screen, the designer, a drawer with a stop of its own) is not gone into from here
    if (fresh.length >= 2 && depth > 0 && !el.matches('input, select, textarea') && uiStamp() === baseUi) {
      // a drawer, a card, a sub-tab or a fold: go in
      await crawl(name, setup, { depth: depth - 1, path: [...path, sig], skip, budget, fields, scope, known })
      dirty = true
    } else if (changed) dirty = true
    // Esc should put away whatever that opened, and only that
    if (fresh.length && !dirty) (key('Escape'), await settle(10))
  }
  S.ctx = label
}
const uiStamp = () => {
  const s = st()
  return s.screen === 'game' ? `${s.tab}|${s.designing}|${s.inspect}|${s.person}|${s.lockCard?.cap}|${s.showing}|${s.yearEnd}|${s.editorMode}` : s.screen
}

// ------------------------------------------------------------------ the tour

const TABS = ['city', 'dashboard', 'products', 'research', 'market', 'world', 'goals', 'factory', 'stores', 'venue', 'marketing', 'care', 'labs', 'staff', 'office', 'finance', 'shares', 'rivals', 'system']
const THEMES = ['ember', 'volt', 'ice', 'rose']

/** Every stop of a state: each screen, the designer in both modes, a product and a person card. */
function stopsOf(state) {
  const stops = []
  const at = (name, after) => stops.push({ name: `${state}/${name}`, setup: async () => (await seed(state, { tab: after }), await settle(['city', 'office', 'factory', 'stores', 'venue'].includes(name) || name.startsWith('designer') ? 150 : 15)) })
  if (state === 'bankrupt') return at('gameover'), stops
  stops.push({ name: `${state}/chrome`, scope: 'chrome', depth: 0, setup: async () => (await seed(state), await settle(60)) })
  for (const tab of TABS) at(tab, () => st().setTab(tab))
  at('designer-simple', () => (st().setEditorMode('simple'), st().openDesigner()))
  at('designer-advanced', () => (st().setEditorMode('advanced'), st().openDesigner()))
  at('inspector', () => {
    const p = mine(st().game)[0] ?? st().game.products[0]
    st().setTab('products')
    st().focus(p.id)
  })
  at('rival-inspector', () => (st().setTab('market'), st().focus(st().game.products.find((p) => p.companyId !== 'player').id)))
  at('person', () => st().game.staff[0] && (st().setTab('staff'), st().openPerson(st().game.staff[0].id)))
  return stops
}

/** Press everything, everywhere, in one state. */
async function crawlState(state, opts = {}) {
  const budget = { left: opts.budget ?? 6000 }
  for (const stop of stopsOf(state)) {
    if (opts.only && !opts.only.test(stop.name)) continue
    try {
      await crawl(stop.name, stop.setup, { depth: stop.depth ?? opts.depth ?? 2, budget, skip: opts.skip, fields: opts.fields, scope: stop.scope })
      S.done.push(stop.name)
    } catch (e) {
      note('crawler-threw', `${stop.name}: ${e.message}`)
    }
  }
  return summary()
}

/** Open every sub-view reachable by one press from a stop and audit each: for the viewport and theme matrix. */
async function lookState(state, { themes = THEMES, only } = {}) {
  for (const stop of stopsOf(state)) {
    if (only && !only.test(stop.name)) continue
    S.scope = undefined
    await stop.setup()
    const vp = `${innerWidth}x${innerHeight}`
    const pass = (label) => {
      audit(`${label} @${vp}`, { colours: false })
      auditRows(`${label} @${vp}`)
      for (const t of themes) {
        document.documentElement.dataset.theme = t
        auditColours(`${label} [${t}]`)
      }
      document.documentElement.dataset.theme = themes[0]
    }
    pass(stop.name)
    S.counters.stops++
    // sub-tabs and folds: anything that looks like a tab strip or a fold header
    const subs = listControls().filter((c) => c.el.matches('button') && !inChrome(c.el) && !c.el.closest('[data-coach]') && (c.el.parentElement?.className?.toString().includes('border-b border-line') || c.el.hasAttribute('aria-expanded')) && !forbidden(c.el))
    const base = uiStamp()
    for (const { sig } of subs) {
      const hit = listControls().find((c) => c.sig === sig)
      if (!hit) continue
      click(hit.el)
      await settle(60)
      pass(`${stop.name} > ${sig.replace(/ in .*/, '')}`)
      S.counters.stops++
      if (uiStamp() !== base) await stop.setup()
    }
  }
  return summary()
}
function auditColours(label) {
  const was = S.ctx
  S.ctx = label
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('svg') || el.closest('[aria-hidden=true]')) continue
    const ownText = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
    if (!ownText) continue
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility !== 'visible') continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1 || el.closest(':disabled, [aria-disabled=true]')) continue
    const c = contrast(el)
    if (c < 2.6) note('low-contrast', `"${ownText.slice(0, 40)}" ${c.toFixed(2)}:1 [${document.documentElement.dataset.theme}] .${el.className?.toString().slice(0, 50)}`)
  }
  S.ctx = was
}

/** Every key in System > Keys, on every screen: nothing may throw, and typing targets are left alone. */
async function hotkeys(state = 'mid') {
  await seed(state)
  const codes = ['Space', 'Digit1', 'Digit2', 'Digit3', 'F5', 'KeyN', 'KeyF', 'KeyG', 'F1', 'F2', 'F3', 'F4', 'KeyC', 'F6', 'F7', 'F8', 'F9', 'F10', 'KeyW', 'KeyS', 'KeyA', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE', 'Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Home', 'KeyR', 'Escape', 'Delete', 'KeyV', 'KeyB', 'Enter', 'Tab']
  for (const tab of TABS) {
    st().setTab(tab)
    await settle(60)
    for (const code of codes) {
      S.ctx = `hotkeys ${state}/${tab} ${code}`
      key(code, { target: document.body })
      await settle(5)
      if (st().designing) st().closeDesigner()
      if (st().tab !== tab) (st().setTab(tab), await settle(30))
    }
    audit(`hotkeys ${state}/${tab}`)
  }
  st().setSpeed(0)
  return summary()
}

/** A long session: the clock at top speed while the crawler hops screens, opens the designer and the inspectors. */
async function soak({ state = 'late', rounds = 10, designer = 20, speed = 4, days = 10 } = {}) {
  await seed(state)
  const samples = [{ at: 'start', ...vitals() }]
  const t0 = performance.now()
  const frames = []
  let last = performance.now()
  let run = true
  const tickFrame = (now) => {
    frames.push(now - last)
    last = now
    if (run) requestAnimationFrame(tickFrame)
  }
  requestAnimationFrame(tickFrame)
  for (let r = 0; r < rounds; r++) {
    S.ctx = `soak round ${r}`
    st().setSpeed(speed)
    for (const tab of TABS) {
      st().setTab(tab)
      S.counters.tabSwitches++
      await settle(tab === 'city' || tab === 'office' || tab === 'factory' || tab === 'stores' || tab === 'venue' ? 160 : 50)
      // the game's own clock runs on a timer, which a background page barely gets: move time on by hand as well,
      // as much as the clock would in the second or so a player spends on a screen
      st().advance(days)
      S.counters.daysPlayed = (S.counters.daysPlayed ?? 0) + days
      await settle(20)
      const s = st()
      if (s.yearEnd) s.closeYear()
      if (s.showing) s.watch(null)
      if (s.game.incidents.some((i) => !i.done)) s.act((g) => g.incidents.filter((i) => !i.done).forEach((i) => G().decide(g, i.id, 0)))
      if (s.game.gameOver) break
      if (!s.speed) s.setSpeed(speed)
    }
    for (const p of mine(st().game).slice(0, 12)) {
      st().setTab('products')
      st().focus(p.id)
      await settle(40)
      st().focus(null)
    }
    for (let i = 0; i < designer; i++) {
      st().openDesigner({ type: START_TYPES[(r * designer + i) % START_TYPES.length] })
      S.counters.designerOpens++
      await settle(i % 5 === 0 ? 120 : 30)
      if (i % 2) st().setEditorMode(i % 4 === 1 ? 'advanced' : 'simple')
      st().closeDesigner()
      await settle(20)
    }
    const f = frames.splice(0).sort((a, b) => a - b)
    samples.push({ at: `round ${r + 1}`, day: st().game.day, frameP50: +f[Math.floor(f.length / 2)]?.toFixed(1), frameP95: +f[Math.floor(f.length * 0.95)]?.toFixed(1), ...vitals() })
    if (st().game.gameOver) break
  }
  run = false
  st().setSpeed(0)
  audit(`soak ${state} end`)
  return { seconds: Math.round((performance.now() - t0) / 1000), samples: samples.map(({ byType, ...s }) => s), listenersAtEnd: vitals().byType, counters: S.counters }
}

/** The screens before a game: the main menu with its settings and keys, and the new-company form. */
async function crawlMenu(opts = {}) {
  const menu = async (screen) => {
    if (st().screen === 'game') st().quit()
    st().setScreen(screen)
    S.feedback?.setState({ form: null, ask: null, flagged: false })
    await settle(60)
  }
  for (const [name, screen] of [['menu', 'menu'], ['new-game', 'new']]) {
    try {
      await crawl(name, () => menu(screen), { depth: opts.depth ?? 2, scope: 'all' })
      S.done.push(name)
    } catch (e) {
      note('crawler-threw', `${name}: ${e.message}`)
    }
  }
  if (st().screen === 'game') st().quit()
  return summary()
}

/** The same, without pressing: for each window size and theme. */
async function lookMenu({ themes = THEMES } = {}) {
  S.scope = undefined
  if (st().screen === 'game') st().quit()
  for (const screen of ['menu', 'new']) {
    st().setScreen(screen)
    await settle(80)
    const label = `${screen} @${innerWidth}x${innerHeight}`
    audit(label, { colours: false })
    auditRows(label)
    for (const t of themes) {
      document.documentElement.dataset.theme = t
      auditColours(`${screen} [${t}]`)
    }
    document.documentElement.dataset.theme = themes[0]
    S.counters.stops++
  }
  st().setScreen('menu')
  return summary()
}

/** Start a long job and come back at once; poll sweep.job for the result. */
function run(fn) {
  const job = (S.job = { done: false, started: Date.now() })
  Promise.resolve()
    .then(fn)
    .then(
      (result) => Object.assign(job, { done: true, result, seconds: Math.round((Date.now() - job.started) / 1000) }),
      (e) => Object.assign(job, { done: true, error: String(e?.stack ?? e).slice(0, 600) }),
    )
  return 'started'
}
function summary() {
  const kinds = {}
  for (const e of S.log) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1
  return { findings: S.log.length, kinds, counters: S.counters }
}
/** The findings, optionally only of some kinds, as lines of text. */
function report(filter, from = 0) {
  return S.log.slice(from).filter((e) => !filter || filter.test(e.kind)).map((e) => `[${e.kind}] ${e.what}  @ ${e.where}`)
}
function reset() {
  S.log.length = 0
  S.seen.clear()
  try {
    sessionStorage.removeItem('sweep-log')
  } catch {}
}
/** Findings from before the page was last reloaded. */
function earlier() {
  try {
    return JSON.parse(sessionStorage.getItem('sweep-log') ?? '[]').map((e) => `[${e.kind}] ${e.what}  @ ${e.where}`)
  } catch {
    return []
  }
}

S.done ??= []
Object.assign(S, { mod, crawlMenu, lookMenu, earlier, run, install, seed, SEEDS, snapshots, audit, auditRows, auditColours, crawl, crawlState, lookState, hotkeys, soak, vitals, summary, report, reset, click, key, setValue, listControls, describe, stopsOf, settle, TABS, THEMES, START_TYPES })
install()
export default S
