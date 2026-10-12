// Save slots, export/import, audio and rival names. Also the shared save list
// used by the main menu.
import { useEffect, useRef, useState } from 'react'
import { getVolume, setVolume, sfx } from '../audio/sfx'
import { DIFFICULTY, fmtDate, player } from '../sim/game'
import { openEverything } from '../sim/progress'
import { useGame, useStore, useView } from '../store/game'
import { AUTOSAVE, BEFORE_DEBT, type SaveMeta, deleteSave, exportGame, importGame, listSaves, loadGame, saveGame, slotName } from '../store/saves'
import { THEMES, type ThemeId, applyTheme, getTheme } from '../store/theme'
import { LogoPicker } from './LogoPicker'
import type { IconName } from './icons'
import { useSettings } from '../store/settings'
import { Btn, ConfirmBtn, ConfirmIconBtn, NameInput, Panel, Row, TextInput, Th, money, Tabs, useKept } from './ui'
import { FeedbackLinks } from './Safety'
import { KeysPanel, SavesBeyond, SettingsPanel } from './Settings'

/** When a save was made, short enough for a narrow table: the time if it was today, otherwise the day. The tooltip has both. */
function savedWhen(at: number): string {
  const d = new Date(at)
  if (!Number.isFinite(d.getTime())) return '--'
  const today = new Date()
  const sameDay = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return sameDay ? `today ${time}` : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' })} ${time}`
}

/** Why a save could not be opened, in words that say what to do. */
const loadError = (e: unknown) => {
  const text = e instanceof Error ? e.message : String(e)
  if (e instanceof SyntaxError || /JSON|Unexpected (token|end)/i.test(text)) return 'That file is not a save: it is damaged or is some other kind of file. Choose a .sbsave.json file exported from the game.'
  // the checks on a save say what is wrong; these lines add what to do about it
  if (/not a Silicon Behemoths save/i.test(text)) return `${text.replace(/\.$/, '')}. Choose a .sbsave.json file exported from the game.`
  if (/newer version/i.test(text)) return `${text.replace(/\.$/, '')}. Reload the page to get the latest build, then load it again.`
  return text || 'That save could not be read.'
}

export function SaveList({ onChange, nonce = 0, inGame = false }: { onChange?: () => void; nonce?: number; /** A game is running: loading another leaves it, so it asks first. */ inGame?: boolean }) {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null)
  const [failed, setFailed] = useState(false)
  const { resume, say } = useStore.getState()
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => void (alive.current = false)
  }, [])
  const refresh = () =>
    void listSaves().then(
      (list) => alive.current && (setSaves(list), setFailed(false)),
      () => alive.current && (setSaves([]), setFailed(true)),
    )
  useEffect(refresh, [nonce])
  const load = (slot: string) =>
    void loadGame(slot).then(
      (state) => (state ? (resume(state), sfx.confirm(), say(`Loaded ${slotName(slot)}.`), onChange?.()) : (say('That save is no longer there.', 'bad'), refresh())),
      (e: unknown) => say(loadError(e), 'bad'),
    )
  if (!saves) return <div className="p-3 text-[11px] text-faint">Reading saves</div>
  if (failed) return <div className="p-3 text-[11px] leading-snug text-warn">The browser would not open its storage, so saves cannot be listed. This happens in private windows and when site data is blocked. Load from file still works.</div>
  if (!saves.length) return <div className="p-3 text-[11px] leading-snug text-faint">No saved games on this device yet. The game saves by itself every month once a company is running.</div>
  return (
    <table className="grid-table">
      <thead>
        <tr>
          <Th icon="save">Slot</Th>
          <Th icon="campus" className="@max-[470px]:hidden">Company</Th>
          <Th icon="calendar">Game date</Th>
          <Th icon="cash" r className="@max-[600px]:hidden">
            Cash
          </Th>
          <Th icon="clock" className="@max-[430px]:hidden">Saved</Th>
          <th />
        </tr>
      </thead>
      <tbody>
        {saves.map((s) => (
          <tr key={s.slot} className="row">
            <td className={`clip ${s.slot === AUTOSAVE || s.slot === BEFORE_DEBT ? 'text-dim' : ''}`} title={`${slotName(s.slot)}: ${s.company}`}>
              {slotName(s.slot)}
            </td>
            <td className="clip @max-[470px]:hidden" title={s.company}>
              {s.company}
            </td>
            <td className="num" title={`Saved ${new Date(s.savedAt).toLocaleString()}`}>
              {fmtDate(s.day)}
            </td>
            <td className="num r @max-[600px]:hidden">{money(s.cash)}</td>
            <td className="num text-dim @max-[430px]:hidden" title={new Date(s.savedAt).toLocaleString()}>
              {savedWhen(s.savedAt)}
            </td>
            <td className="r">
              {inGame ? (
                <ConfirmBtn small tone="default" icon="load" confirm="Leave this game?" title="Loading leaves the company you are running. Anything since its last save is lost." onClick={() => load(s.slot)}>
                  Load
                </ConfirmBtn>
              ) : (
                <Btn small icon="load" onClick={() => load(s.slot)}>
                  Load
                </Btn>
              )}
              <ConfirmIconBtn
                icon="bin"
                tone="danger"
                className="ml-1"
                title={`Delete ${slotName(s.slot)}`}
                onClick={() =>
                  void deleteSave(s.slot).then(
                    () => (say(`${slotName(s.slot)} deleted.`), refresh()),
                    () => (say('That save could not be deleted: the browser refused.', 'bad'), refresh()),
                  )
                }
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function ThemePicker() {
  const [theme, setTheme] = useState<ThemeId>(getTheme())
  return (
    <div className="grid grid-cols-4 gap-1">
      {THEMES.map((t) => (
        <button key={t.id} aria-pressed={theme === t.id} onClick={() => (applyTheme(t.id), setTheme(t.id), sfx.toggle())} className={`flex h-8 items-center gap-2 border px-2 text-[11px] transition-colors ${theme === t.id ? 'border-accent text-fg' : 'border-line2 text-dim hover:text-fg'}`}>
          <span className="h-3 w-3 shrink-0" style={{ background: t.swatch }} />
          {t.name}
        </button>
      ))}
    </div>
  )
}

/** Larger than any real save by a wide margin. */
const MAX_SAVE_BYTES = 64 * 1048576

export function ImportButton({ label = 'Import save file', icon = 'import' }: { label?: string; icon?: IconName }) {
  const input = useRef<HTMLInputElement>(null)
  const { resume, say } = useStore.getState()
  return (
    <>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          // a save is a few megabytes at most: anything far beyond that is the wrong file, and reading it would freeze the page
          if (file.size > MAX_SAVE_BYTES) return say(`That file is ${Math.round(file.size / 1048576)} MB, far too large to be a save. Choose a .sbsave.json file exported from the game.`, 'bad')
          if (file.size === 0) return say('That file is empty. Choose a .sbsave.json file exported from the game.', 'bad')
          void importGame(file).then(
            (state) => (resume(state), sfx.confirm(), say('Save file loaded.')),
            (err: unknown) => say(loadError(err), 'bad'),
          )
        }}
      />
      <Btn icon={icon} onClick={() => input.current?.click()}>
        {label}
      </Btn>
    </>
  )
}

export function System() {
  const [view] = useView<'saves' | 'company' | 'settings' | 'keys'>('system', 'saves')
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="min-h-0 flex-1">
        {(view === 'saves' || view === 'company') && <Saves />}
        {view === 'settings' && <SettingsPanel />}
        {view === 'keys' && <KeysPanel />}
      </div>
    </div>
  )
}

function Saves() {
  const g = useGame()
  const { say, quit, act } = useStore.getState()
  const autosave = useSettings((s) => s.settings.autosave)
  const [slot, setSlot] = useKept('system:slot', 'Slot 1')
  const [nonce, setNonce] = useState(0)
  const name = slot.trim()
  const save = () => {
    if (!name) return
    saveGame(name, g).then(
      () => (sfx.confirm(), say(`Saved to ${slotName(name)}.`), setNonce((n) => n + 1)),
      () => say('Saving failed: the browser would not store it (private window, blocked site data or a full disk). Use Export to file to keep a copy.', 'bad'),
    )
  }
  const leave = () => {
    // with autosave on, leaving writes the Autosave slot first, so the Continue list has the game as it was left
    if (!useSettings.getState().settings.autosave || g.gameOver) return quit()
    saveGame(AUTOSAVE, g).then(quit, quit)
  }
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_340px] gap-2">
      <div className="flex min-h-0 flex-col gap-2">
        <Panel title="Save game" icon="save" className="shrink-0" bodyClass="flex flex-wrap items-center gap-2 p-2">
          <TextInput value={slot} onChange={setSlot} onEnter={save} maxLength={24} className="w-56" placeholder="Slot name" aria-label="Slot name" />
          <Btn tone="primary" icon="save" disabled={!name} title={name ? undefined : 'Give the slot a name first'} onClick={save}>
            Save
          </Btn>
          <Btn icon="export" title="Download this game as a file, to keep a copy outside the browser or move it to another computer" onClick={() => (exportGame(g), say('The save file is in your downloads.'))}>
            Export to file
          </Btn>
          <ImportButton />
          <span className="min-w-[18rem] flex-1 text-[11px] text-faint">The game also autosaves every month and at big moments such as a device going on sale, and keeps a copy from just before the company goes into debt.</span>
        </Panel>
        <Panel title="Saved games" icon="folder" bodyClass="@container overflow-auto">
          <SaveList nonce={nonce} inGame />
        </Panel>
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        <Panel title="Saves beyond this browser" icon="cloud" className="shrink-0">
          <SavesBeyond />
        </Panel>
        <Panel title="Company logo" icon="brand" className="shrink-0" bodyClass="p-2">
          <LogoPicker value={player(g).logo} onChange={(logo) => act((s) => void (player(s).logo = logo))} />
          <div className="mt-2 text-[11px] leading-snug text-faint">Shown in the top bar and on new devices. On an existing draft, select the logo part in the advanced editor to switch it to the image.</div>
        </Panel>
        <Panel title="This game" icon="info" className="shrink-0" bodyClass="px-2 py-1">
          <Row icon="box" k="Mode" v="Sandbox" />
          <Row icon="gauge" k="Difficulty" v={DIFFICULTY[g.config.difficulty]?.label ?? g.config.difficulty} />
          <Row icon="branch" k="Growth" v={g.config.progression === "guided" ? "Start small" : "Everything open"} />
          <Row icon="research" k="Research speed" v={`${g.config.researchSpeed.toFixed(2)}x`} />
          <Row icon="rivals" k="Rival strength" v={`${g.config.rivalStrength.toFixed(2)}x`} />
          <Row icon="cash" k="Unlimited money" v={g.config.unlimitedMoney ? 'on' : 'off'} />
          <Row icon="dice" k="Seed" v={g.config.seed} />
        </Panel>
        <Panel title="Company names" icon="edit" className="shrink-0" bodyClass="px-2 py-1">
          {g.companies.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-[3px]">
              <input type="color" aria-label={`Colour of ${c.name}`} value={c.color} onChange={(e) => act(() => void (c.color = e.target.value))} />
              <NameInput aria-label={c.isPlayer ? 'Your company name' : `Name of ${c.name}`} value={c.name} maxLength={18} onChange={(v) => act(() => void (c.name = v))} className="h-6 min-w-0 flex-1" />
            </div>
          ))}
          <div className="py-1 text-[11px] text-faint">Renaming applies to this save. Devices already on sale keep their model names.</div>
        </Panel>
        {g.config.progression === 'guided' && (
          <ConfirmBtn tone="default" icon="unlock" className="shrink-0" confirm="This cannot be undone. Open everything?" title="Open every screen and lever now, as in a sandbox game. This cannot be undone." onClick={() => (act((s) => openEverything(s)), say('Everything is open.'))}>
            Stop earning screens: open everything
          </ConfirmBtn>
        )}
        {g.guide < 0 && (
          <Btn icon="goals" className="shrink-0" onClick={() => (act((s) => void (s.guide = 0)), say('The guide is back at the bottom of the screen.'))}>
            Run the guided start again
          </Btn>
        )}
        <FeedbackLinks className="shrink-0" />
        <ConfirmBtn icon="quit" className="shrink-0" confirm={autosave ? 'Quit? The game is autosaved first.' : 'Quit? Anything not saved is lost.'} onClick={leave}>
          Quit to main menu
        </ConfirmBtn>
      </div>
    </div>
  )
}
