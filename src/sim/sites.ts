// Buildable sites: campuses, factories, stores and event venues share one
// model. A site is an empty plot; the player zones rooms on it, the walls
// follow the rooms, and each kind of room takes its own furniture.
import { type CurveSpec, MIN_RADIUS, MIN_THICK, bayStands, curveAt, geomOf, holeOf, settle } from './curves'
import type { Corner, Role, Room, Site, SiteItem, SiteKind } from './types'

export type Stage = 'in' | 'out' | 'belt' | 'smt' | 'assembly' | 'test' | 'pack'

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
    hedge: d('Hedge', 200, 1, 1, 'Grounds', [OUT, 'atrium'], 'Clipped green edging.', { comfort: 0.1 }),
    lamp: d('Lamp post', 500, 1, 1, 'Grounds', [OUT], 'Lights the grounds after dark.', { prestige: 0.1 }),
    parking: d('Parking bay', 1500, 3, 5, 'Grounds', [OUT], 'Marked space for one car.', { comfort: 0.3 }),
    bikes: d('Bike rack', 700, 2, 1, 'Grounds', [OUT], 'A row of hoops and a few bikes.', { comfort: 0.4 }),
    flag: d('Flagpole', 1200, 1, 1, 'Grounds', [OUT], 'Your colours, flying.', { prestige: 0.8 }),
    sign: d('Entrance sign', 6000, 3, 1, 'Grounds', [OUT], 'A stone sign with your name on it.', { prestige: 2.5 }),
  },
  factory: {
    dock_in: d('Receiving dock', 20000, 2, 1, 'Line', ['hall'], 'Components arrive here. A line starts at a receiving dock.', { stage: 'in' }),
    dock_out: d('Shipping dock', 20000, 2, 1, 'Line', ['hall'], 'Finished devices leave here. A line ends at a shipping dock.', { stage: 'out' }),
    conveyor: d('Conveyor', 1200, 1, 1, 'Line', ['hall'], 'Links machines that are not side by side.', { stage: 'belt' }),
    smt: d('Board assembly line', 220000, 3, 1, 'Machines', ['hall'], 'Builds circuit boards. 700 units a day.', { stage: 'smt', cap: 700, run: 900 }),
    robot: d('Robotic assembly cell', 160000, 2, 2, 'Machines', ['hall'], 'Assembles devices. 500 units a day.', { stage: 'assembly', cap: 500, run: 700 }),
    manual: d('Assembly bench', 9000, 1, 1, 'Machines', ['hall'], 'Hand assembly. 60 units a day.', { stage: 'assembly', cap: 60, run: 180 }),
    test: d('Test station', 45000, 1, 1, 'Machines', ['hall'], 'Catches faults before shipping. Covers 450 units a day.', { stage: 'test', cap: 450, run: 250 }),
    pack: d('Packaging line', 60000, 2, 1, 'Machines', ['hall'], 'Boxes devices. 900 units a day.', { stage: 'pack', cap: 900, run: 300 }),
    rack: d('Storage rack', 5000, 2, 1, 'Storage', ['store', 'hall'], 'Tall shelving for parts.'),
    pallets: d('Pallet stack', 500, 1, 1, 'Storage', ['store', 'hall', OUT], 'Boxes on a pallet.'),
    forklift: d('Forklift', 18000, 1, 2, 'Storage', ['store', 'hall', OUT], 'Parked, for now.'),
    console: d('Control desk', 30000, 2, 1, 'Control', ['control'], 'Operators watch the line from here. Each desk cuts faults a little.'),
    qa: d('Inspection bench', 16000, 2, 1, 'Control', ['control'], 'Samples are checked by hand. Each bench cuts faults a little.'),
    lockers: d('Lockers', 1500, 2, 1, 'Crew', ['crew'], 'Somewhere for coats and boots.', { comfort: 0.5 }),
    canteen: d('Canteen table', 1200, 2, 1, 'Crew', ['crew'], 'A long table and benches.', { comfort: 1 }),
    vending: d('Vending machine', 2400, 1, 1, 'Crew', ['crew'], 'Snacks between shifts.', { comfort: 0.8 }),
    tank: d('Storage tank', 9000, 2, 2, 'Yard', [OUT], 'A steel tank on legs.'),
    truck: d('Truck bay', 4000, 3, 8, 'Yard', [OUT], 'A marked bay with a lorry waiting.'),
    otree: d('Tree', 900, 1, 1, 'Yard', [OUT], 'Softens the yard.'),
    lamp: d('Lamp post', 500, 1, 1, 'Yard', [OUT], 'Lights the yard.'),
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
    planter: d('Planter', 1400, 2, 1, 'Outside', [OUT], 'Greenery at the entrance.', { comfort: 0.6 }),
    sign: d('Totem sign', 5000, 1, 1, 'Outside', [OUT], 'Your logo on a lit column.', { comfort: 1 }),
  },
  venue: {
    stage: d('Stage', 60000, 6, 4, 'Stage', ['hall', OUT], 'The platform everything happens on. A venue needs one.', { show: 2 }),
    screen: d('Giant screen', 90000, 6, 1, 'Stage', ['hall', OUT], 'A wall of LEDs behind the presenter.', { show: 5 }),
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
    planter: d('Planter', 1400, 2, 1, 'Grounds', [OUT], 'A long bed of grasses.'),
    lamp: d('Lamp post', 500, 1, 1, 'Grounds', [OUT], 'Lights the way in.'),
    flag: d('Flagpole', 1200, 1, 1, 'Grounds', [OUT], 'Your colours, flying.'),
    fountain: d('Fountain', 22000, 3, 3, 'Grounds', [OUT], 'A round pool with a jet.', { show: 0.5 }),
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

/** Ground finishes for open land. The first is the default. */
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
    { name: 'Garage lot', w: 14, h: 10, env: 'suburb', cost: 0, rent: 2500, blurb: 'A house lot on a quiet street. Where it starts.' },
    { name: 'Workshop yard', w: 22, h: 14, env: 'estate', cost: 150e3, rent: 8000, blurb: 'A plot on a trading estate with room for a real office.' },
    { name: 'Business park plot', w: 32, h: 22, env: 'park', cost: 800e3, rent: 22e3, blurb: 'Landscaped land among other growing companies.' },
    { name: 'Headquarters site', w: 48, h: 32, env: 'park', cost: 4e6, rent: 60e3, blurb: 'A full block for a building with your name on it.' },
    { name: 'Campus', w: 72, h: 56, env: 'valley', cost: 22e6, rent: 160e3, blurb: 'Open land in the valley. Build whatever you can imagine.' },
  ],
  factory: [
    { name: 'Workshop plot', w: 22, h: 14, env: 'industrial', cost: 450e3, rent: 12e3, blurb: 'Room for one short production line.' },
    { name: 'Plant site', w: 34, h: 20, env: 'industrial', cost: 3e6, rent: 45e3, blurb: 'Space for several lines running side by side.' },
    { name: 'Gigafactory site', w: 52, h: 30, env: 'industrial', cost: 18e6, rent: 160e3, blurb: 'Volume manufacturing on your own terms.' },
  ],
  store: [
    { name: 'Mall unit', w: 10, h: 8, env: 'mall', cost: 120e3, rent: 22e3, traffic: 500, blurb: 'A small shop with steady passing trade.' },
    { name: 'High street plot', w: 14, h: 12, env: 'street', cost: 450e3, rent: 70e3, traffic: 1500, blurb: 'A proper storefront on a busy street.' },
    { name: 'Flagship plaza', w: 22, h: 18, env: 'plaza', cost: 2.5e6, rent: 260e3, traffic: 4500, blurb: 'A square of your own for a landmark store.' },
  ],
  venue: [
    { name: 'Courtyard stage', w: 22, h: 18, env: 'park', cost: 400e3, rent: 6000, blurb: 'A small plot for an open-air stage or a studio theatre.' },
    { name: 'Theatre site', w: 34, h: 26, env: 'park', cost: 2.5e6, rent: 25e3, blurb: 'Room for a proper theatre and a foyer.' },
    { name: 'Arena site', w: 50, h: 38, env: 'valley', cost: 9e6, rent: 70e3, blurb: 'Enough land for an amphitheatre that fills a skyline shot.' },
  ],
}
export const tierOf = (site: Site) => SITE_TIERS[site.kind][site.tier]
/** Monthly cost of keeping one built tile lit, cleaned and insured. */
export const TILE_UPKEEP = 18
export const builtTiles = (site: Site) => site.grid.reduce((a, n) => a + (n ? 1 : 0), 0)
export const upkeep = (site: Site) => tierOf(site).rent + builtTiles(site) * TILE_UPKEEP * site.floors

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
  // a tile on a curved edge only shows the room through the sides the curve leaves it
  const live = curveAt(site, x, y)
  if (live && live.shape.sides[side].reduce((a, [u, v]) => a + v - u, 0) < 0.02) return 0
  return n
}
/** Room numbers on the two sides of an edge: [the tile's own side, the far side]. */
export const edgeIds = (site: Site, x: number, y: number, side: 'n' | 'w'): [number, number] => (side === 'n' ? [faceId(site, x, y, 'n'), faceId(site, x, y - 1, 's')] : [faceId(site, x, y, 'w'), faceId(site, x - 1, y, 'e')])

/** The two tiles an edge lies between: [inside tile, the one north or west of it]. */
export const edgeSides = (x: number, y: number, side: 'n' | 'w'): [[number, number], [number, number]] => [[x, y], side === 'n' ? [x, y - 1] : [x - 1, y]]
/** True where two different rooms (or a room and open ground) meet. */
export function isBoundary(site: Site, x: number, y: number, side: 'n' | 'w'): boolean {
  const [a, b] = edgeIds(site, x, y, side)
  return a !== b
}
export const wallAt = (site: Site, x: number, y: number, side: 'n' | 'w') => site.walls.find((w) => w.x === x && w.y === y && w.side === side)

/** Rooms people can get into: those with a door or an opening somewhere on their walls. */
export function openRooms(site: Site): Set<number> {
  const open = new Set<number>()
  for (const w of site.walls) {
    if (w.kind === 'glass') continue
    const [na, nb] = edgeIds(site, w.x, w.y, w.side)
    if (na === nb) continue
    if (na) open.add(na)
    if (nb) open.add(nb)
  }
  site.curves?.forEach((c, i) => {
    for (const [bay, kind] of Object.entries(c.walls ?? {})) if (kind !== 'glass' && bayStands(site, i, bay)) open.add(c.room)
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
  const sweep = opts.sweep === 90 || opts.sweep === 180 || opts.sweep === 270 ? opts.sweep : 360
  const turn = (((opts.turn ?? 0) % 4) + 4) % 4
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
    const t = Math.max(MIN_THICK, Math.round(opts.thick ?? 4))
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
export const hasGround = (site: Site, x: number, y: number) => inPlot(site, x, y) && (!gridAt(site, x, y) || !!cutAt(site, x, y) || !!curveAt(site, x, y))

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

/** A cut only stands where the two sides it opens face open ground. */
function cutFits(site: Site, x: number, y: number, c: Corner): boolean {
  const dy = c[0] === 'n' ? -1 : 1
  const dx = c[1] === 'e' ? 1 : -1
  return !gridAt(site, x, y + dy) && !gridAt(site, x + dx, y)
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
  if (curve) (site.curves ??= []).push({ room: room.n, ...curve })
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
  const wall = (x: number, y: number, side: 'n' | 'w', score: number) => isBoundary(site, x, y, side) && edges.push({ x, y, side, score })
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
    if (c.room !== n) return
    for (const b of geomOf(c).bays.values()) {
      if (!bayStands(site, i, b.key)) continue
      const beyond = !inPlot(site, Math.floor(b.x + b.nx * 1.2), Math.floor(b.y + b.ny * 1.2))
      bays.push({ curve: i, key: b.key, score: (1 - b.ny) * 10 + Math.abs(b.x - 0.5 - cx) * 0.2 + (b.band === 'i' ? 30 : b.band === 'o' ? 0 : 12) + (beyond ? 50 : 0) })
    }
  })
  bays.sort((a, b) => a.score - b.score)
  const e = edges[0]
  const bay = bays[0]
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

/** Drops rooms that have no tiles left and wall changes that no longer sit on a wall. */
export function tidy(site: Site) {
  const used = new Set(site.grid)
  site.rooms = site.rooms.filter((r) => used.has(r.n))
  for (const [key, c] of Object.entries(site.cuts ?? {})) {
    const [x, y] = key.split(',').map(Number)
    if (!gridAt(site, x, y) || !cutFits(site, x, y, c)) delete site.cuts![key]
  }
  settle(site)
  site.walls = site.walls.filter((w) => isBoundary(site, w.x, w.y, w.side))
}

/** Tiles an item covers, given its anchor tile and rotation. */
export function tilesOf(def: Pick<ItemDef, 'w' | 'h'>, x: number, y: number, rot: number): [number, number][] {
  const turned = rot % 2 === 1
  const w = turned ? def.h : def.w
  const h = turned ? def.w : def.h
  const out: [number, number][] = []
  for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) out.push([x + i, y + j])
  return out
}

export const itemTiles = (site: Site, item: SiteItem) => tilesOf(ITEMS[site.kind][item.kind], item.x, item.y, item.rot)

export function itemAt(site: Site, x: number, y: number): SiteItem | undefined {
  return site.items.find((it) => ITEMS[site.kind][it.kind] && itemTiles(site, it).some(([a, b]) => a === x && b === y))
}

/** A plain-words list of where an item may go, for error messages and the palette. */
export function roomNames(kind: SiteKind, def: ItemDef): string {
  const names = def.rooms.map((r) => (r === OUT ? 'open ground' : ROOMS[kind][r]?.name.toLowerCase())).filter(Boolean)
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(' or ')
}

export function canPlace(site: Site, kind: string, x: number, y: number, rot: number): string | null {
  const def = ITEMS[site.kind][kind]
  if (!def) return 'Unknown item'
  let room = -1
  for (const [a, b] of tilesOf(def, x, y, rot)) {
    if (!inPlot(site, a, b)) return 'It does not fit on the plot'
    if (cutAt(site, a, b)) return 'That corner of the room is cut away'
    if (curveAt(site, a, b)) return 'The curved wall runs through there'
    if (!def.rooms.includes(typeAt(site, a, b))) return `${def.name} goes in: ${roomNames(site.kind, def)}`
    const n = gridAt(site, a, b)
    if (room >= 0 && n !== room) return 'It cannot straddle a wall'
    room = n
    if (itemAt(site, a, b)) return 'Something is already there'
  }
  return null
}

export const countItems = (site: Site, kind: string) => site.items.filter((i) => i.kind === kind).length

/** Items standing in rooms people can actually reach (or outdoors). */
export function reachable(site: Site): SiteItem[] {
  const open = openRooms(site)
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
  return sumOf(site, 'prestige', reachable(site)) + (site.floors - 1) * (tiles / 150) + Math.sqrt(tiles) * 0.12 + (FACADES[site.facade]?.cost ? 1 : 0)
}

/** Rooms that have no way in, for warnings. */
export function sealedRooms(site: Site): Room[] {
  const open = openRooms(site)
  return site.rooms.filter((r) => !open.has(r.n))
}

// ---------------------------------------------------------------- factory lines

export interface LineStats {
  /** True when a receiving dock is linked to a shipping dock through every required stage. */
  running: boolean
  /** Why the line is not running, in plain words. */
  problem?: string
  caps: { smt: number; assembly: number; test: number; pack: number }
  /** Devices per day, in phone-equivalents. */
  throughput: number
  defectRate: number
  /** Cost per day at full output. */
  runCost: number
  /** Ids of the items that are part of the working line. */
  linked: Set<string>
  /** For conveyors on the line: direction of travel as a tile step. */
  flow: Map<string, [number, number]>
}

/** Works out what a factory floor can produce from what is connected to what. */
export function lineStats(site: Site): LineStats {
  const defs = ITEMS.factory
  const machines = site.items.filter((it) => defs[it.kind]?.stage)
  const owner = new Map<string, SiteItem>()
  for (const it of machines) for (const [x, y] of itemTiles(site, it)) owner.set(`${x},${y}`, it)
  const neighbours = (it: SiteItem) => {
    const out = new Set<SiteItem>()
    for (const [x, y] of itemTiles(site, it)) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const other = owner.get(`${x + dx},${y + dy}`)
        if (other && other !== it) out.add(other)
      }
    }
    return out
  }
  const empty: LineStats = { running: false, caps: { smt: 0, assembly: 0, test: 0, pack: 0 }, throughput: 0, defectRate: 0, runCost: 0, linked: new Set(), flow: new Map() }
  const start = machines.find((it) => defs[it.kind].stage === 'in')
  if (!start) return { ...empty, problem: site.rooms.some((r) => r.type === 'hall') ? 'Place a receiving dock to start a line.' : 'Zone a production hall, then lay a line in it.' }

  // breadth-first from the receiving dock: distance gives the direction of flow
  const dist = new Map<SiteItem, number>([[start, 0]])
  const queue = [start]
  while (queue.length) {
    const cur = queue.shift()!
    for (const nb of neighbours(cur)) {
      if (dist.has(nb)) continue
      dist.set(nb, dist.get(cur)! + 1)
      queue.push(nb)
    }
  }
  const caps = { smt: 0, assembly: 0, test: 0, pack: 0 }
  let runCost = 0
  let hasOut = false
  const linked = new Set<string>()
  for (const it of dist.keys()) {
    const def = defs[it.kind]
    linked.add(it.id)
    if (def.stage === 'out') hasOut = true
    if (def.stage === 'smt' || def.stage === 'assembly' || def.stage === 'test' || def.stage === 'pack') {
      caps[def.stage] += def.cap ?? 0
      runCost += def.run ?? 0
    }
  }
  const flow = new Map<string, [number, number]>()
  for (const it of dist.keys()) {
    if (defs[it.kind].stage !== 'belt') continue
    const here = dist.get(it)!
    let best: [number, number] = [1, 0]
    let bestDist = -1
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      const other = owner.get(`${it.x + dx},${it.y + dy}`)
      const od = other ? dist.get(other) : undefined
      if (od !== undefined && od > here && od > bestDist) {
        best = [dx, dy]
        bestDist = od
      }
    }
    if (bestDist < 0) {
      // end of a branch: keep moving away from where it came from
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
        const other = owner.get(`${it.x + dx},${it.y + dy}`)
        if (other && dist.get(other) === here - 1) best = [-dx, -dy]
      }
    }
    flow.set(it.id, best)
  }
  const base = { caps, runCost, linked, flow }
  if (!hasOut) return { ...empty, ...base, problem: 'Link the line to a shipping dock.' }
  const missing = (['smt', 'assembly', 'pack'] as const).filter((k) => caps[k] === 0)
  if (missing.length) {
    const names = { smt: 'a board assembly line', assembly: 'an assembly cell or bench', pack: 'a packaging line' }
    return { ...empty, ...base, problem: `The line still needs ${missing.map((k) => names[k]).join(' and ')}.` }
  }
  const throughput = Math.min(caps.smt, caps.assembly, caps.pack)
  // untested output ships with 6% faults; full test coverage brings it under 1%,
  // and a staffed control room trims what is left
  const coverage = Math.min(1, caps.test / throughput)
  const watch = reachable(site).filter((i) => i.kind === 'console' || i.kind === 'qa').length
  const defectRate = (0.06 - 0.052 * coverage) * (1 - Math.min(0.4, watch * 0.1))
  return { ...base, running: true, throughput, defectRate }
}

/** A ready-made hall and line for players who do not want to lay conveyors themselves. */
export function starterLine(site: Site): { hall: [number, number, number, number]; items: { kind: string; x: number; y: number; rot: number }[] } | null {
  const x0 = 3
  const y0 = Math.max(2, Math.floor(site.h / 2) - 3)
  const hall: [number, number, number, number] = [x0, y0, x0 + 15, y0 + 5]
  if (hall[2] >= site.w - 1 || hall[3] >= site.h - 1) return null
  for (const [x, y] of areaTiles(...hall)) if (itemAt(site, x, y) || (gridAt(site, x, y) && typeAt(site, x, y) !== 'hall')) return null
  const y = y0 + 2
  const x = x0 + 1
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
  const tiles = Math.max(1, builtTiles(site))
  const used = items.filter((i) => !ITEMS.store[i.kind].flat && gridAt(site, i.x, i.y)).reduce((a, i) => a + ITEMS.store[i.kind].w * ITEMS.store[i.kind].h, 0)
  // a little decor goes a long way; a cluttered floor puts people off
  const decor = Math.min(1, sumOf(site, 'comfort', items) / (tiles * 0.06))
  const crowding = Math.max(0, used / tiles - 0.4) * 2.5
  const look = (FACADES[site.facade]?.cost ? 0.05 : 0) + (site.rooms.length > 1 ? 0.05 : 0)
  const appeal = Math.max(0.1, Math.min(1, 0.45 + 0.45 * decor + look - crowding))
  const wages = (counters + supports + repairs) * 4000 + 6000
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
  if (!items.some((i) => i.kind === 'stage')) return { ...base, ready: false, problem: 'Build a stage.' }
  if (seats < 48) return { ...base, ready: false, problem: 'Seat at least 48 people.' }
  return { ...base, ready: true }
}

/** The stage a show is presented from, with the direction the audience sits in. */
export function stageOf(site: Site): SiteItem | undefined {
  return site.items.find((i) => i.kind === 'stage')
}

/**
 * A hired venue, laid out for the keynote replay: 0 is a livestream studio,
 * 1 a theatre, 2 an arena. Not part of the save; rebuilt whenever it is shown.
 */
export function hiredVenue(kind: number): Site {
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
