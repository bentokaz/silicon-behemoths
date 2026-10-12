import { Suspense, lazy, useEffect } from 'react'
import { installUiSounds } from './audio/sfx'
import { MainMenu, NewGame } from './components/Menu'
import { FeedbackHost } from './components/Feedback'
import { MenuNote } from './components/MenuNote'
import { Tips } from './components/Tips'
import { CrashGuard, SizeNotice } from './components/Safety'
import { useStore } from './store/game'

// the game itself (every screen and the 3D views) loads apart from the menu, so the menu is up sooner
const loadShell = () => import('./components/Shell').then((m) => ({ default: m.Shell }))
const Shell = lazy(loadShell)

function Loading() {
  return <div className="flex h-full items-center justify-center bg-carbon text-xs text-dim">Loading the company</div>
}

export default function App() {
  const screen = useStore((s) => s.screen)
  const hasGame = useStore((s) => !!s.game)
  useEffect(installUiSounds, [])
  // fetch the rest while the player is still on the menu
  useEffect(() => {
    const id = window.setTimeout(() => void loadShell(), 300)
    return () => window.clearTimeout(id)
  }, [])
  return (
    <div className="flex h-full flex-col">
      {/* in the flow, above everything: it takes its own height instead of lying over the top bar */}
      <SizeNotice />
      <div className="relative min-h-0 flex-1">
        <CrashGuard>
          <Suspense fallback={<Loading />}>{screen === 'game' && hasGame ? <Shell /> : screen === 'new' ? <NewGame /> : <MainMenu />}</Suspense>
        </CrashGuard>
        <FeedbackHost />
        <Tips />
        {/* outside a game there is no strip: what the menu has to say shows at the bottom of it */}
        {!(screen === 'game' && hasGame) && <MenuNote />}
      </div>
    </div>
  )
}
