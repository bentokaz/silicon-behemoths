// Line icons, drawn for this game: square caps, hard corners, one stroke
// weight. Each is a 24 x 24 path; nothing here is an emoji or a font glyph.
import type { CSSProperties } from 'react'

const PATHS = {
  // navigation
  city: 'M2 21h20M4 21V11h5v10M9 21V4h6v17M15 21V8h5v13M12 8v0M12 12v0M12 16v0M6.500 15v0M17.500 12v0M17.500 16v0',
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
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3.500 2',
  tag: 'M4 7h12l4 5-4 5H4zM8 12v0',
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
  walk: 'M12 2.500a1.800 1.800 0 100 3.600 1.800 1.800 0 000-3.600zM11 8l-3 4 2 1M11 8l2 5-2 4-1 4M13 13l3 3v5M11 8l4 2 2 3',
  day: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  dusk: 'M3 18h18M6 18a6 6 0 0112 0M12 6v3M4.500 10.500l2 2M19.500 10.500l-2 2M2 22h20',
  night: 'M20 14A8 8 0 019.500 4 8 8 0 1020 14z',
  box: 'M4 4h16v16H4z',
  round: 'M12 3a9 9 0 100 18 9 9 0 000-18z',
  diagonal: 'M4 20h16L4 4z',
  ring: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8z',
  fill: 'M12 3a9 9 0 100 18 9 9 0 000-18zM5.500 12.500l7-7M7.500 16.500l9-9M11.500 18.500l7-7',
  arc: 'M3 16a9 9 0 0118 0h-5a4 4 0 00-8 0z',
  arc34: 'M12 12h9a9 9 0 11-9-9z',
  arc14: 'M4 20V15A11 11 0 0115 4h5v5h-5a6 6 0 00-6 6v5z',
  door: 'M6 21V3h12v18M3 21h18M14 12v1',
  glass: 'M4 3h16v18H4zM12 3v18M4 12h16M7 6l2-1M15 15l2-1',
  opening: 'M4 21V3h3M17 3h3v18M7 21H4M20 21h-3',
  wall: 'M4 3h16v18H4z',
  person: 'M12 11a4 4 0 100-8 4 4 0 000 8zM4 21v-2c0-3 3.500-5 8-5s8 2 8 5v2',
  alert: 'M12 3l10 18H2zM12 10v5M12 18v0',
  keys: 'M2 6h20v12H2zM6 10h1M10 10h1M14 10h1M18 10h0M6 14h12',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM12 10a4 4 0 100 8 4 4 0 000-8z',
  // signs and actions
  minus: 'M4 12h16',
  check: 'M4 12l5 5L20 6',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v6M12 7v0',
  help: 'M12 3a9 9 0 100 18 9 9 0 000-18zM9.500 9.500a2.500 2.500 0 115 0c0 1.500-2.500 2-2.500 4M12 17v0',
  undo: 'M4 9h11a5 5 0 010 10H8M4 9l4-4M4 9l4 4',
  redo: 'M20 9H9a5 5 0 000 10h7M20 9l-4-4M20 9l-4 4',
  more: 'M5 12v0M12 12v0M19 12v0',
  chevronDown: 'M6 9l6 6 6-6',
  chevronUp: 'M6 15l6-6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  chevronLeft: 'M15 6l-6 6 6 6',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  company: 'M4 21V7h10v14M14 21V11h6v10M2 21h20M7 10h4M7 14h4M7 18h4M17 15v0M17 18v0',
  sites: 'M12 21s-6-5.500-6-10a6 6 0 0112 0c0 4.500-6 10-6 10zM12 9a2 2 0 100 4 2 2 0 000-4z',
  ban: 'M12 3a9 9 0 100 18 9 9 0 000-18zM5.600 5.600l12.800 12.800',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
  unlock: 'M5 11h14v10H5zM8 11V7a4 4 0 017.500-2',
  edit: 'M4 20h4L20 8l-4-4L4 16zM13 7l4 4',
  bin: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
  search: 'M10.500 3a7.500 7.500 0 100 15 7.500 7.500 0 000-15zM16 16l5 5',
  filter: 'M3 4h18l-7 8v8l-4-2v-6z',
  sort: 'M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4',
  stop: 'M6 6h12v12H6z',
  open: 'M10 4H4v16h16v-6M14 4h6v6M20 4l-9 9',
  arrowRight: 'M4 12h16M14 6l6 6-6 6',
  arrowLeft: 'M20 12H4M10 6l-6 6 6 6',
  arrowUp: 'M12 20V4M6 10l6-6 6 6',
  arrowDown: 'M12 4v16M6 14l6 6 6-6',
  reset: 'M4 12a8 8 0 103-6.200M4 3v5h5',
  refresh: 'M20 10a8 8 0 00-14.500-3M4 3v5h5M4 14a8 8 0 0014.500 3M20 21v-5h-5',
  swap: 'M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4',
  recall: 'M9 5L4 10l5 5M4 10h11a5 5 0 010 10H8',
  load: 'M12 3v12M7 10l5 5 5-5M4 17v4h16v-4',
  export: 'M12 15V3M7 8l5-5 5 5M4 17v4h16v-4',
  import: 'M3 12h12M10 7l5 5-5 5M14 4h6v16h-6',
  folder: 'M3 5h7l2 3h9v12H3z',
  cloud: 'M7 19a4 4 0 01-.500-8 6 6 0 0111.500-1.500 4.500 4.500 0 01-1 9.500z',
  quit: 'M10 4H4v16h6M9 12h12M16 7l5 5-5 5',
  key: 'M7.500 12a4.500 4.500 0 100 9 4.500 4.500 0 000-9zM11 13l9-9M17 7l3 3M14 10l2 2',
  gear: 'M9 2h6l1 3 3-1 3 5-2.500 3 2.500 3-3 5-3-1-1 3H9l-1-3-3 1-3-5 2.500-3L2 9l3-5 3 1zM12 9a3 3 0 100 6 3 3 0 000-6z',
  theme: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v18M12 8h8M12 12h9M12 16h8',
  sound: 'M4 10v4M8 6v12M12 9v6M16 4v16M20 10v4',
  bell: 'M6 17v-6a6 6 0 0112 0v6l2 2H4zM10 22h4',
  dice: 'M4 4h16v16H4zM8.500 8.500v0M15.500 15.500v0M12 12v0',
  doc: 'M5 3h10l4 4v14H5zM15 3v4h4M8 12h8M8 16h5',
  policy: 'M6 5h12v16H6zM9 3h6v4H9zM9 11h6M9 15h6',
  code: 'M8 6l-6 6 6 6M16 6l6 6-6 6M14 4l-4 16',
  branch: 'M6 3v18M6 13h5l7-7M13 6h5v5',
  merge: 'M4 4l8 8v9M20 4l-8 8',
  plot: 'M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6',
  gauge: 'M4 18a9 9 0 1116 0M12 18l4-7',
  target: 'M12 5a7 7 0 100 14 7 7 0 000-14zM12 2v6M12 16v6M2 12h6M16 12h6',
  hourglass: 'M6 3h12M6 21h12M7 3v4l5 5 5-5V3M7 21v-4l5-5 5 5v4',
  // money
  coins: 'M4 7c0-2 3.500-3 8-3s8 1 8 3-3.500 3-8 3-8-1-8-3zM4 7v5c0 2 3.500 3 8 3s8-1 8-3V7M4 12v5c0 2 3.500 3 8 3s8-1 8-3v-5',
  receipt: 'M5 3h14v18l-2.500-2-2.500 2-2-2-2 2-2.500-2L5 21zM9 8h6M9 12h6',
  wallet: 'M19 9V6H3v14h18V9H6M16 13h5v3h-5z',
  bank: 'M3 9l9-6 9 6zM5 9v9M10 9v9M14 9v9M19 9v9M3 18h18M3 21h18',
  briefcase: 'M3 8h18v12H3zM9 8V4h6v4M3 13h18',
  pie: 'M11 4a9 9 0 109 9h-9zM14 2a8 8 0 018 8h-8z',
  percent: 'M5 19L19 5M7 5a2 2 0 100 4 2 2 0 000-4zM17 15a2 2 0 100 4 2 2 0 000-4z',
  chart: 'M4 4v16h16M8 15l4-5 3 3 5-6',
  trendUp: 'M3 17l6-6 4 4 8-9M15 6h6v6',
  trendDown: 'M3 7l6 6 4-4 8 9M15 18h6v-6',
  raise: 'M5 4h14M12 21V9M7 14l5-5 5 5',
  // products and customers
  package: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  warehouse: 'M3 21V9l9-5 9 5v12M7 21v-8h10v8M7 17h10',
  layers: 'M12 3l9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5',
  star: 'M12 3l2.700 6 6.300.700-4.700 4.300 1.300 6.500L12 17.300 6.400 20.500l1.300-6.500L3 9.700 9.300 9z',
  review: 'M3 4h18v13H10l-5 4v-4H3zM7 9h10M7 13h6',
  eye: 'M2 12c3-5 6-7 10-7s7 2 10 7c-3 5-6 7-10 7s-7-2-10-7zM12 9a3 3 0 100 6 3 3 0 000-6z',
  brand: 'M6 3h12l4 6-10 12L2 9zM2 9h20M9 3l-2 6 5 12 5-12-2-6',
  heart: 'M12 21l-8-8a5 5 0 017-7l1 1 1-1a5 5 0 017 7z',
  headset: 'M4 14v-2a8 8 0 0116 0v2M4 13h3v6H4zM17 13h3v6h-3zM20 19v1a2 2 0 01-2 2h-4',
  shield: 'M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6zM8.500 12l2.500 2.500 4.500-5',
  wrench: 'M15 3l-3 3v4l-9 9 2 2 9-9h4l3-3-2-2-3 3-2-2 3-3z',
  bag: 'M5 8h14l1 13H4zM9 8V6a3 3 0 016 0v2',
  weight: 'M6 8h12l3 13H3zM9.500 8a2.500 2.500 0 015 0',
  // people
  morale: 'M12 3a9 9 0 100 18 9 9 0 000-18zM8 14c1 2 2.500 3 4 3s3-1 4-3M9 9v1M15 9v1',
  medal: 'M12 9a6 6 0 100 12 6 6 0 000-12zM8 3h8M8 3l2 6.500M16 3l-2 6.500',
  crown: 'M3 19h18M4 19L3 7l5 4 4-7 4 7 5-4-1 12',
  team: 'M9 3h6v5H9zM3 16h6v5H3zM15 16h6v5h-6zM12 8v4M6 16v-4h12v4',
  hire: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-2c0-3 3-5 7-5s7 2 7 5v2M19 5v6M16 8h6',
  fire: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-2c0-3 3-5 7-5s7 2 7 5v2M16 8h6',
  training: 'M2 9l10-5 10 5-10 5zM6 11.500V17c2 2 4 3 6 3s4-1 6-3v-5.500M22 9v6',
  desk: 'M3 8h18M5 8v12M19 8v12M12 8v6h7',
  seat: 'M6 3v10h11v8M6 13v8',
  // places and reach
  pin: 'M12 22c-4-5-7-8-7-12a7 7 0 0114 0c0 4-3 7-7 12zM12 7.500a2.500 2.500 0 100 5 2.500 2.500 0 000-5z',
  home: 'M3 11l9-8 9 8M5 9.500V21h14V9.500M10 21v-6h4v6',
  ship: 'M2 16h20l-3 5H5zM6 16v-5h12v5M9 11V7h6v4M12 7V3',
  truck: 'M2 6h12v11H2zM14 10h5l3 3v4h-8M6.500 17a2 2 0 100 4 2 2 0 000-4zM17.500 17a2 2 0 100 4 2 2 0 000-4z',
  // advertising and events
  social: 'M6 9.500a2.500 2.500 0 100 5 2.500 2.500 0 000-5zM18 3a2.500 2.500 0 100 5 2.500 2.500 0 000-5zM18 16a2.500 2.500 0 100 5 2.500 2.500 0 000-5zM8.200 10.800l7.500-4M8.200 13.200l7.500 4',
  billboard: 'M3 4h18v10H3zM7 14v7M17 14v7M3 21h18',
  press: 'M4 4h13v16H4zM17 8h3v10a2 2 0 01-2 2h-1M7 8h7M7 12h7M7 16h4',
  gamepad: 'M2 8h20v9h-4l-2-3H8l-2 3H2zM6 10v3M4.500 11.500h3M17 11.500h1',
  mic: 'M12 3a3 3 0 00-3 3v5a3 3 0 006 0V6a3 3 0 00-3-3zM6 11a6 6 0 0012 0M12 17v4M8 21h8',
  ticket: 'M3 7h18v4a1.500 1.500 0 000 3v4H3v-4a1.500 1.500 0 000-3zM14 7v11',
  // technology
  chip: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  os: 'M3 4h18v16H3zM3 9h18M6 6.500v0M9 6.500v0',
  display: 'M3 5h18v14H3zM7 15l4-6M12 15l2-3',
  battery: 'M2 7h17v10H2zM19 10h3v4h-3M6 10v4M10 10v4',
  bolt: 'M13 2L5 13h6l-1 9 9-12h-6z',
  memory: 'M2 7h20v9H2zM6 16v3M10 16v3M14 16v3M18 16v3',
  design: 'M12 2v4M12 6L6 21M12 6l6 15M8.500 15h7',
  // kinds of device
  phone: 'M7 2h10v20H7zM10 5h4M11 19h2',
  tablet: 'M4 3h16v18H4zM11 18h2',
  watch: 'M7 7h10v10H7zM9 7V2h6v5M9 17v5h6v-5',
  laptop: 'M5 5h14v10H5zM2 19h20M5 15l-2 4M19 15l2 4',
  desktop: 'M3 4h18v12H3zM12 16v4M8 20h8',
  earbuds: 'M5 4a3 3 0 100 6h1v10h2V7a3 3 0 00-3-3zM19 4a3 3 0 110 6h-1v10h-2V7a3 3 0 013-3z',
  tv: 'M2 5h20v12H2zM6 17l-2 4M18 17l2 4',
  foldable: 'M3 5l9-2 9 2v14l-9 2-9-2zM12 3v18',
  visor: 'M2 8h20v9h-7l-3-3-3 3H2zM6 8V6h12v2',
  speaker: 'M6 3h12v18H6zM12 12a3 3 0 100 6 3 3 0 000-6zM12 7v0',
  handheld: 'M2 7h20v10H2zM7 9h10v6H7zM4.500 11v2M19.500 12v0',
  ereader: 'M5 2h14v20H5zM8 6h8M8 9h8M8 12h8M8 15h5',
  smartring: 'M4 10a8 4 0 1016 0 8 4 0 10-16 0zM4 10v4a8 4 0 0016 0v-4M8 10a4 2 0 108 0 4 2 0 10-8 0z',
  actioncam: 'M3 7h18v13H3zM16 10a3.500 3.500 0 100 7 3.500 3.500 0 000-7zM6 11h4v4H6zM14 4h4v3',
  drone: 'M9 9h6v6H9zM9 9L5 5M15 9l4-4M9 15l-4 4M15 15l4 4M2 5h6M16 5h6M2 19h6M16 19h6',
  tower: 'M7 2h10v20H7zM10 5h4M10 8h4M12 15a2 2 0 100 4 2 2 0 000-4z',
  monitor: 'M2 4h20v12H2zM12 16v4M8 20h8',
  mouse: 'M7 9a5 5 0 0110 0v6a5 5 0 01-10 0zM12 4v6M7 10h10',
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
  city: 'city',
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

/** The icon for each research track. */
export const TRACK_ICON: Record<string, IconName> = {
  display: 'display',
  chipset: 'chip',
  camera: 'camera',
  battery: 'battery',
  charging: 'bolt',
  materials: 'layers',
  design: 'design',
}
export const trackIcon = (track: string): IconName => TRACK_ICON[track] ?? 'research'

/**
 * The icon for each kind of device. Keyed by plain string so a type added to
 * the game before it is added here still gets the generic device icon.
 */
export const TYPE_ICON: Record<string, IconName> = {
  phone: 'phone',
  tablet: 'tablet',
  watch: 'watch',
  laptop: 'laptop',
  desktop: 'desktop',
  console: 'gamepad',
  earbuds: 'earbuds',
  tv: 'tv',
  foldable: 'foldable',
  headset: 'visor',
  speaker: 'speaker',
  handheld: 'handheld',
  ereader: 'ereader',
  ring: 'smartring',
  actioncam: 'actioncam',
  drone: 'drone',
  tower: 'tower',
  monitor: 'monitor',
  mouse: 'mouse',
}
export const typeIcon = (type: string): IconName => TYPE_ICON[type] ?? 'devices'

/** The icon for each component category on the supply market. */
export const SUPPLY_ICON: Record<string, IconName> = { semis: 'chip', displays: 'display', memory: 'memory', batteries: 'battery', materials: 'layers' }
export const supplyIcon = (cat: string): IconName => SUPPLY_ICON[cat] ?? 'package'

/** The icon for each job. */
export const ROLE_ICON: Record<string, IconName> = { engineer: 'wrench', software: 'code', designer: 'design', researcher: 'research', marketer: 'marketing', support: 'headset' }
export const roleIcon = (role: string): IconName => ROLE_ICON[role] ?? 'person'

/** The icon for each advertising channel and each kind of event. */
export const CHANNEL_ICON: Record<string, IconName> = { online: 'search', social: 'social', tv: 'tv', outdoor: 'billboard', press: 'press', esports: 'gamepad' }
export const channelIcon = (channel: string): IconName => CHANNEL_ICON[channel] ?? 'marketing'
export const EVENT_ICON: Record<string, IconName> = { keynote: 'mic', expo: 'stores', fanfest: 'ticket', devcon: 'code' }
export const eventIcon = (event: string): IconName => EVENT_ICON[event] ?? 'calendar'

/** The icon for each line of the monthly costs. */
export const COST_ICON: Record<string, IconName> = { production: 'factory', rd: 'research', marketing: 'marketing', development: 'build', overhead: 'receipt', salaries: 'staff', facilities: 'campus', interest: 'percent' }
