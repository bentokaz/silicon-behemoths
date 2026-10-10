// Read-only product view: 3D model, specs, scores against today's market, reviews.
import { useEffect, useState } from 'react'
import { DeviceView, type ViewName } from '../3d/DeviceView'
import { deviceThumbnail } from '../3d/thumbnail'
import { CHARGE_W, EXTRAS, LENSES, SUB_LABELS, chipInfo, materialInfo, panelInfo, segmentInfo, sensorInfo } from '../data/catalog'
import { companyOf, fmtDate, player } from '../sim/game'
import { normalised } from '../sim/market'
import { type DeviceDesign, type Product, SUBS } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Btn, Meter, Panel, Row, money, num } from './ui'

export function specLines(d: DeviceDesign, diag: number): [string, string][] {
  const s = d.specs
  const rear = d.parts.filter((p) => p.kind === 'camera' && p.face === 'back')
  const selfie = d.parts.filter((p) => p.kind === 'camera' && p.face === 'front')
  const extras = s.extras.map((id) => EXTRAS.find((e) => e.id === id)?.name).filter(Boolean)
  return [
    ['Display', `${diag.toFixed(2)}" ${panelInfo(s.panel).name} ${s.refresh} Hz`],
    ['Chipset', chipInfo(s.chipGen, s.chipTier).name],
    ['Memory', `${s.ram} GB / ${s.storage >= 1024 ? s.storage / 1024 + ' TB' : s.storage + ' GB'}`],
    ['Battery', `${s.battery} mAh, ${CHARGE_W[s.charging]} W`],
    ['Rear cameras', rear.length ? rear.map((p) => `${sensorInfo(p.sensor ?? 0).name} ${LENSES[p.lens ?? 'wide'].name.split(' ')[0].toLowerCase()}`).join(' + ') : 'none'],
    ['Front camera', selfie.length ? selfie.map((p) => sensorInfo(p.sensor ?? 0).name + (p.underDisplay ? ' under-display' : '')).join(' + ') : 'none'],
    ['Body', `${d.body.width} x ${d.body.height} x ${d.body.thickness} mm`],
    ['Materials', `${materialInfo(d.body.frameMat).name} frame, ${materialInfo(d.body.backMat).name.toLowerCase()} back`],
    ['Extras', extras.length ? extras.join(', ') : 'none'],
  ]
}

export function Thumb({ product, className = '' }: { product: Product; className?: string }) {
  const [src, setSrc] = useState('')
  const logo = useStore((s) => (s.game ? player(s.game).logo : undefined))
  useEffect(() => {
    const id = window.setTimeout(() => setSrc(deviceThumbnail(product.id, product.design, logo)), 0)
    return () => window.clearTimeout(id)
  }, [product.id, product.design])
  return src ? <img src={src} alt="" draggable={false} className={`object-contain ${className}`} /> : <div className={className} />
}

export function ScoreBars({ product }: { product: Product }) {
  const g = useGame()
  const n = normalised(product.raw, g.day)
  return (
    <div>
      {SUBS.map((k) => (
        <div key={k} className="flex items-center gap-2 py-[3px]">
          <span className="w-20 text-[11px] text-dim">{SUB_LABELS[k]}</span>
          <Meter value={n[k]} max={1.1} tone={n[k] > 0.9 ? 'pos' : n[k] > 0.6 ? 'accent' : 'warn'} />
          <span className="num w-8 text-right text-[11px]">{Math.round(n[k] * 100)}</span>
        </div>
      ))}
      <div className="mt-1 text-[10px] text-faint">100 = level with the best the market can build today</div>
    </div>
  )
}

export function Reviews({ product }: { product: Product }) {
  if (!product.reviews.length) return <div className="p-2 text-[11px] text-dim">Reviews are published on release day.</div>
  return (
    <div className="divide-y divide-line">
      {product.reviews.map((r) => (
        <div key={r.outlet} className="flex gap-3 px-2 py-2">
          <div className={`num w-10 shrink-0 text-xl leading-none ${r.score >= 8 ? 'text-pos' : r.score >= 6 ? 'text-fg' : 'text-neg'}`}>{r.score.toFixed(1)}</div>
          <div className="min-w-0 whitespace-normal">
            <div className="label">{r.outlet}</div>
            {r.pros.map((t) => (
              <div key={t} className="text-[11px] text-fg">
                <span className="num text-pos">+ </span>
                {t}
              </div>
            ))}
            {r.cons.map((t) => (
              <div key={t} className="text-[11px] text-dim">
                <span className="num text-neg">- </span>
                {t}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ProductInspector({ product, children }: { product: Product; children?: React.ReactNode }) {
  const g = useGame()
  const [view, setView] = useState<ViewName>('back')
  const [nonce, setNonce] = useState(0)
  const company = companyOf(g, product.companyId)
  const status = product.status === 'dev' ? `In development, ${product.devDaysLeft} days left` : product.status === 'sale' ? `On sale since ${fmtDate(product.launchDay)}` : 'Discontinued'
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto pr-1">
      <Panel
        title={
          <span>
            <span style={{ color: company.color }}>{company.name}</span> / {product.name}
          </span>
        }
        right={
          <div className="flex gap-1">
            {(['back', 'front', 'side'] as ViewName[]).map((v) => (
              <Btn key={v} small tone="ghost" active={view === v} onClick={() => (setView(v), setNonce((x) => x + 1))}>
                {v}
              </Btn>
            ))}
          </div>
        }
        className="shrink-0"
      >
        <div className="h-[300px]">
          <DeviceView key={product.id} design={product.design} view={view} viewNonce={nonce} autoRotate logo={player(g).logo} />
        </div>
        <div className="grid grid-cols-4 border-t border-line">
          {[
            ['Price', money(product.price)],
            ['Review', product.reviewAvg ? product.reviewAvg.toFixed(1) : '--'],
            ['Sold', num(product.unitsSold)],
            ['Design', Math.round(product.designPct) + ''],
          ].map(([k, v]) => (
            <div key={k} className="border-r border-line px-2 py-1 last:border-0">
              <div className="label">{k}</div>
              <div className="num text-sm">{v}</div>
            </div>
          ))}
        </div>
      </Panel>
      {children}
      <Panel title="Specification" className="shrink-0" bodyClass="px-2 py-1">
        <Row k="Status" v={status} />
        {product.segment && <Row k="Target segment" v={segmentInfo(product.segment).name} />}
        {specLines(product.design, product.diag).map(([k, v]) => (
          <Row key={k} k={k} v={<span className="whitespace-normal text-right">{v}</span>} />
        ))}
        <Row k="Weight" v={`${Math.round(product.weight)} g`} />
        <Row k="Battery life" v={`${product.lifeHours.toFixed(1)} h`} />
      </Panel>
      <Panel title="Scores vs market today" className="shrink-0" bodyClass="px-2 py-1">
        <ScoreBars product={product} />
      </Panel>
      <Panel title="Reviews" className="shrink-0">
        <Reviews product={product} />
      </Panel>
    </div>
  )
}
