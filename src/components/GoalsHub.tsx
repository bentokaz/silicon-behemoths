// The Goals screen as the shell shows it: the goals, and beside them (in a
// guided game) the tree of everything the company can still grow into.
import { useEffect, useState } from 'react'
import { CAPS, guided, has } from '../sim/progress'
import { useGame, useStore, useView } from '../store/game'
import { GoalsScreen } from './Goals'
import { GrowthTree } from './Progress'
import { Tabs } from './ui'

export function GoalsHub() {
  const g = useGame()
  const hint = useStore((s) => s.hint)
  const [view, setView] = useView<'goals' | 'growth'>('goals', 'growth')
  // "take me there" can ask for either page
  useEffect(() => {
    if (hint?.tab !== 'goals') return
    useStore.getState().takeHint()
  }, [hint])
  if (!guided(g)) return <GoalsScreen />
  const open = CAPS.filter((c) => has(g, c.id)).length
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Tabs value={view} onChange={setView} options={[{ value: 'goals', label: 'Goals', icon: 'goals' }, { value: 'growth', label: 'Company growth', icon: 'branch', badge: `${open}/${CAPS.length}` }]} className="shrink-0 bg-panel" />
      <div className="min-h-0 flex-1">{view === 'goals' ? <GoalsScreen /> : <GrowthTree />}</div>
    </div>
  )
}
