// Policies, a view inside the People page: the working week and the perks.
// A settings page: two lists to pick one from, each row saying what it does.
import type { ReactNode } from 'react'
import { sfx } from '../audio/sfx'
import { setPolicy } from '../sim/game'
import { HOURS, PERKS, perksCost } from '../sim/staff'
import type { StaffPolicy } from '../sim/types'
import { useGame, useStore } from '../store/game'
import { Head, money, pct } from './ui'

const signed = (v: number) => (v > 0 ? `+${v}` : String(v))

/** One choice in a list of which exactly one is on. */
function Option({ on, name, note, effect, onPick }: { on: boolean; name: string; note?: string; effect: ReactNode; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onPick} className={`flex min-h-9 w-full items-center gap-3 border px-3 py-2 text-left transition-colors ${on ? 'border-accent bg-accent/10' : 'border-line hover:border-line2 hover:bg-hover'}`}>
      <span aria-hidden className={`h-2 w-2 shrink-0 border ${on ? 'border-accent bg-accent' : 'border-line2'}`} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-fg">{name}</span>
        {note && <span className="block text-[11px] leading-snug text-dim">{note}</span>}
      </span>
      <span className="shrink-0 text-right text-[11px] text-dim">{effect}</span>
    </button>
  )
}

export function StaffPolicies() {
  const g = useGame()
  const { act } = useStore.getState()
  const pick = (patch: Partial<StaffPolicy>) => {
    const err = act((s) => setPolicy(s, patch))
    if (err) useStore.getState().say(err, 'bad')
    else sfx.toggle()
  }
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-3 min-[900px]:grid-cols-2">
      <section>
        <Head icon="clock">Working hours</Head>
        <div role="radiogroup" aria-label="Working hours" className="mt-2 space-y-1">
          {(Object.keys(HOURS) as StaffPolicy['hours'][]).map((h) => (
            <Option
              key={h}
              on={g.policy.hours === h}
              name={HOURS[h].name}
              note={HOURS[h].note}
              onPick={() => pick({ hours: h })}
              effect={
                <>
                  work done <span className="num text-fg">{pct(HOURS[h].output, 0)}</span>, morale <span className="num text-fg">{signed(HOURS[h].morale)}</span>
                </>
              }
            />
          ))}
        </div>
      </section>
      <section>
        <Head icon="heart">Perks</Head>
        <div role="radiogroup" aria-label="Perks" className="mt-2 space-y-1">
          {PERKS.map((p, i) => (
            <Option
              key={p.name}
              on={g.policy.perks === i}
              name={p.name}
              onPick={() => pick({ perks: i })}
              effect={
                <>
                  <span className="num text-fg">{money(p.perHead)}</span> a head each month, morale <span className="num text-fg">{signed(p.morale)}</span>
                </>
              }
            />
          ))}
        </div>
        <div className="mt-2 text-[11px] leading-snug text-dim">
          Lunches, health cover, shuttle buses, childcare. Paid each month with salaries: <span className="num text-fg">{money(perksCost(g))}</span> a month for the people you have now.
        </div>
      </section>
    </div>
  )
}
