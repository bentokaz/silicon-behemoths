// What the device studio is showing on top of the model right now. None of it
// is part of a design or a save: it lives only while the designer is open.
import { create } from 'zustand'
import type { Face } from '../sim/types'

/** A line across a face that a dragged part has snapped to. */
export interface Guide {
  face: Face
  /** 'x': the part's x is held, so the line runs up the face. 'y': it runs across. */
  axis: 'x' | 'y'
  at: number
}

interface Studio {
  /** Names the demonstration that is playing. */
  caption: { title: string; note: string } | null
  guides: Guide[]
  /** A short explanation of why something just moved by itself. */
  hint: string | null
  /** A foldable is being shown shut. */
  folded: boolean
  /** The Internals panel is open, so the device opens up to show what is inside. */
  internals: boolean
  /** The player would rather it stayed shut while they work under Internals. */
  keepClosed: boolean
  /** How far the layers are pulled apart, 0 (lid off) to 1 (fully exploded). */
  explode: number
  /** The row of the Internals panel the pointer is on: its components light up. A key such as 'battery' or 'io:usbc'. */
  hover: string | null
  /** The component picked on the opened device. */
  pick: Picked | null
  /** The component the pointer is on, on the opened device. */
  over: Picked | null
  /** The step of the guided tour of the opened device that is showing, or -1 when no tour is running. */
  tour: number
  /** How many steps the tour of this device has. */
  tourSteps: number
  /** Width in pixels of what covers the left and the right of the studio (the drawers), so that the opened device can be framed clear of them. */
  pad: [number, number]
}

/** A component of the opened device that has been clicked or pointed at: enough of it to label it and find its row. */
export interface Picked {
  id: string
  label: string
  figure: string
  specs: string[]
  partId?: string
  /** Where its size or count comes from, when no row of the Internals panel sets it. */
  note?: string
  kind?: string
}

export const useStudio = create<Studio>(() => ({ caption: null, guides: [], hint: null, folded: false, internals: false, keepClosed: false, explode: 0, hover: null, pick: null, over: null, tour: -1, tourSteps: 0, pad: [0, 0] }))

let hintTimer = 0
/** Show a hint over the studio for a moment. */
export function studioHint(text: string) {
  window.clearTimeout(hintTimer)
  if (useStudio.getState().hint !== text) useStudio.setState({ hint: text })
  hintTimer = window.setTimeout(() => useStudio.setState({ hint: null }), 2200)
}

/** Development only: freezes demonstrations at a moment in time so single frames can be inspected. */
export const studioDebug: { time: number | null; open: number | null; explode: number | null } = { time: null, open: null, explode: null }
