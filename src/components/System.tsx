// Save slots, export/import, audio and rival names. Also the shared save list
// used by the main menu.
import { useEffect, useRef, useState } from 'react'
import { getVolume, setVolume, sfx } from '../audio/sfx'
import { fmtDate, player } from '../sim/game'
import { useGame, useStore } from '../store/game'
import { AUTOSAVE, BEFORE_DEBT, type SaveMeta, deleteSave, exportGame, importGame, listSaves, loadGame, saveGame, slotName } from '../store/saves'
import { THEMES, type ThemeId, applyTheme, getTheme } from '../store/theme'
import { LogoPicker } from './Company'
import { Btn, Panel, Row, Slider, TextInput, money, Tabs } from './ui'
import { KeysPanel, SavesBeyond, SettingsPanel } from './Settings'

export function SaveList({ onChange, nonce = 0 }: { onChange?: () => void; nonce?: number }) {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null)
  const { resume, say } = useStore.getState()
  const refresh = () => void listSaves().then(setSaves).catch(() => setSaves([]))
  useEffect(refresh, [nonce])
  if (!saves) return <div className="p-3 text-[11px] text-faint">Reading saves</div>
  if (!saves.length) return <div className="p-3 text-[11px] text-faint">No saved games on this device.</div>
  return (
    <table className="grid-table">
      <thead>
        <tr>
          <th>Slot</th>
          <th>Company</th>
          <th>Game date</th>
          <th className="r">Cash</th>
          <th>Saved</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {saves.map((s) => (
          <tr key={s.slot} className="row">
            <td className={s.slot === AUTOSAVE || s.slot === BEFORE_DEBT ? 'text-dim' : ''}>{slotName(s.slot)}</td>
            <td>{s.company}</td>
            <td className="num">{fmtDate(s.day)}</td>
            <td className="num r">{money(s.cash)}</td>
            <td className="num text-dim">{new Date(s.savedAt).toLocaleString()}</td>
            <td className="r">
              <Btn
                small
                onClick={() =>
                  void loadGame(s.slot)
                    .then((state) => state && (resume(state), sfx.confirm(), onChange?.()))
                    .catch((e: Error) => say(e.message, 'bad'))
                }
              >
                Load
              </Btn>
              <Btn small tone="danger" className="ml-1" onClick={() => void deleteSave(s.slot).then(refresh)}>
                Delete
              </Btn>
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
        <button key={t.id} onClick={() => (applyTheme(t.id), setTheme(t.id))} className={`flex h-8 items-center gap-2 border px-2 text-[11px] uppercase tracking-wider transition-colors ${theme === t.id ? 'border-accent text-fg' : 'border-line2 text-dim hover:text-fg'}`}>
          <span className="h-3 w-3 shrink-0" style={{ background: t.swatch }} />
          {t.name}
        </button>
      ))}
    </div>
  )
}

export function ImportButton({ label = 'Import save file' }: { label?: string }) {
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
          if (file)
            void importGame(file)
              .then((state) => (resume(state), sfx.confirm(), say('Save file loaded.')))
              .catch((err: Error) => say(err.message || 'Could not read that file', 'bad'))
        }}
      />
      <Btn onClick={() => input.current?.click()}>{label}</Btn>
    </>
  )
}

export function System() {
  const [view, setView] = useState<'saves' | 'settings' | 'keys'>('saves')
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-2">
      <Tabs value={view} onChange={setView} options={[{ value: 'saves', label: 'Saves and company' }, { value: 'settings', label: 'Settings' }, { value: 'keys', label: 'Keys' }]} />
      <div className="min-h-0 flex-1">
        {view === 'saves' && <Saves />}
        {view === 'settings' && <SettingsPanel />}
        {view === 'keys' && <KeysPanel />}
      </div>
    </div>
  )
}

function Saves() {
  const g = useGame()
  const { say, quit, act } = useStore.getState()
  const [slot, setSlot] = useState('Slot 1')
  const [nonce, setNonce] = useState(0)
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_340px] gap-2">
      <div className="flex min-h-0 flex-col gap-2">
        <Panel title="Save game" className="shrink-0" bodyClass="flex items-center gap-2 p-2">
          <TextInput value={slot} onChange={setSlot} maxLength={24} className="w-56" placeholder="Slot name" />
          <Btn
            tone="primary"
            disabled={!slot.trim()}
            onClick={() =>
              void saveGame(slot.trim(), g)
                .then(() => (sfx.confirm(), say(`Saved to ${slot.trim()}.`), setNonce((n) => n + 1)))
                .catch(() => say('Saving failed. Browser storage may be blocked.', 'bad'))
            }
          >
            Save
          </Btn>
          <Btn onClick={() => exportGame(g)}>Export to file</Btn>
          <ImportButton />
          <span className="text-[11px] text-faint">The game also autosaves every month and at big moments such as a device going on sale, and keeps a copy from just before the company goes into debt.</span>
        </Panel>
        <Panel title="Saved games" bodyClass="overflow-auto">
          <SaveList nonce={nonce} />
        </Panel>
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        <Panel title="Saves beyond this browser" className="shrink-0">
          <SavesBeyond />
        </Panel>
        <Panel title="Company logo" className="shrink-0" bodyClass="p-2">
          <LogoPicker value={player(g).logo} onChange={(logo) => act((s) => void (player(s).logo = logo))} />
          <div className="mt-2 text-[10px] leading-snug text-faint">Shown in the top bar and on new devices. On an existing draft, select the logo part in the advanced editor to switch it to the image.</div>
        </Panel>
        <Panel title="This game" className="shrink-0" bodyClass="px-2 py-1">
          <Row k="Mode" v="Sandbox" />
          <Row k="Difficulty" v={g.config.difficulty} />
          <Row k="Research speed" v={`${g.config.researchSpeed.toFixed(2)}x`} />
          <Row k="Rival strength" v={`${g.config.rivalStrength.toFixed(2)}x`} />
          <Row k="Unlimited money" v={g.config.unlimitedMoney ? 'on' : 'off'} />
          <Row k="Seed" v={g.config.seed} />
        </Panel>
        <Panel title="Company names" className="shrink-0" bodyClass="px-2 py-1">
          {g.companies.map((c) => (
            <div key={c.id} className="flex items-center gap-2 py-[3px]">
              <input type="color" value={c.color} onChange={(e) => act(() => void (c.color = e.target.value))} />
              <TextInput value={c.name} maxLength={18} onChange={(v) => act(() => void (c.name = v))} className="h-6 flex-1" />
            </div>
          ))}
          <div className="py-1 text-[10px] text-faint">Renaming applies to this save. Devices already on sale keep their model names.</div>
        </Panel>
        {g.guide < 0 && (
          <Btn className="shrink-0" onClick={() => (act((s) => void (s.guide = 0)), say('The guide is back at the bottom of the screen.'))}>
            Run the guided start again
          </Btn>
        )}
        <Btn tone="danger" className="shrink-0" onClick={quit}>
          Quit to main menu
        </Btn>
      </div>
    </div>
  )
}
