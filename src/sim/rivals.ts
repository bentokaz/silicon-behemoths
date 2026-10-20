// Procedural device generation, used for AI rivals, for the player's starting
// templates, for the simple editor and for Pro/Lite style variants.
import { CHARGE_W, EXTRAS, MATERIALS, RAM_OPTIONS, REFRESH, STORAGE_OPTIONS, idealRam, idealStorage, extraInfo, sensorInfo } from '../data/catalog'
import { DEFAULT_CASE, DEFAULT_RGB, PSUS, caseOf, coolersFor, maxFans, towerForm, ANC, COOLERS, DRIVERS, HINGES, type IoInfo, MIC_ARRAYS, OPTICS, SPEAKERS, SPEAKER_DRIVERS, STRAPS, TIERS, TYPES, headStrap, inputOptions, ioInfo, ioOptions, segmentInfo, sizeLimits } from '../data/devices'
import { GRIP, SHOULDER, caseShape, clampPart, coverScreen, faceSize, facesFor, isFlip, lightRing, screenRect, selfieScreen, speakerShape, speakerSockets } from './geometry'
export { speakerSockets }
import { type RngHolder, clamp, int, pick, range } from './rng'
import { batteryStep, maxBattery, minBezel, minThickness, selfieMinDia, thermal } from './scoring'
import type { Body, DeviceDesign, DeviceType, Lens, Levels, PlacedPart, SegmentId } from './types'

/** Types whose screen, if any, has no refresh rate to choose: e-ink, a drone's video link, a ring. */
export const NO_REFRESH: DeviceType[] = ['ereader', 'ring', 'drone', 'mouse']

export const LAYOUT_NAMES =['Vertical pill', 'Square island', 'Loose column', 'Centre circle', 'Full-width bar']
export type FrontStyle = 'notch' | 'drop' | 'pill' | 'punch' | 'under'
export type FingerprintStyle = 'side' | 'back' | 'display' | 'none'

/** Everything the simple editor (and the rival generator) decides about parts. */
export interface LayoutOptions {
  type: DeviceType
  layout: number
  cams: number
  sensor: number
  periscope: boolean
  front: FrontStyle
  fingerprint: FingerprintStyle
  flash: boolean
  stereo: boolean
  logo: string
  logoImage: boolean
  /** Ports and drives fitted, so each gets a socket on the body. */
  io?: string[]
}

/** Places a full, tidy set of parts on a body. Deterministic. */
export function layoutParts(body: Body, o: LayoutOptions): PlacedPart[] {
  const parts: PlacedPart[] = []
  let n = 0
  const add = (p: Omit<PlacedPart, 'id'>) => parts.push(clampPart(body, { ...p, id: `k${++n}` }, o.type))
  if (o.type === 'watch') layoutWatch(body, o, add)
  else if (o.type === 'laptop') layoutLaptop(body, o, add)
  else if (o.type === 'desktop') layoutDesktop(body, o, add)
  else if (o.type === 'tv') layoutTv(body, o, add)
  else if (o.type === 'console') layoutConsole(body, o, add)
  else if (o.type === 'earbuds') layoutEarbuds(body, o, add)
  else if (o.type === 'foldable') layoutFoldable(body, o, add)
  else if (o.type === 'headset') layoutHeadset(body, o, add)
  else if (o.type === 'speaker') layoutSpeaker(body, o, add)
  else if (o.type === 'handheld') layoutHandheld(body, o, add)
  else if (o.type === 'ereader') layoutEreader(body, o, add)
  else if (o.type === 'ring') layoutRing(body, o, add)
  else if (o.type === 'actioncam') layoutActioncam(body, o, add)
  else if (o.type === 'drone') layoutDrone(body, o, add)
  else if (o.type === 'tower') layoutTower(body, o, add)
  else if (o.type === 'monitor') layoutMonitor(body, o, add)
  else if (o.type === 'mouse') layoutMouse(body, o, add)
  else layoutSlab(body, o, add)
  return parts
}

type Add = (p: Omit<PlacedPart, 'id'>) => void

function addLogo(o: LayoutOptions, add: Add, y: number, scale = 1) {
  if (o.logoImage) add({ kind: 'logo', face: 'back', x: 0, y, rot: 0, w: 15 * scale, h: 15 * scale, text: o.logo, useImage: true })
  else if (o.logo) add({ kind: 'logo', face: 'back', x: 0, y, rot: 0, w: Math.min(34, 5.2 * o.logo.length + 4) * scale, h: 7 * scale, text: o.logo })
}

/** The rear cameras of a slab in one of the five arrangements, on a back `width` wide with its centre line at x = 0. */
function rearCameras(width: number, height: number, o: LayoutOptions, add: Add) {
  const tablet = o.type === 'tablet'
  const count = clamp(Math.round(o.cams), tablet ? 0 : 1, 4)
  const lensSets: Lens[][] = [[], ['wide'], ['wide', 'ultrawide'], ['wide', 'ultrawide', 'tele'], ['wide', 'ultrawide', 'tele', 'macro']]
  const lenses = [...lensSets[count]]
  if (o.periscope && count >= 3) lenses[2] = 'periscope'
  const dia = sensorInfo(o.sensor).minDia + 1.5
  const gap = 2.5
  const pad = 3
  const top = height / 2 - (tablet ? 12 : 7)
  const cam = (x: number, y: number, i: number) =>
    add({ kind: 'camera', face: 'back', x, y, rot: 0, w: i === 0 ? dia : dia - 0.5, h: i === 0 ? dia : dia - 0.5, sensor: Math.max(0, o.sensor - (i === 0 ? 0 : 1)), lens: lenses[i] })
  const flash = (x: number, y: number, size = 4) => o.flash && add({ kind: 'flash', face: 'back', x, y, rot: 0, w: size, h: size })
  const left = -width / 2 + (tablet ? 12 : 7)
  if (count > 0) {
    switch (((o.layout % 5) + 5) % 5) {
      case 0: {
        const w = dia + 2 * pad
        const h = count * dia + (count - 1) * gap + 2 * pad
        const cx = left + w / 2
        add({ kind: 'island', face: 'back', x: cx, y: top - h / 2, rot: 0, w, h, r: w / 2, finish: 'back' })
        for (let i = 0; i < count; i++) cam(cx, top - pad - dia / 2 - i * (dia + gap), i)
        flash(cx + w / 2 + 5, top - pad - dia / 2)
        break
      }
      case 1: {
        const side = 2 * dia + gap + 2 * pad
        const cx = left + side / 2
        const cy = top - side / 2
        add({ kind: 'island', face: 'back', x: cx, y: cy, rot: 0, w: side, h: side, r: 9, finish: 'back' })
        const off = (dia + gap) / 2
        const cells = [[-off, off], [-off, -off], [off, off], [off, -off]]
        for (let i = 0; i < count; i++) cam(cx + cells[i][0], cy + cells[i][1], i)
        const free = cells[Math.min(count, 3)]
        if (count < 4) flash(cx + free[0], cy + free[1], 4.5)
        else flash(cx + side / 2 + 5, cy + off)
        break
      }
      case 2: {
        const cx = left + dia / 2 + 1
        for (let i = 0; i < count; i++) cam(cx, top - dia / 2 - 2 - i * (dia + gap + 1), i)
        flash(cx + dia / 2 + 6, top - dia / 2 - 2)
        break
      }
      case 3: {
        const side = 2 * dia + gap + 2 * pad + 4
        const cy = top - side / 2 - 1
        add({ kind: 'island', face: 'back', x: 0, y: cy, rot: 0, w: side, h: side, r: side / 2, finish: 'black' })
        const off = (dia + gap) / 2
        const cells = count === 1 ? [[0, 0]] : count === 2 ? [[-off, 0], [off, 0]] : [[-off, off], [off, off], [-off, -off], [off, -off]]
        for (let i = 0; i < count; i++) cam(cells[i][0], cy + cells[i][1], i)
        flash(0, cy - side / 2 - 5)
        break
      }
      default: {
        const h = dia + 2 * pad
        const cy = top - h / 2 - 4
        add({ kind: 'island', face: 'back', x: 0, y: cy, rot: 0, w: width - (tablet ? 24 : 8), h, r: h / 2, finish: 'black' })
        const span = (count - 1) * (dia + gap)
        for (let i = 0; i < count; i++) cam(-span / 2 + i * (dia + gap) - (count < 4 ? 8 : 0), cy, i)
        // the flash goes at the far end of the bar, or just past the last lens where the bar is short
        if (count < 4) flash(Math.max(width / 2 - (tablet ? 26 : 14), span / 2 - 8 + dia / 2 + 3), cy)
        else flash(0, cy - h / 2 - 5)
      }
    }
  }
}

/** The camera above or inside a slab's screen, on the vertical line at x. */
function frontCamera(body: Body, o: LayoutOptions, add: Add, x = 0) {
  const scr = screenRect(body)
  const selfieLevel = Math.max(0, o.sensor - 1)
  const selfieDia = selfieMinDia(selfieLevel) + 0.4
  const selfie = { kind: 'camera' as const, face: 'front' as const, x, rot: 0, w: selfieDia, h: selfieDia, sensor: selfieLevel, lens: 'wide' as const }
  if (body.bezelTop >= selfieDia + 1.6) {
    // enough bezel to hide the camera in it
    add({ ...selfie, y: body.height / 2 - body.bezelTop / 2 })
  } else if (o.front === 'under') {
    add({ ...selfie, y: scr.cy + scr.h / 2 - 5, underDisplay: true })
  } else if (o.front === 'punch') {
    add({ ...selfie, y: scr.cy + scr.h / 2 - 4.5 })
  } else if (o.front === 'drop') {
    // a waterdrop: a small rounded cut hanging from the edge, the camera in its round end
    const w = selfieDia + 3.4
    const h = w + 0.6
    const ny = scr.cy + scr.h / 2 - h / 2 + 0.25
    add({ kind: 'notch', face: 'front', x, y: ny, rot: 0, w, h, r: w / 2 })
    add({ ...selfie, y: ny - h / 2 + w / 2 })
  } else if (o.front === 'pill') {
    // a pill standing clear of the edge, with the camera at its right end and the face sensors in the rest
    const h = selfieDia + 3
    const w = Math.max(h * 3, 18)
    const ny = scr.cy + scr.h / 2 - 1.6 - h / 2
    add({ kind: 'notch', face: 'front', x, y: ny, rot: 0, w, h, r: h / 2 })
    add({ ...selfie, x: x + w / 2 - h / 2, y: ny })
  } else {
    const ny = scr.cy + scr.h / 2 - 3
    add({ kind: 'notch', face: 'front', x, y: ny, rot: 0, w: 26, h: 6.5, r: 3 })
    add({ ...selfie, y: ny })
  }
}

function layoutSlab(body: Body, o: LayoutOptions, add: Add) {
  const { width, height } = body
  const tablet = o.type === 'tablet'
  rearCameras(width, height, o, add)
  addLogo(o, add, tablet ? 0 : -4, tablet ? 1.5 : 1)

  // ---- front
  const scr = screenRect(body)
  frontCamera(body, o, add)
  if (o.fingerprint === 'display') add({ kind: 'fingerprint', face: 'front', x: 0, y: scr.cy - scr.h * 0.3, rot: 0, w: 8, h: 8 })
  else if (o.fingerprint === 'back') add({ kind: 'fingerprint', face: 'back', x: 0, y: 22, rot: 0, w: 9, h: 9 })
  else if (o.fingerprint === 'side') add({ kind: 'fingerprint', face: 'right', x: tablet ? height * 0.12 : 2, y: 0, rot: 0, w: 11, h: 2.2 })

  // ---- edges
  if (tablet) {
    add({ kind: 'button', face: 'top', x: width / 2 - 16, y: 0, rot: 0, w: 12, h: 2.2 })
    add({ kind: 'button', face: 'right', x: height / 2 - 34, y: 0, rot: 0, w: 22, h: 2.2 })
    add({ kind: 'port', face: 'bottom', x: 0, y: 0, rot: 0, w: 8.6, h: 2.8 })
    add({ kind: 'grille', face: 'bottom', x: width * 0.24, y: 0, rot: 0, w: 16, h: 1.4 })
    add({ kind: 'grille', face: 'bottom', x: -width * 0.24, y: 0, rot: 0, w: 16, h: 1.4 })
    if (o.stereo) {
      add({ kind: 'grille', face: 'top', x: width * 0.18, y: 0, rot: 0, w: 16, h: 1.4 })
      add({ kind: 'grille', face: 'top', x: -width * 0.24, y: 0, rot: 0, w: 16, h: 1.4 })
    }
    return
  }
  add({ kind: 'button', face: 'right', x: 22, y: 0, rot: 0, w: 11, h: 2.2 })
  add({ kind: 'button', face: 'right', x: 44, y: 0, rot: 0, w: 19, h: 2.2 })
  add({ kind: 'port', face: 'bottom', x: 0, y: 0, rot: 0, w: 8.6, h: 2.8 })
  add({ kind: 'grille', face: 'bottom', x: 18, y: 0, rot: 0, w: 12, h: 1.4 })
  if (o.stereo) add({ kind: 'grille', face: 'top', x: -16, y: 0, rot: 0, w: 8, h: 1.2 })
}

function layoutWatch(body: Body, o: LayoutOptions, add: Add) {
  const size = Math.min(body.width, body.height)
  const win = Math.round(size * 0.62)
  add({ kind: 'island', face: 'back', x: 0, y: 0, rot: 0, w: win, h: win, r: win / 2, finish: 'black' })
  const d = win * 0.2
  for (const [x, y] of [[d, 0], [-d, 0], [0, d], [0, -d]]) add({ kind: 'flash', face: 'back', x, y, rot: 0, w: 3, h: 3 })
  if (o.logoImage) add({ kind: 'logo', face: 'back', x: 0, y: -body.height / 2 + 5, rot: 0, w: 6, h: 6, text: o.logo, useImage: true })
  add({ kind: 'button', face: 'right', x: body.height * 0.14, y: 0, rot: 0, w: 6.5, h: 6.5, crown: true })
  add({ kind: 'button', face: 'right', x: -body.height * 0.17, y: 0, rot: 0, w: 8, h: 2.4 })
  add({ kind: 'grille', face: 'left', x: 0, y: 0, rot: 0, w: 7, h: 1.2 })
}

/** Webcam above a screen: in the top bezel, or in a small notch if the bezel is too thin. */
function addWebcam(body: Body, o: LayoutOptions, add: Add) {
  const scr = screenRect(body)
  const camLevel = Math.max(0, o.sensor)
  const dia = selfieMinDia(camLevel) + 0.4
  if (body.bezelTop >= dia + 1.6) {
    add({ kind: 'camera', face: 'front', x: 0, y: body.height / 2 - body.bezelTop / 2, rot: 0, w: dia, h: dia, sensor: camLevel, lens: 'wide' })
  } else {
    // thin bezels: the webcam lives in a small notch
    const ny = scr.cy + scr.h / 2 - 3
    add({ kind: 'notch', face: 'front', x: 0, y: ny, rot: 0, w: 34, h: 6.5, r: 2.5 })
    add({ kind: 'camera', face: 'front', x: 0, y: ny, rot: 0, w: dia, h: dia, sensor: camLevel, lens: 'wide' })
  }
}

/** One socket per port fitted, in the order they were chosen. `face` keeps only those meant for that face. */
function sockets(type: DeviceType, io: string[] | undefined, face?: PlacedPart['face']): { info: IoInfo; id: string }[] {
  const out: { info: IoInfo; id: string }[] = []
  for (const id of io ?? []) {
    const info = ioInfo(type, id)
    if (!info?.size || (face && (info.face ?? 'back') !== face)) continue
    for (let i = 0; i < (info.count ?? 1); i++) out.push({ info, id })
  }
  return out
}

/**
 * The advanced editor's version of a relayout: after the port list changes,
 * drop the sockets of ports that were removed and add one for each new port,
 * leaving everything the player has placed where it is.
 */
export function syncSockets(d: DeviceDesign, before: string[]): PlacedPart[] {
  const now = d.specs.io ?? []
  const isSocket = (p: PlacedPart) => p.kind === 'port' || p.kind === 'slot'
  const parts = d.parts.filter((p) => !(isSocket(p) && p.text && before.includes(p.text) && !now.includes(p.text)))
  let n = parts.reduce((m, p) => Math.max(m, parseInt(p.id.slice(1)) || 0), 0)
  for (const id of now) {
    if (before.includes(id)) continue
    const info = ioInfo(d.type, id)
    if (!info?.size) continue
    const kind = info.part ?? 'port'
    const face = info.face ?? facesFor(kind, d.type)[0]
    const fs = faceSize(d.body, face, d.type)
    for (let i = 0; i < (info.count ?? 1); i++) {
      // new sockets appear near the middle of their face, one beside the next, ready to be dragged
      const turned = kind === 'slot' && fs.w < info.size[0] + 8
      parts.push(clampPart(d.body, { id: `k${++n}`, kind, face, x: i * (info.size[0] + 8), y: 0, rot: turned ? 90 : 0, w: info.size[0], h: info.size[1], text: id }, d.type))
    }
  }
  return parts
}

function layoutLaptop(body: Body, o: LayoutOptions, add: Add) {
  addWebcam(body, o, add)
  if (o.logoImage) add({ kind: 'logo', face: 'back', x: 0, y: 0, rot: 0, w: 36, h: 36, text: o.logo, useImage: true })
  else if (o.logo) add({ kind: 'logo', face: 'back', x: 0, y: 0, rot: 0, w: Math.min(90, 11 * o.logo.length + 8), h: 14, text: o.logo })
  // ports alternate between the sides, starting at the hinge end
  const next = { left: body.height / 2 - 34, right: body.height / 2 - 34 }
  ;(o.io ?? []).forEach((id, i) => {
    const port = ioInfo('laptop', id)
    if (!port?.size) return
    const face = i % 2 === 0 ? 'left' : 'right'
    add({ kind: 'port', face, x: next[face] - port.size[0] / 2, y: 0, rot: 0, w: port.size[0], h: port.size[1], text: id })
    next[face] -= port.size[0] + 9
  })
  if (o.stereo) {
    add({ kind: 'grille', face: 'left', x: -body.height / 2 + 46, y: 0, rot: 0, w: 30, h: 1.4 })
    add({ kind: 'grille', face: 'right', x: -body.height / 2 + 46, y: 0, rot: 0, w: 30, h: 1.4 })
  }
  // the power key sits in the strip of deck above the keyboard
  add({ kind: 'fingerprint', face: 'top', x: body.width / 2 - 30, y: body.height / 2 - 8, rot: 0, w: 12, h: 6.5 })
}

function layoutDesktop(body: Body, o: LayoutOptions, add: Add) {
  const { width, height } = body
  addWebcam(body, o, add)
  // a logo on the chin if there is one, and always one on the back
  if (body.bezelBottom >= 16) {
    const h = Math.min(9, body.bezelBottom * 0.34)
    if (o.logoImage) add({ kind: 'logo', face: 'front', x: 0, y: -height / 2 + body.bezelBottom / 2, rot: 0, w: h * 1.5, h: h * 1.5, text: o.logo, useImage: true })
    else if (o.logo) add({ kind: 'logo', face: 'front', x: 0, y: -height / 2 + body.bezelBottom / 2, rot: 0, w: Math.min(70, h * 0.75 * o.logo.length + 4), h, text: o.logo })
  }
  if (o.logoImage) add({ kind: 'logo', face: 'back', x: 0, y: height * 0.2, rot: 0, w: 46, h: 46, text: o.logo, useImage: true })
  else if (o.logo) add({ kind: 'logo', face: 'back', x: 0, y: height * 0.2, rot: 0, w: Math.min(150, 15 * o.logo.length + 10), h: 20, text: o.logo })
  add({ kind: 'vent', face: 'back', x: 0, y: height / 2 - 26, rot: 0, w: width * 0.42, h: 10 })
  // ports in a row along the bottom of the back, clear of the stand
  const y = -height / 2 + 30
  let x = width / 2 - 44
  for (const { info, id } of sockets('desktop', o.io)) {
    const [w, h] = info.size!
    add({ kind: 'port', face: 'back', x: x - w / 2, y, rot: 0, w, h, text: id })
    x -= w + 11
  }
  add({ kind: 'button', face: 'back', x: -width / 2 + 44, y, rot: 0, w: 12, h: 12 })
  add({ kind: 'grille', face: 'bottom', x: width * 0.26, y: 0, rot: 0, w: 70, h: 1.6 })
  add({ kind: 'grille', face: 'bottom', x: -width * 0.26, y: 0, rot: 0, w: 70, h: 1.6 })
}

function layoutTv(body: Body, o: LayoutOptions, add: Add) {
  const { width, height } = body
  // front: a small badge and a standby light in the bottom bezel, if it is tall enough
  const by = -height / 2 + body.bezelBottom / 2
  if (body.bezelBottom >= 7 && !o.logoImage && o.logo) {
    const h = Math.min(9, body.bezelBottom * 0.5)
    add({ kind: 'logo', face: 'front', x: 0, y: by, rot: 0, w: Math.min(80, h * 0.75 * o.logo.length + 4), h, text: o.logo })
  }
  if (o.flash && body.bezelBottom >= 4) add({ kind: 'light', face: 'front', x: width / 2 - 60, y: by, rot: 0, w: 2.4, h: 2.4, color: '#ff5a4a' })
  // back: a port panel to one side, vents high up, the brand in the middle
  const list = sockets('tv', o.io)
  if (list.length) {
    const rows = Math.ceil(list.length / 2)
    const px = width * 0.3
    const py = -height * 0.1
    add({ kind: 'island', face: 'back', x: px, y: py, rot: 0, w: 150, h: rows * 30 + 24, r: 8, finish: 'black' })
    list.forEach(({ info, id }, i) => {
      const [w, h] = info.size!
      add({ kind: 'port', face: 'back', x: px + (i % 2 ? -34 : 34), y: py + ((rows - 1) / 2 - Math.floor(i / 2)) * 30, rot: 0, w, h, text: id })
    })
  }
  if (o.logoImage) add({ kind: 'logo', face: 'back', x: 0, y: height * 0.14, rot: 0, w: 110, h: 110, text: o.logo, useImage: true })
  else if (o.logo) add({ kind: 'logo', face: 'back', x: 0, y: height * 0.14, rot: 0, w: Math.min(320, 34 * o.logo.length + 20), h: 44, text: o.logo })
  add({ kind: 'vent', face: 'back', x: width * 0.22, y: height * 0.36, rot: 0, w: width * 0.3, h: 22 })
  add({ kind: 'vent', face: 'back', x: -width * 0.22, y: height * 0.36, rot: 0, w: width * 0.3, h: 22 })
  // underneath: down-firing speakers either side of the stand, and the one button
  add({ kind: 'grille', face: 'bottom', x: width * 0.19, y: 0, rot: 0, w: 130, h: 2.4 })
  add({ kind: 'grille', face: 'bottom', x: -width * 0.19, y: 0, rot: 0, w: 130, h: 2.4 })
  add({ kind: 'button', face: 'bottom', x: width * 0.44, y: 0, rot: 0, w: 16, h: 5 })
}

function layoutConsole(body: Body, o: LayoutOptions, add: Add) {
  const { width, height, thickness: depth } = body
  const tower = height > width * 1.15
  const disc = (o.io ?? []).includes('disc') && Math.max(width, height) >= 132
  const front = sockets('console', o.io, 'front').filter((x) => x.info.part !== 'slot')
  const light = o.flash ? '#5ab4ff' : undefined
  const text = o.logoImage ? undefined : o.logo
  const logoW = Math.min(110, 11 * (o.logo.length || 4) + 8)
  if (tower) {
    // a column of slot, button and ports to one side of a tall light bar
    const cx = width * 0.22
    if (disc) add({ kind: 'slot', face: 'front', x: cx, y: height * 0.12, rot: 90, w: 124, h: 3.2, text: 'disc' })
    if (light) add({ kind: 'light', face: 'front', x: 0, y: 0, rot: 90, w: height * 0.72, h: 1.6, color: light })
    add({ kind: 'button', face: 'front', x: cx, y: height / 2 - 20, rot: 0, w: 9, h: 9 })
    front.forEach(({ info, id }, i) => add({ kind: 'port', face: 'front', x: cx, y: -height / 2 + 20 + i * 14, rot: 0, w: info.size![0], h: info.size![1], text: id }))
    if (o.logoImage) add({ kind: 'logo', face: 'right', x: 0, y: height * 0.26, rot: 0, w: 40, h: 40, text: o.logo, useImage: true })
    else if (text) add({ kind: 'logo', face: 'right', x: 0, y: height * 0.26, rot: 0, w: Math.min(logoW, depth * 0.6), h: 15, text })
    add({ kind: 'vent', face: 'top', x: 0, y: 0, rot: 0, w: width * 0.56, h: depth * 0.6 })
  } else {
    const row = -height * 0.26
    if (disc) add({ kind: 'slot', face: 'front', x: 0, y: height * 0.2, rot: 0, w: 124, h: 3.2, text: 'disc' })
    if (light) add({ kind: 'light', face: 'front', x: 0, y: disc ? -height * 0.02 : height * 0.12, rot: 0, w: Math.min(124, width * 0.5), h: 1.6, color: light })
    add({ kind: 'button', face: 'front', x: -width / 2 + 24, y: row, rot: 0, w: 9, h: 9 })
    let x = width / 2 - 22
    for (const { info, id } of front) {
      add({ kind: 'port', face: 'front', x: x - info.size![0] / 2, y: row, rot: 0, w: info.size![0], h: info.size![1], text: id })
      x -= info.size![0] + 9
    }
    if (o.logoImage) add({ kind: 'logo', face: 'top', x: 0, y: -depth * 0.16, rot: 0, w: 40, h: 40, text: o.logo, useImage: true })
    else if (text) add({ kind: 'logo', face: 'top', x: 0, y: -depth * 0.16, rot: 0, w: Math.min(logoW, width * 0.5), h: 15, text })
    add({ kind: 'vent', face: 'top', x: 0, y: depth * 0.3, rot: 0, w: width * 0.64, h: depth * 0.2 })
  }
  // the sides breathe in, the back breathes out
  const side = faceSize(body, 'left', 'console')
  if (side.h >= 30) {
    // on a tower they sit low, leaving the upper side clear for the badge
    const vh = tower ? side.h * 0.3 : side.h * 0.4
    const vy = tower ? -side.h * 0.2 : 0
    add({ kind: 'vent', face: 'left', x: 0, y: vy, rot: 0, w: side.w * 0.5, h: vh })
    add({ kind: 'vent', face: 'right', x: 0, y: vy, rot: 0, w: side.w * 0.5, h: vh })
  }
  // back: power and video out are always there, then whatever else was chosen
  const back = [{ id: 'power', size: [20, 12] }, { id: 'hdmi', size: [15, 5.2] }, ...sockets('console', o.io, 'back').map((x) => ({ id: x.id, size: x.info.size! }))]
  if (tower) {
    add({ kind: 'vent', face: 'back', x: 0, y: height * 0.2, rot: 0, w: width * 0.6, h: height * 0.36 })
    back.forEach((p, i) => add({ kind: 'port', face: 'back', x: (i % 2 ? -1 : 1) * width * 0.2, y: -height * 0.1 - Math.floor(i / 2) * 20, rot: 0, w: p.size[0], h: p.size[1], text: p.id }))
  } else {
    const tall = height >= 56
    if (tall) add({ kind: 'vent', face: 'back', x: 0, y: height * 0.22, rot: 0, w: width * 0.62, h: height * 0.26 })
    else add({ kind: 'vent', face: 'back', x: -width * 0.24, y: 0, rot: 0, w: width * 0.36, h: height * 0.5 })
    let x = width / 2 - 20
    for (const p of back) {
      add({ kind: 'port', face: 'back', x: x - p.size[0] / 2, y: tall ? -height * 0.22 : 0, rot: 0, w: p.size[0], h: Math.min(p.size[1], tall ? height * 0.34 : height * 0.5), text: p.id })
      x -= p.size[0] + 9
    }
  }
}

/** A tower: the power button and the front ports on top at the front, a light strip and the badge on the front, the ports, the card's outputs and the power inlet at the back. */
function layoutTower(body: Body, o: LayoutOptions, add: Add) {
  const { width, height, thickness: depth } = body
  const flat = towerForm(body) === 'htpc'
  const text = o.logoImage ? undefined : o.logo
  const top = sockets('tower', o.io, 'top')
  if (flat) {
    // lying down, everything is on the front: the button and the ports to the right, the badge to the left
    add({ kind: 'button', face: 'front', x: width / 2 - 26, y: 0, rot: 0, w: 11, h: 11 })
    let x = width / 2 - 50
    for (const { info, id } of top) {
      add({ kind: 'port', face: 'front', x: x - info.size![0] / 2, y: -height * 0.18, rot: 0, w: info.size![0], h: info.size![1], text: id })
      x -= info.size![0] + 8
    }
    if (o.logoImage) add({ kind: 'logo', face: 'front', x: -width / 2 + 40, y: 0, rot: 0, w: 22, h: 22, text: o.logo, useImage: true })
    else if (text) add({ kind: 'logo', face: 'front', x: -width / 2 + 50, y: 0, rot: 0, w: Math.min(70, 8 * text.length + 6), h: 9, text })
    if (o.flash) add({ kind: 'light', face: 'front', x: 0, y: -height / 2 + 12, rot: 0, w: width * 0.6, h: 2.4, color: '#ff6b1a' })
    add({ kind: 'vent', face: 'top', x: width * 0.12, y: 0, rot: 0, w: width * 0.5, h: depth * 0.6 })
  } else {
    add({ kind: 'button', face: 'top', x: width * 0.24, y: -depth / 2 + 24, rot: 0, w: 11, h: 11 })
    let x = width * 0.24 - 18
    for (const { info, id } of top) {
      add({ kind: 'port', face: 'top', x: x - info.size![0] / 2, y: -depth / 2 + 24, rot: 0, w: info.size![0], h: info.size![1], text: id })
      x -= info.size![0] + 7
    }
    if ((o.io ?? []).includes('odd') && Math.max(width, height) >= 160) add({ kind: 'slot', face: 'front', x: 0, y: height / 2 - 30, rot: width < 156 ? 90 : 0, w: 148, h: 12, text: 'odd' })
    if (o.flash) add({ kind: 'light', face: 'front', x: width / 2 - 12, y: 0, rot: 0, w: 3, h: Math.min(height * 0.7, 300), color: '#ff6b1a' })
    if (o.logoImage) add({ kind: 'logo', face: 'front', x: 0, y: -height / 2 + 34, rot: 0, w: 24, h: 24, text: o.logo, useImage: true })
    else if (text) add({ kind: 'logo', face: 'front', x: 0, y: -height / 2 + 34, rot: 0, w: Math.min(width * 0.6, 8 * text.length + 6), h: 9, text })
    add({ kind: 'vent', face: 'top', x: 0, y: depth * 0.12, rot: 0, w: width * 0.62, h: depth * 0.5 })
  }
  // the back: the board's port panel high up beside the far wall, the card's outputs below it, the power inlet low down
  const rear = [...sockets('tower', o.io, 'back'), { info: { size: [15, 5.2] as [number, number] }, id: 'hdmi' }]
  const px = flat ? -width / 2 + 60 : width / 2 - 34
  rear.forEach(({ info, id }, i) => {
    const [w, h] = info.size!
    add({ kind: 'port', face: 'back', x: flat ? px + i * 22 : px, y: flat ? height * 0.15 : height / 2 - 30 - i * 15, rot: 0, w, h, text: id })
  })
  add({ kind: 'port', face: 'back', x: flat ? width / 2 - 40 : 0, y: flat ? 0 : -height / 2 + 48, rot: 0, w: 20, h: 12, text: 'power' })
}

/** A monitor: the badge and a power light in the bottom bezel, the inputs in a panel on the back, the menu buttons underneath. */
function layoutMonitor(body: Body, o: LayoutOptions, add: Add) {
  const { width, height } = body
  const by = -height / 2 + body.bezelBottom / 2
  if (body.bezelBottom >= 7 && !o.logoImage && o.logo) {
    const h = Math.min(7, body.bezelBottom * 0.5)
    add({ kind: 'logo', face: 'front', x: 0, y: by, rot: 0, w: Math.min(60, h * 0.75 * o.logo.length + 4), h, text: o.logo })
  }
  if (o.flash && body.bezelBottom >= 4) add({ kind: 'light', face: 'front', x: width / 2 - 30, y: by, rot: 0, w: 1.8, h: 1.8, color: '#ffffff' })
  const list = sockets('monitor', o.io)
  if (list.length) {
    const px = width * 0.24
    const py = -height * 0.22
    add({ kind: 'island', face: 'back', x: px, y: py, rot: 0, w: Math.min(width * 0.36, list.length * 24 + 24), h: 34, r: 6, finish: 'black' })
    list.forEach(({ info, id }, i) => {
      const [w, h] = info.size!
      add({ kind: 'port', face: 'back', x: px + (i - (list.length - 1) / 2) * 22, y: py, rot: 0, w, h, text: id })
    })
  }
  if (o.logoImage) add({ kind: 'logo', face: 'back', x: 0, y: height * 0.2, rot: 0, w: 50, h: 50, text: o.logo, useImage: true })
  else if (o.logo) add({ kind: 'logo', face: 'back', x: 0, y: height * 0.2, rot: 0, w: Math.min(160, 16 * o.logo.length + 10), h: 22, text: o.logo })
  add({ kind: 'vent', face: 'back', x: 0, y: height * 0.38, rot: 0, w: width * 0.5, h: 12 })
  add({ kind: 'button', face: 'bottom', x: width * 0.4, y: 0, rot: 0, w: 10, h: 4 })
}

/** A mouse: the DPI button behind the wheel and the badge on the palm, thumb buttons on the thumb side (+X), the port at the nose and the sensor window underneath. */
function layoutMouse(body: Body, o: LayoutOptions, add: Add) {
  const L = body.thickness
  const io = o.io ?? []
  if (io.includes('dpi')) add({ kind: 'button', face: 'top', x: 0, y: -L * 0.12, rot: 0, w: 5, h: 7 })
  if (o.logoImage) add({ kind: 'logo', face: 'top', x: 0, y: L * 0.24, rot: 0, w: 9, h: 9, text: o.logo, useImage: true })
  else if (o.logo) add({ kind: 'logo', face: 'top', x: 0, y: L * 0.24, rot: 0, w: Math.min(body.width * 0.4, 3.4 * o.logo.length + 3), h: 4, text: o.logo })
  if (io.includes('side')) for (const k of [0, 1]) add({ kind: 'button', face: 'right', x: -L * (0.1 - k * 0.15), y: body.height * 0.08, rot: 0, w: 12, h: 4.5 })
  add({ kind: 'port', face: 'front', x: 0, y: -body.height * 0.18, rot: 0, w: 8.6, h: 2.8, text: 'usbc' })
  add({ kind: 'island', face: 'bottom', x: 0, y: L * 0.04, rot: 0, w: 9, h: 12, r: 2, finish: 'black' })
}

function layoutEarbuds(body: Body, o: LayoutOptions, add: Add) {
  const cs = caseShape(body)
  const flat = body.width - 2 * cs.foot
  if (o.flash) add({ kind: 'light', face: 'front', x: 0, y: cs.shell * 0.2, rot: 0, w: 2, h: 2, color: '#8dffa8' })
  if (o.logoImage) add({ kind: 'logo', face: 'front', x: 0, y: -cs.shell * 0.12, rot: 0, w: 9, h: 9, text: o.logo, useImage: true })
  else if (o.logo && flat >= 12) add({ kind: 'logo', face: 'front', x: 0, y: -cs.shell * 0.12, rot: 0, w: Math.min(flat - 2, 3.1 * o.logo.length + 2), h: 4.2, text: o.logo })
  add({ kind: 'button', face: 'back', x: 0, y: -cs.shell * 0.05, rot: 0, w: 5.5, h: 5.5 })
  add({ kind: 'port', face: 'bottom', x: 0, y: 0, rot: 0, w: 8.6, h: 2.8, text: 'usbc' })
}

/**
 * A foldable, laid out open. Its back is two halves: the one that folds over is
 * the cover screen, so the cameras and the badge share the other, laid out about its own centre line.
 */
function layoutFoldable(body: Body, o: LayoutOptions, add: Add) {
  const { width, height } = body
  if (isFlip(body)) {
    // a flip: one or two cameras in a column at the top of the upper half, the cover screen beside them or right across
    rearCameras(width, height, { ...o, cams: Math.min(o.cams, 2), layout: (body.cover ?? 1) >= 2 ? 2 : 0 }, add)
    addLogo(o, add, -height / 4)
    frontCamera(body, o, add)
    const scr = screenRect(body)
    if (o.fingerprint === 'display') add({ kind: 'fingerprint', face: 'front', x: 0, y: scr.cy - scr.h * 0.3, rot: 0, w: 8, h: 8 })
    else if (o.fingerprint === 'back') add({ kind: 'fingerprint', face: 'back', x: 0, y: -height * 0.12, rot: 0, w: 9, h: 9 })
    else if (o.fingerprint === 'side') add({ kind: 'fingerprint', face: 'right', x: 16, y: 0, rot: 0, w: 11, h: 2.2 })
    // the keys sit on the upper half, clear of the hinge
    add({ kind: 'button', face: 'right', x: 34, y: 0, rot: 0, w: 11, h: 2.2 })
    add({ kind: 'button', face: 'right', x: 56, y: 0, rot: 0, w: 19, h: 2.2 })
    add({ kind: 'port', face: 'bottom', x: 0, y: 0, rot: 0, w: 8.6, h: 2.8 })
    add({ kind: 'grille', face: 'bottom', x: 18, y: 0, rot: 0, w: 12, h: 1.4 })
    if (o.stereo) add({ kind: 'grille', face: 'top', x: -16, y: 0, rot: 0, w: 8, h: 1.2 })
    return
  }
  const mid = -width / 4
  const onBack: Add = (p) => add({ ...p, x: p.x + mid })
  rearCameras(width / 2, height, o, onBack)
  addLogo(o, onBack, -4)
  // the camera for the inner screen sits over the right-hand half, clear of the fold
  frontCamera(body, o, add, width / 4)
  // and the cover screen has one of its own, near its top
  const cov = coverScreen(body)
  const level = Math.max(0, o.sensor - 1)
  add({ kind: 'camera', face: 'back', x: cov.x, y: cov.y + cov.h / 2 - 5, rot: 0, w: selfieMinDia(level) + 0.4, h: selfieMinDia(level) + 0.4, sensor: level, lens: 'wide' })
  const scr = screenRect(body)
  if (o.fingerprint === 'display') add({ kind: 'fingerprint', face: 'front', x: width / 4, y: scr.cy - scr.h * 0.3, rot: 0, w: 8, h: 8 })
  else if (o.fingerprint === 'back') onBack({ kind: 'fingerprint', face: 'back', x: 0, y: 22, rot: 0, w: 9, h: 9 })
  else if (o.fingerprint === 'side') add({ kind: 'fingerprint', face: 'right', x: 2, y: 0, rot: 0, w: 11, h: 2.2 })
  add({ kind: 'button', face: 'right', x: 22, y: 0, rot: 0, w: 11, h: 2.2 })
  add({ kind: 'button', face: 'right', x: 44, y: 0, rot: 0, w: 19, h: 2.2 })
  add({ kind: 'port', face: 'bottom', x: width / 4, y: 0, rot: 0, w: 8.6, h: 2.8 })
  add({ kind: 'grille', face: 'bottom', x: width / 4 + 18, y: 0, rot: 0, w: 12, h: 1.4 })
  if (o.stereo) add({ kind: 'grille', face: 'top', x: -width / 4, y: 0, rot: 0, w: 12, h: 1.4 })
}

/** A headset: tracking cameras in mirrored pairs on the front plate, a button and a vent on top, ports underneath. */
function layoutHeadset(body: Body, o: LayoutOptions, add: Add) {
  const { width, height, thickness: depth } = body
  const pairs = clamp(Math.round(o.cams / 2), 1, 3)
  const level = Math.max(0, o.sensor)
  const dia = selfieMinDia(level) + 5.5
  // lower corners first, then upper corners, then a pair near the middle looking down at the hands
  const spots = [[0.36, -0.22], [0.36, 0.24], [0.14, -0.3]]
  for (let i = 0; i < pairs; i++) {
    for (const side of [-1, 1]) add({ kind: 'camera', face: 'front', x: side * width * spots[i][0], y: height * spots[i][1], rot: 0, w: dia, h: dia, sensor: level, lens: 'wide' })
  }
  if (o.flash) add({ kind: 'light', face: 'front', x: 0, y: height * 0.3, rot: 0, w: 14, h: 1.4, color: '#ffffff' })
  if (o.logoImage) add({ kind: 'logo', face: 'front', x: 0, y: 0, rot: 0, w: 16, h: 16, text: o.logo, useImage: true })
  else if (o.logo) add({ kind: 'logo', face: 'front', x: 0, y: 0, rot: 0, w: Math.min(64, 6.4 * o.logo.length + 6), h: 8, text: o.logo })
  add({ kind: 'button', face: 'top', x: width * 0.28, y: 0, rot: 0, w: 12, h: 5 })
  add({ kind: 'vent', face: 'top', x: 0, y: 0, rot: 0, w: width * 0.3, h: Math.min(12, depth * 0.2) })
  add({ kind: 'port', face: 'bottom', x: width * 0.26, y: 0, rot: 0, w: 8.6, h: 2.8, text: 'usbc' })
  sockets('headset', o.io, 'bottom').forEach(({ info, id }, i) => add({ kind: 'port', face: 'bottom', x: -width * 0.26 + i * 16, y: 0, rot: 0, w: info.size![0], h: info.size![1], text: id }))
  // the volume rocker
  add({ kind: 'button', face: 'bottom', x: 0, y: 0, rot: 0, w: 18, h: 4.5 })
}

/** A speaker: a light ring and three buttons on top; the power inlet, any sockets and the badge on the flat panel at the back. */
function layoutSpeaker(body: Body, o: LayoutOptions, add: Add) {
  const top = faceSize(body, 'top', 'speaker')
  if (o.flash) add(lightRing(body, { kind: 'light' as const, face: 'top' as const, rot: 0 }))
  const size = Math.round(clamp(top.w * 0.17, 5, 10) * 2) / 2
  for (const k of [-1, 0, 1]) add({ kind: 'button', face: 'top', x: k * size * 1.9, y: 0, rot: 0, w: size, h: size })
  const back = faceSize(body, 'back', 'speaker')
  const placed = speakerSockets(body, o.io)
  for (const p of placed.sockets) add({ kind: 'port', face: 'back', x: p.x, y: p.y, rot: 0, w: p.w, h: p.h, text: p.id })
  // the badge goes above them, if the panel is tall enough
  const room = back.h / 2 - 2 - placed.top
  if (o.logoImage && room >= 14) add({ kind: 'logo', face: 'back', x: 0, y: placed.top + room / 2, rot: 0, w: 12, h: 12, text: o.logo, useImage: true })
  else if (!o.logoImage && o.logo && room >= 8) add({ kind: 'logo', face: 'back', x: 0, y: placed.top + Math.min(room / 2, 8), rot: 0, w: Math.min(back.w - 4, 4.2 * o.logo.length + 4), h: Math.min(6, room - 2), text: o.logo })
}

/**
 * A handheld. The sticks, buttons, triggers and grips are part of the model, so
 * the parts are what goes between them: buttons, vents and sockets along the
 * top, the charging port and speakers underneath, an intake and the badge on the back.
 */
function layoutHandheld(body: Body, o: LayoutOptions, add: Add) {
  const { width, height, thickness } = body
  if (o.flash && body.bezelBottom >= 3.2) {
    const dot = Math.min(1.8, body.bezelBottom * 0.45)
    add({ kind: 'light', face: 'front', x: 0, y: -height / 2 + body.bezelBottom / 2, rot: 0, w: dot, h: dot, color: '#8dffa8' })
  }
  if (o.logoImage) add({ kind: 'logo', face: 'back', x: 0, y: height * 0.16, rot: 0, w: 22, h: 22, text: o.logo, useImage: true })
  else if (o.logo) add({ kind: 'logo', face: 'back', x: 0, y: height * 0.16, rot: 0, w: Math.min(width - 2 * GRIP - 16, 7 * o.logo.length + 6), h: 9, text: o.logo })
  add({ kind: 'vent', face: 'back', x: 0, y: -height * 0.18, rot: 0, w: Math.min(width - 2 * GRIP - 24, width * 0.28), h: height * 0.14 })
  // along the top, between the shoulder buttons: volume, sockets either side of the exhaust, power
  const free = width - 2 * SHOULDER - 6
  const ports = sockets('handheld', o.io, 'top')
  const gap = 6
  const fixed = 18 + 10 + ports.reduce((a, p) => a + p.info.size![0], 0) + gap * (ports.length + 2)
  const vent = clamp(free - fixed, 14, width * 0.2)
  const row: { w: number; h: number; kind: 'button' | 'port' | 'vent'; text?: string }[] = [
    { w: 18, h: 2.6, kind: 'button' },
    ...ports.slice(0, 1).map((p) => ({ w: p.info.size![0], h: p.info.size![1], kind: 'port' as const, text: p.id })),
    { w: vent, h: Math.min(6, thickness * 0.34), kind: 'vent' },
    ...ports.slice(1).map((p) => ({ w: p.info.size![0], h: p.info.size![1], kind: 'port' as const, text: p.id })),
    { w: 10, h: 2.6, kind: 'button' },
  ]
  let x = -(row.reduce((a, p) => a + p.w, 0) + gap * (row.length - 1)) / 2
  for (const p of row) {
    add({ kind: p.kind, face: 'top', x: x + p.w / 2, y: 0, rot: 0, w: p.w, h: p.h, text: p.text })
    x += p.w + gap
  }
  add({ kind: 'port', face: 'bottom', x: 0, y: 0, rot: 0, w: 8.6, h: 2.8, text: 'usbc' })
  sockets('handheld', o.io, 'bottom').forEach(({ info, id }, i) => add({ kind: 'port', face: 'bottom', x: 22 + i * 20, y: 0, rot: 0, w: info.size![0], h: info.size![1], text: id }))
  add({ kind: 'grille', face: 'bottom', x: width * 0.26, y: 0, rot: 0, w: 16, h: 1.4 })
  add({ kind: 'grille', face: 'bottom', x: -width * 0.26, y: 0, rot: 0, w: 16, h: 1.4 })
}

/** An e-reader: the power key and the charging port along the bottom edge, the badge on the back. */
function layoutEreader(body: Body, o: LayoutOptions, add: Add) {
  const { width, height } = body
  add({ kind: 'button', face: 'bottom', x: width * 0.3, y: 0, rot: 0, w: 9, h: 2.4 })
  add({ kind: 'port', face: 'bottom', x: 0, y: 0, rot: 0, w: 8.6, h: 2.8, text: 'usbc' })
  if (o.flash && body.bezelBottom >= 3.2) {
    const dot = Math.min(1.6, body.bezelBottom * 0.4)
    add({ kind: 'light', face: 'front', x: width * 0.3, y: -height / 2 + body.bezelBottom / 2, rot: 0, w: dot, h: dot, color: '#ffb35a' })
  }
  addLogo(o, add, height * 0.12, 1.1)
}

/** A ring: the sensor window on the inside of the band, against the finger, and the name engraved round the outside. */
function layoutRing(body: Body, o: LayoutOptions, add: Add) {
  const band = body.height
  add({ kind: 'island', face: 'back', x: 0, y: 0, rot: 0, w: 7, h: Math.max(2, band - 3), r: 1.2, finish: 'black' })
  if (o.logo && !o.logoImage) add({ kind: 'logo', face: 'front', x: 0, y: 0, rot: 0, w: Math.min(body.width * 0.55, 1.5 * o.logo.length + 2), h: Math.min(2.4, band * 0.3), text: o.logo })
}

/**
 * An action camera. The back is the lens side: the lens in its square housing to one side, leaving room beside it
 * for the selfie screen. The shutter and the recording light are on top, the door for the battery and the port on
 * the right, the microphones underneath and the badge down the left side.
 */
function layoutActioncam(body: Body, o: LayoutOptions, add: Add) {
  const { width, height, thickness } = body
  const housing = Math.min(height - 6, width * 0.5, 34)
  const cx = width / 2 - housing / 2 - 3
  add({ kind: 'island', face: 'back', x: cx, y: 0, rot: 0, w: housing, h: housing, r: housing * 0.22, finish: 'black' })
  const dia = Math.min(housing - 5, sensorInfo(o.sensor).minDia + 6)
  add({ kind: 'camera', face: 'back', x: cx, y: 0, rot: 0, w: dia, h: dia, sensor: o.sensor, lens: 'wide' })
  // the recording light sits level with the lens, between the housing and the selfie screen
  if (o.flash) add({ kind: 'light', face: 'back', x: (cx - housing / 2 + selfieScreen(body).x + selfieScreen(body).w / 2) / 2, y: 0, rot: 0, w: 2.2, h: 2.2, color: '#ff3b30' })
  add({ kind: 'button', face: 'top', x: -width * 0.16, y: 0, rot: 0, w: 11, h: Math.min(9, thickness - 6) })
  add({ kind: 'button', face: 'right', x: height * 0.2, y: 0, rot: 0, w: 7, h: 3 })
  add({ kind: 'port', face: 'right', x: -height * 0.16, y: 0, rot: 0, w: 8.6, h: 2.8, text: 'usbc' })
  add({ kind: 'grille', face: 'bottom', x: -width * 0.2, y: 0, rot: 0, w: 8, h: 1.2 })
  add({ kind: 'grille', face: 'top', x: width * 0.12, y: 0, rot: 0, w: 6, h: 1.2 })
  if (o.logo && !o.logoImage) add({ kind: 'logo', face: 'left', x: 0, y: 0, rot: 0, w: Math.min(height * 0.62, 2.8 * o.logo.length + 2), h: Math.min(4, thickness * 0.2), text: o.logo })
}

/** A drone: the gimbal camera under the nose, the badge and the power button on top, the port and the tail light at the back. */
function layoutDrone(body: Body, o: LayoutOptions, add: Add) {
  const { width, height, thickness: length } = body
  const dia = sensorInfo(o.sensor).minDia + 3
  add({ kind: 'camera', face: 'front', x: 0, y: -height * 0.12, rot: 0, w: dia, h: dia, sensor: o.sensor, lens: 'wide' })
  if (o.logoImage) add({ kind: 'logo', face: 'top', x: 0, y: length * 0.06, rot: 0, w: 14, h: 14, text: o.logo, useImage: true })
  else if (o.logo) add({ kind: 'logo', face: 'top', x: 0, y: length * 0.06, rot: 0, w: Math.min(width * 0.6, 4.4 * o.logo.length + 4), h: 6, text: o.logo })
  add({ kind: 'button', face: 'top', x: 0, y: length * 0.3, rot: 0, w: 6, h: 6 })
  add({ kind: 'vent', face: 'bottom', x: 0, y: 0, rot: 0, w: width * 0.4, h: length * 0.22 })
  add({ kind: 'port', face: 'back', x: 0, y: -height * 0.22, rot: 0, w: 8.6, h: 2.8, text: 'usbc' })
  if (o.flash) add({ kind: 'light', face: 'back', x: 0, y: height * 0.18, rot: 0, w: Math.min(16, width * 0.3), h: 1.6, color: '#ff4d3d' })
}

/** Fit a speaker to its body: the best drivers its enclosure has room for, and no more sockets than its back panel holds. */
export function fitSpeaker(d: DeviceDesign) {
  if (d.type !== 'speaker') return
  const litres = speakerShape(d.body).litres
  let i = clamp(d.specs.driver ?? 0, 0, SPEAKER_DRIVERS.length - 1)
  while (i > 0 && SPEAKER_DRIVERS[i].litres > litres) i--
  d.specs.driver = i
  // the largest socket goes first
  const io = d.specs.io
  while (io && !speakerSockets(d.body, io).fits) {
    const big = io.filter((id) => ioInfo('speaker', id)?.size).sort((a, b) => ioInfo('speaker', b)!.size![0] - ioInfo('speaker', a)!.size![0])[0]
    if (!big) break
    io.splice(io.indexOf(big), 1)
  }
}

export interface GenOptions {
  segment: SegmentId
  levels: Levels
  mLevel: number
  layout: number
  palette: string[]
  logo: string
  logoImage?: boolean
  /** Foldables: make it a flip, or a book. Left out, some makers' everyday foldables are flips. */
  flip?: boolean
}

const largestAtMost = (opts: number[], v: number) => opts.filter((o) => o <= v).pop() ?? opts[0]
const half = (v: number) => Math.round(v * 2) / 2
/** The option wanted, or the best one below it that the research level allows. */
function bestOwned(list: { level: number }[], want: number, level: number): number {
  let i = clamp(want, 0, list.length - 1)
  while (i > 0 && list[i].level > level) i--
  return i
}

/**
 * Make room for what a mains-powered design carries: speakers need depth, and
 * hot chips need volume. Thickens the body first, then fits better cooling,
 * then a smaller graphics card.
 */
export function fitInside(d: DeviceDesign, levels: Levels) {
  const T = TYPES[d.type]
  if (!T.mains) return
  const b = d.body
  const s = d.specs
  if (T.mains.sound) b.thickness = Math.max(b.thickness, SPEAKERS[s.speakers ?? 0].thick)
  const hot = () => (thermal(d)?.headroom ?? 1) < 0.9
  const step = Math.max(0.5, Math.round((T.maxThickness - minThickness(d.type, levels.design, s)) / 40))
  for (let guard = 0; guard < 200 && hot(); guard++) {
    const coolers = coolersFor(d.type)
    const pc = d.type === 'tower' ? caseOf(b) : null
    // a tower is cooled by its fans and its cooler before it is made any bigger
    if (pc && pc.fans < maxFans(b, pc.fanSize)) b.pc = { ...pc, fans: pc.fans + 1 }
    else if (pc && (s.cooling ?? 0) < coolers.length - 1 && coolers[(s.cooling ?? 0) + 1].level <= levels.materials) s.cooling = (s.cooling ?? 0) + 1
    else if (b.thickness + step <= T.maxThickness) b.thickness = Math.round((b.thickness + step) * 10) / 10
    else if ((s.cooling ?? 0) < coolers.length - 1 && coolers[(s.cooling ?? 0) + 1].level <= levels.materials) s.cooling = (s.cooling ?? 0) + 1
    else if ((s.gpu ?? 0) > 0) s.gpu = (s.gpu ?? 0) - 1
    else break
  }
}

export function generateDesign(r: RngHolder, o: GenOptions): DeviceDesign {
  const seg = segmentInfo(o.segment)
  const type = seg.type
  const T = TYPES[type]
  const t = TIERS[o.segment]
  const L = (track: keyof Levels, drop = t.drop) => clamp(o.levels[track] - drop, 0, 8)
  const dLevel = o.levels.design

  const frac = t.size ?? [0.4, 0.4]
  // a display on a stand keeps its shape, so both of its sides vary together
  const together = type === 'desktop' || type === 'tv' || type === 'monitor' || type === 'tower' ? range(r, -0.04, 0.04) : null
  const dim = (range3: [number, number, number], f: number) => half(clamp(range3[0] + (range3[1] - range3[0]) * (f + (together ?? range(r, -0.08, 0.08))), range3[0], range3[1]))
  // the everyday foldable is a flip for the makers whose house style says so; the dearer ones are books
  const flip = type === 'foldable' && (o.flip ?? (o.segment === 'f-value' && ((o.layout % 3) + 3) % 3 === 1))
  const lim = sizeLimits(type, flip ? 'flip' : undefined)
  const width = type === 'phone' ? half(range(r, 70.5, 77.5)) : dim(lim.width, frac[0])
  const height = type === 'phone' ? half(range(r, 150, 166)) : dim(lim.height, frac[1])
  const matLevel = L('materials')
  const frames = MATERIALS.filter((m) => m.use !== 'back' && m.level <= matLevel)
  // an earbud case is moulded or machined, never glass
  const backs = MATERIALS.filter((m) => m.use !== 'frame' && m.level <= matLevel && (type === 'earbuds' ? m.use === 'both' : type !== 'laptop' || m.id !== 'glass'))
  const byRank = <T,>(list: T[]) => list[Math.round(((list.length - 1) * t.matRank) / 2)]
  const color = pick(r, o.palette)
  const bez = Math.round(Math.max(minBezel(type, dLevel), minBezel(type, L('design')) * t.bezel) * 10) / 10
  const straps = STRAPS.filter((x) => x.level <= matLevel)
  const corner =
    type === 'watch'
      ? o.layout % 2 === 1
        ? Math.min(width, height) / 2
        : Math.round(range(r, 9, 14))
      : type === 'laptop'
        ? Math.round(range(r, 5, 11))
        : type === 'tv'
          ? Math.round(range(r, 3, 9))
          : type === 'console'
            ? Math.min(Math.round(range(r, 4, 18)), Math.floor(Math.min(width, height) / 2 - 2))
            : type === 'tower'
              ? Math.round(range(r, 2, 9))
              : type === 'mouse'
                ? 12
            : type === 'headset' || type === 'speaker'
              ? Math.round(range(r, 18, 30))
              : type === 'handheld'
                ? Math.round(range(r, 10, 18))
                : type === 'actioncam'
                  ? Math.round(range(r, 4, 8))
                  : type === 'ring'
                    ? Math.round(range(r, 1, 2))
                    : Math.round(range(r, 7, 13))

  const body: Body = {
    width,
    height,
    thickness: 0,
    corner,
    edge: int(r, 0, 1) === 1 ? 'flat' : 'round',
    bezelTop: type === 'laptop' ? Math.max(bez, t.matRank >= 2 ? bez : 6) : bez,
    bezelBottom: type === 'laptop' ? Math.round(bez * 22) / 10 : type === 'desktop' ? Math.max(bez, t.chin ?? 0) : type === 'tv' ? Math.round(bez * 16) / 10 : o.segment === 'budget' ? Math.round(bez * 13) / 10 : bez,
    bezelSide: bez + (T.flank ?? 0),
    frameMat: byRank(frames).id,
    backMat: T.oneShell ? byRank(frames).id : byRank(backs).id,
    frameColor: shade(color, 0.92),
    backColor: color,
    backFinish: int(r, 0, 1) === 1 ? 'gloss' : 'matte',
  }
  if (type === 'watch') {
    body.strap = byRank(straps).id
    body.strapColor = pick(r, ['#1b1d21', '#3a3f47', '#6b5a48', '#d8d3ca', color])
  }
  if (type === 'laptop' || type === 'desktop' || type === 'tv' || type === 'monitor' || type === 'mouse') body.backFinish = 'matte'
  if (type === 'desktop' || type === 'tv' || type === 'monitor') body.stand = t.stand
  if (type === 'tower') {
    body.pc = { ...DEFAULT_CASE, ...t.pc }
    // a glass-sided case is dark inside, whatever colour its shell
    if (t.rgb) body.rgb = { zones: ['fans', 'ram', 'gpu', 'cooler', 'strip'], color: pick(r, ['#ff3df2', '#3dd6ff', '#ff6b1a', '#7d5cf0']), color2: '#3d7be0', effect: pick(r, ['wave', 'cycle', 'static'] as const) }
    else body.rgb = { ...DEFAULT_RGB }
  }
  if (type === 'mouse') {
    body.grip = t.grip ?? 'ergo'
    body.rgb = t.rgb ? { zones: ['wheel', 'logo'], color: pick(r, ['#3dd6ff', '#ff3df2', '#ff6b1a']), color2: '#7d5cf0', effect: 'cycle' } : { ...DEFAULT_RGB }
  }
  if (type === 'earbuds') body.buds = t.buds ?? 'stem'
  if (type === 'console' || type === 'headset') {
    // a dark glossy front panel set into the shell
    body.backColor = '#0d0e10'
    body.backFinish = 'gloss'
  }
  if (type === 'headset') body.strap = headStrap(t.strap).level <= o.levels.materials ? headStrap(t.strap).id : 'rigid'
  if (type === 'speaker') {
    body.form = (['column', 'orb', 'block'] as const)[((o.layout % 3) + 3) % 3]
    body.screen = !!t.screen
    body.backFinish = 'matte'
  }
  if (type === 'handheld' || type === 'actioncam' || type === 'drone') body.backFinish = 'matte'
  // a reader is bought to be held for hours: grippy, never a fingerprint magnet
  if (type === 'ereader' && body.backMat === 'glass') body.backMat = 'plastic'
  if (flip) {
    body.fold = 'flip'
    body.cover = dLevel >= 4 ? 2 : t.matRank >= 1 ? 1 : 0
  }

  const memory = T.memory || 1
  const design: DeviceDesign = {
    type,
    wallpaper: int(r, 0, 5),
    body,
    parts: [],
    specs: {
      panel: L('display', o.segment === 'gamer' || o.segment === 'l-game' ? 0 : t.drop),
      refresh: 60,
      chipGen: L('chipset', t.chipTier === 0 ? 1 : 0),
      chipTier: t.chipTier,
      ram: T.memory ? largestAtMost(RAM_OPTIONS, idealRam(o.mLevel) * memory * [0.6, 0.9, 1.4][t.chipTier] * (o.segment === 'gamer' ? 1.3 : 1)) : 2,
      storage: T.memory ? largestAtMost(STORAGE_OPTIONS, idealStorage(o.mLevel) * memory * [0.6, 1, 1.8][t.chipTier]) : 64,
      battery: 0,
      charging: T.mains ? 0 : clamp(L('charging'), 0, CHARGE_W.length - 1),
      extras: type === 'phone' || type === 'watch' || type === 'foldable' ? ['nfc'] : [],
    },
  }
  const s = design.specs
  if (T.gpu) s.gpu = t.gpu ?? 0
  if (T.input) s.keyboard = bestOwned(inputOptions(type), t.keyboard ?? 0, o.levels.design)
  if (ioOptions(type).length) {
    const known = ioOptions(type).filter((x) => x.level <= o.levels.chipset)
    s.io = known.slice(0, t.ioShare !== undefined ? Math.ceil(known.length * t.ioShare) : (t.io ?? 3)).map((x) => x.id)
  }
  if (T.mains?.cool) s.cooling = bestOwned(coolersFor(type), t.cooling ?? 0, o.levels.materials)
  if (type === 'tower') s.psu = bestOwned(PSUS, t.psu ?? 1, o.levels.charging)
  if (T.mains?.sound) s.speakers = bestOwned(SPEAKERS, t.speakers ?? 0, o.levels.design)
  if (type === 'earbuds') {
    s.driver = bestOwned(DRIVERS, t.driver ?? 0, o.levels.materials)
    s.anc = bestOwned(ANC, t.anc ?? 0, L('chipset'))
    if (!s.anc) s.io = s.io?.filter((id) => id !== 'through')
  }
  if (type === 'foldable') s.hinge = bestOwned(HINGES, t.hinge ?? 0, matLevel)
  if (type === 'headset') s.optics = bestOwned(OPTICS, t.optics ?? 0, L('display'))
  if (type === 'speaker') {
    s.driver = bestOwned(SPEAKER_DRIVERS, t.driver ?? 0, o.levels.materials)
    s.mics = bestOwned(MIC_ARRAYS, t.mics ?? 0, L('chipset'))
    if (!body.screen) s.panel = 0
  }
  // each half of a flip is a little thicker than a book's, as it has half the area for the same parts
  body.thickness = Math.round((minThickness(type, dLevel, s) + t.thick + range(r, 0, type === 'ring' ? 0.1 : 0.5) + (flip ? 1.2 : 0)) * 10) / 10
  if (type === 'speaker') {
    // as deep as it is wide, or a little shallower if it is a block
    body.thickness = clamp(half(body.form === 'block' ? width * 0.74 : width), minThickness(type, dLevel, s), T.maxThickness)
    fitSpeaker(design)
  }
  if (type === 'earbuds') body.corner = Math.min(body.corner, Math.floor(body.thickness / 2))
  if (type === 'console' && Math.max(width, height) < 132) s.io = s.io?.filter((id) => id !== 'disc')
  if (type === 'earbuds' || type === 'ring') s.panel = 0
  // a mouse with no radio is wired, and carries no battery
  const wiredMouse = type === 'mouse' && !(s.io ?? []).includes('wireless') && !(s.io ?? []).includes('bt')
  if (type !== 'watch' && type !== 'earbuds' && !NO_REFRESH.includes(type) && !(type === 'speaker' && !body.screen)) s.refresh = REFRESH.filter((x) => x.level <= s.panel).pop()!.hz
  fitInside(design, o.levels)
  const fill = o.segment === 'gamer' || o.segment === 'business' || type === 'watch' || type === 'ring' ? 0.98 : 0.9
  const bStep = batteryStep(type)
  s.battery = wiredMouse ? 0 : Math.round((maxBattery(body, o.levels.battery, type) * fill) / bStep) * bStep
  const fits = (id: string) => T.extras.includes(id)
  if (t.matRank >= 1 && fits('stereo')) s.extras.push('stereo')
  if (o.levels.materials >= 1 && t.matRank >= 1 && fits('ip68')) s.extras.push('ip68')
  if (o.levels.charging >= 2 && (t.matRank >= 2 || type === 'watch') && fits('wireless')) s.extras.push('wireless')
  if (o.levels.chipset >= 4 && o.segment === 'flagship') s.extras.push('sat')
  // the thing its buyers ask for most, a maker fits once the research behind it is well established
  let wanted = 0
  for (const e of EXTRAS) {
    if (wanted >= 1) break
    if (!fits(e.id) || s.extras.includes(e.id) || (e.likes[o.segment] ?? 0) < 0.03 || o.levels[e.track] < e.level + 2) continue
    if (e.group && s.extras.some((x) => extraInfo(x)?.group === e.group)) continue
    if (e.needs && !s.extras.includes(e.needs)) continue
    s.extras.push(e.id)
    wanted++
  }

  // for an action camera or a drone the camera is the product, so it is as good as the tier allows
  const camLevel = L('camera', o.segment === 'camera' ? 0 : o.segment === 'gamer' || (type !== 'phone' && type !== 'foldable' && type !== 'actioncam' && type !== 'drone') ? 2 : t.drop)
  design.parts = layoutParts(body, {
    type,
    layout: type === 'tablet' ? [0, 1, 2][o.layout % 3] : o.layout,
    cams: t.cams,
    sensor: camLevel,
    periscope: camLevel >= 3,
    front: dLevel >= 5 && o.segment === 'flagship' ? 'under' : dLevel >= 1 ? 'punch' : 'notch',
    fingerprint: type === 'tablet' || type === 'foldable' ? 'side' : dLevel >= 2 && t.matRank >= 1 ? 'display' : 'side',
    flash: true,
    stereo: s.extras.includes('stereo'),
    logo: o.logo,
    logoImage: !!o.logoImage,
    io: s.io,
  })
  return design
}

// ---------------------------------------------------------------- variants

export const VARIANTS = [
  { id: 'Pro', note: 'Faster chip, more memory, the best screen and materials you own.' },
  { id: 'Lite', note: 'Cheaper chip, screen and materials; drops the extra cameras.' },
  { id: 'Max', note: 'A larger body with a bigger screen and battery.' },
  { id: 'Mini', note: 'A smaller body. Less battery, easier to hold.' },
  { id: 'Ultra', note: 'Pro and Max combined.' },
] as const
export type VariantId = (typeof VARIANTS)[number]['id']

/** A new design derived from an existing one. The player can still edit it afterwards. */
export function deriveVariant(base: DeviceDesign, variant: VariantId, levels: Levels, feats: string[]): DeviceDesign {
  const d: DeviceDesign = JSON.parse(JSON.stringify(base))
  const T = TYPES[d.type]
  const s = d.specs
  const step = (opts: number[], v: number, by: number) => opts[clamp(opts.indexOf(largestAtMost(opts, v)) + by, 0, opts.length - 1)]
  const hasRefresh = d.type !== 'watch' && d.type !== 'earbuds' && !NO_REFRESH.includes(d.type)
  const bestRefresh = () => REFRESH.filter((x) => x.level <= s.panel && (!x.feat || feats.includes(x.feat))).pop()!.hz
  const scale = (f: number) => {
    const b = d.body
    const lim = sizeLimits(d.type, b.fold)
    b.width = half(clamp(b.width * f, lim.width[0], lim.width[1]))
    b.height = half(clamp(b.height * f, lim.height[0], lim.height[1]))
    // a speaker grows in every direction
    if (d.type === 'speaker') b.thickness = half(clamp(b.thickness * f, minThickness(d.type, levels.design, s), T.maxThickness))
    for (const p of d.parts) {
      p.x *= f
      p.y *= f
    }
  }
  if (variant === 'Pro' || variant === 'Ultra') {
    if (!s.customChip) s.chipTier = Math.min(2, s.chipTier + 1)
    s.chipGen = Math.max(s.chipGen, levels.chipset)
    if (T.memory) {
      s.ram = step(RAM_OPTIONS, s.ram, 1)
      s.storage = step(STORAGE_OPTIONS, s.storage, 1)
    }
    if (d.type !== 'earbuds') s.panel = Math.min(levels.display, s.panel + 1)
    if (hasRefresh) s.refresh = bestRefresh()
    if (!T.mains) s.charging = Math.min(levels.charging, s.charging + 1)
    const frames = MATERIALS.filter((m) => m.use !== 'back' && m.level <= levels.materials)
    const backs = MATERIALS.filter((m) => m.use !== 'frame' && m.level <= levels.materials && (d.type === 'earbuds' ? m.use === 'both' : d.type !== 'laptop' || m.id !== 'glass'))
    d.body.frameMat = frames[frames.length - 1].id
    d.body.backMat = T.oneShell ? d.body.frameMat : backs[backs.length - 1].id
    for (const p of d.parts) if (p.kind === 'camera' && p.face === 'back' && (p.lens ?? 'wide') === 'wide') p.sensor = levels.camera
    if (T.gpu) s.gpu = Math.min(3, (s.gpu ?? 0) + 1)
    if (T.mains?.cool) s.cooling = bestOwned(COOLERS, (s.cooling ?? 0) + 1, levels.materials)
    if (T.mains?.sound) s.speakers = bestOwned(SPEAKERS, (s.speakers ?? 0) + 1, levels.design)
    if (d.type === 'earbuds') {
      s.driver = bestOwned(DRIVERS, (s.driver ?? 0) + 1, levels.materials)
      s.anc = bestOwned(ANC, (s.anc ?? 0) + 1, levels.chipset)
    }
    if (d.type === 'foldable') s.hinge = bestOwned(HINGES, (s.hinge ?? 0) + 1, levels.materials)
    if (d.type === 'headset') s.optics = bestOwned(OPTICS, (s.optics ?? 0) + 1, levels.display)
    if (d.type === 'speaker') {
      s.driver = bestOwned(SPEAKER_DRIVERS, (s.driver ?? 0) + 1, levels.materials)
      s.mics = bestOwned(MIC_ARRAYS, (s.mics ?? 0) + 1, levels.chipset)
    }
    if (T.input === 'wands' || T.input === 'controls') s.keyboard = bestOwned(inputOptions(d.type), (s.keyboard ?? 0) + 1, levels.design)
  }
  if (variant === 'Lite') {
    if (!s.customChip) s.chipTier = Math.max(0, s.chipTier - 1)
    if (T.memory) {
      s.ram = step(RAM_OPTIONS, s.ram, -1)
      s.storage = step(STORAGE_OPTIONS, s.storage, -1)
    }
    s.panel = Math.max(0, s.panel - 1)
    if (hasRefresh) s.refresh = Math.min(s.refresh, 90) === 90 && feats.includes('hz90') && s.panel >= 1 ? 90 : 60
    s.charging = Math.max(0, s.charging - 1)
    s.extras = s.extras.filter((e) => e !== 'wireless' && e !== 'reverse' && e !== 'sat' && e !== 'mmwave')
    d.body.frameMat = d.body.frameMat === 'plastic' ? 'plastic' : 'aluminium'
    d.body.backMat = T.oneShell ? d.body.frameMat : 'plastic'
    d.parts = d.parts.filter((p) => !(p.kind === 'camera' && p.face === 'back' && (p.lens === 'tele' || p.lens === 'periscope' || p.lens === 'macro')))
    for (const p of d.parts) if (p.kind === 'camera') p.sensor = Math.max(0, (p.sensor ?? 0) - 1)
    if (T.gpu) s.gpu = Math.max(0, (s.gpu ?? 0) - 1)
    if (T.mains?.sound) s.speakers = Math.max(0, (s.speakers ?? 0) - 1)
    if (d.type === 'earbuds') {
      s.driver = Math.max(0, (s.driver ?? 0) - 1)
      s.anc = Math.max(0, (s.anc ?? 0) - 1)
      if (!s.anc) s.io = s.io?.filter((id) => id !== 'through')
    }
    if (d.type === 'foldable') s.hinge = Math.max(0, (s.hinge ?? 0) - 1)
    if (d.type === 'headset') s.optics = Math.max(0, (s.optics ?? 0) - 1)
    if (d.type === 'speaker') {
      s.driver = Math.max(0, (s.driver ?? 0) - 1)
      s.mics = Math.max(0, (s.mics ?? 0) - 1)
    }
    // a headset keeps its controllers, or it would need hand tracking instead
    if (T.input === 'controls') s.keyboard = Math.max(0, (s.keyboard ?? 0) - 1)
  }
  if (variant === 'Max' || variant === 'Ultra') scale(1.07)
  if (variant === 'Mini') scale(0.92)
  d.body.thickness = Math.max(d.body.thickness, minThickness(d.type, levels.design, s))
  fitInside(d, levels)
  const before = [...(s.io ?? [])]
  fitSpeaker(d)
  // a socket the smaller body no longer has room for goes, and so does its hole
  if (before.length !== (s.io ?? []).length) d.parts = syncSockets(d, before)
  d.parts = d.parts.map((p) => clampPart(d.body, p, d.type))
  const cap = maxBattery(d.body, levels.battery, d.type)
  const bStep = batteryStep(d.type)
  s.battery = variant === 'Max' || variant === 'Ultra' ? Math.round((cap * 0.92) / bStep) * bStep : Math.min(s.battery, cap)
  return d
}

/** Multiply a hex colour's brightness. */
export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (v: number) => clamp(Math.round(v * f), 0, 255)
  const out = (ch((n >> 16) & 255) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)
  return '#' + out.toString(16).padStart(6, '0')
}
