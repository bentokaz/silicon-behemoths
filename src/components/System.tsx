// Save slots, export/import, audio and rival names. Also the shared save list
// used by the main menu.
import { useEffect, useRef, useState } from 'react'
import { getVolume, setVolume, sfx } from '../audio/sfx'
import { fmtDate } from '../sim/game'
import { useGame, useStore } from '../store/game'
import { AUTOSAVE, type SaveMeta, deleteSave, exportGame, importGame, listSaves, loadGame, saveGame } from '../store/saves'
import { Btn, Panel, Row, Slider, TextInput, money } from './ui'

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
            <td className={s.slot === AUTOSAVE ? 'text-dim' : ''}>{s.slot}</td>
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
  const g = useGame()
  const { say, quit, act } = useStore.getState()
  const [slot, setSlot] = useState('Slot 1')
  const [nonce, setNonce] = useState(0)
  const [vol, setVol] = useState(getVolume())
  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_340px] gap-2 p-2">
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
          <span className="text-[11px] text-faint">The game also autosaves at the end of every month.</span>
        </Panel>
        <Panel title="Saved games on this device" bodyClass="overflow-auto">
          <SaveList nonce={nonce} />
        </Panel>
      </div>
      <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">
        <Panel title="Audio" className="shrink-0" bodyClass="px-2 py-1">
          <Slider label="Interface volume" value={vol} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => (setVol(v), setVolume(v), sfx.click())} />
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
        <Btn tone="danger" className="shrink-0" onClick={quit}>
          Quit to main menu
        </Btn>
      </div>
    </div>
  )
}
