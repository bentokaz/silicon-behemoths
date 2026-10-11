// Line icons, drawn for this game: square caps, hard corners, one stroke
// weight. Each is a 24 x 24 path; nothing here is an emoji or a font glyph.
import type { CSSProperties } from 'react'

const PATHS = {
  // navigation
  overview: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  devices: 'M7 2h10v20H7zM10 5h4M11 19h2',
  research: 'M9 2h6M10 2v7L4 20h16L14 9V2M7 15h10',
  market: 'M3 21h18M5 21V11h3v10M10.5 21V5h3v16M16 21v-7h3v7',
  world: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  goals: 'M6 21V3M6 4h11l-2 4 2 4H6',
  factory: 'M3 21V10l6 4v-4l6 4V4h4v17zM7 17h2M13 17h2',
  stores: 'M3 9l2-5h14l2 5M4 9v12h16V9M3 9h18M9 21v-6h6v6',
  venue: 'M3 20h18M5 20v-7h14v7M7 13V7h10v6M10 7V4h4v3',
  marketing: 'M3 10v4h3l7 5V5L6 10zM16 9c1.5 1 1.5 5 0 6M18.5 6.5c3 3 3 8 0 11',
  care: 'M12 21l-8-8a5 5 0 017-7l1 1 1-1a5 5 0 017 7zM9 12h2l1-2 2 4 1-2h2',
  labs: 'M6 6h12v12H6zM9 9h6v6H9zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4',
  staff: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-2c0-3 3-5 7-5s7 2 7 5v2M17 4a4 4 0 010 7M19 14c2 1 3 2.500 3 5v2',
  campus: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 10h2M13 10h2M9 13h2M13 13h2',
  finance: 'M12 2v20M17 6H9.500a3 3 0 000 6h5a3 3 0 010 6H6',
  shares: 'M3 17l5-6 4 4 8-10M15 5h5v5',
  rivals: 'M4 4l16 16M20 4L4 20M8 2l-4 2 2 4M16 2l4 2-2 4',
  system: 'M4 6h10M18 6h2M4 12h2M10 12h10M4 18h12M20 18h0M14 4v4M6 10v4M16 16v4',
  // clock and files
  pause: 'M8 4v16M16 4v16',
  play: 'M7 4l12 8-12 8z',
  fast: 'M3 5l8 7-8 7zM13 5l8 7-8 7z',
  faster: 'M2 5l6 7-6 7zM9 5l6 7-6 7zM16 5l6 7-6 7z',
  save: 'M4 3h13l3 3v15H4zM8 3v6h7V3M8 21v-7h8v7',
  feed: 'M4 5h16M4 10h16M4 15h10M4 20h6',
  calendar: 'M4 5h16v16H4zM4 10h16M8 2v5M16 2v5',
  cash: 'M2 6h20v12H2zM12 9a3 3 0 100 6 3 3 0 000-6zM5 9v0M19 15v0',
  plus: 'M12 4v16M4 12h16',
  collapse: 'M14 5l-7 7 7 7M20 5l-7 7 7 7',
  expand: 'M10 5l7 7-7 7M4 5l7 7-7 7',
  close: 'M5 5l14 14M19 5L5 19',
  // building
  build: 'M14 4l6 6-3 3-6-6zM12.500 8.500L3 18v3h3l9.500-9.500',
  turn: 'M20 12a8 8 0 11-3-6.200M20 3v5h-5',
  sell: 'M3 12V3h9l9 9-9 9zM7.500 7.500v0',
  demolish: 'M3 21h18M6 21l1-9h10l1 9M9 12V7l3-4 3 4v5',
  rooms: 'M3 3h18v18H3zM3 12h9v9M12 3v5M12 12h4',
  furnish: 'M5 11V6h14v5M3 11h18v6H3zM5 17v3M19 17v3',
  walls: 'M3 5h18v14H3zM3 10h18M3 15h18M9 5v5M15 5v5M6 10v5M12 10v5M18 10v5M9 15v4M15 15v4',
  grounds: 'M12 21v-9M12 12c-5 0-7-3-7-7 4 0 7 2 7 7zM12 14c0-4 2-6 6-6 0 4-2 6-6 6zM4 21h16',
  look: 'M3 21h18M6 21V8l6-5 6 5v13M6 12h12M6 16h12',
  cutaway: 'M3 20h18M4 20v-5h16v5M4 15l3-3h10l3 3',
  wallsUp: 'M3 20h18M4 20V7h16v13M4 7l3-3h10l3 3',
  outside: 'M3 20h18M4 20V9l8-6 8 6v11M4 9h16M10 20v-6h4v6',
  day: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  dusk: 'M3 18h18M6 18a6 6 0 0112 0M12 6v3M4.500 10.500l2 2M19.500 10.500l-2 2M2 22h20',
  night: 'M20 14A8 8 0 019.500 4 8 8 0 1020 14z',
  box: 'M4 4h16v16H4z',
  round: 'M12 3a9 9 0 100 18 9 9 0 000-18z',
  diagonal: 'M4 20h16L4 4z',
  door: 'M6 21V3h12v18M3 21h18M14 12v1',
  glass: 'M4 3h16v18H4zM12 3v18M4 12h16M7 6l2-1M15 15l2-1',
  opening: 'M4 21V3h3M17 3h3v18M7 21H4M20 21h-3',
  wall: 'M4 3h16v18H4z',
  person: 'M12 11a4 4 0 100-8 4 4 0 000 8zM4 21v-2c0-3 3.500-5 8-5s8 2 8 5v2',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v0',
  keys: 'M2 6h20v12H2zM6 10h1M10 10h1M14 10h1M18 10h0M6 14h12',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM12 10a4 4 0 100 8 4 4 0 000-8z',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3.500 2',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 14, className = '', style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="square" strokeLinejoin="miter" className={`shrink-0 ${className}`} style={style} aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  )
}

/** The icon for each main screen. */
export const TAB_ICON: Record<string, IconName> = {
  dashboard: 'overview',
  products: 'devices',
  research: 'research',
  market: 'market',
  world: 'world',
  goals: 'goals',
  factory: 'factory',
  stores: 'stores',
  venue: 'venue',
  marketing: 'marketing',
  care: 'care',
  labs: 'labs',
  staff: 'staff',
  office: 'campus',
  finance: 'finance',
  shares: 'shares',
  rivals: 'rivals',
  system: 'system',
}
