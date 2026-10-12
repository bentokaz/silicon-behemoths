// What the menus have to say (a save that would not load, a file that is not
// a save). In a game this is the messenger strip's job; outside one there is
// no strip, so the same queue shows as one line at the bottom of the menu.
// Kept apart from the strip so the menu does not have to load the game.
import { useEffect } from 'react'
import { useStore } from '../store/game'
import { currentNote } from '../store/notes'

export function MenuNote() {
  const notes = useStore((s) => s.notes)
  const dismiss = useStore((s) => s.dismiss)
  const note = currentNote(notes)
  useEffect(() => {
    if (!note) return
    const t = window.setTimeout(() => dismiss(note.id), note.ttl || 6000)
    return () => window.clearTimeout(t)
  }, [note, dismiss])
  if (!note) return null
  return (
    <div role={note.tone === 'bad' ? 'alert' : 'status'} className={`pointer-events-none absolute bottom-4 left-1/2 z-[100] max-w-[min(640px,calc(100%-2rem))] -translate-x-1/2 border bg-panel px-4 py-2 text-center text-xs ${note.tone === 'bad' ? 'border-neg text-neg' : 'border-line2 text-fg'}`}>
      {note.text}
    </div>
  )
}
