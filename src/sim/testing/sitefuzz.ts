// Fuzzes the building model on its own: long random sequences of zoning,
// clearing, filling, curves, doors, furniture, copies and moves on every kind
// of plot, with the plot checked after every single step.
import * as G from '../game'
import { ITEMS, SITE_TIERS } from '../sites'
import type { Site } from '../types'
import { siteOp, siteRefs } from './chaos'
import { checkSite } from './invariants'
import { type Finding, Play, type Tally } from './play'

/** A plot as text, without the counter the 3D view watches. */
const plain = (site: Site) => JSON.stringify({ ...site, rev: 0 })

export interface SiteFuzzResult {
  seed: number
  ops: number
  tally: Tally
  findings: Finding[]
}

/**
 * One session: a company with a fortune and no income builds on every plot it
 * can have. Money can only ever go down, apart from the half price that the
 * few things standing on the first plot fetch.
 */
export function fuzzSites(seed: number, ops: number, wild: number, trace?: (line: string) => void): SiteFuzzResult {
  const p = new Play({ ...G.defaultConfig(), seed, startCash: 5e9, startType: 'phone' }, `sitefuzz seed=${seed} wild=${wild}`, seed)
  p.trace = trace
  const s = p.s
  const gift = s.office.items.reduce((a, it) => a + (ITEMS.office[it.kind]?.cost ?? 0) / 2, 0)
  const start = s.cash
  // every kind of plot, at a size that depends on the seed
  for (let i = 0; i < seed % SITE_TIERS.office.length; i++) p.act('upgradeOffice', (g) => G.upgradeOffice(g))
  for (let i = 0; i <= seed % SITE_TIERS.factory.length; i++) p.act('buildFactory', (g) => G.buildFactory(g))
  for (let i = 0; i <= (seed >> 2) % SITE_TIERS.venue.length; i++) p.act('buildVenue', (g) => G.buildVenue(g))
  for (let i = 0; i < 3; i++) p.act('openStore', (g) => G.openStore(g, (seed + i) % 3))
  for (let n = 0; n < ops; n++) {
    const ref = p.pick(siteRefs(s))
    const site = G.siteOf(s, ref)
    const before = site ? plain(site) : ''
    const rev = site?.rev ?? 0
    const cash = s.cash
    siteOp(p, ref, wild)
    // a move to a bigger plot replaces the plot; look at whatever is there now
    const now = G.siteOf(s, ref)
    if (now) {
      for (const f of checkSite(now, ref.startsWith('store:') ? 'store' : ref)) p.flag(f)
      if (now === site && plain(now) !== before && now.rev === rev) p.flag(`site-rev: ${p.trail[p.trail.length - 1].replace(/\(.*/, '')} changed the plot without bumping its revision`)
    }
    if (!Number.isFinite(s.cash)) {
      p.flag(`non-finite: cash after ${p.trail[p.trail.length - 1]}`)
      break
    }
    if (s.cash > start + gift + 1e-6) p.flag(`free-money: building has made money: cash is ${(s.cash - start).toFixed(2)} above where it started`)
    if (s.cash > cash + 1e-6 && site && now === site) {
      // money only comes back from furniture sold at half price
      const value = (list: Site) => list.items.reduce((a, it) => a + (ITEMS[list.kind][it.kind]?.cost ?? 0), 0)
      const sold = (JSON.parse(before) as Site).items.reduce((a, it) => a + (ITEMS[site.kind][it.kind]?.cost ?? 0), 0) - value(now)
      if (s.cash - cash > sold / 2 + 1e-6) p.flag(`resale: ${p.trail[p.trail.length - 1].replace(/\(.*/, '')} paid back ${(s.cash - cash).toFixed(2)} for furniture worth ${sold} new`)
    }
    if (n % 25 === 0) p.check(true)
  }
  p.check()
  return { seed, ops, tally: p.tally, findings: [...p.findings.values()] }
}
