// Staff and office screens, plus the company logo uploader.
import { useRef, useState } from 'react'
import { OfficeView } from '../3d/OfficeView'
import { sfx } from '../audio/sfx'
import { expandOffice, fire, hire, placeItem, removeItem, rotateItem } from '../sim/game'
import { ITEM_INFO, OFFICE_TIERS, ROLE_INFO, countItems, monthlyRent, monthlySalaries, seatedStaff, staffEffects } from '../sim/staff'
import { type OfficeItemKind, ROLES } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Btn, Meter, Panel, Row, Stat, money, pct } from './ui'

// ------------------------------------------------------------------ logo

/** Read an image file and return it as a 256 px square PNG data URL. */
export function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Choose an image file'))
    if (file.size > 8e6) return reject(new Error('That image is larger than 8 MB'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = c.height = 256
      const scale = Math.min(256 / img.width, 256 / img.height)
      const w = img.width * scale
      const h = img.height * scale
      c.getContext('2d')!.drawImage(img, (256 - w) / 2, (256 - h) / 2, w, h)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/png'))
    }
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('That file could not be read as an image')))
    img.src = url
  })
}

export function LogoPicker({ value, onChange }: { value?: string; onChange: (logo: string | undefined) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const { say } = useStore.getState()
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-line2 bg-raise">{value ? <img src={value} alt="Company logo" className="h-full w-full object-contain" /> : <span className="label text-faint">none</span>}</div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) readLogo(file).then(onChange, (err: Error) => say(err.message, 'bad'))
        }}
      />
      <Btn small onClick={() => input.current?.click()}>
        {value ? 'Replace' : 'Upload logo'}
      </Btn>
      {value && (
        <Btn small tone="ghost" onClick={() => onChange(undefined)}>
          Remove
        </Btn>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ staff

export function Staff() {
  const g = useGame()
  const { act, say, setTab } = useStore.getState()
  const fx = staffEffects(g)
  const seated = new Set(seatedStaff(g).map((e) => e.id))
  const skillTone = (s: number) => (s >= 70 ? 'pos' : s >= 45 ? 'accent' : 'dim') as 'pos' | 'accent' | 'dim'
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 p-2">
      <div className="grid grid-cols-6 gap-2">
        <Stat label="Headcount" value={g.staff.length} sub={`${fx.seated} at desks, ${fx.idle} without`} tone={fx.idle ? 'warn' : undefined} />
        <Stat label="Payroll" value={`${money(monthlySalaries(g))}`} sub="per month" />
        <Stat label="Research speed" value={`${fx.research.toFixed(2)}x`} tone={fx.research > 1 ? 'pos' : undefined} sub="researchers + lab benches" />
        <Stat label="Development time" value={`${Math.round(fx.devTime * 100)}%`} tone={fx.devTime < 1 ? 'pos' : undefined} sub="engineers + server racks" />
        <Stat label="Design polish" value={`+${pct(fx.polish)}`} tone={fx.polish > 0 ? 'pos' : undefined} sub="designers, applied at release" />
        <Stat label="Awareness growth" value={`${fx.marketing.toFixed(2)}x`} tone={fx.marketing > 1 ? 'pos' : undefined} sub="marketers" />
      </div>
      <div className="grid min-h-0 grid-cols-2 gap-2">
        <Panel title={`Team (${g.staff.length})`} right={fx.idle > 0 ? <Btn small tone="primary" onClick={() => setTab('office')}>Add desks</Btn> : undefined} bodyClass="overflow-auto">
          {g.staff.length === 0 ? (
            <div className="flex h-full items-center justify-center px-8 text-center text-[11px] leading-snug text-faint">Nobody works here yet. You run the company alone until you hire from the applicants on the right.</div>
          ) : (
            <table className="grid-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th className="w-32">Skill</th>
                  <th className="r">Salary / mo</th>
                  <th>Desk</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {g.staff.map((e) => (
                  <tr key={e.id} className="row">
                    <td>{e.name}</td>
                    <td>
                      <span className="mr-2 inline-block h-2 w-2" style={{ background: ROLE_INFO[e.role].color }} />
                      {ROLE_INFO[e.role].name}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Meter value={e.skill} max={100} tone={skillTone(e.skill)} />
                        <span className="num w-6 text-right">{Math.floor(e.skill)}</span>
                      </div>
                    </td>
                    <td className="num r">{money(e.salary)}</td>
                    <td className={`num ${seated.has(e.id) ? 'text-pos' : 'text-warn'}`}>{seated.has(e.id) ? 'SEATED' : 'NO DESK'}</td>
                    <td className="r">
                      <Btn small tone="danger" onClick={() => act((s) => fire(s, e.id))}>
                        Let go
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Applicants this month" right={<span className="label">new batch every month</span>} bodyClass="overflow-auto">
          <table className="grid-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th className="w-32">Skill</th>
                <th className="r">Salary / mo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {g.candidates.map((e) => (
                <tr key={e.id} className="row">
                  <td>{e.name}</td>
                  <td title={ROLE_INFO[e.role].effect}>
                    <span className="mr-2 inline-block h-2 w-2" style={{ background: ROLE_INFO[e.role].color }} />
                    {ROLE_INFO[e.role].name}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Meter value={e.skill} max={100} tone={skillTone(e.skill)} />
                      <span className="num w-6 text-right">{Math.floor(e.skill)}</span>
                    </div>
                  </td>
                  <td className="num r">{money(e.salary)}</td>
                  <td className="r">
                    <Btn
                      small
                      tone="primary"
                      onClick={() => {
                        const err = act((s) => hire(s, e.id))
                        if (err) say(err, 'bad')
                        else (sfx.confirm(), say(`${e.name} joined as ${ROLE_INFO[e.role].name.toLowerCase()}.`))
                      }}
                    >
                      Hire
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-x-6 border-t border-line px-2 py-2">
            {ROLES.map((r) => (
              <div key={r} className="py-[2px] text-[11px]">
                <span className="mr-2 inline-block h-2 w-2" style={{ background: ROLE_INFO[r].color }} />
                <span className="text-fg">{ROLE_INFO[r].name}</span> <span className="text-dim">{ROLE_INFO[r].effect.toLowerCase()}</span>
              </div>
            ))}
          </div>
          <div className="px-2 pb-2 text-[10px] leading-snug text-faint">Hiring costs one month of salary up front. Staff need a desk to contribute, and they slowly gain skill while seated.</div>
        </Panel>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ office

type Tool = OfficeItemKind | 'remove' | 'rotate' | null
const KINDS = Object.keys(ITEM_INFO) as OfficeItemKind[]

export function OfficeScreen() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const [tool, setTool] = useState<Tool>('desk')
  const [rot, setRot] = useState(0)
  const fx = staffEffects(g)
  const tier = OFFICE_TIERS[g.office.tier]
  const next = OFFICE_TIERS[g.office.tier + 1]
  return (
    <div className="grid h-full min-h-0 grid-cols-[250px_minmax(0,1fr)_270px] gap-2 p-2">
      <Panel title="Build" bodyClass="overflow-y-auto">
        {KINDS.map((k) => (
          <button key={k} onClick={() => setTool(tool === k ? null : k)} className={`block w-full border-b border-l-2 border-b-line px-2 py-[6px] text-left transition-colors ${tool === k ? 'border-l-accent bg-accent/10' : 'border-l-transparent hover:bg-hover'}`}>
            <div className="flex items-baseline justify-between">
              <span className={`text-xs uppercase tracking-wider ${tool === k ? 'text-accent' : 'text-fg'}`}>{ITEM_INFO[k].name}</span>
              <span className="num text-[11px] text-dim">{money(ITEM_INFO[k].cost)}</span>
            </div>
            <div className="text-[10px] leading-snug text-dim">{ITEM_INFO[k].note}</div>
          </button>
        ))}
        <div className="grid grid-cols-2 gap-1 p-2">
          <Btn small onClick={() => setRot((r) => (r + 1) % 4)} title="Direction new items face">
            Facing {['N', 'E', 'S', 'W'][rot]}
          </Btn>
          <Btn small active={tool === 'rotate'} onClick={() => setTool(tool === 'rotate' ? null : 'rotate')}>
            Turn item
          </Btn>
          <Btn small tone="danger" active={tool === 'remove'} className="col-span-2" onClick={() => setTool(tool === 'remove' ? null : 'remove')}>
            Remove item (50% refund)
          </Btn>
        </div>
        <div className="px-2 pb-2 text-[10px] leading-snug text-faint">Pick an item, then click floor tiles to place it. Drag to orbit, right-drag to pan, scroll to zoom.</div>
      </Panel>

      <div className="relative min-h-0 min-w-0 border border-line">
        <OfficeView
          office={g.office}
          seated={seatedStaff(g)}
          armed={tool !== null}
          removing={tool === 'remove' || tool === 'rotate'}
          onTile={(x, y, item) => {
            if (tool === null) return
            if (tool === 'remove') {
              if (item) (act((s) => removeItem(s, item.id)), sfx.click())
              return
            }
            if (tool === 'rotate') {
              if (item) act((s) => rotateItem(s, item.id))
              return
            }
            const err = act((s) => placeItem(s, tool, x, y, rot))
            if (err) say(err, 'bad')
            else sfx.cash()
          }}
        />
        <div className="label pointer-events-none absolute left-2 top-2 border border-line bg-panel/90 px-2 py-1">
          {tier.name} / {g.office.w} x {g.office.h} tiles
        </div>
      </div>

      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        <Panel title="Office" className="shrink-0" bodyClass="px-2 py-1">
          <Row k="Desks" v={`${fx.seated} used of ${fx.desks}`} tone={fx.idle ? 'text-warn' : undefined} />
          <Row k="Staff without a desk" v={fx.idle} tone={fx.idle ? 'text-warn' : undefined} />
          <Row k="Lab benches" v={countItems(g.office, 'bench')} />
          <Row k="Server racks" v={countItems(g.office, 'server')} />
          <Row k="Rent" v={`${money(monthlyRent(g.office))} / mo`} />
          <div className="py-1">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-dim">Comfort</span>
              <span className="num text-[11px]">{pct(fx.comfort, 0)}</span>
            </div>
            <Meter value={fx.comfort} tone={fx.comfort > 0.7 ? 'pos' : fx.comfort > 0.35 ? 'accent' : 'warn'} />
            <div className="mt-1 text-[10px] leading-snug text-faint">Comfort lifts everyone's output by up to 30%. Add plants, sofas, coffee and meeting tables as the team grows.</div>
          </div>
        </Panel>
        <Panel title="Move up" className="shrink-0" bodyClass="px-2 py-2">
          {next ? (
            <>
              <div className="text-sm">{next.name}</div>
              <div className="num text-[11px] text-dim">
                {next.w} x {next.h} tiles, rent {money(next.w * next.h * 60)} / mo
              </div>
              <Btn
                tone="primary"
                className="mt-2 h-9 w-full"
                onClick={() => {
                  const err = act((s) => expandOffice(s))
                  if (err) say(err, 'bad')
                  else sfx.confirm()
                }}
              >
                Move in for {money(next.cost, 1)}
              </Btn>
              <div className="mt-1 text-[10px] text-faint">Furniture and staff move with you.</div>
            </>
          ) : (
            <div className="text-[11px] text-dim">You own the largest campus available.</div>
          )}
        </Panel>
        <Panel title="Team effects" className="shrink-0" bodyClass="px-2 py-1">
          <Row k="Research speed" v={`${fx.research.toFixed(2)}x`} />
          <Row k="Development time" v={`${Math.round(fx.devTime * 100)}%`} />
          <Row k="Design polish" v={`+${pct(fx.polish)}`} />
          <Row k="Awareness growth" v={`${fx.marketing.toFixed(2)}x`} />
        </Panel>
      </div>
    </div>
  )
}
