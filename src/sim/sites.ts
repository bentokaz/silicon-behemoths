// Buildable sites: campuses, factories, stores and event venues share one
// model. A site is an empty plot; the player zones rooms on it, the walls
// follow the rooms, and each kind of room takes its own furniture.
import { CLIP, type CurveSpec, type LiveTile, MIN_RADIUS, MIN_THICK, type Side, plotMark, bayBeyond, bayStands, curveAt, curveTiles, geomOf, holeOf, onCurve, settle } from './curves'
import type { Corner, Role, Room, Site, SiteItem, SiteKind } from './types'

export type Stage = 'in' | 'out' | 'belt' | 'split' | 'smt' | 'part' | 'assembly' | 'test' | 'pack'
/** Components a factory can make for itself instead of buying them in. Boards come from the board assembly line (stage 'smt'). */
export type Part = 'chip' | 'display' | 'cell' | 'casing' | 'camera' | 'psu'

/** Room type id used for open ground. */
export const OUT = 'out'

export interface ItemDef {
  name: string
  cost: number
  /** Footprint in tiles before rotation. */
  w: number
  h: number
  group: string
  note: string
  /** Room types this can stand in; OUT means open ground. */
  rooms: string[]
  /** Office: one employee can work here. */
  seats?: boolean
  comfort?: number
  prestige?: number
  /** Office: boosts one seated employee of this role. */
  station?: Role
  /** Office: places around a table for team meetings. */
  meet?: number
  /** Factory: what this machine does, its units per day and its daily running cost. */
  stage?: Stage
  cap?: number
  run?: number
  /** Factory: the component a part machine makes. */
  part?: Part
  /** Factory: power drawn at full output, kW; workers it needs on each shift. */
  kw?: number
  crew?: number
  /** Factory: kits a day a forklift carries along a lane. */
  carry?: number
  /** Factory belts: kits a day one tile carries. Receiving docks: kits a day it takes in. */
  belt?: number
  /** Factory: power it supplies (kW). */
  supply?: number
  /** Factory: machines one of these keeps serviced. */
  service?: number
  /** Factory: workers a shift it gives a place to change and eat. */
  houses?: number
  /** Factory: a buffer on the line, which rides out short stoppages. */
  buffer?: boolean
  /** Store: shoppers per day this fixture can serve. */
  visitors?: number
  /** Venue: people this seats, and how much it adds to the show. */
  crowd?: number
  show?: number
  /** Lies flat on the floor (rugs). */
  flat?: boolean
  /** Capability (an id from sim/progress.ts) a guided company needs before it can buy this. */
  needs?: string
}

const d = (name: string, cost: number, w: number, h: number, group: string, rooms: string[], note: string, extra: Partial<ItemDef> = {}): ItemDef => ({ name, cost, w, h, group, rooms, note, ...extra })

const DESKS = ['work', 'soft', 'eng', 'studio', 'media', 'support', 'lab']
const OFFICE_IN = ['lobby', 'work', 'exec', 'lab', 'eng', 'soft', 'studio', 'media', 'support', 'server', 'meeting', 'lounge', 'gym', 'atrium']
const SOCIAL = ['lobby', 'lounge', 'exec', 'atrium']

export const ITEMS: Record<SiteKind, Record<string, ItemDef>> = {
  office: {
    desk: d('Desk', 1200, 1, 1, 'Work', DESKS, 'Seats one employee.', { seats: true }),
    standing: d('Standing desk', 2200, 1, 1, 'Work', DESKS, 'Seats one employee and adds a little comfort.', { seats: true, comfort: 0.3 }),
    exec: d('Executive desk', 9000, 2, 1, 'Work', ['exec'], 'Seats one employee. Impresses visitors.', { seats: true, prestige: 2 }),
    bench: d('Lab bench', 14000, 2, 1, 'Work', ['lab'], 'Boosts one researcher by 25%.', { station: 'researcher' }),
    devrig: d('Device test rig', 12000, 1, 1, 'Work', ['eng'], 'Boosts one hardware engineer by 25%.', { station: 'engineer' }),
    printer3d: d('Prototype printer', 8000, 1, 1, 'Work', ['eng', 'lab', 'studio'], 'Prints housings overnight. Adds a little prestige.', { prestige: 0.6 }),
    server: d('Server rack', 20000, 1, 1, 'Work', ['server'], 'Boosts one software engineer by 25%.', { station: 'software' }),
    design: d('Design table', 11000, 2, 1, 'Work', ['studio'], 'Boosts one designer by 25%.', { station: 'designer' }),
    media: d('Media set', 13000, 2, 1, 'Work', ['media'], 'Boosts one marketer by 25%.', { station: 'marketer' }),
    helpdesk: d('Support console', 6000, 1, 1, 'Work', ['support'], 'Seats one employee and boosts one support agent by 25%.', { station: 'support', seats: true }),
    meeting: d('Meeting table', 9000, 2, 2, 'Meet', ['meeting', 'exec'], 'Six places for team meetings. Teams with a lead need them.', { comfort: 2, meet: 6 }),
    screen: d('Presentation screen', 3500, 2, 1, 'Meet', ['meeting', 'exec', 'media', 'support', 'work', 'soft'], 'A wall-sized display on a stand.', { comfort: 0.3, prestige: 0.3 }),
    booth: d('Phone booth', 4000, 1, 1, 'Meet', ['work', 'soft', 'eng', 'studio', 'media', 'support', 'lounge'], 'A quiet place for calls.', { comfort: 1 }),
    whiteboard: d('Whiteboard', 600, 1, 1, 'Meet', ['work', 'meeting', 'lab', 'eng', 'soft', 'studio', 'media', 'support', 'exec'], 'Somewhere to think out loud.', { comfort: 0.4 }),
    reception: d('Reception desk', 5000, 2, 1, 'Lobby', ['lobby'], 'Greets visitors. Adds prestige.', { prestige: 2 }),
    logowall: d('Logo wall', 3500, 2, 1, 'Lobby', ['lobby', 'exec', 'media', 'lounge'], 'Your logo, lit. Adds prestige.', { prestige: 2 }),
    showcase: d('Product showcase', 6000, 1, 1, 'Lobby', ['lobby', 'exec', 'atrium'], 'A glass case with your latest device.', { prestige: 1.5 }),
    coffee: d('Coffee bar', 3000, 2, 1, 'Comfort', ['lounge'], 'Everyone ends up here.', { comfort: 2.5 }),
    cafe: d('Café table', 1100, 1, 1, 'Comfort', ['lounge', 'atrium'], 'A small table and two chairs.', { comfort: 0.9 }),
    vending: d('Vending machine', 2400, 1, 1, 'Comfort', ['lounge', 'gym'], 'Snacks at any hour.', { comfort: 0.8 }),
    sofa: d('Sofa', 2000, 2, 1, 'Comfort', [...SOCIAL, 'meeting'], 'A place to sit that is not a desk.', { comfort: 1.6 }),
    armchair: d('Armchair', 700, 1, 1, 'Comfort', [...SOCIAL, 'meeting'], 'A single comfortable seat.', { comfort: 0.7 }),
    pingpong: d('Table tennis', 1500, 2, 1, 'Comfort', ['lounge', 'gym'], 'For breaks that get competitive.', { comfort: 2 }),
    arcade: d('Arcade cabinet', 2500, 1, 1, 'Comfort', ['lounge'], 'A classic in the corner.', { comfort: 1.2 }),
    treadmill: d('Treadmill', 3200, 1, 2, 'Comfort', ['gym'], 'Keeps the team moving.', { comfort: 1.8 }),
    weights: d('Weights rack', 2600, 2, 1, 'Comfort', ['gym'], 'Dumbbells and a bench.', { comfort: 1.6 }),
    yoga: d('Yoga mats', 500, 2, 1, 'Comfort', ['gym'], 'Two mats and some quiet.', { comfort: 1, flat: true }),
    plant: d('Plant', 250, 1, 1, 'Decor', OFFICE_IN, 'Adds a little comfort.', { comfort: 0.5 }),
    tree: d('Indoor tree', 1800, 1, 1, 'Decor', [...SOCIAL, 'work', 'studio'], 'A statement plant.', { comfort: 1, prestige: 0.5 }),
    bookshelf: d('Bookshelf', 900, 1, 1, 'Decor', ['work', 'exec', 'meeting', 'lounge', 'studio', 'soft', 'lab'], 'Books, awards and prototypes.', { comfort: 0.4 }),
    rug: d('Rug', 800, 2, 2, 'Decor', ['exec', 'lounge', 'lobby', 'meeting', 'studio'], 'Softens a room. Furniture cannot sit on it.', { comfort: 0.5, flat: true }),
    aquarium: d('Aquarium', 7000, 2, 1, 'Decor', ['lobby', 'lounge', 'exec'], 'Calming, and visitors notice it.', { comfort: 1.2, prestige: 1.5 }),
    sculpture: d('Sculpture', 15000, 1, 1, 'Decor', ['lobby', 'atrium', 'exec', OUT], 'Pure prestige.', { prestige: 4 }),
    planter: d('Planter', 1400, 2, 1, 'Grounds', ['atrium', 'lobby', OUT], 'A long bed of grasses and flowers.', { comfort: 0.8 }),
    gbench: d('Garden bench', 600, 2, 1, 'Grounds', ['atrium', OUT], 'A slatted bench for some air.', { comfort: 0.6 }),
    fountain: d('Fountain', 22000, 3, 3, 'Grounds', ['atrium', OUT], 'A round pool with a jet. Adds prestige and calm.', { comfort: 2.5, prestige: 4 }),
    otree: d('Tree', 900, 1, 1, 'Grounds', [OUT, 'atrium'], 'A full-grown tree.', { comfort: 0.4, prestige: 0.2 }),
    bamboo: d('Bamboo', 700, 1, 1, 'Grounds', [OUT, 'atrium', 'lobby', 'lounge'], 'A clump of canes, green, golden or black: a screen of living green.', { comfort: 0.5, prestige: 0.2 }),
    hedge: d('Hedge', 200, 1, 1, 'Grounds', [OUT, 'atrium'], 'Clipped green edging.', { comfort: 0.1 }),
    lamp: d('Lamp post', 500, 1, 1, 'Grounds', [OUT], 'Lights the grounds after dark.', { prestige: 0.1 }),
    parking: d('Parking bay', 1500, 3, 5, 'Grounds', [OUT], 'Marked space for one car.', { comfort: 0.3 }),
    bikes: d('Bike rack', 700, 2, 1, 'Grounds', [OUT], 'A row of hoops and a few bikes.', { comfort: 0.4 }),
    flag: d('Flagpole', 1200, 1, 1, 'Grounds', [OUT], 'Your colours, flying.', { prestige: 0.8 }),
    stairs: d('Staircase', 6000, 1, 3, 'Floors', OFFICE_IN, 'Rises to the floor above and opens a stairwell through it. Build a room over it up there to arrive in.'),
    lift: d('Lift', 24000, 2, 2, 'Floors', OFFICE_IN, 'Its shaft runs up through every floor above with a room over it, stopping at each. Adds a little prestige.', { prestige: 0.5 }),
    sign: d('Entrance sign', 6000, 3, 1, 'Grounds', [OUT], 'A stone sign with your name on it.', { prestige: 2.5 }),
  },
  factory: {
    dock_in: d('Receiving dock', 20000, 2, 1, 'Line', ['hall'], 'Raw materials and bought-in parts arrive here: 3,000 kits a day. A line starts at a receiving dock.', { stage: 'in', belt: 3000, kw: 10, crew: 2 }),
    dock_out: d('Shipping dock', 20000, 2, 1, 'Line', ['hall'], 'Finished devices leave here. A line ends at a shipping dock.', { stage: 'out', kw: 10, crew: 2 }),
    conveyor: d('Conveyor', 1200, 1, 1, 'Logistics', ['hall'], 'Carries 2,400 kits a day. Takes parts in at the back or either side.', { stage: 'belt', belt: 2400, kw: 1 }),
    ug_in: d('Underground belt entry', 2500, 1, 1, 'Logistics', ['hall'], 'Takes parts in at the back or sides and sends them under whatever lies ahead, to an exit facing the same way up to 6 tiles on. Carries 2,400 kits a day.', { stage: 'belt', belt: 2400, kw: 1 }),
    ug_out: d('Underground belt exit', 2500, 1, 1, 'Logistics', ['hall'], 'Where an underground belt comes up. Place it in line with an entry, facing the same way, within 6 tiles.', { stage: 'belt', belt: 2400, kw: 1 }),
    conveyor_2: d('Fast conveyor', 3500, 1, 1, 'Logistics', ['hall'], 'Carries 6,000 kits a day.', { stage: 'belt', belt: 6000, kw: 2 }),
    conveyor_3: d('Express conveyor', 9000, 1, 1, 'Logistics', ['hall'], 'Carries 15,000 kits a day.', { stage: 'belt', belt: 15000, kw: 4 }),
    splitter: d('Splitter', 6000, 1, 1, 'Logistics', ['hall'], 'Takes parts in at the back and sends them out of its front and both sides, to feed machines in parallel.', { stage: 'split', belt: 15000, kw: 2 }),
    arm: d('Robotic arm', 14000, 1, 1, 'Logistics', ['hall'], 'Lifts kits from a belt into the next machine: 5,000 a day, round a corner if need be.', { stage: 'belt', belt: 5000, kw: 3 }),
    buffer: d('Buffer rack', 18000, 2, 1, 'Logistics', ['hall'], 'Holds a few hours of kits on the line, so a stoppage upstream does not stop everything after it. Carries 6,000 a day.', { stage: 'belt', belt: 6000, buffer: true, kw: 2 }),
    smt: d('Board assembly line', 220000, 3, 1, 'Machines', ['hall'], 'Builds circuit boards. 700 units a day.', { stage: 'smt', cap: 700, run: 900, kw: 180, crew: 3 }),
    chippack: d('Chip packaging line', 380000, 3, 2, 'Components', ['hall'], 'Packages chips in-house instead of buying them ready-made. 900 a day.', { stage: 'part', part: 'chip', cap: 900, run: 800, kw: 240, crew: 3 }),
    laminator: d('Display lamination line', 300000, 3, 1, 'Components', ['hall'], 'Bonds glass, touch layer and panel into finished displays. 800 a day.', { stage: 'part', part: 'display', cap: 800, run: 600, kw: 160, crew: 3 }),
    cellline: d('Battery cell line', 340000, 3, 2, 'Components', ['hall'], 'Winds, fills and seals battery cells. 1,000 a day.', { stage: 'part', part: 'cell', cap: 1000, run: 700, kw: 260, crew: 3 }),
    cnc: d('CNC casing mill', 150000, 2, 2, 'Components', ['hall'], 'Mills metal casings from billet. 450 a day.', { stage: 'part', part: 'casing', cap: 450, run: 400, kw: 90, crew: 2 }),
    moulder: d('Injection moulder', 120000, 2, 1, 'Components', ['hall'], 'Moulds plastic casings. 900 a day.', { stage: 'part', part: 'casing', cap: 900, run: 300, kw: 120, crew: 1 }),
    cammod: d('Camera module cell', 260000, 2, 1, 'Components', ['hall'], 'Aligns lenses on sensors and seals the modules. 700 a day.', { stage: 'part', part: 'camera', cap: 700, run: 500, kw: 60, crew: 2 }),
    psuline: d('Power supply line', 140000, 2, 1, 'Components', ['hall'], 'Builds power supplies and chargers. 800 a day.', { stage: 'part', part: 'psu', cap: 800, run: 350, kw: 70, crew: 2 }),
    robot: d('Robotic assembly cell', 160000, 2, 2, 'Machines', ['hall'], 'Assembles devices. 500 units a day.', { stage: 'assembly', cap: 500, run: 700, kw: 110, crew: 2 }),
    manual: d('Assembly bench', 9000, 1, 1, 'Machines', ['hall'], 'Hand assembly. 60 units a day.', { stage: 'assembly', cap: 60, run: 180, kw: 3, crew: 2 }),
    test: d('Test station', 45000, 1, 1, 'Machines', ['hall'], 'Catches faults before shipping. Covers 450 units a day.', { stage: 'test', cap: 450, run: 250, kw: 20, crew: 1 }),
    pack: d('Packaging line', 60000, 2, 1, 'Machines', ['hall'], 'Boxes devices. 900 units a day.', { stage: 'pack', cap: 900, run: 300, kw: 40, crew: 1 }),
    rack: d('Storage rack', 5000, 2, 1, 'Storage', ['store', 'hall'], 'Tall shelving for parts.'),
    pallets: d('Pallet stack', 500, 1, 1, 'Storage', ['store', 'hall', OUT], 'Boxes on a pallet.'),
    forklift: d('Forklift', 18000, 1, 2, 'Storage', ['store', 'hall', OUT], 'Drives a forklift lane touching a dock and a rack or machine, and adds 900 kits a day to what the line can carry.', { carry: 900, kw: 2 }),
    lane: d('Forklift lane', 300, 1, 1, 'Storage', ['store', 'hall', OUT], 'A painted path for forklifts. Draw it from a dock to racks and machines; a forklift beside it runs it.'),
    console: d('Control desk', 30000, 2, 1, 'Control', ['control'], 'Operators watch the line from here: each desk cuts faults a little and keeps 8 machines from breaking down.', { service: 8 }),
    workshop: d('Maintenance workshop', 45000, 2, 1, 'Control', ['control', 'store', 'crew'], 'Technicians service the machines: each workshop keeps 14 from breaking down.', { service: 14 }),
    qa: d('Inspection bench', 16000, 2, 1, 'Control', ['control'], 'Samples are checked by hand. Each bench cuts faults a little.'),
    lockers: d('Lockers', 1500, 2, 1, 'Crew', ['crew'], 'Somewhere for coats and boots: room for 10 workers a shift.', { comfort: 0.5, houses: 10 }),
    canteen: d('Canteen table', 1200, 2, 1, 'Crew', ['crew'], 'A long table and benches: feeds 8 workers a shift.', { comfort: 1, houses: 8 }),
    vending: d('Vending machine', 2400, 1, 1, 'Crew', ['crew'], 'Snacks between shifts.', { comfort: 0.8 }),
    tank: d('Storage tank', 9000, 2, 2, 'Yard', [OUT], 'A steel tank on legs.'),
    generator: d('Gas generator', 420000, 3, 2, 'Power', [OUT], 'Adds 2,500 kW of power when the grid connection is not enough. Burns $2,600 of gas a day.', { supply: 2500, run: 2600 }),
    substation: d('Grid substation', 900000, 2, 2, 'Power', [OUT], 'A bigger connection to the grid: 6,000 kW more.', { supply: 6000, run: 300 }),
    solar: d('Solar array', 160000, 3, 3, 'Power', [OUT], 'Panels on frames in the yard: about 180 kW on average.', { supply: 180 }),
    truck: d('Truck bay', 4000, 3, 8, 'Yard', [OUT], 'A marked bay with a lorry waiting.'),
    otree: d('Tree', 900, 1, 1, 'Yard', [OUT], 'Softens the yard.'),
    bamboo: d('Bamboo', 700, 1, 1, 'Yard', [OUT], 'A clump of canes that screens the yard.'),
    lamp: d('Lamp post', 500, 1, 1, 'Yard', [OUT], 'Lights the yard.'),
    stairs: d('Staircase', 6000, 1, 3, 'Floors', ['hall', 'store', 'control', 'crew'], 'Rises to the floor above and opens a stairwell through it. Build a room over it up there to arrive in.'),
    lift: d('Lift', 24000, 2, 2, 'Floors', ['hall', 'store', 'control', 'crew'], 'Its shaft runs up through every floor above with a room over it, stopping at each.'),
  },
  store: {
    table: d('Display table', 6000, 2, 1, 'Fixtures', ['sales'], 'Shows your devices. Serves 70 shoppers a day.', { visitors: 70 }),
    demo: d('Demo pod', 5000, 1, 1, 'Fixtures', ['sales'], 'A single device to try. Serves 30 shoppers a day.', { visitors: 30 }),
    shelf: d('Accessory wall', 3000, 2, 1, 'Fixtures', ['sales'], 'Cases and chargers. Adds income per sale.'),
    counter: d('Checkout', 4000, 1, 1, 'Fixtures', ['sales'], 'A store needs at least one to sell anything.'),
    support: d('Support bar', 9000, 2, 1, 'Service', ['service', 'sales'], 'Repairs and help. Makes owners happier.'),
    repair: d('Repair bench', 7000, 2, 1, 'Service', ['service'], 'Fixes devices on the spot. Cuts the cost of warranty repairs.'),
    forum: d('Forum screen', 14000, 3, 1, 'Service', ['forum'], 'A video wall for classes and launches. Draws people in.', { comfort: 3 }),
    stools: d('Cube seats', 800, 2, 1, 'Service', ['forum', 'service', 'sales'], 'Four wooden cubes to sit on.', { comfort: 0.6 }),
    stockrack: d('Stock shelving', 2000, 2, 1, 'Back room', ['stock'], 'Boxed devices, ready to hand over.'),
    bench: d('Bench', 900, 1, 1, 'Decor', ['sales', 'service', 'forum', OUT], 'Somewhere to wait.', { comfort: 0.6 }),
    plant: d('Plant', 250, 1, 1, 'Decor', ['sales', 'service', 'forum', 'stock'], 'Softens the space.', { comfort: 0.5 }),
    tree: d('Indoor tree', 1800, 1, 1, 'Decor', ['sales', 'forum', 'service'], 'A statement plant.', { comfort: 1.2 }),
    logowall: d('Logo wall', 3500, 2, 1, 'Decor', ['sales', 'forum'], 'Your logo, lit.', { comfort: 1.5 }),
    rug: d('Rug', 800, 2, 2, 'Decor', ['sales', 'service', 'forum'], 'Softens the floor.', { comfort: 0.5, flat: true }),
    otree: d('Street tree', 900, 1, 1, 'Outside', [OUT], 'Shade by the door.', { comfort: 0.5 }),
    bamboo: d('Bamboo', 700, 1, 1, 'Decor', ['sales', 'service', 'forum', OUT], 'A clump of canes, green, golden or black.', { comfort: 0.6 }),
    planter: d('Planter', 1400, 2, 1, 'Outside', [OUT], 'Greenery at the entrance.', { comfort: 0.6 }),
    sign: d('Totem sign', 5000, 1, 1, 'Outside', [OUT], 'Your logo on a lit column.', { comfort: 1 }),
    stairs: d('Staircase', 6000, 1, 3, 'Floors', ['sales', 'service', 'forum', 'stock'], 'Rises to the floor above and opens a stairwell through it. Build a room over it up there to arrive in.'),
    lift: d('Lift', 24000, 2, 2, 'Floors', ['sales', 'service', 'forum', 'stock'], 'Its shaft runs up through every floor above with a room over it, stopping at each.'),
    escalator: d('Escalator', 38000, 2, 4, 'Floors', ['sales', 'service', 'forum'], 'A moving stair up to the floor above: takes a crowd where stairs take a queue.'),
  },
  venue: {
    stage: d('Stage', 60000, 6, 4, 'Stage', ['hall', OUT], 'The platform everything happens on. A venue needs one.', { show: 2 }),
    stage_l: d('Large stage', 170000, 10, 5, 'Stage', ['hall', OUT], 'A wide platform with a lighting truss over it, for a theatre-sized house.', { show: 5 }),
    stage_xl: d('Arena stage', 420000, 16, 6, 'Stage', ['hall', OUT], 'A platform for a stadium crowd, with a full lighting rig flown over it.', { show: 10 }),
    screen: d('Giant screen', 90000, 6, 1, 'Stage', ['hall', OUT], 'A wall of LEDs behind the presenter.', { show: 5 }),
    screen_l: d('LED wall', 260000, 10, 1, 'Stage', ['hall', OUT], 'A ten-metre wall of LEDs: the back rows see every detail.', { show: 10 }),
    screen_xl: d('Arena LED wall', 640000, 16, 1, 'Stage', ['hall', OUT], 'Sixteen metres of LEDs, as tall as a house.', { show: 18 }),
    lights: d('Lighting tower', 25000, 1, 1, 'Stage', ['hall', OUT], 'Moving heads on a truss.', { show: 1.5 }),
    speakers: d('Speaker stack', 20000, 1, 1, 'Stage', ['hall', OUT], 'So the back row hears it too.', { show: 1.5 }),
    camera: d('Camera riser', 15000, 2, 2, 'Stage', ['hall', OUT], 'Broadcast cameras for the livestream.', { show: 2 }),
    seats: d('Seating block', 9000, 3, 2, 'Seating', ['hall', OUT], 'Twelve seats on the flat.', { crowd: 12 }),
    seats_mid: d('Raised seating', 12000, 3, 2, 'Seating', ['hall', OUT], 'Twelve seats on a low riser.', { crowd: 12 }),
    seats_high: d('High seating', 15000, 3, 2, 'Seating', ['hall', OUT], 'Twelve seats on a tall riser, for the back.', { crowd: 12 }),
    demo: d('Hands-on table', 7000, 2, 1, 'Front of house', ['foyer', 'hall', OUT], 'Guests try the device after the show.', { show: 0.6 }),
    reception: d('Welcome desk', 5000, 2, 1, 'Front of house', ['foyer'], 'Badges and coffee.', { show: 0.3 }),
    logowall: d('Logo wall', 3500, 2, 1, 'Front of house', ['foyer', 'hall'], 'Your logo, lit.', { show: 0.3 }),
    sofa: d('Sofa', 2000, 2, 1, 'Front of house', ['foyer'], 'Somewhere to wait for doors.'),
    plant: d('Plant', 250, 1, 1, 'Front of house', ['foyer', 'hall'], 'Softens the space.'),
    otree: d('Tree', 900, 1, 1, 'Grounds', [OUT], 'A full-grown tree.'),
    bamboo: d('Bamboo', 700, 1, 1, 'Grounds', [OUT, 'foyer'], 'A clump of canes, green, golden or black.'),
    planter: d('Planter', 1400, 2, 1, 'Grounds', [OUT], 'A long bed of grasses.'),
    lamp: d('Lamp post', 500, 1, 1, 'Grounds', [OUT], 'Lights the way in.'),
    flag: d('Flagpole', 1200, 1, 1, 'Grounds', [OUT], 'Your colours, flying.'),
    fountain: d('Fountain', 22000, 3, 3, 'Grounds', [OUT], 'A round pool with a jet.', { show: 0.5 }),
    stairs: d('Staircase', 6000, 1, 3, 'Floors', ['foyer', 'hall'], 'Rises to the floor above and opens a stairwell through it. Build a room over it up there to arrive in.'),
    lift: d('Lift', 24000, 2, 2, 'Floors', ['foyer', 'hall'], 'Its shaft runs up through every floor above with a room over it, stopping at each.'),
    escalator: d('Escalator', 38000, 2, 4, 'Floors', ['foyer', 'hall'], 'A moving stair up to the floor above: takes a crowd where stairs take a queue.'),
  },
}

// ---------------------------------------------------------------- rooms

export interface RoomStyle {
  name: string
  floor: string
  /** Floor roughness. */
  rough: number
  wall: string
  /** Skirting and accent colour. */
  trim: string
}
export interface RoomDef {
  name: string
  /** Build cost per tile. */
  cost: number
  note: string
  styles: RoomStyle[]
  /** Capability (an id from sim/progress.ts) a guided company needs before it can build this. */
  needs?: string
}
const st = (name: string, floor: string, rough: number, wall: string, trim: string): RoomStyle => ({ name, floor, rough, wall, trim })

export const ROOMS: Record<SiteKind, Record<string, RoomDef>> = {
  office: {
    work: { name: 'Open office', cost: 350, note: 'Desks for anyone.', styles: [st('Oak and white', '#a8875f', 0.6, '#e9e5dd', '#2c3036'), st('Bare concrete', '#8b8d90', 0.75, '#bdb9b1', '#3a3d42'), st('Slate carpet', '#4c535f', 1, '#dfe2e6', '#1f2226'), st('Walnut and green', '#6a4f3a', 0.55, '#3e5146', '#d9c3a0')] },
    lobby: { name: 'Lobby', cost: 600, note: 'Reception, showcases and first impressions.', styles: [st('Pale stone', '#d5cfc4', 0.3, '#f0ede7', '#b28d66'), st('Black marble', '#2a2c30', 0.2, '#e4e1db', '#c9a25a'), st('Terrazzo', '#c9c1b5', 0.35, '#dfe6e4', '#3a5a55')] },
    exec: { name: 'Executive suite', cost: 800, needs: 'execs',note: 'Corner offices and the boardroom.', styles: [st('Walnut', '#5e4634', 0.5, '#e6dfd3', '#2b2118'), st('Charcoal', '#33373d', 1, '#c8ccd0', '#8a6a4f'), st('Ivory', '#cdbfa8', 0.6, '#f2efe9', '#6a4c38')] },
    lab: { name: 'Research lab', cost: 700, note: 'Lab benches for researchers.', styles: [st('Clean white', '#d9dde0', 0.35, '#f1f4f6', '#58b98a'), st('Sea green', '#9fb9b0', 0.4, '#e8efec', '#2f6b4c'), st('Graphite', '#565b62', 0.4, '#d5d9dd', '#58b98a')] },
    eng: { name: 'Hardware workshop', cost: 550, note: 'Test rigs and printers for hardware engineers.', styles: [st('Grey epoxy', '#7d8388', 0.45, '#d2d5d8', '#e0a23a'), st('Blue epoxy', '#52708c', 0.45, '#dfe3e6', '#f2f2f2'), st('Plywood', '#b99b72', 0.7, '#e7e2d8', '#3a3d42')] },
    soft: { name: 'Software studio', cost: 400, note: 'Desks, booths and screens for software engineers.', styles: [st('Navy carpet', '#2b3a55', 1, '#e3e6ea', '#8f7ad6'), st('Dark oak', '#6e563f', 0.55, '#2e3238', '#d9c3a0'), st('Moss carpet', '#4a5a48', 1, '#e7e4dc', '#2c3036')] },
    studio: { name: 'Design studio', cost: 500, needs: 'studio',note: 'Design tables, samples and daylight.', styles: [st('Pale oak', '#c9ab82', 0.55, '#f3f0ea', '#d6a24f'), st('Polished concrete', '#9a9c9f', 0.35, '#f0f0ee', '#1f2226'), st('Cork', '#a67c52', 0.9, '#ebe6dc', '#3f7d4d')] },
    media: { name: 'Marketing suite', cost: 450, needs: 'marketing',note: 'Media sets for the marketing team.', styles: [st('Blush carpet', '#7c5560', 1, '#f0e9e6', '#d65f7c'), st('Studio black', '#2b2d31', 0.8, '#3a3d42', '#e6e2da'), st('Sand', '#bfae93', 0.8, '#efeae0', '#31506b')] },
    support: { name: 'Support centre', cost: 380, needs: 'care',note: 'Consoles for support agents.', styles: [st('Teal carpet', '#3f6670', 1, '#e6ecec', '#5fb8c9'), st('Grey carpet', '#565c66', 1, '#e4e4e1', '#c9553d'), st('Birch', '#c7b08a', 0.6, '#eef0ee', '#3f6670')] },
    server: { name: 'Server room', cost: 900, needs: 'labs',note: 'Racks for software engineers to lean on.', styles: [st('Raised floor', '#3a3e44', 0.35, '#2a2d32', '#3fe08a'), st('White hall', '#c9ced3', 0.3, '#eef1f3', '#4f8fd6')] },
    meeting: { name: 'Meeting room', cost: 450, note: 'Tables where teams plan their work.', styles: [st('Felt grey', '#59606b', 1, '#d8dbdf', '#b28d66'), st('Warm oak', '#a8875f', 0.6, '#ece6da', '#2c3036'), st('Forest', '#3f5346', 1, '#e3e6df', '#d9c3a0')] },
    lounge: { name: 'Lounge and café', cost: 420, note: 'Coffee, sofas and games.', styles: [st('Herringbone', '#9a7650', 0.6, '#efe7d8', '#c9553d'), st('Checker tile', '#cfc9be', 0.35, '#394c57', '#f2b631'), st('Mustard', '#8a6a3a', 1, '#eee9df', '#2f5f3a')] },
    gym: { name: 'Fitness room', cost: 500, needs: 'people',note: 'Treadmills, weights and mats.', styles: [st('Rubber black', '#2f3236', 0.9, '#dcdfe2', '#e0a23a'), st('Maple court', '#c9a878', 0.45, '#eef0f0', '#31506b')] },
    atrium: { name: 'Atrium garden', cost: 650, needs: 'people',note: 'An indoor garden: trees, water and benches.', styles: [st('Sandstone', '#cbbf9f', 0.7, '#f1eee6', '#3f7d4d'), st('Slate', '#555a5f', 0.6, '#e6e8e6', '#4a8f58'), st('Moss', '#5c7a4e', 1, '#f0eee8', '#b28d66')] },
  },
  factory: {
    hall: { name: 'Production hall', cost: 500, note: 'The line: docks, conveyors and machines.', styles: [st('Grey epoxy', '#7d8388', 0.45, '#cfd3d6', '#e0b23a'), st('Green epoxy', '#4f7a66', 0.45, '#d9dedb', '#f2f2f2'), st('Blue epoxy', '#4a6a88', 0.45, '#dfe3e6', '#e0b23a')] },
    store: { name: 'Warehouse', cost: 300, note: 'Racks and pallets.', styles: [st('Sealed concrete', '#8c8e90', 0.6, '#c4c6c8', '#c9553d'), st('Dark concrete', '#5f6266', 0.6, '#b9bcc0', '#e0b23a')] },
    control: { name: 'Control room', cost: 700, note: 'Operators and inspectors. Cuts the fault rate.', styles: [st('Blue vinyl', '#3d4f66', 0.5, '#e4e8ec', '#5fb8c9'), st('White vinyl', '#cfd3d6', 0.4, '#f0f2f4', '#4f8fd6')] },
    crew: { name: 'Crew room', cost: 350, note: 'Lockers and a canteen for the shift.', styles: [st('Checker vinyl', '#b9b3a6', 0.5, '#e9e4d8', '#c9553d'), st('Oak vinyl', '#a8875f', 0.6, '#e6e9e6', '#4f7a66')] },
  },
  store: {
    sales: { name: 'Sales floor', cost: 900, note: 'Tables, demo pods and checkouts.', styles: [st('Pale stone', '#d6d1c8', 0.35, '#f2f0ec', '#b28d66'), st('Oak boards', '#a98a66', 0.6, '#f0ede6', '#2c3036'), st('Dark slate', '#3c4046', 0.4, '#dcdcd8', '#c9a25a'), st('White resin', '#e3e3e0', 0.25, '#f6f6f4', '#9aa0a6')] },
    service: { name: 'Service area', cost: 800, note: 'Support bars and repair benches.', styles: [st('Warm oak', '#b08f68', 0.6, '#ece8e0', '#3a5a55'), st('Graphite', '#4a4e54', 0.5, '#e2e4e6', '#5fb8c9')] },
    forum: { name: 'Forum', cost: 1000, note: 'A screen and seats for classes and launches.', styles: [st('Walnut steps', '#6a4f3a', 0.5, '#e9e4da', '#d9c3a0'), st('Soft grey', '#8d9197', 1, '#f0f0ee', '#2c3036')] },
    stock: { name: 'Stockroom', cost: 400, note: 'Back-of-house shelving.', styles: [st('Sealed concrete', '#8c8e90', 0.6, '#c9cbcd', '#3a3d42')] },
  },
  venue: {
    hall: { name: 'Auditorium', cost: 1200, note: 'An indoor hall for the stage and seating.', styles: [st('Black box', '#26282c', 0.8, '#1d1f23', '#c9a25a'), st('Walnut hall', '#5e4634', 0.5, '#3b2c22', '#d9c3a0'), st('Concrete hall', '#7c7f83', 0.6, '#b9b6ae', '#2c3036')] },
    foyer: { name: 'Foyer', cost: 700, note: 'Where guests arrive and try the device afterwards.', styles: [st('Pale stone', '#d5cfc4', 0.3, '#f0ede7', '#b28d66'), st('Terrazzo', '#c9c1b5', 0.35, '#e2e6e4', '#3a5a55'), st('Dark oak', '#6e563f', 0.55, '#ece6da', '#2c3036')] },
  },
}

/**
 * What each kind of room does for the company, in one line, as the
 * simulation has it: the builder shows it beside the room's name. A room is
 * where its furniture may stand; what counts is mostly that furniture.
 */
export const ROOM_EFFECT: Record<SiteKind, Record<string, string>> = {
  office: {
    work: 'Desks for any role. Only staff with a desk work; the rest wander the grounds.',
    lobby: 'Reception, logo wall and showcases add prestige, which draws more and better applicants.',
    exec: 'Executive desks seat your executives. Prestige from the furniture draws better applicants.',
    lab: 'Lab benches: each makes one researcher 25% faster, so research finishes sooner.',
    eng: 'Test rigs: each makes one hardware engineer 25% faster, so devices develop sooner.',
    soft: 'Desks, booths and screens for software engineers; server racks in a server room boost them.',
    studio: 'Design tables: each makes one designer 25% more effective, for more polish at release.',
    media: 'Media sets: each makes one marketer 25% better, so campaigns reach further.',
    support: 'Support consoles seat agents and make each 25% better: more owners helped a day.',
    server: 'Server racks: each makes one software engineer 25% faster.',
    meeting: 'Meeting tables: a team needs one place for every two members, or its lead is half as effective.',
    lounge: 'Coffee, sofas and games add comfort, which keeps staff morale up.',
    gym: 'Treadmills, weights and mats add comfort, which keeps staff morale up.',
    atrium: 'An indoor garden: trees, water and benches add comfort and prestige.',
  },
  factory: {
    hall: 'The production line: a receiving dock, machines linked side by side or by conveyor, and a shipping dock.',
    store: 'Racks and pallets for parts. For the look of the place: the line runs without one.',
    control: 'Each control desk or inspection bench cuts the fault rate by a tenth, up to 40%.',
    crew: 'Lockers and a canteen for the shift. For the look of the place: the line runs without one.',
  },
  store: {
    sales: 'Where devices are sold: it needs a door, a checkout, and display tables or demo pods to serve shoppers; accessory walls add income per sale.',
    service: 'Support bars make owners happier; repair benches cut the cost of warranty repairs.',
    forum: 'A screen and seats: their comfort adds to the store\'s appeal, which draws more shoppers in.',
    stock: 'Stock shelving: each rack lets the store serve 5% more shoppers, up to 20%.',
  },
  venue: {
    hall: 'An indoor hall for the stage and seating. A show can be staged in the open too; a hall dims for it.',
    foyer: 'Where guests arrive: a welcome desk, hands-on tables and a logo wall add to the production.',
  },
}

/**
 * The capability a room or a piece of furniture waits on, if any. Furniture
 * that only goes in rooms which are themselves waiting takes their capability.
 */
export function needsOf(kind: SiteKind, what: 'room' | 'item', id: string): string | undefined {
  if (what === 'room') return ROOMS[kind][id]?.needs
  const def = ITEMS[kind][id]
  if (!def) return undefined
  if (def.needs) return def.needs
  const homes = def.rooms.map((r) => (r === OUT ? undefined : ROOMS[kind][r]?.needs))
  return homes.every(Boolean) ? homes[0] : undefined
}

export const roomDef = (site: Pick<Site, 'kind'>, type: string): RoomDef | undefined => ROOMS[site.kind][type]
export const styleOf = (site: Pick<Site, 'kind'>, room: Room): RoomStyle => {
  const def = ROOMS[site.kind][room.type]
  return def.styles[room.style] ?? def.styles[0]
}

// ---------------------------------------------------------------- looks

export interface FacadeDef {
  id: string
  name: string
  color: string
  kind: 'solid' | 'glass' | 'brick' | 'timber' | 'panel'
  /** Cost per tile of floor to reclad the building. */
  cost: number
}
export const FACADES: FacadeDef[] = [
  { id: 'render', name: 'White render', color: '#e9e6e0', kind: 'solid', cost: 0 },
  { id: 'glass', name: 'Glass curtain wall', color: '#9cc4d8', kind: 'glass', cost: 260 },
  { id: 'brick', name: 'Red brick', color: '#96503c', kind: 'brick', cost: 90 },
  { id: 'timber', name: 'Timber cladding', color: '#a87b4f', kind: 'timber', cost: 120 },
  { id: 'metal', name: 'Dark metal panels', color: '#2e3238', kind: 'panel', cost: 150 },
  { id: 'concrete', name: 'Board-marked concrete', color: '#a3a19b', kind: 'solid', cost: 60 },
  { id: 'steel', name: 'Brushed steel', color: '#b6bcc2', kind: 'panel', cost: 200 },
]
export interface RoofDef {
  id: string
  name: string
  color: string
  cost: number
}
export const ROOFS: RoofDef[] = [
  { id: 'white', name: 'White membrane', color: '#e3e1dc', cost: 0 },
  { id: 'gravel', name: 'Dark gravel', color: '#4a4c50', cost: 20 },
  { id: 'green', name: 'Green roof', color: '#5c8a4e', cost: 110 },
  { id: 'solar', name: 'Solar panels', color: '#1f2c44', cost: 180 },
  { id: 'copper', name: 'Copper sheet', color: '#3f8f7a', cost: 220 },
]
export const MAX_FLOORS = 6
/** One-off cost per floor tile to add a storey. */
export const FLOOR_COST = 220

/** Ground finishes for open land. Which of them a plot offers, and which it starts with, depends on where it is: see groundsFor. */
export interface GroundDef {
  id: string
  name: string
  color: string
  rough: number
}
export const GROUNDS: GroundDef[] = [
  { id: 'grass', name: 'Lawn', color: '#5e8a4a', rough: 1 },
  { id: 'paving', name: 'Stone paving', color: '#b9b4a8', rough: 0.7 },
  { id: 'asphalt', name: 'Asphalt', color: '#3d4045', rough: 0.9 },
  { id: 'gravel', name: 'Gravel', color: '#a39a8a', rough: 1 },
  { id: 'deck', name: 'Timber deck', color: '#94704c', rough: 0.7 },
  { id: 'water', name: 'Water', color: '#3f7f9c', rough: 0.08 },
  { id: 'meadow', name: 'Wild meadow', color: '#7c9a4a', rough: 1 },
  { id: 'tile', name: 'Polished tile', color: '#d9d3c6', rough: 0.3 },
  { id: 'concrete', name: 'Concrete', color: '#8f918d', rough: 0.9 },
]

// ---------------------------------------------------------------- plots

export interface TierDef {
  name: string
  w: number
  h: number
  /** What surrounds the plot in the 3D view. */
  env: 'suburb' | 'estate' | 'park' | 'valley' | 'industrial' | 'mall' | 'street' | 'plaza'
  cost: number
  /** Monthly rent or upkeep for the land. */
  rent: number
  /** Stores: passers-by per day. */
  traffic?: number
  blurb: string
}
export const SITE_TIERS: Record<SiteKind, TierDef[]> = {
  office: [
    { name: 'Garage lot', w: 18, h: 13, env: 'suburb', cost: 0, rent: 2500, blurb: 'A house lot on a quiet street. Where it starts.' },
    { name: 'Workshop yard', w: 26, h: 18, env: 'estate', cost: 150e3, rent: 8000, blurb: 'A plot on a trading estate with room for a real office.' },
    { name: 'Business park plot', w: 38, h: 28, env: 'park', cost: 800e3, rent: 22e3, blurb: 'Landscaped land among other growing companies.' },
    { name: 'Headquarters site', w: 56, h: 40, env: 'park', cost: 4e6, rent: 60e3, blurb: 'A full block for a building with your name on it.' },
    { name: 'Campus', w: 80, h: 64, env: 'valley', cost: 22e6, rent: 160e3, blurb: 'Open land in the valley. Build whatever you can imagine.' },
  ],
  factory: [
    { name: 'Workshop plot', w: 22, h: 14, env: 'industrial', cost: 450e3, rent: 12e3, blurb: 'Room for one short production line.' },
    { name: 'Plant site', w: 34, h: 20, env: 'industrial', cost: 3e6, rent: 45e3, blurb: 'Space for several lines running side by side.' },
    { name: 'Gigafactory site', w: 52, h: 30, env: 'industrial', cost: 18e6, rent: 160e3, blurb: 'Volume manufacturing on your own terms.' },
    { name: 'Industrial park', w: 78, h: 44, env: 'industrial', cost: 60e6, rent: 420e3, blurb: 'Room for a dozen lines and the component plants that feed them.' },
    { name: 'Megafab campus', w: 110, h: 60, env: 'industrial', cost: 200e6, rent: 1.1e6, blurb: 'Millions of devices a month from one site.' },
  ],
  store: [
    { name: 'Mall unit', w: 10, h: 8, env: 'mall', cost: 120e3, rent: 14e3, traffic: 700, blurb: 'A small shop with steady passing trade.' },
    { name: 'High street plot', w: 14, h: 12, env: 'street', cost: 450e3, rent: 45e3, traffic: 1800, blurb: 'A proper storefront on a busy street.' },
    { name: 'Flagship plaza', w: 22, h: 18, env: 'plaza', cost: 2.5e6, rent: 160e3, traffic: 5000, blurb: 'A square of your own for a landmark store.' },
  ],
  venue: [
    { name: 'Courtyard stage', w: 22, h: 18, env: 'park', cost: 400e3, rent: 6000, blurb: 'A small plot for an open-air stage or a studio theatre.' },
    { name: 'Theatre site', w: 34, h: 26, env: 'park', cost: 2.5e6, rent: 25e3, blurb: 'Room for a proper theatre and a foyer.' },
    { name: 'Arena site', w: 50, h: 38, env: 'valley', cost: 9e6, rent: 70e3, blurb: 'Enough land for an amphitheatre that fills a skyline shot.' },
    { name: 'Stadium grounds', w: 72, h: 54, env: 'valley', cost: 28e6, rent: 190e3, blurb: 'A launch the whole industry watches: thousands of seats under one roof.' },
  ],
}
export const tierOf = (site: Pick<Site, 'kind' | 'tier'>) => SITE_TIERS[site.kind][site.tier]

/**
 * The ground finishes that make sense in each kind of surroundings; the first
 * is what the plot is laid with until something else is chosen. A unit inside
 * a mall stands on the mall's own tiled floor, a shop on a street or a square
 * on paving, a yard among sheds on concrete: only plots in green surroundings
 * start as lawn.
 */
const ENV_GROUNDS: Record<TierDef['env'], string[]> = {
  suburb: ['grass', 'paving', 'asphalt', 'gravel', 'deck', 'water', 'meadow', 'concrete'],
  estate: ['grass', 'paving', 'asphalt', 'gravel', 'deck', 'water', 'meadow', 'concrete'],
  park: ['grass', 'paving', 'asphalt', 'gravel', 'deck', 'water', 'meadow', 'concrete'],
  valley: ['grass', 'paving', 'asphalt', 'gravel', 'deck', 'water', 'meadow', 'concrete'],
  industrial: ['concrete', 'asphalt', 'paving', 'gravel', 'deck', 'grass', 'meadow', 'water'],
  mall: ['tile', 'paving', 'deck', 'concrete', 'water'],
  street: ['paving', 'asphalt', 'concrete', 'gravel', 'deck', 'grass', 'water'],
  plaza: ['paving', 'concrete', 'asphalt', 'gravel', 'deck', 'grass', 'meadow', 'water'],
}
const groundById = (id: string | undefined) => GROUNDS.find((g) => g.id === id)
/** The finishes a plot can be laid with, its default first. */
export const groundsFor = (site: Pick<Site, 'kind' | 'tier'>): GroundDef[] => ENV_GROUNDS[tierOf(site)?.env ?? 'park'].map((id) => groundById(id)!)
/** What open land on a plot is laid with where nothing else has been chosen. */
export const defaultGround = (site: Pick<Site, 'kind' | 'tier'>): GroundDef => groundsFor(site)[0]
/** The finish on a tile of open land. A finish the plot's surroundings do not offer shows as the default. */
export function groundAt(site: Pick<Site, 'kind' | 'tier' | 'floor'>, x: number, y: number): GroundDef {
  const id = site.floor[`${x},${y}`]
  if (!id) return defaultGround(site)
  const list = groundsFor(site)
  return list.find((g) => g.id === id) ?? list[0]
}
/** Things that only make sense under the open sky are kept out of a mall. */
export const itemAllowed = (site: Pick<Site, 'kind' | 'tier'>, kind: string) => !(kind === 'otree' && tierOf(site)?.env === 'mall')
/** Monthly cost of keeping one built tile lit, cleaned and insured. */
export const TILE_UPKEEP = 18
/** Monthly wage of each person a store's staffed fixtures need, and of the store's manager. */
export const STORE_WAGE = 3500
export const STORE_MANAGER = 4000
export const builtTiles = (site: Site) => site.grid.reduce((a, n) => a + (n ? 1 : 0), 0)
/** Rent and running costs: each storey of an office by what is built on it, any other building by its footprint times its height. */
export const upkeep = (site: Site) => tierOf(site).rent + TILE_UPKEEP * (site.upper?.length ? storeysOf(site).reduce((a, l) => a + builtTiles(l), 0) : builtTiles(site) * site.floors)

// ---------------------------------------------------------------- tiles and rooms

export const inPlot = (site: Pick<Site, 'w' | 'h'>, x: number, y: number) => x >= 0 && y >= 0 && x < site.w && y < site.h
/** Room number on a tile; 0 is open ground or off the plot. */
export const gridAt = (site: Pick<Site, 'w' | 'h' | 'grid'>, x: number, y: number) => (inPlot(site, x, y) ? site.grid[y * site.w + x] || 0 : 0)
export const roomOf = (site: Site, n: number) => site.rooms.find((r) => r.n === n)
export const roomAt = (site: Site, x: number, y: number) => {
  const n = gridAt(site, x, y)
  return n ? roomOf(site, n) : undefined
}
/** Room type on a tile, or OUT for open ground. */
export const typeAt = (site: Site, x: number, y: number) => roomAt(site, x, y)?.type ?? OUT
export const roomTiles = (site: Site, n: number) => site.grid.reduce((a, v) => a + (v === n ? 1 : 0), 0)

export type Shape = 'rect' | 'round' | 'ring' | 'diag'
/** How a round or ring shape is drawn out. */
export interface ShapeOpts {
  /** Rings: depth of the building from its outer wall to its inner wall, in metres. */
  thick?: number
  /** How much of a full turn to build, in degrees: 360, 270, 180 or 90. */
  sweep?: number
  /** Arcs: quarter turns, choosing which way the open side faces. */
  turn?: number
}
export const cutAt = (site: Pick<Site, 'cuts'>, x: number, y: number): Corner | undefined => site.cuts?.[`${x},${y}`]
/** The room seen through one side of a tile: 0 for open ground, and for the sides a diagonal cut has removed. */
export function faceId(site: Site, x: number, y: number, side: 'n' | 's' | 'e' | 'w'): number {
  const n = gridAt(site, x, y)
  if (!n) return 0
  const cut = cutAt(site, x, y)
  if (cut) return cut.includes(side) ? 0 : n
  // a tile on a curved edge only shows its room through the sides the curve leaves it: through the
  // others it shows whatever lies beyond the curve, open ground or the room that shares the wall
  if (onCurve(site, x, y)) {
    const live = curveAt(site, x, y)!
    if (live.shape.sides[side].reduce((a, [u, v]) => a + v - u, 0) < 0.02) return live.beyond
  }
  return n
}

/** A stretch of one side of a tile, as fractions from its north or west end, and the room seen through it (0 for open ground). */
export type Stretch = [number, number, number]
/** What shows through one side of a tile, stretch by stretch: one stretch unless a curved wall crosses the side. */
export function sideSpans(site: Site, x: number, y: number, side: Side, curved?: Map<string, LiveTile>): Stretch[] {
  const n = gridAt(site, x, y)
  if (!n) return [[0, 1, 0]]
  const cut = cutAt(site, x, y)
  if (cut) return [[0, 1, cut.includes(side) ? 0 : n]]
  const live = curved ? curved.get(`${x},${y}`) : curveAt(site, x, y)
  if (!live) return [[0, 1, n]]
  const out: Stretch[] = []
  let from = 0
  for (const [u, v] of live.shape.sides[side]) {
    if (u > from + 1e-9) out.push([from, u, live.beyond])
    out.push([Math.max(from, u), v, n])
    from = Math.max(from, v)
  }
  if (from < 1 - 1e-9) out.push([from, 1, live.beyond])
  return out
}

/** A stretch of straight wall on a grid edge: the rooms on its own tile's side and across it, from u0 to u1 along the edge. */
export interface EdgeRun {
  a: number
  c: number
  u0: number
  u1: number
}
/**
 * The straight walls standing on the north or west edge of a tile: one for
 * the whole edge in the ordinary case, shorter stretches where a curved wall
 * crosses it, none where the same room (or open ground) lies on both sides.
 * Pass the site's curved tiles when asking about many edges.
 */
export function edgeRuns(site: Site, x: number, y: number, side: 'n' | 'w', curved?: Map<string, LiveTile>): EdgeRun[] {
  const sa = sideSpans(site, x, y, side, curved)
  const sc = side === 'n' ? sideSpans(site, x, y - 1, 's', curved) : sideSpans(site, x - 1, y, 'e', curved)
  if (sa.length === 1 && sc.length === 1) return sa[0][2] !== sc[0][2] ? [{ a: sa[0][2], c: sc[0][2], u0: 0, u1: 1 }] : []
  const marks = [...new Set([0, 1, ...sa.flatMap((s) => [s[0], s[1]]), ...sc.flatMap((s) => [s[0], s[1]])])].sort((p, q) => p - q)
  const seen = (list: Stretch[], u: number) => list.find(([p, q]) => u > p && u < q)?.[2] ?? 0
  const out: EdgeRun[] = []
  for (let i = 0; i + 1 < marks.length; i++) {
    if (marks[i + 1] - marks[i] < 1e-9) continue
    const u = (marks[i] + marks[i + 1]) / 2
    const a = seen(sa, u)
    const c = seen(sc, u)
    const last = out[out.length - 1]
    if (a === c) continue
    if (last && last.a === a && last.c === c && Math.abs(last.u1 - marks[i]) < 1e-9) last.u1 = marks[i + 1]
    else out.push({ a, c, u0: marks[i], u1: marks[i + 1] })
  }
  return out
}
/**
 * True for a wall that fills its whole grid edge, so it can carry a real door.
 * A centimetre or two at either end that only squares off a corner a curve
 * clips does not count against it.
 */
export const wholeRun = (r: EdgeRun) => r.u0 <= CLIP && r.u1 >= 1 - CLIP
const NO_CURVES = new Map<string, LiveTile>()
/**
 * True where a grid edge can take a door or an opening: one wall along the
 * whole metre. Beside a curved wall the edge is often cut short, or walled in
 * two stretches with different rooms behind them, and the tile behind it is
 * the curved wall itself, where nobody can walk: a door there would lead
 * nowhere. Pass the site's curved tiles when asking about many edges.
 */
export function doorFits(site: Site, x: number, y: number, side: 'n' | 'w', curved?: Map<string, LiveTile>): boolean {
  return !!doorRun(site, x, y, side, curved)
}
/**
 * The one whole stretch of wall on a grid edge that a door can stand in, or
 * null. There must be floor to step onto on both sides: the corner a curved
 * wall leaves over on its own tile belongs to whoever stands against it, but
 * it is a sliver behind the curve and nobody can walk there, so a full metre
 * of wall that only shuts such a corner off takes no door.
 */
export function doorRun(site: Site, x: number, y: number, side: 'n' | 'w', curved?: Map<string, LiveTile>): EdgeRun | null {
  const live = curved ?? (site.curves?.length ? undefined : NO_CURVES)
  const runs = edgeRuns(site, x, y, side, live).filter((r) => r.u1 - r.u0 >= CLIP)
  if (runs.length !== 1 || !wholeRun(runs[0])) return null
  const floored = (tx: number, ty: number, facing: Side) => {
    const tile = live ? live.get(`${tx},${ty}`) : curveAt(site, tx, ty)
    return !tile || tile.shape.sides[facing].reduce((a, [u, v]) => a + v - u, 0) >= 1 - 2 * CLIP
  }
  return floored(x, y, side) && (side === 'n' ? floored(x, y - 1, 's') : floored(x - 1, y, 'e')) ? runs[0] : null
}
/** What to tell someone who asks for a door where one cannot stand. */
export const SHORT_WALL = 'A door needs a full metre of straight wall, and the curved wall cuts this stretch short. Put it in the curved wall itself, or on a whole stretch of straight wall.'
/** Room numbers on the two sides of an edge: [the tile's own side, the far side]. */
export const edgeIds = (site: Site, x: number, y: number, side: 'n' | 'w'): [number, number] => (side === 'n' ? [faceId(site, x, y, 'n'), faceId(site, x, y - 1, 's')] : [faceId(site, x, y, 'w'), faceId(site, x - 1, y, 'e')])

/** The two tiles an edge lies between: [inside tile, the one north or west of it]. */
export const edgeSides = (x: number, y: number, side: 'n' | 'w'): [[number, number], [number, number]] => [[x, y], side === 'n' ? [x, y - 1] : [x - 1, y]]
/**
 * True where a wall stands on a grid edge: two different rooms, or a room and
 * open ground, meet along some stretch of it. Read from the same stretches the
 * walls are drawn from (edgeRuns), so that a wall which is there to see is a
 * wall here too, however a curve divides the tiles on either side.
 */
export function isBoundary(site: Site, x: number, y: number, side: 'n' | 'w', curved?: Map<string, LiveTile>): boolean {
  if (!site.curves?.length) {
    const [a, b] = edgeIds(site, x, y, side)
    return a !== b
  }
  return edgeRuns(site, x, y, side, curved).some((r) => r.u1 - r.u0 >= CLIP)
}
export const wallAt = (site: Site, x: number, y: number, side: 'n' | 'w') => site.walls.find((w) => w.x === x && w.y === y && w.side === side)

/**
 * True where a partition can be put up: a grid edge between two whole tiles
 * of the same room, with no slant or curve on either. Nothing else stands
 * there, since walls only follow the outline of rooms.
 */
export function canPartition(site: Site, x: number, y: number, side: 'n' | 'w'): boolean {
  const [[ax, ay], [bx, by]] = edgeSides(x, y, side)
  if (!inPlot(site, ax, ay) || !inPlot(site, bx, by)) return false
  const n = gridAt(site, ax, ay)
  if (!n || gridAt(site, bx, by) !== n) return false
  return !cutAt(site, ax, ay) && !cutAt(site, bx, by) && !onCurve(site, ax, ay) && !onCurve(site, bx, by)
}
/** The partition on an edge inside a room, if one stands there. */
export const partAt = (site: Site, x: number, y: number, side: 'n' | 'w') => site.walls.find((w) => w.part && w.x === x && w.y === y && w.side === side)
/** True where a partition stands that people cannot walk through: a plain or glass one. */
export const partBlocks = (site: Site, x: number, y: number, side: 'n' | 'w') => {
  const p = partAt(site, x, y, side)
  return !!p && p.kind !== 'door' && p.kind !== 'open'
}

/**
 * What has been worked out about a plot, kept until the plot next changes.
 * Which rooms have a way in, and so which furniture can be reached, is asked
 * many times in every simulated day (once for each campaign, each store and
 * each of the staff's effects), and with curved walls it is slow to work out.
 * Every change to a plot moves its `rev` on; the lists of walls, furniture and
 * curves are watched too, so that a plot changed without going through an
 * action (a test, a migration) is never answered for from memory.
 */
interface Memo {
  rev: number
  walls: unknown
  nWalls: number
  items: unknown
  nItems: number
  curves: unknown
  nCurves: number
  grid: unknown
  open?: Set<number>
  reach?: SiteItem[]
}
const MEMO = new WeakMap<Site, Memo>()
function memoOf(site: Site): Memo {
  // the grid, the curves and the doors in curved walls are changed in place, so they are read, not just compared
  let mark = plotMark(site)
  for (const c of site.curves ?? []) for (const k in c.walls) mark += `,${k}${c.walls[k]}`
  const m = MEMO.get(site)
  if (m && m.rev === site.rev && m.grid === mark && m.walls === site.walls && m.nWalls === site.walls.length && m.items === site.items && m.nItems === site.items.length && m.curves === site.curves && m.nCurves === (site.curves?.length ?? 0)) return m
  const fresh: Memo = { rev: site.rev, walls: site.walls, nWalls: site.walls.length, items: site.items, nItems: site.items.length, curves: site.curves, nCurves: site.curves?.length ?? 0, grid: mark }
  MEMO.set(site, fresh)
  return fresh
}

/** Rooms people can get into: those with a door or an opening somewhere on their walls. The set is shared: read it, do not change it. */
export function openRooms(site: Site): Set<number> {
  const memo = memoOf(site)
  return (memo.open ??= findOpenRooms(site))
}
function findOpenRooms(site: Site): Set<number> {
  const open = new Set<number>()
  const curved = site.curves?.length ? curveTiles(site) : NO_CURVES
  for (const w of site.walls) {
    if (w.kind === 'glass') continue
    // a way in needs its whole metre of wall: a stretch a curved wall cuts short leads nowhere anyone can walk
    const run = doorRun(site, w.x, w.y, w.side, curved)
    if (!run) continue
    if (run.a) open.add(run.a)
    if (run.c) open.add(run.c)
  }
  site.curves?.forEach((c, i) => {
    for (const [bay, kind] of Object.entries(c.walls ?? {})) {
      if (kind === 'glass' || !bayStands(site, i, bay)) continue
      open.add(c.room)
      // a door in a curved wall two rooms share is a way into both
      for (const n of bayBeyond(site, i, bay)) open.add(n)
    }
  })
  return open
}

export function newSite(kind: SiteKind, tier: number): Site {
  const t = SITE_TIERS[kind][tier]
  return { kind, tier, w: t.w, h: t.h, grid: new Array(t.w * t.h).fill(0), rooms: [], nextRoom: 1, items: [], walls: [], floor: {}, facade: 0, roof: 0, floors: 1, rev: 0 }
}

/**
 * The curve a round or ring drag stands for, or null for the straight shapes
 * and for boxes too small to curve. A full turn sits inside the box. An arc
 * fills the box instead: half a turn has its centre on the middle of the open
 * side, a quarter turn in the corner the arc bends round.
 */
export function curveFor(x0: number, y0: number, x1: number, y1: number, shape: Shape, opts: ShapeOpts = {}): CurveSpec | null {
  if (shape !== 'round' && shape !== 'ring') return null
  const ax = Math.min(x0, x1)
  const bx = Math.max(x0, x1)
  const ay = Math.min(y0, y1)
  const by = Math.max(y0, y1)
  const w = bx - ax + 1
  const h = by - ay + 1
  if (![x0, y0, x1, y1].every(Number.isFinite)) return null
  const sweep = opts.sweep === 90 || opts.sweep === 180 || opts.sweep === 270 ? opts.sweep : 360
  const turn = Number.isFinite(opts.turn) ? (((Math.round(opts.turn!) % 4) + 4) % 4) : 0
  let cx = ax + w / 2
  let cy = ay + h / 2
  let rx = w / 2
  let ry = h / 2
  let from = 0
  if (sweep === 180) {
    // open to the south, west, north or east
    from = 180 + 90 * turn
    if (turn === 0) (cy = by + 1), (ry = h)
    else if (turn === 1) (cx = ax), (rx = w)
    else if (turn === 2) (cy = ay), (ry = h)
    else (cx = bx + 1), (rx = w)
  } else if (sweep === 90) {
    from = 180 + 90 * turn
    cx = turn === 0 || turn === 3 ? bx + 1 : ax
    cy = turn === 0 || turn === 1 ? by + 1 : ay
    rx = w
    ry = h
  } else if (sweep === 270) from = 90 + 90 * turn
  if (Math.min(rx, ry) < MIN_RADIUS) return null
  const spec: CurveSpec = { cx, cy, rx, ry }
  if (shape === 'ring') {
    const t = Math.max(MIN_THICK, Math.round(Number.isFinite(opts.thick) ? opts.thick! : 4))
    if (holeOf({ ...spec, t })) spec.t = t
  }
  if (sweep < 360) {
    spec.from = from % 360
    spec.sweep = sweep
  }
  return spec
}

/**
 * Tiles of a drag from one corner to the other: a rectangle, a right-angled
 * triangle with its square corner where the drag began, or a round shape (an
 * ellipse, ring or arc). Round shapes give the tiles at least half covered,
 * or with `touch` every tile the shape reaches at all, which is what a room
 * with a curved wall is built from.
 */
export function areaTiles(x0: number, y0: number, x1: number, y1: number, shape: Shape = 'rect', opts?: ShapeOpts, touch = false): [number, number][] {
  const ax = Math.min(x0, x1)
  const bx = Math.max(x0, x1)
  const ay = Math.min(y0, y1)
  const by = Math.max(y0, y1)
  const curve = curveFor(x0, y0, x1, y1, shape, opts)
  if (curve) return geomOf(curve).all.filter((t) => touch || t.cover >= 0.5).map((t): [number, number] => [t.x, t.y])
  const out: [number, number][] = []
  for (let x = ax; x <= bx; x++) {
    for (let y = ay; y <= by; y++) {
      if (shape === 'diag' && Math.abs(x - x0) / (bx - ax + 1) + Math.abs(y - y0) / (by - ay + 1) > 1 - 0.5 / Math.max(bx - ax + 1, by - ay + 1)) continue
      out.push([x, y])
    }
  }
  return out
}

/** Floor area of a set of tiles: a tile a curve cuts through counts only for the part inside it. */
export function areaOf(tiles: [number, number][], curve: CurveSpec | null): number {
  if (!curve) return tiles.length
  const cut = geomOf(curve).tiles
  return tiles.reduce((a, [x, y]) => a + (cut.get(`${x},${y}`)?.cover ?? 1), 0)
}

/** True where some open ground shows on a tile: open land, and the part of a room tile outside a slanted or curved wall. */
export const hasGround = (site: Site, x: number, y: number) => inPlot(site, x, y) && (!gridAt(site, x, y) || !!cutAt(site, x, y) || (onCurve(site, x, y) && !curveAt(site, x, y)!.beyond))

/** Corners to cut off a set of tiles so its stepped edges become diagonals. */
export function shapeCuts(tiles: [number, number][]): Record<string, Corner> {
  const set = new Set(tiles.map(([x, y]) => `${x},${y}`))
  const has = (x: number, y: number) => set.has(`${x},${y}`)
  const out: Record<string, Corner> = {}
  for (const [x, y] of tiles) {
    const n = has(x, y - 1)
    const s = has(x, y + 1)
    const e = has(x + 1, y)
    const w = has(x - 1, y)
    // a tile sticking out on exactly two adjacent sides is the step of a stair
    if (!n && !e && s && w) out[`${x},${y}`] = 'ne'
    else if (!n && !w && s && e) out[`${x},${y}`] = 'nw'
    else if (!s && !e && n && w) out[`${x},${y}`] = 'se'
    else if (!s && !w && n && e) out[`${x},${y}`] = 'sw'
  }
  return out
}

/**
 * A cut only stands where the two sides it opens face open ground: open land,
 * or a tile of curved wall that leaves some of that side open, so the slant
 * and the curve stand corner to corner. Where the curved room's floor runs
 * along part of the side, the grid edge walls that part off like any other;
 * only a side that is floor from end to end (see `contact`, which then does
 * not count the side as open either) squares the slant off.
 */
function cutFits(site: Site, x: number, y: number, c: Corner): boolean {
  const dy = c[0] === 'n' ? -1 : 1
  const dx = c[1] === 'e' ? 1 : -1
  const clear = (nx: number, ny: number, facing: Side) => {
    if (!gridAt(site, nx, ny)) return true
    const live = site.curves?.length ? curveAt(site, nx, ny) : undefined
    return !!live && live.shape.sides[facing].reduce((a, [u, v]) => a + v - u, 0) <= 0.98
  }
  return clear(x, y + dy, dy < 0 ? 's' : 'n') && clear(x + dx, y, dx > 0 ? 'w' : 'e')
}

/**
 * Zones tiles as a room without charging for it. Tiles that already belong to
 * a room are left alone. Pass `into` to extend an existing room, and `curve`
 * (with every tile it touches) to give the new part a curved wall.
 * Returns the room and how many tiles were added.
 */
export function zone(site: Site, type: string, tiles: [number, number][], into?: number, style = 0, cuts: Record<string, Corner> = {}, curve?: CurveSpec | null): { room: Room | null; added: number } {
  const free = tiles.filter(([x, y]) => inPlot(site, x, y) && !site.grid[y * site.w + x])
  if (!free.length) return { room: null, added: 0 }
  let room = into ? roomOf(site, into) : undefined
  if (!room) {
    room = { n: site.nextRoom++, type, style }
    site.rooms.push(room)
  }
  const edge = curve ? geomOf(curve).tiles : null
  for (const [x, y] of free) {
    site.grid[y * site.w + x] = room.n
    // ground still shows on the part of a tile outside a curved wall, so its finish is kept
    if (!edge?.has(`${x},${y}`)) delete site.floor[`${x},${y}`]
  }
  for (const [x, y] of free) {
    const c = cuts[`${x},${y}`]
    if (c && cutFits(site, x, y, c)) (site.cuts ??= {})[`${x},${y}`] = c
  }
  if (curve && edge) {
    // the curve shapes the tiles it was built with, and no others. Where its outline crosses floor the room
    // already had, that tile stays square for good: otherwise the curved wall would appear through a
    // finished room, furniture and all (mergeRooms does the same for rooms joined to this one later)
    const built = new Set(free.map(([x, y]) => `${x},${y}`))
    const square: Record<string, 1> = {}
    for (const [key, shape] of edge) if (!built.has(key) && gridAt(site, shape.x, shape.y) === room.n) square[key] = 1
    site.curves ??= []
    site.curves.push({ room: room.n, ...curve, ...(Object.keys(square).length ? { square } : {}) })
  }
  settle(site)
  site.rev++
  return { room, added: free.length }
}

/** Gives a room a door if it has none: on its south side if possible, toward the middle. */
export function autoDoor(site: Site, n: number) {
  if (openRooms(site).has(n)) return
  const edges: { x: number; y: number; side: 'n' | 'w'; score: number }[] = []
  let cx = 0
  let cy = 0
  let count = 0
  for (let y = 0; y < site.h; y++) {
    for (let x = 0; x < site.w; x++) {
      if (site.grid[y * site.w + x] !== n) continue
      cx += x
      cy += y
      count++
    }
  }
  if (!count) return
  cx /= count
  cy /= count
  const curved = curveTiles(site)
  // a door needs a whole metre of straight wall with the room on one side of it
  const wall = (x: number, y: number, side: 'n' | 'w', score: number) => {
    const run = doorRun(site, x, y, side, curved)
    // upstairs a door to the outside would open onto a drop: only doors between rooms there
    if (run && (run.a === n || run.c === n) && (!site.level || (run.a && run.c))) edges.push({ x, y, side, score })
  }
  for (let y = 0; y < site.h; y++) {
    for (let x = 0; x < site.w; x++) {
      if (site.grid[y * site.w + x] !== n) continue
      // south edge first, then the others; nearest the room's middle wins
      if (gridAt(site, x, y + 1) !== n && y + 1 <= site.h) wall(x, y + 1, 'n', Math.abs(x - cx) + (y + 1 >= site.h ? 50 : 0))
      if (gridAt(site, x, y - 1) !== n) wall(x, y, 'n', 20 + Math.abs(x - cx) + (y === 0 ? 50 : 0))
      if (gridAt(site, x + 1, y) !== n) wall(x + 1, y, 'w', 10 + Math.abs(y - cy) + (x + 1 >= site.w ? 50 : 0))
      if (gridAt(site, x - 1, y) !== n) wall(x, y, 'w', 10 + Math.abs(y - cy) + (x === 0 ? 50 : 0))
    }
  }
  edges.sort((a, b) => a.score - b.score)
  // a curved wall takes the door in the bay that faces most nearly south, on the outer side of a ring
  const bays: { curve: number; key: string; score: number }[] = []
  site.curves?.forEach((c, i) => {
    if (c.room === n) {
      for (const b of geomOf(c).bays.values()) {
        if (!bayStands(site, i, b.key)) continue
        const beyond = !inPlot(site, Math.floor(b.x + b.nx * 1.2), Math.floor(b.y + b.ny * 1.2))
        bays.push({ curve: i, key: b.key, score: (1 - b.ny) * 10 + Math.abs(b.x - 0.5 - cx) * 0.2 + (b.band === 'i' ? 30 : b.band === 'o' ? 0 : 12) + (beyond ? 50 : 0) })
      }
      return
    }
    // another room's curved wall that this room stands against: the door goes in the bay facing south from in here
    if (![...curved.values()].some((t) => t.curve === i && t.beyond === n)) return
    for (const b of geomOf(c).bays.values()) {
      if (!bayStands(site, i, b.key)) continue
      const far = bayBeyond(site, i, b.key)
      if (far.length !== 1 || far[0] !== n) continue
      bays.push({ curve: i, key: b.key, score: (1 + b.ny) * 10 + Math.abs(b.x - 0.5 - cx) * 0.2 + 6 })
    }
  })
  bays.sort((a, b) => a.score - b.score)
  const e = edges[0]
  const bay = site.level ? undefined : bays[0]
  if (bay && (!e || bay.score <= e.score)) {
    ;(site.curves![bay.curve].walls ??= {})[bay.key] = 'door'
    site.rev++
    return
  }
  if (!e) return
  site.walls = site.walls.filter((w) => !(w.x === e.x && w.y === e.y && w.side === e.side))
  site.walls.push({ id: `d${n}_${e.x}_${e.y}${e.side}`, x: e.x, y: e.y, side: e.side, kind: 'door' })
  site.rev++
}

/** Rooms of one type that a set of tiles touches along an edge (a corner does not count), oldest first. */
export function touching(site: Site, type: string, tiles: [number, number][]): number[] {
  const own = new Set(tiles.map(([x, y]) => `${x},${y}`))
  const types = new Map(site.rooms.map((r) => [r.n, r.type]))
  const found = new Set<number>()
  for (const [x, y] of tiles) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (own.has(`${x + dx},${y + dy}`)) continue
      const n = gridAt(site, x + dx, y + dy)
      if (n && types.get(n) === type) found.add(n)
    }
  }
  return [...found].sort((a, b) => a - b)
}

/**
 * Makes several rooms one: the floor of the others becomes the room that is
 * kept, the walls between them go (and any doors or glass on them), and a
 * curved wall stays wherever it still has something other than its own room
 * on the far side.
 */
export function mergeRooms(site: Site, keep: number, others: number[]) {
  const gone = new Set(others.filter((n) => n !== keep))
  if (!gone.size || !roomOf(site, keep)) return
  // a curved wall of one of these rooms whose outline crosses the floor of another of them does not start
  // shaping that floor now that they are one room: those tiles were built square, and stay square
  for (const c of site.curves ?? []) {
    if (c.room !== keep && !gone.has(c.room)) continue
    for (const [key, shape] of geomOf(c).tiles) {
      const n = gridAt(site, shape.x, shape.y)
      if (n && n !== c.room && (n === keep || gone.has(n))) (c.square ??= {})[key] = 1
    }
  }
  for (let i = 0; i < site.grid.length; i++) if (gone.has(site.grid[i])) site.grid[i] = keep
  for (const c of site.curves ?? []) if (gone.has(c.room)) c.room = keep
  site.rooms = site.rooms.filter((r) => !gone.has(r.n))
  tidy(site)
  site.rev++
}

/** Drops rooms that have no tiles left and wall changes that no longer sit on a wall. */
export function tidy(site: Site) {
  const used = new Set(site.grid)
  site.rooms = site.rooms.filter((r) => used.has(r.n))
  // a slanted corner may stand against a curved wall, and a curve squared off beside it takes the slant with it: look until both are settled
  for (let pass = 0; pass < 6; pass++) {
    let dropped = 0
    for (const [key, c] of Object.entries(site.cuts ?? {})) {
      const [x, y] = key.split(',').map(Number)
      if (gridAt(site, x, y) && cutFits(site, x, y, c)) continue
      delete site.cuts![key]
      dropped++
    }
    if (pass && !dropped) break
    settle(site)
  }
  // a door or an opening goes with its wall, and also when a curved wall built beside it cuts its metre short
  const curved = site.curves?.length ? curveTiles(site) : NO_CURVES
  // a partition stays only while both its sides are still whole floor of one room
  site.walls = site.walls.filter((w) => (w.part ? canPartition(site, w.x, w.y, w.side) : isBoundary(site, w.x, w.y, w.side, curved) && (w.kind === 'glass' || doorFits(site, w.x, w.y, w.side, curved))))
  // the plot may have changed: nothing remembered about it holds any longer
  site.rev++
}

// ---------------------------------------------------------------- courtyards

/** A stretch of open ground and what closes it in: buildings, and perhaps the edge of the plot. */
export interface Pocket {
  /** The open tiles in it. */
  tiles: [number, number][]
  /** True where walls stand all the way round; false where the edge of the plot closes some of it. */
  enclosed: boolean
  /** Tiles of curved wall, keyed "x,y", whose left-over corners are part of it. */
  curved: string[]
  /** Metres of its outline that are wall: straight, slanted and curved. */
  walls: number
  /** Metres of its outline that are the edge of the plot. */
  rim: number
  /** Which of the plot's four sides it reaches. */
  reaches: Side[]
}

/** Largest courtyard, in tiles, that is filled in one go. */
export const FILL_MAX = 2500
/** Share of a curved courtyard a box must cover before the room takes the whole of it. */
export const FILL_SHARE = 0.5
const WAYS: [Side, Side, number, number][] = [['n', 's', 0, -1], ['s', 'n', 0, 1], ['e', 'w', 1, 0], ['w', 'e', -1, 0]]

/**
 * The open ground joined to a tile: every open tile that can be reached from
 * it without crossing a wall, with how much of its outline is wall and how
 * much is the edge of the plot. Ground carries on through the open half of a
 * slanted tile and through the corner a curved wall leaves over. Null if the
 * tile is not open ground. Pass the site's curved tiles when asking often.
 */
export function pocketAt(site: Site, x: number, y: number, curved: Map<string, LiveTile> = curveTiles(site)): Pocket | null {
  if (!inPlot(site, x, y) || gridAt(site, x, y)) return null
  const out: Pocket = { tiles: [], enclosed: true, curved: [], walls: 0, rim: 0, reaches: [] }
  const seen = new Uint8Array(site.w * site.h)
  /** How much of one side of a built tile ground shows through, in metres. */
  const open = (tx: number, ty: number, side: Side): number => {
    const cut = cutAt(site, tx, ty)
    if (cut) return cut.includes(side) ? 1 : 0
    const live = curved.get(`${tx},${ty}`)
    if (!live || live.beyond) return 0
    const gap = live.shape.sides[side].reduce((a, [u, v]) => a - (v - u), 1)
    return gap > 0.02 ? gap : 0
  }
  const queue = [y * site.w + x]
  seen[queue[0]] = 1
  while (queue.length) {
    const i = queue.pop()!
    const tx = i % site.w
    const ty = (i / site.w) | 0
    const ground = !site.grid[i]
    if (ground) out.tiles.push([tx, ty])
    else {
      // the open part of a built tile: the slanted or curved wall across it is part of the outline
      const live = curved.get(`${tx},${ty}`)
      if (live) {
        out.curved.push(`${tx},${ty}`)
        const facets = geomOf(site.curves![live.curve]).facets
        for (const p of live.shape.pieces) out.walls += (p.t1 - p.t0) * facets[p.facet].len
      } else out.walls += Math.SQRT2
    }
    for (const [side, far, dx, dy] of WAYS) {
      const here = ground ? 1 : open(tx, ty, side)
      if (!here) continue
      const nx = tx + dx
      const ny = ty + dy
      if (!inPlot(site, nx, ny)) {
        out.enclosed = false
        out.rim += here
        if (!out.reaches.includes(side)) out.reaches.push(side)
        continue
      }
      const j = ny * site.w + nx
      const there = site.grid[j] ? open(nx, ny, far) : 1
      // whatever of this side the ground does not carry on through is straight wall
      out.walls += Math.max(0, here - there)
      if (!there || seen[j]) continue
      seen[j] = 1
      queue.push(j)
    }
  }
  // the same courtyard comes out the same wherever in it the asking started
  out.tiles.sort((a, b) => a[1] - b[1] || a[0] - b[0])
  out.curved.sort()
  out.reaches.sort()
  return out
}

/**
 * Why a stretch of open ground cannot be filled with a room in one go, or
 * null if it can. The edge of the plot may close some of it: a yard against
 * one side of the plot, in a corner of it, or running from one side to the
 * other between buildings. Ground that reaches three or four sides of the
 * plot is the open land round the buildings, not a courtyard: buildings
 * stand along at most one side of it.
 */
export function fillError(pocket: Pocket | null): string | null {
  if (!pocket) return 'That land is already built on'
  if (pocket.reaches.length > 2) {
    return `That ground is not closed in: it runs out to ${pocket.reaches.length === 4 ? 'all four' : 'three'} sides of the plot, so it is the open land round the buildings and not a courtyard. Fill takes ground that buildings close in, with the edge of the plot along no more than two sides of it; mark the room out with a box instead.`
  }
  if (pocket.tiles.length > FILL_MAX) return `That courtyard is ${pocket.tiles.length.toLocaleString('en-US')} m², too large to fill in one go (the most is ${FILL_MAX.toLocaleString('en-US')} m²). Mark the room out in parts instead.`
  return null
}

/** The curved courtyard a box was drawn in, and whether the box covers enough of it to take it all. */
export interface Courtyard {
  /** Every open tile of the courtyard. */
  tiles: [number, number][]
  /** True when the box covers half of it or more (and not already all of it), so the room takes the whole courtyard. */
  whole: boolean
}

/**
 * The courtyard a box lies in, when all its open tiles are in one courtyard
 * that a curved wall helps close in. A box across half or more of it takes
 * the whole courtyard (`whole`): its straight sides would otherwise leave
 * thin slivers of open ground against the curve. Null where the box is not
 * inside such a courtyard, and for one too large or too open to fill.
 */
export function courtyardFor(site: Site, tiles: [number, number][]): Courtyard | null {
  if (!tiles.length || !site.curves?.length) return null
  const pocket = pocketAt(site, tiles[0][0], tiles[0][1])
  if (!pocket || !pocket.curved.length || fillError(pocket)) return null
  const within = new Set(pocket.tiles.map(([px, py]) => `${px},${py}`))
  if (!tiles.every(([tx, ty]) => within.has(`${tx},${ty}`))) return null
  return { tiles: pocket.tiles, whole: tiles.length < pocket.tiles.length && tiles.length >= pocket.tiles.length * FILL_SHARE }
}

/** Tiles an item covers, given its anchor tile and rotation. */
/** Longest run of an underground belt, entry to exit, in tiles. */
export const UG_SPAN = 6
/** kW of power a tile of solar roof gives on average. */
export const SOLAR_ROOF_KW = 2.5

/**
 * A dock stands in the outer wall: moved to the nearest plot edge, a shipping
 * dock facing out and a receiving dock facing in. Returns the new place.
 */
export function snapDock(site: Site, kind: string, x: number, y: number, rot: number): { x: number; y: number; rot: number } {
  const def = ITEMS[site.kind]?.[kind]
  if (site.kind !== 'factory' || !def || (kind !== 'dock_in' && kind !== 'dock_out')) return { x, y, rot }
  const t = tilesOf(def, x, y, rot)
  const fw = Math.max(...t.map((c) => c[0])) - x + 1
  const fh = Math.max(...t.map((c) => c[1])) - y + 1
  // [distance to the edge, outward direction index (east 0, south 1, west 2, north 3)]
  const outs: [number, number][] = [[x, 2], [site.w - (x + fw), 0], [y, 3], [site.h - (y + fh), 1]]
  const [, dir] = outs.reduce((a, b) => (b[0] < a[0] ? b : a))
  const r = kind === 'dock_out' ? dir : (dir + 2) % 4
  const tr = tilesOf(def, 0, 0, r)
  const w = Math.max(...tr.map((c) => c[0])) + 1
  const h = Math.max(...tr.map((c) => c[1])) + 1
  const cl = (v: number, hi: number) => Math.max(0, Math.min(hi, v))
  if (dir === 2) return { x: 0, y: cl(y, site.h - h), rot: r }
  if (dir === 0) return { x: site.w - w, y: cl(y, site.h - h), rot: r }
  if (dir === 3) return { x: cl(x, site.w - w), y: 0, rot: r }
  return { x: cl(x, site.w - w), y: site.h - h, rot: r }
}

export function tilesOf(def: Pick<ItemDef, 'w' | 'h'>, x: number, y: number, rot: number): [number, number][] {
  const turned = rot % 2 === 1
  const w = turned ? def.h : def.w
  const h = turned ? def.w : def.h
  const out: [number, number][] = []
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push([x + i, y + j])
  return out
}

export const itemTiles = (site: Site, item: SiteItem) => tilesOf(ITEMS[site.kind][item.kind], item.x, item.y, item.rot)

/** The straight line of tiles from one tile toward another, along whichever way the drag is longer. */
export function lineTiles(x0: number, y0: number, x1: number, y1: number, step = 1): [number, number][] {
  const alongX = Math.abs(x1 - x0) >= Math.abs(y1 - y0)
  const d = alongX ? x1 - x0 : y1 - y0
  const pace = Math.max(1, Math.round(step))
  const out: [number, number][] = []
  for (let k = 0; k <= Math.floor(Math.abs(d) / pace); k++) out.push(alongX ? [x0 + Math.sign(d) * k * pace, y0] : [x0, y0 + Math.sign(d) * k * pace])
  return out
}

/**
 * Where a row of one item goes when it is dragged out from one tile toward
 * another: a straight line along the longer way of the drag, each one a
 * footprint on from the last, so they stand side by side without a gap.
 */
export function rowSpots(def: Pick<ItemDef, 'w' | 'h'>, x0: number, y0: number, x1: number, y1: number, rot: number): [number, number][] {
  const turned = (((rot % 4) + 4) % 4) % 2 === 1
  const alongX = Math.abs(x1 - x0) >= Math.abs(y1 - y0)
  return lineTiles(x0, y0, x1, y1, alongX ? (turned ? def.h : def.w) : turned ? def.w : def.h)
}

export function itemAt(site: Site, x: number, y: number): SiteItem | undefined {
  return site.items.find((it) => ITEMS[site.kind][it.kind] && itemTiles(site, it).some(([a, b]) => a === x && b === y))
}

/** A plain-words list of where an item may go, for error messages and the palette. */
export function roomNames(kind: SiteKind, def: ItemDef): string {
  const names = def.rooms.map((r) => (r === OUT ? 'open ground' : ROOMS[kind][r]?.name.toLowerCase())).filter(Boolean)
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(' or ')
}

/** What is said of something that is not in the list of things a plot can hold. */
export const UNKNOWN_ITEM = 'There is no such thing to place on this kind of plot'

/** What is said of a tile the stairs or a lift from below come up through. */
export const WELL_HERE = 'The stairs or a lift from the floor below come up here'

export function canPlace(site: Site, kind: string, x: number, y: number, rot: number, wells?: ReadonlyMap<number, unknown>): string | null {
  // only what the list itself names: "constructor" is a property of every object, and not a piece of furniture
  const def = typeof kind === 'string' && Object.hasOwn(ITEMS[site.kind], kind) ? ITEMS[site.kind][kind] : undefined
  if (!def) return UNKNOWN_ITEM
  if (site.level && GROUND_ONLY[site.kind].has(kind)) return `${def.name} stands on the ground floor: an upper floor cannot carry it`
  if (site.level && !def.rooms.some((r) => r !== OUT)) return `${def.name} stands outdoors, on the ground floor`
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(rot)) return 'It does not fit on the plot'
  if (!itemAllowed(site, kind)) return 'Trees do not grow inside a mall'
  let room = -1
  for (const [a, b] of tilesOf(def, x, y, rot)) {
    if (!inPlot(site, a, b)) return 'It does not fit on the plot'
    if (cutAt(site, a, b)) return 'That corner of the room is cut away'
    if (onCurve(site, a, b)) return 'The curved wall runs through there'
    const n = gridAt(site, a, b)
    // an upper floor has no open ground: what is not a room there is the drop to the floor below
    if (site.level && !n) return UPSTAIRS_OPEN
    if (!def.rooms.includes(typeAt(site, a, b))) return `${def.name} goes in: ${roomNames(site.kind, def)}`
    if (room >= 0 && n !== room) return 'It cannot straddle a wall'
    room = n
    if (itemAt(site, a, b)) return 'Something is already there'
    if (wells?.has(b * site.w + a)) return WELL_HERE
  }
  return null
}

export const countItems = (site: Site, kind: string) => site.items.filter((i) => i.kind === kind).length

// ---------------------------------------------------------------- storeys

/** What is said of open space on an upper floor. */
export const UPSTAIRS_OPEN = 'Upstairs, everything stands in a room: build one here first'
/** Staircases and lifts: what joins a storey to the one above it. */
export const CLIMB: ReadonlySet<string> = new Set(['stairs', 'lift', 'escalator'])

/**
 * What stays on the ground floor of each kind of building: a production
 * line's heavy machines and docks, and a venue's stages and screens. Upstairs
 * a factory has warehouses, control and crew rooms; a venue balconies of
 * seating and foyers; a store any of its rooms.
 */
export const GROUND_ONLY: Record<SiteKind, ReadonlySet<string>> = {
  office: new Set(),
  factory: new Set(['dock_in', 'dock_out', 'conveyor', 'smt', 'robot', 'manual', 'test', 'pack', 'forklift']),
  store: new Set(),
  venue: new Set(['stage', 'stage_l', 'stage_xl', 'screen', 'screen_l', 'screen_xl', 'fountain']),
}
/** Rooms that stand only on the ground floor: a factory's production hall carries the line. */
export const GROUND_ROOMS: Record<SiteKind, ReadonlySet<string>> = { office: new Set(), factory: new Set(['hall']), store: new Set(), venue: new Set() }

/**
 * The storeys above the ground floor, one for each floor the building has
 * over the first: plans of their own, the size of the plot. Made to match
 * the number of floors; only offices have them.
 */
export function syncLevels(site: Site): Site[] {
  if (site.level) return []
  const want = Math.max(0, site.floors - 1)
  const up = site.upper ?? []
  while (up.length < want) up.push(blankLevel(site, up.length + 1))
  up.length = want
  for (const l of up) {
    l.facade = site.facade
    l.roof = site.roof
  }
  if (up.length) site.upper = up
  else delete site.upper
  return up
}

/** A bare storey over a building: nothing built on it yet. */
export function blankLevel(ground: Site, floor: number): Site {
  const l = newSite(ground.kind, ground.tier)
  l.w = ground.w
  l.h = ground.h
  l.grid = new Array(ground.w * ground.h).fill(0)
  l.level = floor
  l.facade = ground.facade
  l.roof = ground.roof
  return l
}

/** A storey of a building: 0 is the ground floor itself. */
export const levelOf = (site: Site, floor: number): Site | undefined => (floor > 0 ? site.upper?.[floor - 1] : site)
/** Every storey of a building, the ground floor first. */
export const storeysOf = (site: Site): Site[] => (site.upper?.length ? [site, ...site.upper] : [site])

/** Whether every tile of an item has a room over it on a storey. */
const roomedOver = (level: Site | undefined, tiles: [number, number][]) => !!level && tiles.every(([x, y]) => gridAt(level, x, y) > 0)

/** How far up a lift on a storey runs: the highest floor its shaft reaches, through every storey above with a room over it. */
export function liftTop(floors: Site[], from: number, item: SiteItem): number {
  const tiles = itemTiles(floors[from], item)
  let top = from
  while (roomedOver(floors[top + 1], tiles)) top++
  return top
}

/** A stairwell or lift shaft coming up through a floor: what it is, and whether it arrives in a room there. */
export interface Well {
  kind: string
  lands: boolean
}

/**
 * Where the stairs and lifts of the storeys below come up through a floor,
 * by tile index. Stairs on a storey rise to the one above it; a lift's shaft
 * runs on up through every storey that has a room over it. Nothing else can
 * stand on these tiles, and only one with a room over it is a way up.
 */
export function wellsOn(ground: Site, floor: number): Map<number, Well> {
  const out = new Map<number, Well>()
  if (floor < 1) return out
  const floors = storeysOf(ground)
  const here = floors[floor] as Site | undefined
  for (let f = 0; f < floor && f < floors.length; f++) {
    for (const it of floors[f].items) {
      if (!CLIMB.has(it.kind)) continue
      // stairs come up one floor; a lift only as far as its shaft runs, and one floor past that
      if (it.kind !== 'lift' ? f !== floor - 1 : liftTop(floors, f, it) < floor - 1) continue
      const tiles = itemTiles(floors[f], it)
      const lands = roomedOver(here, tiles)
      for (const [x, y] of tiles) out.set(y * ground.w + x, { kind: it.kind, lands })
    }
  }
  return out
}

/** The tiles a staircase or lift would come up through on the floors above, by floor: what stands there has to go first. */
export function climbBlocked(ground: Site, floor: number, kind: string, tiles: [number, number][]): string | null {
  if (!CLIMB.has(kind)) return null
  const floors = storeysOf(ground)
  for (let f = floor + 1; f < floors.length; f++) {
    const l = floors[f]
    if (tiles.some(([x, y]) => itemAt(l, x, y))) return `Something stands over it on ${f === 1 ? 'the first floor' : `floor ${f}`}: move it first`
    if (kind !== 'lift' || !roomedOver(l, tiles)) break
  }
  return null
}

/** Rooms on a storey people can get into once they are on it: on the ground floor those with a way in, upstairs those the stairs or a lift come up in, and those with a door. */
function storeyOpen(floors: Site[], f: number): Set<number> {
  if (!f) return openRooms(floors[0])
  const level = floors[f]
  const open = new Set(openRooms(level))
  for (const [i, w] of wellsOn(floors[0], f)) if (w.lands && level.grid[i]) open.add(level.grid[i])
  return open
}

/**
 * How many storeys above the ground floor people can get up to: a floor is
 * reached when stairs from a room people can get into on the floor below
 * (or a lift from any floor under it) come up in one of its rooms.
 */
export function linkedLevels(site: Site): number {
  if (!site.upper?.length) return 0
  const floors = storeysOf(site)
  let k = 0
  for (let f = 1; f < floors.length; f++) {
    let reached = false
    for (let m = 0; m < f && !reached; m++) {
      const open = storeyOpen(floors, m)
      for (const it of floors[m].items) {
        if (!CLIMB.has(it.kind) || !open.has(gridAt(floors[m], it.x, it.y))) continue
        if (it.kind !== 'lift' ? m === f - 1 && roomedOver(floors[f], itemTiles(floors[m], it)) : liftTop(floors, m, it) >= f) {
          reached = true
          break
        }
      }
    }
    if (!reached) break
    k = f
  }
  return k
}

/** Rooms on a storey nobody can get into: no door, or (upstairs) no stairs or lift reaching that floor. */
export function sealedOn(site: Site, floor: number): Room[] {
  const level = levelOf(site, floor)
  if (!level) return []
  if (!floor) return sealedRooms(site)
  if (floor > linkedLevels(site)) return level.rooms
  const open = storeyOpen(storeysOf(site), floor)
  return level.rooms.filter((r) => !open.has(r.n))
}

/** Every piece of furniture on every storey. */
export const allItems = (site: Site): SiteItem[] => (site.upper?.length ? site.items.concat(...site.upper.map((l) => l.items)) : site.items)

const UP_REACH = new WeakMap<Site, { key: string; items: SiteItem[] }>()
/**
 * Items standing in rooms people can actually reach (or outdoors), on every
 * storey people can get up to.
 */
export function reachable(site: Site): SiteItem[] {
  const memo = memoOf(site)
  const own = (memo.reach ??= findReachable(site))
  if (!site.upper?.length) return own
  const k = linkedLevels(site)
  if (!k) return own
  const key = `${site.rev}:${own.length}:${k}:${site.upper.map((l) => `${l.rev}.${l.items.length}.${plotMark(l)}`).join(',')}`
  const hit = UP_REACH.get(site)
  if (hit && hit.key === key) return hit.items
  const floors = storeysOf(site)
  const items = own.slice()
  for (let f = 1; f <= k; f++) {
    const open = storeyOpen(floors, f)
    for (const it of floors[f].items) if (ITEMS[site.kind][it.kind] && open.has(gridAt(floors[f], it.x, it.y))) items.push(it)
  }
  UP_REACH.set(site, { key, items })
  return items
}
function findReachable(site: Site): SiteItem[] {
  // a storey on its own, without the floors under it: the rooms with a door, or with stairs or a lift in them
  const open = new Set(openRooms(site))
  if (site.level) for (const i of site.items) if (CLIMB.has(i.kind)) open.add(gridAt(site, i.x, i.y))
  return site.items.filter((it) => {
    const n = gridAt(site, it.x, it.y)
    return ITEMS[site.kind][it.kind] && (!n || open.has(n))
  })
}

/** Total of a numeric property over everything placed. */
export function sumOf(site: Site, key: 'comfort' | 'prestige' | 'visitors' | 'meet' | 'crowd' | 'show', items: SiteItem[] = site.items): number {
  return items.reduce((a, it) => a + (ITEMS[site.kind][it.kind]?.[key] ?? 0), 0)
}

/** Prestige of a site: its fittings plus the building itself. */
export function sitePrestige(site: Site): number {
  const tiles = builtTiles(site)
  // an office counts what is built on each storey above; another building its height over its footprint
  const above = site.upper?.length ? site.upper.reduce((a, l) => a + builtTiles(l), 0) : (site.floors - 1) * tiles
  return sumOf(site, 'prestige', reachable(site)) + above / 150 + Math.sqrt(tiles) * 0.12 + (FACADES[site.facade]?.cost ? 1 : 0)
}

/** Rooms that have no way in, for warnings. */
export function sealedRooms(site: Site): Room[] {
  const open = openRooms(site)
  return site.rooms.filter((r) => !open.has(r.n))
}

// ---------------------------------------------------------------- factory lines

// the line itself is worked out in factoryline.ts, from which faces of which blocks meet
export { type LineStats, type LineReport, type Joint, lineStats, planFix, fixLayout } from './factoryline'

/** A ready-made hall and line for players who do not want to lay conveyors themselves. */
export function starterLine(site: Site): { hall: [number, number, number, number]; items: { kind: string; x: number; y: number; rot: number }[] } | null {
  // the receiving dock stands in the west outer wall, facing in
  const x0 = 0
  const y0 = Math.max(2, Math.floor(site.h / 2) - 3)
  const hall: [number, number, number, number] = [x0, y0, x0 + 15, y0 + 5]
  if (hall[2] >= site.w - 1 || hall[3] >= site.h - 1) return null
  for (const [x, y] of areaTiles(...hall)) if (itemAt(site, x, y) || (gridAt(site, x, y) && typeAt(site, x, y) !== 'hall')) return null
  const y = y0 + 2
  const x = x0
  return {
    hall,
    items: [
      { kind: 'dock_in', x, y, rot: 0 },
      { kind: 'conveyor', x: x + 2, y, rot: 0 },
      { kind: 'smt', x: x + 3, y, rot: 0 },
      { kind: 'conveyor', x: x + 6, y, rot: 0 },
      { kind: 'robot', x: x + 7, y: y - 1, rot: 0 },
      { kind: 'test', x: x + 9, y, rot: 0 },
      { kind: 'pack', x: x + 10, y, rot: 0 },
      { kind: 'dock_out', x: x + 12, y, rot: 0 },
    ],
  }
}

// ---------------------------------------------------------------- stores

export interface StoreStats {
  open: boolean
  problem?: string
  capacity: number
  /** 0-1: how inviting the store is. */
  appeal: number
  hasSupport: boolean
  /** Repair benches, which cut the cost of warranty work. */
  repairs: number
  shelves: number
  /** Monthly wages for the people the fixtures need. */
  wages: number
}

export function storeStats(site: Site): StoreStats {
  const items = reachable(site)
  const count = (kind: string) => items.filter((i) => i.kind === kind).length
  const counters = count('counter')
  const supports = count('support')
  const repairs = count('repair')
  const capacity = sumOf(site, 'visitors', items)
  // every storey people can get up to is shop floor
  const tiles = Math.max(1, storeysOf(site).reduce((a, l) => a + builtTiles(l), 0))
  const outdoors = new Set(site.items.filter((i) => !gridAt(site, i.x, i.y)).map((i) => i.id))
  const used = items.filter((i) => !ITEMS.store[i.kind].flat && !CLIMB.has(i.kind) && !outdoors.has(i.id)).reduce((a, i) => a + ITEMS.store[i.kind].w * ITEMS.store[i.kind].h, 0)
  // a little decor goes a long way; a cluttered floor puts people off
  const decor = Math.min(1, sumOf(site, 'comfort', items) / (tiles * 0.06))
  const crowding = Math.max(0, used / tiles - 0.4) * 2.5
  const look = (FACADES[site.facade]?.cost ? 0.05 : 0) + (site.rooms.length > 1 ? 0.05 : 0)
  const appeal = Math.max(0.1, Math.min(1, 0.45 + 0.45 * decor + look - crowding))
  // a manager, and someone at each checkout, support bar and repair bench
  const wages = (counters + supports + repairs) * STORE_WAGE + STORE_MANAGER
  const stock = count('stockrack')
  const base = { capacity: capacity * (1 + Math.min(0.2, stock * 0.05)), appeal, hasSupport: supports > 0, repairs, shelves: count('shelf'), wages }
  if (!site.rooms.some((r) => r.type === 'sales')) return { ...base, open: false, problem: 'Zone a sales floor to start building the store.' }
  if (sealedRooms(site).some((r) => r.type === 'sales')) return { ...base, open: false, problem: 'The sales floor needs a door.' }
  if (!counters) return { ...base, open: false, problem: 'Add a checkout so the store can sell.' }
  if (!capacity) return { ...base, open: false, problem: 'Add a display table or demo pod.' }
  return { ...base, open: true }
}

// ---------------------------------------------------------------- venues

export interface VenueStats {
  ready: boolean
  problem?: string
  seats: number
  /** 0-1: screens, lights and sound relative to the size of the crowd. */
  production: number
  /** How far a show here carries, on the same scale as hired venues. */
  reach: number
}

export function venueStats(site: Site): VenueStats {
  const items = reachable(site)
  const seats = sumOf(site, 'crowd', items)
  const production = Math.min(1, sumOf(site, 'show', items) / (9 + seats / 45))
  const reach = Math.min(1.1, (0.35 + 0.6 * Math.min(1, Math.sqrt(seats / 1200))) * (0.7 + 0.3 * production) + sitePrestige(site) * 0.004)
  const base = { seats, production, reach }
  if (!items.some((i) => isStage(i.kind))) return { ...base, ready: false, problem: 'Build a stage.' }
  if (seats < 48) return { ...base, ready: false, problem: 'Seat at least 48 people.' }
  return { ...base, ready: true }
}

/** Every size of stage. */
export const isStage = (kind: string) => kind === 'stage' || kind === 'stage_l' || kind === 'stage_xl'
/** Every size of screen. */
export const isScreen = (kind: string) => kind === 'screen' || kind === 'screen_l' || kind === 'screen_xl'

/** The stage a show is presented from: the biggest there is. */
export function stageOf(site: Site): SiteItem | undefined {
  let best: SiteItem | undefined
  for (const it of site.items) if (isStage(it.kind) && (!best || ITEMS.venue[it.kind].w > ITEMS.venue[best.kind].w)) best = it
  return best
}

/** Metres from a storey's floor to the next one (the 3D view's STOREY), and the clear height of a hall under its roof. */
export const STOREY_M = 3
export const ceilingOf = (site: Pick<Site, 'floors'>) => site.floors * STOREY_M - 0.1
/** The clear height over a tile of the ground floor: up through every storey that has no room over it, to the roof or the first floor built over it. */
export function ceilingAt(site: Site, x: number, y: number): number {
  let n = 1
  for (const l of site.upper ?? []) {
    if (gridAt(l, x, y)) break
    n++
  }
  return Math.min(n, site.floors) * STOREY_M - 0.1
}
/** Storeys a venue's tallest rigging needs over it, 1 with none. */
export function rigNeed(site: Site): number {
  let top = 0
  for (const it of site.items) if (RIG_TOP[it.kind] && gridAt(site, it.x, it.y)) top = Math.max(top, RIG_TOP[it.kind])
  return top ? Math.ceil((top + 0.4) / STOREY_M) : 1
}
/** How tall each piece of stage rigging stands when it has the room, in metres. */
export const RIG_TOP: Record<string, number> = { screen: 5.2, screen_l: 7.2, screen_xl: 10.8, lights: 6.6, stage_l: 7.0, stage_xl: 9.6 }

/**
 * How many storeys a venue's halls need for its rigging to stand at full
 * height under the roof, or 0 when they have enough. Rigging in a hall that
 * is too low is cut down to fit.
 */
export function rigFloors(site: Site): number {
  let top = 0
  for (const it of site.items) if (RIG_TOP[it.kind] && gridAt(site, it.x, it.y)) top = Math.max(top, RIG_TOP[it.kind])
  const want = Math.ceil((top + 0.4) / STOREY_M)
  return top && want > site.floors ? want : 0
}

export type VenuePreset = 'hall' | 'theatre' | 'arena'
/** Ready-made venues, smallest first: the plot each needs at least, and what it is. */
export const VENUE_PRESETS: Record<VenuePreset, { name: string; tier: number; floors: number; note: string }> = {
  hall: { name: 'Small hall', tier: 0, floors: 3, note: 'A black-box hall: stage, giant screen, two light towers and raked seats.' },
  theatre: { name: 'Theatre', tier: 1, floors: 3, note: 'A large stage under a lighting truss, a ten-metre LED wall, a foyer and a full rake of seats.' },
  arena: { name: 'Arena', tier: 2, floors: 4, note: 'An arena stage with a flown rig, a sixteen-metre LED wall, broadcast cameras and every seat the plot holds.' },
}

/**
 * A whole venue laid out on a plot of the given tier: a hall with the
 * preset's stage, screen and lights at the north end, seating banks rising
 * toward the back with aisles between them, and a foyer along the street.
 * Bigger plots get more seats. Used for the presets and for hired venues.
 */
export function venueLayout(preset: VenuePreset, tier: number): Site {
  const site = newSite('venue', tier)
  const cx = Math.floor(site.w / 2)
  let id = 0
  const put = (k: string, x: number, y: number) => {
    if (!canPlace(site, k, x, y, 0)) site.items.push({ id: `p${id++}`, kind: k, x, y, rot: 0 })
  }
  const big = preset !== 'hall'
  const foyer = big ? 4 : 0
  const hallBottom = site.h - 3 - foyer
  const style = preset === 'arena' ? 2 : preset === 'theatre' ? 1 : 0
  if (big) {
    const f = zone(site, 'foyer', areaTiles(2, hallBottom + 1, site.w - 3, site.h - 2), undefined, preset === 'arena' ? 1 : 0).room
    if (f) autoDoor(site, f.n)
  }
  const { room } = zone(site, 'hall', areaTiles(2, 1, site.w - 3, hallBottom), undefined, style)
  if (room) autoDoor(site, room.n)
  // wide openings for a big house: between hall and foyer, and from the foyer to the street
  if (big) {
    const opening = (x: number, y: number) => {
      site.walls = site.walls.filter((w) => !(w.x === x && w.y === y && w.side === 'n'))
      site.walls.push({ id: `pw${id++}`, x, y, side: 'n', kind: 'open' })
    }
    for (const x of [cx - Math.floor(site.w / 4), cx, cx + Math.floor(site.w / 4)]) for (let k = -1; k < 3; k++) opening(x + k, hallBottom + 1)
    for (let k = -1; k < 3; k++) opening(cx + k, site.h - 1)
  }
  const stage = preset === 'arena' ? 'stage_xl' : preset === 'theatre' ? 'stage_l' : 'stage'
  const screen = preset === 'arena' ? 'screen_xl' : preset === 'theatre' ? 'screen_l' : 'screen'
  const sw = ITEMS.venue[stage].w
  const sd = ITEMS.venue[stage].h
  put(screen, cx - sw / 2, 2)
  put(stage, cx - sw / 2, 3)
  // towers of lights and stacks of speakers either side of the stage, more of them on a bigger one
  const towers = preset === 'arena' ? 3 : preset === 'theatre' ? 2 : 1
  for (let k = 0; k < towers; k++) {
    put('lights', cx - sw / 2 - 2 - k, 3 + k * 2)
    put('lights', cx + sw / 2 + 1 + k, 3 + k * 2)
    put('speakers', cx - sw / 2 - 2 - k, 4 + k * 2)
    put('speakers', cx + sw / 2 + 1 + k, 4 + k * 2)
  }
  // seating: banks of three across, two rows deep, from a little in front of the stage to the back of the hall
  const y0 = 3 + sd + 2
  const last = hallBottom - (big ? 3 : 2)
  const rows = Math.max(1, Math.floor((last - y0 + 1) / 2))
  const width = site.w - 8
  const cols = Math.floor(width / 3)
  const x0 = cx - Math.floor((cols * 3) / 2)
  const aisle = cols > 6 ? [Math.floor(cols / 2)] : []
  if (cols > 12) aisle.push(Math.floor(cols / 5), cols - 1 - Math.floor(cols / 5))
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (aisle.includes(c)) continue
      put(r < rows / 3 ? 'seats' : r < (rows * 2) / 3 ? 'seats_mid' : 'seats_high', x0 + c * 3, y0 + r * 2)
    }
  // cameras: one at the back on the centre aisle, and two more out to the sides of a big house
  const back = y0 + rows * 2
  put('camera', cx - 1, Math.min(back, hallBottom - 1))
  if (big) for (const x of [2, site.w - 4]) put('camera', x, y0 + 2)
  if (big) {
    put('reception', cx - 1, site.h - 4)
    for (const x of [cx - 8, cx + 6]) put('demo', x, site.h - 5)
    for (const x of [3, site.w - 5]) put('logowall', x, hallBottom + 1)
  }
  site.floors = VENUE_PRESETS[preset].floors
  site.facade = preset === 'arena' ? 4 : 5
  return site
}

/**
 * A hired venue, laid out for the keynote replay: 0 is a livestream studio,
 * 1 a theatre, 2 an arena. Not part of the save; rebuilt whenever it is shown.
 */
export function hiredVenue(kind: number): Site {
  if (kind >= 1) return venueLayout(kind >= 2 ? 'arena' : 'theatre', kind >= 2 ? 2 : 1)
  const site = newSite('venue', Math.min(2, Math.max(0, kind)))
  const cx = Math.floor(site.w / 2)
  let id = 0
  const put = (k: string, x: number, y: number) => site.items.push({ id: `h${id++}`, kind: k, x, y, rot: 0 })
  const { room } = zone(site, 'hall', areaTiles(2, 1, site.w - 3, site.h - 3), undefined, kind === 2 ? 2 : kind === 1 ? 1 : 0)
  if (room) autoDoor(site, room.n)
  put('screen', cx - 3, 2)
  put('stage', cx - 3, 3)
  for (const dx of [-5, 4]) {
    put('lights', cx + dx, 3)
    put('speakers', cx + dx, 5)
  }
  if (kind === 0) {
    put('camera', cx - 4, 10)
    put('camera', cx + 2, 10)
    put('lights', cx - 7, 8)
    put('lights', cx + 6, 8)
    // a studio's roof stands high enough for its screen
    site.floors = 2
    return site
  }
  put('camera', cx - 1, site.h - 6)
  put('lights', cx - 8, 7)
  put('lights', cx + 7, 7)
  const cols = Math.floor((site.w - 8) / 3)
  const rows = Math.floor((site.h - 9 - 8) / 2)
  const x0 = cx - Math.floor((cols * 3) / 2)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // leave a centre aisle
      if (cols > 6 && c === Math.floor(cols / 2)) continue
      put(r < rows / 3 ? 'seats' : r < (rows * 2) / 3 ? 'seats_mid' : 'seats_high', x0 + c * 3, 9 + r * 2)
    }
  }
  site.facade = kind === 2 ? 4 : 5
  return site
}
