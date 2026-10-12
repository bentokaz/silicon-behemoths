// Settings and key bindings, shown from the System screen and the main menu.
import { useEffect, useState } from 'react'
import { getVolume, setAmbienceLevel, setVolume, sfx } from '../audio/sfx'
import { chooseFolder, cloudBuiltIn, cloudConfig, cloudUser, folderState, forgetFolder, setCloudConfig, signIn, signOut, signUp, unlockFolder } from '../store/cloud'
import { ACTIONS, type Action, DEFAULT_SETTINGS, QUALITY, type Quality, keyName, keysFor, useSettings } from '../store/settings'
import { ThemePicker } from './System'
import { Icon, type IconName } from './icons'
import { Btn, ConfirmBtn, Head, Lead, Panel, Slider, TextInput, useLayer } from './ui'

function Toggle({ on, onChange, title, note, icon }: { on: boolean; onChange: (v: boolean) => void; title: string; note: string; icon?: IconName }) {
  return (
    <button onClick={() => (onChange(!on), sfx.toggle())} aria-pressed={on} className="flex w-full items-start gap-3 border-b border-line px-2 py-2 text-left last:border-b-0 hover:bg-hover">
      <span className={`mt-[2px] flex h-4 w-8 shrink-0 items-center border ${on ? 'justify-end border-accent bg-accent/20' : 'justify-start border-line2'}`}>
        <span className={`h-full w-3 ${on ? 'bg-accent' : 'bg-dim'}`} />
      </span>
      <span>
        <span className="block text-xs uppercase tracking-wider text-fg">
          <Lead icon={icon} size={12} />
          {title}
        </span>
        <span className="block text-[11px] leading-snug text-dim">{note}</span>
      </span>
    </button>
  )
}

const SOUND_ICON: Record<string, IconName> = { Build: 'build', Launch: 'play', Goal: 'goals', Alert: 'alert', Cash: 'cash', Applause: 'mic' }
const GROUP_ICON: Record<string, IconName> = { Game: 'play', Screens: 'overview', Building: 'build', Designer: 'design' }

export function SettingsPanel() {
  const { settings, set, resetSettings } = useSettings()
  const [vol, setVol] = useState(getVolume())
  return (
    <div className="grid h-full min-h-0 grid-cols-3 gap-2">
      <Panel title="Graphics" icon="desktop" bodyClass="overflow-y-auto p-2">
        <Head icon="layers" className="mb-1 text-faint">
          Detail in the 3D views
        </Head>
        {(Object.keys(QUALITY) as Quality[]).map((q) => (
          <button key={q} onClick={() => (set({ quality: q }), sfx.toggle())} className={`mb-1 block w-full border p-2 text-left ${settings.quality === q ? 'border-accent bg-accent/10' : 'border-line hover:border-line2'}`}>
            <div className={`text-xs uppercase tracking-wider ${settings.quality === q ? 'text-accent' : 'text-fg'}`}>{QUALITY[q].label}</div>
            <div className="text-[11px] leading-snug text-dim">{QUALITY[q].note}</div>
          </button>
        ))}
        <div className="mt-1 text-[10px] leading-snug text-faint">If moving the camera around a building feels heavy, drop this a step. Shadows are only redrawn when something on the site changes, so a big campus costs little once it is built.</div>
        <Head icon="theme" className="mb-1 mt-3 text-faint">
          Interface colours
        </Head>
        <ThemePicker />
      </Panel>
      <Panel title="Camera and play" icon="camera" bodyClass="overflow-y-auto">
        <div className="px-2 pt-1">
          <Slider label="Camera speed" icon="gauge" value={settings.cameraSpeed} min={0.4} max={2.5} step={0.1} format={(v) => `${v.toFixed(1)}x`} onChange={(v) => set({ cameraSpeed: v })} hint="How fast the building camera pans, turns and zooms, by mouse and by keys." />
        </div>
        <Toggle icon="search" on={settings.zoomToPointer} onChange={(v) => set({ zoomToPointer: v })} title="Zoom toward the pointer" note="The scroll wheel zooms in on what is under the mouse, not the middle of the view." />
        <Toggle icon="person" on={settings.walkers} onChange={(v) => set({ walkers: v })} title="People on the move" note="Staff without a desk and visitors walk about the campus." />
        <Toggle icon="save" on={settings.autosave} onChange={(v) => set({ autosave: v })} title="Autosave" note="Saves at the end of each month and at big moments: a device going on sale, a new plot, a listing, a takeover." />
        <Toggle icon="bell" on={settings.pauseOnAlert} onChange={(v) => set({ pauseOnAlert: v })} title="Pause on alerts" note="Stops the clock when something needs a decision, such as a sell-out or a recall." />
      </Panel>
      <Panel title="Sound" icon="sound" bodyClass="p-2">
        <Slider label="Volume" icon="sound" value={vol} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => (setVol(v), setVolume(v), sfx.click())} />
        <Slider label="Background ambience" icon="campus" value={settings.ambience} min={0} max={1} step={0.05} format={(v) => (v ? `${Math.round(v * 100)}%` : 'off')} onChange={(v) => (set({ ambience: v }), setAmbienceLevel(v))} hint="The hum of the office, the factory floor, a busy store. There is no music." />
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
            <Btn key={name} small icon={SOUND_ICON[name]} onClick={play}>
              {name}
            </Btn>
          ))}
        </div>
        <div className="mt-2 text-[10px] leading-snug text-faint">Every sound is generated in the browser.</div>
        <ConfirmBtn small tone="default" icon="reset" className="mt-4 w-full" confirm="Put every setting back?" title="Graphics, camera, play and sound go back to how they were at first. Keys and colours are left alone." onClick={() => (resetSettings(), setVol(0.5), setVolume(0.5), setAmbienceLevel(DEFAULT_SETTINGS.ambience), sfx.confirm())}>
          Reset all settings
        </ConfirmBtn>
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
        <Head icon="folder" className="mb-1 text-faint">
          Sync folder
        </Head>
        {folder.state === 'unsupported' ? (
          <div className="text-[11px] leading-snug text-dim">This browser cannot write to a folder. Chrome and Edge on a computer can. Use Export to file to keep copies instead.</div>
        ) : (
          <>
            <div className="text-[11px] leading-snug text-dim">Pick a folder and every save is also written there as a file. Choose one inside OneDrive, Google Drive or Dropbox and your games follow you to any PC, and survive clearing the browser.</div>
            <div className="mt-2 flex items-center gap-2">
              <Btn small icon="folder" tone={folder.state === 'none' ? 'primary' : 'default'} onClick={() => run(chooseFolder, 'Folder set. Saves will be copied there from now on.')}>
                {folder.state === 'none' ? 'Choose a folder' : 'Change folder'}
              </Btn>
              {folder.state === 'locked' && (
                <Btn small tone="primary" icon="refresh" onClick={() => run(unlockFolder, 'Folder reconnected.')}>
                  Reconnect
                </Btn>
              )}
              {folder.state !== 'none' && (
                <Btn small tone="ghost" icon="close" onClick={() => run(forgetFolder, 'Folder forgotten. Files already there are untouched.')}>
                  Stop using it
                </Btn>
              )}
            </div>
            <div className={`num mt-1 text-[10px] ${folder.state === 'ready' ? 'text-pos' : folder.state === 'locked' ? 'text-warn' : 'text-faint'}`}>
              <Lead icon={folder.state === 'ready' ? 'check' : folder.state === 'locked' ? 'alert' : 'folder'} size={10} />
              {folder.state === 'ready' ? `Writing to "${folder.name}"` : folder.state === 'locked' ? `"${folder.name}" needs reconnecting: the browser asks again each visit` : 'No folder chosen'}
            </div>
          </>
        )}
      </div>
      <div className="border-t border-line pt-3">
        <Head icon="cloud" className="mb-1 text-faint">
          Online account
        </Head>
        {!cfg ? (
          <>
            <div className="text-[11px] leading-snug text-dim">Not set up. Online saves need a free Supabase project; the steps are in CLOUD.md in the game's folder. Paste the project address and public key here once you have them.</div>
            <TextInput value={url} onChange={setUrl} maxLength={200} placeholder="Project address (https://...supabase.co)" className="mt-2 w-full" />
            <TextInput value={key} onChange={setKey} maxLength={600} placeholder="Public (anon) key" className="mt-1 w-full" />
            <Btn small icon="check" className="mt-1" disabled={!url.trim() || !key.trim()} title={!url.trim() || !key.trim() ? "Paste the project address and its public key first" : undefined} onClick={() => (setCloudConfig(url, key), setCfg(cloudConfig()), setNote('Project saved. Now sign in or create an account.'))}>
              Use this project
            </Btn>
          </>
        ) : user ? (
          <>
            <div className="text-[11px] text-dim">
              Signed in as <span className="text-fg">{user}</span>. Every save is copied to your account and newer saves there are fetched when you open the load list.
            </div>
            <Btn small icon="quit" className="mt-2" onClick={() => (signOut(), setUser(null), setNote('Signed out.'))}>
              Sign out
            </Btn>
          </>
        ) : (
          <>
            <div className="text-[11px] leading-snug text-dim">Sign in to keep saves online and load them on any device.</div>
            <TextInput value={email} onChange={setEmail} placeholder="Email" aria-label="Email" maxLength={254} inputMode="email" autoComplete="email" className="mt-2 w-full" />
            <input type="password" aria-label="Password" maxLength={128} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="mt-1 h-7 w-full rounded-none border border-line2 bg-raise px-2 text-xs text-fg outline-none focus:border-accent" />
            <div className="mt-1 flex gap-1">
              <Btn small tone="primary" icon="key" disabled={!email || password.length < 6} title={!email || password.length < 6 ? "Enter your email and a password of at least six characters" : undefined} onClick={() => run(() => signIn(email, password), 'Signed in.')}>
                Sign in
              </Btn>
              <Btn small icon="hire" disabled={!email || password.length < 6} title={!email || password.length < 6 ? "Enter your email and a password of at least six characters" : undefined} onClick={() => run(() => signUp(email, password), 'Account created.')}>
                Create account
              </Btn>
              {!cloudBuiltIn() && (
                <Btn small tone="ghost" icon="edit" onClick={() => (localStorage.removeItem('sb-cloud'), setCfg(null))}>
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
  /** What the last change did besides the obvious: whose key it took, or why nothing changed. */
  const [note, setNote] = useState('')
  // while a key is being chosen every key press is the answer, Esc included: nothing else may act on it
  useLayer(!!waiting, undefined, { modal: true })

  useEffect(() => {
    if (!waiting) return
    const label = (id: string) => ACTIONS.find((a) => a.id === id)?.label ?? id
    const key = (e: KeyboardEvent) => {
      // a modifier on its own is the start of a combination, not a key; the game's keys are single keys
      if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return
      e.preventDefault()
      e.stopPropagation()
      const mine = keysFor(waiting.action)
      if (e.code === 'Escape' && waiting.action !== 'cancel') setNote('')
      else if (e.code === 'Backspace') {
        // Backspace clears a second key; the last key an action has stays, so nothing is left unreachable by accident
        if (!mine[waiting.slot]) setNote('')
        else if (mine.length < 2) setNote(`"${label(waiting.action)}" keeps at least one key. Press another key to change it.`)
        else (bind(waiting.action, mine.filter((_, i) => i !== waiting.slot)), setNote(`Removed ${keyName(mine[waiting.slot])} from ${label(waiting.action)}.`), sfx.toggle())
      } else if (!e.code || e.code === 'Unidentified') setNote('That key cannot be used: the browser does not say which one it is.')
      else if (mine[waiting.slot] === e.code) setNote('')
      else {
        const keys = [...mine]
        keys[waiting.slot] = e.code
        // a key does one thing at a time: take it away from anything else that had it, and say so
        const taken: string[] = []
        for (const other of ACTIONS) {
          if (other.id === waiting.action) continue
          const theirs = keysFor(other.id)
          if (theirs.includes(e.code)) (bind(other.id, theirs.filter((k) => k !== e.code)), taken.push(other.label))
        }
        bind(waiting.action, [...new Set(keys.filter(Boolean))])
        setNote(taken.length ? `${keyName(e.code)} now does "${label(waiting.action)}". It was taken from "${taken.join('", "')}".` : `${keyName(e.code)} now does "${label(waiting.action)}".`)
        sfx.confirm()
      }
      setWaiting(null)
    }
    // clicking anywhere else gives up on the change
    const away = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.('[data-keyslot]')) setWaiting(null)
    }
    window.addEventListener('keydown', key, true)
    window.addEventListener('pointerdown', away, true)
    return () => (window.removeEventListener('keydown', key, true), window.removeEventListener('pointerdown', away, true))
  }, [waiting, bind])

  const groups: Action['group'][] = ['Game', 'Screens', 'Building']
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between border border-line bg-panel px-2 py-[6px]">
        <span className="flex items-center gap-2 text-[11px] text-dim">
          <Icon name="keys" size={13} className={waiting ? 'text-accent' : 'text-faint'} />
          {waiting ? (waiting.action === 'cancel' ? 'Press the key to use. Click elsewhere to cancel.' : 'Press the key to use. Esc cancels, Backspace clears a second key.') : note || 'Click a key to change it. Each action can have two keys.'}
        </span>
        <ConfirmBtn small tone="default" icon="reset" confirm="Reset every key?" onClick={() => (resetKeys(), setNote('Every key is back to its default.'), sfx.confirm())}>
          Reset to defaults
        </ConfirmBtn>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-2">
        {groups.map((group) => (
          <Panel key={group} title={group} icon={GROUP_ICON[group]} bodyClass="overflow-y-auto">
            {ACTIONS.filter((a) => a.group === group).map((a) => {
              const keys = keysFor(a.id)
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 border-b border-line px-2 py-[5px] last:border-b-0">
                  <span className="text-[11px] text-fg">{a.label}</span>
                  <span className="flex shrink-0 gap-1">
                    {[0, 1].map((slot) => {
                      const on = waiting?.action === a.id && waiting.slot === slot
                      return (
                        <button key={slot} data-keyslot aria-label={`${a.label}, ${slot ? 'second' : 'first'} key: ${on ? 'press a key' : keys[slot] ? keyName(keys[slot]) : 'not set'}`} onClick={() => (setNote(''), setWaiting(on ? null : { action: a.id, slot: Math.min(slot, keys.length) }))} className={`num h-6 min-w-12 border px-2 text-[10px] uppercase ${on ? 'border-accent bg-accent/10 text-accent' : keys[slot] ? 'border-line2 text-fg hover:border-accent' : 'border-line text-faint hover:border-line2'}`}>
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
