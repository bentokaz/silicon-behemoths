import { useEffect } from 'react'
import { installUiSounds } from './audio/sfx'
import { MainMenu, NewGame } from './components/Menu'
import { Shell } from './components/Shell'
import { useStore } from './store/game'

export default function App() {
  const screen = useStore((s) => s.screen)
  const hasGame = useStore((s) => !!s.game)
  const toast = useStore((s) => s.toast)
  useEffect(installUiSounds, [])
  return (
    <div className="relative h-full">
      {screen === 'game' && hasGame ? <Shell /> : screen === 'new' ? <NewGame /> : <MainMenu />}
      {toast && (
        <div className={`num pointer-events-none absolute bottom-4 left-1/2 z-[60] -translate-x-1/2 border bg-panel px-4 py-2 text-xs ${toast.tone === 'bad' ? 'border-neg text-neg' : 'border-accent text-fg'}`}>{toast.text}</div>
      )}
    </div>
  )
}
