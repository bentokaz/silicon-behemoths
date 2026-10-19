// What each page is for, in one line: the question it answers. The frame
// shows it under the page's tabs, so a player who lands anywhere knows what
// they are looking at and what to do there. Pages that are a 3D place (the
// city, the campus, the sites) have none: the place speaks for itself.
// Keyed by the page ids of store/nav.ts.

export const PAGE_INTRO: Record<string, string> = {
  'company.overview': 'How the company is doing, and what needs you today.',
  'company.finance': 'Where the money comes from, where it goes, and what the parts cost.',
  'company.shares': 'Who owns the company, what it is worth, and the stakes you hold in others.',
  'company.growth': 'Goals to aim for, and everything the company can still grow into.',
  'devices.mine': 'What you sell, how each device is selling, and what to order more of.',
  'devices.market': 'Everything on sale, yours and your rivals, by kind of device.',
  'devices.rivals': 'Who you are up against, how big they are, and what they sell.',
  'research.tech': 'Fund research to get better parts for your next devices.',
  'research.lines': 'Open new kinds of device to make and sell.',
  'research.labs': 'Design your own chips and operating system instead of buying them.',
  'campus.people': 'Who works for you, how they feel, and who is asking for something.',
  'campus.teams': 'Group people into teams with a lead, so they get more done.',
  'campus.hiring': 'People looking for a job. Each needs a desk on the campus to work.',
  'marketing.campaigns': 'How many buyers know you exist, and what you spend to reach more.',
  'marketing.events': 'Launch shows and events that get your devices noticed.',
  'marketing.owners': 'How owners feel about your devices, and how well you support them.',
  'system.saves': 'Save, load, export and import games.',
  'system.company': 'Your company: its name, colour and logo, and the game it is in.',
  'system.settings': 'Sound, display and game options.',
  'system.keys': 'Every keyboard shortcut, and how to change it.',
}
