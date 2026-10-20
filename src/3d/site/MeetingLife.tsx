// Meetings brought to life in the office view: a speech bubble over each
// table where a team is meeting, saying what about; the topic up on the
// room's presentation screens and whiteboards; and smart glass that frosts
// over round a room while something confidential is discussed, clearing
// again after. Looked at twice a second, so it costs next to nothing.
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { OfficeLife } from '../../sim/life'
import { ITEMS, gridAt } from '../../sim/sites'
import type { Site, SiteItem } from '../../sim/types'
import { Face, type Palette } from './boards'
import { campus, dayOf } from './clock'
import type { Crowd } from './crowd'
import { type MeetingNow, type Topic, glassOf, meetingTopic } from './meetings'

/** Where an item's middle stands, and its turn, in the view. */
function frame(site: Site, it: SiteItem): { p: [number, number, number]; rotY: number } {
  const d = ITEMS[site.kind][it.kind]
  const turned = it.rot % 2 === 1
  const w = turned ? d.h : d.w
  const h = turned ? d.w : d.h
  return { p: [it.x + w / 2 - site.w / 2, 0, it.y + h / 2 - site.h / 2], rotY: (-it.rot * Math.PI) / 2 }
}

/** A room's glass, frosting over or clearing: the panels, and how opaque they are now. */
function Frost({ site, room, on, height }: { site: Site; room: number; on: boolean; height: number }) {
  const panes = useMemo(() => glassOf(site, room), [site, site.rev, room]) // eslint-disable-line react-hooks/exhaustive-deps
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#eef3f6', roughness: 0.9, transparent: true, opacity: 0, depthWrite: false }), [])
  useFrame((_, dt) => {
    // a second or so to frost, a little quicker to clear
    const want = on ? 0.88 : 0
    mat.opacity += (want - mat.opacity) * Math.min(1, dt * (on ? 2.2 : 3))
  })
  if (!panes.length) return null
  return (
    <>
      {panes.map((g) => (
        <mesh key={`${g.x},${g.y},${g.side}`} material={mat} renderOrder={3} position={g.side === 'n' ? [g.x + 0.5 - site.w / 2, height / 2, g.y - site.h / 2] : [g.x - site.w / 2, height / 2, g.y + 0.5 - site.h / 2]}>
          <boxGeometry args={g.side === 'n' ? [0.96, height - 0.1, 0.07] : [0.07, height - 0.1, 0.96]} />
        </mesh>
      ))}
    </>
  )
}

export function MeetingLife({ site, crowd, office, palette, glow, height, showText }: { site: Site; crowd: Crowd | null; office: OfficeLife | undefined; palette: Palette; glow: number; /** How high the walls stand in this view. */ height: number; /** Bubbles and screens are shown (not in the outside view). */ showText: boolean }) {
  const [now, setNow] = useState<MeetingNow[]>([])
  /** Rooms whose glass was frosted, kept a moment after the meeting so it can clear. */
  const [frosted, setFrosted] = useState<number[]>([])
  const wait = useRef(0)
  const sig = useRef('')
  useFrame((_, dt) => {
    wait.current -= dt
    if (wait.current > 0 || !crowd) return
    wait.current = 0.5
    const list = crowd.meetingsNow()
    if (import.meta.env.DEV) (window as unknown as { sbMeet?: unknown }).sbMeet = { meetings: list.length, t: campus.t }
    const key = list.map((m) => `${m.table.id}:${m.team}`).join('|')
    if (key === sig.current) return
    sig.current = key
    setNow(list)
  })
  const day = dayOf(campus.t)
  const topics = useMemo(() => new Map<string, Topic>(now.map((m) => [m.table.id, meetingTopic(office, m.team, day)])), [now, office, day])
  const secretRooms = useMemo(() => [...new Set(now.filter((m) => topics.get(m.table.id)?.secret).map((m) => gridAt(site, m.table.x, m.table.y)))].filter((n) => n > 0), [now, topics, site])
  // a room stays in the list once frosted, so its glass can clear rather than vanish
  const all = useMemo(() => [...new Set([...frosted, ...secretRooms])], [frosted, secretRooms])
  if (all.length !== frosted.length) setFrosted(all)
  const screens = useMemo(() => {
    const rooms = new Map(now.map((m) => [gridAt(site, m.table.x, m.table.y), m.table.id]))
    return site.items.filter((i) => (i.kind === 'screen' || i.kind === 'whiteboard') && rooms.has(gridAt(site, i.x, i.y))).map((i) => ({ item: i, table: rooms.get(gridAt(site, i.x, i.y))! }))
  }, [now, site])
  return (
    <>
      {all.map((n) => (
        <Frost key={n} site={site} room={n} on={secretRooms.includes(n)} height={height} />
      ))}
      {showText &&
        now.map((m) => {
          const t = topics.get(m.table.id)
          if (!t) return null
          const f = frame(site, m.table)
          return (
            <Html key={m.table.id} position={[f.p[0], 2.3, f.p[2]]} center zIndexRange={[25, 15]} style={{ pointerEvents: 'none' }}>
              <div className="sb-float whitespace-nowrap px-2 py-[3px] text-[11px] text-fg">
                {t.secret && <span className="mr-1 text-warn">Confidential</span>}
                {t.text}
                <span className="num ml-1 text-faint">{m.people}</span>
              </div>
            </Html>
          )
        })}
      {showText &&
        screens.map(({ item, table }) => {
          const t = topics.get(table)
          if (!t) return null
          const f = frame(site, item)
          const board = item.kind === 'whiteboard'
          return (
            <group key={item.id} position={f.p} rotation-y={f.rotY}>
              <Face p={board ? [0, 1.27, -0.28] : [0, 1.45, -0.3]} rotY={0} size={board ? [0.88, 0.88] : [1.7, 0.95]} text={{ title: t.secret ? 'Confidential' : 'Meeting', line: t.text, tone: t.secret ? 'warn' : 'accent' }} palette={palette} glow={glow} />
            </group>
          )
        })}
    </>
  )
}
