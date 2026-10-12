// Research, in two pages: the technology tree, and the kinds of device the
// company has opened up ("Device lines").
import { sfx } from '../audio/sfx'
import { TRACK_INFO } from '../data/catalog'
import { TYPES, segmentsOf } from '../data/devices'
import { canAfford, unlockType } from '../sim/game'
import { DEVICE_TYPES, type DeviceType, type GameState, TRACKS } from '../sim/types'
import { hasType, unlockCost, unlockOf } from '../sim/world'
import { useGame, useStore, useView } from '../store/game'
import { Research } from './ResearchTree'
import { Icon, typeIcon } from './icons'
import { Btn, type Column, ConfirmBtn, Help, Lead, Page, Panel, Table, type TableGroup, int, money, num } from './ui'

interface Line {
  type: DeviceType
  name: string
  have: boolean
  /** Research still missing, in words: "Chipset level 3". Empty when nothing is. */
  missing: string[]
  cost: number
  /** Lines the company already makes that take 40% off this one. */
  related: string[]
  markets: number
  buyers: number
  made: number
}

function lineOf(g: GameState, type: DeviceType): Line {
  const u = unlockOf(type)
  const have = hasType(g, type)
  const segs = segmentsOf(type)
  return {
    type,
    name: TYPES[type].plural,
    have,
    missing: have ? [] : TRACKS.filter((t) => g.levels[t] < (u.needs[t] ?? 0)).map((t) => `${TRACK_INFO[t].name} level ${u.needs[t]}`),
    cost: unlockCost(g, type),
    related: have ? [] : u.from.filter((t) => hasType(g, t)).map((t) => TYPES[t].plural.toLowerCase()),
    markets: segs.length,
    buyers: segs.reduce((a, s) => a + s.size, 0),
    made: g.products.filter((p) => p.companyId === 'player' && p.type === type).length,
  }
}

function DeviceLines() {
  const g = useGame()
  const { act, say, openDesigner } = useStore.getState()
  const lines = DEVICE_TYPES.map((t) => lineOf(g, t))
  const open = lines.filter((l) => l.have)
  const ready = lines.filter((l) => !l.have && !l.missing.length)
  const waiting = lines.filter((l) => !l.have && l.missing.length)

  const cols: Column<Line>[] = [
    {
      id: 'name',
      head: 'Line',
      sort: (l) => l.name,
      cell: (l) => (
        <span className={`flex min-w-0 items-center gap-2 ${l.have ? 'text-fg' : 'text-dim'}`}>
          <Icon name={typeIcon(l.type)} size={14} className="shrink-0 text-dim" />
          <span className="truncate">{l.name}</span>
        </span>
      ),
    },
    { id: 'buyers', head: 'Buyers a year', num: true, min: 112, sort: (l) => l.buyers, cell: (l) => num(l.buyers) },
    { id: 'markets', head: 'Markets', title: 'How many kinds of buyer there are for it', num: true, min: 80, drop: 2, sort: (l) => l.markets, cell: (l) => int(l.markets) },
    { id: 'made', head: 'Yours', title: 'Devices of this kind you have designed', num: true, min: 72, drop: 1, sort: (l) => l.made, cell: (l) => (l.made ? int(l.made) : '') },
    {
      id: 'needs',
      head: 'What it takes',
      min: 300,
      cell: (l) =>
        l.have ? (
          ''
        ) : l.missing.length ? (
          <span className="text-warn" title={`Research this first, under Research, Technology: ${l.missing.join(', ')}`}>
            <Lead icon="lock" />
            {l.missing.join(', ')}
          </span>
        ) : l.related.length ? (
          <span className="text-dim">40% off: you already make {l.related.join(' and ')}</span>
        ) : (
          ''
        ),
    },
    { id: 'cost', head: 'Price to open', num: true, min: 112, sort: (l) => (l.have ? -1 : l.cost), cell: (l) => (l.have ? '' : money(l.cost)) },
  ]

  const groups: TableGroup<Line>[] = [
    { key: 'ready', label: 'Can be opened today', rows: ready },
    { key: 'waiting', label: 'Needs research first', rows: waiting },
    { key: 'open', label: 'Open', rows: open },
  ].filter((x) => x.rows.length > 0)
  // with every line open there is nothing left to say about opening one
  const allOpen = open.length === lines.length
  const shownCols = allOpen ? cols.filter((c) => c.id !== 'needs' && c.id !== 'cost') : cols

  return (
    <Page keep="research:lines">
      <Panel
        title={allOpen ? 'Device lines: all open' : `Device lines: ${int(open.length)} of ${int(lines.length)} open`}
        icon="devices"
        className="shrink-0"
        right={
          <Help title="How device lines work">
            <p>A line is a kind of device your company can design. Opening one pays for the tooling, the test equipment and the people who know that kind of product. It is paid once and the line is open the same day.</p>
            <p className="mt-2">A line costs 40% less when you already make something related. The more demanding lines need your research to have reached a level first: that is done under Research, Technology.</p>
          </Help>
        }
      >
        <Table
          label="Device lines"
          cols={shownCols}
          {...(allOpen ? { rows: open } : { groups })}
          rowKey={(l) => l.type}
          keep="research:lines"
          actionWidth={148}
          actionAlways={(l) => !l.have}
          action={(l) => {
            if (l.have)
              return (
                <Btn small icon="edit" onClick={() => openDesigner({ type: l.type })}>
                  Design one
                </Btn>
              )
            const why = l.missing.length ? `Research first: ${l.missing.join(', ')}` : !canAfford(g, l.cost) ? `Not enough cash: opening ${l.name.toLowerCase()} costs ${money(l.cost)}` : undefined
            return (
              <ConfirmBtn
                small
                tone="default"
                icon={l.missing.length ? 'lock' : 'unlock'}
                confirm={`Pay ${money(l.cost)}`}
                disabled={!!why}
                title={why}
                onClick={() => {
                  const err = act((s) => unlockType(s, l.type))
                  if (err) say(err, 'bad')
                  else (sfx.research(), say(`You can now design ${l.name.toLowerCase()}. It cost ${money(l.cost)}.`))
                }}
              >
                Open the line
              </ConfirmBtn>
            )
          }}
        />
      </Panel>
    </Page>
  )
}

export function ResearchScreen() {
  const [view] = useView<'tech' | 'lines'>('research', 'tech')
  return view === 'tech' ? <Research /> : <DeviceLines />
}
