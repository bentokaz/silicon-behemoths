// Settings and key bindings, shown from the System screen and the main menu.
import { useEffect, useState } from 'react'
import { getVolume, setAmbienceLevel, setVolume, sfx } from '../audio/sfx'
import { chooseFolder, cloudBuiltIn, cloudConfig, cloudUser, folderState, forgetFolder, setCloudConfig, signIn, signOut, signUp, unlockFolder } from '../store/cloud'
import { ACTIONS, type Action, QUALITY, type Quality, keyName, keysFor, useSettings } from '../store/settings'
import { ThemePicker } from './System'
import { Btn, Panel, Slider, TextInput } from './ui'

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
        <Slider label="Background ambience" value={settings.ambience} min={0} max={1} step={0.05} format={(v) => (v ? `${Math.round(v * 100)}%` : 'off')} onChange={(v) => (set({ ambience: v }), setAmbienceLevel(v))} hint="The hum of the office, the factory floor, a busy store. There is no music." />
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
        <div className="mt-2 text-[10px] leading-snug text-faint">Every sound is generated in the browser.</div>
        <Btn small className="mt-4 w-full" onClick={() => (resetSettings(), sfx.confirm())}>
          Reset all settings
        </Btn>
      </Panel>
    </div>
  )
}

/** Where saves are kept besides this browser. */
export function SavesBeyond() {
  const [folder, setFolder] = useState<Awaited<ReturnType<typeof folderState>>>({ state: 'none' })
  const [user, setUser] = useState(cloudUser())
  const [cfg, setCfg] = useState(cloudConfig())
  const [url, setUrl] = useState(cfg?.url ?? '')
  const [key, setKey] = useState(cfg?.key ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [note, setNote] = useState('')
  const refresh = () => void folderState().then(setFolder)
  useEffect(refresh, [])
  const run = (job: () => Promise<unknown>, done: string) =>
    void job()
      .then(() => (setNote(done), sfx.confirm(), refresh(), setUser(cloudUser()), setCfg(cloudConfig())))
      .catch((e: Error) => (e.name === 'AbortError' ? null : (setNote(e.message), sfx.error())))
  return (
    <div className="space-y-3 p-2">
      <div>
        <div className="label mb-1 text-faint">Sync folder</div>
        {folder.state === 'unsupported' ? (
          <div className="text-[11px] leading-snug text-dim">This browser cannot write to a folder. Chrome and Edge on a computer can. Use Export to file to keep copies instead.</div>
        ) : (
          <>
            <div className="text-[11px] leading-snug text-dim">Pick a folder and every save is also written there as a file. Choose one inside OneDrive, Google Drive or Dropbox and your games follow you to any PC, and survive clearing the browser.</div>
            <div className="mt-2 flex items-center gap-2">
              <Btn small tone={folder.state === 'none' ? 'primary' : 'default'} onClick={() => run(chooseFolder, 'Folder set. Saves will be copied there from now on.')}>
                {folder.state === 'none' ? 'Choose a folder' : 'Change folder'}
              </Btn>
              {folder.state === 'locked' && (
                <Btn small tone="primary" onClick={() => run(unlockFolder, 'Folder reconnected.')}>
                  Reconnect
                </Btn>
              )}
              {folder.state !== 'none' && (
                <Btn small tone="ghost" onClick={() => run(forgetFolder, 'Folder forgotten. Files already there are untouched.')}>
                  Stop using it
                </Btn>
              )}
            </div>
            <div className={`num mt-1 text-[10px] ${folder.state === 'ready' ? 'text-pos' : folder.state === 'locked' ? 'text-warn' : 'text-faint'}`}>
              {folder.state === 'ready' ? `Writing to "${folder.name}"` : folder.state === 'locked' ? `"${folder.name}" needs reconnecting: the browser asks again each visit` : 'No folder chosen'}
            </div>
          </>
        )}
      </div>
      <div className="border-t border-line pt-3">
        <div className="label mb-1 text-faint">Online account</div>
        {!cfg ? (
          <>
            <div className="text-[11px] leading-snug text-dim">Not set up. Online saves need a free Supabase project; the steps are in CLOUD.md in the game's folder. Paste the project address and public key here once you have them.</div>
            <TextInput value={url} onChange={setUrl} placeholder="Project address (https://...supabase.co)" className="mt-2 w-full" />
            <TextInput value={key} onChange={setKey} placeholder="Public (anon) key" className="mt-1 w-full" />
            <Btn small className="mt-1" disabled={!url.trim() || !key.trim()} onClick={() => (setCloudConfig(url, key), setCfg(cloudConfig()), setNote('Project saved. Now sign in or create an account.'))}>
              Use this project
            </Btn>
          </>
        ) : user ? (
          <>
            <div className="text-[11px] text-dim">
              Signed in as <span className="text-fg">{user}</span>. Every save is copied to your account and newer saves there are fetched when you open the load list.
            </div>
            <Btn small className="mt-2" onClick={() => (signOut(), setUser(null), setNote('Signed out.'))}>
              Sign out
            </Btn>
          </>
        ) : (
          <>
            <div className="text-[11px] leading-snug text-dim">Sign in to keep saves online and load them on any device.</div>
            <TextInput value={email} onChange={setEmail} placeholder="Email" className="mt-2 w-full" />
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="mt-1 h-7 w-full rounded-none border border-line2 bg-raise px-2 text-xs text-fg outline-none focus:border-accent" />
            <div className="mt-1 flex gap-1">
              <Btn small tone="primary" disabled={!email || password.length < 6} onClick={() => run(() => signIn(email, password), 'Signed in.')}>
                Sign in
              </Btn>
              <Btn small disabled={!email || password.length < 6} onClick={() => run(() => signUp(email, password), 'Account created.')}>
                Create account
              </Btn>
              {!cloudBuiltIn() && (
                <Btn small tone="ghost" onClick={() => (localStorage.removeItem('sb-cloud'), setCfg(null))}>
                  Change project
                </Btn>
              )}
            </div>
          </>
        )}
      </div>
      {note && <div className="border border-line px-2 py-[6px] text-[11px] text-dim">{note}</div>}
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
