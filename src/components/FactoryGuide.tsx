// "How factories work": a short guide beside the factory floor, opened by
// itself on the first visit and from a button after that. It draws the flow
// from receiving dock to shipping dock with the faces of each block, shows a
// blocked joint, and offers the example line in one click.
import { PORT_IN, PORT_OUT } from '../3d/site/factory'
import { Btn, ConfirmBtn, Drawer, money } from './ui'

const SEEN = 'sb.factoryGuide'
export function guideSeen(): boolean {
  try {
    return localStorage.getItem(SEEN) === '1'
  } catch {
    return true
  }
}
export function markGuideSeen() {
  try {
    localStorage.setItem(SEEN, '1')
  } catch {
    /* private window: the guide just opens again next time */
  }
}

interface Block {
  x: number
  w: number
  label: string
  sub: string
  /** Faces: input on the left, output on the right. */
  ins?: boolean
  outs?: boolean
  belt?: boolean
}

const ROW: Block[] = [
  { x: 4, w: 46, label: 'IN', sub: 'dock', outs: true },
  { x: 54, w: 18, label: '', sub: 'belt', belt: true },
  { x: 76, w: 40, label: 'BOARD', sub: 'x2', ins: true, outs: true },
  { x: 116, w: 40, label: 'BOARD', sub: '', ins: true, outs: true },
  { x: 160, w: 40, label: 'ASSY', sub: 'cell', ins: true, outs: true },
  { x: 204, w: 26, label: 'TEST', sub: '', ins: true, outs: true },
  { x: 234, w: 40, label: 'PACK', sub: '', ins: true, outs: true },
  { x: 278, w: 38, label: 'OUT', sub: 'dock', ins: true },
]

function FlowDiagram() {
  const y = 22
  const h = 34
  return (
    <svg viewBox="0 0 320 120" className="w-full" role="img" aria-label="A line: receiving dock, belt, two board assembly lines back to back, assembly cell, test station, packaging line, shipping dock. Below, an output meeting the side of a block is blocked.">
      {ROW.map((b) => (
        <g key={b.x}>
          {b.belt ? (
            <>
              <rect x={b.x} y={y + 10} width={b.w} height={14} fill="none" stroke="var(--color-line2)" />
              <path d={`M${b.x + 5} ${y + 13} l5 4 -5 4 M${b.x + 10} ${y + 13} l5 4 -5 4`} fill="none" stroke="var(--color-dim)" />
            </>
          ) : (
            <rect x={b.x} y={y} width={b.w} height={h} fill="var(--color-panel)" stroke="var(--color-line2)" />
          )}
          {b.ins && <rect x={b.x - 1} y={y + 9} width={3} height={16} fill={PORT_IN} />}
          {b.outs && <rect x={b.x + b.w - 2} y={y + 9} width={3} height={16} fill={PORT_OUT} />}
          {b.label && (
            <text x={b.x + b.w / 2} y={y + 16} textAnchor="middle" fontSize="7.5" fontFamily="var(--font-mono, monospace)" fill="var(--color-fg)">
              {b.label}
            </text>
          )}
          <text x={b.x + b.w / 2} y={y + (b.belt ? 34 : 26)} textAnchor="middle" fontSize="6.5" fill="var(--color-dim)">
            {b.sub}
          </text>
        </g>
      ))}
      <text x={4} y={12} fontSize="7" fill="var(--color-dim)">
        PARTS FLOW LEFT TO RIGHT
      </text>
      <path d="M4 15 H316" stroke="var(--color-line)" />
      {/* a blocked joint */}
      <rect x={60} y={80} width={46} height={30} fill="var(--color-panel)" stroke="var(--color-line2)" />
      <rect x={104} y={87} width={3} height={16} fill={PORT_OUT} />
      <rect x={110} y={74} width={30} height={46} fill="var(--color-panel)" stroke="var(--color-line2)" />
      <rect x={117} y={72} width={16} height={3} fill={PORT_IN} />
      <rect x={104} y={84} width={9} height={22} fill="var(--color-neg)" opacity="0.5" />
      <text x={150} y={92} fontSize="7.5" fill="var(--color-neg)" fontFamily="var(--font-mono, monospace)">
        LOGISTICS BLOCKED
      </text>
      <text x={150} y={103} fontSize="6.5" fill="var(--color-dim)">
        an output meets a side, not an input
      </text>
    </svg>
  )
}

export function FactoryGuide({ open, onClose, example, onExample, fix, onFix }: { open: boolean; onClose: () => void; /** What the example line costs; 0 when it cannot be laid. */ example: number; onExample: () => void; /** True when turning blocks would make more of the line run. */ fix: boolean; onFix: () => void }) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="How factories work"
      width={380}
      footer={
        <div className="flex flex-col gap-1.5">
          {fix && (
            <Btn small tone="primary" icon="turn" className="w-full" onClick={onFix} title="Turns blocks in place so each output faces the next input. Free: nothing moves.">
              Fix layout: turn blocks to face the flow
            </Btn>
          )}
          {example > 0 ? (
            <ConfirmBtn small tone="default" icon="build" className="w-full" confirm={`Pay ${money(example)}?`} onClick={onExample}>
              Place the example line
            </ConfirmBtn>
          ) : (
            <div className="text-[11px] text-dim">The example line needs a clear strip 16 by 6 in the middle of the plot.</div>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3 p-3 text-xs leading-relaxed text-dim">
        <FlowDiagram />
        <ol className="flex list-decimal flex-col gap-1.5 pl-4">
          <li>
            Every block has an <span style={{ color: PORT_IN }}>input face</span> and an <span style={{ color: PORT_OUT }}>output face</span>. Turn a block (R) to point its output along the flow.
          </li>
          <li>
            Where an output touches the next block's input, a short transfer belt joins them by itself. Belts link blocks that are apart and can turn corners.
          </li>
          <li>Parts go from a receiving dock through board assembly, device assembly, testing (optional) and packaging, in that order, to a shipping dock.</li>
          <li>Blocks of one kind in a row pass parts through and share the work: three board lines back to back build three times as many boards.</li>
          <li>The slowest stage sets the output. An output that meets a side, another output or a rack is marked <span className="text-neg">Logistics blocked</span>.</li>
        </ol>
        <div className="t-title mt-1 text-fg">Scaling up</div>
        <ol className="flex list-decimal flex-col gap-1.5 pl-4">
          <li>Components: chips, displays, cells, casings, cameras and power supplies are bought in ready-made unless a machine on the line makes them. Making them yourself cuts the cost of every unit; the Components panel shows what each line makes.</li>
          <li>Belts carry 2,400 kits a day, fast ones 6,000 and express ones 15,000. Splitters feed machines side by side; arms lift kits round a corner; buffers ride out breakdowns. Rates shows what flows through every joint, and Show marks what holds a line back.</li>
          <li>Machines go up to tier II and III in place, and take two modules: speed, quality or efficiency.</li>
          <li>Every machine draws power: past 800 kW add substations, generators or solar arrays. Two or three shifts nearly treble output, at a wage for every worker; crew rooms upstairs give them somewhere to change and eat.</li>
          <li>Control desks and maintenance workshops keep machines from breaking down; test stations catch faults before they ship.</li>
          <li>For millions a month: bigger sites, plants in other regions, lines set to the device they build, and blueprints that place a whole line again in one go.</li>
        </ol>
      </div>
    </Drawer>
  )
}
