// Research, page "Labs", operating system: the systems that can be licensed,
// and the designer for the look of the company's own system, with a live
// preview of a phone's home screen painted by paintOsLook (src/3d/osLook.ts).
import { useEffect, useRef } from 'react'
import { sfx } from '../audio/sfx'
import { paintOsLook } from '../3d/osLook'
import { yearAt } from '../data/eras'
import { canAfford, setOsLicence, setOsLook } from '../sim/game'
import { OS_LICENCES, OS_LOOK_CHOICES, cleanLook, industryOs, licenceBlocked, licenceInfo, licenceOpen, licenceSwitchCost } from '../sim/tech'
import type { OsLook } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Btn, Choice, Help, Panel, Row, Tag, int, money } from './ui'

/** A phone screen showing a look, repainted whenever the look changes. */
export function OsPreview({ look, width = 170 }: { look: OsLook; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const height = Math.round(width * 2.1)
  useEffect(() => {
    const c = ref.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const k = Math.min(2, window.devicePixelRatio || 1)
    c.width = width * k
    c.height = height * k
    ctx.setTransform(k, 0, 0, k, 0, 0)
    paintOsLook(ctx, look, width, height)
  }, [look, width, height])
  return <canvas ref={ref} role="img" aria-label="Home screen preview" style={{ width, height }} className="block border-[6px] border-[#0b0c0e] bg-carbon" />
}

const LABELS: Record<keyof typeof OS_LOOK_CHOICES, string> = { iconShape: 'Icon shape', layout: 'Home layout', font: 'Type' }
const cap = (v: string) => v[0].toUpperCase() + v.slice(1)

/** The look of the company's own system: every choice changes the preview at once. */
export function OsLookDesigner() {
  const g = useGame()
  const { act } = useStore.getState()
  const look = cleanLook(g.os.look)
  const set = (patch: Partial<OsLook>) => act((s) => setOsLook(s, patch))
  const colour = (k: 'wallpaper' | 'accent', label: string) => (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-[11px] text-dim">{label}</span>
      <input type="color" aria-label={label} value={look[k]} onChange={(e) => set({ [k]: e.target.value })} />
    </label>
  )
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-2">
      <Panel
        title={`Design ${g.os.own ? g.os.name : 'your system'}`}
        icon="design"
        bodyClass="overflow-y-auto px-3 py-2"
        right={<Help title="The look of your system">How your own operating system looks on the screens of the phones, tablets and foldables you sell: wallpaper, accent, icons, type, layout and light or dark. {g.os.own ? '' : 'It is shown once your devices run your own system.'}</Help>}
      >
        {(Object.keys(OS_LOOK_CHOICES) as (keyof typeof OS_LOOK_CHOICES)[]).map((k) => (
          <Choice key={k} label={LABELS[k]} value={look[k] as string} options={(OS_LOOK_CHOICES[k] as readonly string[]).map((v) => ({ value: v, label: cap(v) }))} onChange={(v) => set({ [k]: v } as Partial<OsLook>)} />
        ))}
        <Choice label="Panels" value={look.dark ? 'dark' : 'light'} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} onChange={(v) => set({ dark: v === 'dark' })} />
        {colour('wallpaper', 'Wallpaper colour')}
        {colour('accent', 'Accent')}
      </Panel>
      <Panel title="Preview" icon="phone" bodyClass="flex items-start justify-center overflow-y-auto p-3">
        <OsPreview look={look} />
      </Panel>
    </div>
  )
}

/** The systems on offer to license, with what each costs and how it compares. */
export function OsLicences() {
  const g = useGame()
  const { act, say } = useStore.getState()
  const current = g.os.own ? null : licenceInfo(g.os.licence)
  const year = Math.floor(yearAt(g.day))
  const shown = OS_LICENCES.filter((l) => l.from <= year + 3 && (l.until === undefined || l.until >= year - 2))
  return (
    <Panel
      title="Licensed systems"
      icon="os"
      bodyClass="overflow-y-auto"
      right={<Help title="Licensing a system">Until you build your own, your devices run a licensed system. The free one is weak and costs sales; better ones charge a royalty on every device that runs them (not consoles, earbuds or speakers). Quality is against what buyers expect of a system today: above it lifts every device you sell and its reviews, below it drags them down. Systems are discontinued in time and age after that.</Help>}
    >
      {shown.map((l) => {
        const open = licenceOpen(l, g.day)
        const cost = licenceSwitchCost(l)
        const blocked = licenceBlocked(g, l.id) ?? (!canAfford(g, cost) ? `Not enough cash: ${money(cost)} is needed` : null)
        const on = current?.id === l.id
        return (
          <div key={l.id} className="flex items-center gap-3 border-b border-line px-3 py-[6px] last:border-0">
            <span className="min-w-0 flex-1">
              <span className="block text-xs text-fg">
                {l.name} {on && <Tag tone="accent">Running</Tag>} {!open && <Tag tone="dim">{year < l.from ? `From ${l.from}` : 'Discontinued'}</Tag>}
              </span>
              <span className="block text-[11px] leading-snug text-dim">
                From {l.vendor}. {l.note}
              </span>
            </span>
            <span className="num w-14 shrink-0 text-right text-[11px]" title="Quality against what buyers expect today">
              <span className={l.quality >= 0 ? 'text-pos' : 'text-neg'}>
                {l.quality >= 0 ? '+' : ''}
                {int(l.quality)}
              </span>
            </span>
            <span className="num w-20 shrink-0 text-right text-[11px] text-dim" title="Royalty per device sold">
              {l.royalty ? `${money(l.royalty)}/unit` : 'Free'}
            </span>
            {!on && !g.os.own && (
              <Btn
                small
                disabled={!!blocked}
                title={blocked ?? (cost ? `Moving every device over costs ${money(cost)}` : undefined)}
                onClick={() => {
                  const err = act((s) => setOsLicence(s, l.id))
                  if (err) say(err, 'bad')
                  else (sfx.confirm(), say(`Your devices now run ${l.name}.`))
                }}
              >
                Switch{cost ? ` (${money(cost)})` : ''}
              </Btn>
            )}
          </div>
        )
      })}
      <div className="px-3 py-2">
        <Row k="Buyers expect a system of quality" v={int(industryOs(g.day))} />
      </div>
    </Panel>
  )
}
