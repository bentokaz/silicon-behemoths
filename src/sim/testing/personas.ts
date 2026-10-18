// Player personas for the soak harness. Each plays through the real actions;
// between them they try to do everything a player can, sensibly and not.
import { OS_FEATURES, OS_LICENCES, licenceInfo, licenceOpen, licenceSwitchCost } from '../tech'
import * as G from '../game'
import { has } from '../progress'
import { REGIONS } from '../regions'
import { SITE_TIERS, lineStats, storeStats } from '../sites'
import { DEVICE_TYPES, type DeviceType, type Role, SUPPLY_CATS } from '../types'
import { hasType, unlockBlocked, unlockCost } from '../world'
import { ensureRoom, ensureSeats, freeRect, hireExecs, hireOne, lastProfit, launch, launchVariant, mine, onSale, placeAnywhere, randomDesign, research, restock, types } from './kit'
import type { Play } from './play'

export interface Persona {
  name: string
  /** Once, on the first day. */
  setup?(p: Play): void
  /** After each month has run. `m` counts months from 0. */
  month(p: Play, m: number): void
  /** After each day, for the personas that act daily. */
  day?(p: Play): void
}

/** Answer whatever is waiting, the way a careful player would. */
function housekeeping(p: Play, generous = true) {
  const s = p.s
  for (const i of s.incidents) if (!i.done) p.act('decide', (g) => G.decide(g, i.id, generous && s.cash > 2e6 ? 0 : 1), i.kind) === null || p.act('decide', (g) => G.decide(g, i.id, 1), i.kind)
  for (const x of mine(s)) if (x.recall?.state === 'open') p.act('recallProduct', (g) => G.recallProduct(g, x.id), x.id)
  for (const e of s.staff) {
    if (!e.ask) continue
    if (generous && s.cash > e.ask * 24) p.act('giveRaise', (g) => G.giveRaise(g, e.id), e.id)
    else p.act('declineRaise', (g) => G.declineRaise(g, e.id), e.id)
  }
}

/** Refresh the best-selling line once a year, and open another line when it is cheap enough. */
function yearlyLaunch(p: Play, n: { v: number }, extra = true) {
  const s = p.s
  const sold = (ty: DeviceType) => mine(s).filter((x) => x.type === ty).reduce((a, x) => a + x.history.slice(-12).reduce((u, v) => u + v, 0) * x.price, 0)
  const ranked = [...types(s)].sort((a, b) => sold(b) - sold(a))
  if (!ranked.length) return
  launch(p, ranked[0])
  if (extra && s.cash > 15e6 && ranked[1]) launch(p, ranked[n.v++ % ranked.length] === ranked[0] ? ranked[1] : ranked[n.v % ranked.length])
  const next = DEVICE_TYPES.find((t) => !hasType(s, t) && !unlockBlocked(s, t) && unlockCost(s, t) < s.cash * 0.12)
  if (next) p.act('unlockType', (g) => G.unlockType(g, next), next)
}

// ---------------------------------------------------------------- the sensible builder

export function sensible(): Persona {
  const n = { v: 0 }
  return {
    name: 'sensible',
    setup(p) {
      launch(p, types(p.s)[0])
      // the first hires of a guided company are the ones that open its screens
      for (const role of ['researcher', 'marketer'] as Role[]) if (p.s.cash > 1.5e6) hireOne(p, role)
      research(p, 80e3)
    },
    month(p, m) {
      const s = p.s
      const profit = lastProfit(s)
      const last = s.reports[s.reports.length - 1]
      housekeeping(p)
      restock(p)
      if (!onSale(s).length && !mine(s).some((x) => x.status === 'dev') && s.cash > 0.4e6) launch(p, types(s)[0])
      if (m > 0 && m % 12 === 0 && s.cash > 0.7e6) yearlyLaunch(p, n)
      if (m % 12 === 6 && s.cash > 8e6) launchVariant(p, m % 24 === 6 ? 'Pro' : 'Lite')
      research(p, Math.max(40e3, Math.min(3e6, (last?.revenue ?? 0) * 0.05)), s.cash > 20e6)

      // ---- people: grow with profit, a desk for each, the jobs that open things first
      if (profit > 60e3 && s.staff.length < 60 && s.cash > 1e6) {
        const need = (['researcher', 'marketer', 'designer', 'support', 'engineer', 'software'] as Role[]).find((r) => !s.staff.some((e) => e.role === r && !e.exec))
        hireOne(p, need)
      }
      hireExecs(p)
      if (m % 12 === 3 && has(s, 'teams') && s.staff.length >= 5) {
        p.act('autoTeams', (g) => G.autoTeams(g))
        if (s.cash > 1e6) ensureRoom(p, 'meeting', 4, 3, ['meeting'])
      }
      if (m % 12 === 9 && has(s, 'people') && s.cash > 2e6) {
        p.act('setPolicy', (g) => G.setPolicy(g, { perks: 2 }))
        const e = s.staff.find((x) => x.skill < x.potential)
        if (e) p.act('train', (g) => G.train(g, e.id), e.id)
      }
      // ---- rooms that make the people in them better
      if (m % 6 === 2 && s.cash > 3e6) {
        const plan: [string, string[], Role][] = [['lab', ['bench'], 'researcher'], ['eng', ['devrig'], 'engineer'], ['studio', ['design'], 'designer'], ['media', ['media'], 'marketer'], ['support', ['helpdesk'], 'support'], ['server', ['server'], 'software'], ['lounge', ['coffee', 'sofa'], 'support'], ['lobby', ['reception'], 'support']]
        const next = plan.find(([type]) => !s.office.rooms.some((r) => r.type === type))
        if (next && (next[0] === 'lounge' || next[0] === 'lobby' || s.staff.some((e) => e.role === next[2]))) ensureRoom(p, next[0], 5, 4, next[1])
      }
      if (m % 24 === 20 && s.cash > 30e6) p.act('setLook', (g) => G.setLook(g, 'office', { floors: Math.min(6, g.office.floors + 1), facade: 1, roof: 2 }))

      // ---- marketing
      if (has(s, 'marketing')) {
        if (profit > 300e3 && !s.campaigns.length) p.act('startCampaign', (g) => G.startCampaign(g, 'online', 'brand', Math.min(2e6, Math.max(60e3, profit * 0.25))))
        if (s.campaigns[0]) p.act('setCampaignBudget', (g) => G.setCampaignBudget(g, g.campaigns[0].id, Math.min(3e6, Math.max(60e3, profit * 0.25))))
        if (profit > 3e6 && has(s, 'massMedia') && !s.campaigns.some((c) => c.channel === 'tv')) p.act('startCampaign', (g) => G.startCampaign(g, 'tv', 'brand', 500e3))
      }
      if (has(s, 'events') && m % 6 === 0 && s.cash > 5e6) {
        p.act('scheduleEvent', (g) => G.scheduleEvent(g, 'expo', s.cash > 40e6 ? 1 : 0))
        if (s.fans > 20e3) p.act('scheduleEvent', (g) => G.scheduleEvent(g, 'fanfest', 0))
        if (s.os.own) p.act('scheduleEvent', (g) => G.scheduleEvent(g, 'devcon', 0))
      }

      // ---- growing out: regions, a factory, stores, a venue
      const steady = s.reports.slice(-3).every((r) => r.revenue + r.other - (r.production + r.rd + r.marketing + r.development + r.overhead + r.salaries + r.facilities + r.interest) > 0)
      const abroad = REGIONS.find((r) => !s.regions[r.id].open && s.cash > r.entry * 4 && profit > r.overhead * 4)
      if (steady && m > 18 && abroad) p.act('enterRegion', (g) => G.enterRegion(g, abroad.id), abroad.id)
      if (has(s, 'factory') && s.cash > 12e6 && !s.factory) {
        if (p.act('buildFactory', (g) => G.buildFactory(g)) === null) p.act('autoLine', (g) => G.autoLine(g))
      }
      if (s.factory && !lineStats(s.factory).running && s.cash > 3e6) p.act('autoLine', (g) => G.autoLine(g))
      if (has(s, 'factory') && m % 12 === 1 && s.cash > 5e6) p.act('lockSupply', (g) => G.lockSupply(g, SUPPLY_CATS[m % SUPPLY_CATS.length]))
      if (has(s, 'stores') && s.cash > 6e6 && s.stores.length < 6 && m % 6 === 4) {
        const where = REGIONS.filter((r) => s.regions[r.id].open)[s.stores.length % Math.max(1, REGIONS.filter((r) => s.regions[r.id].open).length)]
        if (p.act('openStore', (g) => G.openStore(g, s.cash > 40e6 ? 1 : 0, where.id, s.stores[0]?.id), where.id) === null) {
          const st = s.stores[s.stores.length - 1]
          placeAnywhere(p, `store:${st.id}`, 'demo')
          placeAnywhere(p, `store:${st.id}`, 'plant')
        }
      }
      if (has(s, 'venue') && s.cash > 15e6 && !s.venue) {
        if (p.act('buildVenue', (g) => G.buildVenue(g)) === null) p.act('autoVenue', (g) => G.autoVenue(g))
      }
      if (has(s, 'carePolicy') && m % 24 === 5) p.act('setCare', (g) => G.setCare(g, { warrantyYears: 2, updateYears: 3, plan: true, planPrice: 8, tradeIn: true, refurb: !!g.factory }))

      // ---- the best operating system it can license without the royalty eating the margin
      if (!s.os.own && m % 6 === 0) {
        const best = OS_LICENCES.filter((l) => licenceOpen(l, s.day) && l.royalty <= 10 && s.cash > licenceSwitchCost(l) * 4).sort((a, b) => b.quality - a.quality)[0]
        if (best && best.quality > licenceInfo(s.os.licence).quality) p.act('setOsLicence', (g) => G.setOsLicence(g, best.id), best.id)
      }
      // ---- labs and money
      if (has(s, 'labs') && s.cash > 25e6) {
        if (!s.chips.some((c) => c.status === 'dev') && s.chips.length < 6 && m % 18 === 7) p.act('startChip', (g) => G.startChip(g, `B${g.chips.length + 1}`, 0.8, 0.6, 0.6))
        if (!s.os.project && m % 12 === 8) {
          const fresh = OS_FEATURES.filter((f) => !s.os.features.includes(f.id)).slice(0, 2).map((f) => f.id)
          p.act('startOs', (g) => G.startOs(g, 'BotOS', fresh), fresh)
        }
        for (const c of s.chips) if (c.status === 'ready' && !c.licenceFee) p.act('setLicenceFee', (g) => G.setLicenceFee(g, c.id, 6), c.id)
      }
      if (has(s, 'shares')) {
        if (s.cash < 1e6 && !s.stock.listed) p.act('fundingRound', (g) => G.fundingRound(g, 0.1))
        if (!s.stock.listed && m % 12 === 11) p.act('listCompany', (g) => G.listCompany(g, 0.15))
        if (s.stock.listed && s.cash > 80e6 && m % 12 === 2) p.act('buyBackShares', (g) => G.buyBackShares(g, g.cash * 0.05))
        if (s.cash > 200e6 && m % 24 === 13) {
          const weak = s.companies.filter((c) => !c.isPlayer && c.alive && (c.value ?? 0) > 0).sort((a, b) => (a.value ?? 0) - (b.value ?? 0))[0]
          if (weak) p.act('buyRivalStake', (g) => G.buyRivalStake(g, weak.id, 0.1), weak.id) === null && s.cash > (weak.value ?? 0) * 6 && p.act('acquire', (g) => G.acquire(g, weak.id), weak.id)
        }
      }
    },
  }
}

// ---------------------------------------------------------------- the others

/** Spends whatever there is, on everything, at once. */
export function reckless(): Persona {
  const n = { v: 0 }
  return {
    name: 'reckless',
    setup(p) {
      launch(p, types(p.s)[0], { stockShare: 0.9, marketing: Math.max(0, p.s.cash) * 0.3 })
    },
    month(p, m) {
      const s = p.s
      housekeeping(p)
      restock(p, 0.95)
      for (let i = 0; i < 3; i++) hireOne(p)
      hireExecs(p, 0)
      research(p, Math.max(200e3, s.cash * 0.2), true)
      if (m % 4 === 0) launch(p, p.pick(types(s)), { stockShare: 0.8, marketing: Math.max(0, s.cash) * 0.2, keynote: has(s, 'events') ? p.int(0, 3) : undefined })
      if (m % 12 === 0) yearlyLaunch(p, n)
      for (const ch of ['online', 'social', 'tv', 'outdoor', 'press', 'esports'] as const) if (!s.campaigns.some((c) => c.channel === ch)) p.act('startCampaign', (g) => G.startCampaign(g, ch, 'brand', Math.max(500e3, s.cash * 0.05)), ch)
      p.act('upgradeOffice', (g) => G.upgradeOffice(g))
      p.act('setLook', (g) => G.setLook(g, 'office', { floors: 6, facade: 1, roof: 4 }))
      if (p.act('buildFactory', (g) => G.buildFactory(g)) === null) p.act('autoLine', (g) => G.autoLine(g))
      if (p.act('buildVenue', (g) => G.buildVenue(g)) === null) p.act('autoVenue', (g) => G.autoVenue(g))
      for (const r of REGIONS) p.act('enterRegion', (g) => G.enterRegion(g, r.id), r.id)
      p.act('openStore', (g) => G.openStore(g, p.int(0, 2), p.pick(REGIONS).id), 'any')
      p.act('fundingRound', (g) => G.fundingRound(g, 0.3))
      p.act('listCompany', (g) => G.listCompany(g, 0.4))
      p.act('sellShares', (g) => G.sellShares(g, 0.15))
      p.act('setPayout', (g) => G.setPayout(g, 0.5))
      p.act('setPolicy', (g) => G.setPolicy(g, { perks: 3, hours: 'crunch' }))
      p.act('setCare', (g) => G.setCare(g, { warrantyYears: 3, updateYears: 7, tradeIn: true, refurb: true, plan: true, planPrice: 2 }))
      for (const t of DEVICE_TYPES) p.act('unlockType', (g) => G.unlockType(g, t), t)
      for (const c of SUPPLY_CATS) p.act('lockSupply', (g) => G.lockSupply(g, c), c)
      p.act('startChip', (g) => G.startChip(g, `R${g.chips.length}`, 1, 1, 0))
      p.act('startOs', (g) => G.startOs(g, 'RashOS', OS_FEATURES.filter((f) => !g.os.features.includes(f.id)).slice(0, 2).map((f) => f.id)))
      p.act('scheduleEvent', (g) => G.scheduleEvent(g, 'expo', 2))
      p.act('scheduleEvent', (g) => G.scheduleEvent(g, 'fanfest', 1))
      p.act('scheduleEvent', (g) => G.scheduleEvent(g, 'devcon', 1))
      const rival = p.pick(s.companies.filter((c) => !c.isPlayer))
      if (rival) p.act('buyRivalStake', (g) => G.buyRivalStake(g, rival.id, 0.2), rival.id) === null && p.act('acquire', (g) => G.acquire(g, rival.id), rival.id)
    },
  }
}

/** Never hires, never advertises, never builds: one device at a time and a full bank account. */
export function miser(): Persona {
  return {
    name: 'miser',
    setup(p) {
      launch(p, types(p.s)[0], { marketing: 0, stockShare: 0.2 })
    },
    month(p, m) {
      housekeeping(p, false)
      restock(p, 0.3)
      if (m > 0 && m % 18 === 0) launch(p, types(p.s)[0], { marketing: 0, stockShare: 0.2 })
      for (const x of onSale(p.s)) if (p.s.day - x.launchDay > 900) p.act('discontinue', (g) => G.discontinue(g, x.id), x.id)
    },
  }
}

/** Floods the market: something new every month, in every line, and the same family over and over. */
export function spammer(): Persona {
  return {
    name: 'spammer',
    setup(p) {
      launch(p, types(p.s)[0])
    },
    month(p, m) {
      const s = p.s
      housekeeping(p)
      restock(p, 0.2)
      const type = p.pick(types(s))
      if (m % 3 === 0) launch(p, type, { family: 'Echo', variant: `v${m}`, stockShare: 0.05, marketing: 0 })
      else if (m % 3 === 1) {
        try {
          launch(p, type, { design: randomDesign(p, type), stockShare: 0.05, marketing: 20e3 })
        } catch (e) {
          p.flag(`threw: generateDesign: ${String((e as Error)?.stack ?? e).slice(0, 300)}`)
        }
      } else launch(p, type, { stockShare: 0.05, marketing: 0 })
      for (const v of ['Pro', 'Lite', 'Max'] as const) if (m % 6 === 5) launchVariant(p, v)
      research(p, 60e3)
      const next = DEVICE_TYPES.find((t) => !hasType(s, t) && !unlockBlocked(s, t) && unlockCost(s, t) < s.cash * 0.3)
      if (next) p.act('unlockType', (g) => G.unlockType(g, next), next)
      if (m % 12 === 0) hireOne(p)
      // old models are swept away to keep the range manageable
      const live = onSale(s).sort((a, b) => a.launchDay - b.launchDay)
      for (const x of live.slice(0, Math.max(0, live.length - 25))) p.act('discontinue', (g) => G.discontinue(g, x.id), x.id)
    },
  }
}

/** Prices everything at several times what it is worth, or at a loss. */
export function pricer(mult: number, name: string): Persona {
  const n = { v: 0 }
  return {
    name,
    setup(p) {
      launch(p, types(p.s)[0], { price: mult })
    },
    month(p, m) {
      const s = p.s
      housekeeping(p)
      restock(p)
      if (m > 0 && m % 12 === 0 && s.cash > 0.7e6) launch(p, types(s)[n.v++ % types(s).length], { price: mult })
      // and keeps moving the price about, both ways
      for (const x of onSale(s)) if (m % 5 === 2) p.act('setPrice', (g) => G.setPrice(g, x.id, Math.max(1, x.price * (mult > 1 ? 1.1 : 0.9))), x.id)
      for (const r of REGIONS) if (m % 7 === 3) p.act('setRegionPrice', (g) => G.setRegionPrice(g, r.id, mult > 1 ? 1.4 : 0.7), r.id)
      if (lastProfit(s) > 100e3 && s.staff.length < 20) hireOne(p)
      research(p, 50e3)
    },
  }
}

/** Puts every dollar into research and never ships a thing. */
export function researchOnly(): Persona {
  return {
    name: 'researchOnly',
    setup(p) {
      hireOne(p, 'researcher')
      research(p, p.s.cash * 0.1, true)
    },
    month(p) {
      housekeeping(p, false)
      if (!p.s.staff.some((e) => e.role === 'researcher')) hireOne(p, 'researcher')
      else if (p.s.staff.length < 12 && p.s.cash > 1e6) hireOne(p, 'researcher')
      if (p.s.cash > 2e6) ensureRoom(p, 'lab', 5, 4, ['bench'])
      research(p, Math.max(100e3, p.s.cash * 0.1), true)
      for (const t of DEVICE_TYPES) if (!hasType(p.s, t) && p.s.cash > 20e6) p.act('unlockType', (g) => G.unlockType(g, t), t)
    },
  }
}

/** Ships one device and then puts everything into land: regions, shops, plants, halls, bigger plots. */
export function expander(): Persona {
  return {
    name: 'expander',
    setup(p) {
      launch(p, types(p.s)[0])
    },
    month(p, m) {
      const s = p.s
      housekeeping(p)
      restock(p)
      if (m > 0 && m % 12 === 0) launch(p, types(s)[0])
      hireExecs(p, 0.5e6)
      if (s.staff.length < 8) hireOne(p, (['marketer', 'researcher', 'support', 'designer'] as Role[])[m % 4])
      for (const r of REGIONS) if (!s.regions[r.id].open && s.cash > r.entry * 1.5) p.act('enterRegion', (g) => G.enterRegion(g, r.id), r.id)
      if (s.cash > 1e6) p.act('upgradeOffice', (g) => G.upgradeOffice(g))
      if (s.cash > 2e6) {
        if (p.act('buildFactory', (g) => G.buildFactory(g)) === null) p.act('autoLine', (g) => G.autoLine(g))
        if (p.act('buildVenue', (g) => G.buildVenue(g)) === null) p.act('autoVenue', (g) => G.autoVenue(g))
      }
      if (s.cash > 1e6 && s.stores.length < 30) p.act('openStore', (g) => G.openStore(g, m % 3, p.pick(REGIONS.filter((r) => g.regions[r.id].open)).id, m % 2 ? g.stores[0]?.id : undefined))
      // a store that cannot trade is shut again
      for (const st of s.stores) if (m % 24 === 23 && !storeStats(st.site).open) p.act('closeStore', (g) => G.closeStore(g, st.id), st.id)
    },
  }
}

export const PERSONAS: Record<string, () => Persona> = {
  sensible,
  reckless,
  miser,
  spammer,
  gouger: () => pricer(3, 'gouger'),
  underpricer: () => pricer(0.45, 'underpricer'),
  researchOnly,
  expander,
}

export { freeRect, ensureSeats, SITE_TIERS }
