// Company, Growth: the one progression page. The three goals closest to done,
// every goal behind a fold, and (in a guided game, where parts of the company
// open as they are earned) the tree of what is open, what is next and what
// each part takes. In a game with everything open there is no tree.
import { useEffect, useRef } from 'react'
import { guided } from '../sim/progress'
import { useGame, useStore, useView } from '../store/game'
import { AllGoals, NextGoals } from './Goals'
import { GrowthTree } from './Progress'
import { Page } from './ui'

export function GoalsHub() {
  const g = useGame()
  const hint = useStore((s) => s.hint)
  // older links ask for 'goals' or for 'growth': both are this page, and the part asked for is brought into view
  useView<'goals' | 'growth'>('goals', 'growth')
  const goals = useRef<HTMLDivElement>(null)
  const growth = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (hint?.tab !== 'goals') return
    // a plain visit (the menu, the row of pages) opens the page where it was left
    if (hint.view === 'goals') goals.current?.parentElement?.scrollTo({ top: 0 })
    else if (hint.view === 'growth') growth.current?.scrollIntoView({ block: 'start' })
    useStore.getState().takeHint()
  }, [hint])
  return (
    <Page keep="growth">
      <div ref={goals} className="flex shrink-0 flex-col gap-2">
        <NextGoals g={g} />
        <AllGoals g={g} />
      </div>
      {guided(g) && (
        <div ref={growth} className="flex shrink-0 scroll-mt-4 flex-col gap-2">
          <GrowthTree />
        </div>
      )}
    </Page>
  )
}
