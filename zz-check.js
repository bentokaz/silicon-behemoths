window.coachCheck = async (which) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const S = () => window.sb.getState()
  const G = window.sbGame
  const TARGET = { 3: 'build', 4: 'hire-engineer', 5: 'hire', 6: 'hire-researcher', 7: 'new-device', 8: 'research', 10: 'device', 11: 'hire-marketer', 12: 'campaign', 13: 'exec-cfo', 14: 'build', 15: 'teams' }
  const WHERE = { 0: { tab: 'city' }, 2: { tab: 'office' }, 3: { tab: 'office' }, 4: { tab: 'staff', view: 'hire', role: 'engineer' }, 6: { tab: 'staff', view: 'hire', role: 'researcher' }, 7: { tab: 'products' }, 8: { tab: 'research' }, 9: { tab: 'dashboard' }, 10: { tab: 'products' }, 11: { tab: 'staff', view: 'hire', role: 'marketer' }, 12: { tab: 'marketing' }, 13: { tab: 'staff', view: 'execs' }, 14: { tab: 'office' }, 15: { tab: 'staff', view: 'teams' }, 16: { tab: 'goals', view: 'growth' }, 18: { tab: 'goals' } }
  const cut = (a, b) => {
    const r = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) }
    return r.right - r.left > 0.5 && r.bottom - r.top > 0.5 ? r : null
  }
  const seen = (el, main) => {
    let box = cut(el.getBoundingClientRect(), main.getBoundingClientRect())
    for (let p = el.parentElement; box && p && p !== main; p = p.parentElement) {
      const st = getComputedStyle(p)
      if (st.visibility === 'hidden') return null
      if (st.overflowX !== 'visible' || st.overflowY !== 'visible') box = cut(box, p.getBoundingClientRect())
    }
    return box
  }
  const fresh = () => {
    S().begin({ ...G.defaultConfig(), startType: 'phone', progression: 'guided', seed: 11 })
  }
  const grown = () => {
    fresh()
    S().act((s) => {
      for (const role of ['researcher', 'marketer', 'engineer']) {
        const c = s.candidates.find((e) => e.role === role)
        if (c) G.hire(s, c.id)
      }
      const design = G.starterDesign(s, 'phone')
      G.startProduct(s, { design, family: 'One', variant: '', price: 399, tiers: [], quantity: 5000, mode: 'contract', marketing: 50e3 })
      G.tick(s, 150)
      for (const i of s.incidents) if (!i.done) G.decide(s, i.id, 1)
    })
    useClose()
  }
  const useClose = () => window.sb.setState({ banners: [], yearEnd: null, showing: null })
  const out = []
  const steps = which === 'fresh' ? [0, 2, 3, 4, 6, 7] : [8, 9, 10, 11, 12, 13, 14, 15, 16, 18]
  if (which === 'fresh') fresh()
  else grown()
  await sleep(300)
  for (const i of steps) {
    for (const where of [WHERE[i], { tab: 'dashboard' }]) {
      S().act((s) => void (s.guide = i))
      if (i === 13) S().act((s) => { s.staff = s.staff.filter((e) => e.exec !== 'cfo') })
      S().go(where)
      await sleep(where.tab === 'office' || where.tab === 'city' ? 1500 : 450)
      if (i === 3 || i === 14) {
        // open the build panel as the step asks
        const b = document.querySelector('main [data-coach-target~="build"]')
        if (b && document.querySelectorAll('main [data-coach-target~="build"]').length < 2 && where.tab === 'office') (b.click(), await sleep(400))
      }
      const main = document.querySelector('main')
      const card = document.querySelector('[data-coach=card]')
      const bar = document.querySelector('[data-coach=bar]')
      const g = S().game
      const row = { step: i, at: g.guide, tab: S().tab, main: Math.round(main.getBoundingClientRect().width) }
      if (!card && !bar) { row.coach = 'none'; out.push(row); continue }
      const shown = [card, bar].filter((e) => e && getComputedStyle(e).visibility !== 'hidden')
      row.shown = shown.map((e) => e.getAttribute('data-coach') + ':' + e.getAttribute('data-coach-slot')).join(',')
      const names = ['always', TARGET[i]].filter(Boolean)
      const targets = [...main.querySelectorAll('[data-coach-target]')].filter((e) => e.getAttribute('data-coach-target').split(/\s+/).some((n) => names.includes(n))).map((e) => seen(e, main)).filter(Boolean)
      row.targets = targets.length
      const c = shown[0].getBoundingClientRect()
      row.rect = [c.left, c.top, c.right, c.bottom].map(Math.round)
      row.hit = targets.filter((t) => cut(t, c)).length
      const m = main.getBoundingClientRect()
      row.inside = c.left >= m.left && c.right <= m.right + 0.5 && c.top >= m.top && c.bottom <= m.bottom + 0.5
      const bb = [...main.querySelectorAll('[data-bottom-bar] > *')].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height)
      row.bars = bb.length
      row.onBar = bb.filter((r) => cut(r, c)).length
      out.push(row)
    }
  }
  return out.map((r) => JSON.stringify(r)).join('\n')
}
'ok'
