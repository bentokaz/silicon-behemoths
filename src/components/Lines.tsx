// Research, in two parts: the technology tree, and the kinds of device the
// company has opened up.
import { useState } from 'react'
import { sfx } from '../audio/sfx'
import { TRACK_INFO } from '../data/catalog'
import { TYPES, segmentsOf } from '../data/devices'
import { unlockType } from '../sim/game'
import { DEVICE_TYPES, type DeviceType, TRACKS } from '../sim/types'
import { hasType, unlockBlocked, unlockCost, unlockOf } from '../sim/world'
import { useGame, useStore } from '../store/game'
import { Research } from './ResearchTree'
import { Icon, trackIcon, typeIcon } from './icons'
import { Btn, Lead, Tabs, Tag, money, num, useKept } from './ui'

function DeviceLines() {
  const g = useGame()
  const { act, say, openDesigner } = useStore.getState()
  const open = DEVICE_TYPES.filter((t) => hasType(g, t))
  return (
    <div className="h-full overflow-y-auto">
      <div className="mb-2 max-w-[760px] text-[12px] leading-relaxed text-dim">
        Your company makes {open.length === DEVICE_TYPES.length ? 'every kind of device' : open.map((t) => TYPES[t].plural.toLowerCase()).join(', ')}. Opening a new line pays for the tooling, test equipment and people who know that kind of product. It is cheaper when you already make something related, and the more demanding lines need your research to have reached a certain level first.
      </div>
      <div className="grid grid-cols-4 gap-2">
        {DEVICE_TYPES.map((type: DeviceType) => {
          const T = TYPES[type]
          const have = hasType(g, type)
          const u = unlockOf(type)
          const blocked = have ? null : unlockBlocked(g, type)
          const cost = unlockCost(g, type)
          const related = u.from.filter((t) => hasType(g, t))
          const made = g.products.filter((p) => p.companyId === 'player' && p.type === type).length
          return (
            <div key={type} className={`flex flex-col border bg-panel p-3 ${have ? 'border-line2' : 'border-line'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`flex min-w-0 items-center gap-2 text-[12px] font-semibold ${have ? 'text-fg' : 'text-dim'}`}>
                  <Icon name={typeIcon(type)} size={18} className={have ? 'text-accent' : 'text-faint'} />
                  <span className="truncate">{T.plural}</span>
                </span>
                {have ? (
                  <Tag tone="pos" icon="check">
                    open
                  </Tag>
                ) : blocked ? (
                  <Tag icon="lock">locked</Tag>
                ) : (
                  <Tag tone="accent" icon="unlock">
                    available
                  </Tag>
                )}
              </div>
              <div className="num mt-1 text-[11px] text-faint">
                {segmentsOf(type).length} markets / {num(segmentsOf(type).reduce((a, s) => a + s.size, 0))} buyers a year
              </div>
              <div className="mt-2 flex-1 text-[11px] leading-snug text-dim">
                {have ? (
                  made ? `${made} designed so far.` : 'Nothing designed yet.'
                ) : (
                  <>
                    {TRACKS.filter((t) => u.needs[t] !== undefined).map((t) => (
                      <div key={t} className={g.levels[t] >= (u.needs[t] ?? 0) ? 'text-pos' : 'text-warn'}>
                        <Lead icon={trackIcon(t)} />
                        Needs {TRACK_INFO[t].name} level {u.needs[t]} (you have {g.levels[t]})
                      </div>
                    ))}
                    {related.length > 0 && <div className="text-pos"><Lead icon="tag" />40% off: you already make {related.map((t) => TYPES[t].plural.toLowerCase()).join(' and ')}</div>}
                    {!related.length && u.from.length > 0 && <div>Cheaper once you make {u.from.map((t) => TYPES[t]?.plural.toLowerCase()).filter(Boolean).join(' or ')}</div>}
                  </>
                )}
              </div>
              {have ? (
                <Btn small icon="edit" className="mt-2" onClick={() => openDesigner({ type })}>
                  Design one
                </Btn>
              ) : (
                <Btn
                  small
                  tone="primary"
                  icon={blocked ? 'lock' : 'unlock'}
                  className="mt-2"
                  disabled={!!blocked}
                  title={blocked ?? undefined}
                  onClick={() => {
                    const err = act((s) => unlockType(s, type))
                    if (err) say(err, 'bad')
                    else (sfx.research(), say(`You can now design ${T.plural.toLowerCase()}.`))
                  }}
                >
                  Open for {money(cost, 1)}
                </Btn>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ResearchScreen() {
  const g = useGame()
  const [view, setView] = useKept<'tech' | 'lines'>('research:view', 'tech')
  const closed = DEVICE_TYPES.filter((t) => !hasType(g, t))
  const ready = closed.filter((t) => !unlockBlocked(g, t)).length
  if (!closed.length && view === 'tech') return <Research />
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={view} onChange={setView} options={[{ value: 'tech', label: 'Technology', icon: 'research' }, { value: 'lines', label: 'Device lines', icon: 'devices', badge: ready || undefined }]} className="shrink-0 bg-panel" />
      <div className={`min-h-0 flex-1 ${view === 'lines' ? 'p-2' : ''}`}>{view === 'tech' ? <Research /> : <DeviceLines />}</div>
    </div>
  )
}
