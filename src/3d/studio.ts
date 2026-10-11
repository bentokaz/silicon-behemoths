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
}

export const useStudio = create<Studio>(() => ({ caption: null, guides: [], hint: null }))

let hintTimer = 0
/** Show a hint over the studio for a moment. */
export function studioHint(text: string) {
  window.clearTimeout(hintTimer)
  if (useStudio.getState().hint !== text) useStudio.setState({ hint: text })
  hintTimer = window.setTimeout(() => useStudio.setState({ hint: null }), 2200)
}

/** Development only: freezes demonstrations at a moment in time so single frames can be inspected. */
export const studioDebug: { time: number | null } = { time: null }
