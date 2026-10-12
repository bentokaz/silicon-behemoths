// The personas that do not play fair: a builder who never stops rebuilding, a
// monkey that calls anything with anything, an adversary that goes looking
// for edges, and a financier hunting for money that comes from nowhere.
import { geomOf } from '../curves'
import * as G from '../game'
import { openEverything } from '../progress'
import { REGIONS } from '../regions'
import { type Shape, gridAt } from '../sites'
import { OS_FEATURES } from '../tech'
import { DEVICE_TYPES, type DeviceType, EXEC_IDS, type GameState, ROLES, SUPPLY_CATS, type Site } from '../types'
import { ensureSeats, hireExecs, hireOne, itemKinds, launch, launchVariant, mine, onSale, research, restock, roomTypes, types } from './kit'
import type { Persona } from './personas'
import type { Play } from './play'

const WEIRD = [0, -1, -0, 0.5, 1.5, NaN, Infinity, -Infinity, 1e9, 1e15, 1e308, -1e9, Number.MAX_SAFE_INTEGER, 2 ** 31, 1e-9, -1e308, 5e-324]
const BAD_IDS = ['', 'nope', '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'p0', 'e0', 'player', 'brand', 'undefined', 'null', '0', ' ', 'store:', 'store:x', 'valueOf']

/** A number: usually a sensible one in the range, sometimes anything at all. */
export const num = (p: Play, lo: number, hi: number, wild = 0.25, whole = true): number => {
  if (p.chance(wild)) return p.chance(0.5) ? p.pick(WEIRD) : p.pick([lo - 1, hi + 1, lo, hi, (lo + hi) / 2 + 0.5])
  const v = lo + p.rnd() * (hi - lo)
  return whole ? Math.round(v) : v
}
/** An id: usually a real one from the list, sometimes rubbish. */
export const anyId = (p: Play, list: string[], wild = 0.2): string => (!list.length || p.chance(wild) ? p.pick(BAD_IDS) : p.pick(list))

export const siteRefs = (s: GameState) => ['office', ...(s.factory ? ['factory'] : []), ...(s.venue ? ['venue'] : []), ...s.stores.map((st) => `store:${st.id}`)]

const SHAPES: Shape[] = ['rect', 'rect', 'round', 'ring', 'diag']

function box(p: Play, site: Site, wild: number): [number, number, number, number] {
  if (p.chance(wild)) return [num(p, 0, site.w - 1, 0.6), num(p, 0, site.h - 1, 0.6), num(p, 0, site.w - 1, 0.6), num(p, 0, site.h - 1, 0.6)]
  const w = p.int(1, Math.min(14, site.w))
  const h = p.int(1, Math.min(12, site.h))
  const x = p.int(0, site.w - w)
  const y = p.int(0, site.h - h)
  return p.chance(0.5) ? [x, y, x + w - 1, y + h - 1] : [x + w - 1, y + h - 1, x, y]
}

const shapeOpts = (p: Play, wild: number) => (p.chance(0.5) ? undefined : { thick: p.chance(wild) ? num(p, 2, 6, 1) : p.int(2, 6), sweep: p.chance(wild) ? num(p, 0, 360, 1) : p.pick([90, 180, 270, 360]), turn: p.chance(wild) ? num(p, 0, 3, 1) : p.int(0, 3) })

/** One random change to one plot. `wild` is the share of arguments that are nonsense. */
export function siteOp(p: Play, ref: string, wild = 0) {
  const s = p.s
  const site = G.siteOf(s, ref)
  if (!site) {
    p.act('zoneRoom', (g) => G.zoneRoom(g, ref, 'work', 0, 0, 3, 3), ref)
    return
  }
  const type = () => (p.chance(wild) ? anyId(p, [], 1) : p.pick(roomTypes(site)))
  const kind = () => (p.chance(wild) ? anyId(p, [], 1) : p.pick(itemKinds(site)))
  const tx = () => (p.chance(wild) ? num(p, 0, site.w - 1, 1) : p.int(0, site.w - 1))
  const ty = () => (p.chance(wild) ? num(p, 0, site.h - 1, 1) : p.int(0, site.h - 1))
  const room = () => (p.chance(wild) || !site.rooms.length ? num(p, 0, 20, 0.5) : p.pick(site.rooms).n)
  const side = () => (p.chance(wild) ? ('x' as 'n') : p.pick(['n', 'w'] as const))
  const edgeKind = () => (p.chance(wild) ? ('bogus' as 'wall') : p.pick(['wall', 'glass', 'door', 'open'] as const))
  const shape = () => (p.chance(wild) ? ('blob' as Shape) : p.pick(SHAPES))
  const roll = p.int(0, 23)
  switch (roll) {
    case 0:
    case 1:
    case 2:
    case 3: {
      const b = box(p, site, wild)
      const sh = shape()
      const o = shapeOpts(p, wild)
      const t = type()
      const into = p.chance(0.15) ? room() : undefined
      const apart = p.chance(0.3)
      p.act('zoneRoom', (g) => G.zoneRoom(g, ref, t, ...b, sh, into, o, apart), ref, t, b, sh, into, o, apart)
      break
    }
    case 4: {
      const [x, y, t, apart] = [tx(), ty(), type(), p.chance(0.3)]
      p.act('fillRoom', (g) => G.fillRoom(g, ref, t, x, y, apart), ref, t, x, y, apart)
      break
    }
    case 5: {
      const b = box(p, site, wild)
      const sh = shape()
      const o = shapeOpts(p, wild)
      p.act('clearZone', (g) => G.clearZone(g, ref, ...b, sh, o), ref, b, sh, o)
      break
    }
    case 6: {
      const n = room()
      p.act('removeRoom', (g) => G.removeRoom(g, ref, n), ref, n)
      break
    }
    case 7: {
      const [n, st] = [room(), num(p, 0, 3, wild)]
      p.act('setRoomStyle', (g) => G.setRoomStyle(g, ref, n, st), ref, n, st)
      break
    }
    case 8:
    case 9: {
      const [x, y, sd, k] = [tx(), ty(), side(), edgeKind()]
      p.act('setEdge', (g) => G.setEdge(g, ref, x, y, sd, k), ref, x, y, sd, k)
      break
    }
    case 10: {
      const edges = Array.from({ length: p.int(0, 12) }, () => ({ x: tx(), y: ty(), side: side() }))
      const ci = site.curves?.length ? p.int(0, site.curves.length - 1) : p.chance(wild) ? num(p, 0, 3, 1) : undefined
      const c = ci !== undefined ? site.curves?.[ci] : undefined
      const all = c ? [...geomOf(c).bays.keys()] : []
      const bays = Array.from({ length: p.int(0, 8) }, () => anyId(p, all, wild))
      const k = edgeKind()
      p.act('setEdges', (g) => G.setEdges(g, ref, { edges, curve: ci, bays }, k), ref, edges.length, ci, bays, k)
      break
    }
    case 11: {
      const ci = site.curves?.length && !p.chance(wild) ? p.int(0, site.curves.length - 1) : num(p, 0, 3, 1)
      const c = site.curves?.[ci]
      const bay = anyId(p, c ? [...geomOf(c).bays.keys()] : [], wild)
      const k = edgeKind()
      p.act('setCurveEdge', (g) => G.setCurveEdge(g, ref, ci, bay, k), ref, ci, bay, k)
      break
    }
    case 12: {
      const look = { facade: p.chance(0.5) ? num(p, 0, 6, wild) : undefined, roof: p.chance(0.5) ? num(p, 0, 4, wild) : undefined, floors: p.chance(0.5) ? num(p, 1, 6, wild) : undefined }
      p.act('setLook', (g) => G.setLook(g, ref, look), ref, look)
      break
    }
    case 13:
    case 14:
    case 15:
    case 16: {
      const [k, x, y, r] = [kind(), tx(), ty(), num(p, 0, 3, wild)]
      p.act('placeItem', (g) => G.placeItem(g, ref, k, x, y, r), ref, k, x, y, r)
      break
    }
    case 17: {
      const [k, x0, y0, x1, y1, r] = [kind(), tx(), ty(), tx(), ty(), num(p, 0, 3, wild)]
      p.act('placeItems', (g) => G.placeItems(g, ref, k, x0, y0, x1, y1, r), ref, k, x0, y0, x1, y1, r)
      break
    }
    case 18: {
      const id = anyId(p, site.items.map((i) => i.id), wild)
      if (p.chance(0.5)) p.act('removeItem', (g) => G.removeItem(g, ref, id), ref, id)
      else p.act('rotateItem', (g) => G.rotateItem(g, ref, id), ref, id)
      break
    }
    case 19: {
      const ids = Array.from({ length: p.int(0, 6) }, () => anyId(p, site.items.map((i) => i.id), wild))
      p.act('removeItems', (g) => G.removeItems(g, ref, ids), ref, ids)
      break
    }
    case 20: {
      const ground = p.chance(wild) ? anyId(p, [], 1) : p.pick(['grass', 'paving', 'asphalt', 'gravel', 'deck', 'water', 'meadow', 'tile', 'concrete'])
      if (p.chance(0.5)) {
        const [x, y] = [tx(), ty()]
        p.act('paintFloor', (g) => G.paintFloor(g, ref, x, y, ground), ref, x, y, ground)
      } else {
        const b = box(p, site, wild)
        const sh = shape()
        p.act('paintArea', (g) => G.paintArea(g, ref, ...b, sh, ground), ref, b, sh, ground)
      }
      break
    }
    case 21: {
      // a door on a real wall: find a boundary near a random tile
      const [x, y] = [p.int(0, site.w - 1), p.int(0, site.h - 1)]
      for (let d = 0; d < site.w; d++) {
        const cx = (x + d) % site.w
        if (gridAt(site, cx, y) !== gridAt(site, cx - 1, y)) {
          const k = p.pick(['glass', 'door', 'open', 'wall'] as const)
          p.act('setEdge', (g) => G.setEdge(g, ref, cx, y, 'w', k), ref, cx, y, 'w', k)
          break
        }
      }
      break
    }
    case 22: {
      if (ref === 'factory') p.act('autoLine', (g) => G.autoLine(g))
      else if (ref === 'venue') p.act('autoVenue', (g) => G.autoVenue(g))
      else if (ref.startsWith('store:') && s.stores.length > 1) {
        const from = anyId(p, s.stores.map((st) => st.id), wild)
        const to = ref.slice(6)
        p.act('layoutQuote', (g) => G.layoutQuote(g, from, to), from, to)
        p.act('copyLayout', (g) => G.copyLayout(g, from, to), from, to)
      }
      break
    }
    default: {
      if (!p.chance(0.15)) break
      if (ref === 'office') p.act('upgradeOffice', (g) => G.upgradeOffice(g))
      else if (ref === 'factory') p.act('buildFactory', (g) => G.buildFactory(g))
      else if (ref === 'venue') p.act('buildVenue', (g) => G.buildVenue(g))
    }
  }
}

/** Never stops rebuilding: rezones, demolishes, copies layouts, moves plots. Keeps a small business going underneath. */
export function builder(): Persona {
  return {
    name: 'builder',
    setup(p) {
      launch(p, types(p.s)[0])
    },
    month(p, m) {
      const s = p.s
      for (const i of s.incidents) if (!i.done) p.act('decide', (g) => G.decide(g, i.id, 1), i.kind)
      restock(p)
      if (m > 0 && m % 12 === 0) launch(p, types(s)[0])
      if (m % 3 === 0 && s.staff.length < 30) hireOne(p)
      hireExecs(p, 1e6)
      if (m === 6) p.act('buildFactory', (g) => G.buildFactory(g))
      if (m === 8) p.act('buildVenue', (g) => G.buildVenue(g))
      if (m % 9 === 4 && s.stores.length < 5) p.act('openStore', (g) => G.openStore(g, p.int(0, 2), undefined, p.chance(0.5) ? g.stores[0]?.id : undefined))
      for (let i = 0; i < 14; i++) siteOp(p, p.pick(siteRefs(s)), 0)
      // and now and then puts the people back at desks
      if (m % 4 === 1) ensureSeats(p, Math.min(s.staff.length, 12))
    },
    day(p) {
      if (p.chance(0.3)) siteOp(p, p.pick(siteRefs(p.s)), 0)
    },
  }
}

/** One random call of one random action. */
export function monkeyOp(p: Play, wild: number) {
  const s = p.s
  const prods = () => anyId(p, s.products.map((x) => x.id), wild)
  const own = () => anyId(p, mine(s).map((x) => x.id), wild)
  const emp = () => anyId(p, s.staff.map((e) => e.id), wild)
  const team = () => anyId(p, s.teams.map((t) => t.id), wild)
  const rival = () => anyId(p, s.companies.map((c) => c.id), wild)
  const store = () => anyId(p, s.stores.map((st) => st.id), wild)
  const region = () => anyId(p, REGIONS.map((r) => r.id), wild)
  const dtype = () => (p.chance(wild) ? (anyId(p, [], 1) as DeviceType) : p.pick(DEVICE_TYPES))
  const text = () => (p.chance(wild) ? p.pick(['', ' ', 'x'.repeat(3000), '<script>', '🙂', '\u0000', 'a\nb']) : `N${p.int(0, 999)}`)
  const roll = p.int(0, 49)
  switch (roll) {
    case 0:
    case 1: {
      const type = p.chance(wild) ? dtype() : p.pick(types(s).length ? types(s) : DEVICE_TYPES)
      let design
      try {
        design = G.starterDesign(s, DEVICE_TYPES.includes(type) ? type : 'phone')
      } catch (e) {
        p.flag(`threw: starterDesign(${type}): ${String((e as Error)?.stack ?? e).slice(0, 300)}`)
        return
      }
      if (p.chance(wild)) design.type = type
      const order = { design, family: text(), variant: p.chance(0.3) ? text() : '', price: num(p, 50, 3000, wild), tiers: p.chance(0.3) ? [{ storage: num(p, 64, 4096, wild), price: num(p, 100, 4000, wild) }] : [], quantity: num(p, 0, 50000, wild), mode: p.chance(wild) ? ('bogus' as 'contract') : p.pick(['contract', 'factory'] as const), marketing: num(p, 0, 500e3, wild), keynote: p.chance(0.3) ? num(p, 0, 3, wild) : undefined }
      p.act('startProduct', (g) => G.startProduct(g, order), { type, family: order.family.slice(0, 20), price: order.price, tiers: order.tiers, quantity: order.quantity, mode: order.mode, marketing: order.marketing, keynote: order.keynote })
      break
    }
    case 2: {
      const [id, q, mode] = [own(), num(p, 1, 50000, wild), p.chance(wild) ? ('x' as 'contract') : p.pick(['contract', 'factory'] as const)]
      p.act('orderProduction', (g) => G.orderProduction(g, id, q, mode), id, q, mode)
      break
    }
    case 3: {
      const id = anyId(p, s.orders.map((o) => o.id), wild)
      p.act('cancelOrder', (g) => G.cancelOrder(g, id), id)
      break
    }
    case 4: {
      const [id, v] = [prods(), num(p, 20, 3000, wild)]
      p.act('setPrice', (g) => G.setPrice(g, id, v), id, v)
      break
    }
    case 5: {
      if (!p.chance(0.25)) break
      const id = prods()
      p.act('discontinue', (g) => G.discontinue(g, id), id)
      break
    }
    case 6: {
      const id = p.chance(wild) ? anyId(p, ['f:', 'f:zzz', 'f:constructor'], 0.3) : p.pick(['display', 'chipset', 'camera', 'battery', 'charging', 'materials', 'design', 'f:hz90', 'f:hz120', 'f:hz144', 'f:hz240', 'f:nfc', 'f:sat', 'f:periscope', 'f:wireless', 'f:ip68', 'f:stereo', 'f:punch', 'f:fpdisplay', 'f:udc'])
      p.act('toggleResearch', (g) => G.toggleResearch(g, id), id)
      break
    }
    case 7: {
      const id = anyId(p, s.candidates.map((e) => e.id), wild)
      p.act('hire', (g) => G.hire(g, id), id)
      break
    }
    case 8: {
      const id = anyId(p, s.execPool.map((e) => e.id), wild)
      p.act('hireExec', (g) => G.hireExec(g, id), id)
      break
    }
    case 9: {
      if (!p.chance(0.3)) break
      const id = emp()
      p.act('fire', (g) => G.fire(g, id), id)
      break
    }
    case 10: {
      const name = text()
      p.act('createTeam', (g) => G.createTeam(g, name), name.slice(0, 20))
      break
    }
    case 11: {
      const [id, name] = [team(), text()]
      p.act('renameTeam', (g) => G.renameTeam(g, id, name), id, name.slice(0, 20))
      break
    }
    case 12: {
      const id = team()
      if (p.chance(0.3)) p.act('deleteTeam', (g) => G.deleteTeam(g, id), id)
      break
    }
    case 13: {
      const [e, t] = [emp(), p.chance(0.2) ? null : team()]
      p.act('assignTeam', (g) => G.assignTeam(g, e, t), e, t)
      break
    }
    case 14: {
      const [t, e] = [team(), p.chance(0.2) ? undefined : emp()]
      p.act('setLead', (g) => G.setLead(g, t, e), t, e)
      break
    }
    case 15:
      p.act('autoTeams', (g) => G.autoTeams(g))
      break
    case 16: {
      const patch = { hours: p.chance(0.5) ? (p.chance(wild) ? ('never' as 'crunch') : p.pick(['relaxed', 'standard', 'crunch'] as const)) : undefined, perks: p.chance(0.5) ? num(p, 0, 3, wild) : undefined }
      p.act('setPolicy', (g) => G.setPolicy(g, patch), patch)
      break
    }
    case 17: {
      const [e, v] = [emp(), p.chance(0.5) ? undefined : num(p, 2000, 30000, wild)]
      p.act('giveRaise', (g) => G.giveRaise(g, e, v), e, v)
      break
    }
    case 18: {
      const e = emp()
      p.act('declineRaise', (g) => G.declineRaise(g, e), e)
      break
    }
    case 19: {
      const e = emp()
      p.act('train', (g) => G.train(g, e), e)
      break
    }
    case 20:
      if (p.chance(0.2)) p.act('headhunt', (g) => G.headhunt(g))
      break
    case 21:
    case 22:
    case 23:
    case 24:
    case 25:
    case 26:
      siteOp(p, p.chance(wild) ? anyId(p, [], 1) : p.pick(siteRefs(s)), wild)
      break
    case 27:
      if (p.chance(0.1)) p.act('upgradeOffice', (g) => G.upgradeOffice(g))
      else if (p.chance(0.1)) p.act('buildFactory', (g) => G.buildFactory(g))
      else if (p.chance(0.1)) p.act('buildVenue', (g) => G.buildVenue(g))
      break
    case 28: {
      const [tier, r, from] = [num(p, 0, 2, wild), p.chance(0.4) ? undefined : region(), p.chance(0.4) ? store() : undefined]
      if (p.chance(0.3)) p.act('openStore', (g) => G.openStore(g, tier, r, from), tier, r, from)
      break
    }
    case 29: {
      const id = store()
      if (p.chance(0.2)) p.act('closeStore', (g) => G.closeStore(g, id), id)
      else {
        const t = num(p, 0, 2, wild)
        p.act('newLayoutQuote', (g) => G.newLayoutQuote(g, id, t), id, t)
      }
      break
    }
    case 30: {
      const cat = p.chance(wild) ? (anyId(p, [], 1) as 'semis') : p.pick(SUPPLY_CATS)
      p.act('lockSupply', (g) => G.lockSupply(g, cat), cat)
      break
    }
    case 31: {
      const [ch, target, monthly, r] = [p.chance(wild) ? (anyId(p, [], 1) as 'online') : p.pick(['online', 'social', 'tv', 'outdoor', 'press', 'esports'] as const), p.chance(0.5) ? 'brand' : own(), num(p, 20e3, 2e6, wild), p.chance(0.6) ? undefined : region()]
      p.act('startCampaign', (g) => G.startCampaign(g, ch, target, monthly, r), ch, target, monthly, r)
      break
    }
    case 32: {
      const id = anyId(p, s.campaigns.map((c) => c.id), wild)
      if (p.chance(0.5)) p.act('stopCampaign', (g) => G.stopCampaign(g, id), id)
      else {
        const v = num(p, 20e3, 2e6, wild)
        p.act('setCampaignBudget', (g) => G.setCampaignBudget(g, id, v), id, v)
      }
      break
    }
    case 33: {
      const [type, venue, id, ahead] = [p.chance(wild) ? ('gala' as 'expo') : p.pick(['keynote', 'expo', 'fanfest', 'devcon'] as const), num(p, 0, 3, wild), p.chance(0.5) ? own() : undefined, p.chance(0.5) ? undefined : num(p, 0, 400, wild)]
      p.act('scheduleEvent', (g) => G.scheduleEvent(g, type, venue, id, ahead), type, venue, id, ahead)
      break
    }
    case 34: {
      const [name, a, b, c] = [text(), num(p, 0, 1, wild, false), num(p, 0, 1, wild, false), num(p, 0, 1, wild, false)]
      p.act('startChip', (g) => G.startChip(g, name, a, b, c), name.slice(0, 12), a, b, c)
      break
    }
    case 35: {
      const [id, fee] = [anyId(p, s.chips.map((c) => c.id), wild), num(p, 0, 40, wild)]
      p.act('setLicenceFee', (g) => G.setLicenceFee(g, id, fee), id, fee)
      break
    }
    case 36: {
      const feats = Array.from({ length: p.int(0, 4) }, () => anyId(p, OS_FEATURES.map((f) => f.id), wild))
      const name = text()
      p.act('startOs', (g) => G.startOs(g, name, feats), name.slice(0, 12), feats)
      break
    }
    case 37: {
      const v = num(p, 0.02, 0.3, wild, false)
      p.act('fundingRound', (g) => G.fundingRound(g, v), v)
      break
    }
    case 38: {
      const v = num(p, 0.05, 0.4, wild, false)
      if (p.chance(0.5)) p.act('listCompany', (g) => G.listCompany(g, v), v)
      else p.act('sellShares', (g) => G.sellShares(g, v), v)
      break
    }
    case 39: {
      const v = num(p, 1e4, 5e6, wild)
      p.act('buyBackShares', (g) => G.buyBackShares(g, v), v)
      break
    }
    case 40: {
      const v = num(p, 0, 0.5, wild, false)
      p.act('setPayout', (g) => G.setPayout(g, v), v)
      break
    }
    case 41: {
      const [id, v] = [rival(), num(p, 0.01, 0.3, wild, false)]
      if (p.chance(0.6)) p.act('buyRivalStake', (g) => G.buyRivalStake(g, id, v), id, v)
      else if (p.chance(0.7)) p.act('sellRivalStake', (g) => G.sellRivalStake(g, id), id)
      else p.act('acquire', (g) => G.acquire(g, id), id)
      break
    }
    case 42: {
      const t = dtype()
      p.act('unlockType', (g) => G.unlockType(g, t), t)
      break
    }
    case 43: {
      const [id, c] = [anyId(p, s.incidents.map((i) => i.id), wild), num(p, 0, 1, wild)]
      p.act('decide', (g) => G.decide(g, id, c), id, c)
      break
    }
    case 44: {
      const id = region()
      if (p.chance(0.4)) p.act('enterRegion', (g) => G.enterRegion(g, id), id)
      else {
        const v = num(p, 0.7, 1.4, wild, false)
        p.act('setRegionPrice', (g) => G.setRegionPrice(g, id, v), id, v)
      }
      break
    }
    case 45: {
      const patch = { warrantyYears: p.chance(0.4) ? num(p, 1, 3, wild) : undefined, updateYears: p.chance(0.4) ? num(p, 2, 7, wild) : undefined, tradeIn: p.chance(0.3) ? p.chance(0.5) : undefined, refurb: p.chance(0.3) ? p.chance(0.5) : undefined, plan: p.chance(0.3) ? p.chance(0.5) : undefined, planPrice: p.chance(0.3) ? num(p, 2, 40, wild) : undefined }
      p.act('setCare', (g) => G.setCare(g, patch), patch)
      break
    }
    case 46: {
      // the System screen lets the player rename any company, 18 characters at most
      const c = p.pick(s.companies)
      const name = p.chance(wild) ? p.pick(['', ' ', 'Alder', s.companies[1].name, '<b>', 'x'.repeat(18)]) : `Co ${p.int(0, 99)}`
      p.act('rename', () => void (c.name = name.slice(0, 18)), c.id, name)
      break
    }
    case 47: {
      const v = num(p, 0, 2e6, wild)
      p.act('setResearchBudget', (g) => G.setResearchBudget(g, v), v)
      break
    }
    case 48: {
      // the guide's step and the switch that opens everything are written straight to the state by their screens
      if (p.chance(0.5)) p.act('guide', (g) => void (g.guide = p.int(-1, 18)))
      else if (p.chance(0.02)) p.act('openEverything', (g) => openEverything(g))
      break
    }
    default: {
      const id = own()
      p.act('recallProduct', (g) => G.recallProduct(g, id), id)
    }
  }
}

/** Calls anything with anything. `wild` is the share of arguments that are nonsense; 0 gives a monkey that only ever presses real buttons. */
export function monkey(wild = 0.25, name = 'monkey', perDay = 2): Persona {
  return {
    name,
    setup(p) {
      if (p.chance(0.7)) launch(p, types(p.s)[0])
    },
    month(p) {
      if (p.chance(0.5)) restock(p)
      if (p.chance(0.1)) research(p, 50e3)
      // the research budget is a slider the screen writes straight to the state, within its own limits
      if (p.chance(0.2)) p.s.rdBudget = p.int(0, 20) * 10e3
    },
    day(p) {
      const n = p.int(0, perDay * 2)
      for (let i = 0; i < n; i++) monkeyOp(p, wild)
    },
  }
}

/** Goes looking for the edges: nothing, everything, twice, in the wrong order. */
export function adversary(): Persona {
  let checkpoint: string | null = null
  let rewinds = 0
  return {
    name: 'adversary',
    setup(p) {
      const t = types(p.s)[0]
      // nothing to sell, then far too much
      launch(p, t, { quantity: 0, family: 'Zero' })
      launch(p, t, { quantity: 1, family: 'One', price: 0.001 })
      launch(p, t, { quantity: 1e9, family: 'Flood' })
      launch(p, t, { family: 'Zero' })
    },
    month(p, m) {
      const s = p.s
      // ---- go bankrupt, come back from the copy taken before the debt, carry on
      if (s.gameOver && checkpoint && rewinds < 6) {
        rewinds++
        try {
          p.s = G.migrate(JSON.parse(checkpoint))
          p.trail.push(`d${p.s.day} rewind`)
          if (p.s.gameOver) p.flag('rewind: the copy taken before the debt is itself a finished game')
        } catch (e) {
          p.flag(`threw: rewind: ${String((e as Error)?.stack ?? e).slice(0, 300)}`)
        }
        return
      }
      if (s.cash >= 0 && !s.gameOver) checkpoint = JSON.stringify(s)
      const phase = m % 16
      const t = types(s)[m % Math.max(1, types(s).length)]
      restock(p, 0.3)
      if (phase === 0) {
        for (const i of s.incidents) for (const c of [-1, 99, 1.5, NaN, 0, 0]) p.act('decide', (g) => G.decide(g, i.id, c), i.kind, c)
        // the same family fifty times, and fifty versions of it
        for (let i = 0; i < 50; i++) launch(p, t, { family: 'Echo', quantity: 0, marketing: 0 })
        for (let i = 0; i < 50; i++) launch(p, t, { family: 'Echo', variant: `Mk ${m}.${i}`, quantity: 10, marketing: 0 })
      } else if (phase === 1) {
        // hire a roomful, then fire every single one, executives too
        for (let i = 0; i < 9; i++) hireOne(p)
        hireExecs(p, -1e12)
        p.act('autoTeams', (g) => G.autoTeams(g))
        for (const tm of [...s.teams]) for (const e of s.staff.slice(0, 3)) p.act('setLead', (g) => G.setLead(g, tm.id, e.id), tm.id, e.id)
        for (const e of [...s.staff]) p.act('fire', (g) => G.fire(g, e.id), e.id)
        p.act('autoTeams', (g) => G.autoTeams(g))
      } else if (phase === 2) {
        // knock down every room, people and all
        for (let i = 0; i < 5; i++) hireOne(p)
        for (const r of [...s.office.rooms]) p.act('removeRoom', (g) => G.removeRoom(g, 'office', r.n), r.n)
        p.act('clearZone', (g) => G.clearZone(g, 'office', 0, 0, g.office.w - 1, g.office.h - 1))
        for (const ref of ['factory', 'venue', ...s.stores.map((st) => `store:${st.id}`)]) p.act('clearZone', (g) => G.clearZone(g, ref, -5, -5, 200, 200), ref)
      } else if (phase === 3) {
        ensureSeats(p, 6)
        // recall everything, order and cancel, sell everything off
        for (const x of s.products) p.act('recallProduct', (g) => G.recallProduct(g, x.id), x.id)
        for (const x of onSale(s)) p.act('orderProduction', (g) => G.orderProduction(g, x.id, 1e7, 'contract'), x.id)
        for (const o of [...s.orders]) p.act('cancelOrder', (g) => G.cancelOrder(g, o.id), o.id)
        for (const x of onSale(s)) {
          p.act('setPrice', (g) => G.setPrice(g, x.id, 1), x.id)
          p.act('setPrice', (g) => G.setPrice(g, x.id, 1e9), x.id)
          p.act('setPrice', (g) => G.setPrice(g, x.id, 0), x.id)
          p.act('setPrice', (g) => G.setPrice(g, x.id, -5), x.id)
        }
      } else if (phase === 4) {
        for (const x of mine(s)) p.act('discontinue', (g) => G.discontinue(g, x.id), x.id)
        for (const x of mine(s)) p.act('discontinue', (g) => G.discontinue(g, x.id), x.id)
        for (const x of mine(s).slice(0, 5)) p.act('orderProduction', (g) => G.orderProduction(g, x.id, 100, 'contract'), x.id)
        launch(p, t)
      } else if (phase === 5) {
        // shares, round and round
        for (let i = 0; i < 4; i++) {
          p.act('fundingRound', (g) => G.fundingRound(g, 0.3))
          p.act('listCompany', (g) => G.listCompany(g, 0.4))
          p.act('sellShares', (g) => G.sellShares(g, 0.15))
          p.act('buyBackShares', (g) => G.buyBackShares(g, Math.max(0, g.cash)))
          p.act('buyBackShares', (g) => G.buyBackShares(g, 1))
        }
        for (const c of s.companies) {
          for (let i = 0; i < 6; i++) {
            p.act('buyRivalStake', (g) => G.buyRivalStake(g, c.id, 0.49), c.id)
            p.act('sellRivalStake', (g) => G.sellRivalStake(g, c.id), c.id)
          }
        }
        p.act('setPayout', (g) => G.setPayout(g, 0.5))
      } else if (phase === 6) {
        for (const r of REGIONS) {
          p.act('enterRegion', (g) => G.enterRegion(g, r.id), r.id)
          p.act('enterRegion', (g) => G.enterRegion(g, r.id), r.id)
          p.act('setRegionPrice', (g) => G.setRegionPrice(g, r.id, 0), r.id)
          p.act('setRegionPrice', (g) => G.setRegionPrice(g, r.id, 99), r.id)
        }
        // open shops everywhere and shut the lot
        for (let i = 0; i < 8; i++) p.act('openStore', (g) => G.openStore(g, i % 3, REGIONS[i % REGIONS.length].id, g.stores[0]?.id), i)
        if (s.stores.length > 1) p.act('copyLayout', (g) => G.copyLayout(g, g.stores[0].id, g.stores[1].id))
        for (const st of [...s.stores]) p.act('closeStore', (g) => G.closeStore(g, st.id), st.id)
        p.act('setCare', (g) => G.setCare(g, { refurb: true }))
      } else if (phase === 7) {
        for (const ty of DEVICE_TYPES) {
          p.act('unlockType', (g) => G.unlockType(g, ty), ty)
          p.act('unlockType', (g) => G.unlockType(g, ty), ty)
        }
        for (const ty of types(s)) launch(p, ty, { quantity: 500, marketing: 0 })
      } else if (phase === 8) {
        // run the overdraft to its limit
        for (let i = 0; i < 30 && G.canAfford(s, 100e3); i++) p.act('headhunt', (g) => G.headhunt(g))
        for (const ch of ['online', 'social', 'tv', 'outdoor', 'press', 'esports'] as const) {
          for (const x of mine(s).slice(-3)) p.act('startCampaign', (g) => G.startCampaign(g, ch, x.id, 1e9), ch, x.id)
          p.act('startCampaign', (g) => G.startCampaign(g, ch, 'brand', 0), ch)
        }
        for (const c of [...s.campaigns]) p.act('setCampaignBudget', (g) => G.setCampaignBudget(g, c.id, -1), c.id)
      } else if (phase === 9) {
        // a keynote for a device that is then shelved
        launch(p, t, { keynote: 0, family: `Stage ${m}` })
        const dev = mine(s).filter((x) => x.status === 'dev')
        for (const x of dev) {
          p.act('scheduleEvent', (g) => G.scheduleEvent(g, 'keynote', 3, x.id), x.id)
          p.act('scheduleEvent', (g) => G.scheduleEvent(g, 'keynote', 0, x.id, 0), x.id)
          p.act('startCampaign', (g) => G.startCampaign(g, 'online', x.id, 50e3), x.id)
        }
        for (const x of dev) p.act('discontinue', (g) => G.discontinue(g, x.id), x.id)
        p.act('scheduleEvent', (g) => G.scheduleEvent(g, 'expo', 0, undefined, 1e9))
        p.act('scheduleEvent', (g) => G.scheduleEvent(g, 'fanfest', 0, undefined, 0))
      } else if (phase === 10) {
        // teams of every odd shape
        for (let i = 0; i < 5; i++) hireOne(p)
        const ids = Array.from({ length: 12 }, (_, i) => p.act('createTeam', (g) => G.createTeam(g, `T${i}`)) ?? '')
        for (const id of ids) for (const e of s.staff) p.act('assignTeam', (g) => G.assignTeam(g, e.id, id), e.id, id)
        for (const id of ids) {
          p.act('setLead', (g) => G.setLead(g, id, 'nobody'), id)
          p.act('setLead', (g) => G.setLead(g, id, s.staff[0]?.id), id)
        }
        for (const id of ids.slice(0, 6)) p.act('deleteTeam', (g) => G.deleteTeam(g, id), id)
        for (const e of s.staff) {
          p.act('train', (g) => G.train(g, e.id), e.id)
          p.act('train', (g) => G.train(g, e.id), e.id)
          p.act('giveRaise', (g) => G.giveRaise(g, e.id, 1e9), e.id)
          p.act('giveRaise', (g) => G.giveRaise(g, e.id, -100), e.id)
        }
      } else if (phase === 11) {
        p.act('startChip', (g) => G.startChip(g, 'Neg', -5, 3.5, 3.5))
        p.act('startChip', (g) => G.startChip(g, 'Big', 1, 1, 1))
        p.act('startChip', (g) => G.startChip(g, '', 0.5, 0.5, 0.5))
        p.act('startChip', (g) => G.startChip(g, 'Ok', 0.7, 0.7, 0.6))
        p.act('startChip', (g) => G.startChip(g, 'Ok', 0.7, 0.7, 0.6))
        p.act('startOs', (g) => G.startOs(g, '', []))
        p.act('startOs', (g) => G.startOs(g, 'AdvOS', ['store', 'store', 'bogus', 'fluid', 'pro']))
        p.act('startOs', (g) => G.startOs(g, 'AdvOS', ['store', 'store']))
        for (const c of s.chips) {
          p.act('setLicenceFee', (g) => G.setLicenceFee(g, c.id, -5), c.id)
          p.act('setLicenceFee', (g) => G.setLicenceFee(g, c.id, 1e12), c.id)
          p.act('setLicenceFee', (g) => G.setLicenceFee(g, c.id, 3), c.id)
        }
      } else if (phase === 12) {
        // buy every rival there is
        for (const c of s.companies) p.act('acquire', (g) => G.acquire(g, c.id), c.id)
        for (const c of s.companies) p.act('acquire', (g) => G.acquire(g, c.id), c.id)
      } else if (phase === 13) {
        for (const id of ['display', 'f:hz90', 'f:nope', 'nope', '', 'f:', 'chipset', 'chipset']) p.act('toggleResearch', (g) => G.toggleResearch(g, id), id)
        research(p, 500e3, true)
        for (const e of EXEC_IDS) void e
        for (const r of ROLES) hireOne(p, r)
        hireExecs(p, -1e12)
      } else if (phase === 14) {
        launchVariant(p, 'Pro')
        launchVariant(p, 'Lite')
        launchVariant(p, 'Max')
        p.act('setCare', (g) => G.setCare(g, { warrantyYears: 99, updateYears: -1, planPrice: -3, plan: true, tradeIn: true }))
        p.act('setPolicy', (g) => G.setPolicy(g, { perks: 99, hours: 'crunch' }))
      } else launch(p, t)
    },
  }
}

/** Hunts for money that comes from nowhere: rounds, issues, buybacks and stakes, as fast as they are allowed. */
export function financier(): Persona {
  return {
    name: 'financier',
    setup(p) {
      launch(p, types(p.s)[0])
      hireOne(p, 'researcher')
    },
    month(p, m) {
      const s = p.s
      for (const i of s.incidents) if (!i.done) p.act('decide', (g) => G.decide(g, i.id, 1), i.kind)
      restock(p)
      if (m > 0 && m % 12 === 0) launch(p, types(s)[0])
      hireExecs(p, 0)
      p.act('fundingRound', (g) => G.fundingRound(g, 0.3))
      p.act('listCompany', (g) => G.listCompany(g, 0.4))
      p.act('sellShares', (g) => G.sellShares(g, 0.15))
      if (m % 3 === 0 && s.cash > 1e6) p.act('buyBackShares', (g) => G.buyBackShares(g, g.cash * 0.2))
      const alive = s.companies.filter((c) => !c.isPlayer && c.alive)
      if (alive.length && s.cash > 5e6) {
        const c = alive[m % alive.length]
        p.act('buyRivalStake', (g) => G.buyRivalStake(g, c.id, 0.2), c.id)
        if (m % 2) p.act('sellRivalStake', (g) => G.sellRivalStake(g, c.id), c.id)
      }
    },
  }
}
