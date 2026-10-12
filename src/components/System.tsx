// "Save and settings": saving and loading, the company's own details, and the
// way out. Also the save list, the theme picker and the file import that the
// main menu shares. (Settings and keys are in Settings.tsx.)
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { sfx } from '../audio/sfx'
import { DIFFICULTY, fmtDate, player, renameCompany } from '../sim/game'
import { openEverything } from '../sim/progress'
import { REGIONS } from '../sim/regions'
import { useGame, useStore, useView } from '../store/game'
import { AUTOSAVE, BEFORE_DEBT, type SaveMeta, deleteSave, exportGame, importGame, listSaves, loadGame, saveGame, slotName } from '../store/saves'
import { THEMES, type ThemeId, applyTheme, getTheme } from '../store/theme'
import { LogoPicker } from './LogoPicker'
import type { IconName } from './icons'
import { useSettings } from '../store/settings'
import { Btn, type Column, ConfirmBtn, ConfirmIconBtn, Fold, NameInput, Page, Panel, Row, Strip, Table, TextInput, money, pct, useKept } from './ui'
import { KeysPanel, SavesBeyond, SettingsPanel } from './Settings'

/** How long ago a save was made, in a few words: "just now", "2 hours ago", "yesterday", then the day. */
export function savedAgo(at: number, now = Date.now()): string {
  const d = new Date(at)
  if (!Number.isFinite(d.getTime())) return '--'
  const mins = Math.max(0, (now - at) / 60e3)
  if (mins < 1.5) return 'just now'
  if (mins < 60) return `${Math.round(mins)} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.round(mins / 1440)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' })
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

/** Open the game in a slot. Says what happened either way; false when there was nothing to open. */
export function loadSlot(slot: string): Promise<boolean> {
  const { resume, say } = useStore.getState()
  return loadGame(slot).then(
    (state) => {
      if (!state) return say('That save is no longer there.', 'bad'), false
      resume(state)
      sfx.confirm()
      say(`Loaded ${slotName(slot)}.`)
      return true
    },
    (e: unknown) => (say(loadError(e), 'bad'), false),
  )
}

export function SaveList({ onChanged, nonce = 0, inGame = false }: { /** A save was deleted, or one that was listed turned out to be gone. */ onChanged?: () => void; nonce?: number; /** A game is running: loading another leaves it, so it asks first. */ inGame?: boolean }) {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null)
  const [failed, setFailed] = useState(false)
  const { say } = useStore.getState()
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
  const changed = () => (refresh(), onChanged?.())
  const load = (slot: string) => void loadSlot(slot).then((ok) => !ok && alive.current && changed())
  if (!saves) return <div className="p-3 text-xs text-dim">Reading saves</div>
  if (failed) return <div className="p-3 text-xs leading-snug text-warn">The browser would not open its storage, so saves cannot be listed. This happens in private windows and when site data is blocked. Loading from a file still works.</div>
  if (!saves.length) return <div className="p-3 text-xs leading-snug text-dim">No saved games in this browser yet. The game saves by itself every month once a company is running.</div>
  const kept = (s: SaveMeta) => s.slot === AUTOSAVE || s.slot === BEFORE_DEBT
  const cols: Column<SaveMeta>[] = [
    { id: 'slot', head: 'Slot', cell: (s) => <span className={kept(s) ? 'text-dim' : ''}>{slotName(s.slot)}</span>, sort: (s) => slotName(s.slot) },
    { id: 'company', head: 'Company', cell: (s) => s.company, sort: (s) => s.company, min: 140, drop: 2 },
    { id: 'day', head: 'Game date', cell: (s) => fmtDate(s.day), sort: (s) => s.day, first: 'desc', min: 104, className: 'num' },
    { id: 'cash', head: 'Cash', num: true, cell: (s) => money(s.cash), sort: (s) => s.cash, min: 80, drop: 3 },
    { id: 'saved', head: 'Saved', cell: (s) => <span title={new Date(s.savedAt).toLocaleString()}>{savedAgo(s.savedAt)}</span>, sort: (s) => s.savedAt, first: 'desc', min: 104, drop: 1, className: 'text-dim' },
  ]
  return (
    <Table
      label="Saved games"
      cols={cols}
      rows={saves}
      rowKey={(s) => s.slot}
      rowTitle={(s) => `${slotName(s.slot)}: ${s.company}, ${fmtDate(s.day)}`}
      actionAlways={() => true}
      actionWidth={inGame ? 186 : 112}
      action={(s) => (
        <>
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
            title={`Delete ${slotName(s.slot)}`}
            onClick={() =>
              void deleteSave(s.slot).then(
                () => (say(`${slotName(s.slot)} deleted.`), changed()),
                () => (say('That save could not be deleted: the browser refused.', 'bad'), changed()),
              )
            }
          />
        </>
      )}
    />
  )
}

export function ThemePicker() {
  const [theme, setTheme] = useState<ThemeId>(getTheme())
  return (
    <div className="@container" role="group" aria-label="Interface colours">
      <div className="grid grid-cols-2 gap-1 @[300px]:grid-cols-4">
      {THEMES.map((t) => (
        <button key={t.id} type="button" aria-pressed={theme === t.id} onClick={() => (applyTheme(t.id), setTheme(t.id), sfx.toggle())} className={`flex h-7 min-w-0 items-center gap-2 border px-2 text-xs ${theme === t.id ? 'border-accent bg-accent/10 text-fg' : 'border-line2 text-dim hover:border-fg hover:text-fg'}`}>
          <span aria-hidden className="h-3 w-3 shrink-0" style={{ background: t.swatch }} />
          <span className="min-w-0 truncate">{t.name}</span>
        </button>
      ))}
      </div>
    </div>
  )
}

/** Larger than any real save by a wide margin. */
const MAX_SAVE_BYTES = 64 * 1048576

export function ImportButton({ label = 'Import save file', icon = 'import', inGame = false }: { label?: string; icon?: IconName; /** A game is running: say in the tooltip that loading a file leaves it. */ inGame?: boolean }) {
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
      <Btn icon={icon} title={inGame ? 'Open a save file from your computer. Choosing one leaves the company you are running.' : 'Open a save file from your computer'} onClick={() => input.current?.click()}>
        {label}
      </Btn>
    </>
  )
}

export function System() {
  const [view] = useView<'saves' | 'company' | 'settings' | 'keys'>('system', 'saves')
  return (
    <Page keep={`system:${view}`}>
      {view === 'saves' && <SavesPage />}
      {view === 'company' && <CompanyPage />}
      {view === 'settings' && <SettingsPanel />}
      {view === 'keys' && <KeysPanel />}
    </Page>
  )
}

function SavesPage() {
  const g = useGame()
  const { say } = useStore.getState()
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
  return (
    <>
      <Panel title="Save this game" icon="save" className="shrink-0" bodyClass="flex flex-wrap items-center gap-2 p-3">
        <TextInput value={slot} onChange={setSlot} onEnter={save} maxLength={24} className="w-56" placeholder="Slot name" aria-label="Slot name" />
        <Btn tone="primary" icon="save" disabled={!name} title={name ? 'Save to this slot (Enter in the field does the same). A slot of the same name is replaced.' : 'Give the slot a name first'} onClick={save}>
          Save
        </Btn>
        <span className="min-w-[16rem] flex-1 text-[11px] leading-snug text-faint">{autosave ? 'The game also saves itself every month and at big moments, and keeps a copy from just before the company goes into debt.' : 'Autosave is off (under Settings), so only the saves you make here are kept.'}</span>
      </Panel>
      <Panel
        title="Saved games"
        icon="folder"
        className="shrink-0"
        right={
          <>
            <Btn icon="export" title="Download this game as a file, to keep a copy outside the browser or move it to another computer" onClick={() => (exportGame(g), say('The save file is in your downloads.'))}>
              Export to file
            </Btn>
            <ImportButton inGame />
          </>
        }
      >
        <SaveList nonce={nonce} inGame />
      </Panel>
      <Fold title="Saves beyond this browser" icon="cloud" open={false} keep="system:beyond">
        <SavesBeyond />
      </Fold>
    </>
  )
}

/** A line of a form: what it is at the left, the control at the right. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <span className="shrink-0 text-xs text-dim">{label}</span>
      {children}
    </div>
  )
}

/** The newest save of the company being played: what quitting falls back to. */
function useLastSave(company: string, day: number) {
  const [last, setLast] = useState<SaveMeta | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    listSaves().then(
      (list) => live && setLast(list.filter((s) => s.company === company && s.day <= day).sort((a, b) => b.day - a.day || b.savedAt - a.savedAt)[0] ?? null),
      () => live && setLast(null),
    )
    return () => void (live = false)
  }, [company, day])
  return last
}

function CompanyPage() {
  const g = useGame()
  const { say, quit, act } = useStore.getState()
  const autosave = useSettings((s) => s.settings.autosave)
  const me = player(g)
  const rivals = g.companies.filter((c) => !c.isPlayer)
  const last = useLastSave(me.name, g.day)
  const guideOn = g.guide >= 0
  // with autosave on, leaving writes the Autosave slot first, so Continue on the menu picks the game up as it was left
  const saves = autosave && !g.gameOver
  const leave = () => {
    if (!saves) return quit()
    saveGame(AUTOSAVE, g).then(quit, quit)
  }
  const unsaved = g.gameOver
    ? 'This company has ended, so there is nothing to save.'
    : saves
      ? 'Nothing is lost: the game is saved to Autosave as you leave, and Continue on the main menu picks it up.'
      : last === undefined
        ? 'Autosave is off.'
        : last === null
          ? 'Autosave is off and this company has never been saved. Quitting now loses it: save it under Saves first.'
          : last.day === g.day
            ? `Autosave is off. Your last save, ${slotName(last.slot)}, is from today (${fmtDate(last.day)}): only what you have done since then is lost.`
            : `Autosave is off. Your last save, ${slotName(last.slot)}, is from ${fmtDate(last.day)}: everything since then is lost if you quit now.`
  const loses = !g.gameOver && !saves
  const home = REGIONS.find((r) => r.id === (g.config.home ?? 'na'))?.name
  const rename = (id: string, name: string) => {
    const err = act((s) => renameCompany(s, id, name))
    if (err) useStore.getState().say(err, 'bad')
  }
  return (
    <div className="grid shrink-0 grid-cols-2 items-start gap-2">
      <div className="flex min-w-0 flex-col gap-2">
        <Panel title="Your company" icon="campus" bodyClass="px-3 py-2">
          <Field label="Name">
            <NameInput aria-label="Your company name" value={me.name} maxLength={18} onChange={(v) => rename(me.id, v)} className="w-56 min-w-0" />
          </Field>
          <Field label="Brand colour">
            <input type="color" aria-label="Brand colour" value={me.color} onChange={(e) => act(() => void (me.color = e.target.value))} />
          </Field>
          <Field label="Logo">
            <LogoPicker value={me.logo} onChange={(logo) => act((s) => void (player(s).logo = logo))} />
          </Field>
          <div className="pb-1 pt-2 text-[11px] leading-snug text-faint">The logo is shown in the top bar and on new devices. Devices already on sale keep their model names.</div>
        </Panel>
        <Fold title="Rival companies" icon="rivals" open={false} keep="system:rivals" bodyClass="px-3 py-2">
          <div className="grid grid-cols-2 gap-x-4">
            {rivals.map((c) => (
              <div key={c.id} className="flex min-h-8 items-center gap-2">
                <input type="color" aria-label={`Colour of ${c.name}`} value={c.color} onChange={(e) => act(() => void (c.color = e.target.value))} />
                <NameInput aria-label={`Name of ${c.name}`} value={c.name} maxLength={18} onChange={(v) => rename(c.id, v)} className="min-w-0 flex-1" />
              </div>
            ))}
          </div>
          <div className="pt-2 text-[11px] leading-snug text-faint">Renaming and recolouring a rival applies to this save only.</div>
        </Fold>
        <Strip
          keep="system:rules"
          items={[
            { label: 'Difficulty', value: <span className="font-sans">{DIFFICULTY[g.config.difficulty]?.label ?? g.config.difficulty}</span> },
            { label: 'Growth', value: <span className="font-sans">{g.config.progression === 'guided' ? 'Start small' : 'Everything open'}</span> },
          ]}
        >
          <div className="px-3 py-1">
            {home && <Row k="Home market" v={<span className="font-sans">{home}</span>} />}
            <Row k="Research speed" v={pct(g.config.researchSpeed, 0)} />
            <Row k="Rival strength" v={pct(g.config.rivalStrength, 0)} />
            <Row k="Unlimited money" v={<span className="font-sans">{g.config.unlimitedMoney ? 'On' : 'Off'}</span>} />
            <Row k="World seed" v={g.config.seed} />
          </div>
        </Strip>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <Panel title="The guide" icon="goals" bodyClass="flex flex-col items-start gap-2 p-3">
          <div className="text-xs leading-snug text-dim">{guideOn ? 'The guide is on. It shows the next step in the strip along the bottom of the screen.' : 'The guide is off. Bringing it back starts it again from the first step.'}</div>
          {guideOn ? (
            <Btn icon="close" onClick={() => (act((s) => void (s.guide = -1)), say('The guide is off. It can be brought back under Save and settings, Company.'))}>
              Turn the guide off
            </Btn>
          ) : (
            <Btn icon="goals" onClick={() => (act((s) => void (s.guide = 0)), say('The guide is back, in the strip at the bottom of the screen.'))}>
              Bring the guide back
            </Btn>
          )}
          {g.config.progression === 'guided' && (
            <div className="mt-1 flex w-full flex-col items-start gap-2 border-t border-line pt-3">
              <div className="text-xs leading-snug text-dim">This company opens its screens one by one as it grows. You can stop earning them and have everything now.</div>
              <ConfirmBtn tone="default" icon="unlock" confirm="This cannot be undone. Open everything?" title="Open every screen and every lever now. This cannot be undone." onClick={() => (act((s) => openEverything(s)), say('Everything is open.'))}>
                Open everything now
              </ConfirmBtn>
            </div>
          )}
        </Panel>
        <Panel title="Interface colours" icon="theme" bodyClass="p-3">
          <ThemePicker />
        </Panel>
        <Panel title="Leave" icon="quit" bodyClass="flex flex-col items-start gap-2 p-3">
          <div className={`text-xs leading-snug ${loses ? 'text-warn' : 'text-dim'}`}>{unsaved}</div>
          <ConfirmBtn tone={loses ? 'danger' : 'default'} icon="quit" confirm={saves ? 'Save and quit to the main menu?' : g.gameOver ? 'Quit to the main menu?' : 'Quit and lose what is not saved?'} title={unsaved} onClick={leave}>
            Quit to main menu
          </ConfirmBtn>
        </Panel>
      </div>
    </div>
  )
}
