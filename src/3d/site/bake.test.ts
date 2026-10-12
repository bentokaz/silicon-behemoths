import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { describe, expect, it } from 'vitest'
import { GLOW_STEPS, type Lean, chamferBox, facet, leanOf, pack, weld } from './bake'

const part = (lean: Lean, at = new THREE.Matrix4(), extra = {}) => ({ lean, at: at.elements, hex: 0x336699, rough: 0.5, metal: 0.25, glow: 0, power: 0, ...extra })

/** Every edge of a closed surface is used by exactly two triangles, once in each direction. */
function closed(l: Lean): boolean {
  const key = (i: number) => `${Math.round(l.position[i * 3] * 1e4)},${Math.round(l.position[i * 3 + 1] * 1e4)},${Math.round(l.position[i * 3 + 2] * 1e4)}`
  const edges = new Map<string, number>()
  for (let i = 0; i < l.index.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = key(l.index[i + k])
      const b = key(l.index[i + ((k + 1) % 3)])
      if (a === b) continue
      edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1)
    }
  }
  for (const [e, n] of edges) {
    const [a, b] = e.split('>')
    if (n !== 1 || edges.get(`${b}>${a}`) !== 1) return false
  }
  return true
}

/** Volume enclosed by the triangles: positive when they all face outward. */
function volume(position: ArrayLike<number>, index: ArrayLike<number>): number {
  let v = 0
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = [index[i] * 3, index[i + 1] * 3, index[i + 2] * 3]
    v += position[a] * (position[b + 1] * position[c + 2] - position[b + 2] * position[c + 1]) + position[a + 1] * (position[b + 2] * position[c] - position[b] * position[c + 2]) + position[a + 2] * (position[b] * position[c + 1] - position[b + 1] * position[c])
  }
  return v / 6
}

describe('weld', () => {
  it('reduces a softened box to its distinct corners and keeps every triangle', () => {
    const g = new RoundedBoxGeometry(1, 0.6, 0.4, 1, 0.02)
    const lean = leanOf(g, false)!
    expect(g.attributes.position.count).toBe(324)
    expect(lean.position.length / 3).toBe(56)
    expect(lean.index.length).toBe(324)
    expect(closed(lean)).toBe(true)
    expect(volume(lean.position, lean.index)).toBeGreaterThan(0.23)
  })
  it('keeps vertices apart that share a place but not a normal', () => {
    const g = new THREE.BoxGeometry(1, 1, 1)
    const lean = weld(g.attributes.position.array, g.attributes.normal.array, g.index!.array)
    expect(lean.position.length / 3).toBe(24)
    expect(lean.index.length).toBe(36)
  })
  it('hands back the same arrays for the same geometry', () => {
    const g = new THREE.CylinderGeometry(1, 1, 2, 8)
    expect(leanOf(g, false)).toBe(leanOf(g, false))
    expect(leanOf(g, true)).not.toBe(leanOf(g, false))
  })
})

describe('facet', () => {
  it('gives every triangle its own three vertices and the normal of its face', () => {
    const g = new THREE.IcosahedronGeometry(1, 1)
    const lean = facet(g.attributes.position.array, null)
    expect(lean.position.length / 3).toBe(240)
    for (let t = 0; t < lean.index.length; t += 3) {
      const o = t * 3
      // the face normal of a ball's triangle points away from the middle, and all three vertices share it
      const cx = lean.position[o] + lean.position[o + 3] + lean.position[o + 6]
      const cy = lean.position[o + 1] + lean.position[o + 4] + lean.position[o + 7]
      const cz = lean.position[o + 2] + lean.position[o + 5] + lean.position[o + 8]
      expect(cx * lean.normal[o] + cy * lean.normal[o + 1] + cz * lean.normal[o + 2]).toBeGreaterThan(0)
      expect([lean.normal[o + 3], lean.normal[o + 4], lean.normal[o + 5]]).toEqual([lean.normal[o], lean.normal[o + 1], lean.normal[o + 2]])
      expect(Math.hypot(lean.normal[o], lean.normal[o + 1], lean.normal[o + 2])).toBeCloseTo(1, 5)
    }
  })
})

describe('chamferBox', () => {
  it('is a closed shape of 44 triangles, all facing outward, as big as it was asked to be', () => {
    const lean = chamferBox(1.2, 0.5, 0.8, 0.02)
    expect(lean.position.length / 3).toBe(24)
    expect(lean.index.length / 3).toBe(44)
    expect(closed(lean)).toBe(true)
    const full = 1.2 * 0.5 * 0.8
    const v = volume(lean.position, lean.index)
    expect(v).toBeLessThan(full)
    expect(v).toBeGreaterThan(full * 0.99)
    const box = new THREE.Box3().setFromArray(lean.position as unknown as number[])
    expect(box.getSize(new THREE.Vector3()).toArray().map((n) => +n.toFixed(5))).toEqual([1.2, 0.5, 0.8])
    // no triangle is turned against the normals of its own corners
    for (let i = 0; i < lean.index.length; i += 3) {
      const [a, b, c] = [lean.index[i], lean.index[i + 1], lean.index[i + 2]].map((k) => new THREE.Vector3().fromArray(lean.position, k * 3))
      const face = b.clone().sub(a).cross(c.clone().sub(a))
      const sum = [lean.index[i], lean.index[i + 1], lean.index[i + 2]].reduce((acc, k) => acc.add(new THREE.Vector3().fromArray(lean.normal, k * 3)), new THREE.Vector3())
      expect(face.dot(sum)).toBeGreaterThan(0)
    }
  })
})

describe('pack', () => {
  const box = () => leanOf(new THREE.BoxGeometry(1, 2, 3), false)!
  it('puts each part where its matrix says, with its colour and finish on every vertex', () => {
    const at = new THREE.Matrix4().makeTranslation(10, 0, -4)
    const a = pack([part(box()), part(box(), at, { hex: 0xff8000, rough: 1, metal: 0, glow: 0xffe9c2, power: 1.2, alpha: 0.25 })])
    expect(a.position.length / 3).toBe(48)
    expect(a.index.length).toBe(72)
    expect(a.index).toBeInstanceOf(Uint16Array)
    expect(Math.max(...a.index)).toBe(47)
    const second = new THREE.Box3().setFromArray(Array.from(a.position.slice(72)))
    expect(second.min.toArray()).toEqual([9.5, -1, -5.5])
    expect([...a.tint.slice(0, 4)]).toEqual([0x33, 0x66, 0x99, 128])
    expect([...a.surf.slice(0, 2)]).toEqual([64, 255])
    expect([...a.glow.slice(0, 4)]).toEqual([0, 0, 0, 0])
    expect([...a.tint.slice(96, 100)]).toEqual([255, 128, 0, 255])
    expect([...a.surf.slice(96, 98)]).toEqual([0, 64])
    expect([...a.glow.slice(96, 100)]).toEqual([0xff, 0xe9, 0xc2, Math.round(1.2 * GLOW_STEPS)])
  })
  it('turns normals with the part, and keeps them at right angles to a squashed one', () => {
    const turn = new THREE.Matrix4().makeRotationY(Math.PI / 2).scale(new THREE.Vector3(1, 0.2, 1))
    const ball = leanOf(new THREE.IcosahedronGeometry(1, 2), false)!
    const a = pack([part(ball, turn)])
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(turn)
    for (let v = 0; v < ball.position.length; v += 3) {
      const want = new THREE.Vector3().fromArray(ball.normal, v).applyMatrix3(normalMatrix).normalize()
      expect(a.normal[v]).toBeCloseTo(want.x, 5)
      expect(a.normal[v + 1]).toBeCloseTo(want.y, 5)
      expect(a.normal[v + 2]).toBeCloseTo(want.z, 5)
    }
  })
  it('keeps a mirrored part facing outward', () => {
    const mirror = new THREE.Matrix4().makeScale(-1, 1, 1)
    const a = pack([part(chamferBox(1, 1, 1, 0.05), mirror)])
    expect(volume(a.position, a.index)).toBeGreaterThan(0.9)
    // and its normals still point away from the middle
    for (let v = 0; v < a.position.length; v += 3) expect(a.position[v] * a.normal[v] + a.position[v + 1] * a.normal[v + 1] + a.position[v + 2] * a.normal[v + 2]).toBeGreaterThan(0)
  })
  it('uses wide indices once there are too many vertices for narrow ones', () => {
    const many = Array.from({ length: 2800 }, () => part(box()))
    const a = pack(many)
    expect(a.index).toBeInstanceOf(Uint32Array)
    expect(a.index[a.index.length - 1]).toBeGreaterThan(65535)
  })
})
