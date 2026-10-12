// Settings and key bindings, shown under Save and settings and on the main
// menu; and where saves are kept besides this browser.
import { useEffect, useState } from 'react'
import { getVolume, setAmbienceLevel, setVolume, sfx } from '../audio/sfx'
import { chooseFolder, cloudBuiltIn, cloudConfig, cloudUser, folderState, forgetFolder, setCloudConfig, signIn, signOut, signUp, unlockFolder } from '../store/cloud'
import { ACTIONS, type Action, DEFAULT_SETTINGS, QUALITY, type Quality, keyName, keysFor, useSettings } from '../store/settings'
import { ThemePicker } from './System'
import { Icon, type IconName } from './icons'
import { Btn, ConfirmBtn, Head, IconBtn, Panel, Slider, TextInput, pct, useLayer } from './ui'

function Toggle({ on, onChange, title, note }: { on: boolean; onChange: (v: boolean) => void; title: string; note: string }) {
  return (
    <button type="button" onClick={() => (onChange(!on), sfx.toggle())} aria-pressed={on} className="flex w-full items-start gap-3 border-t border-line px-3 py-2 text-left hover:bg-hover">
      <span aria-hidden className={`mt-[2px] flex h-4 w-8 shrink-0 items-center border ${on ? 'justify-end border-accent' : 'justify-start border-line2'}`}>
        <span className={`h-full w-3 ${on ? 'bg-accent' : 'bg-mute'}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2 text-xs text-fg">
          {title}
          <span className={`shrink-0 text-[11px] ${on ? 'text-fg' : 'text-faint'}`}>{on ? 'On' : 'Off'}</span>
        </span>
        <span className="block text-[11px] leading-snug text-dim">{note}</span>
      </span>
    </button>
  )
}

const GROUP_ICON: Record<string, IconName> = { Game: 'play', Screens: 'overview', Pages: 'doc', Building: 'build', Designer: 'design' }

export function SettingsPanel({ theme = false }: { /** Offer the interface colours here too (the main menu; in a game they are under Company). */ theme?: boolean }) {
  const { settings, set, resetSettings } = useSettings()
  const [vol, setVol] = useState(getVolume())
  return (
    <div className="grid shrink-0 grid-cols-3 items-start gap-2">
      <Panel title="Graphics" icon="desktop" bodyClass="p-3">
        <div className="mb-1 text-[11px] text-dim">Detail in the 3D views</div>
        <div className="flex flex-col gap-1" role="group" aria-label="Detail in the 3D views">
          {(Object.keys(QUALITY) as Quality[]).map((q) => (
            <button key={q} type="button" aria-pressed={settings.quality === q} onClick={() => (set({ quality: q }), sfx.toggle())} className={`block w-full border px-3 py-2 text-left ${settings.quality === q ? 'border-accent bg-accent/10' : 'border-line2 bg-raise hover:border-fg'}`}>
              <div className={`text-xs ${settings.quality === q ? 'font-semibold text-accent' : 'text-fg'}`}>{QUALITY[q].label}</div>
              <div className="text-[11px] leading-snug text-dim">{QUALITY[q].note}</div>
            </button>
          ))}
        </div>
        <div className="mt-2 text-[11px] leading-snug text-faint">If moving the camera around a building feels heavy, drop this a step.</div>
        {theme && (
          <>
            <div className="mb-1 mt-3 text-[11px] text-dim">Interface colours</div>
            <ThemePicker />
          </>
        )}
      </Panel>
      <Panel title="Camera and play" icon="camera">
        <div className="px-3 pb-1 pt-2">
          <Slider label="Camera speed" value={settings.cameraSpeed} min={0.4} max={2.5} step={0.1} format={(v) => pct(v, 0)} onChange={(v) => set({ cameraSpeed: v })} hint="How fast the building camera pans, turns and zooms, by mouse and by keys." />
        </div>
        <Toggle on={settings.zoomToPointer} onChange={(v) => set({ zoomToPointer: v })} title="Zoom toward the pointer" note="The scroll wheel zooms in on what is under the mouse, not the middle of the view." />
        <Toggle on={settings.walkers} onChange={(v) => set({ walkers: v })} title="People on the move" note="Staff without a desk and visitors walk about the campus." />
        <Toggle on={settings.autosave} onChange={(v) => set({ autosave: v })} title="Autosave" note="Saves at the end of each month and at big moments, such as a device going on sale." />
        <Toggle on={settings.pauseOnAlert} onChange={(v) => set({ pauseOnAlert: v })} title="Pause on alerts" note="Stops the clock when something needs a decision, such as a sell-out or a recall." />
      </Panel>
      <Panel title="Sound" icon="sound" bodyClass="p-3">
        <Slider label="Volume" value={vol} min={0} max={1} step={0.05} format={(v) => (v ? pct(v, 0) : 'Off')} onChange={(v) => (setVol(v), setVolume(v), sfx.click())} />
        <Slider label="Background ambience" value={settings.ambience} min={0} max={1} step={0.05} format={(v) => (v ? pct(v, 0) : 'Off')} onChange={(v) => (set({ ambience: v }), setAmbienceLevel(v))} hint="The hum of the office, the factory floor, a busy store. There is no music." />
        <Btn icon="play" className="mt-2" title="Play a sound at the volume set above" onClick={() => sfx.launch()}>
          Test the sound
        </Btn>
        <div className="mt-2 text-[11px] leading-snug text-faint">There is no music: every sound is made in the browser.</div>
        <div className="mt-3 border-t border-line pt-3">
          <ConfirmBtn tone="default" icon="reset" confirm="Put every setting back?" title="Graphics, camera, play and sound go back to how they were at first. Keys and colours are left alone." onClick={() => (resetSettings(), setVol(0.5), setVolume(0.5), setAmbienceLevel(DEFAULT_SETTINGS.ambience), sfx.confirm())}>
            Reset all settings
          </ConfirmBtn>
        </div>
      </Panel>
    </div>
  )
}

/** Where saves are kept besides this browser: a folder on this computer, and an online account. */
export function SavesBeyond() {
  const [folder, setFolder] = useState<Awaited<ReturnType<typeof folderState>>>({ state: 'none' })
  const [user, setUser] = useState(cloudUser())
  const [cfg, setCfg] = useState(cloudConfig())
  const [url, setUrl] = useState(cfg?.url ?? '')
  const [key, setKey] = useState(cfg?.key ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [note, setNote] = useState<{ text: string; bad?: boolean } | null>(null)
  const refresh = () => void folderState().then(setFolder)
  useEffect(refresh, [])
  const run = (job: () => Promise<unknown>, done: string) =>
    void job()
      .then(() => (setNote({ text: done }), sfx.confirm(), refresh(), setUser(cloudUser()), setCfg(cloudConfig())))
      .catch((e: Error) => (e.name === 'AbortError' ? null : (setNote({ text: e.message, bad: true }), sfx.error())))
  const noProject = !url.trim() || !key.trim()
  const noLogin = !email || password.length < 6
  const loginWhy = noLogin ? 'Enter your email and a password of at least six characters first' : undefined
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-6 p-3">
        <div className="min-w-0">
          <Head icon="folder" className="mb-1 !text-fg">
            Sync folder
          </Head>
          {folder.state === 'unsupported' ? (
            <div className="text-xs leading-snug text-dim">This browser cannot write to a folder. Chrome and Edge on a computer can. Use Export to file to keep copies instead.</div>
          ) : (
            <>
              <div className="text-xs leading-snug text-dim">Pick a folder and every save is also written there as a file. Choose one inside OneDrive, Google Drive or Dropbox and your games follow you to any computer, and survive clearing the browser.</div>
              <div className={`mt-2 flex items-center gap-[6px] text-xs ${folder.state === 'ready' ? 'text-pos' : folder.state === 'locked' ? 'text-warn' : 'text-dim'}`}>
                <Icon name={folder.state === 'ready' ? 'check' : folder.state === 'locked' ? 'alert' : 'folder'} size={12} className="shrink-0" />
                <span className="min-w-0">{folder.state === 'ready' ? `Writing to "${folder.name}"` : folder.state === 'locked' ? `"${folder.name}" needs reconnecting: the browser asks again each visit` : 'No folder chosen'}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {folder.state === 'locked' && (
                  <Btn icon="refresh" onClick={() => run(unlockFolder, 'Folder reconnected.')}>
                    Reconnect
                  </Btn>
                )}
                <Btn icon="folder" onClick={() => run(chooseFolder, 'Folder set. Saves will be copied there from now on.')}>
                  {folder.state === 'none' ? 'Choose a folder' : 'Change folder'}
                </Btn>
                {folder.state !== 'none' && (
                  <Btn tone="ghost" icon="close" title="Stop copying saves to this folder. Files already there are left alone." onClick={() => run(forgetFolder, 'Folder forgotten. Files already there are untouched.')}>
                    Stop using it
                  </Btn>
                )}
              </div>
            </>
          )}
        </div>
        <div className="min-w-0 border-l border-line pl-6">
          <Head icon="cloud" className="mb-1 !text-fg">
            Online account
          </Head>
          {!cfg ? (
            <>
              <div className="text-xs leading-snug text-dim">Not set up. Online saves need a free Supabase project; the steps are in CLOUD.md in the game's folder. Paste the project address and public key here once you have them.</div>
              <TextInput value={url} onChange={setUrl} maxLength={200} aria-label="Project address" placeholder="Project address (https://...supabase.co)" className="mt-2 w-full" />
              <TextInput value={key} onChange={setKey} maxLength={600} aria-label="Public (anon) key" placeholder="Public (anon) key" className="mt-1 w-full" />
              <Btn icon="check" className="mt-2" disabled={noProject} title={noProject ? 'Paste the project address and its public key first' : undefined} onClick={() => {
                  const err = setCloudConfig(url, key)
                  if (err) return (setNote({ text: err, bad: true }), sfx.error())
                  setCfg(cloudConfig())
                  setNote({ text: 'Project saved. Now sign in or create an account.' })
                }}
              >
                Use this project
              </Btn>
            </>
          ) : user ? (
            <>
              <div className="text-xs leading-snug text-dim">
                Signed in as <span className="text-fg">{user}</span>. Every save is copied to your account, and newer saves there are fetched when you open the list of saved games.
              </div>
              <Btn icon="quit" className="mt-2" onClick={() => (signOut(), setUser(null), setNote({ text: 'Signed out.' }))}>
                Sign out
              </Btn>
            </>
          ) : (
            <>
              <div className="text-xs leading-snug text-dim">Sign in to keep saves online and load them on any device.</div>
              <TextInput value={email} onChange={setEmail} placeholder="Email" aria-label="Email" maxLength={254} inputMode="email" autoComplete="email" className="mt-2 w-full" />
              <input type="password" aria-label="Password" maxLength={128} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (six characters or more)" className="mt-1 h-7 w-full rounded-none border border-line2 bg-raise px-2 text-xs text-fg outline-none focus:border-accent" />
              <div className="mt-2 flex flex-wrap gap-2">
                <Btn icon="key" disabled={noLogin} title={loginWhy} onClick={() => run(() => signIn(email, password), 'Signed in.')}>
                  Sign in
                </Btn>
                <Btn icon="hire" disabled={noLogin} title={loginWhy} onClick={() => run(() => signUp(email, password), 'Account created.')}>
                  Create account
                </Btn>
                {!cloudBuiltIn() && (
                  <Btn tone="ghost" icon="edit" title="Forget this project and enter another" onClick={() => (localStorage.removeItem('sb-cloud'), setCfg(null))}>
                    Change project
                  </Btn>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {note && (
        <div role="status" className={`mx-3 mb-3 border px-3 py-2 text-xs ${note.bad ? 'border-neg text-neg' : 'border-line2 text-dim'}`}>
          {note.text}
        </div>
      )}
    </div>
  )
}

/**
 * The key groups, in the columns they are laid out in. With room for three
 * columns the single pages stand beside the destinations; with room for two
 * they go under them and the building keys keep the second column.
 */
const COLUMNS: { groups: Action['group'][]; place: string }[] = [
  { groups: ['Game', 'Screens'], place: 'col-start-1 row-start-1' },
  { groups: ['Pages'], place: 'col-start-1 row-start-2 @[900px]:col-start-2 @[900px]:row-start-1' },
  { groups: ['Building'], place: 'col-start-2 row-span-2 row-start-1 @[900px]:col-start-3 @[900px]:row-span-1' },
]
const GROUP_NOTE: Partial<Record<Action['group'], string>> = {
  Screens: 'Each key opens that part of the game at the page you last had open.',
  Pages: 'A key straight to one page. None has a key until you give it one.',
  Building: 'In any building view: drag to turn, right-drag to slide, scroll to zoom. Ctrl+Z and Ctrl+Shift+Z always undo and redo as well, whatever keys are set here. The designer has its own keys: Ctrl+Z and Ctrl+Y undo and redo, Delete removes the selected part.',
}
/** Groups whose actions can be left with no key at all. */
const mayBeUnset = (group: Action['group']) => group === 'Pages'

export function KeysPanel() {
  const { bind, resetKeys } = useSettings()
  useSettings((s) => s.binds)
  const [waiting, setWaiting] = useState<{ action: string; slot: number } | null>(null)
  /** What the last change did besides the obvious: whose key it took, or why nothing changed. */
  const [note, setNote] = useState('')
  // while a key is being chosen every key press is the answer, Esc included: nothing else may act on it
  useLayer(!!waiting, undefined, { modal: true })
  const asked = waiting ? ACTIONS.find((a) => a.id === waiting.action) : undefined

  useEffect(() => {
    if (!waiting) return
    const of = (id: string) => ACTIONS.find((a) => a.id === id)
    const label = (id: string) => of(id)?.label ?? id
    const key = (e: KeyboardEvent) => {
      // a modifier on its own is the start of a combination, not a key; the game's keys are single keys
      if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return
      e.preventDefault()
      e.stopPropagation()
      const mine = keysFor(waiting.action)
      if (e.code === 'Escape' && waiting.action !== 'cancel') setNote('')
      else if (e.code === 'Backspace') {
        // Backspace clears a key. The last key of an action stays, so nothing is left unreachable by accident;
        // a single page is the exception, since it starts with no key and can go back to having none
        const group = of(waiting.action)?.group
        if (!mine[waiting.slot]) setNote('')
        else if (mine.length < 2 && !(group && mayBeUnset(group))) setNote(`"${label(waiting.action)}" keeps at least one key. Press another key to change it.`)
        else (bind(waiting.action, mine.filter((_, i) => i !== waiting.slot)), setNote(`Removed ${keyName(mine[waiting.slot])} from "${label(waiting.action)}".`), sfx.toggle())
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

  const hint = !waiting ? note || 'Click a key to change it. An action can have two keys.' : waiting.action === 'cancel' ? 'Press the key to use. Click elsewhere to cancel.' : asked && mayBeUnset(asked.group) ? 'Press the key to use. Esc cancels, Backspace clears the key.' : 'Press the key to use. Esc cancels, Backspace clears a second key.'
  const slotBtn = (a: Action, keys: string[], slot: number) => {
    const on = waiting?.action === a.id && waiting.slot === slot
    const set = !!keys[slot]
    return (
      <button
        key={slot}
        type="button"
        data-keyslot
        aria-label={`${a.label}, ${slot ? 'second' : 'first'} key: ${on ? 'press a key' : set ? keyName(keys[slot]) : 'not set'}`}
        onClick={() => (setNote(''), setWaiting(on ? null : { action: a.id, slot: Math.min(slot, keys.length) }))}
        className={`h-7 min-w-14 shrink-0 whitespace-nowrap border px-2 text-xs ${on ? 'border-accent bg-accent/10 text-accent' : set ? 'num border-line2 bg-raise text-fg hover:border-fg' : 'border-dashed border-line2 text-faint hover:border-fg hover:text-fg'}`}
      >
        {on ? 'Press a key' : set ? keyName(keys[slot]) : 'Not set'}
      </button>
    )
  }
  return (
    <>
      <div className="flex min-h-9 shrink-0 items-center justify-between gap-3 border border-line bg-panel py-1 pl-3 pr-2">
        <span role="status" className={`flex min-w-0 items-center gap-2 text-xs ${waiting ? 'text-fg' : 'text-dim'}`}>
          <Icon name="keys" size={13} className={`shrink-0 ${waiting ? 'text-accent' : 'text-dim'}`} />
          <span className="min-w-0">{hint}</span>
        </span>
        <ConfirmBtn tone="default" icon="reset" className="shrink-0" confirm="Reset every key?" title="Put every key back to its default. Single pages go back to having no key." onClick={() => (resetKeys(), setNote('Every key is back to its default.'), sfx.confirm())}>
          Reset to defaults
        </ConfirmBtn>
      </div>
      <div className="@container shrink-0">
      <div className="grid grid-cols-2 items-start gap-2 @[900px]:grid-cols-3">
        {COLUMNS.map(({ groups, place }) => (
          <div key={groups.join()} className={`flex min-w-0 flex-col gap-2 ${place}`}>
            {groups.map((group) => (
              <Panel key={group} title={group} icon={GROUP_ICON[group]}>
                {ACTIONS.filter((a) => a.group === group).map((a) => {
                  const keys = keysFor(a.id)
                  const second = !!keys[1] || (waiting?.action === a.id && waiting.slot === 1)
                  return (
                    <div key={a.id} className="group/key flex min-h-8 items-center justify-between gap-2 border-b border-line py-[2px] pl-3 pr-2 last:border-b-0">
                      <span className="min-w-0 text-xs leading-tight text-fg">{a.label}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {slotBtn(a, keys, 0)}
                        {/* the place of a second key: offered when the row is pointed at or has the keyboard, so a column of them does not stand empty */}
                        {second ? (
                          slotBtn(a, keys, 1)
                        ) : (
                          <span data-keyslot className="flex w-14 shrink-0 opacity-0 focus-within:opacity-100 group-hover/key:opacity-100">
                            {!!keys[0] && <IconBtn icon="plus" tone="ghost" title={`Add a second key for "${a.label}"`} onClick={() => (setNote(''), setWaiting({ action: a.id, slot: 1 }))} />}
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}
                {GROUP_NOTE[group] && <div className="px-3 py-2 text-[11px] leading-snug text-faint">{GROUP_NOTE[group]}</div>}
              </Panel>
            ))}
          </div>
        ))}
      </div>
      </div>
    </>
  )
}
