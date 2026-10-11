// Settings and key bindings, shown from the System screen and the main menu.
import { useEffect, useState } from 'react'
import { getVolume, setVolume, sfx } from '../audio/sfx'
import { ACTIONS, type Action, QUALITY, type Quality, keyName, keysFor, useSettings } from '../store/settings'
import { ThemePicker } from './System'
import { Btn, Panel, Slider } from './ui'

function Toggle({ on, onChange, title, note }: { on: boolean; onChange: (v: boolean) => void; title: string; note: string }) {
  return (
    <button onClick={() => (onChange(!on), sfx.toggle())} className="flex w-full items-start gap-3 border-b border-line px-2 py-2 text-left last:border-b-0 hover:bg-hover">
      <span className={`mt-[2px] flex h-4 w-8 shrink-0 items-center border ${on ? 'justify-end border-accent bg-accent/20' : 'justify-start border-line2'}`}>
        <span className={`h-full w-3 ${on ? 'bg-accent' : 'bg-dim'}`} />
      </span>
      <span>
        <span className="block text-xs uppercase tracking-wider text-fg">{title}</span>
        <span className="block text-[11px] leading-snug text-dim">{note}</span>
      </span>
    </button>
  )
}

export function SettingsPanel() {
  const { settings, set, resetSettings } = useSettings()
  const [vol, setVol] = useState(getVolume())
  return (
    <div className="grid h-full min-h-0 grid-cols-3 gap-2">
      <Panel title="Graphics" bodyClass="overflow-y-auto p-2">
        <div className="label mb-1 text-faint">Detail in the 3D views</div>
        {(Object.keys(QUALITY) as Quality[]).map((q) => (
          <button key={q} onClick={() => (set({ quality: q }), sfx.toggle())} className={`mb-1 block w-full border p-2 text-left ${settings.quality === q ? 'border-accent bg-accent/10' : 'border-line hover:border-line2'}`}>
            <div className={`text-xs uppercase tracking-wider ${settings.quality === q ? 'text-accent' : 'text-fg'}`}>{QUALITY[q].label}</div>
            <div className="text-[11px] leading-snug text-dim">{QUALITY[q].note}</div>
          </button>
        ))}
        <div className="mt-1 text-[10px] leading-snug text-faint">If moving the camera around a building feels heavy, drop this a step. Shadows are only redrawn when something on the site changes, so a big campus costs little once it is built.</div>
        <div className="label mb-1 mt-3 text-faint">Interface colours</div>
        <ThemePicker />
      </Panel>
      <Panel title="Camera and play" bodyClass="overflow-y-auto">
        <div className="px-2 pt-1">
          <Slider label="Camera speed" value={settings.cameraSpeed} min={0.4} max={2.5} step={0.1} format={(v) => `${v.toFixed(1)}x`} onChange={(v) => set({ cameraSpeed: v })} hint="How fast the building camera pans, turns and zooms, by mouse and by keys." />
        </div>
        <Toggle on={settings.zoomToPointer} onChange={(v) => set({ zoomToPointer: v })} title="Zoom toward the pointer" note="The scroll wheel zooms in on what is under the mouse, not the middle of the view." />
        <Toggle on={settings.walkers} onChange={(v) => set({ walkers: v })} title="People on the move" note="Staff without a desk and visitors walk about the campus." />
        <Toggle on={settings.autosave} onChange={(v) => set({ autosave: v })} title="Autosave" note="Saves at the end of each month and at big moments: a device going on sale, a new plot, a listing, a takeover." />
        <Toggle on={settings.pauseOnAlert} onChange={(v) => set({ pauseOnAlert: v })} title="Pause on alerts" note="Stops the clock when something needs a decision, such as a sell-out or a recall." />
      </Panel>
      <Panel title="Sound" bodyClass="p-2">
        <Slider label="Volume" value={vol} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => (setVol(v), setVolume(v), sfx.click())} />
        <div className="mt-2 grid grid-cols-3 gap-1">
          {(
            [
              ['Build', sfx.build],
              ['Launch', sfx.launch],
              ['Goal', sfx.goal],
              ['Alert', sfx.alert],
              ['Cash', sfx.cash],
              ['Applause', () => sfx.applause(1.5, 1)],
            ] as [string, () => void][]
          ).map(([name, play]) => (
            <Btn key={name} small onClick={play}>
              {name}
            </Btn>
          ))}
        </div>
        <div className="mt-2 text-[10px] leading-snug text-faint">Every sound is generated in the browser; there is no music yet.</div>
        <Btn small className="mt-4 w-full" onClick={() => (resetSettings(), sfx.confirm())}>
          Reset all settings
        </Btn>
      </Panel>
    </div>
  )
}

export function KeysPanel() {
  const { bind, resetKeys } = useSettings()
  useSettings((s) => s.binds)
  const [waiting, setWaiting] = useState<{ action: string; slot: number } | null>(null)

  useEffect(() => {
    if (!waiting) return
    const key = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code !== 'Escape' || waiting.action === 'cancel') {
        const keys = [...keysFor(waiting.action)]
        keys[waiting.slot] = e.code
        // a key does one thing at a time: take it away from anything else that had it
        for (const other of ACTIONS) {
          if (other.id === waiting.action) continue
          const theirs = keysFor(other.id)
          if (theirs.includes(e.code)) bind(other.id, theirs.filter((k) => k !== e.code))
        }
        bind(waiting.action, [...new Set(keys.filter(Boolean))])
        sfx.confirm()
      }
      setWaiting(null)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [waiting, bind])

  const groups: Action['group'][] = ['Game', 'Screens', 'Building']
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between border border-line bg-panel px-2 py-[6px]">
        <span className="text-[11px] text-dim">{waiting ? 'Press the key to use. Esc cancels.' : 'Click a key to change it. Each action can have two keys.'}</span>
        <Btn small onClick={() => (resetKeys(), sfx.confirm())}>
          Reset to defaults
        </Btn>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2">
        {groups.map((group) => (
          <Panel key={group} title={group} bodyClass="overflow-y-auto">
            {ACTIONS.filter((a) => a.group === group).map((a) => {
              const keys = keysFor(a.id)
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 border-b border-line px-2 py-[5px] last:border-b-0">
                  <span className="text-[11px] text-fg">{a.label}</span>
                  <span className="flex shrink-0 gap-1">
                    {[0, 1].map((slot) => {
                      const on = waiting?.action === a.id && waiting.slot === slot
                      return (
                        <button key={slot} onClick={() => setWaiting({ action: a.id, slot })} className={`num h-6 min-w-12 border px-2 text-[10px] uppercase ${on ? 'border-accent bg-accent/10 text-accent' : keys[slot] ? 'border-line2 text-fg hover:border-accent' : 'border-line text-faint hover:border-line2'}`}>
                          {on ? '...' : keys[slot] ? keyName(keys[slot]) : '--'}
                        </button>
                      )
                    })}
                  </span>
                </div>
              )
            })}
            {group === 'Building' && <div className="px-2 py-2 text-[10px] leading-snug text-faint">In any building view: drag to turn, right-drag to slide, scroll to zoom. The designer has its own keys: Ctrl+Z and Ctrl+Y undo and redo, Delete removes the selected part.</div>}
          </Panel>
        ))}
      </div>
    </div>
  )
}
