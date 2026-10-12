// Goals, as the Growth page shows them: the three closest to done, and every
// goal behind one fold.
import { fmtDate } from '../sim/game'
import { type Goal, nextGoals, stageOf } from '../sim/goals'
import type { GameState } from '../sim/types'
import { GOAL_GROUPS, type GoalRow, goalRows } from './CompanyFigures'
import { Icon } from './icons'
import { type Column, Fold, Meter, Panel, Table, money, num, pct } from './ui'

/** What reaching a goal pays, in words. */
export const prizeOf = (goal: Goal) => [goal.cash ? money(goal.cash) : '', goal.fans ? `${num(goal.fans)} fans` : ''].filter(Boolean).join(' and ')

/** The goals still call the Campus by its old name; this is how they read now. */
const plain = (text: string) => text.replace(/\bat head office\b/g, 'on the Campus').replace(/\bhead office\b/g, 'the Campus')

/** The same, with the figures in the number face and the words not. */
function Prize({ goal }: { goal: Goal }) {
  return (
    <>
      {goal.cash > 0 && <span className="num">{money(goal.cash)}</span>}
      {goal.cash > 0 && !!goal.fans && ' and '}
      {!!goal.fans && (
        <>
          <span className="num">{num(goal.fans)}</span> fans
        </>
      )}
    </>
  )
}

/** The three goals closest to done, each with how far along it is and what it pays. */
export function NextGoals({ g }: { g: GameState }) {
  const stage = stageOf(g)
  const next = nextGoals(g, 3)
  return (
    <Panel title="Next goals" icon="goals" className="shrink-0" right={<span className="pr-1 text-[11px] text-dim" title="The company's standing rises with the number of goals reached.">Standing: {stage.name}</span>}>
      {next.length === 0 ? (
        <div className="px-3 py-4 text-xs text-dim">Every goal has been reached.</div>
      ) : (
        <div className="grid grid-cols-3 divide-x divide-line">
          {next.map(({ goal, progress }) => (
            <div key={goal.id} className="min-w-0 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-xs font-semibold text-fg" title={goal.name}>
                  {goal.name}
                </span>
                <span className="num shrink-0 text-[11px] text-dim">{pct(progress, 0)}</span>
              </div>
              <div className="mt-[2px] line-clamp-2 min-h-8 text-xs leading-4 text-dim" title={plain(goal.note)}>
                {plain(goal.note)}
              </div>
              <Meter value={progress} className="mt-2" />
              {prizeOf(goal) && (
                <div className="mt-2 text-[11px] text-dim">
                  Pays <Prize goal={goal} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

/** Every goal there is, in its four groups, behind one fold that starts closed. */
export function AllGoals({ g }: { g: GameState }) {
  const stage = stageOf(g)
  const rows = goalRows(g)
  const cols: Column<GoalRow>[] = [
    { id: 'name', head: 'Goal', sort: (r) => r.goal.name, cell: (r) => <span className={r.reached !== undefined ? 'text-dim' : 'text-fg'}>{r.goal.name}</span> },
    { id: 'note', head: 'What it takes', min: 320, drop: 2, className: 'text-dim', cell: (r) => <span title={plain(r.goal.note)}>{plain(r.goal.note)}</span> },
    { id: 'prize', head: 'Pays', min: 168, drop: 1, sort: (r) => r.goal.cash, first: 'desc', className: 'text-dim', cell: (r) => <Prize goal={r.goal} /> },
    {
      id: 'progress',
      head: 'Progress',
      min: 132,
      sort: (r) => (r.reached !== undefined ? 2 : r.progress),
      first: 'desc',
      cell: (r) =>
        r.reached !== undefined ? (
          <span className="num inline-flex items-center gap-[5px] text-dim">
            <Icon name="check" size={11} className="text-pos" />
            {fmtDate(r.reached)}
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Meter value={r.progress} className="!w-16 shrink-0" />
            <span className="num text-dim">{pct(r.progress, 0)}</span>
          </span>
        ),
    },
  ]
  return (
    <Fold title={`All goals (${stage.done} of ${stage.total} reached)`} icon="goals" open={false} keep="goals:all">
      <Table
        label="All goals"
        cols={cols}
        groups={GOAL_GROUPS.map((group) => {
          const list = rows.filter((r) => r.goal.group === group)
          return { key: group, label: group, right: `${list.filter((r) => r.reached !== undefined).length} / ${list.length}`, rows: list }
        })}
        rowKey={(r) => r.goal.id}
        firstMin={170}
        keep="goals:all"
      />
    </Fold>
  )
}
